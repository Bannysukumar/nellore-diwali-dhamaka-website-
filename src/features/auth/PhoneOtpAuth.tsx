import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, KeyRound, Phone, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import {
  confirmOtp,
  isValidIndianPhone,
  normaliseIndianPhone,
  requestOtp,
  resetRecaptcha,
  OTP_RESEND_COOLDOWN_SECONDS,
  type ConfirmResult,
  type RegistrationDraft,
} from "@/services/authService";
import { IS_EMULATOR } from "@/lib/firebase/config";
import { Alert, Button, Input, Label, Spinner } from "@/components/ui";
import { maskPhone } from "@/utils/mask";

const RECAPTCHA_CONTAINER_ID = "auth-recaptcha-container";

/**
 * Shared phone + OTP step machine used by both sign-in and registration.
 * Codes are issued and checked by Firebase Authentication; this component never sees them.
 */
export function PhoneOtpAuth({
  mode,
  draft,
  initialPhone = "",
  onCompleted,
  alternateAction,
}: {
  mode: "login" | "register";
  draft?: RegistrationDraft | null;
  /** Pre-fills the number (for example from the registration form). */
  initialPhone?: string;
  onCompleted: (result: ConfirmResult) => void;
  alternateAction?: ReactNode;
}) {
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState(initialPhone);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issuedTo, setIssuedTo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const verificationId = useRef<string | null>(null);
  const otpRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => resetRecaptcha(), []);

  useEffect(() => {
    if (step === "otp") otpRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const send = async () => {
    setError(null);
    if (!isValidIndianPhone(phone)) {
      setError("Enter a valid 10-digit Indian mobile number.");
      return;
    }
    if (draft && !draft.acceptedTerms) {
      setError("Please accept the terms to continue.");
      return;
    }
    const target = normaliseIndianPhone(phone);
    if (cooldown > 0 && issuedTo === target) {
      setError(`Please wait ${cooldown}s before requesting another code.`);
      return;
    }
    setBusy(true);
    try {
      const result = await requestOtp(phone, RECAPTCHA_CONTAINER_ID);
      verificationId.current = result.verificationId;
      setIssuedTo(target);
      setCooldown(OTP_RESEND_COOLDOWN_SECONDS);
      setStep("otp");
      setCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the OTP. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setError(null);
    if (!verificationId.current) {
      setError("No OTP is pending. Request a new code.");
      return;
    }
    if (code.trim().length < 4) {
      setError("Enter the OTP you received.");
      return;
    }
    setBusy(true);
    try {
      const result = await confirmOtp(verificationId.current, code.trim(), draft ?? undefined);
      onCompleted(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {IS_EMULATOR ? (
        <Alert tone="info" title="Local emulator">
          No SMS is sent. Read the code from the Auth tab of the Emulator UI or the emulator log.
        </Alert>
      ) : null}

      {error ? <Alert tone="danger" title="We could not continue">{error}</Alert> : null}

      {step === "phone" ? (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="phone-input" required>
              Mobile number
            </Label>
            <Input
              id="phone-input"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              placeholder="90000 00000"
              prefix={<Phone className="size-4" aria-hidden />}
              value={phone}
              invalid={Boolean(error)}
              onChange={(event) => setPhone(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void send();
              }}
            />
            <p className="text-[12px] text-muted">
              We send a one-time password. Standard messaging rates may apply.
            </p>
          </div>

          <Button block size="lg" loading={busy} onClick={() => void send()}>
            Send OTP
          </Button>

          {alternateAction ? <div className="text-center text-[13px] text-muted">{alternateAction}</div> : null}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-[13px] text-muted">
            Code sent to <span className="font-semibold text-ink">{issuedTo ? maskPhone(issuedTo) : ""}</span>
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="otp-input" required>
              One-time password
            </Label>
            <Input
              ref={otpRef}
              id="otp-input"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="6-digit code"
              prefix={<KeyRound className="size-4" aria-hidden />}
              value={code}
              invalid={Boolean(error)}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              onKeyDown={(event) => {
                if (event.key === "Enter") void verify();
              }}
            />
          </div>

          <Button block size="lg" loading={busy} onClick={() => void verify()}>
            {mode === "register" ? "Verify & create account" : "Verify & sign in"}
          </Button>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setStep("phone");
                setError(null);
                setCode("");
              }}
              className="inline-flex items-center gap-1.5 font-semibold text-brand hover:underline disabled:opacity-50"
            >
              <ArrowLeft className="size-3.5" aria-hidden />
              Change number
            </button>
            <button
              type="button"
              disabled={busy || cooldown > 0}
              onClick={() => void send()}
              className="font-semibold text-brand hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline"
              aria-live="polite"
            >
              {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
            </button>
          </div>
        </div>
      )}

      <p className="flex items-start gap-2 rounded-xl border border-line bg-ivory/60 p-3 text-[11.5px] leading-relaxed text-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald" aria-hidden />
        <span>
          Never share your OTP. We never ask for it by phone or WhatsApp.{" "}
          <Link to="/legal/privacy" className="font-semibold text-brand hover:underline">
            Privacy policy
          </Link>
        </span>
      </p>

      <div id={RECAPTCHA_CONTAINER_ID} />

      {busy && step === "phone" ? <p className="flex items-center gap-2 text-[12px] text-muted"><Spinner /> Contacting the SMS gateway…</p> : null}
    </div>
  );
}
