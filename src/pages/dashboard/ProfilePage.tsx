import { useEffect, useState } from "react";
import { LogOut, ShieldCheck, UserRound } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/app/AuthProvider";
import { useToast } from "@/app/ToastProvider";
import { userService } from "@/services/userService";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  FormRow,
  Input,
  Label,
  Textarea,
} from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatDateTime } from "@/utils/format";
import { initials } from "@/utils/mask";

export function ProfilePage() {
  const { uid, profile, isAdmin, signOut, refresh } = useAuth();
  const toast = useToast();

  const [fullName, setFullName] = useState(profile?.fullName ?? "");
  const [email, setEmail] = useState(profile?.email ?? "");
  const [address, setAddress] = useState(profile?.address ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFullName(profile?.fullName ?? "");
    setEmail(profile?.email ?? "");
    setAddress(profile?.address ?? "");
  }, [profile?.fullName, profile?.email, profile?.address]);

  const dirty =
    fullName !== (profile?.fullName ?? "") ||
    email !== (profile?.email ?? "") ||
    address !== (profile?.address ?? "");

  const save = async () => {
    if (!uid) return;
    setError(null);
    if (fullName.trim().length < 3) {
      setError("Enter your full name as it should appear on your tickets.");
      return;
    }
    setSaving(true);
    try {
      await userService.updateProfile(uid, {
        fullName: fullName.trim(),
        email: email.trim() || undefined,
        address: address.trim() || undefined,
      });
      refresh();
      toast.success("Profile updated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your profile could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Profile"
        icon={UserRound}
        title="Your account"
        description="Keep your contact details accurate — they are used for support and prize delivery."
        crumbs={[
          { label: "Home", to: "/" },
          { label: "Dashboard", to: "/dashboard" },
          { label: "Profile" },
        ]}
        actions={
          <Button variant="outline" onClick={() => void signOut()} iconLeft={<LogOut className="size-4" aria-hidden />}>
            Sign out
          </Button>
        }
      />

      <div className="page mt-5 grid gap-5 py-0 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {error ? (
            <Alert tone="danger" title="We could not save your profile">
              {error}
            </Alert>
          ) : null}

          <Card>
            <CardHeader icon={UserRound} title="Personal details" description="Your name and contact information." />
            <CardBody className="space-y-4">
              <FormRow columns={1}>
                <div>
                  <Label htmlFor="profile-name" required>
                    Full name
                  </Label>
                  <Input
                    id="profile-name"
                    value={fullName}
                    autoComplete="name"
                    onChange={(event) => setFullName(event.target.value)}
                  />
                </div>
              </FormRow>
              <FormRow>
                <div>
                  <Label htmlFor="profile-email" hint="Optional">
                    Email address
                  </Label>
                  <Input
                    id="profile-email"
                    type="email"
                    value={email}
                    autoComplete="email"
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                  />
                </div>
                <div>
                  <Label hint="Cannot be changed">Mobile number</Label>
                  <Input value={profile?.phoneMasked ?? ""} readOnly className="bg-ivory" />
                </div>
              </FormRow>
              <FormRow columns={1}>
                <div>
                  <Label htmlFor="profile-address" hint="Optional">
                    Delivery address
                  </Label>
                  <Textarea
                    id="profile-address"
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                    placeholder="Used only if you win a physical prize."
                  />
                </div>
              </FormRow>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void save()} loading={saving} disabled={!dirty}>
                  Save changes
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setFullName(profile?.fullName ?? "");
                    setEmail(profile?.email ?? "");
                    setAddress(profile?.address ?? "");
                  }}
                  disabled={!dirty}
                >
                  Reset
                </Button>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              icon={ShieldCheck}
              title="Sign-in &amp; security"
              description="Your account is protected by mobile one-time-password authentication."
            />
            <CardBody className="space-y-2.5 text-[13px] leading-relaxed text-muted">
              <p>• You sign in with a one-time password sent to your mobile number.</p>
              <p>• We never ask for your OTP, UPI PIN or bank password — including over chat.</p>
              <p>• If you suspect unauthorised access, sign out everywhere and contact support.</p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Link to="/legal/privacy">
                  <Button variant="ghost" size="sm">
                    Privacy policy
                  </Button>
                </Link>
                <Link to="/dashboard/support">
                  <Button variant="ghost" size="sm">
                    Contact support
                  </Button>
                </Link>
              </div>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card>
            <CardBody className="space-y-3 text-center">
              <span className="mx-auto grid size-16 place-items-center rounded-full bg-brand text-[22px] font-bold text-white">
                {initials(profile?.fullName ?? "?")}
              </span>
              <div>
                <p className="font-display text-[18px] text-ink">{profile?.fullName ?? "Participant"}</p>
                <p className="text-[12.5px] text-muted">{profile?.phoneMasked ?? ""}</p>
              </div>
              <div className="flex items-center justify-center gap-2">
                <Badge tone={profile?.status === "active" ? "emerald" : "danger"}>
                  {profile?.status ?? "active"}
                </Badge>
                {isAdmin ? <Badge tone="brand">Administrator</Badge> : <Badge tone="neutral">Customer</Badge>}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Account summary" />
            <CardBody className="space-y-2 text-[13px]">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Referral code</dt>
                <dd className="font-mono font-semibold text-ink">{profile?.referralCode ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Referred by</dt>
                <dd className="font-semibold text-ink">{profile?.referredByCode ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Member since</dt>
                <dd className="text-ink">{profile ? formatDateTime(profile.createdAt) : "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Last sign-in</dt>
                <dd className="text-ink">
                  {profile?.lastLoginAt ? formatDateTime(profile.lastLoginAt) : "—"}
                </dd>
              </div>
            </CardBody>
          </Card>

          {isAdmin ? (
            <Card className="border-brand/30">
              <CardBody className="space-y-2">
                <p className="flex items-center gap-2 text-[13px] font-semibold text-brand">
                  <ShieldCheck className="size-4" aria-hidden />
                  Administrator access
                </p>
                <p className="text-[12.5px] leading-relaxed text-muted">
                  You have admin privileges on this account. Open the admin panel to manage draws,
                  deposits and settings.
                </p>
                <Link to="/admin">
                  <Button block variant="secondary" size="sm">
                    Open admin panel
                  </Button>
                </Link>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
