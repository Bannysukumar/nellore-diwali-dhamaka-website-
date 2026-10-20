import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  LayoutGrid,
  Loader2,
  Search,
  Ticket as TicketIcon,
  Wallet,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useAsync } from "@/hooks/useAsync";
import { useDebounced } from "@/hooks/useCollection";
import { useAuth } from "@/app/AuthProvider";
import { useSiteSettings } from "@/app/SettingsProvider";
import { useToast } from "@/app/ToastProvider";
import { callBackend } from "@/lib/backend/callBackend";
import type {
  PurchaseTicketsRequest,
  PurchaseTicketsResponse,
} from "@/lib/backend/api";
import { describeStoreError } from "@/lib/backend";
import { drawService } from "@/services/drawService";
import { ticketService } from "@/services/ticketService";
import { walletService } from "@/services/walletService";
import type { Ticket } from "@/types";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  Dialog,
  EmptyState,
  ErrorState,
  Input,
  Segmented,
  Select,
  Skeleton,
} from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { TicketCounters, TicketGrid } from "@/features/tickets/TicketGrid";
import { DrawStatusBadge } from "@/features/draws/DrawMeta";
import { formatINR } from "@/utils/money";
import { formatNumber } from "@/utils/format";
import { newId } from "@/utils/id";

type Filter = "all" | "available" | "mine" | "recent";

const PAGE_SIZE = 120;

export function BookTicketsPage() {
  const { user, profile } = useAuth();
  const settings = useSiteSettings();
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  const draws = useAsync(() => drawService.listPublic(50), []);
  const publicDraws = useMemo(() => draws.data ?? [], [draws.data]);
  const openDraws = useMemo(() => publicDraws.filter((d) => d.status === "open"), [publicDraws]);

  const requested = params.get("draw");
  const packageQty = Number(params.get("qty") ?? "");
  const selectedDrawId =
    (requested && publicDraws.some((d) => d.id === requested) ? requested : null) ??
    openDraws[0]?.id ??
    publicDraws[0]?.id ??
    "";

  const draw = publicDraws.find((d) => d.id === selectedDrawId) ?? null;
  const canPurchase = Boolean(draw && draw.status === "open" && settings.allowPaidDraws);

  const stats = useAsync(
    async () => (draw ? await drawService.stats(draw.id) : null),
    [draw?.id, selectedDrawId],
  );

  const [filter, setFilter] = useState<Filter>("all");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [cursor, setCursor] = useState<string | number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [selected, setSelected] = useState<Map<string, Ticket>>(new Map());
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query, 350);
  const [searchResults, setSearchResults] = useState<Ticket[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<PurchaseTicketsResponse | null>(null);
  const requestId = useRef(newId("buy"));

  const wallet = useAsync(
    async () => (user && profile ? await walletService.account(user.uid) : null),
    [user?.uid, profile?.uid, refreshKey],
    { enabled: Boolean(user) },
  );

  /* Selection belongs to one draw only. */
  useEffect(() => {
    setSelected(new Map());
    setQuery("");
    setSearchResults([]);
  }, [selectedDrawId]);

  /* First page of the grid, or the recently-sold snapshot. */
  useEffect(() => {
    if (!selectedDrawId) {
      setTickets([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setListError(null);

    const load = async () => {
      try {
        if (filter === "recent") {
          const rows = await ticketService.recentlySold(selectedDrawId, 60);
          if (!cancelled) {
            setTickets(rows);
            setHasMore(false);
            setCursor(null);
          }
          return;
        }
        const result = await ticketService.page({
          drawId: selectedDrawId,
          status: filter,
          ownerUid: user?.uid,
          limit: PAGE_SIZE,
        });
        if (!cancelled) {
          setTickets(result.items);
          setCursor(result.cursor);
          setHasMore(result.hasMore);
        }
      } catch (error) {
        if (!cancelled) {
          setListError(error instanceof Error ? error.message : "Ticket inventory could not be loaded.");
          setTickets([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedDrawId, filter, user?.uid, refreshKey]);

  /* Exact-number search is served by the paginated inventory, never by a full read. */
  useEffect(() => {
    if (!selectedDrawId || debouncedQuery.trim().length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    setSearchError(null);
    ticketService
      .search(selectedDrawId, debouncedQuery, 48)
      .then((rows) => {
        if (!cancelled) setSearchResults(rows);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setSearchResults([]);
          setSearchError(describeStoreError(error));
        }
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedDrawId, debouncedQuery, refreshKey]);

  const loadMore = async () => {
    if (!selectedDrawId || cursor === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await ticketService.page({
        drawId: selectedDrawId,
        status: filter === "recent" ? "all" : filter,
        ownerUid: user?.uid,
        cursor: typeof cursor === "number" ? cursor : undefined,
        limit: PAGE_SIZE,
      });
      setTickets((current) => [...current, ...result.items]);
      setCursor(result.cursor);
      setHasMore(result.hasMore);
    } catch (error) {
      toast.error(
        "Could not load more tickets",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setLoadingMore(false);
    }
  };

  const toggleTicket = useCallback(
    (ticket: Ticket) => {
      if (!user) {
        toast.info("Sign in to select tickets", "Ticket numbers can only be reserved by a verified account.");
        return;
      }
      setSelected((current) => {
        const next = new Map(current);
        if (next.has(ticket.id)) {
          next.delete(ticket.id);
          return next;
        }
        if (next.size >= settings.maxTicketsPerOrder) {
          toast.warning(
            "Order limit reached",
            `You can select up to ${settings.maxTicketsPerOrder} tickets in one order.`,
          );
          return current;
        }
        next.set(ticket.id, ticket);
        return next;
      });
    },
    [settings.maxTicketsPerOrder, toast, user],
  );

  const selectedIds = useMemo(() => new Set(selected.keys()), [selected]);
  const totalPaise = draw ? selected.size * draw.ticketPricePaise : 0;
  const balance = wallet.data?.balancePaise ?? 0;
  const balanceKnown = Boolean(wallet.data) && !wallet.error;
  const shortfall = balanceKnown ? Math.max(0, totalPaise - balance) : 0;

  const openConfirm = () => {
    if (!draw) return;
    setPurchaseError(null);
    requestId.current = newId("buy");
    setConfirmOpen(true);
  };

  const purchase = async () => {
    if (!draw || !user) return;
    setPurchasing(true);
    setPurchaseError(null);
    try {
      const result = await callBackend<PurchaseTicketsRequest, PurchaseTicketsResponse>(
        "purchaseTickets",
        {
          drawId: draw.id,
          ticketIds: Array.from(selected.keys()),
          requestId: requestId.current,
        },
      );
      setReceipt(result);
      setConfirmOpen(false);
      setSelected(new Map());
      setRefreshKey((n) => n + 1);
      toast.success("Tickets confirmed", `${result.ticketNumbers.length} number(s) are now yours.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The purchase could not be completed.";
      setPurchaseError(message);
      setRefreshKey((n) => n + 1);
    } finally {
      setPurchasing(false);
    }
  };

  const filterOptions: Array<{ value: Filter; label: string }> = [
    { value: "all", label: "All numbers" },
    { value: "available", label: "Available" },
    { value: "recent", label: "Recently sold" },
    ...(user ? [{ value: "mine" as Filter, label: "My tickets" }] : []),
  ];

  const searchActive = debouncedQuery.trim().length >= 2;

  return (
    <>
      <PageHeader
        eyebrow="Book tickets"
        icon={TicketIcon}
        title="Choose your lucky numbers"
        description="Availability is read live from the ticket inventory. Only green numbers can be selected; sold, reserved and blocked numbers are locked."
        crumbs={[{ label: "Home", to: "/" }, { label: "Book tickets" }]}
        actions={
          user ? (
            <Link to="/dashboard/wallet">
              <Button variant="outline" iconLeft={<Wallet className="size-4" aria-hidden />}>
                {balanceKnown ? formatINR(balance) : "Wallet"}
              </Button>
            </Link>
          ) : (
            <Link to="/login" state={{ from: "/book" }}>
              <Button variant="outline">Sign in to book</Button>
            </Link>
          )
        }
      />

      <div className="page py-6">

        {!settings.allowPaidDraws ? (
          <Alert tone="info" title="Paid draws are disabled" className="mb-4">
            {settings.legalDisclaimer} You can still browse every number and its live status.
          </Alert>
        ) : null}

        {Number.isInteger(packageQty) && packageQty > 0 ? (
          <Alert tone="info" title={`Package selected: ${packageQty} ticket${packageQty === 1 ? "" : "s"}`} className="mb-4">
            Pick {packageQty} available number{packageQty === 1 ? "" : "s"} below. The price charged is
            always the draw&apos;s ticket price × the numbers you confirm.
          </Alert>
        ) : null}

        {draws.loading ? (
          <Skeleton className="h-24" rounded="lg" />
        ) : draws.error ? (
          <ErrorState description={draws.error.message} onRetry={draws.reload} />
        ) : !publicDraws.length ? (
          <EmptyState
            title="No draws are published yet"
            description="Ticket sales open when an administrator publishes a draw."
            action={
              <Link to="/draws">
                <Button variant="outline">Browse draws</Button>
              </Link>
            }
          />
        ) : (
          <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
            <div className="min-w-0 space-y-4">
              <Card>
                <CardBody className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                    <div>
                      <label
                        htmlFor="draw-select"
                        className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.1em] text-muted"
                      >
                        Festival draw
                      </label>
                      <Select
                        id="draw-select"
                        value={selectedDrawId}
                        onChange={(event) => setParams({ draw: event.target.value })}
                      >
                        {publicDraws.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.title} ({item.status.replace("_", " ")})
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
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search an exact ticket number, e.g. 100245"
                      className="pl-9"
                      inputMode="numeric"
                      aria-label="Search ticket numbers"
                    />
                    {searching ? (
                      <Loader2
                        className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted"
                        aria-hidden
                      />
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Segmented
                      options={filterOptions}
                      value={filter}
                      onChange={(next) => setFilter(next)}
                      ariaLabel="Filter ticket numbers"
                    />
                    <p className="text-[12px] text-muted">
                      {draw ? `${formatINR(draw.ticketPricePaise)} per number` : ""}
                    </p>
                  </div>

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

              {draw && draw.status !== "open" ? (
                <Alert tone="warning" title="Sales are not open for this draw">
                  This draw is <strong>{draw.status.replace("_", " ")}</strong>. Numbers remain
                  visible for reference, but purchasing is disabled.
                </Alert>
              ) : null}

              {listError ? (
                <ErrorState
                  description={listError}
                  onRetry={() => setRefreshKey((n) => n + 1)}
                />
              ) : searchActive ? (
                <Card>
                  <CardHeader
                    title={`Search results for “${debouncedQuery.trim()}”`}
                    description="Matching numbers from this draw only. Sold numbers cannot be purchased."
                    action={
                      <Button variant="ghost" size="sm" onClick={() => setQuery("")}>
                        Clear
                      </Button>
                    }
                  />
                  <CardBody>
                    {searchResults.length ? (
                      <TicketGrid
                        tickets={searchResults}
                        selectedIds={selectedIds}
                        selectable={canPurchase}
                        onToggle={toggleTicket}
                      />
                    ) : (
                      <p className="py-6 text-center text-[13px] text-muted" role={searchError ? "alert" : undefined}>
                        {searching
                          ? "Searching…"
                          : searchError ?? "No ticket number matches that search."}
                      </p>
                    )}
                  </CardBody>
                </Card>
              ) : loading ? (
                <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 xl:grid-cols-14">
                  {Array.from({ length: 84 }).map((_, index) => (
                    <Skeleton key={index} className="aspect-square" rounded="sm" />
                  ))}
                </div>
              ) : tickets.length ? (
                <Card>
                  <CardBody>
                    <TicketGrid
                      tickets={tickets}
                      selectedIds={selectedIds}
                      selectable={canPurchase}
                      onToggle={toggleTicket}
                    />
                    <div className="mt-4 flex flex-col items-center gap-2">
                      <p className="text-[12px] text-muted">
                        Showing {formatNumber(tickets.length)} of {formatNumber(stats.data?.total ?? tickets.length)} numbers
                        {filter === "recent" ? " (most recently sold first)" : ""}
                      </p>
                      {hasMore ? (
                        <Button
                          variant="outline"
                          onClick={() => void loadMore()}
                          loading={loadingMore}
                        >
                          Load more numbers
                        </Button>
                      ) : null}
                    </div>
                  </CardBody>
                </Card>
              ) : (
                <EmptyState
                  title={
                    filter === "mine"
                      ? "You do not own any numbers in this draw yet"
                      : "No tickets match this filter"
                  }
                  description={
                    filter === "mine"
                      ? "Pick from the Available tab to reserve your first number."
                      : "Try another filter or load the full inventory."
                  }
                  action={
                    filter !== "all" ? (
                      <Button variant="outline" onClick={() => setFilter("all")}>
                        Show all numbers
                      </Button>
                    ) : undefined
                  }
                />
              )}
            </div>

            <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
              <Card>
                <CardHeader
                  icon={LayoutGrid}
                  title="Your selection"
                  description={
                    user
                      ? `Signed in as ${profile?.fullName ?? "participant"}`
                      : "Sign in to reserve numbers."
                  }
                />
                <CardBody className="space-y-4">
                  <dl className="space-y-2 text-[13px]">
                    <div className="flex items-center justify-between">
                      <dt className="text-muted">Numbers selected</dt>
                      <dd className="font-semibold tabular-nums text-ink">{selected.size}</dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-muted">Price per number</dt>
                      <dd className="font-semibold tabular-nums text-ink">
                        {draw ? formatINR(draw.ticketPricePaise) : "—"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between border-t border-line pt-2">
                      <dt className="font-semibold text-ink">Order total</dt>
                      <dd className="font-display text-[20px] font-bold tabular-nums text-brand">
                        {formatINR(totalPaise)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-muted">Wallet balance</dt>
                      <dd className="font-semibold tabular-nums text-emerald">
                        {user && balanceKnown ? formatINR(balance) : "—"}
                      </dd>
                    </div>
                  </dl>

                  {selected.size ? (
                    <div className="flex flex-wrap gap-1.5">
                      {Array.from(selected.values())
                        .slice(0, 24)
                        .map((ticket) => (
                          <button
                            key={ticket.id}
                            type="button"
                            onClick={() => toggleTicket(ticket)}
                            className="inline-flex items-center gap-1 rounded-md border border-line bg-ivory px-2 py-1 text-[11px] font-semibold tabular-nums text-ink transition hover:border-brand hover:text-brand"
                            title="Remove this number"
                          >
                            {ticket.numberLabel}
                            <span aria-hidden>×</span>
                          </button>
                        ))}
                      {selected.size > 24 ? (
                        <span className="px-1 py-1 text-[11px] text-muted">+{selected.size - 24} more</span>
                      ) : null}
                    </div>
                  ) : (
                    <p className="rounded-xl border border-dashed border-line-strong bg-ivory/50 px-3 py-4 text-center text-[12px] leading-relaxed text-muted">
                      Tap any green number in the grid to add it to your order.
                    </p>
                  )}

                  {wallet.error ? (
                    <Alert tone="warning" title="Wallet balance unavailable">
                      {describeStoreError(wallet.error)}{" "}
                      <button type="button" className="font-semibold text-brand hover:underline" onClick={wallet.reload}>
                        Retry
                      </button>
                    </Alert>
                  ) : null}

                  {shortfall > 0 && selected.size > 0 ? (
                    <Alert tone="warning" title="Not enough wallet balance">
                      Add {formatINR(shortfall)} to complete this order.{" "}
                      <Link to="/dashboard/add-money" className="font-semibold text-brand hover:underline">
                        Add money
                      </Link>
                    </Alert>
                  ) : null}

                  {!user ? (
                    <Link to="/login" state={{ from: "/book" }} className="block">
                      <Button block variant="gold">
                        Sign in to continue
                      </Button>
                    </Link>
                  ) : (
                    <Button
                      block
                      size="lg"
                      disabled={!selected.size || !canPurchase}
                      onClick={openConfirm}
                      iconLeft={<TicketIcon className="size-4" aria-hidden />}
                    >
                      {canPurchase
                        ? `Confirm ${selected.size || ""} ticket${selected.size === 1 ? "" : "s"}`
                        : settings.allowPaidDraws
                          ? "Sales closed"
                          : "Purchasing disabled"}
                    </Button>
                  )}

                  <p className="text-[11px] leading-relaxed text-muted">
                    Payment is taken from your wallet. Your numbers are locked and your balance is
                    debited in the same server-side transaction — the grid is never trusted.
                  </p>
                </CardBody>
              </Card>

              {draw ? (
                <Card>
                  <CardBody className="space-y-2 text-[13px]">
                    <p className="font-display text-[15px] text-ink">{draw.title}</p>
                    <p className="text-muted">
                      Maximum {draw.maxTicketsPerUser} numbers per account ·{" "}
                      {settings.maxTicketsPerOrder} per order
                    </p>
                    <Link
                      to={`/draws/${draw.slug}`}
                      className="inline-flex text-[12px] font-semibold text-brand hover:underline"
                    >
                      Draw schedule and prizes
                    </Link>
                  </CardBody>
                </Card>
              ) : null}
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void purchase()}
        title="Confirm your ticket purchase"
        description="The total below will be debited from your wallet immediately."
        confirmLabel="Pay from wallet"
        tone="success"
        busy={purchasing}
      >
        <div className="space-y-3">
          <dl className="space-y-2 rounded-xl border border-line bg-ivory/60 p-3 text-[13px]">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Draw</dt>
              <dd className="font-semibold text-ink">{draw?.title ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Numbers</dt>
              <dd className="max-w-[60%] text-right font-semibold tabular-nums text-ink">
                {Array.from(selected.values())
                  .map((ticket) => ticket.numberLabel)
                  .join(", ")}
              </dd>
            </div>
            <div className="flex justify-between gap-3 border-t border-line pt-2">
              <dt className="font-semibold text-ink">Total</dt>
              <dd className="font-display text-[18px] font-bold tabular-nums text-brand">
                {formatINR(totalPaise)}
              </dd>
            </div>
          </dl>
          <p className="text-[12px] leading-relaxed text-muted">
            Your wallet balance after this order will be{" "}
            <strong className="text-ink">{formatINR(Math.max(0, balance - totalPaise))}</strong>.
            Ticket purchases are final and cannot be cancelled from this screen.
          </p>
          {purchaseError ? (
            <Alert tone="danger" title="Purchase not completed">
              {purchaseError}
            </Alert>
          ) : null}
        </div>
      </ConfirmDialog>

      <Dialog
        open={Boolean(receipt)}
        onClose={() => setReceipt(null)}
        title={
          <span className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-emerald" aria-hidden />
            Tickets confirmed
          </span>
        }
        description="These numbers are now reserved to your account."
        footer={
          <>
            <Button variant="outline" onClick={() => setReceipt(null)}>
              Keep browsing
            </Button>
            <Link to="/dashboard/tickets">
              <Button>View my tickets</Button>
            </Link>
          </>
        }
      >
        {receipt ? (
          <div className="space-y-3">
            <dl className="space-y-2 rounded-xl border border-line bg-ivory/60 p-3 text-[13px]">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Order</dt>
                <dd className="font-mono text-[12px] text-ink">{receipt.orderId}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Amount paid</dt>
                <dd className="font-semibold tabular-nums text-ink">{formatINR(receipt.totalPaise)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Wallet balance</dt>
                <dd className="font-semibold tabular-nums text-emerald">
                  {formatINR(receipt.balancePaise)}
                </dd>
              </div>
            </dl>
            <div className="flex flex-wrap gap-1.5">
              {receipt.ticketNumbers.map((number) => (
                <span
                  key={number}
                  className="rounded-md border border-emerald/30 bg-emerald-soft px-2 py-1 text-[12px] font-bold tabular-nums text-emerald"
                >
                  {draw ? String(number).padStart(draw.numberPadding, "0") : number}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
