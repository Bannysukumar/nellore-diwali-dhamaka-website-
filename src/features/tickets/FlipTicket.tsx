import { useMemo, useState } from "react";
import { Download, RotateCw, Ticket as TicketIcon, Trophy } from "lucide-react";
import type { Draw, Ticket } from "@/types";
import { useToast } from "@/app/ToastProvider";
import { Button } from "@/components/ui";
import { cn } from "@/utils/cn";
import { formatINR } from "@/utils/money";
import { formatDateTime } from "@/utils/format";
import { SITE_HOST, downloadTicketImage, dummyBars, formatMobile } from "./ticketImage";

function DummyBarcode({ seed }: { seed: string }) {
  const { bars, total } = useMemo(() => dummyBars(seed), [seed]);
  return (
    <svg
      viewBox={`0 0 30 ${total}`}
      preserveAspectRatio="none"
      className="h-full w-8"
      aria-hidden
      focusable="false"
    >
      {bars.map((bar) => (
        <rect key={bar.y} x={0} y={bar.y} width={30} height={bar.h} fill="#202522" />
      ))}
    </svg>
  );
}

const notch = "absolute size-5 rounded-full bg-paper";

export function TicketDownloadButton({
  ticket,
  draw,
  holderName,
  holderPhone,
}: {
  ticket: Ticket;
  draw: Draw | null;
  holderName?: string;
  holderPhone?: string;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      await downloadTicketImage(ticket, draw, { name: holderName, phone: holderPhone });
    } catch (error) {
      toast.error("Download failed", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      loading={busy}
      onClick={() => void download()}
      iconLeft={<Download className="size-3.5" aria-hidden />}
    >
      Download
    </Button>
  );
}

export function FlipTicket({
  ticket,
  draw,
  holderName,
  holderPhone,
}: {
  ticket: Ticket;
  draw: Draw | null;
  holderName?: string;
  holderPhone?: string;
}) {
  const [flipped, setFlipped] = useState(false);
  const confirmed = ticket.status === "booked";
  const winner = ticket.resultStatus === "winner";

  return (
    <button
      type="button"
      onClick={() => setFlipped((value) => !value)}
      aria-pressed={flipped}
      className="group block w-full rounded-2xl text-left perspective-[1200px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
    >
      <div
        className={cn(
          "grid transition-transform duration-500 transform-3d motion-reduce:transition-none",
          flipped && "rotate-y-180",
        )}
      >
        <div
          aria-hidden={flipped}
          className="gradient-reward relative flex min-h-[176px] overflow-hidden rounded-2xl text-ivory shadow-[var(--shadow-card)] backface-hidden [grid-area:1/1]"
        >
          <div className="min-w-0 flex-1 p-4">
            <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.16em] text-gold-soft">
              <TicketIcon className="size-3.5" aria-hidden />
              Diwali Dhamaka ticket
            </p>
            <p className="mt-1 truncate font-display text-[15px] leading-tight">
              {draw?.title ?? "Festival draw"}
            </p>
            <p className="mt-2 font-display text-[34px] font-bold leading-none lining-nums tabular-nums text-gold-soft">
              #{ticket.numberLabel}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11.5px]">
              <div className="min-w-0">
                <dt className="text-ivory/60">Holder</dt>
                <dd className="truncate font-semibold">{holderName || "You"}</dd>
              </div>
              <div>
                <dt className="text-ivory/60">Paid</dt>
                <dd className="font-semibold tabular-nums">{formatINR(ticket.pricePaise)}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-ivory/60">Mobile number</dt>
                <dd className="font-semibold tabular-nums">{holderPhone ? formatMobile(holderPhone) : "—"}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-ivory/60">Draw date</dt>
                <dd className="font-semibold">{draw ? formatDateTime(draw.drawAt) : "—"}</dd>
              </div>
            </dl>
          </div>

          <div className="relative flex w-[92px] shrink-0 flex-col items-center justify-center gap-2 border-l-2 border-dashed border-ivory/30 px-2 text-center">
            <span className={cn(notch, "-left-[11px] -top-2.5")} aria-hidden />
            <span className={cn(notch, "-bottom-2.5 -left-[11px]")} aria-hidden />
            {winner ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-gold px-2 py-0.5 text-[10.5px] font-bold uppercase text-maroon-deep">
                <Trophy className="size-3" aria-hidden />
                Winner
              </span>
            ) : (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em]",
                  confirmed ? "bg-emerald-soft text-emerald" : "bg-status-pending-bg text-status-pending",
                )}
              >
                {confirmed ? "Confirmed" : ticket.status}
              </span>
            )}
            {winner && ticket.prizeTitle ? (
              <span className="text-[11px] font-semibold leading-tight text-gold-soft">{ticket.prizeTitle}</span>
            ) : null}
            <span className="mt-1 flex flex-col items-center gap-1 text-[10.5px] font-semibold leading-tight text-ivory/80">
              <RotateCw className="size-4 transition-transform group-hover:rotate-90" aria-hidden />
              Tap for coupon
            </span>
          </div>
        </div>

        <div
          aria-hidden={!flipped}
          className="relative flex min-h-[176px] overflow-hidden rounded-2xl border-2 border-dashed border-gold bg-[#fdf3d4] text-ink shadow-[var(--shadow-card)] backface-hidden rotate-y-180 [grid-area:1/1]"
        >
          <div className="flex min-w-0 flex-1 flex-col items-center justify-center px-3 py-3 text-center">
            <p className="font-display text-[19px] font-bold uppercase leading-[1.05] text-maroon">
              Diwali discount coupon
            </p>
            <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.1em] text-gold-deep">Up to 50% off</p>
            {confirmed ? (
              <>
                <p className="mt-2 text-[12px] font-semibold">Use coupon code:</p>
                <p className="text-[26px] font-extrabold leading-tight tracking-[0.16em] lining-nums tabular-nums text-brand">
                  {ticket.numberLabel}
                </p>
                <p className="mt-1 text-[11.5px] font-semibold leading-snug">
                  Show this ticket @ billing
                  <br />
                  Valid at all VRC Ground stalls
                </p>
              </>
            ) : (
              <p className="mt-2 text-[12px] font-semibold leading-snug text-muted">
                Your coupon code appears once this ticket is confirmed.
              </p>
            )}
            <p className="mt-1.5 text-[12px] font-extrabold tracking-[0.02em] text-brand">{SITE_HOST}</p>
            <p className="mt-0.5 flex items-center gap-1 text-[10px] text-muted">
              Ts &amp; Cs apply ·
              <RotateCw className="size-3" aria-hidden />
              Tap to see ticket
            </p>
          </div>

          <div className="relative flex w-[64px] shrink-0 items-center justify-center border-l-2 border-dashed border-gold py-3">
            <span className={cn(notch, "-left-[11px] -top-3 bg-paper")} aria-hidden />
            <span className={cn(notch, "-bottom-3 -left-[11px] bg-paper")} aria-hidden />
            <div className="h-full max-h-[140px] rounded-md bg-white p-1.5 shadow-sm">
              <DummyBarcode seed={ticket.id} />
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}
