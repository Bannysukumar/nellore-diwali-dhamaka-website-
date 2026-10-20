import { AlertCircle, Inbox, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { describeStoreError } from "@/lib/backend/store";
import { cn } from "@/utils/cn";
import { Button } from "./Button";

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-muted", className)}>
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label ? <span className="text-sm">{label}</span> : null}
      {label ? null : <span className="sr-only">Loading</span>}
    </span>
  );
}

export function Skeleton({
  className,
  rounded = "md",
}: {
  className?: string;
  rounded?: "sm" | "md" | "lg" | "full";
}) {
  const radius = {
    sm: "rounded-sm",
    md: "rounded-md",
    lg: "rounded-xl",
    full: "rounded-full",
  } as const;
  return <div aria-hidden className={cn("skeleton", radius[rounded], className)} />;
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-paper p-4">
      <Skeleton className="h-4 w-2/5" rounded="sm" />
      <div className="mt-3 space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-full" rounded="sm" />
        ))}
      </div>
    </div>
  );
}

export function SkeletonGrid({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid gap-3", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-24" rounded="lg" />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon: Icon = Inbox,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: typeof Inbox;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-line-strong bg-ivory/50 px-6 py-12 text-center",
        className,
      )}
    >
      <span className="grid size-12 place-items-center rounded-full bg-paper text-muted shadow-[var(--shadow-card)]">
        <Icon className="size-5" aria-hidden />
      </span>
      <h3 className="mt-4 font-display text-[17px] text-ink">{title}</h3>
      {description ? (
        <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description,
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-status-booked/25 bg-status-booked-bg/50 px-6 py-10 text-center",
        className,
      )}
    >
      <span className="grid size-11 place-items-center rounded-full bg-paper text-status-booked shadow-[var(--shadow-card)]">
        <AlertCircle className="size-5" aria-hidden />
      </span>
      <h3 className="mt-3.5 font-display text-[17px] text-ink">{title}</h3>
      {description ? (
        <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-muted">{description}</p>
      ) : null}
      {onRetry ? (
        <Button variant="outline" size="sm" className="mt-5" onClick={onRetry} iconLeft={<RefreshCw className="size-3.5" aria-hidden />}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function LoadingBlock({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center rounded-[var(--radius-card)] border border-line bg-paper px-6 py-12">
      <Spinner label={label} />
    </div>
  );
}

export type AlertTone = "info" | "success" | "warning" | "danger";

const ALERT_STYLES: Record<AlertTone, string> = {
  info: "border-saffron/30 bg-saffron-soft/50 text-ink",
  success: "border-emerald/25 bg-emerald-soft/60 text-ink",
  warning: "border-gold/40 bg-gold-soft/40 text-ink",
  danger: "border-status-booked/25 bg-status-booked-bg/60 text-ink",
};

const ALERT_ICONS: Record<AlertTone, typeof AlertCircle> = {
  info: AlertCircle,
  success: AlertCircle,
  warning: ShieldAlert,
  danger: AlertCircle,
};

export function Alert({
  tone = "info",
  title,
  children,
  className,
  action,
}: {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  const Icon = ALERT_ICONS[tone];
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border px-3.5 py-3 text-[13px] leading-relaxed",
        ALERT_STYLES[tone],
        className,
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          tone === "danger"
            ? "text-status-booked"
            : tone === "warning"
              ? "text-gold-deep"
              : tone === "success"
                ? "text-emerald"
                : "text-saffron",
        )}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold text-ink">{title}</p> : null}
        {children ? <div className={cn(title && "mt-0.5", "text-muted")}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

interface LoadSource {
  error: unknown;
  reload?: () => void;
  retry?: () => void;
}

/**
 * Surfaces failed reads instead of letting them render as empty lists or zero
 * totals. Renders nothing while every source is healthy.
 */
export function LoadErrors({
  sources,
  title = "Some information could not be loaded",
  className,
}: {
  sources: ReadonlyArray<LoadSource | null | undefined>;
  title?: string;
  className?: string;
}) {
  const failed = sources.filter((s): s is LoadSource => Boolean(s?.error));
  if (!failed.length) return null;
  const retryAll = () => failed.forEach((s) => (s.reload ?? s.retry)?.());
  return (
    <div role="alert" className={className}>
      <Alert
        tone="danger"
        title={title}
        action={
          <Button variant="outline" size="sm" onClick={retryAll} iconLeft={<RefreshCw className="size-3.5" aria-hidden />}>
            Retry
          </Button>
        }
      >
        {describeStoreError(failed[0].error)} Figures that depend on it are shown as “—” until it loads.
      </Alert>
    </div>
  );
}
