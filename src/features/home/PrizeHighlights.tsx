import { ArrowRight, Gift, Ticket, Trophy } from "lucide-react";
import { Link } from "react-router-dom";
import { useAsync } from "@/hooks/useAsync";
import { drawService } from "@/services/drawService";
import type { Draw } from "@/types";
import { Button, Skeleton } from "@/components/ui";
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
            : draws.data?.map((draw) => <DrawPrizeCard key={draw.id} draw={draw} />)}
        </div>
      </div>
    </section>
  );
}

function DrawPrizeCard({ draw }: { draw: Draw }) {
  const price = formatINRPlain(draw.ticketPricePaise);
  const winners = draw.prizes.filter((prize) => prize.quantity > 0);
  const perks = draw.prizes.filter((prize) => prize.quantity <= 0);

  return (
    <div className="flex flex-col rounded-2xl bg-paper p-4 text-ink sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="inline-flex rounded-full bg-gold-soft px-2.5 py-0.5 text-[12px] font-bold text-gold-deep">
            {price} ticket
          </span>
          <h3 className="mt-1.5 font-display text-[18px] leading-tight">{draw.title}</h3>
        </div>
      </div>

      <table className="mt-3 w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-line text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">
            <th scope="col" className="py-1.5 pr-2 font-semibold">Prize</th>
            <th scope="col" className="py-1.5 pr-2 text-center font-semibold">Winners</th>
            <th scope="col" className="py-1.5 font-semibold">Reward</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {winners.map((prize) => (
            <tr key={prize.id}>
              <th scope="row" className="whitespace-nowrap py-2 pr-2 font-semibold text-brand">
                {prize.title.replace(/\s*prize$/i, "")}
              </th>
              <td className="py-2 pr-2 text-center font-semibold tabular-nums">{prize.quantity}</td>
              <td className="py-2 leading-snug">{prize.description}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {perks.map((perk) => (
        <p
          key={perk.id}
          className="mt-3 flex items-start gap-2 rounded-xl border border-emerald/30 bg-emerald/5 px-3 py-2 text-[12.5px] font-semibold leading-snug text-emerald"
        >
          <Gift className="mt-0.5 size-4 shrink-0" aria-hidden />
          {perk.description}
        </p>
      ))}

      <div className="mt-4 flex flex-wrap gap-2 pt-1">
        <Link to={`/book?draw=${encodeURIComponent(draw.id)}`} className="min-w-[14rem] flex-1">
          <Button block iconLeft={<Ticket className="size-4" aria-hidden />} iconRight={<ArrowRight className="size-3.5" aria-hidden />}>
            Book {price} tickets
          </Button>
        </Link>
        <Link to={`/draws/${draw.slug}`} className="flex-1 sm:flex-none">
          <Button block variant="outline">Details</Button>
        </Link>
      </div>
    </div>
  );
}
