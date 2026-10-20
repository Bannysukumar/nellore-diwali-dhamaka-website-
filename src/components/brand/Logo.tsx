import { Link } from "react-router-dom";
import { cn } from "@/utils/cn";
import { useSiteSettings } from "@/app/SettingsProvider";

/** Inline diya mark — no network request, scales to any size. */
export function DiyaMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("size-9", className)} role="img" aria-hidden>
      <rect width="64" height="64" rx="16" fill="var(--color-maroon)" />
      <path d="M12 42h40c-3 11-13 16-20 16s-17-5-20-16z" fill="var(--color-saffron)" />
      <path d="M32 9c7 10 13 15 13 23a13 13 0 1 1-26 0c0-8 6-13 13-23z" fill="var(--color-gold)" />
      <path d="M32 25c3 5 6 8 6 12a6 6 0 1 1-12 0c0-4 3-7 6-12z" fill="var(--color-ivory)" />
    </svg>
  );
}

export function Logo({
  compact = false,
  className,
  to = "/",
  light = false,
}: {
  compact?: boolean;
  className?: string;
  to?: string;
  light?: boolean;
}) {
  const settings = useSiteSettings();
  return (
    <Link
      to={to}
      className={cn("group flex min-w-0 items-center gap-2.5", className)}
      aria-label={`${settings.brandName} home`}
    >
      <DiyaMark className="size-9 shrink-0 transition-transform duration-200 group-hover:rotate-3" />
      {!compact ? (
        <span className="min-w-0">
          <span
            className={cn(
              "block truncate font-display text-[17px] leading-tight font-bold tracking-[-0.01em]",
              light ? "text-ivory" : "text-maroon",
            )}
          >
            {settings.brandName.split(" ").slice(0, 2).join(" ")}
          </span>
          <span
            className={cn(
              "block truncate text-[10px] font-semibold uppercase tracking-[0.22em]",
              light ? "text-gold-soft" : "text-gold-deep",
            )}
          >
            {settings.brandName.split(" ").slice(2).join(" ") || "Festival Draws"}
          </span>
        </span>
      ) : null}
    </Link>
  );
}
