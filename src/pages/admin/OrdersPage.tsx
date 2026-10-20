import { useMemo, useState, type ReactNode } from "react";
import { ClipboardList, Receipt, Search, TrendingUp, Users } from "lucide-react";
import { useAsync } from "@/hooks/useAsync";
import { ticketService } from "@/services/ticketService";
import { drawService } from "@/services/drawService";
import { userService } from "@/services/userService";
import { useDebounced } from "@/hooks/useCollection";
import type { Draw, Order, UserProfile } from "@/types";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  Dialog,
  EmptyState,
  Input,
  LoadErrors,
  Segmented,
  Skeleton,
  StatCard,
  type Column,
} from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatINR, formatINRCompact } from "@/utils/money";
import { formatDateTime, formatNumber } from "@/utils/format";

export function AdminOrdersPage() {
  const [filter, setFilter] = useState<"all" | "completed" | "refunded">("all");
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search, 300).trim().toLowerCase();
  const [selected, setSelected] = useState<Order | null>(null);

  const orders = useAsync(
    () => ticketService.allOrders(500, filter === "all" ? undefined : filter),
    [filter],
  );
  const draws = useAsync(() => drawService.listAll(200), []);
  const profiles = useAsync(
    () => userService.allProfilesByUids((orders.data ?? []).map((o) => o.uid)),
    [orders.data],
  );

  const drawById = useMemo(() => {
    const map = new Map<string, Draw>();
    (draws.data ?? []).forEach((d) => map.set(d.id, d));
    return map;
  }, [draws.data]);

  const profileById = useMemo(() => profiles.data ?? {}, [profiles.data]);

  const filtered = useMemo(() => {
    let rows = orders.data ?? [];
    if (debounced) {
      rows = rows.filter((o) => {
        const buyer = profileById[o.uid];
        return (
          o.id.toLowerCase().includes(debounced) ||
          o.ticketNumbers.some((n) => String(n).includes(debounced)) ||
          (buyer?.fullName.toLowerCase().includes(debounced) ?? false) ||
          (buyer?.phoneMasked.toLowerCase().includes(debounced) ?? false)
        );
      });
    }
    return rows;
  }, [orders.data, debounced, profileById]);

  const aggregates = useAsync(
    () => Promise.all([ticketService.orderTotals("completed"), ticketService.orderTotals("refunded")]),
    [],
  );
  const [completedTotals, refundedTotals] = aggregates.data ?? [];
  const totals = {
    completed: completedTotals?.count,
    refunded: refundedTotals?.count,
    revenuePaise: completedTotals?.totalPaise,
    ticketsSold: completedTotals?.quantity,
  };

  const columns: Array<Column<Order>> = [
    {
      key: "order",
      header: "Order",
      render: (row) => (
        <div className="min-w-0">
          <p className="font-mono text-[12px] font-semibold text-ink">{shortId(row.id)}</p>
          <p className="text-[11px] text-muted">{formatDateTime(row.createdAt)}</p>
        </div>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      render: (row) => {
        const buyer: UserProfile | undefined = profileById[row.uid];
        return (
          <div className="min-w-0">
            <p className="truncate font-medium text-ink">{buyer?.fullName ?? "Unknown account"}</p>
            <p className="text-[11px] text-muted">{buyer?.phoneMasked ?? maskUid(row.uid)}</p>
          </div>
        );
      },
    },
    {
      key: "draw",
      header: "Draw",
      hideBelow: "md",
      render: (row) => (
        <span className="text-[12.5px] text-ink">{drawById.get(row.drawId)?.title ?? "—"}</span>
      ),
    },
    {
      key: "tickets",
      header: "Tickets",
      hideBelow: "sm",
      render: (row) => (
        <span className="tabular-nums text-muted">
          {row.quantity} · #{row.ticketNumbers.slice(0, 3).join(", #")}
          {row.ticketNumbers.length > 3 ? "…" : ""}
        </span>
      ),
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      render: (row) => <span className="font-semibold tabular-nums">{formatINR(row.totalPaise)}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <Badge tone={row.status === "completed" ? "emerald" : row.status === "refunded" ? "warning" : "danger"}>
          {row.status}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (row) => (
        <Button size="sm" variant="ghost" onClick={() => setSelected(row)}>
          Details
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        icon={ClipboardList}
        title="Ticket orders"
        description="Every completed purchase, with the exact numbers reserved to the buying account. Prices here are the authoritative draw prices, not package marketing figures."
      />

      <LoadErrors className="mt-5" sources={[orders, draws, profiles, aggregates]} />

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Completed orders" value={formatNumber(totals.completed)} icon={Receipt} tone="emerald" />
        <StatCard
          label="Tickets sold"
          value={formatNumber(totals.ticketsSold)}
          hint="Sum of ordered quantities"
          icon={ClipboardList}
          tone="brand"
        />
        <StatCard
          label="Ticket revenue"
          value={formatINRCompact(totals.revenuePaise)}
          hint="Completed orders only"
          icon={TrendingUp}
          tone="gold"
        />
        <StatCard
          label="Refunded orders"
          value={formatNumber(totals.refunded)}
          hint="Returned to customer wallets as ledger credits"
          icon={Users}
          tone={totals.refunded ? "warning" : "default"}
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          options={[
            { value: "all", label: "All" },
            { value: "completed", label: "Completed" },
            { value: "refunded", label: "Refunded" },
          ]}
          value={filter}
          onChange={setFilter}
          ariaLabel="Filter orders"
        />
        <div className="relative w-full sm:w-72">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search order, buyer or ticket number"
            className="pl-9"
            aria-label="Search orders"
          />
        </div>
      </div>

      <Card className="mt-4">
        <CardHeader icon={Receipt} title="Orders" description="Newest first." />
        <CardBody>
          {orders.loading ? (
            <Skeleton className="h-72" rounded="lg" />
          ) : (
            <DataTable
              columns={columns}
              rows={filtered}
              keyOf={(row) => row.id}
              caption="Ticket orders"
              emptyTitle={debounced ? "No orders match that search" : "No orders yet"}
              emptyDescription={
                debounced
                  ? "Try a different order id, buyer name or ticket number."
                  : "Ticket purchases appear here as soon as they complete."
              }
              emptyAction={
                debounced ? (
                  <Button variant="outline" onClick={() => setSearch("")}>
                    Clear search
                  </Button>
                ) : undefined
              }
            />
          )}
        </CardBody>
      </Card>

      <Dialog
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        size="lg"
        title="Order detail"
        description="A read-only record of the purchase exactly as it was written."
      >
        {selected ? (
          <div className="space-y-4">
            <dl className="grid gap-2 sm:grid-cols-2">
              <Row label="Order id" value={<span className="font-mono text-[12px]">{selected.id}</span>} />
              <Row
                label="Status"
                value={
                  <Badge tone={selected.status === "completed" ? "emerald" : "warning"}>
                    {selected.status}
                  </Badge>
                }
              />
              <Row label="Created" value={formatDateTime(selected.createdAt)} />
              <Row label="Draw" value={drawById.get(selected.drawId)?.title ?? "—"} />
              <Row
                label="Buyer"
                value={profileById[selected.uid]?.fullName ?? maskUid(selected.uid)}
              />
              <Row label="Buyer phone" value={profileById[selected.uid]?.phoneMasked ?? "—"} />
              <Row label="Unit price" value={formatINR(selected.unitPricePaise)} />
              <Row label="Quantity" value={String(selected.quantity)} />
              <Row label="Total paid" value={<strong className="text-ink">{formatINR(selected.totalPaise)}</strong>} />
              <Row label="Payment source" value={selected.paymentSource} />
              <Row label="Idempotency key" value={<span className="font-mono text-[12px]">{selected.requestId}</span>} />
            </dl>

            <div>
              <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">
                Ticket numbers
              </p>
              <div className="flex flex-wrap gap-1.5">
                {selected.ticketNumbers.map((number) => (
                  <span
                    key={number}
                    className="rounded-md border border-line bg-ivory px-2 py-1 text-[12px] font-semibold tabular-nums text-ink"
                  >
                    #{number}
                  </span>
                ))}
              </div>
            </div>

            <p className="text-[12px] leading-relaxed text-muted">
              The idempotency key guarantees a retried request cannot create a second order or debit the wallet
              twice.
            </p>
          </div>
        ) : null}
      </Dialog>

      {!orders.loading && !filtered.length && !debounced && filter === "all" ? (
        <div className="mt-4">
          <EmptyState
            title="No orders recorded"
            description="Nothing is shown until a real purchase completes. No order is ever fabricated for demonstration."
          />
        </div>
      ) : null}
    </>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-ivory/50 px-3 py-2 text-[13px]">
      <dt className="text-muted">{label}</dt>
      <dd className="max-w-[60%] truncate text-right text-ink">{value}</dd>
    </div>
  );
}

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

function maskUid(uid: string): string {
  return uid.length > 8 ? `${uid.slice(0, 4)}…${uid.slice(-3)}` : uid;
}
