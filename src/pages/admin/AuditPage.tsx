import { useMemo, useState, type ReactNode } from "react";
import { Download, Info, Search, ShieldCheck, UserCog } from "lucide-react";
import { useAsync } from "@/hooks/useAsync";
import { adminService } from "@/services/adminService";
import { useDebounced } from "@/hooks/useCollection";
import type { AdminAuditLog } from "@/types";
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
import { formatDateTime, formatNumber } from "@/utils/format";

const GROUP_TONE: Record<string, "brand" | "emerald" | "gold" | "warning" | "muted"> = {
  deposit: "emerald",
  review: "emerald",
  ticket: "brand",
  draw: "gold",
  winner: "gold",
  user: "warning",
  reward: "brand",
  spin: "brand",
  settings: "muted",
  banner: "muted",
  splash: "muted",
  legal: "muted",
  notification: "muted",
};

export function AdminAuditPage() {
  const [filter, setFilter] = useState<"all" | "money" | "draws" | "people" | "content">("all");
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search, 300).trim().toLowerCase();
  const [selected, setSelected] = useState<AdminAuditLog | null>(null);

  const logs = useAsync(() => adminService.auditLogs(500), []);

  const rows = useMemo(() => {
    let all = logs.data ?? [];
    if (filter === "money") {
      all = all.filter((l) => l.action.startsWith("deposit") || l.action.startsWith("review") || l.action.startsWith("wallet"));
    } else if (filter === "draws") {
      all = all.filter((l) => l.action.startsWith("draw") || l.action.startsWith("winner") || l.action.startsWith("spin"));
    } else if (filter === "people") {
      all = all.filter((l) => l.action.startsWith("user") || l.action.startsWith("referral"));
    } else if (filter === "content") {
      all = all.filter(
        (l) =>
          l.action.startsWith("banner") ||
          l.action.startsWith("splash") ||
          l.action.startsWith("legal") ||
          l.action.startsWith("notification") ||
          l.action.startsWith("settings") ||
          l.action.startsWith("reward"),
      );
    }
    if (debounced) {
      all = all.filter(
        (l) =>
          l.action.toLowerCase().includes(debounced) ||
          l.entityId.toLowerCase().includes(debounced) ||
          l.actorName.toLowerCase().includes(debounced) ||
          (l.note?.toLowerCase().includes(debounced) ?? false),
      );
    }
    return all;
  }, [logs.data, filter, debounced]);

  const actors = useMemo(() => {
    const map = new Map<string, number>();
    (logs.data ?? []).forEach((l) => {
      const name = l.actorName || "System / legacy";
      map.set(name, (map.get(name) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [logs.data]);

  const exportCsv = () => {
    const lines = ["Timestamp,Actor,Action,Entity,Entity id,Note"];
    rows.forEach((row) => {
      lines.push(
        [
          row.createdAt,
          quote(row.actorName),
          row.action,
          row.entity,
          row.entityId,
          quote(row.note ?? ""),
        ].join(","),
      );
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ndd-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const columns: Array<Column<AdminAuditLog>> = [
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
            {row.entity}/{shortId(row.entityId)}
          </p>
        </div>
      ),
    },
    {
      key: "actor",
      header: "Actor",
      hideBelow: "sm",
      render: (row) => <span className="text-[12.5px] text-muted">{row.actorName || "—"}</span>,
    },
    {
      key: "group",
      header: "Category",
      hideBelow: "md",
      render: (row) => <Badge tone={groupTone(row.action)}>{row.action.split(".")[0]}</Badge>,
    },
    {
      key: "note",
      header: "Note",
      hideBelow: "lg",
      render: (row) => <span className="line-clamp-1 text-[12.5px] text-muted">{row.note ?? "—"}</span>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (row) => (
        <Button size="sm" variant="ghost" onClick={() => setSelected(row)}>
          Inspect
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="System"
        icon={ShieldCheck}
        title="Audit log"
        description="An append-only record of every privileged action. Entries are written by the backend and are never edited or deleted — this is the accountability trail for the platform."
        actions={
          <Button
            variant="outline"
            onClick={exportCsv}
            disabled={logs.loading || !rows.length}
            iconLeft={<Download className="size-4" aria-hidden />}
          >
            Export CSV
          </Button>
        }
      />

      <LoadErrors className="mt-5" sources={[logs]} />

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Logged actions"
          value={formatNumber(logs.data?.length)}
          hint="Within the most recent 500 entries"
          icon={ShieldCheck}
          tone="brand"
        />
        <StatCard
          label="Distinct operators"
          value={formatNumber(actors.length)}
          hint="Accounts that performed privileged actions"
          icon={UserCog}
          tone="gold"
        />
        <StatCard label="Entries shown" value={formatNumber(rows.length)} hint="After filters" icon={Info} />
        <StatCard
          label="Most recent"
          value={logs.data?.[0] ? formatDateTime(logs.data[0].createdAt) : "—"}
          hint="Latest recorded action"
        />
      </div>

      <Alert tone="info" className="mt-4" title="Why this matters">
        If a deposit is approved, a draw is executed or a customer is suspended, the decision and its author
        are recorded here with the before/after state where available. Export this log during any
        reconciliation or dispute review.
      </Alert>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          options={[
            { value: "all", label: "All" },
            { value: "money", label: "Money" },
            { value: "draws", label: "Draws & prizes" },
            { value: "people", label: "People" },
            { value: "content", label: "Content & config" },
          ]}
          value={filter}
          onChange={setFilter}
          ariaLabel="Filter audit log"
        />
        <div className="relative w-full sm:w-72">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search action, entity or operator"
            className="pl-9"
            aria-label="Search audit log"
          />
        </div>
      </div>

      <Card className="mt-4">
        <CardHeader icon={ShieldCheck} title="Recorded actions" description="Newest first." />
        <CardBody>
          {logs.loading ? (
            <Skeleton className="h-72" rounded="lg" />
          ) : (
            <DataTable
              columns={columns}
              rows={rows}
              keyOf={(row) => row.id}
              caption="Audit log"
              emptyTitle={debounced ? "No actions match that search" : "No actions recorded"}
              emptyDescription={
                debounced
                  ? "Try a different action name, entity id or operator."
                  : "Approving a deposit, running a draw or changing settings is recorded here."
              }
            />
          )}
        </CardBody>
      </Card>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardHeader icon={UserCog} title="Operators" description="Who is acting on this platform." />
          <CardBody>
            {actors.length ? (
              <ul className="space-y-2">
                {actors.map((actor) => (
                  <li
                    key={actor.name}
                    className="flex items-center justify-between gap-3 rounded-xl border border-line bg-ivory/50 px-3 py-2 text-[13px]"
                  >
                    <span className="truncate text-ink">{actor.name}</span>
                    <span className="tabular-nums text-muted">{formatNumber(actor.count)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-[13px] text-muted">No operator activity yet.</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader icon={Info} title="Retention" description="How long records are kept." />
          <CardBody className="space-y-2.5 text-[12.5px] leading-relaxed text-muted">
            <p>
              Audit entries are stored indefinitely by default. Firestore rules block all writes from the
              client — only the backend can append an entry, and nothing can update or delete one.
            </p>
            <p>
              Wallet ledger entries follow the same append-only rule, which is what makes a balance
              reconstruction possible if a dispute arises.
            </p>
          </CardBody>
        </Card>
      </div>

      <Dialog
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        size="lg"
        title="Audit entry"
        description="Immutable record, shown exactly as stored."
      >
        {selected ? (
          <div className="space-y-4">
            <dl className="grid gap-2">
              <Line label="Action" value={<span className="font-mono text-[12px]">{selected.action}</span>} />
              <Line label="Actor" value={selected.actorName || "—"} />
              <Line
                label="Actor uid"
                value={<span className="font-mono text-[12px]">{selected.actorUid || "—"}</span>}
              />
              <Line label="Entity" value={`${selected.entity}/${selected.entityId}`} />
              <Line label="Recorded" value={formatDateTime(selected.createdAt)} />
            </dl>

            {selected.note ? (
              <div>
                <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">Note</p>
                <p className="rounded-xl border border-line bg-ivory/60 p-3 text-[13px] leading-relaxed text-ink">
                  {selected.note}
                </p>
              </div>
            ) : null}

            {selected.before !== undefined || selected.after !== undefined ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <JsonBlock label="Before" value={selected.before} />
                <JsonBlock label="After" value={selected.after} />
              </div>
            ) : null}
          </div>
        ) : null}
      </Dialog>
    </>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</p>
      <pre className="max-h-48 overflow-auto rounded-xl border border-line bg-maroon-deep/95 p-3 text-[11.5px] leading-relaxed text-ivory">
        {value === undefined ? "—" : JSON.stringify(value, null, 2)}
      </pre>
    </div>
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

function groupTone(action: string) {
  const group = action.split(".")[0];
  return GROUP_TONE[group] ?? "muted";
}

function shortId(id: string): string {
  return id.length > 14 ? `${id.slice(0, 10)}…` : id;
}

function quote(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
