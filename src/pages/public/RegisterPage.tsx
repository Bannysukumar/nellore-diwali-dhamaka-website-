import { useEffect, useMemo, useState, type FormEvent } from "react";
import { TriangleAlert, UserPlus } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/app/AuthProvider";
import { useToast } from "@/app/ToastProvider";
import { useSiteSettings } from "@/app/SettingsProvider";
import { PhoneOtpAuth } from "@/features/auth/PhoneOtpAuth";
import {
  completeRegistration,
  isValidIndianPhone,
  type ConfirmResult,
  type RegistrationDraft,
} from "@/services/authService";
import { maskPhone } from "@/utils/mask";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardFooter,
  Checkbox,
  Input,
  Label,
} from "@/components/ui";
import { AuthShell } from "@/features/auth/AuthShell";

export function RegisterPage() {
  const { user, loading } = useAuth();
  const settings = useSiteSettings();
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [referralCode, setReferralCode] = useState(
    (params.get("ref") ?? params.get("referral") ?? "").toUpperCase(),
  );
  const [acceptedTerms, setAccepted] = useState(false);
  const [touched, setTouched] = useState(false);
  const [step, setStep] = useState<"details" | "otp">("details");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const phoneReferral = useMemo(() => params.get("ref") ?? null, [params]);
  /** Signed in with a verified number, but no account exists yet. */
  const verifiedWithoutAccount = Boolean(user && !user.profile);

  useEffect(() => {
    if (!loading && user?.profile) navigate("/dashboard", { replace: true });
  }, [loading, user, navigate]);

  const fieldErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    if (fullName.trim().length < 2) errors.fullName = "Enter your full name.";
    if (!verifiedWithoutAccount && !isValidIndianPhone(phone)) {
      errors.phone = "Enter a valid 10-digit Indian mobile number.";
    }
    if (email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      errors.email = "Enter a valid email address.";
    }
    if (referralCode.trim() && !/^[A-Za-z0-9]{4,20}$/.test(referralCode.trim())) {
      errors.referralCode = "Referral codes are 4–20 letters and digits.";
    }
    if (!acceptedTerms) errors.terms = "Please accept the terms and eligibility rules.";
    return errors;
  }, [fullName, phone, email, referralCode, acceptedTerms, verifiedWithoutAccount]);

  const draft: RegistrationDraft = {
    fullName: fullName.trim(),
    email: email.trim() || undefined,
    address: undefined,
    referralCode: referralCode.trim().toUpperCase() || undefined,
    acceptedTerms,
  };

  const proceedToOtp = async (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    setSubmitError(null);
    if (Object.keys(fieldErrors).length) return;
    if (!verifiedWithoutAccount) {
      setStep("otp");
      return;
    }
    setSubmitting(true);
    try {
      completed(await completeRegistration(draft));
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "The account could not be created.");
    } finally {
      setSubmitting(false);
    }
  };

  const completed = (result: ConfirmResult) => {
    if (result.needsRegistration) {
      setStep("details");
      setSubmitError("Your number is verified. Complete the details below to create the account.");
      return;
    }
    toast.success(
      result.isNewUser ? "Welcome to the festival" : "Signed in",
      result.isNewUser
        ? "Your account is ready. Add money to your wallet to book tickets."
        : "Your account already existed and you are signed in.",
    );
    if (result.referral?.status === "rejected") {
      toast.info("Referral code not applied", result.referral.reason ?? "The code could not be used.");
    }
    navigate("/dashboard", { replace: true });
  };

  return (
    <AuthShell
      icon={UserPlus}
      eyebrow="Registration"
      crumb="Register"
      title={
        <>
          Create your <span className="text-gold-gradient">festival account</span>
        </>
      }
      description="One account per person, verified with your mobile number. Registration is free — you only pay when you add money and buy tickets."
      points={[
        "Verify your mobile number with a one-time password",
        "Add money through a reviewed UPI deposit",
        "Pick your ticket numbers from the live grid",
        "Invite friends and earn spins on the festival wheel",
      ]}
      aside={
        <div className="flex gap-3 rounded-2xl border border-gold/40 bg-black/20 p-4 text-ivory backdrop-blur-sm">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-gold-soft" aria-hidden />
          <div>
            <p className="font-semibold">One account per person</p>
            <p className="mt-1 text-sm text-ivory/75">
              Duplicate accounts created to farm referral rewards or spins are suspended under the
              published eligibility rules.
            </p>
          </div>
        </div>
      }
    >
      <Card className="shadow-[0_24px_60px_-20px_rgb(0_0_0/0.45)]">
        <CardBody className="px-5 py-6 sm:px-7 sm:py-7">
          <div className="mb-5 flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand/10 text-brand">
              <UserPlus className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-[22px] leading-tight text-ink">
                {step === "details" ? "Your details" : "Verify your number"}
              </h2>
              <p className="text-[12.5px] text-muted">
                Step {step === "details" ? 1 : 2} of 2 ·{" "}
                {step === "details" ? "takes under a minute" : "enter the code we texted you"}
              </p>
            </div>
          </div>
          {step === "details" ? (
            <form className="space-y-4" onSubmit={(event) => void proceedToOtp(event)} noValidate>
              {submitError ? (
                <Alert tone={verifiedWithoutAccount ? "info" : "danger"} title="Account details">
                  {submitError}
                </Alert>
              ) : null}
              <div className="space-y-1.5">
                <Label htmlFor="full-name" required>
                  Full name
                </Label>
                <Input
                  id="full-name"
                  autoComplete="name"
                  placeholder="e.g. Rahul Verma"
                  value={fullName}
                  invalid={touched && Boolean(fieldErrors.fullName)}
                  onChange={(event) => setFullName(event.target.value)}
                />
                {touched && fieldErrors.fullName ? (
                  <p role="alert" className="text-[12px] font-medium text-status-booked">
                    {fieldErrors.fullName}
                  </p>
                ) : null}
              </div>

              {verifiedWithoutAccount ? (
                <Alert tone="success" title="Mobile number verified">
                  {user?.phone ? maskPhone(user.phone) : "Your number"} is verified. Add your details to
                  finish creating the account.
                </Alert>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="reg-phone" required>
                    Mobile number
                  </Label>
                  <Input
                    id="reg-phone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    placeholder="90000 00000"
                    value={phone}
                    invalid={touched && Boolean(fieldErrors.phone)}
                    onChange={(event) => setPhone(event.target.value)}
                  />
                  {touched && fieldErrors.phone ? (
                    <p role="alert" className="text-[12px] font-medium text-status-booked">
                      {fieldErrors.phone}
                    </p>
                  ) : (
                    <p className="text-[12px] text-muted">The next step verifies this number with an OTP.</p>
                  )}
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="reg-email" hint="Optional">
                    Email
                  </Label>
                  <Input
                    id="reg-email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    invalid={touched && Boolean(fieldErrors.email)}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                  {touched && fieldErrors.email ? (
                    <p role="alert" className="text-[12px] font-medium text-status-booked">
                      {fieldErrors.email}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="reg-ref" hint={phoneReferral ? "From your invite link" : "Optional"}>
                    Referral code
                  </Label>
                  <Input
                    id="reg-ref"
                    placeholder="DDXXXXXX"
                    value={referralCode}
                    autoCapitalize="characters"
                    invalid={touched && Boolean(fieldErrors.referralCode)}
                    onChange={(event) => setReferralCode(event.target.value.toUpperCase())}
                  />
                  {touched && fieldErrors.referralCode ? (
                    <p role="alert" className="text-[12px] font-medium text-status-booked">
                      {fieldErrors.referralCode}
                    </p>
                  ) : null}
                </div>
              </div>

              <Checkbox
                checked={acceptedTerms}
                onChange={(event) => setAccepted(event.target.checked)}
                label={
                  <>
                    I accept the{" "}
                    <Link to="/legal/terms" className="font-semibold text-brand hover:underline">
                      terms
                    </Link>
                    ,{" "}
                    <Link to="/legal/privacy" className="font-semibold text-brand hover:underline">
                      privacy policy
                    </Link>{" "}
                    and the{" "}
                    <Link to="/legal/eligibility" className="font-semibold text-brand hover:underline">
                      eligibility rules
                    </Link>
                    .
                  </>
                }
                description={`Participation is restricted to adults aged ${settings.minAge}+.`}
              />
              {touched && fieldErrors.terms ? (
                <p role="alert" className="text-[12px] font-medium text-status-booked">
                  {fieldErrors.terms}
                </p>
              ) : null}

              <Button type="submit" block size="lg" loading={submitting}>
                {verifiedWithoutAccount ? "Create my account" : "Continue to OTP"}
              </Button>
            </form>
          ) : (
            <PhoneOtpAuth
              mode="register"
              draft={draft}
              initialPhone={phone}
              onCompleted={completed}
              alternateAction={
                <button
                  type="button"
                  onClick={() => setStep("details")}
                  className="font-semibold text-brand hover:underline"
                >
                  Edit my details
                </button>
              }
            />
          )}
        </CardBody>

        <CardFooter>
          <p className="text-[12px] text-muted">
            Already registered?{" "}
            <Link to="/login" className="font-semibold text-brand hover:underline">
              Sign in instead
            </Link>
          </p>
        </CardFooter>
      </Card>
    </AuthShell>
  );
}
