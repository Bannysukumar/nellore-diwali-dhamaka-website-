import { useState } from "react";
import { Check, Copy, Share2, Sparkles, UserPlus, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { useAsync } from "@/hooks/useAsync";
import { useAuth } from "@/app/AuthProvider";
import { useSiteSettings } from "@/app/SettingsProvider";
import { useToast } from "@/app/ToastProvider";
import { rewardService } from "@/services/rewardService";
import type { Referral, SpinAccount } from "@/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  Input,
  LoadErrors,
  Skeleton,
  StatCard,
  type Column,
} from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatDateTime } from "@/utils/format";

const STATUS_TONE: Record<Referral["status"], "warning" | "emerald" | "danger"> = {
  pending: "warning",
  qualified: "emerald",
  rejected: "danger",
};

const STATUS_LABEL: Record<Referral["status"], string> = {
  pending: "Pending qualification",
  qualified: "Qualified",
  rejected: "Rejected",
};

export function ReferralsPage() {
  const { uid, profile } = useAuth();
  const settings = useSiteSettings();
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  const referrals = useAsync(
    async () => (uid ? await rewardService.referralsByReferrer(uid, 200) : []),
    [uid],
    { enabled: Boolean(uid) },
  );
  const spin = useAsync(
    async () => (uid ? await rewardService.spinAccount(uid) : null),
    [uid],
    { enabled: Boolean(uid) },
  );

  const rows = (referrals.data ?? []) as Referral[];
  const qualified = rows.filter((r) => r.status === "qualified").length;
  const pending = rows.filter((r) => r.status === "pending").length;
  const spinsEarned = rows.reduce((sum, r) => sum + r.rewardSpins, 0);
  const code = profile?.referralCode ?? "";
  const link = code ? rewardService.referralLink(code) : "";
  const spinAccount = spin.data as SpinAccount | null;

  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success("Referral code copied", "Share it with a friend to earn a free spin.");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy", "Please copy the code manually.");
    }
  };

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Referral link copied");
    } catch {
      toast.error("Could not copy", "Please copy the link manually.");
    }
  };

  const columns: Array<Column<Referral>> = [
    {
      key: "joined",
      header: "Joined",
      render: (row) => <span className="whitespace-nowrap">{formatDateTime(row.createdAt)}</span>,
    },
    {
      key: "participant",
      header: "Participant",
      render: (row) => (
        <div className="min-w-0">
          <p className="font-medium text-ink">{row.refereePhoneMasked}</p>
          <p className="text-[11px] text-muted">Code used: {row.code}</p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <div className="flex flex-col items-end gap-1 sm:items-start">
          <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>
          {row.note ? <span className="text-[11px] text-muted">{row.note}</span> : null}
        </div>
      ),
    },
    {
      key: "spins",
      header: "Spins earned",
      align: "right",
      hideBelow: "sm",
      render: (row) => (
        <span className="font-semibold tabular-nums text-ink">{row.rewardSpins}</span>
      ),
    },
    {
      key: "qualified",
      header: "Qualified",
      hideBelow: "md",
      render: (row) => (
        <span className="text-muted">{row.qualifiedAt ? formatDateTime(row.qualifiedAt) : "—"}</span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Referrals"
        icon={Users}
        title="Invite friends, earn festival spins"
        description="Share your referral code. A reward is granted only once a genuinely new participant signs up with your code and qualifies under the published rules."
        crumbs={[
          { label: "Home", to: "/" },
          { label: "Dashboard", to: "/dashboard" },
          { label: "Referrals" },
        ]}
        actions={
          <Link to="/dashboard/spin">
            <Button variant="gold" iconLeft={<Sparkles className="size-4" aria-hidden />}>
              Use my spins
            </Button>
          </Link>
        }
      />

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Referrals"
          value={rows.length}
          hint="Signups recorded with your code"
          icon={UserPlus}
        />
        <StatCard
          label="Qualified"
          value={qualified}
          hint="Reached a qualifying activity"
          icon={Check}
          tone="emerald"
        />
        <StatCard
          label="Pending"
          value={pending}
          hint="Awaiting a verified deposit or purchase"
          tone="warning"
        />
        <StatCard
          label="Free spins earned"
          value={spinsEarned}
          hint={
            spinAccount
              ? `${spinAccount.availableSpins} available right now`
              : "Across all referrals"
          }
          icon={Sparkles}
          tone="gold"
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader
            icon={Users}
            title="Your referral activity"
            description="Every relationship recorded against your code, and how it resolved."
            action={<Badge tone="neutral">{rows.length} total</Badge>}
          />
          <CardBody>
            {referrals.loading ? (
              <Skeleton className="h-40" rounded="lg" />
            ) : referrals.error ? (
              <LoadErrors sources={[referrals]} title="Your referrals could not be loaded" />
            ) : (
              <DataTable
                columns={columns}
                rows={rows}
                keyOf={(row) => row.id}
                caption="Referrals"
                emptyTitle="No referrals yet"
                emptyDescription="Share your code with a friend. When they sign up and qualify, you earn a free spin."
                emptyAction={
                  <Link to="/book">
                    <Button variant="outline">Book a ticket yourself</Button>
                  </Link>
                }
              />
            )}
          </CardBody>
        </Card>

        <div className="side-panel space-y-4">
          <Card className="gradient-reward text-ivory">
            <CardBody className="space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gold-soft">
                Your referral code
              </p>
              <p className="font-display text-[30px] leading-none tracking-[0.08em]">{code || "—"}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="gold"
                  onClick={() => void copyCode()}
                  iconLeft={copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                >
                  {copied ? "Copied" : "Copy code"}
                </Button>
                <a
                  href={code ? rewardService.whatsappShareUrl(code, settings.brandName, settings.referralShareMessage) : "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-disabled={!code}
                >
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!code}
                    iconLeft={<Share2 className="size-4" aria-hidden />}
                  >
                    Share on WhatsApp
                  </Button>
                </a>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Referral link" description="Anyone opening it can register with your code." />
            <CardBody className="space-y-3">
              <Input readOnly value={link} aria-label="Your referral link" className="font-mono text-[12px]" />
              <Button
                block
                variant="outline"
                onClick={() => void copyLink()}
                iconLeft={<Copy className="size-4" aria-hidden />}
              >
                Copy link
              </Button>
            </CardBody>
          </Card>

          <Alert tone="info" title="Fair-use rules">
            Self-referrals, duplicate accounts and shared devices are reviewed before any reward is paid.
            Rewards are always granted by the backend — never by this screen.
          </Alert>

          {rows.length ? (
            <Card>
              <CardHeader title="Recent rewards" />
              <CardBody className="space-y-2">
                {rows
                  .filter((r) => r.status === "qualified")
                  .slice(0, 4)
                  .map((r) => (
                    <div key={r.id} className="rounded-xl border border-emerald/25 bg-emerald-soft/50 p-3">
                      <p className="text-[13px] font-semibold text-ink">
                        +{r.rewardSpins} free spin{r.rewardSpins === 1 ? "" : "s"}
                      </p>
                      <p className="mt-0.5 text-[12px] text-muted">
                        {r.refereePhoneMasked} · qualified{" "}
                        {r.qualifiedAt ? formatDateTime(r.qualifiedAt) : "recently"}
                      </p>
                    </div>
                  ))}
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
