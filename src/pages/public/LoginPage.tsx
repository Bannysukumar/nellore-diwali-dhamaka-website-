import { useEffect } from "react";
import { LogIn, ShieldCheck } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/app/AuthProvider";
import { useToast } from "@/app/ToastProvider";
import { PhoneOtpAuth } from "@/features/auth/PhoneOtpAuth";
import type { ConfirmResult } from "@/services/authService";
import { Card, CardBody, CardFooter } from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";

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
    <>
      <PageHeader
        eyebrow="Account access"
        icon={LogIn}
        title="Sign in to your account"
        description="Registering or signing in takes a mobile number and a one-time password. Wallet, tickets and rewards live inside your account."
        crumbs={[{ label: "Home", to: "/" }, { label: "Sign in" }]}
      />

      <div className="page grid gap-6 py-8 lg:grid-cols-[1fr_360px]">
        <Card className="max-w-xl">
          <CardBody className="px-5 py-6">
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

        <div className="space-y-4">
          <Card>
            <CardBody className="space-y-3 text-[13px] leading-relaxed text-muted">
              <p className="flex items-center gap-2 font-display text-[16px] text-ink">
                <ShieldCheck className="size-4 text-emerald" aria-hidden />
                Why sign in?
              </p>
              <ul className="space-y-1.5">
                <li>• Reserve specific ticket numbers in an open draw.</li>
                <li>• Add money to a ledger-backed wallet.</li>
                <li>• Track deposits, orders and published results.</li>
                <li>• Earn referral spins and track their qualification.</li>
              </ul>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
