import { useState } from "react";
import { LayoutGrid, Trophy } from "lucide-react";
import { useAsync } from "@/hooks/useAsync";
import { drawService } from "@/services/drawService";
import type { DrawStatus } from "@/types";
import { describeStoreError } from "@/lib/backend";
import { Button, EmptyState, ErrorState, Segmented, SkeletonGrid } from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { DrawCard } from "@/features/draws/DrawCard";
import { Link } from "react-router-dom";

type Filter = "all" | "open" | "upcoming" | "completed";

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "All draws" },
  { value: "open", label: "Open now" },
  { value: "upcoming", label: "Upcoming" },
  { value: "completed", label: "Completed" },
];

const MATCHES: Record<Filter, (status: DrawStatus) => boolean> = {
  all: () => true,
  open: (s) => s === "open",
  upcoming: (s) => s === "upcoming" || s === "sales_closed",
  completed: (s) => s === "completed" || s === "cancelled",
};

export function DrawsPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const draws = useAsync(() => drawService.listPublic(30), []);
  const stats = useAsync(async () => {
    const list = draws.data ?? [];
    const entries = await Promise.all(
      list.map(async (draw) => [draw.id, await drawService.stats(draw.id)] as const),
    );
    return Object.fromEntries(entries);
  }, [draws.data]);

  const visible = (draws.data ?? []).filter((draw) => MATCHES[filter](draw.status));

  return (
    <>
      <PageHeader
        eyebrow="Festival draws"
        icon={Trophy}
        title="Browse every draw and its live availability"
        description="Visitors can inspect schedules, prizes and remaining ticket numbers without registering. Registration is required only when you buy."
        crumbs={[{ label: "Home", to: "/" }, { label: "Draws" }]}
        actions={
          <Link to="/book">
            <Button iconLeft={<LayoutGrid className="size-4" aria-hidden />}>Open ticket grid</Button>
          </Link>
        }
      />

      <div className="page py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented options={FILTERS} value={filter} onChange={setFilter} ariaLabel="Filter draws" />
          <p className="text-[12px] text-muted">
            {visible.length} draw{visible.length === 1 ? "" : "s"} shown
          </p>
        </div>

        <div className="mt-6">
          {draws.loading ? (
            <SkeletonGrid count={3} className="md:grid-cols-2 lg:grid-cols-3" />
          ) : draws.error ? (
            <ErrorState
              title="Draws could not be loaded"
              description={describeStoreError(draws.error)}
              onRetry={draws.reload}
            />
          ) : visible.length ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {visible.map((draw, index) => {
                const s = stats.data?.[draw.id];
                return (
                  <DrawCard
                    key={draw.id}
                    draw={draw}
                    index={index}
                    available={s?.available}
                    soldPercent={s?.soldPercent}
                  />
                );
              })}
            </div>
          ) : (
            <EmptyState
              title={filter === "all" ? "No draws have been published yet" : "No draws match this filter"}
              description={
                filter === "all"
                  ? "Draws appear here once the organiser publishes them."
                  : "Try a different filter to see other published draws."
              }
              action={
                filter === "all" ? undefined : (
                  <Button variant="outline" onClick={() => setFilter("all")}>
                    Show all draws
                  </Button>
                )
              }
            />
          )}
        </div>
      </div>
    </>
  );
}
