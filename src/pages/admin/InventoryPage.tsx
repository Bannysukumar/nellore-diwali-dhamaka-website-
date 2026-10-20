import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, LayoutGrid, Lock, RefreshCw, Search, Ticket as TicketIcon, Unlock } from "lucide-react";
import { useAsync } from "@/hooks/useAsync";
import { useDebounced } from "@/hooks/useCollection";
import { useToast } from "@/app/ToastProvider";
import { store } from "@/lib/backend";
import { adminService } from "@/services/adminService";
import { drawService } from "@/services/drawService";
import { ticketService } from "@/services/ticketService";
import type { Ticket } from "@/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Input,
  Label,
  LoadErrors,
  Segmented,
  Select,
  Skeleton,
  Textarea,
  TicketStatusBadge,
} from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { DrawStatusBadge } from "@/features/draws/DrawMeta";
import { TicketCounters, TicketGrid } from "@/features/tickets/TicketGrid";
import { formatINR } from "@/utils/money";
import { formatDateTime, formatNumber } from "@/utils/format";

const PAGE_SIZE = 120;

type StatusFilter = "all" | "available" | "booked" | "pending" | "blocked";

export function AdminInventoryPage() {
  const toast = useToast();
  const draws = useAsync(() => drawService.listAll(100), []);
  const [drawId, setDrawId] = useState<string>("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search, 350);
  const [searchResults, setSearchResults] = useState<Ticket[]>([]);
  const [searching, setSearching] = useState(false);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [cursor, setCursor] = useState<string | number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [blocking, setBlocking] = useState<Ticket | null>(null);
  const [blockReason, setBlockReason] = useState("");
  const [savingBlock, setSavingBlock] = useState(false);

  const allDraws = useMemo(() => draws.data ?? [], [draws.data]);
  const draw = allDraws.find((d) => d.id === drawId) ?? null;

  useEffect(() => {
    if (!drawId && allDraws.length) setDrawId(allDraws[0].id);
  }, [drawId, allDraws]);

  const stats = useAsync(
    async () => (drawId ? await drawService.stats(drawId) : null),
    [drawId, refreshKey],
    { enabled: Boolean(drawId) },
  );

  useEffect(() => {
    if (!drawId) return;
    let cancelled = false;
    setLoading(true);
    setListError(null);
    ticketService
      .page({ drawId, status, limit: PAGE_SIZE })
      .then((result) => {
        if (cancelled) return;
        setTickets(result.items);
        setCursor(result.cursor);
        setHasMore(result.hasMore);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setListError(error instanceof Error ? error.message : "Inventory could not be loaded.");
        setTickets([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [drawId, status, refreshKey]);

  useEffect(() => {
    if (!drawId || debouncedSearch.trim().length < 3) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    ticketService
      .search(drawId, debouncedSearch, 60)
      .then((rows) => {
        if (!cancelled) setSearchResults(rows);
      })
      .catch(() => {
        if (!cancelled) setSearchResults([]);
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [drawId, debouncedSearch, refreshKey]);

  const loadMore = async () => {
    if (!drawId || cursor === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await ticketService.page({
        drawId,
        status,
        cursor: typeof cursor === "number" ? cursor : undefined,
        limit: PAGE_SIZE,
      });
      setTickets((current) => [...current, ...result.items]);
      setCursor(result.cursor);
      setHasMore(result.hasMore);
    } catch (error) {
      toast.error("Could not load more", error instanceof Error ? error.message : "Please retry.");
    } finally {
      setLoadingMore(false);
    }
  };

  const applyBlock = async () => {
    if (!blocking || !drawId) return;
    setSavingBlock(true);
    try {
      // Blocking reserves inventory from sale. It never touches ownership or money.
      await store.update("tickets", blocking.id, {
        status: "blocked",
        blockedReason: blockReason.trim() || "Reserved by administration",
        updatedAt: new Date().toISOString(),
      });
      await adminService.log({
        actorUid: "",
        actorName: "",
        action: "ticket.block",
        entity: "tickets",
        entityId: blocking.id,
        note: blockReason.trim() || "Reserved by administration",
        before: { status: blocking.status },
        after: { status: "blocked" },
      });
      toast.success("Ticket blocked", `#${blocking.numberLabel} is no longer available for sale.`);
      setBlocking(null);
      setBlockReason("");
      setRefreshKey((n) => n + 1);
    } catch (error) {
      toast.error("Could not block", error instanceof Error ? error.message : "Please retry.");
    } finally {
      setSavingBlock(false);
    }
  };

  const releaseTicket = useCallback(
    async (ticket: Ticket) => {
      if (ticket.status !== "blocked") {
        toast.info("Only blocked numbers can be released", "Booked tickets belong to a customer.");
        return;
      }
      try {
        await store.update("tickets", ticket.id, {
          status: "available",
          blockedReason: undefined,
          updatedAt: new Date().toISOString(),
        });
        await adminService.log({
          actorUid: "",
          actorName: "",
          action: "ticket.release",
          entity: "tickets",
          entityId: ticket.id,
          note: `Released #${ticket.numberLabel} back to sale`,
          before: { status: "blocked" },
          after: { status: "available" },
        });
        toast.success("Ticket released", `#${ticket.numberLabel} is available again.`);
        setRefreshKey((n) => n + 1);
      } catch (error) {
        toast.error("Could not release", error instanceof Error ? error.message : "Please retry.");
      }
    },
    [toast],
  );

  const searchActive = debouncedSearch.trim().length >= 3;

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        icon={TicketIcon}
        title="Ticket inventory"
        description="Inspect availability number by number. The grid is always paged — a draw is never loaded in full."
        actions={
          <Button
            variant="outline"
            onClick={() => setRefreshKey((n) => n + 1)}
            iconLeft={<RefreshCw className="size-4" aria-hidden />}
          >
            Refresh
          </Button>
        }
      />

      <LoadErrors className="mt-5" sources={[draws, stats]} />

      {draws.loading ? (
        <Skeleton className="mt-5 h-32" rounded="lg" />
      ) : draws.error ? null : !allDraws.length ? (
        <div className="mt-5">
          <EmptyState
            title="No draws configured"
            description="Create a draw and generate its inventory before inspecting tickets."
          />
        </div>
      ) : (
        <>
          <Card className="mt-5">
            <CardBody className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <div>
                  <Label htmlFor="inv-draw">Draw</Label>
                  <Select
                    id="inv-draw"
                    value={drawId}
                    onChange={(event) => setDrawId(event.target.value)}
                  >
                    {allDraws.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title} ({item.status.replace(/_/g, " ")})
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  {draw ? <DrawStatusBadge status={draw.status} /> : null}
                </div>
              </div>

              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
                  aria-hidden
                />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search an exact ticket number, e.g. 100245"
                  className="pl-9"
                  inputMode="numeric"
                  aria-label="Search ticket numbers"
                />
              </div>

              <Segmented
                options={[
                  { value: "all", label: "All" },
                  { value: "available", label: "Available" },
                  { value: "booked", label: "Booked" },
                  { value: "pending", label: "Pending" },
                  { value: "blocked", label: "Blocked" },
                ]}
                value={status}
                onChange={setStatus}
                ariaLabel="Filter inventory"
              />

              {stats.data ? (
                <TicketCounters
                  total={stats.data.total}
                  available={stats.data.available}
                  pending={stats.data.pending}
                  booked={stats.data.booked}
                  blocked={stats.data.blocked}
                />
              ) : null}
            </CardBody>
          </Card>

          {!draw?.published || draw?.status === "draft" ? (
            <Alert tone="info" className="mt-4" title="This draw is not visible to customers">
              Inventory can still be inspected, but numbers cannot be purchased until the draw is
              published, its status is “open” and paid draws are enabled.
            </Alert>
          ) : null}

          {!draw ? null : searchActive ? (
            <Card className="mt-4">
              <CardHeader
                title={`Search results for “${debouncedSearch.trim()}”`}
                description="Exact matches from this draw only."
                action={
                  <Button variant="ghost" size="sm" onClick={() => setSearch("")}>
                    Clear
                  </Button>
                }
              />
              <CardBody className="space-y-4">
                {searchResults.length ? (
                  <>
                    <TicketGrid
                      tickets={searchResults}
                      selectedIds={new Set()}
                      selectable={false}
                      onToggle={() => undefined}
                    />
                    <ul className="divide-y divide-line">
                      {searchResults.map((ticket) => (
                        <li key={ticket.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <span className="font-display text-[15px] tabular-nums text-ink">
                              #{ticket.numberLabel}
                            </span>
                            <TicketStatusBadge status={ticket.status} />
                          </div>
                          <div className="flex items-center gap-2 text-[12px] text-muted">
                            <span>{ticket.ownerMaskedName ?? "Unassigned"}</span>
                            {ticket.status === "blocked" ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => void releaseTicket(ticket)}
                                iconLeft={<Unlock className="size-3.5" aria-hidden />}
                              >
                                Release
                              </Button>
                            ) : ticket.status === "available" ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setBlocking(ticket);
                                  setBlockReason("");
                                }}
                                iconLeft={<Lock className="size-3.5" aria-hidden />}
                              >
                                Block
                              </Button>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="py-6 text-center text-[13px] text-muted">
                    {searching ? "Searching…" : "No ticket number matches that search."}
                  </p>
                )}
              </CardBody>
            </Card>
          ) : listError ? (
            <div className="mt-4">
              <ErrorState description={listError} onRetry={() => setRefreshKey((n) => n + 1)} />
            </div>
          ) : loading ? (
            <div className="mt-4 grid grid-cols-5 gap-1.5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12">
              {Array.from({ length: 84 }).map((_, index) => (
                <Skeleton key={index} className="aspect-square" rounded="sm" />
              ))}
            </div>
          ) : tickets.length ? (
            <Card className="mt-4">
              <CardBody>
                <TicketGrid
                  tickets={tickets}
                  selectedIds={new Set()}
                  selectable={false}
                  onToggle={() => undefined}
                />
                <div className="mt-4 flex flex-col items-center gap-2">
                  <p className="text-[12px] text-muted">
                    Showing {formatNumber(tickets.length)} of{" "}
                    {formatNumber(stats.data?.total ?? tickets.length)} numbers
                  </p>
                  {hasMore ? (
                    <Button variant="outline" onClick={() => void loadMore()} loading={loadingMore}>
                      Load more numbers
                    </Button>
                  ) : null}
                </div>
              </CardBody>
            </Card>
          ) : (
            <div className="mt-4">
              <EmptyState
                title="No tickets match this filter"
                description="Switch the status filter to inspect other numbers in this draw."
                action={
                  <Button variant="outline" onClick={() => setStatus("all")}>
                    Show all numbers
                  </Button>
                }
              />
            </div>
          )}

          <Card className="mt-4">
            <CardHeader icon={LayoutGrid} title="Administrative controls" />
            <CardBody className="space-y-3 text-[12.5px] leading-relaxed text-muted">
              <p className="flex items-start gap-2">
                <Lock className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                Blocking a number reserves it from sale. It never changes ownership, prices or the
                ledger — a booked ticket always belongs to the customer who paid for it.
              </p>
              <p className="flex items-start gap-2">
                <Ban className="mt-0.5 size-4 shrink-0 text-status-pending" aria-hidden />
                Blocked numbers are shown to customers as unavailable, with no reason disclosed.
              </p>
              <p>
                Inventory is generated from the draw configuration. Numbers are never edited by hand —
                regenerate the draw instead of patching individual rows.
              </p>
            </CardBody>
          </Card>
        </>
      )}

      <ConfirmDialog
        open={Boolean(blocking)}
        onClose={() => setBlocking(null)}
        onConfirm={() => void applyBlock()}
        busy={savingBlock}
        title={blocking ? `Block ticket #${blocking.numberLabel}` : "Block ticket"}
        description="The number becomes unavailable for purchase until you release it."
        confirmLabel="Block this number"
      >
        <div className="space-y-3">
          <dl className="space-y-1.5 rounded-xl border border-line bg-ivory/60 p-3 text-[13px]">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Number</dt>
              <dd className="font-display tabular-nums text-ink">#{blocking?.numberLabel}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Price</dt>
              <dd className="tabular-nums text-ink">
                {blocking ? formatINR(blocking.pricePaise) : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Last updated</dt>
              <dd className="text-ink">{blocking ? formatDateTime(blocking.updatedAt) : "—"}</dd>
            </div>
          </dl>
          <div>
            <Label htmlFor="block-reason" hint="Internal only">
              Reason
            </Label>
            <Textarea
              id="block-reason"
              value={blockReason}
              onChange={(event) => setBlockReason(event.target.value)}
              placeholder="e.g. Reserved for a physical counter sale."
              className="min-h-20"
            />
          </div>
          <div className="flex items-center gap-2">
            <Badge tone="muted">{blocking ? blocking.status : "—"}</Badge>
            <span className="text-[12px] text-muted">Status before blocking</span>
          </div>
        </div>
      </ConfirmDialog>
    </>
  );
}
