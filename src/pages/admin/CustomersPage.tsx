import { useMemo, useRef, useState } from "react";
import {
  Ban,
  CheckCircle2,
  Coins,
  Search,
  ShoppingBag,
  Sparkles,
  Ticket as TicketIcon,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";
import { useAsync } from "@/hooks/useAsync";
import { useToast } from "@/app/ToastProvider";
import { useAuth } from "@/app/AuthProvider";
import { userService } from "@/services/userService";
import { walletService } from "@/services/walletService";
import { ticketService } from "@/services/ticketService";
import { rewardService } from "@/services/rewardService";
import { adminService } from "@/services/adminService";
import { useDebounced } from "@/hooks/useCollection";
import { callBackend } from "@/lib/backend/callBackend";
import type { AdjustWalletRequest, AdjustWalletResponse } from "@/lib/backend/api";
import type { SpinAccount, UserProfile, WalletTransaction } from "@/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  Dialog,
  FieldError,
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
import { formatDate, formatDateTime, formatNumber } from "@/utils/format";
import { initials } from "@/utils/mask";
import { newId } from "@/utils/id";

type StatusFilter = "all" | "active" | "suspended";
type AdjustMode = AdjustWalletRequest["mode"];

const ADJUST_LABEL: Record<AdjustMode, string> = {
  credit: "Add money",
  debit: "Deduct money",
  set: "Set exact balance",
};

const CUSTOMER_LIST_LIMIT = 500;

export function AdminCustomersPage() {
  const toast = useToast();
  const { profile: admin } = useAuth();
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search, 300).trim().toLowerCase();
  const [selected, setSelected] = useState<UserProfile | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adjustMode, setAdjustMode] = useState<AdjustMode>("credit");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const adjustRequestId = useRef(newId("adj"));

  const customers = useAsync(
    () => userService.listCustomers(CUSTOMER_LIST_LIMIT, filter === "all" ? undefined : filter),
    [filter],
  );
  const balances = useAsync(async () => {
    const accounts = await walletService.accounts(CUSTOMER_LIST_LIMIT * 2);
    return new Map(accounts.map((a) => [(a as typeof a & { id: string }).id, a.balancePaise]));
  }, []);

  const rows = useMemo(() => {
    let all = customers.data ?? [];
    if (debounced) {
      const digits = debounced.replace(/\D/g, "");
      all = all.filter(
        (c) =>
          c.fullName.toLowerCase().includes(debounced) ||
          (digits.length >= 3 && (c.phone ?? "").replace(/\D/g, "").includes(digits)) ||
          (c.email ?? "").toLowerCase().includes(debounced) ||
          c.referralCode.toLowerCase().includes(debounced),
      );
    }
    return all;
  }, [customers.data, debounced]);

  const counts = useAsync(
    () =>
      adminService.countByStatus("users", ["active", "suspended"], [
        { field: "role", op: "==", value: "customer" },
      ]),
    [],
  );
  const referrals = useAsync(() => rewardService.referralSummary(), []);
  const summary = {
    total: counts.data?.total,
    active: counts.data?.active,
    suspended: counts.data?.suspended,
    referred: referrals.data?.total,
  };
  const truncated = (customers.data?.length ?? 0) >= CUSTOMER_LIST_LIMIT;

  const detail = useAsync(
    async () => {
      if (!selected) return null;
      const [wallet, tickets, orders, spins, referrers] = await Promise.all([
        walletService.account(selected.uid),
        ticketService.mine(selected.uid, 200),
        ticketService.ordersForUser(selected.uid, 100),
        rewardService.spinAccount(selected.uid),
        selected.referredByUid
          ? userService.customer(selected.referredByUid)
          : Promise.resolve(null),
      ]);
      const ledger = await walletService.transactions(selected.uid, 20);
      return { wallet, tickets, orders, spins, referrer: referrers, ledger };
    },
    [selected?.uid],
    { enabled: Boolean(selected) },
  );

  const setStatus = async (status: UserProfile["status"]) => {
    if (!selected) return;
    setError(null);
    if (status === "suspended" && reason.trim().length < 4) {
      setError("Give a short, factual reason before suspending an account.");
      return;
    }
    setBusy(true);
    try {
      await userService.setCustomerStatus(selected.uid, status, status === "suspended" ? reason.trim() : undefined);
      await adminService.log({
        actorUid: admin?.uid ?? "",
        actorName: admin?.fullName ?? "Administrator",
        action: status === "suspended" ? "user.suspend" : "user.reactivate",
        entity: "users",
        entityId: selected.uid,
        note: status === "suspended" ? reason.trim() : "Account reactivated",
        before: { status: selected.status },
        after: { status },
      });
      toast.success(
        status === "suspended" ? "Account suspended" : "Account reactivated",
        selected.fullName,
      );
      setSelected({ ...selected, status, suspendedReason: status === "suspended" ? reason.trim() : undefined });
      setReason("");
      customers.reload();
      counts.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The account could not be updated.");
    } finally {
      setBusy(false);
    }
  };

  const adjustWallet = async () => {
    if (!selected) return;
    setAdjustError(null);
    const amountPaise = parseRupeesToPaise(adjustAmount);
    if (!Number.isInteger(amountPaise) || amountPaise < 0 || (adjustMode !== "set" && amountPaise === 0)) {
      setAdjustError("Enter a valid amount in rupees.");
      return;
    }
    if (adjustReason.trim().length < 3) {
      setAdjustError("Write a short reason; it is shown in the customer's wallet history.");
      return;
    }
    setAdjusting(true);
    try {
      const outcome = await callBackend<AdjustWalletRequest, AdjustWalletResponse>("adjustWallet", {
        requestId: adjustRequestId.current,
        uid: selected.uid,
        mode: adjustMode,
        amountPaise,
        reason: adjustReason.trim(),
      });
      toast.success(
        "Wallet updated",
        `${selected.fullName}: ${outcome.deltaPaise > 0 ? "+" : "−"}${formatINR(Math.abs(outcome.deltaPaise))} · balance ${formatINR(outcome.balancePaise)}`,
      );
      adjustRequestId.current = newId("adj");
      setAdjustAmount("");
      setAdjustReason("");
      detail.reload();
      balances.reload();
    } catch (err) {
      setAdjustError(err instanceof Error ? err.message : "The wallet could not be updated.");
    } finally {
      setAdjusting(false);
    }
  };

  const columns: Array<Column<UserProfile>> = [
    {
      key: "customer",
      header: "Customer",
      render: (row) => (
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-maroon text-[11px] font-bold text-ivory">
            {initials(row.fullName)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-ink">{row.fullName}</p>
            <a href={`tel:${row.phone}`} className="text-[12px] tabular-nums text-ink hover:underline">
              {row.phone}
            </a>
            {row.email ? <p className="truncate text-[11px] text-muted">{row.email}</p> : null}
          </div>
        </div>
      ),
    },
    {
      key: "balance",
      header: "Wallet",
      align: "right",
      render: (row) => (
        <span className="font-semibold tabular-nums text-ink">
          {balances.data ? formatINR(balances.data.get(row.uid) ?? 0) : "…"}
        </span>
      ),
    },
    {
      key: "referral",
      header: "Referral code",
      hideBelow: "md",
      render: (row) => <span className="font-mono text-[12px] text-muted">{row.referralCode}</span>,
    },
    {
      key: "joined",
      header: "Joined",
      hideBelow: "sm",
      render: (row) => <span className="text-muted">{formatDate(row.createdAt)}</span>,
    },
    {
      key: "lastLogin",
      header: "Last login",
      hideBelow: "lg",
      render: (row) => <span className="text-muted">{formatDateTime(row.lastLoginAt)}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <div className="flex flex-col items-end gap-1 sm:items-start">
          <Badge tone={row.status === "active" ? "emerald" : "danger"}>
            {row.status === "active" ? "Active" : "Suspended"}
          </Badge>
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (row) => (
        <Button size="sm" variant="ghost" onClick={() => openDetail(row)}>
          View
        </Button>
      ),
    },
  ];

  function openDetail(row: UserProfile) {
    setSelected(row);
    setReason("");
    setError(null);
    setAdjustMode("credit");
    setAdjustAmount("");
    setAdjustReason("");
    setAdjustError(null);
    adjustRequestId.current = newId("adj");
  }

  return (
    <>
      <PageHeader
        eyebrow="People"
        icon={Users}
        title="Customers"
        description="Every registered participant. Suspending an account is logged and immediately prevents further purchases — existing tickets and balances are preserved."
      />

      <LoadErrors className="mt-5" sources={[customers, counts, referrals, balances]} />

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Registered customers" value={formatNumber(summary.total)} icon={Users} tone="brand" />
        <StatCard
          label="Active accounts"
          value={formatNumber(summary.active)}
          hint="Able to buy tickets and deposit"
          icon={UserCheck}
          tone="emerald"
        />
        <StatCard
          label="Suspended accounts"
          value={formatNumber(summary.suspended)}
          hint="Blocked from further purchases"
          icon={Ban}
          tone={summary.suspended ? "warning" : "default"}
        />
        <StatCard
          label="Referred signups"
          value={formatNumber(summary.referred)}
          hint="Accounts that arrived through a referral code"
          icon={Sparkles}
          tone="gold"
        />
      </div>

      <Alert tone="info" className="mt-4" title="Full customer details">
        Names, phone numbers, email and address are shown in full to administrators only. Do not export
        or share them outside the business.
      </Alert>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          options={[
            { value: "all", label: "All" },
            { value: "active", label: "Active" },
            { value: "suspended", label: "Suspended" },
          ]}
          value={filter}
          onChange={setFilter}
          ariaLabel="Filter customers"
        />
        <div className="relative w-full sm:w-72">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, phone, email or referral code"
            className="pl-9"
            aria-label="Search customers"
          />
        </div>
      </div>

      <Card className="mt-4">
        <CardHeader
          icon={Users}
          title="Accounts"
          description={
            truncated
              ? `${rows.length} shown · list and search cover the ${CUSTOMER_LIST_LIMIT} most recent accounts`
              : `${rows.length} shown`
          }
        />
        <CardBody>
          {customers.loading ? (
            <Skeleton className="h-72" rounded="lg" />
          ) : (
            <DataTable
              columns={columns}
              rows={rows}
              keyOf={(row) => row.uid}
              caption="Customers"
              emptyTitle={debounced ? "No accounts match that search" : "No customer accounts"}
              emptyDescription={
                debounced
                  ? "Try a different name, phone number or referral code."
                  : "Accounts appear here after a customer completes phone verification."
              }
            />
          )}
        </CardBody>
      </Card>

      <Dialog
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        size="xl"
        dismissible={!busy}
        title={selected ? selected.fullName : "Customer"}
        description={selected ? `${selected.phone} · code ${selected.referralCode}` : undefined}
      >
        {selected ? (
          <div className="space-y-4">
            {error ? <FieldError>{error}</FieldError> : null}

            <div className="grid gap-3 sm:grid-cols-3">
              <SummaryTile
                icon={Wallet}
                label="Wallet balance"
                value={detail.data ? formatINR(detail.data.wallet.balancePaise) : "…"}
              />
              <SummaryTile
                icon={TicketIcon}
                label="Tickets held"
                value={detail.data ? formatNumber(detail.data.tickets.length) : "…"}
              />
              <SummaryTile
                icon={ShoppingBag}
                label="Orders"
                value={detail.data ? formatNumber(detail.data.orders.length) : "…"}
              />
            </div>

            <dl className="grid gap-2 sm:grid-cols-2">
              <Line label="Full name" value={selected.fullName} />
              <Line label="Phone" value={selected.phone} />
              <Line label="Email" value={selected.email || "—"} />
              <Line label="Address" value={selected.address || "—"} />
              <Line label="Customer ID" value={selected.uid} />
              <Line label="Referral code" value={selected.referralCode} />
              <Line label="Status" value={selected.status} />
              <Line label="Joined" value={formatDateTime(selected.createdAt)} />
              <Line label="Last login" value={formatDateTime(selected.lastLoginAt)} />
              <Line
                label="Referred by"
                value={
                  selected.referredByCode
                    ? `${selected.referredByCode}${detail.data?.referrer ? ` · ${detail.data.referrer.fullName}` : ""}`
                    : "Direct signup"
                }
              />
              <Line label="Referral eligible" value={selected.referralEligible ? "Yes" : "No"} />
              <Line
                label="Spins available"
                value={detail.data ? formatNumber((detail.data.spins as SpinAccount).availableSpins) : "…"}
              />
              {selected.suspendedReason ? (
                <Line label="Suspension reason" value={selected.suspendedReason} />
              ) : null}
            </dl>

            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">
                  Recent wallet entries
                </p>
                {detail.loading ? (
                  <Skeleton className="h-40" rounded="lg" />
                ) : (detail.data?.ledger ?? []).length ? (
                  <ul className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                    {(detail.data?.ledger ?? []).slice(0, 12).map((tx: WalletTransaction) => (
                      <li
                        key={tx.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-line bg-ivory/40 px-3 py-2 text-[12.5px]"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-ink">{tx.description}</p>
                          <p className="text-[11px] text-muted">{formatDateTime(tx.createdAt)}</p>
                        </div>
                        <span
                          className={
                            tx.direction === "credit"
                              ? "font-semibold tabular-nums text-emerald"
                              : "font-semibold tabular-nums text-status-booked"
                          }
                        >
                          {tx.direction === "credit" ? "+" : "−"}
                          {formatINR(tx.amountPaise)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="rounded-lg border border-line bg-ivory/40 px-3 py-6 text-center text-[12.5px] text-muted">
                    No wallet activity yet.
                  </p>
                )}
              </div>

              <div>
                <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">
                  Tickets held
                </p>
                {detail.loading ? (
                  <Skeleton className="h-40" rounded="lg" />
                ) : (detail.data?.tickets ?? []).length ? (
                  <div className="flex max-h-56 flex-wrap gap-1.5 overflow-y-auto pr-1">
                    {(detail.data?.tickets ?? []).map((ticket) => (
                      <span
                        key={ticket.id}
                        className="rounded-md border border-line bg-ivory px-2 py-1 text-[12px] font-semibold tabular-nums text-ink"
                      >
                        #{ticket.numberLabel}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-lg border border-line bg-ivory/40 px-3 py-6 text-center text-[12.5px] text-muted">
                    This account holds no tickets.
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-line bg-ivory/60 p-3.5">
              <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">
                <Coins className="size-3.5" aria-hidden />
                Adjust wallet balance
              </p>
              <p className="mt-1 text-[12px] text-muted">
                Current balance:{" "}
                <strong className="text-ink">{detail.data ? formatINR(detail.data.wallet.balancePaise) : "…"}</strong>
                . Every change is recorded in the customer's wallet history and the audit log.
              </p>
              <div className="mt-2.5 space-y-3">
                {adjustError ? <FieldError>{adjustError}</FieldError> : null}
                <Segmented
                  options={(Object.keys(ADJUST_LABEL) as AdjustMode[]).map((mode) => ({
                    value: mode,
                    label: ADJUST_LABEL[mode],
                  }))}
                  value={adjustMode}
                  onChange={setAdjustMode}
                  ariaLabel="Adjustment type"
                />
                <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
                  <div>
                    <Label htmlFor="adjust-amount" hint="Rupees">
                      {adjustMode === "set" ? "New balance" : "Amount"}
                    </Label>
                    <Input
                      id="adjust-amount"
                      inputMode="decimal"
                      value={adjustAmount}
                      onChange={(event) => setAdjustAmount(event.target.value.replace(/[^\d.]/g, ""))}
                      placeholder="e.g. 500"
                    />
                  </div>
                  <div>
                    <Label htmlFor="adjust-reason" hint="Shown to the customer">
                      Reason
                    </Label>
                    <Input
                      id="adjust-reason"
                      value={adjustReason}
                      onChange={(event) => setAdjustReason(event.target.value)}
                      placeholder="e.g. Cash received at counter"
                      maxLength={300}
                    />
                  </div>
                </div>
                <Button
                  variant="gold"
                  loading={adjusting}
                  onClick={() => void adjustWallet()}
                  iconLeft={<Wallet className="size-4" aria-hidden />}
                >
                  {ADJUST_LABEL[adjustMode]}
                </Button>
              </div>
            </div>

            <div className="rounded-xl border border-line bg-ivory/60 p-3.5">
              <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">
                Account control
              </p>
              <div className="mt-2.5 space-y-3">
                {selected.status === "active" ? (
                  <>
                    <div>
                      <Label htmlFor="suspend-reason" hint="Shown to the customer">
                        Suspension reason
                      </Label>
                      <Textarea
                        id="suspend-reason"
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        className="min-h-20"
                        placeholder="e.g. Multiple accounts created to claim duplicate referral rewards."
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="danger"
                        loading={busy}
                        onClick={() => void setStatus("suspended")}
                        iconLeft={<Ban className="size-4" aria-hidden />}
                      >
                        Suspend account
                      </Button>
                      <span className="text-[12px] text-muted">
                        Balances and tickets are preserved. Only new purchases are blocked.
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-[13px] text-muted">
                      This account is suspended{selected.suspendedReason ? `: ${selected.suspendedReason}` : "."}
                    </p>
                    <Button
                      variant="success"
                      loading={busy}
                      onClick={() => void setStatus("active")}
                      iconLeft={<CheckCircle2 className="size-4" aria-hidden />}
                    >
                      Reactivate account
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}

function SummaryTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-ivory/50 p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
        <Icon className="size-3.5" aria-hidden />
        {label}
      </p>
      <p className="mt-1 font-display text-[18px] font-bold tabular-nums text-ink">{value}</p>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-ivory/50 px-3 py-2 text-[13px]">
      <dt className="text-muted">{label}</dt>
      <dd className="max-w-[60%] truncate text-right text-ink">{value}</dd>
    </div>
  );
}
