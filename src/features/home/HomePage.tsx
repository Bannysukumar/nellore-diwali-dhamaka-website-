import { Award, Crown, Gift, Mail, MessageCircle, Phone, ShieldCheck, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { useAsync } from "@/hooks/useAsync";
import { useCollection } from "@/hooks/useCollection";
import { useAuth } from "@/app/AuthProvider";
import { useSiteSettings, useSupportContact } from "@/app/SettingsProvider";
import { contentService, FAQS } from "@/services/contentService";
import { drawService } from "@/services/drawService";
import { rewardService } from "@/services/rewardService";
import type { Banner, PrizeTier, WinnerAnnouncement } from "@/types";
import { describeStoreError } from "@/lib/backend";
import { Alert, Badge, Button, Card, CardBody, CardHeader, ErrorState, SectionHeading, SkeletonGrid } from "@/components/ui";
import { Hero } from "@/features/home/Hero";
import { HowItWorks } from "@/features/home/HowItWorks";
import { PackageSection } from "@/features/home/PackageSection";
import { ReferralBanner } from "@/features/home/ReferralBanner";
import { FaqAccordion } from "@/features/home/FaqAccordion";
import { DrawCard } from "@/features/draws/DrawCard";
import { WinnerTimeline } from "@/features/winners/WinnerTimeline";
import { formatNumber } from "@/utils/format";
import { formatINRPlain } from "@/utils/money";

const TIER_STYLE: Record<PrizeTier, { icon: typeof Crown; tone: string; label: string }> = {
  gold: { icon: Crown, tone: "bg-gold-soft/60 text-gold-deep", label: "Gold" },
  silver: { icon: Award, tone: "bg-[#EEF0F2] text-[#6B7280]", label: "Silver" },
  bronze: { icon: Gift, tone: "bg-saffron-soft text-saffron", label: "Bronze" },
  special: { icon: Sparkles, tone: "bg-emerald-soft text-emerald", label: "Special" },
};

export function HomePage() {
  const settings = useSiteSettings();
  const support = useSupportContact();
  const { user } = useAuth();

  const openDraw = useAsync(() => drawService.activeOpenDraw(), []);
  const upcoming = useAsync(() => drawService.upcoming(3), []);
  const packages = useAsync(() => contentService.packages(), []);
  const winners = useAsync(() => contentService.publishedWinners(6), []);
  const promoBanners = useCollection<Banner>("banners", {
    where: [
      { field: "slot", op: "==", value: "promo" },
      { field: "active", op: "==", value: true },
    ],
    orderBy: [{ field: "sortOrder", dir: "asc" }],
  });
  const spinConfig = useAsync(() => rewardService.spinConfig(), []);

  const draw = openDraw.data ?? null;
  const stats = useAsync(
    async () => (draw ? await drawService.stats(draw.id) : null),
    [draw?.id],
  );

  const heroBanner = contentService.activeOnly(promoBanners.data)[0] ?? null;
  const prizes = draw?.prizes ?? [];
  const hasSupport = Boolean(support.phone || support.email || support.whatsappUrl);

  return (
    <>
      <Hero
        brandName={settings.brandName}
        draw={draw}
        available={stats.data?.available ?? null}
        campaign={heroBanner}
        soldPercent={stats.data?.soldPercent ?? 0}
        drawStatus={openDraw.loading ? "loading" : openDraw.error ? "error" : "ready"}
      />

      {!settings.allowPaidDraws ? (
        <div className="page mt-4">
          <Alert tone="info" title="Paid draws are disabled">
            {settings.legalDisclaimer} You can browse every draw, ticket number and published result
            as a visitor.
          </Alert>
        </div>
      ) : null}

      {/* Live draw section */}
      <section className="page pt-10 sm:pt-14">
        <SectionHeading
          eyebrow="Live draw status"
          title={draw ? draw.title : openDraw.loading ? "Checking live draw status…" : "No draw is open for sales right now"}
          description={
            draw
              ? "Availability, closing time and draw schedule are read from the draw configuration."
              : openDraw.loading
                ? undefined
                : "Draws appear here as soon as an administrator opens sales."
          }
          action={
            draw ? (
              <Link to="/draws">
                <Button variant="outline" size="sm">
                  All draws
                </Button>
              </Link>
            ) : undefined
          }
        />
        {openDraw.error ? (
          <ErrorState
            className="mt-6"
            title="Live draw status is unavailable"
            description={describeStoreError(openDraw.error)}
            onRetry={openDraw.reload}
          />
        ) : (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Available tickets", value: stats.data ? formatNumber(stats.data.available) : "—", tone: "text-emerald" },
              { label: "Sold / reserved / blocked", value: stats.data ? formatNumber(stats.data.booked + stats.data.pending + stats.data.blocked) : "—", tone: "text-brand" },
              { label: "Ticket price", value: draw ? formatINRPlain(draw.ticketPricePaise) : "—", tone: "text-ink" },
              { label: "Prizes on offer", value: draw ? formatNumber(prizes.reduce((s, p) => s + p.quantity, 0)) : "—", tone: "text-gold-deep" },
            ].map((item) => (
              <Card key={item.label} className="p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                  {item.label}
                </p>
                <p className={`mt-2 font-display text-[26px] leading-none font-bold ${item.tone}`}>
                  {item.value}
                </p>
              </Card>
            ))}
          </div>
        )}
        {stats.error ? (
          <Alert tone="warning" className="mt-3" title="Ticket availability could not be loaded">
            {describeStoreError(stats.error)}{" "}
            <button type="button" className="font-semibold text-brand hover:underline" onClick={stats.reload}>
              Retry
            </button>
          </Alert>
        ) : null}
        {draw ? (
          <div className="mt-4">
            <Link to={`/draws/${draw.slug}`}>
              <Button block size="lg" iconRight={<Sparkles className="size-4" aria-hidden />}>
                Explore available tickets
              </Button>
            </Link>
          </div>
        ) : null}
      </section>

      <PackageSection packages={packages.data ?? []} />

      <HowItWorks />

      {/* Upcoming draws */}
      <section className="page py-14 sm:py-16">
        <SectionHeading
          eyebrow="Upcoming draws"
          title="Browse before you buy"
          description="Visitors can inspect every draw, its schedule, its prizes and its live ticket availability without registering."
          action={
            <Link to="/draws">
              <Button variant="outline" size="sm">
                See all draws
              </Button>
            </Link>
          }
        />
        <div className="mt-7">
          {upcoming.loading ? (
            <SkeletonGrid count={3} className="md:grid-cols-2 lg:grid-cols-3" />
          ) : upcoming.error ? (
            <ErrorState
              title="Draws could not be loaded"
              description={describeStoreError(upcoming.error)}
              onRetry={upcoming.reload}
            />
          ) : (upcoming.data ?? []).length ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {(upcoming.data ?? []).map((item, index) => (
                <DrawCard key={item.id} draw={item} index={index} />
              ))}
            </div>
          ) : (
            <Card className="p-8 text-center">
              <p className="font-display text-[17px]">No upcoming draws available.</p>
              <p className="mt-1.5 text-[13px] text-muted">
                New festival draws appear here as soon as they are published.
              </p>
            </Card>
          )}
        </div>
      </section>

      {/* Recently announced winners */}
      <section className="border-y border-line bg-ivory/70 py-14 sm:py-16">
        <div className="page">
          <SectionHeading
            eyebrow="Recently announced"
            title="Latest winners"
            description="Results are visible only after an authorised administrator completes the draw and publishes the results."
            action={
              <Link to="/winners">
                <Button variant="outline" size="sm" iconLeft={<Award className="size-4" aria-hidden />}>
                  All winners
                </Button>
              </Link>
            }
          />
          <div className="mt-7">
            {winners.error ? (
              <ErrorState
                title="Winners could not be loaded"
                description={describeStoreError(winners.error)}
                onRetry={winners.reload}
              />
            ) : winners.loading ? (
              <SkeletonGrid count={3} />
            ) : (
              <WinnerTimeline winners={(winners.data ?? []) as WinnerAnnouncement[]} compact />
            )}
          </div>
        </div>
      </section>

      {/* Prizes of the draw currently on sale */}
      <section className="page py-14 sm:py-16">
        <SectionHeading
          eyebrow="Prizes"
          title={draw ? `What you can win in ${draw.title}` : "What you can win"}
          description="Prize tiers and quantities are configured per draw and published in advance."
        />
        {prizes.length ? (
          <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {prizes.map((prize) => {
              const style = TIER_STYLE[prize.tier] ?? TIER_STYLE.special;
              return (
                <Card key={prize.id} className="p-5">
                  <span className={`grid size-11 place-items-center rounded-xl ${style.tone}`}>
                    <style.icon className="size-5" aria-hidden />
                  </span>
                  <p className="mt-3.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                    {style.label} ·{" "}
                    {prize.quantity > 0
                      ? `${prize.quantity} winner${prize.quantity === 1 ? "" : "s"}`
                      : "All participants"}
                  </p>
                  <h3 className="mt-1 font-display text-[17px]">{prize.title}</h3>
                  {prize.description ? (
                    <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{prize.description}</p>
                  ) : null}
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="mt-7 p-8 text-center">
            <p className="font-display text-[17px]">Prize details are published with each draw.</p>
            <p className="mt-1.5 text-[13px] text-muted">
              Open a draw from the draws page to see its prize tiers and quantities.
            </p>
          </Card>
        )}
      </section>

      {spinConfig.data?.enabled ? (
        <ReferralBanner spinsPerReferral={spinConfig.data.spinsPerReferral} />
      ) : null}

      <FaqAccordion items={FAQS} description="Everything about registration, deposits, tickets, referrals and published results." />

      {/* Contact & trust strip */}
      {hasSupport ? (
        <section className="page pb-4">
          <Card className="overflow-hidden">
            <CardHeader
              icon={ShieldCheck}
              title="Questions or payment issues?"
              description="Reach the festival support desk directly. Never share your OTP or bank password with anyone."
            />
            <CardBody>
              <div className="grid gap-3 sm:grid-cols-3">
                {support.phone && support.phoneHref ? (
                  <a
                    href={support.phoneHref}
                    className="flex items-center gap-3 rounded-xl border border-line bg-ivory/60 p-4 transition hover:border-gold"
                  >
                    <Phone className="size-5 text-brand" aria-hidden />
                    <span>
                      <span className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                        Call support
                      </span>
                      <span className="text-[14px] font-semibold text-ink">{support.phone}</span>
                    </span>
                  </a>
                ) : null}
                {support.whatsappUrl ? (
                  <a
                    href={support.whatsappUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 rounded-xl border border-line bg-ivory/60 p-4 transition hover:border-gold"
                  >
                    <MessageCircle className="size-5 text-emerald" aria-hidden />
                    <span>
                      <span className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                        WhatsApp
                      </span>
                      <span className="text-[14px] font-semibold text-ink">Chat with us</span>
                    </span>
                  </a>
                ) : null}
                {support.email ? (
                  <a
                    href={`mailto:${support.email}`}
                    className="flex items-center gap-3 rounded-xl border border-line bg-ivory/60 p-4 transition hover:border-gold"
                  >
                    <Mail className="size-5 text-saffron" aria-hidden />
                    <span>
                      <span className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                        Email
                      </span>
                      <span className="break-all text-[14px] font-semibold text-ink">{support.email}</span>
                    </span>
                  </a>
                ) : null}
              </div>
            </CardBody>
          </Card>
        </section>
      ) : null}

      {/* Legal & eligibility */}
      <section className="page pb-14">
        <div className="rounded-[var(--radius-card)] border border-line bg-paper p-5">
          <h2 className="font-display text-[17px]">Legal &amp; eligibility</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">{settings.legalDisclaimer}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/legal/terms">
              <Button variant="outline" size="sm">Terms &amp; conditions</Button>
            </Link>
            <Link to="/legal/privacy">
              <Button variant="outline" size="sm">Privacy policy</Button>
            </Link>
            <Link to="/legal/refund">
              <Button variant="outline" size="sm">Payment &amp; refund policy</Button>
            </Link>
            <Link to="/legal/eligibility">
              <Button variant="outline" size="sm">Responsible participation</Button>
            </Link>
          </div>
          <p className="mt-4 flex items-center gap-2 text-[12px] text-muted">
            <Badge tone="neutral">Age {settings.minAge}+</Badge>
            Participation is restricted to adults. No monetary return is promised or implied.
          </p>
          {user ? (
            <p className="mt-3 text-[12px] text-muted">
              Signed in{user.profile?.fullName ? ` as ${user.profile.fullName}` : ""}.{" "}
              <Link to="/dashboard" className="font-semibold text-brand hover:underline">
                Go to your dashboard
              </Link>
            </p>
          ) : (
            <p className="mt-3 text-[12px] text-muted">
              <Link to="/register" className="font-semibold text-brand hover:underline">
                Register with your mobile number
              </Link>{" "}
              to add money and book tickets.
            </p>
          )}
        </div>
      </section>
    </>
  );
}
