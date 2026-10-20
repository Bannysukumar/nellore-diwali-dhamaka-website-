import { useMemo, useState, type ReactNode } from "react";
import { Eye, EyeOff, Search, Trophy, Trash2, Users } from "lucide-react";
import { useAsync } from "@/hooks/useAsync";
import { useToast } from "@/app/ToastProvider";
import { contentService } from "@/services/contentService";
import { drawService } from "@/services/drawService";
import { callBackend } from "@/lib/backend/callBackend";
import type { ModerateWinnerRequest, ModerateWinnerResponse } from "@/lib/backend/api";
import { useDebounced } from "@/hooks/useCollection";
import type { Draw, PrizeTier, WinnerAnnouncement } from "@/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
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

const TIER_TONE: Record<PrizeTier, "gold" | "neutral" | "brand" | "emerald"> = {
  gold: "gold",
  silver: "neutral",
  bronze: "brand",
  special: "emerald",
};

export function AdminWinnersPage() {
  const toast = useToast();
  const [filter, setFilter] = useState<"all" | "published" | "draft">("all");
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search, 300).trim().toLowerCase();
  const [selected, setSelected] = useState<WinnerAnnouncement | null>(null);
  const [removing, setRemoving] = useState<WinnerAnnouncement | null>(null);
  const [busy, setBusy] = useState(false);

  const winners = useAsync(() => contentService.allWinners(400), []);
  const draws = useAsync(() => drawService.listAll(200), []);

  const drawById = useMemo(() => {
    const map = new Map<string, Draw>();
    (draws.data ?? []).forEach((d) => map.set(d.id, d));
    return map;
  }, [draws.data]);

  const rows = useMemo(() => {
    let all = winners.data ?? [];
    if (filter !== "all") all = all.filter((w) => w.status === filter);
    if (debounced) {
      all = all.filter(
        (w) =>
          w.drawTitle.toLowerCase().includes(debounced) ||
          w.prizeTitle.toLowerCase().includes(debounced) ||
          w.ticketNumberMasked.toLowerCase().includes(debounced) ||
          w.winnerDisplayName.toLowerCase().includes(debounced),
      );
    }
    return all;
  }, [winners.data, filter, debounced]);

  const summary = useMemo(() => {
    const all = winners.data;
    if (!all) return { total: null, published: null, draft: null, draws: null };
    return {
      total: all.length,
      published: all.filter((w) => w.status === "published").length,
      draft: all.filter((w) => w.status === "draft").length,
      draws: new Set(all.map((w) => w.drawId)).size,
    };
  }, [winners.data]);

  const setStatus = async (winner: WinnerAnnouncement, status: "published" | "draft") => {
    setBusy(true);
    try {
      await callBackend<ModerateWinnerRequest, ModerateWinnerResponse>("moderateWinner", {
        winnerId: winner.id,
        action: status === "published" ? "publish" : "hide",
      });
      toast.success(
        status === "published" ? "Winner published" : "Winner hidden",
        status === "published"
          ? "The announcement is now visible on the winners page."
          : "The announcement is hidden from the public again.",
      );
      winners.reload();
    } catch (error) {
      toast.error("Could not update", error instanceof Error ? error.message : "Please retry.");
    } finally {
      setBusy(false);
    }
  };

  const confirmRemove = async () => {
    if (!removing) return;
    try {
      await callBackend<ModerateWinnerRequest, ModerateWinnerResponse>("moderateWinner", {
        winnerId: removing.id,
        action: "delete",
      });
      toast.success("Announcement deleted", "The stored draw result is unchanged.");
      setRemoving(null);
      winners.reload();
    } catch (error) {
      toast.error("Could not delete", error instanceof Error ? error.message : "Please retry.");
    }
  };

  const columns: Array<Column<WinnerAnnouncement>> = [
    {
      key: "winner",
      header: "Winner",
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{row.winnerDisplayName}</p>
          <p className="font-mono text-[11px] text-muted">#{row.ticketNumberMasked}</p>
        </div>
      ),
    },
    {
      key: "prize",
      header: "Prize",
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-ink">{row.prizeTitle}</p>
          <Badge tone={TIER_TONE[row.prizeTier]}>{row.prizeTier}</Badge>
        </div>
      ),
    },
    {
      key: "draw",
      header: "Draw",
      hideBelow: "md",
      render: (row) => (
        <span className="text-[12.5px] text-muted">{drawById.get(row.drawId)?.title ?? row.drawTitle}</span>
      ),
    },
    {
      key: "published",
      header: "Published",
      hideBelow: "sm",
      render: (row) => <span className="text-muted">{formatDateTime(row.publishedAt)}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <Badge tone={row.status === "published" ? "emerald" : "warning"}>{row.status}</Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (row) => (
        <div className="flex flex-wrap justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => setSelected(row)}>
            View
          </Button>
          {row.status === "published" ? (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void setStatus(row, "draft")}
              iconLeft={<EyeOff className="size-3.5" aria-hidden />}
            >
              Hide
            </Button>
          ) : (
            <Button
              size="sm"
              variant="success"
              disabled={busy}
              onClick={() => void setStatus(row, "published")}
              iconLeft={<Eye className="size-3.5" aria-hidden />}
            >
              Publish
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setRemoving(row)} aria-label="Delete announcement">
            <Trash2 className="size-3.5 text-brand" aria-hidden />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Draws & prizes"
        icon={Trophy}
        title="Winners"
        description="Announcements created when draw results are published. Names and ticket numbers are shown masked so a winner cannot be individually identified from this page alone."
      />

      <LoadErrors className="mt-5" sources={[winners, draws]} />

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Announcements" value={formatNumber(summary.total)} icon={Trophy} tone="brand" />
        <StatCard
          label="Published"
          value={formatNumber(summary.published)}
          hint="Visible on the public winners page"
          icon={Eye}
          tone="emerald"
        />
        <StatCard
          label="Draft"
          value={formatNumber(summary.draft)}
          hint="Written but not yet public"
          icon={EyeOff}
          tone={summary.draft ? "warning" : "default"}
        />
        <StatCard
          label="Draws with winners"
          value={formatNumber(summary.draws)}
          icon={Users}
          tone="gold"
        />
      </div>

      <Alert tone="warning" className="mt-4" title="Never fabricate a winner">
        Announcements are generated only from an executed draw. Publishing a result that was not actually
        drawn, or editing a stored result, would misrepresent the outcome of a chance-based promotion and is
        strictly prohibited.
      </Alert>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          options={[
            { value: "all", label: "All" },
            { value: "published", label: "Published" },
            { value: "draft", label: "Draft" },
          ]}
          value={filter}
          onChange={setFilter}
          ariaLabel="Filter winners"
        />
        <div className="relative w-full sm:w-72">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search draw, prize or ticket"
            className="pl-9"
            aria-label="Search winners"
          />
        </div>
      </div>

      <Card className="mt-4">
        <CardHeader icon={Trophy} title="Winner announcements" description="Newest first." />
        <CardBody>
          {winners.loading ? (
            <Skeleton className="h-72" rounded="lg" />
          ) : (
            <DataTable
              columns={columns}
              rows={rows}
              keyOf={(row) => row.id}
              caption="Winners"
              emptyTitle={debounced ? "No winners match that search" : "No winners announced yet"}
              emptyDescription={
                debounced
                  ? "Try a different draw, prize or ticket number."
                  : "Run a draw and publish its results to create announcements."
              }
            />
          )}
        </CardBody>
      </Card>

      <Dialog
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="Winner announcement"
        description="Exactly as stored. Display name and ticket number are masked."
      >
        {selected ? (
          <div className="space-y-4">
            <dl className="grid gap-2">
              <Line label="Draw" value={drawById.get(selected.drawId)?.title ?? selected.drawTitle} />
              <Line
                label="Prize tier"
                value={<Badge tone={TIER_TONE[selected.prizeTier]}>{selected.prizeTier}</Badge>}
              />
              <Line label="Prize" value={selected.prizeTitle} />
              <Line label="Winner (display)" value={selected.winnerDisplayName} />
              <Line label="Ticket (masked)" value={`#${selected.ticketNumberMasked}`} />
              <Line
                label="Status"
                value={
                  <Badge tone={selected.status === "published" ? "emerald" : "warning"}>
                    {selected.status}
                  </Badge>
                }
              />
              <Line label="Created" value={formatDateTime(selected.createdAt)} />
              <Line label="Published" value={formatDateTime(selected.publishedAt)} />
            </dl>
            <p className="rounded-xl border border-line bg-ivory/60 p-3 text-[13px] leading-relaxed text-ink">
              {selected.prizeDescription}
            </p>
          </div>
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={() => void confirmRemove()}
        tone="danger"
        title="Delete this announcement?"
        description="The stored draw result is preserved, but this public announcement will be removed. Hiding is usually safer than deleting."
        confirmLabel="Delete announcement"
      />
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
