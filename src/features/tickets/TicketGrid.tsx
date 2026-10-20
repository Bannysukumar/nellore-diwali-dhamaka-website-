import { TicketLegend } from "@/components/ui";
import type { Ticket } from "@/types";
import { cn } from "@/utils/cn";
import { TicketCell } from "./TicketCell";

/**
 * Responsive ticket grid.
 *
 * Columns scale from 5 on the narrowest phones up to 14 on wide desktops so
 * ticket numbers stay readable and tap targets stay usable. Only the current
 * page of tickets is in the DOM — the caller pages the data.
 */
export function TicketGrid({
  tickets,
  selectedIds,
  onToggle,
  selectable = true,
  className,
  showLegend = true,
}: {
  tickets: Ticket[];
  selectedIds: Set<string>;
  onToggle: (ticket: Ticket) => void;
  selectable?: boolean;
  className?: string;
  showLegend?: boolean;
}) {
  return (
    <div className={className}>
      {showLegend ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-ivory/60 px-3 py-2.5">
          <TicketLegend />
          <p className="text-[11px] text-muted">
            Tap an available number to select it. Sold, reserved and blocked numbers cannot be
            purchased.
          </p>
        </div>
      ) : null}

      <div
        className={cn(
          "grid gap-1 sm:gap-1.5",
          "grid-cols-5 min-[380px]:grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 xl:grid-cols-14",
        )}
      >
        {tickets.map((ticket) => (
          <TicketCell
            key={ticket.id}
            ticket={ticket}
            selected={selectedIds.has(ticket.id)}
            selectable={selectable}
            onToggle={onToggle}
          />
        ))}
      </div>
    </div>
  );
}

/** Compact summary strip shown above the grid. */
export function TicketCounters({
  total,
  available,
  pending,
  booked,
  blocked,
}: {
  total: number;
  available: number;
  pending: number;
  booked: number;
  blocked: number;
}) {
  const items = [
    { label: "Available", value: available, className: "text-emerald" },
    { label: "Pending", value: pending, className: "text-status-pending" },
    { label: "Booked", value: booked, className: "text-status-booked" },
    { label: "Blocked", value: blocked, className: "text-status-blocked" },
    { label: "Total", value: total, className: "text-ink" },
  ];
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-xl border border-line bg-paper px-3 py-2.5 text-center shadow-[var(--shadow-card)]"
        >
          <dd className={cn("font-display text-[19px] font-bold tabular-nums", item.className)}>
            {item.value.toLocaleString("en-IN")}
          </dd>
          <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
            {item.label}
          </dt>
        </div>
      ))}
    </dl>
  );
}
