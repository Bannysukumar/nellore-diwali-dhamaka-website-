import type { ReactNode } from "react";
import { Gift } from "lucide-react";
import type { Draw } from "@/types";
import { cn } from "@/utils/cn";
import { formatINRPlain } from "@/utils/money";

/** Ticket price, title and prize table of one draw; `children` render as the card's actions. */
export function DrawPrizeCard({
  draw,
  className,
  children,
}: {
  draw: Draw;
  className?: string;
  children?: ReactNode;
}) {
  const winners = draw.prizes.filter((prize) => prize.quantity > 0);
  const perks = draw.prizes.filter((prize) => prize.quantity <= 0);

  return (
    <div className={cn("flex flex-col rounded-2xl bg-paper p-4 text-ink sm:p-5", className)}>
      <span className="inline-flex self-start rounded-full bg-gold-soft px-2.5 py-0.5 text-[12px] font-bold text-gold-deep">
        {formatINRPlain(draw.ticketPricePaise)} ticket
      </span>
      <h3 className="mt-1.5 font-display text-[18px] leading-tight">{draw.title}</h3>

      {winners.length ? (
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
      ) : null}

      {perks.map((perk) => (
        <p
          key={perk.id}
          className="mt-3 flex items-start gap-2 rounded-xl border border-emerald/30 bg-emerald/5 px-3 py-2 text-[12.5px] font-semibold leading-snug text-emerald"
        >
          <Gift className="mt-0.5 size-4 shrink-0" aria-hidden />
          {perk.description}
        </p>
      ))}

      {children ? <div className="mt-auto flex flex-wrap gap-2 pt-4">{children}</div> : null}
    </div>
  );
}
