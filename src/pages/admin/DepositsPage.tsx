import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck, Wallet, XCircle } from "lucide-react";
import { useAsync } from "@/hooks/useAsync";
import { useToast } from "@/app/ToastProvider";
import { callBackend, errorActionHint } from "@/lib/backend/callBackend";
import type { ReviewDepositRequest, ReviewDepositResponse } from "@/lib/backend/api";
import { adminService } from "@/services/adminService";
import { walletService } from "@/services/walletService";
import { getPrivateFileUrl } from "@/services/storageService";
import type { DepositRequest, DepositStatus, Ticket } from "@/types";
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
  Input,
  Label,
  LoadErrors,
  Segmented,
  Skeleton,
  StatCard,
  Textarea,
  type Column,
} from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatINR, parseRupeesToPaise } from "@/utils/money";
import { formatDateTime, formatNumber } from "@/utils/format";
import { maskUtr } from "@/utils/mask";

const TONE: Record<DepositStatus, "warning" | "emerald" | "danger" | "neutral"> = {
  pending: "warning",
  requires_review: "warning",
  approved: "emerald",
  rejected: "danger",
};

const LABEL: Record<DepositStatus, string> = {
  pending: "Pending verification",
  requires_review: "Manual review",
  approved: "Approved",
  rejected: "Rejected",
};

type Filter = "queue" | "approved" | "rejected" | "all";

const FILTER_STATUSES: Record<Filter, DepositStatus[] | undefined> = {
  queue: ["pending", "requires_review"],
  approved: ["approved"],
  rejected: ["rejected"],
  all: undefined,
};
const LIST_LIMIT = 400;

export function AdminDepositsPage() {
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("queue");
  const [selected, setSelected] = useState<DepositRequest | null>(null);
  const [verifiedInput, setVerifiedInput] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deposits = useAsync(
    () => walletService.allDeposits(FILTER_STATUSES[filter], LIST_LIMIT),
    [filter],
  );
  const pendingTotal = useAsync(() => walletService.pendingDepositTotal(), []);
  const rows = deposits.data ?? [];

  const statusCounts = useAsync(
    () => adminService.countByStatus("depositRequests", ["pending", "requires_review", "approved", "rejected"]),
    [],
  );
  const counts = statusCounts.data
    ? {
        queue: statusCounts.data.pending + statusCounts.data.requires_review,
        approved: statusCounts.data.approved,
        rejected: statusCounts.data.rejected,
        all: statusCounts.data.total,
      }
    : { queue: null, approved: null, rejected: null, all: null };

  const context = useAsync(
    async () => (selected ? await adminService.depositContext(selected) : null),
    [selected?.id],
    { enabled: Boolean(selected) },
  );

  const duplicates = useAsync(
    async () => (selected ? await adminService.duplicateUtrs(selected.utr, selected.id) : []),
    [selected?.id],
    { enabled: Boolean(selected) },
  );

  const screenshot = useAsync(
    async () => (selected ? await resolveScreenshot(selected) : null),
    [selected?.id],
    { enabled: Boolean(selected) },
  );

  const screenshotUrl = screenshot.data;
  useEffect(() => {
    if (!screenshotUrl?.startsWith("blob:")) return;
    return () => URL.revokeObjectURL(screenshotUrl);
  }, [screenshotUrl]);

  const openReview = (deposit: DepositRequest) => {
    setSelected(deposit);
    setNote(deposit.reviewNote ?? "");
    setReason("");
    setVerifiedInput((deposit.amountPaise / 100).toFixed(2));
    setError(null);
  };

  const closeReview = () => {
    setSelected(null);
    setError(null);
  };

  const decide = async (decision: ReviewDepositRequest["decision"]) => {
    if (!selected) return;
    setError(null);

    let verifiedAmountPaise: number | undefined;
    if (decision === "approve") {
      verifiedAmountPaise = parseRupeesToPaise(verifiedInput || "0");
      if (!Number.isFinite(verifiedAmountPaise) || verifiedAmountPaise <= 0) {
        setError("Enter the amount actually received before approving.");
        return;
      }
    }
    if (decision === "reject" && reason.trim().length < 4) {
      setError("Give a short reason so the customer knows what to correct.");
      return;
    }

    setBusy(true);
    try {
      const result = await callBackend<ReviewDepositRequest, ReviewDepositResponse>("reviewDeposit", {
        depositId: selected.id,
        decision,
        note: note.trim() || undefined,
        reason: decision === "reject" ? reason.trim() : undefined,
        verifiedAmountPaise,
      });
      const message =
        decision === "approve"
          ? `${formatINR(result.creditedPaise)} credited. New balance ${formatINR(result.balancePaise)}.`
          : decision === "reject"
            ? "The deposit was rejected and the customer was notified."
            : "The deposit was flagged for additional review.";
      toast.success("Deposit updated", message);
      setSelected(null);
      deposits.reload();
      pendingTotal.reload();
      statusCounts.reload();
    } catch (err) {
      const message = err instanceof Error ? err.message : "The decision could not be saved.";
      const hint = errorActionHint((err as { code?: string })?.code ?? "");
      setError(hint ? `${message} ${hint}` : message);
    } finally {
      setBusy(false);
    }
  };

  const columns: Array<Column<DepositRequest>> = [
    {
      key: "when",
      header: "Submitted",
      render: (row) => (
        <span className="whitespace-nowrap text-muted">{formatDateTime(row.submittedAt)}</span>
      ),
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
      header: "Claimed",
      align: "right",
      render: (row) => (
        <span className="font-semibold tabular-nums text-ink">{formatINR(row.amountPaise)}</span>
      ),
    },
    {
      key: "utr",
      header: "UTR",
      hideBelow: "md",
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
          <Badge tone={TONE[row.status]}>{LABEL[row.status]}</Badge>
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (row) => (
        <Button size="sm" variant="outline" onClick={() => openReview(row)}>
          Review
        </Button>
      ),
    },
  ];

  const customerTickets = (context.data?.customerTickets ?? []) as Ticket[];
  const previousDeposits = context.data?.previousDeposits ?? [];
  const hasDuplicateUtr = (duplicates.data ?? []).length > 0;

  return (
    <>
      <PageHeader
        eyebrow="Money"
        icon={Wallet}
        title="Deposit verification"
        description="Every deposit is matched against the operator's banking records before it is credited. A deposit is never revenue — it becomes spendable wallet balance."
        actions={
          <Button
            variant="outline"
            onClick={() => {
              deposits.reload();
              pendingTotal.reload();
              statusCounts.reload();
            }}
            iconLeft={<RefreshCw className="size-4" aria-hidden />}
          >
            Refresh
          </Button>
        }
      />

      <LoadErrors className="mt-5" sources={[deposits, pendingTotal, statusCounts]} />

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="In the queue"
          value={formatNumber(counts.queue)}
          hint="Pending or flagged for manual review"
          icon={AlertTriangle}
          tone={counts.queue ? "warning" : "default"}
        />
        <StatCard
          label="Awaiting value"
          value={formatINR(pendingTotal.data?.amountPaise)}
          hint="Total claimed by queued requests"
          icon={Wallet}
        />
        <StatCard label="Approved" value={formatNumber(counts.approved)} hint="Lifetime" tone="emerald" />
        <StatCard label="Rejected" value={formatNumber(counts.rejected)} hint="Lifetime" tone="warning" />
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          options={[
            { value: "queue", label: "Queue" },
            { value: "approved", label: "Approved" },
            { value: "rejected", label: "Rejected" },
            { value: "all", label: "All" },
          ]}
          value={filter}
          onChange={setFilter}
          ariaLabel="Filter deposits"
        />
        <p className="text-[12px] text-muted">
          {formatNumber(rows.length)} request{rows.length === 1 ? "" : "s"} shown
        </p>
      </div>

      <Card className="mt-4">
        <CardHeader
          icon={ShieldCheck}
          title="Deposit requests"
          description="Open a request to view the payment screenshot, the customer's history and any duplicate references."
        />
        <CardBody>
          {deposits.loading ? (
            <Skeleton className="h-64" rounded="lg" />
          ) : (
            <DataTable
              columns={columns}
              rows={rows}
              keyOf={(row) => row.id}
              caption="Deposit requests"
              emptyTitle={filter === "queue" ? "Nothing to review" : "No requests in this view"}
              emptyDescription={
                filter === "queue"
                  ? "Every submitted deposit has been resolved. New requests appear here immediately."
                  : "Switch the filter to see other deposit requests."
              }
            />
          )}
        </CardBody>
      </Card>

      <Dialog
        open={Boolean(selected)}
        onClose={closeReview}
        size="xl"
        dismissible={!busy}
        title="Verify deposit"
        description="Confirm the amount credited to the operator's account before approving."
      >
        {selected ? (
          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <div className="space-y-4">
              {error ? (
                <Alert tone="danger" title="We could not complete that decision">
                  {error}
                </Alert>
              ) : null}

              {hasDuplicateUtr ? (
                <Alert tone="warning" title="Duplicate UTR detected">
                  {duplicates.data?.length} other request(s) use the reference{" "}
                  <span className="font-mono">{maskUtr(selected.utr)}</span>. Verify carefully — a
                  deposit must never be credited twice.
                </Alert>
              ) : null}

              <dl className="grid grid-cols-2 gap-2.5 text-[13px]">
                <Detail label="Customer" value={selected.userDisplayName} />
                <Detail label="Phone" value={selected.userPhoneMasked} />
                <Detail label="Submitted" value={formatDateTime(selected.submittedAt)} />
                <Detail label="Claimed amount" value={formatINR(selected.amountPaise)} />
                <Detail label="UTR / reference" value={selected.utr} mono />
                <Detail label="Paid to" value={`${selected.qrLabel} · ${selected.qrUpiId ?? "—"}`} />
              </dl>

              <div className="rounded-xl border border-line bg-ivory/50 p-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                  Payment screenshot
                </p>
                {screenshot.loading ? (
                  <Skeleton className="h-56" rounded="lg" />
                ) : screenshot.data ? (
                  <img
                    src={screenshot.data}
                    alt="Customer-submitted payment screenshot"
                    className="mx-auto max-h-80 rounded-lg border border-line bg-white object-contain"
                  />
                ) : (
                  <p className="py-6 text-center text-[12.5px] text-muted">
                    The screenshot is private and could not be displayed here. Verify the reference
                    against your bank statement before proceeding.
                  </p>
                )}
                {selected.screenshotPath ? (
                  <p className="mt-2 text-center font-mono text-[11px] text-muted">
                    {selected.screenshotPath}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="verified-amount" hint="Amount actually received" required>
                    Verified amount
                  </Label>
                  <Input
                    id="verified-amount"
                    inputMode="decimal"
                    prefix="₹"
                    value={verifiedInput}
                    onChange={(event) => setVerifiedInput(event.target.value.replace(/[^\d.]/g, ""))}
                  />
                  <p className="mt-1.5 text-[11.5px] text-muted">
                    Credit exactly what the bank statement shows, even if it differs from the claim.
                  </p>
                </div>
                <div>
                  <Label htmlFor="review-note" hint="Internal">
                    Review note
                  </Label>
                  <Textarea
                    id="review-note"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="e.g. Matched against statement 12 Oct, ref 4451."
                    className="min-h-20"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="reject-reason" hint="Shown to the customer if you reject">
                  Rejection reason
                </Label>
                <Textarea
                  id="reject-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="e.g. No matching credit found for that reference."
                  className="min-h-20"
                />
              </div>
            </div>

            <div className="space-y-3 lg:sticky lg:top-4 lg:self-start">
              <Card>
                <CardHeader title="Customer context" />
                <CardBody className="space-y-2 text-[13px]">
                  <Row label="Tickets held" value={formatNumber(customerTickets.length)} />
                  <Row
                    label="Tickets booked"
                    value={formatNumber(customerTickets.filter((t) => t.status === "booked").length)}
                  />
                  <Row label="Previous deposits" value={formatNumber(previousDeposits.length)} />
                  <Row
                    label="Previously approved"
                    value={formatNumber(previousDeposits.filter((d) => d.status === "approved").length)}
                  />
                </CardBody>
              </Card>

              {previousDeposits.length ? (
                <Card>
                  <CardHeader title="Earlier requests" />
                  <CardBody>
                    <ul className="space-y-2">
                      {previousDeposits.slice(0, 5).map((deposit) => (
                        <li
                          key={deposit.id}
                          className="flex items-center justify-between gap-2 rounded-lg border border-line bg-ivory/50 px-2.5 py-2 text-[12px]"
                        >
                          <span className="text-muted">{formatDateTime(deposit.submittedAt)}</span>
                          <span className="flex items-center gap-2">
                            <span className="font-semibold tabular-nums text-ink">
                              {formatINR(deposit.amountPaise)}
                            </span>
                            <Badge tone={TONE[deposit.status]}>{LABEL[deposit.status]}</Badge>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </CardBody>
                </Card>
              ) : null}

              {selected.status === "approved" ? (
                <Alert tone="success" title="Already approved">
                  This deposit has been credited. Approving again is a no-op — the ledger is guarded
                  against double credits.
                </Alert>
              ) : (
                <div className="space-y-2">
                  <Alert tone="info" title="Credit once">
                    Approving appends a single immutable ledger entry and notifies the customer. This
                    cannot be undone from the panel.
                  </Alert>
                  <Button
                    block
                    variant="success"
                    loading={busy}
                    onClick={() => void decide("approve")}
                    iconLeft={<CheckCircle2 className="size-4" aria-hidden />}
                  >
                    Approve &amp; credit wallet
                  </Button>
                  <Button
                    block
                    variant="outline"
                    disabled={busy}
                    onClick={() => void decide("requires_review")}
                    iconLeft={<AlertTriangle className="size-4" aria-hidden />}
                  >
                    Flag for further review
                  </Button>
                  <Button
                    block
                    variant="danger"
                    disabled={busy}
                    onClick={() => void decide("reject")}
                    iconLeft={<XCircle className="size-4" aria-hidden />}
                  >
                    Reject deposit
                  </Button>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Dialog>

      {!rows.length && !deposits.loading ? (
        <div className="mt-4">
          <EmptyState
            title="No deposits in this view"
            description="Deposit requests submitted from the Add Money screen appear here for verification."
          />
        </div>
      ) : null}
    </>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-ivory/50 p-3">
      <dt className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</dt>
      <dd className={`mt-0.5 text-ink ${mono ? "font-mono text-[12.5px]" : "font-semibold"}`}>{value}</dd>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="font-semibold tabular-nums text-ink">{value}</dd>
    </div>
  );
}

/**
 * Screenshots live behind Storage rules and are fetched with the reviewer's
 * credentials; no persisted download URL is ever used.
 */
async function resolveScreenshot(deposit: DepositRequest): Promise<string | null> {
  if (!deposit.screenshotPath) return null;
  return getPrivateFileUrl(deposit.screenshotPath);
}
