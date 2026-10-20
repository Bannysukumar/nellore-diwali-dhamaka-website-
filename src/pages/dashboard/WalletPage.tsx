import { Plus, Send, Wallet } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useAsync } from "@/hooks/useAsync";
import { useAuth } from "@/app/AuthProvider";
import { useSiteSettings } from "@/app/SettingsProvider";
import { walletService } from "@/services/walletService";
import type { DepositRequest, WalletTransaction } from "@/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  LoadErrors,
  Segmented,
  Skeleton,
  StatCard,
  type Column,
} from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReferralLinkCard } from "@/features/referrals/ReferralLinkCard";
import { formatINR, formatINRCompact } from "@/utils/money";
import { formatDateTime } from "@/utils/format";
import { maskUtr } from "@/utils/mask";
import { cn } from "@/utils/cn";

const DEPOSIT_TONE: Record<DepositRequest["status"], "warning" | "emerald" | "danger" | "neutral"> = {
  pending: "warning",
  requires_review: "warning",
  approved: "emerald",
  rejected: "danger",
};

const DEPOSIT_LABEL: Record<DepositRequest["status"], string> = {
  pending: "Pending verification",
  requires_review: "Manual review",
  approved: "Approved",
  rejected: "Rejected",
};

export function WalletPage() {
  const { uid } = useAuth();
  const settings = useSiteSettings();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") ?? "ledger") as "ledger" | "deposits";

  const wallet = useAsync(
    async () => (uid ? await walletService.account(uid) : null),
    [uid],
    { enabled: Boolean(uid) },
  );
  const transactions = useAsync(
    async () => (uid ? await walletService.transactions(uid, 150) : []),
    [uid],
    { enabled: Boolean(uid) },
  );
  const deposits = useAsync(
    async () => (uid ? await walletService.deposits(uid, 100) : []),
    [uid],
    { enabled: Boolean(uid) },
  );

  const ledgerColumns: Array<Column<WalletTransaction>> = [
    {
      key: "when",
      header: "When",
      render: (row) => <span className="whitespace-nowrap">{formatDateTime(row.createdAt)}</span>,
    },
    {
      key: "description",
      header: "Entry",
      render: (row) => (
        <div className="min-w-0">
          <p className="font-medium text-ink">{row.description}</p>
          <p className="text-[11px] text-muted capitalize">{row.type.replace(/_/g, " ")}</p>
        </div>
      ),
    },
    {
      key: "direction",
      header: "Type",
      hideBelow: "md",
      render: (row) => (
        <Badge tone={row.direction === "credit" ? "emerald" : "brand"}>
          {row.direction === "credit" ? "Credit" : "Debit"}
        </Badge>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      render: (row) => (
        <span
          className={cn(
            "font-semibold tabular-nums",
            row.direction === "credit" ? "text-emerald" : "text-brand",
          )}
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
  ];

  const depositColumns: Array<Column<DepositRequest>> = [
    {
      key: "when",
      header: "Submitted",
      render: (row) => <span className="whitespace-nowrap">{formatDateTime(row.submittedAt)}</span>,
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
      hideBelow: "sm",
      render: (row) => <span className="font-mono text-[12px]">{maskUtr(row.utr)}</span>,
    },
    {
      key: "qr",
      header: "Paid to",
      hideBelow: "lg",
      render: (row) => <span className="text-muted">{row.qrLabel}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <div className="flex flex-col items-end gap-1 sm:items-start">
          <Badge tone={DEPOSIT_TONE[row.status]}>{DEPOSIT_LABEL[row.status]}</Badge>
          {row.rejectionReason ? (
            <span className="text-[11px] text-status-booked">{row.rejectionReason}</span>
          ) : null}
          {row.reviewNote && row.status !== "approved" ? (
            <span className="text-[11px] text-status-pending">{row.reviewNote}</span>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Wallet"
        icon={Wallet}
        title="Your festival wallet"
        description="Deposits are credited only after an administrator verifies your payment. Every movement is written to an append-only ledger."
        crumbs={[
          { label: "Home", to: "/" },
          { label: "Dashboard", to: "/dashboard" },
          { label: "Wallet" },
        ]}
        actions={
          <>
            <Link to="/dashboard/send-money">
              <Button variant="outline" iconLeft={<Send className="size-4" aria-hidden />}>
                Send money
              </Button>
            </Link>
            <Link to="/dashboard/add-money">
              <Button iconLeft={<Plus className="size-4" aria-hidden />}>Add money</Button>
            </Link>
          </>
        }
      />

      <LoadErrors className="mt-5" sources={[wallet, transactions, deposits]} />

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Available balance"
          value={formatINR(wallet.data?.balancePaise)}
          hint="Spendable on ticket purchases"
          tone="emerald"
          icon={Wallet}
        />
        <StatCard
          label="Pending verification"
          value={formatINR(wallet.data?.pendingDepositPaise)}
          hint="Submitted deposits awaiting review"
          tone="warning"
        />
        <StatCard
          label="Total deposited"
          value={formatINRCompact(wallet.data?.totalDepositedPaise)}
          hint="Approved deposits lifetime"
        />
        <StatCard
          label="Total spent"
          value={formatINRCompact(wallet.data?.totalSpentPaise)}
          hint="Ticket purchases lifetime"
        />
      </div>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Alert tone="info" title="How deposits work">
          Minimum deposit {formatINR(settings.minDepositPaise)}, maximum{" "}
          {formatINR(settings.maxDepositPaise)} per request. Uploading a screenshot does not complete a
          deposit — verification does.
        </Alert>
        <ReferralLinkCard />
      </div>

      <div className="mt-5">
        <Segmented
          options={[
            { value: "ledger", label: "Ledger" },
            { value: "deposits", label: "Deposit requests" },
          ]}
          value={tab}
          onChange={(next) => setParams({ tab: next })}
          ariaLabel="Wallet view"
        />
      </div>

      <Card className="mt-4">
        <CardHeader
          title={tab === "ledger" ? "Wallet ledger" : "Deposit requests"}
          description={
            tab === "ledger"
              ? "Immutable, newest first. Balances can only be changed by the backend."
              : "Every deposit you have submitted and how it was resolved."
          }
          action={
            tab === "ledger" ? (
              <Badge tone="neutral">{transactions.data?.length ?? 0} entries</Badge>
            ) : (
              <Badge tone="neutral">{deposits.data?.length ?? 0} requests</Badge>
            )
          }
        />
        <CardBody>
          {tab === "ledger" ? (
            transactions.loading ? (
              <Skeleton className="h-40" rounded="lg" />
            ) : (
              <DataTable
                columns={ledgerColumns}
                rows={transactions.data ?? []}
                keyOf={(row) => row.id}
                emptyTitle="No wallet activity yet"
                emptyDescription="Add money to your wallet to see ledger entries here."
                emptyAction={
                  <Link to="/dashboard/add-money">
                    <Button>Add money</Button>
                  </Link>
                }
              />
            )
          ) : deposits.loading ? (
            <Skeleton className="h-40" rounded="lg" />
          ) : (
            <DataTable
              columns={depositColumns}
              rows={deposits.data ?? []}
              keyOf={(row) => row.id}
              emptyTitle="No deposit requests"
              emptyDescription="Submit a UPI payment reference to start your first deposit."
              emptyAction={
                <Link to="/dashboard/add-money">
                  <Button>Add money</Button>
                </Link>
              }
            />
          )}
        </CardBody>
      </Card>
    </>
  );
}
