import { motion } from "framer-motion";
import { ArrowRight, Radio, Ticket, Trophy } from "lucide-react";
import { Link } from "react-router-dom";
import type { Banner, Draw } from "@/types";
import { Badge, Button } from "@/components/ui";
import { CountdownTimer, DrawStatusBadge } from "@/features/draws/DrawMeta";
import { formatINRPlain } from "@/utils/money";
import { formatNumber } from "@/utils/format";
import { usePrefersReducedMotion } from "@/hooks/useMediaQuery";
import { cn } from "@/utils/cn";

/**
 * Festival hero: brand, headline, primary/secondary actions, the *actual*
 * next-draw countdown and the administrator's active campaign banner.
 */
export function Hero({
  brandName,
  draw,
  available,
  campaign,
  soldPercent,
  drawStatus = "ready",
}: {
  brandName: string;
  draw: Draw | null;
  /** Whether the open-draw lookup is still running or failed; never claim "no draw" until it finished. */
  drawStatus?: "loading" | "error" | "ready";
  available: number | null;
  campaign: Banner | null;
  soldPercent: number;
}) {
  const reduced = usePrefersReducedMotion();
  const live = draw?.status === "open";

  const fade = (delay: number) =>
    reduced
      ? {}
      : {
          initial: { opacity: 0, y: 18 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] as const },
        };

  return (
    <section className="relative isolate overflow-hidden gradient-hero text-ivory">
      {/* Decorative festival pattern — sits strictly behind content. */}
      <div className="pattern-rangoli pointer-events-none absolute inset-0 opacity-25" aria-hidden />
      <div
        className="pointer-events-none absolute -right-24 -top-24 size-[420px] rounded-full bg-gold/15 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-32 -left-16 size-[380px] rounded-full bg-saffron/10 blur-3xl"
        aria-hidden
      />

      <div className="page relative grid gap-10 py-10 sm:py-16 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:gap-12 lg:py-20">
        <div>
          <motion.p
            {...fade(0)}
            className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.24em] text-gold-soft"
          >
            <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1">
              <span className="size-1.5 rounded-full bg-gold" aria-hidden />
              Festival season · Nellore
            </span>
          </motion.p>

          <motion.h1
            {...fade(0.08)}
            className="mt-4 font-display text-[38px] leading-[1.03] tracking-[-0.02em] sm:text-[58px] lg:text-[68px]"
          >
            Nellore <span className="text-gold-gradient">Diwali Dhamaka</span>
          </motion.h1>

          <motion.p
            {...fade(0.16)}
            className="mt-5 max-w-xl text-[15px] leading-relaxed text-ivory/80 sm:text-[17px]"
          >
            Book festival tickets, follow the live draws and unlock rewards with every referral.
            Every ticket carries a unique number and an equal chance at the published prize tiers.
          </motion.p>

          <motion.div {...fade(0.24)} className="mt-7 flex flex-wrap items-center gap-3">
            <Link to="/book">
              <Button size="lg" variant="gold" iconRight={<ArrowRight className="size-4" aria-hidden />}>
                Explore Tickets
              </Button>
            </Link>
            <Link to="/winners">
              <Button
                size="lg"
                variant="ghost"
                className="border border-ivory/30 text-ivory hover:bg-ivory/10"
                iconLeft={<Trophy className="size-4" aria-hidden />}
              >
                View Winners
              </Button>
            </Link>
          </motion.div>

          {campaign ? (
            <motion.div
              {...fade(0.3)}
              className="mt-8 flex flex-col gap-3 rounded-[var(--radius-card)] border border-ivory/20 bg-ivory/10 p-3.5 backdrop-blur-sm sm:flex-row sm:items-center sm:gap-4"
            >
              {campaign.imageUrl ? (
                <img
                  src={campaign.imageUrl}
                  alt=""
                  className="h-20 w-full rounded-lg object-cover sm:w-36"
                  loading="lazy"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="font-display text-[16px] text-ivory">{campaign.title}</p>
                {campaign.subtitle ? (
                  <p className="mt-0.5 text-[13px] text-ivory/75">{campaign.subtitle}</p>
                ) : null}
              </div>
              {campaign.ctaHref ? (
                <Link to={campaign.ctaHref} className="shrink-0">
                  <Button size="sm" variant="gold">
                    {campaign.ctaLabel || "Learn more"}
                  </Button>
                </Link>
              ) : null}
            </motion.div>
          ) : null}
        </div>

        {/* Live draw card */}
        <motion.aside
          {...(reduced
            ? {}
            : {
                initial: { opacity: 0, scale: 0.96, y: 20 },
                animate: { opacity: 1, scale: 1, y: 0 },
                transition: { duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] as const },
              })}
          className="ornament-frame rounded-[var(--radius-panel)] bg-maroon-deep/55 p-5 backdrop-blur-md sm:p-6"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-gold-soft">
              {live ? (
                <>
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald opacity-70" />
                    <span className="relative inline-flex size-2 rounded-full bg-emerald" />
                  </span>
                  Sales open
                </>
              ) : (
                <>
                  <Radio className="size-3.5" aria-hidden />
                  Next scheduled draw
                </>
              )}
            </p>
            {draw ? <DrawStatusBadge status={draw.status} /> : null}
          </div>

          {draw ? (
            <>
              <h2 className="mt-3 font-display text-[22px] leading-tight text-ivory">{draw.title}</h2>
              <div className="mt-4">
                <CountdownTimer target={draw.salesCloseAt} label="Sales close in" size="sm" />
              </div>

              <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl border border-ivory/15 bg-ivory/5 p-2.5">
                  <dd className="font-display text-[19px] font-bold text-ivory">
                    {formatINRPlain(draw.ticketPricePaise)}
                  </dd>
                  <dt className="text-[10px] uppercase tracking-[0.1em] text-ivory/60">
                    Per ticket
                  </dt>
                </div>
                <div className="rounded-xl border border-ivory/15 bg-ivory/5 p-2.5">
                  <dd className="font-display text-[19px] font-bold text-emerald">
                    {available === null ? "—" : formatNumber(available)}
                  </dd>
                  <dt className="text-[10px] uppercase tracking-[0.1em] text-ivory/60">Available</dt>
                </div>
                <div className="rounded-xl border border-ivory/15 bg-ivory/5 p-2.5">
                  <dd className="font-display text-[19px] font-bold text-ivory">
                    {formatNumber(draw.totalTickets)}
                  </dd>
                  <dt className="text-[10px] uppercase tracking-[0.1em] text-ivory/60">In draw</dt>
                </div>
              </dl>

              {available !== null ? (
                <div className="mt-4">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-ivory/15">
                    <div
                      className={cn(
                        "h-full rounded-full transition-[width] duration-700",
                        soldPercent > 0.85 ? "bg-status-booked" : "bg-gradient-to-r from-gold to-saffron",
                      )}
                      style={{ width: `${Math.min(100, Math.round(soldPercent * 100))}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] text-ivory/60">
                    {Math.round(soldPercent * 100)}% of the inventory is taken, reserved or blocked
                  </p>
                </div>
              ) : null}

              <Link to={`/draws/${draw.slug}`} className="mt-5 block">
                <Button block iconLeft={<Ticket className="size-4" aria-hidden />}>
                  Choose your ticket numbers
                </Button>
              </Link>
            </>
          ) : drawStatus === "loading" ? (
            <div className="py-6" aria-busy="true">
              <p className="font-display text-[19px] text-ivory">Checking the draw schedule…</p>
            </div>
          ) : drawStatus === "error" ? (
            <div className="py-6">
              <p className="font-display text-[19px] text-ivory">The draw schedule could not be loaded.</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ivory/70">
                Check your connection. Live draw status below has a retry option.
              </p>
            </div>
          ) : (
            <div className="py-6">
              <p className="font-display text-[19px] text-ivory">No draw is currently scheduled.</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ivory/70">
                The next festival draw will appear here as soon as an administrator opens sales.
              </p>
              <Link to="/draws" className="mt-5 block">
                <Button block variant="gold">
                  See upcoming draws
                </Button>
              </Link>
            </div>
          )}

          <p className="mt-4 flex items-center gap-2 text-[11px] text-ivory/55">
            <Badge tone="gold" className="border-gold/40 bg-gold/10 text-gold-soft">
              {brandName.split(" ")[0]}
            </Badge>
            Countdown reflects the administrator's configured schedule.
          </p>
        </motion.aside>
      </div>
    </section>
  );
}
