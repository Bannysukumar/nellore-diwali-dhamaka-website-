import { useMemo, useState } from "react";
import { Filter, Ticket as TicketIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { useAsync } from "@/hooks/useAsync";
import { useAuth } from "@/app/AuthProvider";
import { ticketService } from "@/services/ticketService";
import { drawService } from "@/services/drawService";
import type { Draw, Ticket } from "@/types";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  LoadErrors,
  Segmented,
  Skeleton,
  TicketLegend,
} from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { DrawStatusBadge } from "@/features/draws/DrawMeta";
import { FlipTicket, TicketDownloadButton } from "@/features/tickets/FlipTicket";
import { formatINR } from "@/utils/money";
import { formatDateTime, formatNumber } from "@/utils/format";

type FilterValue = "all" | "open" | "completed";

export function MyTicketsPage() {
  const { uid, profile } = useAuth();
  const [filter, setFilter] = useState<FilterValue>("all");

  const tickets = useAsync(
    async () => (uid ? await ticketService.mine(uid, 300) : []),
    [uid],
    { enabled: Boolean(uid) },
  );
  const draws = useAsync(() => drawService.listPublic(50), []);

  const drawMap = useMemo(() => {
    const map = new Map<string, Draw>();
    (draws.data ?? []).forEach((draw) => map.set(draw.id, draw));
    return map;
  }, [draws.data]);

  const groups = useMemo(() => {
    const byDraw = new Map<string, Ticket[]>();
    (tickets.data ?? []).forEach((ticket) => {
      const list = byDraw.get(ticket.drawId) ?? [];
      list.push(ticket);
      byDraw.set(ticket.drawId, list);
    });
    return Array.from(byDraw.entries()).map(([drawId, rows]) => ({
      drawId,
      draw: drawMap.get(drawId) ?? null,
      tickets: rows.sort((a, b) => a.number - b.number),
    }));
  }, [tickets.data, drawMap]);

  const visibleGroups = groups.filter((group) => {
    if (filter === "all") return true;
    const status = group.draw?.status;
    if (filter === "open") return status === "open" || status === "upcoming";
    return status === "completed" || status === "cancelled" || status === "results_pending";
  });

  return (
    <>
      <PageHeader
        eyebrow="My tickets"
        icon={TicketIcon}
        title="Your festival ticket numbers"
        description="Every number reserved to your account, grouped by draw. Winning status appears only after results are published."
        crumbs={[
          { label: "Home", to: "/" },
          { label: "Dashboard", to: "/dashboard" },
          { label: "My tickets" },
        ]}
        actions={
          <Link to="/book">
            <Button variant="gold">Book more tickets</Button>
          </Link>
        }
      />

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          options={[
            { value: "all", label: "All tickets" },
            { value: "open", label: "Live draws" },
            { value: "completed", label: "Past draws" },
          ]}
          value={filter}
          onChange={setFilter}
          ariaLabel="Filter my tickets"
        />
        <p className="flex items-center gap-1.5 text-[12px] text-muted">
          <Filter className="size-3.5" aria-hidden />
          {formatNumber((tickets.data ?? []).length)} number
          {(tickets.data ?? []).length === 1 ? "" : "s"} across {groups.length} draw
          {groups.length === 1 ? "" : "s"}
        </p>
      </div>

      <div className="mt-4">
        <TicketLegend className="rounded-xl border border-line bg-ivory/60 px-3 py-2.5" />
      </div>

      <LoadErrors className="mt-4" sources={[tickets, draws]} title="Your tickets could not be loaded" />

      {tickets.loading ? (
        <Skeleton className="mt-4 h-64" rounded="lg" />
      ) : tickets.error ? null : !(tickets.data ?? []).length ? (
        <div className="mt-5">
          <EmptyState
            title="You have not booked any tickets yet"
            description="Add money to your wallet, then select numbers from the live ticket grid. Your numbers appear here immediately after a confirmed purchase."
            action={
              <Link to="/book">
                <Button>Open the ticket grid</Button>
              </Link>
            }
          />
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {visibleGroups.map((group) => {
            const booked = group.tickets.filter((t) => t.status === "booked").length;
            const winners = group.tickets.filter((t) => t.resultStatus === "winner").length;
            const spent = group.tickets.reduce((sum, t) => sum + t.pricePaise, 0);

            return (
              <Card key={group.drawId}>
                <CardHeader
                  title={group.draw?.title ?? group.drawId}
                  description={
                    group.draw
                      ? `Draw on ${formatDateTime(group.draw.drawAt)} · ${group.draw.timezone}`
                      : "Draw details are no longer published."
                  }
                  action={
                    <div className="flex flex-wrap items-center gap-2">
                      {group.draw ? <DrawStatusBadge status={group.draw.status} /> : null}
                    </div>
                  }
                />
                <CardBody className="space-y-4">
                  <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                    {[
                      { label: "Numbers held", value: formatNumber(group.tickets.length), tone: "text-ink" },
                      { label: "Confirmed", value: formatNumber(booked), tone: "text-emerald" },
                      { label: "Winning", value: formatNumber(winners), tone: "text-gold-deep" },
                      { label: "Total paid", value: formatINR(spent), tone: "text-brand" },
                    ].map((item) => (
                      <div key={item.label} className="rounded-xl border border-line bg-ivory/50 p-3">
                        <dd className={`font-display text-[19px] font-bold tabular-nums ${item.tone}`}>
                          {item.value}
                        </dd>
                        <dt className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">
                          {item.label}
                        </dt>
                      </div>
                    ))}
                  </dl>

                  {winners ? (
                    <Alert tone="success" title={`${winners} winning ticket(s) in this draw`}>
                      Prize details are published on the{" "}
                      <Link to="/winners" className="font-semibold text-brand hover:underline">
                        winners page
                      </Link>
                      .
                    </Alert>
                  ) : null}

                  <p className="text-[12px] text-muted">
                    Tap a ticket to flip it and see your Diwali discount coupon. Download saves both
                    sides as an image.
                  </p>
                  <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                    {group.tickets.map((ticket) => (
                      <div key={ticket.id} className="space-y-1.5">
                        <FlipTicket
                          ticket={ticket}
                          draw={group.draw}
                          holderName={profile?.fullName}
                          holderPhone={profile?.phone}
                        />
                        <div className="flex items-center justify-between gap-2">
                          <Link
                            to={`/dashboard/tickets/${ticket.id}`}
                            className="inline-flex text-[12px] font-semibold text-brand hover:underline"
                          >
                            Ticket #{ticket.numberLabel} details
                          </Link>
                          <TicketDownloadButton
                            ticket={ticket}
                            draw={group.draw}
                            holderName={profile?.fullName}
                            holderPhone={profile?.phone}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {group.draw ? (
                    <Link
                      to={`/draws/${group.draw.slug}`}
                      className="inline-flex text-[12px] font-semibold text-brand hover:underline"
                    >
                      View draw schedule and prizes
                    </Link>
                  ) : null}
                </CardBody>
              </Card>
            );
          })}

          {!visibleGroups.length ? (
            <EmptyState
              title="No tickets match this filter"
              description="Switch the filter to see every number you hold."
              action={
                <Button variant="outline" onClick={() => setFilter("all")}>
                  Show all tickets
                </Button>
              }
            />
          ) : null}
        </div>
      )}
    </>
  );
}
