import type { LucideIcon } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/utils/cn";

/* ------------------------------------------------------------------- Card */

export function Card({
  className,
  interactive = false,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border border-line bg-paper shadow-[var(--shadow-card)]",
        interactive &&
          "transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-raised)]",
        className,
      )}
      {...rest}
    />
  );
}

export function CardHeader({
  title,
  description,
  icon: Icon,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {Icon ? (
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-ivory text-brand">
            <Icon className="size-4.5" aria-hidden />
          </span>
        ) : null}
        <div className="min-w-0">
          <h3 className="font-display text-[17px] leading-tight text-ink">{title}</h3>
          {description ? (
            <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{description}</p>
          ) : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-4 py-4 sm:px-5", className)} {...rest} />;
}

export function CardFooter({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("border-t border-line bg-ivory/60 px-4 py-3.5 sm:px-5", className)}
      {...rest}
    />
  );
}

/* --------------------------------------------------------- SectionHeading */

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  action,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  align?: "left" | "center";
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
        align === "center" && "sm:flex-col sm:items-center sm:text-center",
        className,
      )}
    >
      <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center")}>
        {eyebrow ? (
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="font-display text-[22px] leading-tight sm:text-[28px]">{title}</h2>
        {description ? (
          <p className="mt-2 text-[14px] leading-relaxed text-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/* -------------------------------------------------------------- StatCard */

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  className,
  to,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: "default" | "brand" | "gold" | "emerald" | "warning";
  className?: string;
  /** Makes the whole card a link. */
  to?: string;
}) {
  const tones: Record<string, string> = {
    default: "bg-ivory text-ink",
    brand: "bg-brand/10 text-brand",
    gold: "bg-gold-soft/60 text-gold-deep",
    emerald: "bg-emerald-soft text-emerald",
    warning: "bg-status-pending-bg text-status-pending",
  };
  const card = (
    <Card className={cn("p-4", to && "h-full hover:border-gold", className)} interactive={Boolean(to)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12px] font-medium uppercase tracking-[0.1em] text-muted">{label}</p>
        {Icon ? (
          <span className={cn("grid size-8 place-items-center rounded-lg", tones[tone])}>
            <Icon className="size-4" aria-hidden />
          </span>
        ) : null}
      </div>
      <p className="mt-2 font-display text-[24px] leading-none text-ink">{value}</p>
      {hint ? <p className="mt-1.5 text-[12px] leading-snug text-muted">{hint}</p> : null}
    </Card>
  );
  return to ? (
    <Link to={to} className="block rounded-[var(--radius-card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron/50">
      {card}
    </Link>
  ) : (
    card
  );
}
