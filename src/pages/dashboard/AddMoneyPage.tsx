import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  BadgeIndianRupee,
  Check,
  CheckCircle2,
  Copy,
  QrCode,
  ShieldCheck,
  Smartphone,
  Upload,
} from "lucide-react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useAsync } from "@/hooks/useAsync";
import { useAuth } from "@/app/AuthProvider";
import { useSettings, useSiteSettings } from "@/app/SettingsProvider";
import { useToast } from "@/app/ToastProvider";
import { callBackend, errorActionHint } from "@/lib/backend/callBackend";
import type {
  PickPaymentQrRequest,
  PickPaymentQrResponse,
  SubmitDepositRequest,
  SubmitDepositResponse,
} from "@/lib/backend/api";
import { walletService } from "@/services/walletService";
import { uploadImage, validateImage } from "@/services/storageService";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  Label,
  ProgressBar,
} from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatINR, parseRupeesToPaise, paiseToRupees } from "@/utils/money";
import { newId } from "@/utils/id";
import type { LowBalanceState } from "@/pages/public/BookTicketsPage";
import { UPI_APPS, appsForPlatform, detectPlatform, upiLaunchUrl, type UpiApp } from "@/features/payments/upi";
import { ReadOnlyViewNotice, useReadOnlyView } from "@/features/auth/ViewAs";
import { copyText } from "@/utils/clipboard";

const PRESETS = [20000, 50000, 100000, 200000, 500000];

type Step = "amount" | "pay" | "evidence" | "done";

const DEPOSIT_SESSION_KEY = "dd:deposit-session";
const DEPOSIT_SESSION_TTL_MS = 30 * 60_000;
/** Shorter trips away are a cancelled app chooser, not a payment attempt. */
const MIN_AWAY_MS = 2_500;
const LAUNCH_TIMEOUT_MS = 3_000;

interface DepositSession {
  amountInput: string;
  qr: PickPaymentQrResponse;
  sessionKey: string;
  requestId: string;
  step: "pay" | "evidence";
  launchedApp?: string;
  lowBalance?: LowBalanceState | null;
  savedAt: number;
}

function readDepositSession(): DepositSession | null {
  try {
    const raw = sessionStorage.getItem(DEPOSIT_SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as DepositSession;
    if (!session.qr?.qrId || Date.now() - session.savedAt > DEPOSIT_SESSION_TTL_MS) {
      sessionStorage.removeItem(DEPOSIT_SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

function writeDepositSession(session: Omit<DepositSession, "savedAt">) {
  try {
    sessionStorage.setItem(DEPOSIT_SESSION_KEY, JSON.stringify({ ...session, savedAt: Date.now() }));
  } catch {
    /* Storage unavailable: the flow still works, it just cannot survive a reload. */
  }
}

function clearDepositSession() {
  try {
    sessionStorage.removeItem(DEPOSIT_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

const appLabel = (id: string) => UPI_APPS.find((app) => app.id === id)?.name ?? "your UPI app";

interface LaunchProblem {
  title: string;
  message: string;
}

const OTHER_WAYS =
  "Try another app or “All UPI apps”, or open your UPI app yourself and pay to the UPI ID above (it is copied for you) or scan the QR code.";

export function AddMoneyPage() {
  const { uid, profile } = useAuth();
  const readOnly = useReadOnlyView();
  const settings = useSiteSettings();
  const { settings: rawSettings } = useSettings();
  const toast = useToast();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [restored] = useState(readDepositSession);
  const [missingAppId] = useState(() => searchParams.get("upi_missing"));
  const returnedAfterReload = Boolean(restored?.launchedApp && !missingAppId);
  const lowBalance = (location.state as LowBalanceState | null) ?? restored?.lowBalance ?? null;
  const prefilled = useRef(false);
  const [platform] = useState(() => detectPlatform());
  const apps = useMemo(() => appsForPlatform(platform), [platform]);

  const [step, setStep] = useState<Step>(() => {
    if (!restored) return "amount";
    if (missingAppId) return "pay";
    return returnedAfterReload ? "evidence" : restored.step;
  });
  const [amountInput, setAmountInput] = useState(restored?.amountInput ?? "");
  const [qr, setQr] = useState<PickPaymentQrResponse | null>(restored?.qr ?? null);
  const [launchedApp, setLaunchedApp] = useState<string | null>(null);
  const [returnedFrom, setReturnedFrom] = useState<string | null>(
    returnedAfterReload ? (restored?.launchedApp ?? null) : null,
  );
  const [launchProblem, setLaunchProblem] = useState<LaunchProblem | null>(
    missingAppId
      ? {
          title: "App did not open",
          message: `${appLabel(missingAppId)} could not be opened from this browser — it may not be installed, or this phone's browser does not allow it. ${OTHER_WAYS}`,
        }
      : null,
  );
  const [copied, setCopied] = useState<string | null>(null);
  const [utr, setUtr] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitDepositResponse | null>(null);
  const sessionKey = useRef(restored?.sessionKey ?? newId("dep"));
  const requestId = useRef(restored?.requestId ?? newId("dreq"));

  const wallet = useAsync(
    async () => (uid ? await walletService.account(uid) : null),
    [uid, result?.depositId],
    { enabled: Boolean(uid) },
  );

  const depositsConfigured =
    Boolean(rawSettings) && settings.maxDepositPaise > 0 && settings.maxDepositPaise >= settings.minDepositPaise;
  const presets = PRESETS.filter(
    (paise) => paise >= settings.minDepositPaise && paise <= settings.maxDepositPaise,
  );
  const amountPaise = useMemo(() => parseRupeesToPaise(amountInput || "0"), [amountInput]);
  const amountValid =
    depositsConfigured &&
    Number.isFinite(amountPaise) &&
    amountPaise >= settings.minDepositPaise &&
    amountPaise <= settings.maxDepositPaise;

  useEffect(() => {
    if (prefilled.current || !lowBalance?.shortfallPaise || !depositsConfigured) return;
    prefilled.current = true;
    const wholeRupees = Math.ceil(lowBalance.shortfallPaise / 100) * 100;
    const suggested = Math.min(Math.max(wholeRupees, settings.minDepositPaise), settings.maxDepositPaise);
    setAmountInput((current) => current || String(paiseToRupees(suggested)));
  }, [lowBalance, depositsConfigured, settings.minDepositPaise, settings.maxDepositPaise]);

  useEffect(() => {
    if (missingAppId) setSearchParams({}, { replace: true });
  }, [missingAppId, setSearchParams]);

  const saveSession = (overrides: Partial<DepositSession> = {}) => {
    if (!qr || (step !== "pay" && step !== "evidence")) return;
    writeDepositSession({
      amountInput,
      qr,
      sessionKey: sessionKey.current,
      requestId: requestId.current,
      step,
      launchedApp: launchedApp ?? undefined,
      lowBalance,
      ...overrides,
    });
  };

  useEffect(() => {
    if (qr && (step === "pay" || step === "evidence")) saveSession();
    else clearDepositSession();
    // saveSession reads exactly these values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, qr, amountInput, launchedApp, lowBalance]);

  /* Coming back from the UPI app — whether it paid or not — lands on the proof step. */
  useEffect(() => {
    if (!launchedApp) return;
    const name = appLabel(launchedApp);
    const startedAt = Date.now();
    let leftAt: number | null = null;
    let bounced = false;

    const returned = () => {
      setReturnedFrom(launchedApp);
      setLaunchedApp(null);
      setLaunchProblem(null);
      setStep("evidence");
    };
    const away = () => {
      if (leftAt === null) leftAt = Date.now();
    };
    const back = () => {
      if (leftAt === null) return;
      const awayMs = Date.now() - leftAt;
      leftAt = null;
      if (awayMs >= MIN_AWAY_MS) return returned();
      // The system chooser closes this fast when cancelled; a named app doing so rejected the link.
      // Keep listening: an "Open in app?" prompt also returns quickly, and the app may still open.
      if (launchedApp === "any") return;
      bounced = true;
      setLaunchProblem({
        title: `${name} closed straight away`,
        message: `Some UPI apps — especially older versions — stop payments that start from a website and send you back. Update ${name}, or: ${OTHER_WAYS}`,
      });
    };
    const onVisibility = () => (document.visibilityState === "hidden" ? away() : back());

    const timer = window.setTimeout(() => {
      if (bounced || leftAt !== null || document.visibilityState === "hidden") return;
      // Older browsers freeze the page without reporting it hidden; a timer that fires
      // late means the page was frozen while the app was in front.
      if (Date.now() - startedAt - LAUNCH_TIMEOUT_MS >= MIN_AWAY_MS) return returned();
      setLaunchedApp(null);
      setLaunchProblem({
        title: "App did not open",
        message: `${name} did not open. It may not be installed, or this browser blocked it. ${OTHER_WAYS}`,
      });
    }, LAUNCH_TIMEOUT_MS);

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", away);
    window.addEventListener("focus", back);
    window.addEventListener("pagehide", away);
    window.addEventListener("pageshow", back);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", away);
      window.removeEventListener("focus", back);
      window.removeEventListener("pagehide", away);
      window.removeEventListener("pageshow", back);
    };
  }, [launchedApp]);

  const launchApp = (app: UpiApp | null) => {
    if (!qr) return;
    const appId = app?.id ?? "any";
    setLaunchProblem(null);
    setReturnedFrom(null);
    setLaunchedApp(appId);
    saveSession({ launchedApp: appId });
    void copyText(qr.upiId);
    window.location.href = upiLaunchUrl(
      app,
      platform,
      { upiId: qr.upiId, payeeName: qr.payeeName, amountPaise, note: "Wallet deposit" },
      `${window.location.origin}/dashboard/add-money?upi_missing=${appId}`,
    );
  };

  const copy = async (key: string, text: string, label: string) => {
    if (await copyText(text)) {
      setCopied(key);
      window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 2000);
      toast.success("Copied", `${label} copied to the clipboard.`);
    } else {
      toast.error("Could not copy", `Select the ${label} and copy it manually.`);
    }
  };

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const loadQr = async () => {
    if (readOnly) return;
    setError(null);
    if (!amountValid) {
      setError(
        `Enter an amount between ${formatINR(settings.minDepositPaise)} and ${formatINR(
          settings.maxDepositPaise,
        )}.`,
      );
      return;
    }
    try {
      const picked = await callBackend<PickPaymentQrRequest, PickPaymentQrResponse>(
        "pickPaymentQr",
        { sessionKey: sessionKey.current },
      );
      setQr(picked);
      setStep("pay");
    } catch (err) {
      const message = err instanceof Error ? err.message : "No payment QR code is available.";
      const hint = errorActionHint((err as { code?: string })?.code ?? "");
      setError(hint ? `${message} ${hint}` : message);
    }
  };

  const onFile = (selected: File | null) => {
    setError(null);
    if (!selected) {
      setFile(null);
      return;
    }
    const problem = validateImage(selected);
    if (problem) {
      setError(problem);
      setFile(null);
      return;
    }
    setFile(selected);
  };

  const submit = async () => {
    if (!uid || !profile || !qr || readOnly) return;
    setError(null);
    const normalised = utr.trim().toUpperCase();
    if (!/^[A-Z0-9]{8,22}$/.test(normalised)) {
      setError("Enter the UTR / reference number exactly as your UPI app shows it (8–22 characters).");
      return;
    }
    if (!file) {
      setError("Attach a screenshot of the successful payment.");
      return;
    }
    setSubmitting(true);
    try {
      const uploaded = await uploadImage("deposit-screenshots", file, uid);
      const response = await callBackend<SubmitDepositRequest, SubmitDepositResponse>(
        "submitDeposit",
        {
          amountPaise,
          qrId: qr.qrId,
          utr: normalised,
          screenshotPath: uploaded.path,
          screenshotUrl: uploaded.url || undefined,
          requestId: requestId.current,
        },
      );
      setResult(response);
      setStep("done");
      toast.success(
        "Deposit submitted",
        "An administrator will verify your payment before the wallet is credited.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "The deposit could not be submitted.");
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    clearDepositSession();
    sessionKey.current = newId("dep");
    requestId.current = newId("dreq");
    setReturnedFrom(null);
    setLaunchProblem(null);
    setStep("amount");
    setAmountInput("");
    setQr(null);
    setUtr("");
    setFile(null);
    setResult(null);
    setError(null);
  };

  const stepIndex = { amount: 1, pay: 2, evidence: 3, done: 4 }[step];

  return (
    <>
      <PageHeader
        eyebrow="Add money"
        icon={BadgeIndianRupee}
        title="Add money to your wallet"
        description="Pay the displayed UPI QR code, then submit the payment reference for verification. Nothing is credited automatically."
        crumbs={[
          { label: "Home", to: "/" },
          { label: "Dashboard", to: "/dashboard" },
          { label: "Add money" },
        ]}
        actions={
          <Link to="/dashboard/wallet">
            <Button variant="outline">Wallet &amp; ledger</Button>
          </Link>
        }
      />

      <div className="page py-6">
        <Card className="mb-5">
          <CardBody>
            <ProgressBar
              value={stepIndex}
              max={4}
              tone="gold"
              label={`Step ${stepIndex} of 4 — ${
                step === "amount"
                  ? "Choose amount"
                  : step === "pay"
                    ? "Pay by UPI"
                    : step === "evidence"
                      ? "Submit payment proof"
                      : "Awaiting verification"
              }`}
            />
          </CardBody>
        </Card>

        {!depositsConfigured ? (
          <Alert tone="warning" className="mb-4" title="Deposits are not available yet">
            The organiser has not published deposit limits. Adding money will open once the site
            settings are configured.
          </Alert>
        ) : null}

        {lowBalance && step !== "done" ? (
          <Alert tone="warning" className="mb-4" title="Not enough balance to book your tickets">
            {lowBalance.shortfallPaise > 0
              ? `You need ${formatINR(lowBalance.shortfallPaise)} more in your wallet to book ${lowBalance.tickets} ticket${
                  lowBalance.tickets === 1 ? "" : "s"
                }.`
              : "Your wallet balance is too low for this order."}{" "}
            Add money below. Your wallet is credited once an administrator verifies the payment, and then you
            can finish booking. Numbers are not reserved until you pay for them.{" "}
            <Link to={lowBalance.returnTo} className="font-semibold text-brand hover:underline">
              Back to booking
            </Link>
          </Alert>
        ) : null}

        <ReadOnlyViewNotice action="Adding money" className="mb-4" />

        {error ? (
          <Alert tone="danger" className="mb-4" title="We could not continue">
            {error}
          </Alert>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
          <div className="space-y-4">
            {step === "amount" ? (
              <Card>
                <CardHeader title="1. How much are you adding?" />
                <CardBody className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="deposit-amount" required hint="Indian Rupees">
                      Amount
                    </Label>
                    <Input
                      id="deposit-amount"
                      inputMode="decimal"
                      placeholder="500"
                      prefix="₹"
                      value={amountInput}
                      invalid={Boolean(amountInput) && !amountValid}
                      onChange={(event) => setAmountInput(event.target.value.replace(/[^\d.]/g, ""))}
                    />
                    <p className="text-[12px] text-muted">
                      Allowed range {formatINR(settings.minDepositPaise)} –{" "}
                      {formatINR(settings.maxDepositPaise)} per request.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {presets.map((paise) => (
                      <button
                        key={paise}
                        type="button"
                        onClick={() => setAmountInput(String(paiseToRupees(paise)))}
                        className="rounded-lg border border-line bg-ivory/70 px-3 py-1.5 text-[12.5px] font-semibold text-ink transition hover:border-gold"
                      >
                        {formatINR(paise)}
                      </button>
                    ))}
                  </div>

                  <Alert tone="info" title="This is a deposit, not a purchase">
                    Money is added to your wallet for later ticket purchases. Deposits are non-refundable
                    once spent on tickets; unspent balance can be refunded under the published policy.
                  </Alert>

                  <Button block size="lg" disabled={!amountValid || readOnly} onClick={() => void loadQr()}>
                    Get the payment QR code
                  </Button>
                </CardBody>
              </Card>
            ) : null}

            {step === "pay" && qr ? (
              <Card>
                <CardHeader
                  icon={QrCode}
                  title="2. Pay the exact amount"
                  description="Pay with a UPI app or scan the QR code, then come back and upload your screenshot."
                />
                <CardBody className="space-y-4">
                  <dl className="grid gap-2.5 text-[13px] sm:grid-cols-2">
                    <CopyField
                      label="Amount to pay"
                      copied={copied === "amount"}
                      onCopy={() => void copy("amount", String(paiseToRupees(amountPaise)), "Amount")}
                    >
                      <span className="font-display text-[24px] font-bold tabular-nums text-brand">
                        {formatINR(amountPaise)}
                      </span>
                    </CopyField>
                    <CopyField
                      label="Pay to UPI ID"
                      copied={copied === "upi"}
                      onCopy={() => void copy("upi", qr.upiId, "UPI ID")}
                    >
                      <span className="block break-all font-mono text-[14px] font-semibold text-ink">{qr.upiId}</span>
                      <span className="block text-[12px] text-muted">{qr.payeeName}</span>
                    </CopyField>
                  </dl>
                  {qr.appHint ? <p className="text-[12px] text-muted">{qr.appHint}</p> : null}

                  {apps.length ? (
                    <div className="rounded-2xl border border-line bg-ivory/40 p-3 sm:p-4">
                      <p className="flex items-center gap-2 text-[13.5px] font-semibold text-ink">
                        <Smartphone className="size-4 text-brand" aria-hidden />
                        Pay with a UPI app on this phone
                      </p>
                      <p className="mt-0.5 text-[12px] leading-relaxed text-muted">
                        The UPI ID and amount are filled in for you. After paying — or if the payment fails — come
                        back here to upload the screenshot.
                      </p>
                      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {platform === "android" ? (
                          <UpiAppButton
                            name="All UPI apps"
                            hint="Installed apps"
                            short="UPI"
                            color="#0f7a4f"
                            onClick={() => launchApp(null)}
                          />
                        ) : null}
                        {apps.map((app) => (
                          <UpiAppButton
                            key={app.id}
                            name={app.name}
                            short={app.short}
                            color={app.color}
                            onClick={() => launchApp(app)}
                          />
                        ))}
                      </div>
                      <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
                        Some apps block payments started from a link. If that happens, copy the UPI ID above and
                        pay inside the app, or scan the QR code below.
                      </p>
                    </div>
                  ) : (
                    <Alert tone="info" title="Paying from a computer?">
                      Scan the QR code below with any UPI app, or open this page on your phone to pay in one tap with
                      the amount filled in.
                    </Alert>
                  )}

                  {launchProblem ? (
                    <Alert tone="warning" title={launchProblem.title}>
                      {launchProblem.message}
                    </Alert>
                  ) : null}

                  <div className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-white p-3 text-center sm:flex-row sm:text-left">
                    <img
                      src={qr.imageUrl}
                      alt={`UPI QR code for ${qr.payeeName}`}
                      className="aspect-square w-full max-w-[180px] rounded-lg object-contain"
                    />
                    <div className="space-y-1 sm:pl-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{qr.label}</p>
                      <p className="text-[12.5px] leading-relaxed text-muted">
                        Or scan this QR code from any UPI app and enter {formatINR(amountPaise)} yourself.
                      </p>
                    </div>
                  </div>

                  <Alert tone="warning" title="Pay the exact amount">
                    Paying a different amount delays verification. Do not split a deposit across
                    multiple UPI transactions.
                  </Alert>

                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => setStep("amount")}>
                      Change amount
                    </Button>
                    <Button onClick={() => setStep("evidence")} iconRight={<Upload className="size-4" aria-hidden />}>
                      I have paid — upload screenshot
                    </Button>
                  </div>
                </CardBody>
              </Card>
            ) : null}

            {step === "evidence" && qr ? (
              <Card>
                <CardHeader
                  icon={Upload}
                  title="3. Submit your payment reference"
                  description="An administrator matches this against the operator's banking records."
                />
                <CardBody className="space-y-4">
                  {returnedFrom ? (
                    <Alert tone="info" title={`Back from ${appLabel(returnedFrom)}`}>
                      If the payment of {formatINR(amountPaise)} succeeded, enter the UTR / reference number and
                      upload a screenshot of the success screen below. If it failed or you cancelled it,{" "}
                      <button
                        type="button"
                        className="font-semibold text-brand hover:underline"
                        onClick={() => {
                          setReturnedFrom(null);
                          setStep("pay");
                        }}
                      >
                        try paying again
                      </button>
                      . If money left your account but the app shows a failure, keep the UTR and contact support.
                    </Alert>
                  ) : null}
                  <div className="space-y-1.5">
                    <Label htmlFor="deposit-utr" required hint="8–22 letters/digits">
                      UTR / reference number
                    </Label>
                    <Input
                      id="deposit-utr"
                      value={utr}
                      placeholder="e.g. 412345678901"
                      autoCapitalize="characters"
                      className="font-mono"
                      onChange={(event) => setUtr(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                    />
                    <p className="text-[12px] text-muted">
                      Find this in your UPI app's transaction details. Duplicate references are held
                      for manual review and are never credited twice.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="deposit-file" required hint="PNG, JPEG or WebP · max 5 MB">
                      Payment screenshot
                    </Label>
                    <input
                      id="deposit-file"
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/heic"
                      onChange={(event) => onFile(event.target.files?.[0] ?? null)}
                      className="w-full cursor-pointer rounded-xl border border-line-strong bg-paper px-3 py-2.5 text-[13px] text-ink file:mr-3 file:rounded-lg file:border-0 file:bg-ivory file:px-3 file:py-1.5 file:text-[12.5px] file:font-semibold file:text-ink"
                    />
                    <p className="text-[12px] text-muted">
                      Screenshots are stored privately and are visible only to you and authorised
                      reviewers.
                    </p>
                  </div>

                  {previewUrl ? (
                    <div className="rounded-xl border border-line bg-ivory/50 p-3">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                        Preview
                      </p>
                      <img
                        src={previewUrl}
                        alt="Selected payment screenshot preview"
                        className="max-h-64 rounded-lg border border-line object-contain"
                      />
                    </div>
                  ) : null}

                  <Alert tone="info" title="What happens after you submit">
                    Your request moves to <strong>Pending verification</strong>. An administrator
                    approves, rejects or flags it for further review. You will be notified of the outcome.
                  </Alert>

                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => setStep("pay")}>
                      Back to payment
                    </Button>
                    <Button loading={submitting} onClick={() => void submit()}>
                      Submit for verification
                    </Button>
                  </div>
                </CardBody>
              </Card>
            ) : null}

            {step === "done" && result ? (
              <Card>
                <CardHeader
                  icon={CheckCircle2}
                  title="4. Deposit submitted"
                  description="Nothing has been credited yet — verification comes first."
                />
                <CardBody className="space-y-4">
                  <Alert
                    tone={result.status === "requires_review" ? "warning" : "success"}
                    title={
                      result.status === "requires_review"
                        ? "Held for manual review"
                        : "Awaiting verification"
                    }
                  >
                    {result.status === "requires_review"
                      ? "This reference matched an earlier deposit, so it will be checked by a human before any credit is applied."
                      : "An administrator will verify your payment against the operator's banking records. You will be notified once it is credited."}
                  </Alert>
                  <dl className="space-y-2 rounded-xl border border-line bg-ivory/60 p-3 text-[13px]">
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">Request ID</dt>
                      <dd className="font-mono text-[12px] text-ink">{result.depositId}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">Amount</dt>
                      <dd className="font-semibold tabular-nums text-ink">{formatINR(amountPaise)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">Submitted</dt>
                      <dd className="text-ink">{new Date(result.submittedAt).toLocaleString("en-IN")}</dd>
                    </div>
                  </dl>
                  <div className="flex flex-wrap gap-2">
                    <Link to="/dashboard/wallet">
                      <Button>View deposit status</Button>
                    </Link>
                    {lowBalance ? (
                      <Link to={lowBalance.returnTo}>
                        <Button variant="outline">Back to booking</Button>
                      </Link>
                    ) : null}
                    <Button variant="outline" onClick={reset}>
                      Add another deposit
                    </Button>
                  </div>
                </CardBody>
              </Card>
            ) : null}
          </div>

          <div className="side-panel space-y-4">
            <Card>
              <CardHeader title="Current balance" />
              <CardBody>
                <p className="font-display text-[26px] font-bold tabular-nums text-emerald">
                  {wallet.loading || wallet.error ? "—" : formatINR(wallet.data?.balancePaise ?? 0)}
                </p>
                {wallet.error ? (
                  <p className="mt-1 text-[12px] text-status-booked" role="alert">
                    Balance unavailable.{" "}
                    <button type="button" className="font-semibold text-brand hover:underline" onClick={wallet.reload}>
                      Retry
                    </button>
                  </p>
                ) : null}
                {wallet.data?.pendingDepositPaise ? (
                  <p className="mt-1 text-[12px] text-status-pending">
                    + {formatINR(wallet.data.pendingDepositPaise)} awaiting verification
                  </p>
                ) : null}
              </CardBody>
            </Card>

            <Card>
              <CardHeader icon={ShieldCheck} title="Staying safe" />
              <CardBody className="space-y-2.5 text-[12.5px] leading-relaxed text-muted">
                <p>• Pay only to the UPI ID shown on this page during your deposit.</p>
                <p>• Never send money to a personal account shared over chat.</p>
                <p>• Support will never ask for your OTP, UPI PIN or bank password.</p>
                <p>
                  • Read the{" "}
                  <Link to="/legal/refund" className="font-semibold text-brand hover:underline">
                    payment &amp; refund policy
                  </Link>
                  .
                </p>
              </CardBody>
            </Card>

            <Alert tone="info" title="Verification window">
              Deposits are reviewed in the order received. Keep your screenshot and reference number
              safe until your wallet shows the credit.
            </Alert>
          </div>
        </div>
      </div>
    </>
  );
}

function CopyField({
  label,
  copied,
  onCopy,
  children,
}: {
  label: string;
  copied: boolean;
  onCopy: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-line bg-ivory/60 p-3">
      <div className="min-w-0">
        <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</dt>
        <dd>{children}</dd>
      </div>
      <Button
        size="sm"
        variant={copied ? "success" : "outline"}
        onClick={onCopy}
        iconLeft={copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
        aria-label={`Copy ${label.toLowerCase()}`}
      >
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

function UpiAppButton({
  name,
  short,
  color,
  hint,
  onClick,
}: {
  name: string;
  short: string;
  color: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[88px] flex-col items-center justify-center gap-1.5 rounded-xl border border-line bg-paper p-2 text-center transition hover:border-gold hover:shadow-sm active:scale-[0.98]"
    >
      <span
        className="grid size-10 place-items-center rounded-xl text-[13px] font-bold text-white"
        style={{ backgroundColor: color }}
        aria-hidden
      >
        {short}
      </span>
      <span className="text-[11.5px] font-semibold leading-tight text-ink">{name}</span>
      {hint ? <span className="text-[10px] leading-tight text-muted">{hint}</span> : null}
    </button>
  );
}
