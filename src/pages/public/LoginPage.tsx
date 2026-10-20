import { useEffect } from "react";
import { LogIn, ShieldCheck } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/app/AuthProvider";
import { useToast } from "@/app/ToastProvider";
import { PhoneOtpAuth } from "@/features/auth/PhoneOtpAuth";
import { AuthShell } from "@/features/auth/AuthShell";
import type { ConfirmResult } from "@/services/authService";
import { Card, CardBody, CardFooter } from "@/components/ui";

interface LocationState {
  from?: string;
  admin?: boolean;
}

export function LoginPage() {
  const { user, loading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const state = (location.state ?? null) as LocationState | null;
  const target = state?.from ?? (state?.admin && isAdmin ? "/admin" : "/dashboard");

  useEffect(() => {
    if (loading || !user || user.profileError) return;
    navigate(user.profile ? target : "/register", { replace: true });
  }, [loading, user, navigate, target]);

  const complete = (result: ConfirmResult) => {
    if (result.needsRegistration) {
      toast.info("Almost there", "Your number is verified. Add your details to create the account.");
      navigate("/register", { replace: true });
      return;
    }
    toast.success("Signed in", `Welcome back${user?.profile?.fullName ? `, ${user.profile.fullName}` : ""}.`);
    navigate(target, { replace: true });
  };

  return (
    <AuthShell
      icon={LogIn}
      eyebrow="Account access"
      crumb="Sign in"
      title={
        <>
          Welcome back to <span className="text-gold-gradient">Diwali Dhamaka</span>
        </>
      }
      description="Sign in with your mobile number and a one-time password. Your wallet, tickets and rewards are waiting in your account."
      points={[
        "Pick your own ticket numbers in an open draw",
        "Add money to a ledger-backed wallet",
        "Track deposits, orders and published results",
        "Earn referral spins and play the festival wheel",
      ]}
    >
      <Card className="shadow-[0_24px_60px_-20px_rgb(0_0_0/0.45)]">
        <CardBody className="px-5 py-6 sm:px-7 sm:py-7">
          <div className="mb-5 flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand/10 text-brand">
              <ShieldCheck className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-[22px] leading-tight text-ink">Sign in</h2>
              <p className="text-[12.5px] text-muted">We'll text a one-time password to your number.</p>
            </div>
          </div>
          <PhoneOtpAuth
            mode="login"
            onCompleted={complete}
            alternateAction={
              <>
                New to {target.includes("admin") ? "the panel" : "Nellore Diwali Dhamaka"}?{" "}
                <Link to="/register" className="font-semibold text-brand hover:underline">
                  Create an account
                </Link>
              </>
            }
          />
        </CardBody>
        <CardFooter>
          <p className="text-[12px] leading-relaxed text-muted">
            Your role and account status are verified server-side. Signing in never grants
            administrative privileges by itself.
          </p>
        </CardFooter>
      </Card>
    </AuthShell>
  );
}
