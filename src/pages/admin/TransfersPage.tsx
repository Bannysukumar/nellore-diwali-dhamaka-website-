import { useMemo, useState } from "react";
import { ArrowLeftRight, Clock, Coins, Search, Users } from "lucide-react";
import { useAsync } from "@/hooks/useAsync";
import { useDebounced } from "@/hooks/useCollection";
import { walletService } from "@/services/walletService";
import type { WalletTransfer } from "@/types";
import {
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
import { formatINR, formatINRCompact } from "@/utils/money";
import { formatDateTime, formatNumber } from "@/utils/format";

const TRANSFER_LIST_LIMIT = 500;

export function AdminTransfersPage() {
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search, 300).trim().toLowerCase();
  const transfers = useAsync(() => walletService.allTransfers(TRANSFER_LIST_LIMIT), []);

  const all = useMemo(() => transfers.data ?? [], [transfers.data]);
  const rows = useMemo(() => {
    if (!debounced) return all;
    const digits = debounced.replace(/\D/g, "");
    return all.filter(
      (t) =>
        t.fromName.toLowerCase().includes(debounced) ||
        t.toName.toLowerCase().includes(debounced) ||
        t.id.toLowerCase().includes(debounced) ||
        (t.note?.toLowerCase().includes(debounced) ?? false) ||
        (digits.length >= 3 && (t.fromPhone.includes(digits) || t.toPhone.includes(digits))),
    );
  }, [all, debounced]);

  const summary = useMemo(() => {
    const dayAgo = Date.now() - 86_400_000;
    const recent = all.filter((t) => new Date(t.createdAt).getTime() >= dayAgo);
    return {
      count: all.length,
      totalPaise: all.reduce((sum, t) => sum + t.amountPaise, 0),
      recentCount: recent.length,
      recentPaise: recent.reduce((sum, t) => sum + t.amountPaise, 0),
      senders: new Set(all.map((t) => t.fromUid)).size,
    };
  }, [all]);

  const columns: Array<Column<WalletTransfer>> = [
    {
      key: "when",
      header: "When",
      render: (row) => <span className="whitespace-nowrap text-muted">{formatDateTime(row.createdAt)}</span>,
    },
    {
      key: "from",
      header: "From",
      render: (row) => <Party name={row.fromName} phone={row.fromPhone} balance={row.fromBalanceAfterPaise} />,
    },
    {
      key: "to",
      header: "To",
      render: (row) => <Party name={row.toName} phone={row.toPhone} balance={row.toBalanceAfterPaise} />,
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      render: (row) => <span className="font-semibold tabular-nums text-ink">{formatINR(row.amountPaise)}</span>,
    },
    {
      key: "note",
      header: "Note",
      hideBelow: "md",
      render: (row) => <span className="text-[12.5px] text-muted">{row.note || "—"}</span>,
    },
    {
      key: "ref",
      header: "Reference",
      hideBelow: "lg",
      render: (row) => <span className="font-mono text-[11px] text-muted">{row.id}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Money"
        icon={ArrowLeftRight}
        title="Wallet transfers"
        description="Every customer-to-customer transfer. Each one is a debit and a credit in the wallet ledger, written in a single server-side transaction."
      />

      <LoadErrors className="mt-5" sources={[transfers]} />

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Transfers" value={formatNumber(summary.count)} icon={ArrowLeftRight} tone="brand" />
        <StatCard
          label="Amount transferred"
          value={formatINRCompact(summary.totalPaise)}
          hint="Across the transfers listed below"
          icon={Coins}
          tone="emerald"
        />
        <StatCard
          label="Last 24 hours"
          value={formatNumber(summary.recentCount)}
          hint={formatINR(summary.recentPaise)}
          icon={Clock}
          tone="gold"
        />
        <StatCard label="Distinct senders" value={formatNumber(summary.senders)} icon={Users} />
      </div>

      <div className="mt-5 flex justify-end">
        <div className="relative w-full sm:w-80">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, phone, note or reference"
            className="pl-9"
            aria-label="Search transfers"
          />
        </div>
      </div>

      <Card className="mt-4">
        <CardHeader
          icon={ArrowLeftRight}
          title="All transfers"
          description={
            all.length >= TRANSFER_LIST_LIMIT
              ? `${rows.length} shown · newest ${TRANSFER_LIST_LIMIT} transfers`
              : `${rows.length} shown`
          }
        />
        <CardBody>
          {transfers.loading ? (
            <Skeleton className="h-72" rounded="lg" />
          ) : (
            <DataTable
              columns={columns}
              rows={rows}
              keyOf={(row) => row.id}
              caption="Wallet transfers"
              emptyTitle={debounced ? "No transfers match that search" : "No transfers yet"}
              emptyDescription={
                debounced
                  ? "Try a different name, number or reference."
                  : "Transfers appear here as soon as a customer sends money to another customer."
              }
            />
          )}
        </CardBody>
      </Card>
    </>
  );
}

function Party({ name, phone, balance }: { name: string; phone: string; balance: number }) {
  return (
    <div className="min-w-0">
      <p className="truncate font-medium text-ink">{name}</p>
      <p className="text-[11px] text-muted">{phone}</p>
      <p className="text-[11px] text-muted">Balance after {formatINR(balance)}</p>
    </div>
  );
}
