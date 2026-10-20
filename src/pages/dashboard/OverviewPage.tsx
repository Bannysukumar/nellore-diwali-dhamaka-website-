import { useMemo } from "react";
import {
  ArrowRight,
  Bell,
  Coins,
  History,
  Sparkles,
  Ticket,
  Users,
  Wallet,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAsync } from "@/hooks/useAsync";
import { useAuth } from "@/app/AuthProvider";
import { useSiteSettings } from "@/app/SettingsProvider";
import { walletService } from "@/services/walletService";
import { ticketService } from "@/services/ticketService";
import { rewardService } from "@/services/rewardService";
import { drawService } from "@/services/drawService";
import { userService } from "@/services/userService";
import { describeStoreError } from "@/lib/backend";
import type { AppNotification, Draw, Ticket as TicketModel } from "@/types";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  SkeletonCard,
  StatCard,
  TicketStatusBadge,
} from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { CountdownTimer } from "@/features/draws/DrawMeta";
import { formatINR } from "@/utils/money";
import { formatDateTime, formatNumber, relativeTime } from "@/utils/format";

export function DashboardOverviewPage() {
  const { uid, profile } = useAuth();
  const settings = useSiteSettings();

  const wallet = useAsync(
    async () => (uid ? await walletService.account(uid) : null),
    [uid],
    { enabled: Boolean(uid) },
  );
  const tickets = useAsync(
    async () => (uid ? await ticketService.mine(uid, 200) : []),
    [uid],
    { enabled: Boolean(uid) },
  );
  const deposits = useAsync(
    async () => (uid ? await walletService.deposits(uid, 10) : []),
    [uid],
    { enabled: Boolean(uid) },
  );
  const referrals = useAsync(
    async () => (uid ? await rewardService.referralsByReferrer(uid, 50) : []),
    [uid],
    { enabled: Boolean(uid) },
  );
  const spins = useAsync(
    async () => (uid ? await rewardService.spinAccount(uid) : null),
    [uid],
    { enabled: Boolean(uid) },
  );
  const notifications = useAsync(
    async () => (uid ? await userService.notifications(uid, 6) : []),
    [uid],
    { enabled: Boolean(uid) },
  );
  const openDraws = useAsync(() => drawService.upcoming(3), []);

  const myTickets = useMemo(() => (tickets.data ?? []) as TicketModel[], [tickets.data]);
  const winners = useMemo(() => myTickets.filter((t) => t.resultStatus === "winner"), [myTickets]);
  const activeDrawIds = useMemo(
    () => new Set(myTickets.filter((t) => t.status === "booked").map((t) => t.drawId)),
    [myTickets],
  );

  const pendingDeposit = (deposits.data ?? []).find((d) =>
    ["pending", "requires_review"].includes(d.status),
  );
  const qualifiedReferrals = (referrals.data ?? []).filter((r) => r.status === "qualified").length;
  const pendingReferrals = (referrals.data ?? []).filter((r) => r.status === "pending").length;

  return (
    <>
      <PageHeader
        eyebrow="Your account"
        title={`Namaste, ${profile?.fullName?.split(" ")[0] ?? "participant"}`}
        description="A single view of your wallet, tickets, draw entries, referral rewards and notifications."
        crumbs={[{ label: "Home", to: "/" }, { label: "Dashboard" }]}
        actions={
          <Link to="/book">
            <Button iconLeft={<Ticket className="size-4" aria-hidden />}>Book tickets</Button>
          </Link>
        }
      />

      {wallet.error || tickets.error || deposits.error ? (
        <Alert tone="danger" className="mt-4" title="Some account figures could not be loaded">
          {describeStoreError(wallet.error ?? tickets.error ?? deposits.error)} Figures below that show
          “—” are unavailable, not zero.{" "}
          <button
            type="button"
            className="font-semibold text-brand hover:underline"
            onClick={() => {
              wallet.reload();
              tickets.reload();
              deposits.reload();
            }}
          >
            Retry
          </button>
        </Alert>
      ) : null}

      {!settings.allowPaidDraws ? (
        <Alert tone="info" className="mt-4" title="Ticket purchasing is currently disabled">
          {settings.legalDisclaimer}
        </Alert>
      ) : null}

      {pendingDeposit ? (
        <Alert tone="warning" className="mt-4" title="A deposit is awaiting verification">
          {formatINR(pendingDeposit.amountPaise)} submitted on{" "}
          {formatDateTime(pendingDeposit.submittedAt)}. Verification is completed manually by an
          administrator.{" "}
          <Link to="/dashboard/wallet" className="font-semibold text-brand hover:underline">
            View deposit history
          </Link>
        </Alert>
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Wallet balance"
          value={wallet.loading || wallet.error ? "—" : formatINR(wallet.data?.balancePaise ?? 0)}
          hint={
            wallet.data?.pendingDepositPaise
              ? `${formatINR(wallet.data.pendingDepositPaise)} pending verification`
              : "Available for ticket purchases"
          }
          icon={Wallet}
          tone="emerald"
        />
        <StatCard
          label="Tickets owned"
          value={tickets.loading || tickets.error ? "—" : formatNumber(myTickets.length)}
          hint={`Across ${activeDrawIds.size} draw${activeDrawIds.size === 1 ? "" : "s"}`}
          icon={Ticket}
          tone="brand"
        />
        <StatCard
          label="Free spins"
          value={spins.loading || spins.error ? "—" : formatNumber(spins.data?.availableSpins ?? 0)}
          hint={`${qualifiedReferrals} qualified referral${qualifiedReferrals === 1 ? "" : "s"}`}
          icon={Sparkles}
          tone="gold"
        />
        <StatCard
          label="Winning tickets"
          value={tickets.loading || tickets.error ? "—" : formatNumber(winners.length)}
          hint="Published results only"
          icon={Coins}
          tone="gold"
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader
              icon={Ticket}
              title="My tickets"
              description="The most recent numbers reserved to your account."
              action={
                <Link to="/dashboard/tickets">
                  <Button variant="ghost" size="sm" iconRight={<ArrowRight className="size-3.5" aria-hidden />}>
                    All tickets
                  </Button>
                </Link>
              }
            />
            <CardBody>
              {tickets.loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <SkeletonCard key={i} lines={2} />
                  ))}
                </div>
              ) : myTickets.length ? (
                <ul className="divide-y divide-line">
                  {myTickets.slice(0, 6).map((ticket) => (
                    <li key={ticket.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                      <div className="min-w-0">
                        <p className="font-display text-[15px] tabular-nums text-ink">
                          #{ticket.numberLabel}
                        </p>
                        <p className="text-[12px] text-muted">
                          {drawLabel(ticket.drawId)} · {formatDateTime(ticket.purchasedAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {ticket.resultStatus === "winner" ? (
                          <span className="rounded-md bg-gold-soft/70 px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-gold-deep">
                            Winner
                          </span>
                        ) : null}
                        <TicketStatusBadge status={ticket.status} />
                        <Link to={`/dashboard/tickets/${ticket.id}`}>
                          <Button variant="ghost" size="sm">
                            Details
                          </Button>
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  title="No tickets yet"
                  description="Add money to your wallet and pick a number from the live grid to enter a draw."
                  action={
                    <Link to="/book">
                      <Button>Open the ticket grid</Button>
                    </Link>
                  }
                />
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              icon={History}
              title="Draws you are entered in"
              description="Schedules are read live from each draw."
            />
            <CardBody>
              {openDraws.loading ? (
                <SkeletonCard lines={3} />
              ) : (
                <div className="space-y-3">
                  {(openDraws.data ?? []).map((draw: Draw) => (
                    <div
                      key={draw.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-ivory/50 p-3.5"
                    >
                      <div className="min-w-0">
                        <p className="font-display text-[15px] text-ink">{draw.title}</p>
                        <p className="text-[12px] text-muted">
                          Draw on {formatDateTime(draw.drawAt)} ·{" "}
                          {activeDrawIds.has(draw.id) ? "You are entered" : "You are not entered yet"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <CountdownTimer target={draw.salesCloseAt} label="Sales close" />
                        <Link to={`/book?draw=${draw.id}`}>
                          <Button variant="outline" size="sm">
                            Tickets
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ))}
                  {!(openDraws.data ?? []).length ? (
                    <p className="text-[13px] text-muted">
                      No draws are open right now. New draws appear here as soon as an administrator
                      publishes them.
                    </p>
                  ) : null}
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader
              icon={Users}
              title="Referral rewards"
              action={
                <Link to="/dashboard/referrals">
                  <Button variant="ghost" size="sm">
                    Manage
                  </Button>
                </Link>
              }
            />
            <CardBody className="space-y-3">
              <dl className="grid grid-cols-2 gap-2.5">
                <div className="rounded-xl border border-line bg-ivory/60 p-3">
                  <dd className="font-display text-[20px] font-bold text-emerald">{qualifiedReferrals}</dd>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                    Qualified
                  </dt>
                </div>
                <div className="rounded-xl border border-line bg-ivory/60 p-3">
                  <dd className="font-display text-[20px] font-bold text-status-pending">
                    {pendingReferrals}
                  </dd>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                    Pending
                  </dt>
                </div>
              </dl>
              <p className="text-[12px] leading-relaxed text-muted">
                Your code is{" "}
                <span className="font-mono font-semibold text-ink">{profile?.referralCode ?? "—"}</span>
                . Rewards unlock only after a genuinely new participant qualifies.
              </p>
              <Link to="/dashboard/referrals">
                <Button block variant="outline" size="sm">
                  Share my referral link
                </Button>
              </Link>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              icon={Bell}
              title="Recent notifications"
              action={
                <Link to="/dashboard/notifications">
                  <Button variant="ghost" size="sm">
                    See all
                  </Button>
                </Link>
              }
            />
            <CardBody>
              {notifications.loading ? (
                <SkeletonCard lines={3} />
              ) : (notifications.data ?? []).length ? (
                <ul className="space-y-2.5">
                  {(notifications.data as AppNotification[]).map((item) => (
                    <li key={item.id} className="rounded-xl border border-line bg-ivory/50 p-3">
                      <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                        {item.title}
                        {!item.read ? <span className="size-1.5 rounded-full bg-brand" aria-hidden /> : null}
                      </p>
                      <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{item.body}</p>
                      <p className="mt-1 text-[11px] text-muted">{relativeTime(item.createdAt)}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] text-muted">You have no notifications yet.</p>
              )}
            </CardBody>
          </Card>

          {winners.length ? (
            <Card>
              <CardHeader title="Your winning tickets" description="From published draw results." />
              <CardBody className="space-y-2">
                {winners.map((ticket) => (
                  <div key={ticket.id} className="rounded-xl border border-gold/40 bg-gold-soft/30 p-3">
                    <p className="font-display text-[15px] tabular-nums text-ink">
                      #{ticket.numberLabel}
                    </p>
                    <p className="text-[12px] text-muted">
                      {drawLabel(ticket.drawId)} — prize details are published in the winners list.
                    </p>
                    <Link
                      to="/winners"
                      className="mt-1 inline-flex text-[12px] font-semibold text-brand hover:underline"
                    >
                      View announcement
                    </Link>
                  </div>
                ))}
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

/** Best-effort label for a draw id (avoids an extra fetch per ticket). */
function drawLabel(drawId: string): string {
  const map: Record<string, string> = {
    draw_diwali_main: "Diwali Dhamaka Main Draw",
    draw_premium_bonanza: "Premium Bonanza Draw",
    draw_festive_kickoff: "Festive Kickoff Draw",
  };
  return map[drawId] ?? drawId;
}
