import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, CheckCircle2, Clock3, Copy, Loader2, QrCode, Smartphone, Upload, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/app/AuthProvider";
import { useSiteSettings } from "@/app/SettingsProvider";
import { callBackend, errorActionHint } from "@/lib/backend/callBackend";
import type {
  PickPaymentQrRequest,
  PickPaymentQrResponse,
  SubmitDepositRequest,
  SubmitDepositResponse,
} from "@/lib/backend/api";
import { walletService } from "@/services/walletService";
import { uploadImage, validateImage } from "@/services/storageService";
import type { DepositRequest } from "@/types";
import { Alert, Button, Dialog, Input, Label } from "@/components/ui";
import { UPI_APPS, appsForPlatform, detectPlatform, payAmountFor, upiLaunchUrl, type UpiApp } from "./upi";
import { UpiAppButton } from "./UpiAppButton";
import { formatINR } from "@/utils/money";
import { formatDateTime } from "@/utils/format";
import { newId } from "@/utils/id";
import { copyText } from "@/utils/clipboard";

type Step = "pay" | "proof" | "waiting";

export interface HeldTicket {
  id: string;
  numberLabel: string;
}

export interface PayBookSession {
  drawId: string;
  tickets: HeldTicket[];
  amountPaise: number;
  qr: PickPaymentQrResponse | null;
  sessionKey: string;
  requestId: string;
  step: Step;
  launchedApp?: string;
  depositId?: string;
  savedAt: number;
}

const SESSION_KEY = "dd:pay-book";
const PAY_TTL_MS = 30 * 60_000;
const WAIT_TTL_MS = 24 * 3_600_000;
/** Shorter trips away are a cancelled app chooser, not a payment attempt. */
const MIN_AWAY_MS = 2_500;
const LAUNCH_TIMEOUT_MS = 3_000;

export function readPayBookSession(drawId: string): PayBookSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as PayBookSession;
    const ttl = session.step === "waiting" ? WAIT_TTL_MS : PAY_TTL_MS;
    if (Date.now() - session.savedAt > ttl) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session.drawId === drawId ? session : null;
  } catch {
    return null;
  }
}

function writeSession(session: PayBookSession) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...session, savedAt: Date.now() }));
  } catch {
    /* Storage unavailable: the flow still works, it just cannot survive a reload. */
  }
}

export function clearPayBookSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

const appLabel = (id: string) => UPI_APPS.find((app) => app.id === id)?.name ?? "your UPI app";

export function PayAndBookDialog({
  draw,
  tickets,
  shortfallPaise,
  resume,
  missingAppId,
  onClose,
  onBooked,
  onReselect,
}: {
  draw: { id: string; title: string; ticketPricePaise: number };
  tickets: HeldTicket[];
  shortfallPaise: number;
  resume: PayBookSession | null;
  missingAppId: string | null;
  onClose: () => void;
  onBooked: () => void;
  onReselect: () => void;
}) {
  const { uid } = useAuth();
  const settings = useSiteSettings();
  const [platform] = useState(() => detectPlatform());
  const apps = useMemo(() => appsForPlatform(platform), [platform]);
  const payable = useMemo(
    () => payAmountFor(shortfallPaise, settings.minDepositPaise, settings.maxDepositPaise),
    [shortfallPaise, settings.minDepositPaise, settings.maxDepositPaise],
  );

  const [session, setSession] = useState<PayBookSession>(() => {
    if (resume) {
      const backFromApp = resume.step === "pay" && resume.launchedApp && !missingAppId;
      return backFromApp ? { ...resume, step: "proof" } : resume;
    }
    return {
      drawId: draw.id,
      tickets,
      amountPaise: payable ?? 0,
      qr: null,
      sessionKey: newId("dep"),
      requestId: newId("dreq"),
      step: "pay",
      savedAt: Date.now(),
    };
  });
  const update = useCallback((patch: Partial<PayBookSession>) => setSession((s) => ({ ...s, ...patch })), []);
  const { step, qr, amountPaise } = session;
  const held = session.tickets;
  const totalPaise = held.length * draw.ticketPricePaise;

  const [qrError, setQrError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [launchProblem, setLaunchProblem] = useState<string | null>(
    missingAppId
      ? `${appLabel(missingAppId)} could not be opened from this browser. Try another app, or scan the QR code below.`
      : null,
  );
  const [utr, setUtr] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deposit, setDeposit] = useState<DepositRequest | null>(null);
  const [watchError, setWatchError] = useState<string | null>(null);
  const bookedReported = useRef(false);

  useEffect(() => writeSession(session), [session]);

  /* The payee is picked at random server-side, but stays the same for this session. */
  const loadQr = useCallback(async () => {
    setQrError(null);
    try {
      const picked = await callBackend<PickPaymentQrRequest, PickPaymentQrResponse>("pickPaymentQr", {
        sessionKey: session.sessionKey,
      });
      update({ qr: picked });
    } catch (err) {
      const message = err instanceof Error ? err.message : "No payment method is available right now.";
      const hint = errorActionHint((err as { code?: string })?.code ?? "");
      setQrError(hint ? `${message} ${hint}` : message);
    }
  }, [session.sessionKey, update]);

  useEffect(() => {
    if (step === "pay" && !qr && amountPaise > 0) void loadQr();
  }, [step, qr, amountPaise, loadQr]);

  /* Coming back from the UPI app moves on to the screenshot step. */
  useEffect(() => {
    const launched = session.launchedApp;
    if (!launched || step !== "pay") return;
    const startedAt = Date.now();
    let leftAt: number | null = null;
    const away = () => {
      if (leftAt === null) leftAt = Date.now();
    };
    const back = () => {
      if (leftAt === null) return;
      const awayMs = Date.now() - leftAt;
      leftAt = null;
      if (awayMs >= MIN_AWAY_MS) {
        setLaunchProblem(null);
        update({ step: "proof" });
      } else if (launched !== "any") {
        setLaunchProblem(
          `${appLabel(launched)} closed straight away. Some apps block payments started from a website — try another app or scan the QR code.`,
        );
      }
    };
    const onVisibility = () => (document.visibilityState === "hidden" ? away() : back());
    const timer = window.setTimeout(() => {
      if (leftAt !== null || document.visibilityState === "hidden") return;
      if (Date.now() - startedAt - LAUNCH_TIMEOUT_MS >= MIN_AWAY_MS) return update({ step: "proof" });
      update({ launchedApp: undefined });
      setLaunchProblem(`${appLabel(launched)} did not open. It may not be installed — try another app or scan the QR code.`);
    }, LAUNCH_TIMEOUT_MS);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", away);
    window.addEventListener("focus", back);
    window.addEventListener("pageshow", back);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", away);
      window.removeEventListener("focus", back);
      window.removeEventListener("pageshow", back);
    };
  }, [session.launchedApp, step, update]);

  const launchApp = (app: UpiApp | null) => {
    if (!qr) return;
    const appId = app?.id ?? "any";
    setLaunchProblem(null);
    const next = { ...session, launchedApp: appId };
    setSession(next);
    writeSession(next);
    void copyText(qr.upiId);
    window.location.href = upiLaunchUrl(
      app,
      platform,
      { upiId: qr.upiId, payeeName: qr.payeeName, amountPaise, note: "Diwali Dhamaka tickets" },
      `${window.location.origin}/book?draw=${encodeURIComponent(draw.id)}&upi_missing=${appId}`,
    );
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

  const onFile = (selected: File | null) => {
    setError(null);
    const problem = selected ? validateImage(selected) : null;
    if (problem) setError(problem);
    setFile(problem ? null : selected);
  };

  const submit = async () => {
    if (!uid || !qr) return;
    setError(null);
    const normalised = utr.trim().toUpperCase();
    if (!/^[A-Z0-9]{8,22}$/.test(normalised)) {
      setError("Enter the UTR / reference number exactly as your UPI app shows it (8–22 letters or digits).");
      return;
    }
    if (!file) {
      setError("Attach a screenshot of the successful payment.");
      return;
    }
    setSubmitting(true);
    try {
      const uploaded = await uploadImage("deposit-screenshots", file, uid);
      const response = await callBackend<SubmitDepositRequest, SubmitDepositResponse>("submitDeposit", {
        amountPaise,
        qrId: qr.qrId,
        utr: normalised,
        screenshotPath: uploaded.path,
        screenshotUrl: uploaded.url || undefined,
        requestId: session.requestId,
        booking: { drawId: draw.id, ticketIds: held.map((t) => t.id) },
      });
      update({ step: "waiting", depositId: response.depositId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "The payment proof could not be submitted.");
    } finally {
      setSubmitting(false);
    }
  };

  /* Follows the request live: the admin's approval books the tickets within seconds. */
  useEffect(() => {
    if (step !== "waiting" || !uid || !session.depositId) return;
    return walletService.watchDeposit(
      uid,
      session.depositId,
      (row) => {
        setWatchError(null);
        setDeposit(row);
      },
      () => setWatchError("Live status is unavailable. Check your notifications or My tickets."),
    );
  }, [step, uid, session.depositId]);

  const bookingStatus = deposit?.booking?.status;
  const finished = bookingStatus === "booked" || bookingStatus === "failed" || bookingStatus === "cancelled";
  useEffect(() => {
    if (!finished) return;
    clearPayBookSession();
    if (bookingStatus === "booked" && !bookedReported.current) {
      bookedReported.current = true;
      onBooked();
    }
  }, [finished, bookingStatus, onBooked]);

  const close = () => {
    if (step !== "waiting" || finished) clearPayBookSession();
    onClose();
  };

  const copyUpi = async () => {
    if (qr && (await copyText(qr.upiId))) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  const walletPart = Math.max(0, totalPaise - amountPaise);

  return (
    <Dialog
      open
      onClose={close}
      dismissible={!submitting}
      title={step === "waiting" ? "Your booking" : "Pay & book your tickets"}
      description={
        step === "pay"
          ? "Pay with any UPI app. Your tickets are booked automatically once the payment is verified."
          : step === "proof"
            ? "Upload the payment screenshot so we can verify it."
            : undefined
      }
      footer={
        step === "pay" ? (
          <>
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button
              disabled={!qr}
              onClick={() => update({ step: "proof" })}
              iconRight={<Upload className="size-4" aria-hidden />}
            >
              I have paid
            </Button>
          </>
        ) : step === "proof" ? (
          <>
            <Button variant="outline" disabled={submitting} onClick={() => update({ step: "pay", launchedApp: undefined })}>
              Back
            </Button>
            <Button loading={submitting} onClick={() => void submit()}>
              Submit &amp; book
            </Button>
          </>
        ) : bookingStatus === "booked" ? (
          <>
            <Button variant="outline" onClick={close}>
              Done
            </Button>
            <Link to="/dashboard/tickets">
              <Button>View my tickets</Button>
            </Link>
          </>
        ) : (
          <Button variant="outline" onClick={close}>
            {finished ? "Close" : "Close — keep waiting"}
          </Button>
        )
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-gold/40 bg-gold-soft/30 p-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="min-w-0 truncate text-[12.5px] font-semibold text-ink">
              {held.length} ticket{held.length === 1 ? "" : "s"} · {draw.title}
            </p>
            <p className="shrink-0 text-[12.5px] tabular-nums text-muted">{formatINR(totalPaise)}</p>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {held.map((ticket) => (
              <span
                key={ticket.id}
                className="rounded-md border border-line bg-paper px-2 py-0.5 text-[11.5px] font-bold tabular-nums text-ink"
              >
                {ticket.numberLabel}
              </span>
            ))}
          </div>
        </div>

        {step === "pay" ? (
          payable === null && !resume ? (
            <Alert tone="danger" title="This order is too large for one payment">
              One payment can be at most {formatINR(settings.maxDepositPaise)}. Choose fewer numbers and try again.
            </Alert>
          ) : (
            <>
              <div className="text-center">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Pay now</p>
                <p className="font-display text-[34px] font-bold leading-tight tabular-nums text-brand">
                  {formatINR(amountPaise)}
                </p>
                {walletPart > 0 ? (
                  <p className="text-[12px] text-muted">
                    {formatINR(walletPart)} comes from your wallet balance.
                  </p>
                ) : amountPaise > totalPaise ? (
                  <p className="text-[12px] text-muted">
                    Minimum payment is {formatINR(settings.minDepositPaise)}; the extra stays in your wallet.
                  </p>
                ) : null}
              </div>

              {qrError ? (
                <Alert tone="danger" title="Payment is not available">
                  {qrError}{" "}
                  <button type="button" className="font-semibold text-brand hover:underline" onClick={() => void loadQr()}>
                    Retry
                  </button>
                </Alert>
              ) : !qr ? (
                <p className="flex items-center justify-center gap-2 py-6 text-[13px] text-muted">
                  <Loader2 className="size-4 animate-spin" aria-hidden /> Preparing payment…
                </p>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-ivory/60 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Paying to</p>
                      <p className="truncate text-[13.5px] font-semibold text-ink">{qr.payeeName}</p>
                      <p className="break-all font-mono text-[12px] text-muted">{qr.upiId}</p>
                    </div>
                    <Button
                      size="sm"
                      variant={copied ? "success" : "outline"}
                      onClick={() => void copyUpi()}
                      iconLeft={copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
                    >
                      {copied ? "Copied" : "Copy"}
                    </Button>
                  </div>

                  {apps.length ? (
                    <div>
                      <p className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-ink">
                        <Smartphone className="size-4 text-brand" aria-hidden />
                        Choose your payment app
                      </p>
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {platform === "android" ? (
                          <UpiAppButton name="All UPI apps" hint="Installed apps" short="UPI" color="#0f7a4f" onClick={() => launchApp(null)} />
                        ) : null}
                        {apps.map((app) => (
                          <UpiAppButton key={app.id} name={app.name} short={app.short} color={app.color} onClick={() => launchApp(app)} />
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {launchProblem ? (
                    <Alert tone="warning" title="App did not open">
                      {launchProblem}
                    </Alert>
                  ) : null}

                  <details className="rounded-xl border border-line bg-white p-3" open={!apps.length}>
                    <summary className="flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-ink">
                      <QrCode className="size-4 text-brand" aria-hidden />
                      Scan QR code instead
                    </summary>
                    <img
                      src={qr.imageUrl}
                      alt={`UPI QR code for ${qr.payeeName}`}
                      className="mx-auto mt-3 aspect-square w-full max-w-[200px] rounded-lg object-contain"
                    />
                    <p className="mt-2 text-center text-[12px] text-muted">
                      Scan with any UPI app and enter {formatINR(amountPaise)}.
                    </p>
                  </details>

                  <p className="text-[11.5px] leading-relaxed text-muted">
                    Pay the exact amount in one payment. After paying, come back here and tap <strong>I have paid</strong>.
                  </p>
                </>
              )}
            </>
          )
        ) : null}

        {step === "proof" ? (
          <>
            {session.launchedApp ? (
              <Alert tone="info" title={`Back from ${appLabel(session.launchedApp)}`}>
                If the payment of {formatINR(amountPaise)} went through, add its reference number and screenshot. If it
                failed, tap Back and pay again.
              </Alert>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="pb-utr" required hint="8–22 letters/digits">
                UTR / reference number
              </Label>
              <Input
                id="pb-utr"
                value={utr}
                placeholder="e.g. 412345678901"
                autoCapitalize="characters"
                className="font-mono"
                onChange={(event) => setUtr(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              />
              <p className="text-[12px] text-muted">Shown in your UPI app's payment details.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pb-file" required hint="PNG, JPEG or WebP · max 5 MB">
                Payment screenshot
              </Label>
              <input
                id="pb-file"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/heic"
                onChange={(event) => onFile(event.target.files?.[0] ?? null)}
                className="w-full cursor-pointer rounded-xl border border-line-strong bg-paper px-3 py-2.5 text-[13px] text-ink file:mr-3 file:rounded-lg file:border-0 file:bg-ivory file:px-3 file:py-1.5 file:text-[12.5px] file:font-semibold file:text-ink"
              />
            </div>
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Selected payment screenshot preview"
                className="mx-auto max-h-56 rounded-lg border border-line object-contain"
              />
            ) : null}
            <p className="text-[12px] leading-relaxed text-muted">
              Your numbers are reserved for you while the admin verifies the payment. As soon as it is approved, the
              money is added to your wallet and these tickets are booked from it automatically.
            </p>
          </>
        ) : null}

        {step === "waiting" ? (
          !deposit ? (
            <p className="flex items-center justify-center gap-2 py-6 text-[13px] text-muted" role={watchError ? "alert" : undefined}>
              {watchError ?? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden /> Checking status…
                </>
              )}
            </p>
          ) : bookingStatus === "booked" ? (
            <div className="space-y-3 text-center">
              <CheckCircle2 className="mx-auto size-14 text-emerald" aria-hidden />
              <p className="font-display text-[22px] text-ink">Tickets booked!</p>
              <p className="text-[13px] text-muted">
                Payment verified and {formatINR(deposit.booking?.totalPaise)} paid from your wallet.
              </p>
              {deposit.booking?.orderId ? (
                <p className="font-mono text-[11.5px] text-muted">Order {deposit.booking.orderId}</p>
              ) : null}
            </div>
          ) : bookingStatus === "failed" ? (
            <Alert tone="warning" title="Payment verified, but the tickets could not be booked">
              {deposit.booking?.failureReason} Your money is in your wallet —{" "}
              <button type="button" className="font-semibold text-brand hover:underline" onClick={onReselect}>
                pick numbers again
              </button>{" "}
              and pay from the wallet.
            </Alert>
          ) : bookingStatus === "cancelled" || deposit.status === "rejected" ? (
            <Alert tone="danger" title="Payment not verified">
              <span className="flex items-start gap-2">
                <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  {deposit.rejectionReason ?? "The admin could not match this payment."} The numbers were released. You can
                  pick numbers and pay again.
                </span>
              </span>
            </Alert>
          ) : (
            <div className="space-y-3 text-center">
              <span className="relative mx-auto grid size-14 place-items-center rounded-full bg-gold-soft text-gold-deep">
                <span className="absolute inset-0 animate-ping rounded-full bg-gold/25" aria-hidden />
                <Clock3 className="relative size-7" aria-hidden />
              </span>
              <p className="font-display text-[20px] text-ink">Waiting for payment verification</p>
              <p className="text-[13px] leading-relaxed text-muted">
                Your payment of {formatINR(deposit.amountPaise)} was received for checking. The moment the admin approves
                it, these tickets are booked automatically — this screen updates by itself.
              </p>
              {deposit.booking?.heldUntil ? (
                <p className="text-[12px] text-muted">
                  Numbers reserved for you until {formatDateTime(deposit.booking.heldUntil)}.
                </p>
              ) : null}
              <p className="text-[11.5px] text-muted">You can close this; you will also get a notification.</p>
            </div>
          )
        ) : null}

        {error ? (
          <Alert tone="danger" title="Could not continue">
            {error}
            {/taken|no longer|allows at most/i.test(error) ? (
              <>
                {" "}
                <button type="button" className="font-semibold text-brand hover:underline" onClick={onReselect}>
                  Choose other numbers
                </button>
              </>
            ) : null}
          </Alert>
        ) : null}
      </div>
    </Dialog>
  );
}
