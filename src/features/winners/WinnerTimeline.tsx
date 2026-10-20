import { motion } from "framer-motion";
import { Award, CalendarDays, Crown, Gift, Ticket } from "lucide-react";
import type { PrizeTier, WinnerAnnouncement } from "@/types";
import { Badge, Card } from "@/components/ui";
import { formatDateTime } from "@/utils/format";
import { cn } from "@/utils/cn";
import { usePrefersReducedMotion } from "@/hooks/useMediaQuery";

const TIER_STYLES: Record<PrizeTier, { label: string; icon: typeof Crown; badge: string; ring: string; text: string }> = {
  gold: {
    label: "Gold Winner",
    icon: Crown,
    badge: "gradient-gold text-maroon-deep",
    ring: "ring-gold/40",
    text: "text-gold-deep",
  },
  silver: {
    label: "Silver Winner",
    icon: Award,
    badge: "bg-[#E4E7EB] text-[#5B6472]",
    ring: "ring-[#C9CDD2]",
    text: "text-[#5B6472]",
  },
  bronze: {
    label: "Bronze Winner",
    icon: Award,
    badge: "bg-saffron-soft text-saffron",
    ring: "ring-saffron/40",
    text: "text-saffron",
  },
  special: {
    label: "Special Gift Winner",
    icon: Gift,
    badge: "bg-emerald-soft text-emerald",
    ring: "ring-emerald/40",
    text: "text-emerald",
  },
};

export function WinnerCard({
  winner,
  index = 0,
  compact = false,
}: {
  winner: WinnerAnnouncement;
  index?: number;
  compact?: boolean;
}) {
  const reduced = usePrefersReducedMotion();
  const tier = TIER_STYLES[winner.prizeTier];

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.05, 0.3), ease: [0.22, 1, 0.36, 1] }}
    >
      <Card className={cn("h-full overflow-hidden ring-1", tier.ring)}>
        <div className="flex items-start gap-3 border-b border-line px-4 py-3">
          <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", tier.badge)}>
            <tier.icon className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className={cn("text-[10.5px] font-bold uppercase tracking-[0.16em]", tier.text)}>
              {tier.label}
            </p>
            <h3 className="mt-0.5 font-display text-[15px] leading-snug text-ink">
              {winner.prizeTitle}
            </h3>
          </div>
        </div>

        <div className={cn("px-4 py-3.5", compact && "py-3")}>
          <p className="font-display text-[19px] font-bold text-ink">{winner.winnerDisplayName}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone="neutral" icon={Ticket}>
              Ticket {winner.ticketNumberMasked}
            </Badge>
            <Badge tone="muted" icon={CalendarDays}>
              {formatDateTime(winner.publishedAt ?? winner.createdAt)}
            </Badge>
          </div>
          {!compact ? (
            <p className="mt-2.5 text-[12.5px] leading-relaxed text-muted">{winner.prizeDescription}</p>
          ) : null}
          <p className="mt-2.5 border-t border-line pt-2 text-[11px] text-muted">
            {winner.drawTitle} · full ticket numbers, mobile numbers and payment details are never
            published.
          </p>
        </div>
      </Card>
    </motion.div>
  );
}

/**
 * Vertical timeline of published winners. Only ever receives results that an
 * administrator has already published.
 */
export function WinnerTimeline({
  winners,
  compact = false,
}: {
  winners: WinnerAnnouncement[];
  compact?: boolean;
}) {
  if (!winners.length) {
    return (
      <div className="rounded-[var(--radius-card)] border border-dashed border-line-strong bg-paper/60 px-6 py-12 text-center">
        <p className="font-display text-[17px] text-ink">No published results yet</p>
        <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted">
          Winners appear here once an authorised administrator completes a draw and publishes the
          results.
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      <span
        className="pointer-events-none absolute left-[22px] top-2 bottom-2 hidden w-px bg-gradient-to-b from-gold via-line to-transparent sm:block"
        aria-hidden
      />
      <ol className="space-y-4">
        {winners.map((winner, index) => (
          <li key={winner.id} className="relative sm:pl-14">
            <span
              className="pointer-events-none absolute left-0 top-4 hidden size-11 place-items-center rounded-full border border-line bg-paper shadow-[var(--shadow-card)] sm:grid"
              aria-hidden
            >
              {(() => {
                const TierIcon = TIER_STYLES[winner.prizeTier].icon;
                return <TierIcon className={cn("size-5", TIER_STYLES[winner.prizeTier].text)} />;
              })()}
            </span>
            <WinnerCard winner={winner} index={index} compact={compact} />
          </li>
        ))}
      </ol>
    </div>
  );
}
