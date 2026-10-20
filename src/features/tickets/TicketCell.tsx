import { Check, Lock } from "lucide-react";
import type { Ticket } from "@/types";
import { cn } from "@/utils/cn";

const STATUS_STYLES: Record<Ticket["status"], string> = {
  available:
    "border-emerald/35 bg-emerald-soft text-emerald hover:border-emerald hover:bg-emerald hover:text-white",
  pending: "border-status-pending/40 bg-status-pending-bg text-status-pending cursor-not-allowed",
  booked: "border-status-booked/30 bg-status-booked-bg text-status-booked cursor-not-allowed",
  blocked: "border-status-blocked/35 bg-status-blocked-bg text-status-blocked cursor-not-allowed",
};

export function TicketCell({
  ticket,
  selected,
  selectable,
  onToggle,
}: {
  ticket: Ticket;
  selected: boolean;
  selectable: boolean;
  onToggle: (ticket: Ticket) => void;
}) {
  const isAvailable = ticket.status === "available";
  const disabled = !isAvailable || !selectable;
  const isMine = ticket.status === "booked" && Boolean(ticket.ownerMaskedName) && selected;

  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      onClick={() => onToggle(ticket)}
      title={`Ticket ${ticket.numberLabel} — ${ticket.status}${
        ticket.ownerMaskedName ? ` (${ticket.ownerMaskedName})` : ""
      }`}
      aria-label={`Ticket ${ticket.numberLabel}, ${ticket.status}${
        selected ? ", selected" : ""
      }`}
      className={cn(
        "relative flex aspect-square flex-col items-center justify-center rounded-md border text-[9.5px] font-semibold tabular-nums leading-none transition-all duration-150 sm:rounded-lg sm:text-[11px]",
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-saffron",
        STATUS_STYLES[ticket.status],
        selected && isAvailable && "ring-2 ring-saffron ring-offset-1",
        selected && !isAvailable && "ring-2 ring-maroon/40",
        !disabled && "active:scale-95",
      )}
    >
      <span className="px-0.5">{ticket.numberLabel}</span>
      {selected && isAvailable ? (
        <Check className="absolute right-0.5 top-0.5 size-2.5 sm:size-3" aria-hidden />
      ) : null}
      {!isAvailable ? (
        <Lock className="absolute right-0.5 top-0.5 size-2.5 opacity-60 sm:size-3" aria-hidden />
      ) : null}
      {isMine ? <span className="sr-only">Your ticket</span> : null}
    </button>
  );
}
