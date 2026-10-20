import { motion } from "framer-motion";
import { ArrowRight, Ticket, Trophy } from "lucide-react";
import { Link } from "react-router-dom";
import type { Draw } from "@/types";
import { Badge, Button, Card } from "@/components/ui";
import { DrawSchedule, DrawStatusBadge } from "./DrawMeta";
import { formatINRPlain } from "@/utils/money";
import { formatNumber } from "@/utils/format";
import { usePrefersReducedMotion } from "@/hooks/useMediaQuery";

export function DrawCard({
  draw,
  available,
  soldPercent = 0,
  index = 0,
}: {
  draw: Draw;
  available?: number;
  soldPercent?: number;
  index?: number;
}) {
  const reduced = usePrefersReducedMotion();
  const soldOut = available !== undefined && available === 0;

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.05, 0.3), ease: [0.22, 1, 0.36, 1] }}
    >
      <Card interactive className="flex h-full flex-col overflow-hidden">
        <div className="relative aspect-[16/7] w-full overflow-hidden bg-maroon">
          {draw.bannerUrl ? (
            <img
              src={draw.bannerUrl}
              alt=""
              loading="lazy"
              className="size-full object-cover"
              onError={(event) => {
                (event.currentTarget as HTMLImageElement).style.opacity = "0";
              }}
            />
          ) : (
            <div className="gradient-hero size-full" />
          )}
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-maroon-deep/90 to-transparent p-3">
            <div className="flex flex-wrap items-center gap-2">
              <DrawStatusBadge status={draw.status} />
            </div>
            <Badge tone="gold">{formatINRPlain(draw.ticketPricePaise)} / ticket</Badge>
          </div>
        </div>

        <div className="flex flex-1 flex-col p-4">
          <h3 className="font-display text-[18px] leading-tight text-ink">{draw.title}</h3>
          <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-muted">
            {draw.description}
          </p>

          <div className="mt-3.5 grid grid-cols-3 gap-2 rounded-xl border border-line bg-ivory/60 p-3 text-center">
            <div>
              <p className="font-display text-[17px] font-bold text-ink">
                {formatNumber(draw.totalTickets)}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">Total</p>
            </div>
            <div>
              <p className="font-display text-[17px] font-bold text-emerald">
                {available === undefined ? "—" : formatNumber(available)}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
                Available
              </p>
            </div>
            <div>
              <p className="font-display text-[17px] font-bold text-brand">
                {draw.prizes.reduce((sum, p) => sum + p.quantity, 0)}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">Prizes</p>
            </div>
          </div>

          <div className="mt-3.5">
            <DrawSchedule drawAt={draw.drawAt} salesCloseAt={draw.salesCloseAt} />
          </div>

          {soldPercent > 0 ? (
            <div className="mt-3">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-line/70">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-saffron to-brand"
                  style={{ width: `${Math.min(100, Math.round(soldPercent * 100))}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] text-muted">
                {Math.round(soldPercent * 100)}% of the inventory is taken, reserved or blocked
              </p>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2 pt-1">
            <Link to={`/draws/${draw.slug}`} className="min-w-0 flex-1">
              <Button
                block
                variant={soldOut || draw.status !== "open" ? "outline" : "primary"}
                size="sm"
                iconLeft={<Ticket className="size-4" aria-hidden />}
                iconRight={<ArrowRight className="size-3.5" aria-hidden />}
              >
                {draw.status === "open" && !soldOut ? "View tickets" : "Details"}
              </Button>
            </Link>
            {draw.prizes.length ? (
              <Link to={`/draws/${draw.slug}#prizes`} aria-label={`Prizes for ${draw.title}`}>
                <Button variant="ghost" size="sm" iconLeft={<Trophy className="size-4" aria-hidden />}>
                  Prizes
                </Button>
              </Link>
            ) : null}
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
