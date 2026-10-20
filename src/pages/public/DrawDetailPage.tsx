import { useEffect, useState } from "react";
import { Award, CalendarClock, Info, Ticket as TicketIcon } from "lucide-react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useAsync } from "@/hooks/useAsync";
import { drawService } from "@/services/drawService";
import { describeStoreError } from "@/lib/backend";
import { useSiteSettings } from "@/app/SettingsProvider";
import type { PrizeTier } from "@/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  ProgressBar,
  Skeleton,
} from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { CountdownTimer, DrawStatusBadge } from "@/features/draws/DrawMeta";
import { formatDateTime, formatNumber } from "@/utils/format";
import { formatINRPlain } from "@/utils/money";

const TIER_LABEL: Record<PrizeTier, string> = {
  gold: "Gold",
  silver: "Silver",
  bronze: "Bronze",
  special: "Special gift",
};

export function DrawDetailPage() {
  const { slug = "" } = useParams();
  const { hash } = useLocation();
  const settings = useSiteSettings();
  const [imageFailed, setImageFailed] = useState(false);

  const draw = useAsync(() => drawService.getBySlug(slug), [slug]);
  const stats = useAsync(
    async () => (draw.data ? await drawService.stats(draw.data.id) : null),
    [draw.data?.id],
  );
  const result = useAsync(
    async () => (draw.data ? await drawService.result(draw.data.id) : null),
    [draw.data?.id],
  );

  const loadedId = draw.data?.id;
  useEffect(() => {
    if (loadedId && hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" });
  }, [loadedId, hash]);

  if (draw.loading) {
    return (
      <div className="page py-10">
        <Skeleton className="h-56" rounded="lg" />
      </div>
    );
  }

  if (draw.error) {
    return (
      <div className="page py-10">
        <ErrorState
          title="This draw could not be loaded"
          description={describeStoreError(draw.error)}
          onRetry={draw.reload}
        />
      </div>
    );
  }

  if (!draw.data) {
    return (
      <div className="page py-10">
        <EmptyState
          title="Draw not found"
          description="This draw may have been unpublished. Browse the current festival draws instead."
          action={
            <Link to="/draws">
              <Button>All draws</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const item = draw.data;
  const live = item.status === "open";
  const soldOut = stats.data?.available === 0;
  const canBuy = live && settings.allowPaidDraws && Boolean(stats.data) && !soldOut;
  const buyLabel = !live
    ? item.status === "upcoming"
      ? "Sales not open yet"
      : "Sales closed"
    : !settings.allowPaidDraws
      ? "Purchasing unavailable"
      : stats.loading
        ? "Checking availability…"
        : stats.error
          ? "Availability unavailable"
          : soldOut
            ? "Sold out"
            : null;
  const bookHref = `/book?draw=${encodeURIComponent(item.id)}`;

  return (
    <>
      <PageHeader
        tone="festival"
        eyebrow={live ? "Sales open" : "Draw details"}
        icon={CalendarClock}
        title={item.title}
        description={item.description}
        crumbs={[{ label: "Home", to: "/" }, { label: "Draws", to: "/draws" }, { label: item.title }]}
        actions={
          <>
            {canBuy ? (
              <Link to={bookHref}>
                <Button variant="gold" iconLeft={<TicketIcon className="size-4" aria-hidden />}>
                  Select ticket numbers
                </Button>
              </Link>
            ) : (
              <Button variant="gold" disabled iconLeft={<TicketIcon className="size-4" aria-hidden />}>
                {buyLabel}
              </Button>
            )}
            <DrawStatusBadge status={item.status} />
          </>
        }
      />

      <div className="page grid gap-6 py-8 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <div className="relative aspect-[16/7] w-full bg-maroon">
              {item.bannerUrl && !imageFailed ? (
                <img
                  src={item.bannerUrl}
                  alt=""
                  className="size-full object-cover"
                  onError={() => setImageFailed(true)}
                />
              ) : (
                <div className="gradient-hero size-full" />
              )}
              <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-2 bg-gradient-to-t from-maroon-deep/90 to-transparent p-3">
                <Badge tone="gold">{formatINRPlain(item.ticketPricePaise)} per ticket</Badge>
                <Badge tone="neutral">{formatNumber(item.totalTickets)} ticket numbers</Badge>
              </div>
            </div>
            <CardBody>
              <h2 className="font-display text-[19px]">Draw schedule</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-line bg-ivory/60 p-3.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                    Sales window
                  </p>
                  <p className="mt-1.5 text-[13px] text-ink">
                    Opens <span className="font-semibold">{formatDateTime(item.salesOpenAt)}</span>
                  </p>
                  <p className="text-[13px] text-ink">
                    Closes <span className="font-semibold">{formatDateTime(item.salesCloseAt)}</span>
                  </p>
                </div>
                <div className="rounded-xl border border-line bg-ivory/60 p-3.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                    Draw time ({item.timezone})
                  </p>
                  <p className="mt-1.5 font-display text-[18px] text-ink">
                    {formatDateTime(item.drawAt)}
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-line p-4">
                <CountdownTimer target={item.salesCloseAt} label="Sales close in" size="md" />
                <div className="mt-4">
                  <ProgressBar
                    value={stats.data ? stats.data.total - stats.data.available : 0}
                    max={stats.data?.total ?? item.totalTickets}
                    tone="gold"
                    label="Inventory taken"
                  />
                </div>
              </div>

              {!settings.allowPaidDraws ? (
                <Alert tone="info" className="mt-5" title="Paid draws are disabled">
                  {settings.legalDisclaimer}
                </Alert>
              ) : null}

              {result.data?.published ? (
                <Alert tone="success" className="mt-4" title="Results published">
                  {result.data.eligibleTicketCount} eligible tickets were included.{" "}
                  <Link to="/winners" className="font-semibold text-brand hover:underline">
                    View the published winners
                  </Link>
                  .
                </Alert>
              ) : result.data ? (
                <Alert tone="warning" className="mt-4" title="Draw completed — results pending publication">
                  The draw has been executed by an administrator. Winners become public only after
                  the results are separately published.
                </Alert>
              ) : null}
            </CardBody>
          </Card>

          <Card id="prizes" className="scroll-mt-24">
            <CardHeader
              icon={Award}
              title="Prize tiers"
              description="Quantities are published in advance and cannot be changed silently."
            />
            <CardBody className="space-y-3">
              {item.prizes.length ? (
                item.prizes.map((prize) => (
                  <div
                    key={prize.id}
                    className="flex flex-wrap items-start gap-3 rounded-xl border border-line bg-ivory/50 p-3.5"
                  >
                    {prize.imageUrl ? (
                      <img
                        src={prize.imageUrl}
                        alt=""
                        className="size-16 rounded-lg object-cover"
                        loading="lazy"
                        onError={(event) => {
                          (event.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={prize.tier === "gold" ? "gold" : prize.tier === "silver" ? "neutral" : "warning"}>
                          {TIER_LABEL[prize.tier]}
                        </Badge>
                        <span className="text-[12px] font-semibold text-muted">
                          {prize.quantity > 0
                            ? `${prize.quantity} winner${prize.quantity > 1 ? "s" : ""}`
                            : "All participants"}
                        </span>
                      </div>
                      <h3 className="mt-1.5 font-display text-[16px]">{prize.title}</h3>
                      <p className="mt-1 text-[13px] leading-relaxed text-muted">
                        {prize.description}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-[13px] text-muted">Prize details will be published shortly.</p>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Availability" description="Read live from the ticket inventory." />
            <CardBody>
              <dl className="grid grid-cols-2 gap-2.5">
                {[
                  { label: "Available", value: stats.data?.available, tone: "text-emerald" },
                  { label: "Pending", value: stats.data?.pending, tone: "text-status-pending" },
                  { label: "Booked", value: stats.data?.booked, tone: "text-status-booked" },
                  { label: "Blocked", value: stats.data?.blocked, tone: "text-status-blocked" },
                ].map((row) => (
                  <div key={row.label} className="rounded-xl border border-line bg-ivory/50 p-3">
                    <dd className={`font-display text-[22px] font-bold ${row.tone}`}>
                      {row.value === undefined ? "—" : formatNumber(row.value)}
                    </dd>
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                      {row.label}
                    </dt>
                  </div>
                ))}
              </dl>
              {stats.error ? (
                <Alert
                  tone="danger"
                  className="mt-4"
                  title="Availability could not be loaded"
                  action={
                    <Button size="sm" variant="outline" onClick={stats.reload}>
                      Retry
                    </Button>
                  }
                >
                  {describeStoreError(stats.error)}
                </Alert>
              ) : null}
              {canBuy ? (
                <Link to={bookHref} className="mt-4 block">
                  <Button block>Open the ticket grid</Button>
                </Link>
              ) : (
                <Button block disabled className="mt-4">
                  {buyLabel ?? "Not available for purchase"}
                </Button>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader icon={Info} title="Eligibility & rules" />
            <CardBody className="space-y-3 text-[13px] leading-relaxed text-muted">
              <p>{item.eligibility}</p>
              <ul className="space-y-1.5">
                <li>• Maximum {item.maxTicketsPerUser} tickets per account for this draw.</li>
                <li>• Ticket numbers are unique and assigned on purchase, not on request.</li>
                <li>• A purchase is final once the backend transaction completes.</li>
                <li>• Winners are published only after an authorised administrator publishes them.</li>
                <li>• Paid chance-based draws require a completed legal and compliance review.</li>
              </ul>
              <p className="text-[12px]">
                Read the{" "}
                <Link to="/legal/terms" className="font-semibold text-brand hover:underline">
                  terms
                </Link>
                ,{" "}
                <Link to="/legal/refund" className="font-semibold text-brand hover:underline">
                  refund policy
                </Link>{" "}
                and{" "}
                <Link to="/legal/eligibility" className="font-semibold text-brand hover:underline">
                  eligibility rules
                </Link>
                .
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
