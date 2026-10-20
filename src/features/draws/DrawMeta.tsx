import { Badge } from "@/components/ui";
import { useCountdown } from "@/hooks/useCountdown";
import type { DrawStatus } from "@/types";
import { cn } from "@/utils/cn";
import { formatDateTime, pad2 } from "@/utils/format";

export const DRAW_STATUS_META: Record<
  DrawStatus,
  { label: string; tone: "neutral" | "brand" | "gold" | "emerald" | "warning" | "danger" | "muted" }
> = {
  draft: { label: "Draft", tone: "muted" },
  upcoming: { label: "Upcoming", tone: "gold" },
  open: { label: "Sales open", tone: "emerald" },
  sales_closed: { label: "Sales closed", tone: "warning" },
  in_progress: { label: "Draw in progress", tone: "brand" },
  results_pending: { label: "Results pending", tone: "warning" },
  completed: { label: "Completed", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

export function DrawStatusBadge({ status }: { status: DrawStatus }) {
  const meta = DRAW_STATUS_META[status];
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

/**
 * Countdown that only ever renders a live state when the target time is in the
 * future. Server time is authoritative; this is a client-side presentation of
 * the configured schedule.
 */
export function CountdownTimer({
  target,
  label,
  size = "md",
  className,
}: {
  target?: string | null;
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const countdown = useCountdown(target);
  const cells = [
    { value: countdown.days, unit: "Days" },
    { value: countdown.hours, unit: "Hrs" },
    { value: countdown.minutes, unit: "Min" },
    { value: countdown.seconds, unit: "Sec" },
  ];

  const valueClass = {
    sm: "text-[18px]",
    md: "text-[24px]",
    lg: "text-[30px] sm:text-[38px]",
  }[size];

  return (
    <div className={cn("w-full", className)}>
      {label ? (
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-saffron">{label}</p>
      ) : null}
      <div
        className="flex flex-wrap gap-2"
        role="timer"
        aria-live="off"
        aria-label={countdown.expired ? "Countdown finished" : "Time remaining"}
      >
        {cells.map((cell) => (
          <div
            key={cell.unit}
            className="min-w-[62px] flex-1 rounded-xl border border-ivory/20 bg-ivory/10 px-2.5 py-2 text-center backdrop-blur-sm"
          >
            <p className={cn("font-display font-bold tabular-nums text-ivory", valueClass)}>
              {pad2(cell.value)}
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ivory/60">
              {cell.unit}
            </p>
          </div>
        ))}
      </div>
      {countdown.expired ? (
        <p className="mt-2 text-[12px] font-semibold text-gold-soft">
          The scheduled time has passed. Results are published only after an authorised administrator
          completes and publishes the draw.
        </p>
      ) : null}
    </div>
  );
}

/** Inline schedule line used on cards. */
export function DrawSchedule({ drawAt, salesCloseAt }: { drawAt: string; salesCloseAt: string }) {
  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
      <div>
        <dt className="text-muted">Sales close</dt>
        <dd className="font-semibold text-ink">{formatDateTime(salesCloseAt)}</dd>
      </div>
      <div>
        <dt className="text-muted">Draw time</dt>
        <dd className="font-semibold text-ink">{formatDateTime(drawAt)}</dd>
      </div>
    </dl>
  );
}
