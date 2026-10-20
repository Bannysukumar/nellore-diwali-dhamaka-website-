import type { ReactNode } from "react";
import { cn } from "@/utils/cn";
import { EmptyState } from "./Feedback";

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
  /** Hidden below this breakpoint to keep small screens readable. */
  hideBelow?: "sm" | "md" | "lg";
}

const HIDE: Record<string, string> = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
};

/**
 * Data table with a card fallback. The mobile layout renders each row as a
 * labelled card instead of forcing horizontal scrolling.
 */
export function DataTable<T>({
  columns,
  rows,
  keyOf,
  emptyTitle,
  emptyDescription,
  emptyAction,
  caption,
  rowClassName,
}: {
  columns: Array<Column<T>>;
  rows: T[];
  keyOf: (row: T) => string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  caption?: string;
  rowClassName?: (row: T) => string;
}) {
  if (!rows.length) {
    return (
      <EmptyState title={emptyTitle ?? "Nothing here yet"} description={emptyDescription} action={emptyAction} />
    );
  }

  return (
    <>
      {/* Desktop */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full border-collapse text-[13px]">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead>
            <tr className="border-b border-line bg-ivory/70">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    "px-3 py-2.5 text-left font-semibold text-muted uppercase tracking-[0.06em] text-[11px]",
                    column.align === "right" && "text-right",
                    column.align === "center" && "text-center",
                    column.hideBelow && HIDE[column.hideBelow],
                    column.className,
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={keyOf(row)}
                className={cn(
                  "border-b border-line/70 transition hover:bg-ivory/50",
                  rowClassName?.(row),
                )}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      "px-3 py-2.5 align-middle",
                      column.align === "right" && "text-right",
                      column.align === "center" && "text-center",
                      column.hideBelow && HIDE[column.hideBelow],
                      column.className,
                    )}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: stacked cards */}
      <ul className="space-y-2 sm:hidden">
        {rows.map((row) => (
          <li
            key={keyOf(row)}
            className="rounded-xl border border-line bg-paper p-3 shadow-[var(--shadow-card)]"
          >
            <dl className="space-y-1.5">
              {columns.map((column) => (
                <div key={column.key} className="flex items-start justify-between gap-3">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                    {column.header}
                  </dt>
                  <dd className="min-w-0 text-right text-[13px] text-ink">{column.render(row)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
