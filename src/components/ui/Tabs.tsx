import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

export interface TabItem<T extends string = string> {
  value: T;
  label: ReactNode;
  count?: number;
  disabled?: boolean;
}

/**
 * Horizontal tab strip with a sliding indicator. Scrolls on small screens
 * instead of wrapping into an unreadable pile.
 */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  className,
  size = "md",
  ariaLabel,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (next: T) => void;
  className?: string;
  size?: "sm" | "md";
  ariaLabel: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "flex w-full gap-1 overflow-x-auto rounded-xl border border-line bg-ivory/70 p-1",
        "scrollbar-none",
        className,
      )}
      style={{ scrollbarWidth: "none" }}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            role="tab"
            type="button"
            aria-selected={active}
            disabled={item.disabled}
            onClick={() => onChange(item.value)}
            className={cn(
              "relative flex shrink-0 items-center gap-1.5 rounded-lg px-3 font-semibold transition",
              size === "sm" ? "text-[12px]" : "text-[13px]",
              active ? "text-maroon-deep" : "text-muted hover:text-ink",
              item.disabled && "cursor-not-allowed opacity-50",
            )}
          >
            {active ? (
              <motion.span
                layoutId={`tab-${String(ariaLabel).replace(/\s+/g, "-")}`}
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
                className="absolute inset-0 rounded-lg border border-line bg-paper shadow-[0_1px_2px_rgba(32,37,34,0.06)]"
              />
            ) : null}
            <span className="relative z-10 whitespace-nowrap">
              {item.label}
              {typeof item.count === "number" ? (
                <span className={cn("ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold", active ? "bg-gold-soft text-gold-deep" : "bg-line/60 text-muted")}>
                  {item.count}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Simple segmented control used in admin filters. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  ariaLabel,
}: {
  options: Array<{ value: T; label: ReactNode }>;
  value: T;
  onChange: (next: T) => void;
  className?: string;
  ariaLabel: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center rounded-lg border border-line bg-paper p-0.5",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-md px-2.5 py-1.5 text-[12px] font-semibold transition",
              active ? "bg-maroon text-ivory" : "text-muted hover:bg-ivory hover:text-ink",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
