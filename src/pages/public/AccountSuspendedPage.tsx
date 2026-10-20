import { LogOut, MessageCircle, ShieldAlert } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/app/AuthProvider";
import { useSupportContact } from "@/app/SettingsProvider";
import { Alert, Button, Card, CardBody, CardHeader } from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";

export function AccountSuspendedPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const reason = user?.profile?.suspendedReason;
  const support = useSupportContact();

  return (
    <>
      <PageHeader
        eyebrow="Account status"
        icon={ShieldAlert}
        title="This account is suspended"
        description="Suspended accounts cannot add money, reserve tickets, spin the wheel or claim referral rewards."
        crumbs={[{ label: "Home", to: "/" }, { label: "Account suspended" }]}
      />

      <div className="page grid gap-6 py-8 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader title="What this means" />
          <CardBody className="space-y-4 text-[14px] leading-relaxed text-muted">
            <p>
              A suspension is a temporary hold while a possible breach of the eligibility rules is
              reviewed — for example duplicate accounts, referral farming or suspicious deposit
              activity.
            </p>
            {reason ? (
              <Alert tone="warning" title="Reason on file">
                {reason}
              </Alert>
            ) : (
              <Alert tone="info" title="No reason recorded">
                Contact support and quote your registered mobile number so the review can be located.
              </Alert>
            )}
            <p>
              Your existing ticket records and published results are not deleted. If the review finds
              no issue, the account is restored with its original wallet ledger intact.
            </p>
            <p className="text-[13px]">
              Read the{" "}
              <Link to="/legal/eligibility" className="font-semibold text-brand hover:underline">
                eligibility &amp; responsible participation rules
              </Link>{" "}
              to see what triggers a review.
            </p>
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Next steps" />
            <CardBody className="space-y-3">
              {support.phone && support.phoneHref ? (
                <a href={support.phoneHref} className="block">
                  <Button block variant="outline">
                    Call {support.phone}
                  </Button>
                </a>
              ) : null}
              {support.whatsappUrl ? (
                <a href={support.whatsappUrl} target="_blank" rel="noreferrer" className="block">
                  <Button block variant="success" iconLeft={<MessageCircle className="size-4" aria-hidden />}>
                    Message on WhatsApp
                  </Button>
                </a>
              ) : null}
              {support.email ? (
                <a href={`mailto:${support.email}`} className="block">
                  <Button block variant="outline">
                    Email {support.email}
                  </Button>
                </a>
              ) : null}
              {!support.phone && !support.email ? (
                <Link to="/contact" className="block">
                  <Button block variant="outline">
                    Contact page
                  </Button>
                </Link>
              ) : null}
              <Button
                block
                variant="ghost"
                iconLeft={<LogOut className="size-4" aria-hidden />}
                onClick={() => {
                  void signOut().then(() => navigate("/", { replace: true }));
                }}
              >
                Sign out
              </Button>
            </CardBody>
          </Card>

          <Alert tone="warning" title="Support will never ask for your OTP">
            No support agent needs your one-time password, bank password or UPI PIN to review an
            account.
          </Alert>
        </div>
      </div>
    </>
  );
}
