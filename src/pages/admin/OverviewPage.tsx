import {
  Activity,
  BadgeIndianRupee,
  CalendarClock,
  ClipboardList,
  Coins,
  LayoutDashboard,
  ShieldAlert,
  Sparkles,
  Ticket as TicketIcon,
  TrendingUp,
  Trophy,
  Users,
  Wallet,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAsync } from "@/hooks/useAsync";
import { useAuth } from "@/app/AuthProvider";
import { useSiteSettings } from "@/app/SettingsProvider";
import { adminService } from "@/services/adminService";
import { drawService } from "@/services/drawService";
import { walletService } from "@/services/walletService";
import { describeStoreError } from "@/lib/backend";
import type { AdminAuditLog, DepositRequest } from "@/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  EmptyState,
  ErrorState,
  LoadErrors,
  Skeleton,
  SkeletonCard,
  StatCard,
  type Column,
} from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { DrawStatusBadge } from "@/features/draws/DrawMeta";
import { formatINR, formatINRCompact } from "@/utils/money";
import { formatDateTime, formatNumber, formatPercent } from "@/utils/format";
import { maskUtr } from "@/utils/mask";

export function AdminOverviewPage() {
  const { profile } = useAuth();
  const settings = useSiteSettings();

  const overview = useAsync(() => adminService.overview(), []);
  const recentDeposits = useAsync(() => walletService.allDeposits(undefined, 8), []);
  const draws = useAsync(() => drawService.listAll(8), []);
  const audits = useAsync(() => adminService.auditLogs(8), []);

  const data = overview.data;

  const depositColumns: Array<Column<DepositRequest>> = [
    {
      key: "when",
      header: "Submitted",
      render: (row) => <span className="whitespace-nowrap">{formatDateTime(row.submittedAt)}</span>,
    },
    {
      key: "customer",
      header: "Customer",
      render: (row) => (
        <div className="min-w-0">
          <p className="font-medium text-ink">{row.userDisplayName}</p>
          <p className="text-[11px] text-muted">{row.userPhoneMasked}</p>
        </div>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      render: (row) => <span className="font-semibold tabular-nums">{formatINR(row.amountPaise)}</span>,
    },
    {
      key: "utr",
      header: "UTR",
      hideBelow: "md",
      render: (row) => <span className="font-mono text-[12px]">{maskUtr(row.utr)}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <DepositStatusBadge status={row.status} />,
    },
  ];

  const auditColumns: Array<Column<AdminAuditLog>> = [
    {
      key: "when",
      header: "When",
      render: (row) => (
        <span className="whitespace-nowrap text-muted">{formatDateTime(row.createdAt)}</span>
      ),
    },
    {
      key: "action",
      header: "Action",
      render: (row) => (
        <div className="min-w-0">
          <p className="font-mono text-[12px] font-semibold text-ink">{row.action}</p>
          <p className="text-[11px] text-muted">
            {row.actorName} · {row.entity}/{row.entityId}
          </p>
        </div>
      ),
    },
    {
      key: "note",
      header: "Note",
      hideBelow: "md",
      render: (row) => <span className="text-muted">{row.note ?? "—"}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        icon={LayoutDashboard}
        title="Operations overview"
        description={`Signed in as ${profile?.fullName ?? "Administrator"}. Every figure below is derived from live records at read time — deposits, ticket sales and wallet liability are reported separately.`}
      />

      {!settings.allowPaidDraws ? (
        <Alert tone="warning" className="mt-4" title="Paid draws are disabled">
          {settings.legalDisclaimer} Ticket purchasing is blocked until you explicitly enable paid draws
          in{" "}
          <Link to="/admin/settings" className="font-semibold text-brand hover:underline">
            Settings
          </Link>
          .
        </Alert>
      ) : null}

      {overview.loading ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} lines={2} />
          ))}
        </div>
      ) : overview.error ? (
        <ErrorState
          className="mt-4"
          title="Overview figures could not be loaded"
          description={describeStoreError(overview.error)}
          onRetry={overview.reload}
        />
      ) : data ? (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Registered customers"
              value={formatNumber(data.customers)}
              hint="Excludes administrator accounts"
              icon={Users}
              tone="brand"
            />
            <StatCard
              label="Tickets sold"
              value={formatNumber(data.ticketsSold)}
              hint={`${formatNumber(data.ticketsAvailable)} still available`}
              icon={TicketIcon}
              tone="emerald"
            />
            <StatCard
              label="Ticket sales collected"
              value={formatINRCompact(data.ticketSalesPaise)}
              hint="Completed orders only — this is revenue"
              icon={TrendingUp}
              tone="gold"
            />
            <StatCard
              label="Wallet liability"
              value={formatINRCompact(data.walletLiabilityPaise)}
              hint="Spendable balance held on behalf of customers"
              icon={Wallet}
            />
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Pending deposits"
              value={formatNumber(data.pendingDeposits.count)}
              hint={`${formatINR(data.pendingDeposits.amountPaise)} awaiting review`}
              icon={BadgeIndianRupee}
              tone={data.pendingDeposits.count ? "warning" : "default"}
            />
            <StatCard
              label="Active draws"
              value={formatNumber(data.activeDraws)}
              hint={`${formatNumber(data.totalDraws)} configured in total`}
              icon={Coins}
            />
            <StatCard
              label="Referral spins granted"
              value={formatNumber(data.referralActivity.spinsGranted)}
              hint={`${formatNumber(data.referralActivity.qualified)} qualified · ${formatNumber(
                data.referralActivity.pending,
              )} pending`}
              icon={Sparkles}
              tone="gold"
            />
            <StatCard
              label="Published winners"
              value={formatNumber(data.recentWinners)}
              hint="Only results that were separately published"
              icon={Trophy}
              tone="emerald"
            />
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <StatCard
              label="Approved deposits"
              value={formatINRCompact(data.approvedDeposits.amountPaise)}
              hint={`${formatNumber(data.approvedDeposits.count)} verified requests — deposits, not revenue`}
              icon={BadgeIndianRupee}
              tone="emerald"
            />
            <StatCard
              label="Rejected deposits"
              value={formatINRCompact(data.rejectedDeposits.amountPaise)}
              hint={`${formatNumber(data.rejectedDeposits.count)} requests declined with a reason`}
              icon={ShieldAlert}
              tone="warning"
            />
          </div>
        </>
      ) : null}

      <LoadErrors className="mt-4" sources={[recentDeposits, draws, audits]} />

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader
            icon={BadgeIndianRupee}
            title="Latest deposit submissions"
            description="Nothing is credited automatically — each request is verified against banking records."
            action={
              <Link to="/admin/deposits">
                <Button variant="ghost" size="sm">
                  Review all
                </Button>
              </Link>
            }
          />
          <CardBody>
            {recentDeposits.loading ? (
              <Skeleton className="h-52" rounded="lg" />
            ) : (
              <DataTable
                columns={depositColumns}
                rows={recentDeposits.data ?? []}
                keyOf={(row) => row.id}
                emptyTitle="No deposit requests yet"
                emptyDescription="Deposit requests submitted from the Add Money screen appear here."
              />
            )}
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader
              icon={Coins}
              title="Draws"
              description="Schedules and prize tiers as configured."
              action={
                <Link to="/admin/draws">
                  <Button variant="ghost" size="sm">
                    Manage
                  </Button>
                </Link>
              }
            />
            <CardBody>
              {draws.loading ? (
                <SkeletonCard lines={3} />
              ) : (draws.data ?? []).length ? (
                <ul className="space-y-2.5">
                  {(draws.data ?? []).slice(0, 5).map((draw) => (
                    <li
                      key={draw.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-ivory/50 p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-display text-[14px] text-ink">{draw.title}</p>
                        <p className="text-[11.5px] text-muted">
                          {formatDateTime(draw.drawAt)}
                          {draw.published ? "" : " · unpublished"}
                        </p>
                      </div>
                      <DrawStatusBadge status={draw.status} />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  title="No draws configured"
                  description="Create a draw before publishing ticket sales."
                  action={
                    <Link to="/admin/draws">
                      <Button>Create a draw</Button>
                    </Link>
                  }
                />
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              icon={Activity}
              title="Ticket inventory"
              description="Availability across every configured draw."
            />
            <CardBody className="space-y-3">
              {data ? (
                <>
                  <dl className="grid grid-cols-2 gap-2.5">
                    <div className="rounded-xl border border-line bg-emerald-soft/50 p-3">
                      <dd className="font-display text-[20px] font-bold tabular-nums text-emerald">
                        {formatNumber(data.ticketsAvailable)}
                      </dd>
                      <dt className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">
                        Available
                      </dt>
                    </div>
                    <div className="rounded-xl border border-line bg-status-booked-bg/60 p-3">
                      <dd className="font-display text-[20px] font-bold tabular-nums text-status-booked">
                        {formatNumber(data.ticketsSold)}
                      </dd>
                      <dt className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">
                        Booked
                      </dt>
                    </div>
                  </dl>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[12.5px]">
                      <span className="text-muted">Inventory sold</span>
                      <span className="font-semibold tabular-nums text-ink">
                        {formatPercent(
                          data.ticketsSold + data.ticketsAvailable > 0
                            ? data.ticketsSold / (data.ticketsSold + data.ticketsAvailable)
                            : 0,
                        )}
                      </span>
                    </div>
                  </div>
                  <Link to="/admin/inventory">
                    <Button block variant="outline" size="sm">
                      Inspect inventory
                    </Button>
                  </Link>
                </>
              ) : overview.error ? (
                <p className="py-4 text-center text-[13px] text-muted">Inventory totals are unavailable.</p>
              ) : (
                <Skeleton className="h-24" rounded="lg" />
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <Card className="mt-4">
        <CardHeader
          icon={ClipboardList}
          title="Recent administrative actions"
          description="Privileged operations are appended to an immutable audit log."
          action={
            <Link to="/admin/audit">
              <Button variant="ghost" size="sm">
                Full audit log
              </Button>
            </Link>
          }
        />
        <CardBody>
          {audits.loading ? (
            <Skeleton className="h-40" rounded="lg" />
          ) : (
            <DataTable
              columns={auditColumns}
              rows={audits.data ?? []}
              keyOf={(row) => row.id}
              emptyTitle="No administrative actions recorded"
              emptyDescription="Approving a deposit, running a draw or changing settings is recorded here."
            />
          )}
        </CardBody>
      </Card>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-[12px] text-muted">
          <CalendarClock className="size-3.5" aria-hidden />
          Overview regenerated {formatDateTime(new Date().toISOString())}.
        </p>
        <div className="flex items-center gap-2">
          <Badge tone="neutral">Read-only summary</Badge>
        </div>
      </div>
    </>
  );
}

function DepositStatusBadge({ status }: { status: DepositRequest["status"] }) {
  const map: Record<
    DepositRequest["status"],
    { tone: "warning" | "emerald" | "danger" | "neutral"; label: string }
  > = {
    pending: { tone: "warning", label: "Pending" },
    requires_review: { tone: "warning", label: "Review" },
    approved: { tone: "emerald", label: "Approved" },
    rejected: { tone: "danger", label: "Rejected" },
  };
  const meta = map[status];
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}
