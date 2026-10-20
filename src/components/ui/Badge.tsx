import type { ReactNode } from "react";
import { cn } from "@/utils/cn";
import type { TicketStatus } from "@/types";

export type BadgeTone =
  | "neutral"
  | "brand"
  | "gold"
  | "emerald"
  | "warning"
  | "danger"
  | "muted";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-ivory text-ink border-line-strong",
  brand: "bg-brand/10 text-brand border-brand/25",
  gold: "bg-gold-soft/70 text-gold-deep border-gold/40",
  emerald: "bg-emerald-soft text-emerald border-emerald/25",
  warning: "bg-status-pending-bg text-status-pending border-status-pending/30",
  danger: "bg-status-booked-bg text-status-booked border-status-booked/25",
  muted: "bg-ivory text-muted border-line",
};

export function Badge({
  children,
  tone = "neutral",
  className,
  icon: Icon,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em]",
        TONES[tone],
        className,
      )}
    >
      {Icon ? <Icon className="size-3.5" aria-hidden /> : null}
      {children}
    </span>
  );
}

const TICKET_TONES: Record<TicketStatus, { tone: BadgeTone; label: string }> = {
  available: { tone: "emerald", label: "Available" },
  pending: { tone: "warning", label: "Pending" },
  booked: { tone: "danger", label: "Booked" },
  blocked: { tone: "warning", label: "Blocked" },
};

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  const config = TICKET_TONES[status];
  return <Badge tone={config.tone}>{config.label}</Badge>;
}

/** Compact legend explaining the ticket colour system. */
export function TicketLegend({ className }: { className?: string }) {
  const items: Array<{ status: TicketStatus; swatch: string; label: string }> = [
    { status: "available", swatch: "bg-emerald", label: "Available" },
    { status: "pending", swatch: "bg-status-pending", label: "Pending" },
    { status: "booked", swatch: "bg-status-booked", label: "Booked" },
    { status: "blocked", swatch: "bg-status-blocked", label: "Blocked" },
  ];
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-muted", className)}>
      {items.map((item) => (
        <li key={item.status} className="flex items-center gap-1.5">
          <span className={cn("size-2.5 rounded-full", item.swatch)} aria-hidden />
          <span>{item.label}</span>
        </li>
      ))}
    </ul>
  );
}