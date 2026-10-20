import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Clock, Search, Sparkles, UserCheck, Users } from "lucide-react";
import { useAsync } from "@/hooks/useAsync";
import { useToast } from "@/app/ToastProvider";
import { rewardService } from "@/services/rewardService";
import { callBackend } from "@/lib/backend/callBackend";
import type { ModerateReferralRequest, ModerateReferralResponse } from "@/lib/backend/api";
import { useDebounced } from "@/hooks/useCollection";
import type { Referral, ReferralStatus } from "@/types";
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
import { formatDateTime, formatNumber } from "@/utils/format";

const STATUS_TONE: Record<ReferralStatus, "warning" | "emerald" | "danger"> = {
  pending: "warning",
  qualified: "emerald",
  rejected: "danger",
};

export function AdminReferralsPage() {
  const toast = useToast();
  const [filter, setFilter] = useState<"all" | ReferralStatus>("all");
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search, 300).trim().toLowerCase();
  const [selected, setSelected] = useState<Referral | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const referrals = useAsync(
    () => rewardService.allReferrals(500, filter === "all" ? undefined : filter),
    [filter],
  );
  const summaryState = useAsync(() => rewardService.referralSummary(), []);

  const rows = useMemo(() => {
    let all = referrals.data ?? [];
    if (debounced) {
      all = all.filter(
        (r) =>
          r.referrerName.toLowerCase().includes(debounced) ||
          r.code.toLowerCase().includes(debounced) ||
          r.refereePhoneMasked.toLowerCase().includes(debounced),
      );
    }
    return all;
  }, [referrals.data, debounced]);

  const summary = {
    total: summaryState.data?.total,
    qualified: summaryState.data?.qualified,
    pending: summaryState.data?.pending,
    spins: summaryState.data?.spinsGranted,
  };

  const moderate = async (status: "qualified" | "rejected") => {
    if (!selected) return;
    setError(null);
    if (status === "rejected" && note.trim().length < 4) {
      setError("Give a reason for rejecting this referral.");
      return;
    }
    setBusy(true);
    try {
      // Granting spins is server-side: the spin account and the referral
      // change together, exactly once, and the action is audit-logged there.
      const result = await callBackend<ModerateReferralRequest, ModerateReferralResponse>("moderateReferral", {
        referralId: selected.id,
        decision: status === "qualified" ? "qualify" : "reject",
        note: note.trim() || undefined,
      });
      toast.success(
        status === "qualified" ? "Referral qualified" : "Referral rejected",
        status === "qualified"
          ? result.spinsGranted > 0
            ? `${result.spinsGranted} spin(s) credited to ${selected.referrerName}.`
            : `${selected.referrerName} is already at the spin balance cap; no spins were added.`
          : "The referrer will not receive a reward for this referral.",
      );
      setSelected(null);
      setNote("");
      referrals.reload();
      summaryState.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The referral could not be updated.");
    } finally {
      setBusy(false);
    }
  };

  const columns: Array<Column<Referral>> = [
    {
      key: "referrer",
      header: "Referrer",
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{row.referrerName}</p>
          <p className="font-mono text-[11px] text-muted">{row.code}</p>
        </div>
      ),
    },
    {
      key: "referee",
      header: "New participant",
      render: (row) => <span className="text-[12.5px] text-muted">{row.refereePhoneMasked}</span>,
    },
    {
      key: "created",
      header: "Recorded",
      hideBelow: "sm",
      render: (row) => <span className="text-muted">{formatDateTime(row.createdAt)}</span>,
    },
    {
      key: "qualified",
      header: "Qualified",
      hideBelow: "md",
      render: (row) => <span className="text-muted">{formatDateTime(row.qualifiedAt)}</span>,
    },
    {
      key: "spins",
      header: "Spins",
      align: "right",
      hideBelow: "sm",
      render: (row) => <span className="tabular-nums text-muted">{row.rewardSpins}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <Badge tone={STATUS_TONE[row.status]}>{row.status}</Badge>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (row) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setSelected(row);
            setNote(row.note ?? "");
            setError(null);
          }}
        >
          Review
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="People"
        icon={Users}
        title="Referrals"
        description="Track who invited whom and decide whether a referral satisfies the published rules. Reward spins are only granted when you qualify the referral here."
      />

      <LoadErrors className="mt-5" sources={[referrals, summaryState]} />

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total referrals" value={formatNumber(summary.total)} icon={Users} tone="brand" />
        <StatCard
          label="Qualified"
          value={formatNumber(summary.qualified)}
          hint="Rewards granted"
          icon={CheckCircle2}
          tone="emerald"
        />
        <StatCard
          label="Pending review"
          value={formatNumber(summary.pending)}
          hint="Awaiting a manual decision"
          icon={Clock}
          tone={summary.pending ? "warning" : "default"}
        />
        <StatCard
          label="Spins granted"
          value={formatNumber(summary.spins)}
          hint="Total reward spins awarded via referrals"
          icon={Sparkles}
          tone="gold"
        />
      </div>

      <Alert tone="warning" className="mt-4" title="Guard against abuse">
        <span className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-gold-deep" aria-hidden />
          Self-referrals, duplicate devices and accounts created solely to farm rewards must be rejected.
          Qualifying a referral credits spins immediately — verify first.
        </span>
      </Alert>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          options={[
            { value: "all", label: "All" },
            { value: "pending", label: "Pending" },
            { value: "qualified", label: "Qualified" },
            { value: "rejected", label: "Rejected" },
          ]}
          value={filter}
          onChange={setFilter}
          ariaLabel="Filter referrals"
        />
        <div className="relative w-full sm:w-72">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search referrer, code or phone"
            className="pl-9"
            aria-label="Search referrals"
          />
        </div>
      </div>

      <Card className="mt-4">
        <CardHeader icon={UserCheck} title="Referral records" description="Newest first." />
        <CardBody>
          {referrals.loading ? (
            <Skeleton className="h-72" rounded="lg" />
          ) : (
            <DataTable
              columns={columns}
              rows={rows}
              keyOf={(row) => row.id}
              caption="Referrals"
              emptyTitle={debounced ? "No referrals match that search" : "No referrals recorded"}
              emptyDescription={
                debounced
                  ? "Try a different name, code or phone number."
                  : "A record is created when a new participant registers with someone's code."
              }
            />
          )}
        </CardBody>
      </Card>

      <Dialog
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        dismissible={!busy}
        title="Review referral"
        description="Qualifying credits the referrer's spin balance immediately."
      >
        {selected ? (
          <div className="space-y-4">
            {error ? <FieldError>{error}</FieldError> : null}

            <dl className="grid gap-2">
              <Line label="Referrer" value={selected.referrerName} />
              <Line label="Code" value={selected.code} />
              <Line label="New participant" value={selected.refereePhoneMasked} />
              <Line label="Recorded" value={formatDateTime(selected.createdAt)} />
              <Line
                label="Status"
                value={<Badge tone={STATUS_TONE[selected.status]}>{selected.status}</Badge>}
              />
              <Line label="Spins on qualify" value={String(selected.rewardSpins)} />
            </dl>

            {selected.note ? (
              <p className="rounded-xl border border-line bg-ivory/60 p-3 text-[13px] leading-relaxed text-ink">
                {selected.note}
              </p>
            ) : null}

            <div>
              <Label htmlFor="referral-note" hint="Recorded on the referral and in the audit log">
                Decision note
              </Label>
              <Textarea
                id="referral-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="min-h-20"
                placeholder="e.g. Verified distinct device and phone number."
              />
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="danger"
                loading={busy}
                disabled={selected.status === "rejected"}
                onClick={() => void moderate("rejected")}
              >
                Reject referral
              </Button>
              <Button
                variant="success"
                loading={busy}
                disabled={selected.status === "qualified"}
                onClick={() => void moderate("qualified")}
                iconLeft={<CheckCircle2 className="size-4" aria-hidden />}
              >
                Qualify &amp; grant spins
              </Button>
            </div>
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
