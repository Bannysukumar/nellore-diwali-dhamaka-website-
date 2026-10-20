import { ArrowRight, Ticket, Trophy } from "lucide-react";
import { Link } from "react-router-dom";
import { useAsync } from "@/hooks/useAsync";
import { drawService } from "@/services/drawService";
import { Button, Skeleton } from "@/components/ui";
import { DrawPrizeCard } from "@/features/draws/DrawPrizeCard";
import { formatINRPlain } from "@/utils/money";

/** Prize tables for every draw open for sales, each with a direct booking link. */
export function PrizeHighlights() {
  const draws = useAsync(async () => {
    const rows = await drawService.upcoming(6);
    return rows
      .filter((draw) => draw.status === "open" && draw.prizes.length)
      .sort((a, b) => a.ticketPricePaise - b.ticketPricePaise);
  }, []);

  if (draws.error || (!draws.loading && !draws.data?.length)) return null;

  return (
    <section className="page pt-5 sm:pt-8" aria-labelledby="prize-highlights-title">
      <div className="gradient-reward overflow-hidden rounded-[var(--radius-card)] p-4 text-ivory shadow-[var(--shadow-raised)] sm:p-6">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-gold-soft">
          <Trophy className="size-3.5" aria-hidden />
          Diwali Dhamaka prizes
        </p>
        <h2 id="prize-highlights-title" className="mt-1 font-display text-[22px] leading-tight sm:text-[28px]">
          Pick your draw and win big this Diwali
        </h2>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {draws.loading
            ? Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-72 bg-white/10" rounded="lg" />
              ))
            : draws.data?.map((draw) => (
                <DrawPrizeCard key={draw.id} draw={draw}>
                  <Link to={`/book?draw=${encodeURIComponent(draw.id)}`} className="min-w-[14rem] flex-1">
                    <Button
                      block
                      iconLeft={<Ticket className="size-4" aria-hidden />}
                      iconRight={<ArrowRight className="size-3.5" aria-hidden />}
                    >
                      Book {formatINRPlain(draw.ticketPricePaise)} tickets
                    </Button>
                  </Link>
                  <Link to={`/draws/${draw.slug}`} className="flex-1 sm:flex-none">
                    <Button block variant="outline">Details</Button>
                  </Link>
                </DrawPrizeCard>
              ))}
        </div>
      </div>
    </section>
  );
}
