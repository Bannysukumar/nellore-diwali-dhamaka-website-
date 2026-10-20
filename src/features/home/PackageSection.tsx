import { motion } from "framer-motion";
import { ArrowRight, Check, Gift } from "lucide-react";
import { Link } from "react-router-dom";
import type { TicketPackage } from "@/types";
import { Button, SectionHeading } from "@/components/ui";
import { formatINRPlain } from "@/utils/money";
import { cn } from "@/utils/cn";
import { usePrefersReducedMotion } from "@/hooks/useMediaQuery";

/**
 * Ticket packages. Amount paid and tickets received are shown as separate
 * figures — never blended into a single "value" number.
 */
export function PackageSection({ packages }: { packages: TicketPackage[] }) {
  const reduced = usePrefersReducedMotion();
  if (!packages.length) return null;

  return (
    <section className="border-y border-line bg-ivory/70 py-14 sm:py-16">
      <div className="page">
        <SectionHeading
          eyebrow="Ticket packages"
          title="Choose how many tickets you want"
          description="Every amount is broken into the amount you pay and the tickets you receive. Pricing is always re-confirmed at checkout from the draw configuration."
        />

        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {packages.map((pkg, index) => {
            const perTicket = Math.round(pkg.pricePaise / Math.max(1, pkg.ticketCount));
            const featured = index === 1;
            return (
              <motion.div
                key={pkg.id}
                initial={reduced ? false : { opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.4, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
                className={cn(
                  "relative flex flex-col overflow-hidden rounded-[var(--radius-panel)] border p-5 shadow-[var(--shadow-card)]",
                  featured ? "gradient-reward border-gold/50 text-ivory" : "border-line bg-paper",
                )}
              >
                {pkg.badge ? (
                  <span
                    className={cn(
                      "absolute right-4 top-4 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]",
                      featured ? "gradient-gold text-maroon-deep" : "bg-gold-soft text-gold-deep",
                    )}
                  >
                    {pkg.badge}
                  </span>
                ) : null}

                <h3
                  className={cn(
                    "font-display text-[20px]",
                    featured ? "text-ivory" : "text-ink",
                  )}
                >
                  {pkg.name}
                </h3>

                <div className="mt-3 flex items-baseline gap-2">
                  <span className="font-display text-[34px] leading-none font-bold">
                    {formatINRPlain(pkg.pricePaise)}
                  </span>
                  <span
                    className={cn(
                      "text-[12px] font-semibold uppercase tracking-[0.1em]",
                      featured ? "text-ivory/70" : "text-muted",
                    )}
                  >
                    Amount paid
                  </span>
                </div>
                <p
                  className={cn(
                    "mt-1.5 inline-flex w-fit items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-bold",
                    featured ? "bg-ivory/15 text-gold-soft" : "bg-emerald-soft text-emerald",
                  )}
                >
                  {pkg.ticketCount} ticket{pkg.ticketCount > 1 ? "s" : ""} received
                  {perTicket !== pkg.pricePaise
                    ? ` · ${formatINRPlain(perTicket)} each`
                    : ""}
                </p>

                {pkg.rewardDescription ? (
                  <p
                    className={cn(
                      "mt-3 text-[13px] leading-relaxed",
                      featured ? "text-ivory/80" : "text-muted",
                    )}
                  >
                    {pkg.rewardDescription}
                  </p>
                ) : null}

                <ul className="mt-4 flex-1 space-y-2">
                  {pkg.benefits.map((benefit) => (
                    <li key={benefit} className="flex items-start gap-2 text-[13px] leading-relaxed">
                      <Check
                        className={cn(
                          "mt-0.5 size-4 shrink-0",
                          featured ? "text-gold-soft" : "text-emerald",
                        )}
                        aria-hidden
                      />
                      <span className={featured ? "text-ivory/85" : "text-ink"}>{benefit}</span>
                    </li>
                  ))}
                </ul>

                {pkg.terms ? (
                  <p
                    className={cn(
                      "mt-4 border-t pt-3 text-[11px] leading-relaxed",
                      featured ? "border-ivory/20 text-ivory/60" : "border-line text-muted",
                    )}
                  >
                    {pkg.terms}
                  </p>
                ) : null}

                <Link
                  to={`/book?${new URLSearchParams({
                    ...(pkg.drawId ? { draw: pkg.drawId } : {}),
                    qty: String(pkg.ticketCount),
                  }).toString()}`}
                  className="mt-4 block"
                >
                  <Button
                    block
                    variant={featured ? "gold" : "primary"}
                    iconRight={<ArrowRight className="size-4" aria-hidden />}
                  >
                    Get {pkg.ticketCount === 1 ? "this pack" : "these tickets"}
                  </Button>
                </Link>
              </motion.div>
            );
          })}
        </div>

        <p className="mt-6 flex items-center justify-center gap-2 text-[12px] text-muted">
          <Gift className="size-4 text-gold-deep" aria-hidden />
          Packages are marketing presets. The authoritative ticket price always comes from the draw.
        </p>
      </div>
    </section>
  );
}
