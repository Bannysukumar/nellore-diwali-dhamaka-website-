import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/utils/cn";
import { Button } from "./Button";

export function ProgressBar({
  value,
  max = 100,
  tone = "brand",
  label,
  className,
}: {
  value: number;
  max?: number;
  tone?: "brand" | "gold" | "emerald" | "saffron";
  label?: string;
  className?: string;
}) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const fills = {
    brand: "bg-brand",
    gold: "bg-gold",
    emerald: "bg-emerald",
    saffron: "bg-saffron",
  } as const;
  return (
    <div className={cn("w-full", className)}>
      {label ? (
        <div className="mb-1.5 flex items-baseline justify-between text-[12px]">
          <span className="text-muted">{label}</span>
          <span className="font-semibold text-ink">{Math.round(percent)}%</span>
        </div>
      ) : null}
      <div
        role="progressbar"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="h-2 w-full overflow-hidden rounded-full bg-line/70"
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-500", fills[tone])}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  onChange,
  className,
}: {
  page: number;
  totalPages: number;
  onChange: (next: number) => void;
  className?: string;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav
      aria-label="Pagination"
      className={cn("flex items-center justify-center gap-2", className)}
    >
      <Button
        variant="outline"
        size="sm"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        iconLeft={<ChevronLeft className="size-3.5" aria-hidden />}
      >
        Previous
      </Button>
      <span className="px-2 text-[13px] text-muted">
        Page <span className="font-semibold text-ink">{page}</span> of {totalPages}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        iconRight={<ChevronRight className="size-3.5" aria-hidden />}
      >
        Next
      </Button>
    </nav>
  );
}

/** Numeric ticker with tabular figures — keeps counters from jittering. */
export function Stat({ value, className }: { value: string | number; className?: string }) {
  return (
    <span className={cn("tabular-nums", className)}>{value}</span>
  );
}
