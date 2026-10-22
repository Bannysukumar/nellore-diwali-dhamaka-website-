import { useMemo, useRef, useState } from "react";
import { Gift, Info, Sparkles, Ticket, Users, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import { useAsync } from "@/hooks/useAsync";
import { useAuth } from "@/app/AuthProvider";
import { useSettings } from "@/app/SettingsProvider";
import { useToast } from "@/app/ToastProvider";
import { callBackend } from "@/lib/backend/callBackend";
import type { ExecuteSpinRequest, ExecuteSpinResponse } from "@/lib/backend/api";
import { describeStoreError } from "@/lib/backend";
import { rewardService } from "@/services/rewardService";
import { walletService } from "@/services/walletService";
import type { ReferralQualification, Reward, SpinAccount, SpinTransaction } from "@/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  Dialog,
  EmptyState,
  ErrorState,
  Skeleton,
  StatCard,
  type Column,
} from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { SpinWheel } from "@/features/spin/SpinWheel";
import { ReferralLinkCard } from "@/features/referrals/ReferralLinkCard";
import { ReadOnlyViewNotice, useReadOnlyView } from "@/features/auth/ViewAs";
import { formatDateTime } from "@/utils/format";
import { formatINR } from "@/utils/money";
import { newId } from "@/utils/id";

const QUALIFICATION_COPY: Record<ReferralQualification, string> = {
  signup: "A referral qualifies once the new participant completes OTP-verified registration.",
  verified_deposit: "A referral qualifies after the new participant's first verified deposit.",
  ticket_purchase: "A referral qualifies after the new participant's first confirmed ticket purchase.",
};

export function SpinPage() {
  const { uid } = useAuth();
  const readOnly = useReadOnlyView();
  const { spin: spinConfig } = useSettings();
  const toast = useToast();

  const account = useAsync(
    async () => (uid ? await rewardService.spinAccount(uid) : null),
    [uid],
    { enabled: Boolean(uid) },
  );
  const history = useAsync(
    async () => (uid ? await rewardService.spinHistory(uid, 60) : []),
    [uid],
    { enabled: Boolean(uid) },
  );
  const rewards = useAsync(() => rewardService.rewards(), []);
  const wallet = useAsync(
    async () => (uid ? await walletService.account(uid) : null),
    [uid],
    { enabled: Boolean(uid) },
  );

  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<ExecuteSpinResponse | null>(null);
  const [revealSegment, setRevealSegment] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRewards, setShowRewards] = useState(false);
  const requestId = useRef(newId("spin"));

  const spinAccount = account.data as SpinAccount | null;
  const spinsLeft = spinAccount?.availableSpins ?? 0;
  const segments = useMemo(() => spinConfig?.segments ?? [], [spinConfig]);
  const activeSegments = useMemo(() => segments.filter((s) => s.active), [segments]);
  const rewardMap = useMemo(() => {
    const map = new Map<string, Reward>();
    (rewards.data ?? []).forEach((r) => map.set(r.id, r));
    return map;
  }, [rewards.data]);

  const campaignOpen = useMemo(() => {
    if (!spinConfig) return false;
    const now = Date.now();
    const started = !spinConfig.campaignStart || now >= new Date(spinConfig.campaignStart).getTime();
    const notEnded = !spinConfig.campaignEnd || now <= new Date(spinConfig.campaignEnd).getTime();
    return started && notEnded;
  }, [spinConfig]);

  const spinPricePaise = spinConfig?.spinPricePaise ?? 0;
  const paidLimitLabel = spinConfig?.dailyPaidSpinLimit ? `${spinConfig.dailyPaidSpinLimit} a day` : "unlimited";
  const balancePaise = wallet.data?.balancePaise ?? 0;
  const wheelLive = Boolean(spinConfig?.enabled) && campaignOpen && !spinning;
  const canSpin = wheelLive && !readOnly && spinsLeft > 0;
  const canBuySpin = wheelLive && !readOnly && spinPricePaise > 0 && balancePaise >= spinPricePaise;

  const doSpin = async (payWithWallet: boolean) => {
    if (payWithWallet ? !canBuySpin : !canSpin) return;
    setError(null);
    setResult(null);
    setRevealSegment(null);
    requestId.current = newId("spin");
    setSpinning(true);
    try {
      /* The backend selects the outcome. The wheel only animates the reveal. */
      const outcome = await callBackend<ExecuteSpinRequest, ExecuteSpinResponse>("executeSpin", {
        requestId: requestId.current,
        payWithWallet,
      });
      setResult(outcome);
      setRevealSegment(outcome.segmentId);
      window.setTimeout(() => setSpinning(false), 3500);
      account.setData({
        uid: uid ?? "",
        availableSpins: outcome.availableSpins,
        totalEarned: spinAccount?.totalEarned ?? 0,
        totalUsed: (spinAccount?.totalUsed ?? 0) + 1,
        updatedAt: new Date().toISOString(),
      });
      if (typeof outcome.balancePaise === "number" && wallet.data) {
        wallet.setData({ ...wallet.data, balancePaise: outcome.balancePaise });
      }
      history.reload();
      toast.success("Spin complete", `You received: ${outcome.rewardName}`);
    } catch (err) {
      setSpinning(false);
      const message = err instanceof Error ? err.message : "The spin could not be completed.";
      setError(message);
      toast.error("Spin not completed", message);
    }
  };

  const columns: Array<Column<SpinTransaction>> = [
    {
      key: "when",
      header: "When",
      render: (row) => <span className="whitespace-nowrap">{formatDateTime(row.createdAt)}</span>,
    },
    {
      key: "reward",
      header: "Result",
      render: (row) => (
        <div className="min-w-0">
          <p className="font-medium text-ink">{row.rewardName}</p>
          <p className="text-[11px] capitalize text-muted">{row.rewardType.replace(/_/g, " ")}</p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      align: "right",
      render: (row) => (
        <Badge tone={row.status === "awarded" ? "emerald" : "muted"}>{row.status}</Badge>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Spin wheel"
        icon={Sparkles}
        title="Festival spin wheel"
        description="Every spin is decided by the server using a cryptographically secure weighted selection. This page only reveals the result — it can never choose your prize."
        crumbs={[
          { label: "Home", to: "/" },
          { label: "Dashboard", to: "/dashboard" },
          { label: "Spin wheel" },
        ]}
      />

      <ReadOnlyViewNotice action="Spinning the wheel" className="mt-5" />

      <ReferralLinkCard className="mt-5 lg:hidden" />

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Spins available"
          value={account.loading ? "—" : spinsLeft}
          hint="Ready to use now"
          icon={Sparkles}
          tone="gold"
        />
        <StatCard
          label="Wallet balance"
          value={wallet.loading ? "—" : formatINR(balancePaise)}
          hint={spinPricePaise > 0 ? `${formatINR(spinPricePaise)} per paid spin` : "Paid spins are off"}
          icon={Wallet}
          tone="emerald"
          to="/dashboard/add-money"
        />
        <StatCard label="Spins used" value={spinAccount?.totalUsed ?? 0} hint="All time" />
        <StatCard
          label="Free spins per day"
          value={spinConfig?.dailySpinLimit ?? "—"}
          hint={spinPricePaise > 0 ? `Paid spins: ${paidLimitLabel}` : "Resets each day"}
          tone="warning"
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {account.error || history.error ? (
            <ErrorState
              title="Your spin account could not be loaded"
              description={describeStoreError(account.error ?? history.error)}
              onRetry={() => {
                account.reload();
                history.reload();
              }}
            />
          ) : null}

          {!spinConfig?.enabled ? (
            <Alert tone="info" title="The spin wheel is paused">
              An administrator has temporarily paused the spin campaign. You keep every spin you have
              already earned.
            </Alert>
          ) : !campaignOpen ? (
            <Alert tone="info" title="The spin campaign is not running">
              The current spin campaign is outside its scheduled window. Check back later.
            </Alert>
          ) : null}

          {error ? (
            <Alert tone="danger" title="We could not complete that spin">
              {error}
            </Alert>
          ) : null}

          <Card>
            <CardBody className="flex flex-col items-center gap-5 py-7">
              <SpinWheel segments={activeSegments} resultSegmentId={revealSegment} spinning={spinning} />

              {result ? (
                <div className="w-full max-w-md rounded-2xl border border-gold/40 bg-gold-soft/30 p-4 text-center">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gold-deep">
                    You received
                  </p>
                  <p className="mt-1 font-display text-[22px] text-ink">{result.rewardName}</p>
                  {result.paidPaise > 0 ? (
                    <p className="mt-1 text-[12px] text-muted">
                      {formatINR(result.paidPaise)} paid from your wallet
                    </p>
                  ) : null}
                  {typeof result.walletCreditPaise === "number" && result.walletCreditPaise > 0 ? (
                    <p className="mt-1 text-[13px] font-semibold text-emerald">
                      {formatINR(result.walletCreditPaise)} credited to your wallet
                    </p>
                  ) : null}
                  {result.rewardExpiresAt ? (
                    <p className="mt-1 text-[12px] text-muted">
                      Valid until {formatDateTime(result.rewardExpiresAt)}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-center gap-2.5">
                {spinsLeft > 0 || spinPricePaise <= 0 ? (
                  <Button
                    size="lg"
                    variant="gold"
                    onClick={() => void doSpin(false)}
                    loading={spinning}
                    disabled={!canSpin}
                    iconLeft={<Sparkles className="size-4" aria-hidden />}
                  >
                    {spinning ? "Spinning…" : spinsLeft > 0 ? "Use a free spin" : "No spins available"}
                  </Button>
                ) : null}
                {spinPricePaise > 0 ? (
                  <Button
                    size="lg"
                    variant={spinsLeft > 0 ? "outline" : "gold"}
                    onClick={() => void doSpin(true)}
                    loading={spinning}
                    disabled={!canBuySpin}
                    iconLeft={<Wallet className="size-4" aria-hidden />}
                  >
                    {spinning ? "Spinning…" : `Spin for ${formatINR(spinPricePaise)}`}
                  </Button>
                ) : null}
              </div>

              {spinPricePaise > 0 && !wallet.loading && balancePaise < spinPricePaise ? (
                <p className="max-w-sm text-center text-[12px] leading-relaxed text-muted">
                  A paid spin costs {formatINR(spinPricePaise)} and your wallet has {formatINR(balancePaise)}.{" "}
                  <Link to="/dashboard/add-money" className="font-semibold text-brand hover:underline">
                    Add money
                  </Link>{" "}
                  to spin.
                </p>
              ) : null}

              {spinsLeft > 0 ? (
                <p className="text-[12px] text-muted">
                  You have <strong className="text-ink">{spinsLeft}</strong> free spin
                  {spinsLeft === 1 ? "" : "s"} available.
                </p>
              ) : (
                <p className="max-w-sm text-center text-[12px] leading-relaxed text-muted">
                  You have no free spins right now.{" "}
                  <Link to="/dashboard/referrals" className="font-semibold text-brand hover:underline">
                    Invite a friend
                  </Link>{" "}
                  to earn a free spin when they qualify.
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              icon={Gift}
              title="Your spin history"
              description="Every spin and its server-decided outcome."
              action={<Badge tone="neutral">{history.data?.length ?? 0} spins</Badge>}
            />
            <CardBody>
              {history.loading ? (
                <Skeleton className="h-32" rounded="lg" />
              ) : (
                <DataTable
                  columns={columns}
                  rows={history.data ?? []}
                  keyOf={(row) => row.id}
                  emptyTitle="No spins yet"
                  emptyDescription="Once you earn a spin from a qualified referral, use it here."
                />
              )}
            </CardBody>
          </Card>
        </div>

        <div className="side-panel space-y-4">
          <ReferralLinkCard className="hidden lg:block" />

          <Card>
            <CardHeader icon={Info} title="What can I win?" />
            <CardBody className="space-y-2.5">
              {rewards.loading ? (
                <Skeleton className="h-24" rounded="lg" />
              ) : (rewards.data ?? []).length ? (
                <ul className="space-y-2">
                  {(rewards.data ?? [])
                    .filter((r) => r.active && r.type !== "no_prize")
                    .slice(0, 6)
                    .map((reward) => {
                      const segment = segments.find((s) => s.rewardId === reward.id && s.active);
                      return (
                        <li key={reward.id} className="flex items-start gap-2.5 rounded-xl border border-line bg-ivory/50 p-2.5">
                          <span
                            className="mt-1 size-3 shrink-0 rounded-full"
                            style={{ backgroundColor: segment?.color ?? "#D4AF37" }}
                            aria-hidden
                          />
                          <div className="min-w-0">
                            <p className="text-[13px] font-semibold text-ink">{reward.name}</p>
                            <p className="text-[11.5px] leading-snug text-muted">{reward.description}</p>
                          </div>
                        </li>
                      );
                    })}
                </ul>
              ) : (
                <p className="text-[13px] text-muted">No rewards are configured right now.</p>
              )}
              <Button block variant="ghost" size="sm" onClick={() => setShowRewards(true)}>
                See all rewards &amp; terms
              </Button>
              <p className="text-[11px] leading-relaxed text-muted">
                Rewards are promotional coupons, gifts or other permitted benefits. No monetary return is
                guaranteed and no prize is promised in advance.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="How spins are earned" />
            <CardBody className="space-y-2 text-[12.5px] leading-relaxed text-muted">
              <p className="flex items-start gap-2">
                <Users className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                {spinConfig
                  ? `Refer a new participant and earn ${spinConfig.spinsPerReferral} spin${spinConfig.spinsPerReferral === 1 ? "" : "s"} once they qualify.`
                  : "Referral rewards have not been configured yet."}
              </p>
              <p className="flex items-start gap-2">
                <Wallet className="mt-0.5 size-4 shrink-0 text-emerald" aria-hidden />
                {QUALIFICATION_COPY[spinConfig?.referralQualification ?? "signup"]}
              </p>
              <p className="flex items-start gap-2">
                <Ticket className="mt-0.5 size-4 shrink-0 text-gold-deep" aria-hidden />
                Spin rewards never change the price of a ticket or the odds of a draw.
              </p>
            </CardBody>
          </Card>

          {rewardMap.size ? (
            <Card>
              <CardHeader title="Fair-use caps" />
              <CardBody className="space-y-1.5 text-[12.5px] text-muted">
                <p>Maximum spins held: {spinConfig?.maxSpinsPerUser ?? "—"}</p>
                <p>Free spins allowed per day: {spinConfig?.dailySpinLimit ?? "—"}</p>
                {spinPricePaise > 0 ? <p>Paid spins per day: {paidLimitLabel}</p> : null}
                <p>Maximum referrals rewarded: {spinConfig?.maxReferralsPerAccount ?? "—"}</p>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>

      <Dialog
        open={showRewards}
        onClose={() => setShowRewards(false)}
        title="Rewards and terms"
        description="Every reward that can appear on the wheel, with its remaining stock."
        size="lg"
      >
        {rewards.loading ? (
          <Skeleton className="h-40" rounded="lg" />
        ) : (rewards.data ?? []).length ? (
          <ul className="space-y-3">
            {(rewards.data ?? []).map((reward) => (
              <li key={reward.id} className="rounded-xl border border-line bg-ivory/50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-ink">{reward.name}</p>
                  <Badge tone={reward.active ? "emerald" : "muted"}>
                    {reward.active ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{reward.description}</p>
                <p className="mt-1.5 text-[11.5px] text-muted">
                  Type: {reward.type.replace(/_/g, " ")}
                  {reward.valuePaise ? ` · Value ${formatINR(reward.valuePaise)}` : ""}
                  {reward.validDays ? ` · Valid ${reward.validDays} days` : ""}
                  {reward.inventory > 0 ? ` · ${reward.remaining} of ${reward.inventory} remaining` : ""}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No rewards configured" description="An administrator has not set up any wheel rewards yet." />
        )}
      </Dialog>
    </>
  );
}
