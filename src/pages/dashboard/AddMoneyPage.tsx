import { useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeIndianRupee,
  CheckCircle2,
  QrCode,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { Link } from "react-router-dom";
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

const PRESETS = [20000, 50000, 100000, 200000, 500000];

type Step = "amount" | "pay" | "evidence" | "done";

export function AddMoneyPage() {
  const { uid, profile } = useAuth();
  const settings = useSiteSettings();
  const { settings: rawSettings } = useSettings();
  const toast = useToast();

  const [step, setStep] = useState<Step>("amount");
  const [amountInput, setAmountInput] = useState("");
  const [qr, setQr] = useState<PickPaymentQrResponse | null>(null);
  const [utr, setUtr] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitDepositResponse | null>(null);
  const sessionKey = useRef(newId("dep"));
  const requestId = useRef(newId("dreq"));

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
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const loadQr = async () => {
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
    if (!uid || !profile || !qr) return;
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
    sessionKey.current = newId("dep");
    requestId.current = newId("dreq");
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

                  <Button block size="lg" disabled={!amountValid} onClick={() => void loadQr()}>
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
                  description="Scan with any UPI app, then come back and submit your reference."
                />
                <CardBody className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
                    <div className="rounded-2xl border border-line bg-white p-3 text-center">
                      <img
                        src={qr.imageUrl}
                        alt={`UPI QR code for ${qr.payeeName}`}
                        className="mx-auto aspect-square w-full max-w-[200px] rounded-lg object-contain"
                      />
                      <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                        {qr.label}
                      </p>
                    </div>
                    <dl className="space-y-2.5 text-[13px]">
                      <div className="rounded-xl border border-line bg-ivory/60 p-3">
                        <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                          Amount to pay
                        </dt>
                        <dd className="font-display text-[24px] font-bold tabular-nums text-brand">
                          {formatINR(amountPaise)}
                        </dd>
                      </div>
                      <div className="rounded-xl border border-line bg-ivory/60 p-3">
                        <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                          Payee
                        </dt>
                        <dd className="font-semibold text-ink">{qr.payeeName}</dd>
                        <dd className="mt-0.5 font-mono text-[12.5px] text-muted">{qr.upiId}</dd>
                      </div>
                      {qr.appHint ? <p className="text-[12px] text-muted">{qr.appHint}</p> : null}
                    </dl>
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
                      I have paid — submit proof
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
