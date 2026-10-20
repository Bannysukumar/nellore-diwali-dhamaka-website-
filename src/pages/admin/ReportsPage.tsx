import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BadgeIndianRupee, BarChart3, Coins, Download, TrendingUp, Wallet } from "lucide-react";
import { useAsync } from "@/hooks/useAsync";
import { adminService } from "@/services/adminService";
import { walletService } from "@/services/walletService";
import { ticketService } from "@/services/ticketService";
import { drawService } from "@/services/drawService";
import type { Draw, Order, WalletTransaction } from "@/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  LoadErrors,
  Segmented,
  Skeleton,
  StatCard,
} from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatINR, formatINRCompact } from "@/utils/money";
import { formatDate, formatNumber } from "@/utils/format";

const PALETTE = ["#9F2028", "#D4AF37", "#F28C28", "#177245", "#651B24"];
const REPORT_ROW_LIMIT = 1000;

export function AdminReportsPage() {
  const [range, setRange] = useState<"7" | "30" | "90">("30");

  const overview = useAsync(() => adminService.overview(), []);
  const orders = useAsync(() => ticketService.allOrders(REPORT_ROW_LIMIT), []);
  const ledger = useAsync(() => walletService.allTransactions(REPORT_ROW_LIMIT), []);
  const draws = useAsync(() => drawService.listAll(200), []);

  const drawById = useMemo(() => {
    const map = new Map<string, Draw>();
    (draws.data ?? []).forEach((d) => map.set(d.id, d));
    return map;
  }, [draws.data]);

  const days = Number(range);

  /** Daily ticket revenue over the selected window — derived from real orders only. */
  const revenueSeries = useMemo(() => buildDailySeries(orders.data ?? [], days), [orders.data, days]);
  /** Daily wallet movement over the selected window. */
  const ledgerSeries = useMemo(() => buildLedgerSeries(ledger.data ?? [], days), [ledger.data, days]);

  /** Revenue by draw. */
  const byDraw = useMemo(() => {
    const totals = new Map<string, number>();
    (orders.data ?? [])
      .filter((o) => o.status === "completed")
      .forEach((o) => totals.set(o.drawId, (totals.get(o.drawId) ?? 0) + o.totalPaise));
    return Array.from(totals.entries())
      .map(([drawId, paise]) => ({
        name: drawById.get(drawId)?.title ?? "Unknown draw",
        paise,
      }))
      .sort((a, b) => b.paise - a.paise)
      .slice(0, 8);
  }, [orders.data, drawById]);

  /** Composition of wallet credits by category. */
  const creditMix = useMemo(() => {
    const groups: Record<string, number> = { deposit: 0, refund: 0, reward_credit: 0, adjustment: 0 };
    (ledger.data ?? [])
      .filter((t) => t.direction === "credit")
      .forEach((t) => {
        groups[t.type] = (groups[t.type] ?? 0) + t.amountPaise;
      });
    return Object.entries(groups)
      .filter(([, value]) => value > 0)
      .map(([name, value]) => ({ name: LABELS[name] ?? name, value }));
  }, [ledger.data]);

  const exportCsv = () => {
    // A transparent export of the figures currently on screen. Nothing is
    // invented — every row is derived from database reads.
    const lines: string[] = [];
    lines.push("Nellore Diwali Dhamaka — operational report");
    lines.push(`Generated,${new Date().toISOString()}`);
    lines.push(`Window,last ${days} days`);
    lines.push("");
    lines.push("Metric,Value (paise)");
    const data = overview.data;
    if (!data) return;
    lines.push(`Wallet liability,${data.walletLiabilityPaise}`);
    lines.push(`Ticket sales collected,${data.ticketSalesPaise}`);
    lines.push(`Approved deposits,${data.approvedDeposits.amountPaise}`);
    lines.push(`Rejected deposits,${data.rejectedDeposits.amountPaise}`);
    lines.push("");
    lines.push("Date,Orders,Ticket revenue (paise),Wallet credits (paise),Wallet debits (paise)");
    revenueSeries.forEach((row, index) => {
      const moved = ledgerSeries[index];
      lines.push(
        [row.iso, row.orders, row.paise, moved?.credits ?? 0, moved?.debits ?? 0].join(","),
      );
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ndd-report-${range}d-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const loading = orders.loading || ledger.loading || overview.loading;
  const exportable = !loading && !overview.error && !orders.error && !ledger.error;
  const truncated =
    (orders.data?.length ?? 0) >= REPORT_ROW_LIMIT || (ledger.data?.length ?? 0) >= REPORT_ROW_LIMIT;

  return (
    <>
      <PageHeader
        eyebrow="Money"
        icon={BarChart3}
        title="Reports"
        description="Operational figures derived from the database at read time. Wallet deposits are reported separately from ticket revenue — only completed ticket orders count as revenue."
        actions={
          <Button
            variant="outline"
            onClick={exportCsv}
            disabled={!exportable}
            iconLeft={<Download className="size-4" aria-hidden />}
          >
            Export CSV
          </Button>
        }
      />

      <LoadErrors className="mt-5" sources={[overview, orders, ledger, draws]} />
      {truncated ? (
        <Alert tone="warning" className="mt-4" title="Charts cover the most recent records only">
          Daily charts and the by-draw breakdown use the latest {formatNumber(REPORT_ROW_LIMIT)} orders and
          ledger entries. The headline totals above the charts are full server-side aggregates.
        </Alert>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          options={[
            { value: "7", label: "Last 7 days" },
            { value: "30", label: "Last 30 days" },
            { value: "90", label: "Last 90 days" },
          ]}
          value={range}
          onChange={setRange}
          ariaLabel="Select reporting window"
        />
        <div className="flex items-center gap-2">
          <Badge tone="neutral">{formatNumber(orders.data?.length)} orders loaded</Badge>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Ticket sales collected"
          value={formatINRCompact(overview.data?.ticketSalesPaise)}
          hint="Completed orders only — revenue"
          icon={TrendingUp}
          tone="gold"
        />
        <StatCard
          label="Wallet liability"
          value={formatINRCompact(overview.data?.walletLiabilityPaise)}
          hint="Spendable balance held for customers"
          icon={Wallet}
        />
        <StatCard
          label="Approved deposits"
          value={formatINRCompact(overview.data?.approvedDeposits.amountPaise)}
          hint={`${formatNumber(overview.data?.approvedDeposits.count)} verified requests`}
          icon={BadgeIndianRupee}
          tone="emerald"
        />
        <StatCard
          label="Tickets sold"
          value={formatNumber(overview.data?.ticketsSold)}
          hint={`${formatNumber(overview.data?.ticketsAvailable)} still available`}
          icon={Coins}
          tone="brand"
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            icon={TrendingUp}
            title="Daily ticket revenue"
            description={`Completed orders over the last ${days} days.`}
          />
          <CardBody>
            {loading ? (
              <Skeleton className="h-64" rounded="lg" />
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#D4AF37" stopOpacity={0.55} />
                        <stop offset="100%" stopColor="#D4AF37" stopOpacity={0.04} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E8E0D0" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: "#6B706D" }}
                      tickLine={false}
                      axisLine={{ stroke: "#E8E0D0" }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#6B706D" }}
                      tickLine={false}
                      axisLine={false}
                      width={56}
                      tickFormatter={(value: number) => formatINRCompact(value)}
                    />
                    <Tooltip
                      formatter={(value: number) => [formatINR(value), "Revenue"]}
                      labelStyle={{ color: "#202522", fontSize: 12 }}
                      contentStyle={{
                        borderRadius: 12,
                        border: "1px solid #E8E0D0",
                        fontSize: 12,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="paise"
                      stroke="#9F2028"
                      strokeWidth={2}
                      fill="url(#revenueFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            icon={Wallet}
            title="Wallet movement"
            description="Credits and debits posted to the ledger each day."
          />
          <CardBody>
            {loading ? (
              <Skeleton className="h-64" rounded="lg" />
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ledgerSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E8E0D0" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: "#6B706D" }}
                      tickLine={false}
                      axisLine={{ stroke: "#E8E0D0" }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#6B706D" }}
                      tickLine={false}
                      axisLine={false}
                      width={56}
                      tickFormatter={(value: number) => formatINRCompact(value)}
                    />
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        formatINR(value),
                        name === "credits" ? "Credits" : "Debits",
                      ]}
                      labelStyle={{ color: "#202522", fontSize: 12 }}
                      contentStyle={{
                        borderRadius: 12,
                        border: "1px solid #E8E0D0",
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="credits" fill="#177245" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="debits" fill="#9F2028" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader icon={BarChart3} title="Revenue by draw" description="Top draws by completed ticket sales." />
          <CardBody>
            {loading ? (
              <Skeleton className="h-56" rounded="lg" />
            ) : byDraw.length ? (
              <ul className="space-y-3">
                {byDraw.map((row, index) => {
                  const max = byDraw[0]?.paise || 1;
                  return (
                    <li key={row.name}>
                      <div className="flex items-center justify-between gap-3 text-[13px]">
                        <span className="truncate text-ink">{row.name}</span>
                        <span className="font-semibold tabular-nums text-muted">
                          {formatINR(row.paise)}
                        </span>
                      </div>
                      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-line/70">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.max(4, (row.paise / max) * 100)}%`,
                            backgroundColor: PALETTE[index % PALETTE.length],
                          }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="py-8 text-center text-[13px] text-muted">
                No completed ticket sales yet.
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader icon={Coins} title="Wallet credit mix" description="Where added balance came from." />
          <CardBody>
            {loading ? (
              <Skeleton className="h-56" rounded="lg" />
            ) : creditMix.length ? (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={creditMix}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={48}
                      outerRadius={80}
                      paddingAngle={2}
                    >
                      {creditMix.map((entry, index) => (
                        <Cell key={entry.name} fill={PALETTE[index % PALETTE.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => formatINR(value)}
                      contentStyle={{
                        borderRadius: 12,
                        border: "1px solid #E8E0D0",
                        fontSize: 12,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="py-8 text-center text-[13px] text-muted">No wallet credits recorded yet.</p>
            )}
            {creditMix.length ? (
              <ul className="mt-3 space-y-1.5">
                {creditMix.map((entry, index) => (
                  <li key={entry.name} className="flex items-center justify-between gap-3 text-[12.5px]">
                    <span className="flex items-center gap-2 text-muted">
                      <span
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: PALETTE[index % PALETTE.length] }}
                      />
                      {entry.name}
                    </span>
                    <span className="font-semibold tabular-nums text-ink">{formatINR(entry.value)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </CardBody>
        </Card>
      </div>

      <Alert tone="info" className="mt-4" title="How to read these figures">
        Deposits are a liability: money you hold on behalf of customers. Ticket sales are revenue. Wallet
        liability is the portion of deposits not yet spent. Reconcile the approved-deposit total against your
        bank statement before treating any figure as settled.
      </Alert>
    </>
  );
}

const LABELS: Record<string, string> = {
  deposit: "Deposits",
  refund: "Refunds",
  reward_credit: "Reward credits",
  adjustment: "Adjustments",
};

function buildDailySeries(orders: Order[], days: number) {
  const buckets = makeBuckets(days);
  orders
    .filter((o) => o.status === "completed")
    .forEach((order) => {
      const iso = order.createdAt.slice(0, 10);
      const bucket = buckets.get(iso);
      if (bucket) {
        bucket.paise += order.totalPaise;
        bucket.orders += 1;
      }
    });
  return Array.from(buckets.values()).map((b) => ({
    iso: b.iso,
    label: formatDate(b.iso),
    paise: b.paise,
    orders: b.orders,
  }));
}

function buildLedgerSeries(entries: WalletTransaction[], days: number) {
  const buckets = makeBuckets(days);
  entries.forEach((entry) => {
    const iso = entry.createdAt.slice(0, 10);
    const bucket = buckets.get(iso);
    if (!bucket) return;
    if (entry.direction === "credit") bucket.credits += entry.amountPaise;
    else bucket.debits += entry.amountPaise;
  });
  return Array.from(buckets.values()).map((b) => ({
    iso: b.iso,
    label: formatDate(b.iso),
    credits: b.credits,
    debits: b.debits,
  }));
}

function makeBuckets(days: number) {
  const map = new Map<
    string,
    { iso: string; paise: number; orders: number; credits: number; debits: number }
  >();
  const today = new Date();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    map.set(iso, { iso, paise: 0, orders: 0, credits: 0, debits: 0 });
  }
  return map;
}
