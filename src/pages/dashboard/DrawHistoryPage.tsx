import { useMemo } from "react";
import { Coins, History, Trophy } from "lucide-react";
import { Link } from "react-router-dom";
import { useAsync } from "@/hooks/useAsync";
import { useAuth } from "@/app/AuthProvider";
import { ticketService } from "@/services/ticketService";
import { drawService } from "@/services/drawService";
import type { Draw, Ticket } from "@/types";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  LoadErrors,
  Skeleton,
  StatCard,
} from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { DrawStatusBadge } from "@/features/draws/DrawMeta";
import { formatINR } from "@/utils/money";
import { formatDateTime, formatNumber } from "@/utils/format";

export function DrawHistoryPage() {
  const { uid } = useAuth();

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

  const pastGroups = useMemo(() => {
    const byDraw = new Map<string, Ticket[]>();
    (tickets.data ?? []).forEach((ticket) => {
      const draw = drawMap.get(ticket.drawId);
      if (!draw) return;
      const isPast = !["open", "upcoming"].includes(draw.status);
      if (!isPast) return;
      const list = byDraw.get(ticket.drawId) ?? [];
      list.push(ticket);
      byDraw.set(ticket.drawId, list);
    });
    return Array.from(byDraw.entries())
      .map(([drawId, rows]) => ({
        drawId,
        draw: drawMap.get(drawId) ?? null,
        tickets: rows.sort((a, b) => a.number - b.number),
      }))
      .sort((a, b) => (b.draw?.drawAt ?? "").localeCompare(a.draw?.drawAt ?? ""));
  }, [tickets.data, drawMap]);

  const allMine = (tickets.data ?? []) as Ticket[];
  const totalEntries = allMine.length;
  const totalWins = allMine.filter((t) => t.resultStatus === "winner").length;
  const totalSpent = allMine.reduce((sum, t) => sum + t.pricePaise, 0);

  return (
    <>
      <PageHeader
        eyebrow="Draw history"
        icon={History}
        title="Your draw history"
        description="A record of every draw you have participated in and how it resolved. Results appear only after an administrator publishes them."
        crumbs={[
          { label: "Home", to: "/" },
          { label: "Dashboard", to: "/dashboard" },
          { label: "Draw history" },
        ]}
        actions={
          <Link to="/winners">
            <Button variant="outline" iconLeft={<Trophy className="size-4" aria-hidden />}>
              Public winners
            </Button>
          </Link>
        }
      />

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <StatCard label="Draw entries" value={formatNumber(totalEntries)} hint="Numbers you have held" />
        <StatCard
          label="Winning numbers"
          value={formatNumber(totalWins)}
          hint="From published results"
          icon={Coins}
          tone="gold"
        />
        <StatCard label="Total spent on tickets" value={formatINR(totalSpent)} hint="Wallet debits" />
      </div>

      <LoadErrors className="mt-5" sources={[tickets, draws]} title="Your draw history could not be loaded" />

      {tickets.loading ? (
        <div className="mt-5 space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-48" rounded="lg" />
          ))}
        </div>
      ) : tickets.error ? null : !pastGroups.length ? (
        <div className="mt-5">
          <EmptyState
            title="No completed draws yet"
            description="Once a draw you have entered closes and its results are published, its full history appears here."
            action={
              <Link to="/draws">
                <Button variant="outline">Browse draws</Button>
              </Link>
            }
          />
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {pastGroups.map((group) => {
            const wins = group.tickets.filter((t) => t.resultStatus === "winner").length;
            const spent = group.tickets.reduce((sum, t) => sum + t.pricePaise, 0);
            return (
              <Card key={group.drawId}>
                <CardHeader
                  icon={History}
                  title={group.draw?.title ?? group.drawId}
                  description={
                    group.draw
                      ? `Drawn ${formatDateTime(group.draw.drawAt)} · ${group.draw.timezone}`
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
                      { label: "Numbers", value: formatNumber(group.tickets.length), tone: "text-ink" },
                      { label: "Winning", value: formatNumber(wins), tone: "text-gold-deep" },
                      { label: "Spent", value: formatINR(spent), tone: "text-brand" },
                      {
                        label: "Status",
                        value: wins ? "Won" : "No win",
                        tone: wins ? "text-emerald" : "text-muted",
                      },
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

                  <div className="flex flex-wrap gap-1.5">
                    {group.tickets.map((ticket) => (
                      <Link
                        key={ticket.id}
                        to={`/dashboard/tickets/${ticket.id}`}
                        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11.5px] font-semibold tabular-nums transition ${
                          ticket.resultStatus === "winner"
                            ? "border-gold bg-gold-soft/50 text-gold-deep hover:border-gold-deep"
                            : "border-line bg-paper text-muted hover:border-emerald"
                        }`}
                      >
                        #{ticket.numberLabel}
                        {ticket.resultStatus === "winner" ? <Badge tone="gold">Win</Badge> : null}
                      </Link>
                    ))}
                  </div>

                  {wins ? (
                    <p className="text-[12.5px] text-muted">
                      Prize details are published on the{" "}
                      <Link to="/winners" className="font-semibold text-brand hover:underline">
                        winners page
                      </Link>
                      .
                    </p>
                  ) : null}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
