import { useMemo } from "react";
import {
  ArrowLeft,
  Coins,
  Download,
  History,
  Ticket as TicketIcon,
  Trophy,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useAsync } from "@/hooks/useAsync";
import { useAuth } from "@/app/AuthProvider";
import { ticketService } from "@/services/ticketService";
import { drawService } from "@/services/drawService";
import { contentService } from "@/services/contentService";
import type { Ticket, WinnerAnnouncement } from "@/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  LoadErrors,
  Skeleton,
  TicketStatusBadge,
} from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { CountdownTimer, DrawStatusBadge } from "@/features/draws/DrawMeta";
import { formatINR } from "@/utils/money";
import { formatDateTime } from "@/utils/format";

export function TicketDetailPage() {
  const { uid } = useAuth();
  const { ticketId } = useParams<{ ticketId: string }>();

  const ticket = useAsync(
    async () => (ticketId ? await ticketService.get(ticketId) : null),
    [ticketId],
    { enabled: Boolean(ticketId) },
  );

  const row = ticket.data as Ticket | null;

  const draw = useAsync(
    async () => (row ? await drawService.getById(row.drawId) : null),
    [row?.drawId],
    { enabled: Boolean(row?.drawId) },
  );

  const announcement = useAsync(
    async () => {
      if (!row || row.resultStatus !== "winner" || !uid || row.ownerUid !== uid) return null;
      const rows = await contentService.myWinnings(uid, row.drawId);
      return rows.find((w) => (row.prizeId ? w.prizeId === row.prizeId : true)) ?? null;
    },
    [row?.id, row?.resultStatus],
    { enabled: Boolean(row && row.resultStatus === "winner") },
  );

  const receipts = useAsync(
    async () => (uid ? await ticketService.ordersForUser(uid, 50) : []),
    [uid, row?.orderId],
    { enabled: Boolean(uid && row) },
  );

  const order = useMemo(() => {
    if (!row?.orderId) return null;
    return (receipts.data ?? []).find((o) => o.id === row.orderId) ?? null;
  }, [row?.orderId, receipts.data]);

  /* An owner check that fails closed: a ticket belonging to someone else is
     never rendered as if it were yours. */
  const notMine = Boolean(row && uid && row.ownerUid !== uid);
  const prize = useMemo(
    () => (row?.prizeId ? (draw.data?.prizes ?? []).find((p) => p.id === row.prizeId) ?? null : null),
    [row?.prizeId, draw.data],
  );

  if (ticket.loading) {
    return (
      <>
        <PageHeader
          eyebrow="Ticket"
          title="Loading your ticket"
          crumbs={[
            { label: "Home", to: "/" },
            { label: "Dashboard", to: "/dashboard" },
            { label: "My tickets", to: "/dashboard/tickets" },
            { label: "Ticket" },
          ]}
        />
        <div className="page space-y-4 py-6">
          <Skeleton className="h-40" rounded="lg" />
          <Skeleton className="h-64" rounded="lg" />
        </div>
      </>
    );
  }

  if (ticket.error) {
    return (
      <>
        <PageHeader
          eyebrow="Ticket"
          icon={TicketIcon}
          title="Ticket could not be loaded"
          crumbs={[
            { label: "Home", to: "/" },
            { label: "Dashboard", to: "/dashboard" },
            { label: "My tickets", to: "/dashboard/tickets" },
            { label: "Ticket" },
          ]}
        />
        <div className="page py-6">
          <LoadErrors sources={[ticket]} title="This ticket could not be loaded" />
        </div>
      </>
    );
  }

  if (!row || notMine) {
    return (
      <>
        <PageHeader
          eyebrow="Ticket"
          icon={TicketIcon}
          title="Ticket not available"
          crumbs={[
            { label: "Home", to: "/" },
            { label: "Dashboard", to: "/dashboard" },
            { label: "My tickets", to: "/dashboard/tickets" },
            { label: "Ticket" },
          ]}
        />
        <div className="page py-6">
          <EmptyState
            title={notMine ? "This ticket belongs to another account" : "We could not find that ticket"}
            description={
              notMine
                ? "Only the owner of a ticket number can view its full details. If you believe this is a mistake, contact support."
                : "The ticket may have been removed, or the link is out of date."
            }
            action={
              <Link to="/dashboard/tickets">
                <Button variant="outline" iconLeft={<ArrowLeft className="size-4" aria-hidden />}>
                  Back to my tickets
                </Button>
              </Link>
            }
          />
        </div>
      </>
    );
  }

  const isWinner = row.resultStatus === "winner";
  const announcementRow = announcement.data as WinnerAnnouncement | null;

  return (
    <>
      <PageHeader
        eyebrow="Ticket"
        icon={TicketIcon}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="tabular-nums">#{row.numberLabel}</span>
            {isWinner ? <Badge tone="gold">Winner</Badge> : null}
          </span>
        }
        description={
          draw.data
            ? `${draw.data.title} · draw on ${formatDateTime(draw.data.drawAt)}`
            : "Draw details are no longer published."
        }
        crumbs={[
          { label: "Home", to: "/" },
          { label: "Dashboard", to: "/dashboard" },
          { label: "My tickets", to: "/dashboard/tickets" },
          { label: `#${row.numberLabel}` },
        ]}
        actions={
          <Link to="/dashboard/tickets">
            <Button variant="outline" iconLeft={<ArrowLeft className="size-4" aria-hidden />}>
              All tickets
            </Button>
          </Link>
        }
      />

      <div className="page grid gap-5 py-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {isWinner ? (
            <Alert tone="success" title="This number won in a published draw">
              Congratulations. Prize details below come straight from the published results — never from
              a screen that could still change.
            </Alert>
          ) : null}

          {!isWinner && row.status === "blocked" ? (
            <Alert tone="warning" title="This number is blocked">
              {row.blockedReason ??
                "An administrator has temporarily blocked this number. Contact support if you need more detail."}
            </Alert>
          ) : null}

          <Card>
            <CardHeader
              icon={TicketIcon}
              title="Ticket details"
              description="Everything the backend recorded for this number."
              action={<TicketStatusBadge status={row.status} />}
            />
            <CardBody>
              <dl className="grid gap-3 sm:grid-cols-2">
                {[
                  { label: "Ticket number", value: `#${row.numberLabel}` },
                  { label: "Status", value: row.status.replace(/_/g, " ") },
                  { label: "Ticket price", value: formatINR(row.pricePaise) },
                  {
                    label: "Purchased",
                    value: row.purchasedAt ? formatDateTime(row.purchasedAt) : "Not purchased",
                  },
                  {
                    label: "Result",
                    value: isWinner ? "Winner" : row.resultStatus === "not_selected" ? "Not selected" : "Not drawn yet",
                  },
                  { label: "Draw", value: draw.data?.title ?? row.drawId },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl border border-line bg-ivory/50 p-3">
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                      {item.label}
                    </dt>
                    <dd className="mt-1 text-[14px] font-semibold capitalize text-ink">{item.value}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>

          {isWinner ? (
            <Card>
              <CardHeader
                icon={Trophy}
                title="Your prize"
                description="Details are taken from the published winner announcement."
              />
              <CardBody className="space-y-3">
                {announcementRow ? (
                  <>
                    <p className="font-display text-[18px] text-ink">{announcementRow.prizeTitle}</p>
                    <p className="text-[13px] leading-relaxed text-muted">
                      {announcementRow.prizeDescription}
                    </p>
                    <dl className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-gold/40 bg-gold-soft/30 p-3">
                        <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                          Prize tier
                        </dt>
                        <dd className="mt-1 font-display text-[15px] font-bold capitalize text-gold-deep">
                          {announcementRow.prizeTier}
                        </dd>
                      </div>
                      <div className="rounded-xl border border-line bg-ivory/50 p-3">
                        <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                          Published
                        </dt>
                        <dd className="mt-1 text-[14px] font-semibold text-ink">
                          {announcementRow.publishedAt
                            ? formatDateTime(announcementRow.publishedAt)
                            : "—"}
                        </dd>
                      </div>
                    </dl>
                    <Link
                      to="/winners"
                      className="inline-flex text-[12px] font-semibold text-brand hover:underline"
                    >
                      View the full winners announcement
                    </Link>
                  </>
                ) : prize ? (
                  <>
                    <p className="font-display text-[18px] text-ink">{prize.title}</p>
                    <p className="text-[13px] leading-relaxed text-muted">{prize.description}</p>
                    <Alert tone="info" title="Publishing in progress">
                      The full announcement appears on the winners page once an administrator publishes
                      results. This number is already marked as winning.
                    </Alert>
                  </>
                ) : (
                  <Alert tone="info" title="Prize details are not published yet">
                    This number is recorded as a winner. Prize details appear here as soon as results are
                    published.
                  </Alert>
                )}
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader
              icon={History}
              title="Purchase record"
              description="The order that reserved this number."
            />
            <CardBody>
              {order ? (
                <dl className="space-y-2 text-[13px]">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Order reference</dt>
                    <dd className="font-mono text-[12px] text-ink">{order.id}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Numbers in order</dt>
                    <dd className="font-semibold tabular-nums text-ink">{order.quantity}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Amount paid</dt>
                    <dd className="font-semibold tabular-nums text-ink">{formatINR(order.totalPaise)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Paid from</dt>
                    <dd className="font-semibold text-ink">Wallet</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Confirmed</dt>
                    <dd className="text-ink">{formatDateTime(order.createdAt)}</dd>
                  </div>
                  <div className="flex justify-between gap-3 border-t border-line pt-2">
                    <dt className="text-muted">Ledger entry</dt>
                    <dd>
                      <Link
                        to="/dashboard/wallet"
                        className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand hover:underline"
                      >
                        <Coins className="size-3.5" aria-hidden />
                        View wallet ledger
                      </Link>
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="text-[13px] text-muted">
                  The purchase record for this number is not available right now. Every movement is still
                  recorded in your wallet ledger.
                </p>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="side-panel space-y-4">
          <Card>
            <CardHeader title="Draw" action={draw.data ? <DrawStatusBadge status={draw.data.status} /> : null} />
            <CardBody className="space-y-3">
              {draw.data ? (
                <>
                  <p className="font-display text-[16px] text-ink">{draw.data.title}</p>
                  <CountdownTimer target={draw.data.drawAt} label="Draw time" />
                  <dl className="space-y-1.5 text-[13px]">
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">Sales close</dt>
                      <dd className="font-semibold text-ink">{formatDateTime(draw.data.salesCloseAt)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">Draw</dt>
                      <dd className="font-semibold text-ink">{formatDateTime(draw.data.drawAt)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">Your limit</dt>
                      <dd className="font-semibold tabular-nums text-ink">
                        {draw.data.maxTicketsPerUser} numbers
                      </dd>
                    </div>
                  </dl>
                  <Link
                    to={`/draws/${draw.data.slug}`}
                    className="inline-flex text-[12px] font-semibold text-brand hover:underline"
                  >
                    Draw schedule and prizes
                  </Link>
                </>
              ) : (
                <p className="text-[13px] text-muted">
                  The draw this ticket belongs to is no longer published.
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Need a copy?" />
            <CardBody className="space-y-3">
              <p className="text-[12.5px] leading-relaxed text-muted">
                Your wallet ledger and order history are the authoritative record of this purchase. Use
                them for any dispute or refund request.
              </p>
              <Link to="/dashboard/wallet" className="block">
                <Button block variant="outline" iconLeft={<Download className="size-4" aria-hidden />}>
                  Open my wallet ledger
                </Button>
              </Link>
              <Link to="/dashboard/support" className="block">
                <Button block variant="ghost" size="sm">
                  Contact support
                </Button>
              </Link>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
