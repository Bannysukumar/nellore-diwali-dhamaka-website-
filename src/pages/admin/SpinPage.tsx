import { useMemo, useState } from "react";
import { Activity, Coins, Dices, Gauge, Sparkles, Ticket as TicketIcon, Trophy } from "lucide-react";
import { useAsync } from "@/hooks/useAsync";
import { rewardService } from "@/services/rewardService";
import { userService } from "@/services/userService";
import type { RewardType, SpinTransaction, UserProfile, WheelSegment } from "@/types";
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  Input,
  LoadErrors,
  ProgressBar,
  Segmented,
  Skeleton,
  StatCard,
  type Column,
} from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatDateTime, formatNumber, formatPercent } from "@/utils/format";
import { formatINR } from "@/utils/money";

const REWARD_TONE: Record<RewardType, "gold" | "brand" | "emerald" | "warning" | "muted"> = {
  coupon: "gold",
  gift: "brand",
  wallet_credit: "emerald",
  free_ticket: "brand",
  no_prize: "muted",
};

export function AdminSpinPage() {
  const [filter, setFilter] = useState<"all" | "awarded" | "reversed">("all");
  const [couponQuery, setCouponQuery] = useState("");

  const config = useAsync(() => rewardService.spinConfig(), []);
  const transactions = useAsync(() => rewardService.allSpinTransactions(400), []);
  const rewards = useAsync(() => rewardService.rewards(), []);
  const heldSpins = useAsync(() => rewardService.totalAvailableSpins(), []);
  const profiles = useAsync(
    () => userService.allProfilesByUids((transactions.data ?? []).map((t) => t.uid)),
    [transactions.data],
  );

  const profileById = profiles.data ?? {};

  const filtered = useMemo(() => {
    const all = transactions.data ?? [];
    const byStatus = filter === "all" ? all : all.filter((t) => t.status === filter);
    const query = couponQuery.trim().toUpperCase();
    return query ? byStatus.filter((t) => t.couponId?.includes(query)) : byStatus;
  }, [transactions.data, filter, couponQuery]);

  const stats = useMemo(() => {
    const all = transactions.data;
    if (!all) return { spins: null, reversed: null, walletCredits: null, availableSpins: heldSpins.data };
    const awarded = all.filter((t) => t.status === "awarded");
    return {
      spins: awarded.length,
      reversed: all.filter((t) => t.status === "reversed").length,
      walletCredits: awarded.filter((t) => t.rewardType === "wallet_credit").length,
      availableSpins: heldSpins.data,
    };
  }, [transactions.data, heldSpins.data]);

  const rewardById = useMemo(() => {
    const map = new Map<string, { name: string; remaining: number; inventory: number }>();
    (rewards.data ?? []).forEach((r) => map.set(r.id, { name: r.name, remaining: r.remaining, inventory: r.inventory }));
    return map;
  }, [rewards.data]);

  const segments: WheelSegment[] = useMemo(
    () => (config.data?.segments ?? []).filter((s) => s.active),
    [config.data],
  );

  const totalWeight = segments.reduce((sum, s) => sum + s.weight, 0);

  const columns: Array<Column<SpinTransaction>> = [
    {
      key: "when",
      header: "When",
      render: (row) => (
        <span className="whitespace-nowrap text-muted">{formatDateTime(row.createdAt)}</span>
      ),
    },
    {
      key: "account",
      header: "Account",
      render: (row) => {
        const user: UserProfile | undefined = profileById[row.uid];
        return (
          <div className="min-w-0">
            <p className="truncate font-medium text-ink">{user?.fullName ?? "Unknown account"}</p>
            <p className="text-[11px] text-muted">{user?.phoneMasked ?? row.uid.slice(0, 10)}</p>
          </div>
        );
      },
    },
    {
      key: "reward",
      header: "Reward",
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-ink">{row.rewardName}</p>
          <Badge tone={REWARD_TONE[row.rewardType]}>{row.rewardType.replace(/_/g, " ")}</Badge>
          {row.couponId ? (
            <p className="mt-0.5 font-mono text-[11px] font-semibold tracking-[0.06em] text-brand">{row.couponId}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: "request",
      header: "Request id",
      hideBelow: "lg",
      render: (row) => <span className="font-mono text-[11px] text-muted">{row.requestId}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <Badge tone={row.status === "awarded" ? "emerald" : "danger"}>{row.status}</Badge>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Draws & prizes"
        icon={Sparkles}
        title="Spin activity"
        description="Every spin is decided server-side from the customer's own securely shuffled prize pack, built from the wheel weights. This page shows the outcomes and the current wheel configuration — it cannot force a result."
      />

      <LoadErrors className="mt-5" sources={[config, transactions, rewards, heldSpins, profiles]} />

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Successful spins"
          value={formatNumber(stats.spins)}
          hint="Within the most recent 400 spins"
          icon={Dices}
          tone="brand"
        />
        <StatCard
          label="Spins outstanding"
          value={formatNumber(stats.availableSpins)}
          hint="Earned but not yet used across all accounts"
          icon={TicketIcon}
          tone="gold"
        />
        <StatCard
          label="Wallet credits awarded"
          value={formatNumber(stats.walletCredits)}
          hint="Rewards that credited the wallet ledger"
          icon={Coins}
          tone="emerald"
        />
        <StatCard
          label="Reversed spins"
          value={formatNumber(stats.reversed)}
          hint="Withdrawn after an abuse or error review"
          icon={Activity}
          tone={stats.reversed ? "warning" : "default"}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1.1fr]">
        <Card>
          <CardHeader
            icon={Gauge}
            title="Campaign limits"
            description="Streamed from the `siteSettings/spin` document."
          />
          <CardBody className="space-y-3">
            {config.loading ? (
              <Skeleton className="h-48" rounded="lg" />
            ) : config.data ? (
              <>
                <div className="flex items-center gap-2">
                  <Badge tone={config.data.enabled ? "emerald" : "muted"}>
                    {config.data.enabled ? "Wheel enabled" : "Wheel disabled"}
                  </Badge>
                </div>
                <dl className="grid gap-2 text-[13px]">
                  <Line label="Spins per qualified referral" value={String(config.data.spinsPerReferral)} />
                  <Line label="Maximum spins per account" value={String(config.data.maxSpinsPerUser)} />
                  <Line label="Free spins per day" value={String(config.data.dailySpinLimit)} />
                  <Line
                    label="Price per paid spin"
                    value={config.data.spinPricePaise ? formatINR(config.data.spinPricePaise) : "Off (earned spins only)"}
                  />
                  {config.data.spinPricePaise ? (
                    <Line
                      label="Paid spins per day"
                      value={config.data.dailyPaidSpinLimit ? String(config.data.dailyPaidSpinLimit) : "Unlimited"}
                    />
                  ) : null}
                  <Line label="Maximum referral rewards" value={String(config.data.maxRewardsPerReferrer)} />
                  <Line label="Reward validity" value={`${config.data.rewardValidDays} days`} />
                  <Line label="Minimum age" value={`${config.data.minAge}+`} />
                  <Line
                    label="Campaign window"
                    value={
                      config.data.campaignStart || config.data.campaignEnd
                        ? `${formatDateTime(config.data.campaignStart)} → ${formatDateTime(config.data.campaignEnd)}`
                        : "Always on"
                    }
                  />
                </dl>
                <p className="text-[12px] leading-relaxed text-muted">
                  Change these limits on the Rewards page. Spins are only ever awarded for a qualifying
                  referral or a permitted promotional action.
                </p>
              </>
            ) : (
              <p className="py-6 text-center text-[13px] text-muted">No spin configuration found.</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            icon={Dices}
            title="Active wheel segments"
            description={`${segments.length} segment(s) · weights total ${formatNumber(totalWeight)}`}
          />
          <CardBody>
            {config.loading ? (
              <Skeleton className="h-48" rounded="lg" />
            ) : segments.length ? (
              <ul className="space-y-2.5">
                {segments.map((segment) => {
                  const share = totalWeight ? segment.weight / totalWeight : 0;
                  const reward = rewardById.get(segment.rewardId);
                  return (
                    <li key={segment.id} className="rounded-xl border border-line bg-ivory/50 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <span
                            className="size-3.5 shrink-0 rounded-full border border-line"
                            style={{ backgroundColor: segment.color }}
                          />
                          <span className="text-[13px] font-semibold text-ink">{segment.label}</span>
                        </div>
                        <span className="text-[12px] font-semibold tabular-nums text-muted">
                          {formatPercent(share, 1)}
                        </span>
                      </div>
                      <div className="mt-2">
                        <ProgressBar value={share * 100} tone="gold" />
                      </div>
                      <p className="mt-1.5 text-[11.5px] text-muted">
                        weight {segment.weight}
                        {reward ? ` · ${reward.name}` : " · reward missing"}
                      </p>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="py-6 text-center text-[13px] text-muted">No active segments configured.</p>
            )}
          </CardBody>
        </Card>
      </div>

      <Alert tone="info" className="mt-4" title="No monetary return is promised">
        Spin rewards are promotional coupons, gifts or permitted benefits. The wheel never promises a prize in
        advance and outcomes are recorded with an idempotency key so a retry cannot award twice.
      </Alert>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          options={[
            { value: "all", label: "All spins" },
            { value: "awarded", label: "Awarded" },
            { value: "reversed", label: "Reversed" },
          ]}
          value={filter}
          onChange={setFilter}
          ariaLabel="Filter spin outcomes"
        />
        <div className="flex flex-wrap items-center gap-3">
          <Input
            aria-label="Find a coupon by its id"
            value={couponQuery}
            onChange={(event) => setCouponQuery(event.target.value)}
            placeholder="Find coupon id, e.g. CPN-7KQ2M9"
            className="w-64"
          />
          <p className="text-[12px] text-muted">{formatNumber(filtered.length)} entries</p>
        </div>
      </div>

      <Card className="mt-4">
        <CardHeader icon={Trophy} title="Spin log" description="Newest first, immutable." />
        <CardBody>
          {transactions.loading ? (
            <Skeleton className="h-72" rounded="lg" />
          ) : (
            <DataTable
              columns={columns}
              rows={filtered}
              keyOf={(row) => row.id}
              caption="Spin transactions"
              emptyTitle="No spins recorded"
              emptyDescription="Spin outcomes appear here as customers use their earned spins."
            />
          )}
        </CardBody>
      </Card>
    </>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-ivory/50 px-3 py-2">
      <dt className="text-muted">{label}</dt>
      <dd className="truncate text-right font-medium text-ink">{value}</dd>
    </div>
  );
}
