import { useMemo, useState, type ReactNode } from "react";
import { ArrowDownLeft, ArrowUpRight, Coins, ScrollText, Search, ShieldCheck, Wallet } from "lucide-react";
import { useAsync } from "@/hooks/useAsync";
import { walletService } from "@/services/walletService";
import { userService } from "@/services/userService";
import { useDebounced } from "@/hooks/useCollection";
import type { UserProfile, WalletTransaction, WalletTxType } from "@/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  Dialog,
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

const TYPE_LABEL: Record<WalletTxType, string> = {
  deposit: "Deposit",
  ticket_purchase: "Ticket purchase",
  refund: "Refund",
  adjustment: "Adjustment",
  reward_credit: "Reward credit",
};

export function AdminLedgerPage() {
  const [filter, setFilter] = useState<"all" | WalletTxType>("all");
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search, 300).trim().toLowerCase();
  const [selected, setSelected] = useState<WalletTransaction | null>(null);

  const txns = useAsync(
    () => walletService.allTransactions(500, filter === "all" ? undefined : filter),
    [filter],
  );
  const liability = useAsync(() => walletService.totalLiability(), []);
  const ledgerTotals = useAsync(() => walletService.ledgerTotals(), []);
  const profiles = useAsync(
    () => userService.allProfilesByUids((txns.data ?? []).map((t) => t.uid)),
    [txns.data],
  );

  const profileById = useMemo(() => profiles.data ?? {}, [profiles.data]);

  const filtered = useMemo(() => {
    let rows = txns.data ?? [];
    if (debounced) {
      rows = rows.filter((t) => {
        const user = profileById[t.uid];
        return (
          t.id.toLowerCase().includes(debounced) ||
          t.description.toLowerCase().includes(debounced) ||
          (t.refId?.toLowerCase().includes(debounced) ?? false) ||
          (user?.fullName.toLowerCase().includes(debounced) ?? false) ||
          (user?.phoneMasked.toLowerCase().includes(debounced) ?? false)
        );
      });
    }
    return rows;
  }, [txns.data, debounced, profileById]);

  const columns: Array<Column<WalletTransaction>> = [
    {
      key: "when",
      header: "When",
      render: (row) => (
        <span className="whitespace-nowrap text-muted">{formatDateTime(row.createdAt)}</span>
      ),
    },
    {
      key: "customer",
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
      key: "type",
      header: "Type",
      hideBelow: "sm",
      render: (row) => <Badge tone="neutral">{TYPE_LABEL[row.type]}</Badge>,
    },
    {
      key: "description",
      header: "Description",
      hideBelow: "md",
      render: (row) => <span className="text-[12.5px] text-muted">{row.description}</span>,
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      render: (row) => (
        <span
          className={
            row.direction === "credit"
              ? "font-semibold tabular-nums text-emerald"
              : "font-semibold tabular-nums text-status-booked"
          }
        >
          {row.direction === "credit" ? "+" : "−"}
          {formatINR(row.amountPaise)}
        </span>
      ),
    },
    {
      key: "balance",
      header: "Balance after",
      align: "right",
      hideBelow: "sm",
      render: (row) => <span className="tabular-nums text-muted">{formatINR(row.balanceAfterPaise)}</span>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (row) => (
        <Button size="sm" variant="ghost" onClick={() => setSelected(row)}>
          Detail
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Money"
        icon={ScrollText}
        title="Wallet ledger"
        description="The append-only record of every balance movement. Rows are never edited or deleted — corrections are posted as new entries."
      />

      <LoadErrors className="mt-5" sources={[txns, liability, ledgerTotals, profiles]} />

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Wallet liability"
          value={formatINRCompact(liability.data)}
          hint="Spendable balance across all accounts"
          icon={Wallet}
          tone="brand"
        />
        <StatCard
          label="Total credits"
          value={formatINRCompact(ledgerTotals.data?.creditsPaise)}
          hint="Lifetime deposits, refunds and reward credits"
          icon={ArrowDownLeft}
          tone="emerald"
        />
        <StatCard
          label="Total debits"
          value={formatINRCompact(ledgerTotals.data?.debitsPaise)}
          hint="Lifetime ticket purchases and adjustments"
          icon={ArrowUpRight}
          tone="gold"
        />
        <StatCard
          label="Entries shown"
          value={formatNumber(filtered.length)}
          hint={`of ${formatNumber(ledgerTotals.data?.entries)} ledger entries · newest 500 per view`}
          icon={Coins}
        />
      </div>

      <Alert tone="info" className="mt-4" title="Deposits are not revenue">
        Approved deposits increase a customer's spendable balance. They are a liability until spent — ticket
        purchases are the only figures counted as revenue.
      </Alert>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          options={[
            { value: "all", label: "All entries" },
            { value: "deposit", label: "Deposits" },
            { value: "ticket_purchase", label: "Purchases" },
            { value: "refund", label: "Refunds" },
            { value: "reward_credit", label: "Rewards" },
            { value: "adjustment", label: "Adjustments" },
          ]}
          value={filter}
          onChange={setFilter}
          ariaLabel="Filter ledger entries"
        />
        <div className="relative w-full sm:w-72">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search account, description or reference"
            className="pl-9"
            aria-label="Search ledger"
          />
        </div>
      </div>

      <Card className="mt-4">
        <CardHeader
          icon={ScrollText}
          title="Ledger entries"
          description="Newest first. Totals above cover the whole ledger; this list shows the newest 500 entries for the selected type."
        />
        <CardBody>
          {txns.loading ? (
            <Skeleton className="h-72" rounded="lg" />
          ) : (
            <DataTable
              columns={columns}
              rows={filtered}
              keyOf={(row) => row.id}
              caption="Wallet ledger"
              emptyTitle={debounced ? "No entries match that search" : "No ledger entries"}
              emptyDescription={
                debounced
                  ? "Try a different name, reference or description."
                  : "An entry is written for every approved deposit, purchase and refund."
              }
            />
          )}
        </CardBody>
      </Card>

      <Dialog
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="Ledger entry"
        description="Immutable record — shown exactly as stored."
      >
        {selected ? (
          <div className="space-y-4">
            <dl className="grid gap-2">
              <Line label="Entry id" value={<span className="font-mono text-[12px]">{selected.id}</span>} />
              <Line
                label="Account"
                value={profileById[selected.uid]?.fullName ?? selected.uid.slice(0, 12)}
              />
              <Line label="Type" value={TYPE_LABEL[selected.type]} />
              <Line
                label="Direction"
                value={
                  <Badge tone={selected.direction === "credit" ? "emerald" : "warning"}>
                    {selected.direction}
                  </Badge>
                }
              />
              <Line label="Amount" value={formatINR(selected.amountPaise)} />
              <Line label="Balance after" value={formatINR(selected.balanceAfterPaise)} />
              <Line label="Recorded" value={formatDateTime(selected.createdAt)} />
              <Line label="Actor" value={selected.actor} />
              <Line
                label="Reference"
                value={selected.refId ? <span className="font-mono text-[12px]">{selected.refId}</span> : "—"}
              />
            </dl>
            <p className="rounded-xl border border-line bg-ivory/60 p-3 text-[13px] leading-relaxed text-ink">
              {selected.description}
            </p>
            <p className="flex items-start gap-2 text-[12px] leading-relaxed text-muted">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald" aria-hidden />
              Balances in this application are only ever changed by server-side transactions. The frontend
              never writes a balance — it only reads this ledger.
            </p>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}

function Line({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-ivory/50 px-3 py-2 text-[13px]">
      <dt className="text-muted">{label}</dt>
      <dd className="max-w-[60%] truncate text-right text-ink">{value}</dd>
    </div>
  );
}
