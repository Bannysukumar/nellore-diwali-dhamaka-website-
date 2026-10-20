import { useState } from "react";
import { Award } from "lucide-react";
import { useAsync } from "@/hooks/useAsync";
import { contentService } from "@/services/contentService";
import type { PrizeTier, WinnerAnnouncement } from "@/types";
import { describeStoreError } from "@/lib/backend";
import { EmptyState, ErrorState, Segmented, Skeleton } from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { WinnerTimeline } from "@/features/winners/WinnerTimeline";

type Tier = "all" | PrizeTier;

const FILTERS: Array<{ value: Tier; label: string }> = [
  { value: "all", label: "All tiers" },
  { value: "gold", label: "Gold" },
  { value: "silver", label: "Silver" },
  { value: "bronze", label: "Bronze" },
  { value: "special", label: "Special" },
];

export function WinnersPage() {
  const [filter, setFilter] = useState<Tier>("all");
  const all = useAsync(() => contentService.publishedWinners(200), []);
  const winners: WinnerAnnouncement[] = all.data ?? [];

  const visible =
    filter === "all" ? winners : winners.filter((w) => w.prizeTier === filter);

  return (
    <>
      <PageHeader
        eyebrow="Winners"
        icon={Award}
        title="Recently announced festival winners"
        description="Results are published only after an authorised administrator runs a draw and publishes the results. Identifying details are partially masked for privacy."
        crumbs={[{ label: "Home", to: "/" }, { label: "Winners" }]}
      />

      <div className="page py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented options={FILTERS} value={filter} onChange={setFilter} ariaLabel="Filter winners by tier" />
          <p className="text-[12px] text-muted">
            {visible.length} winner{visible.length === 1 ? "" : "s"} shown
          </p>
        </div>

        <div className="mt-6">
          {all.loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-28" rounded="lg" />
              ))}
            </div>
          ) : all.error ? (
            <ErrorState
              title="Winners could not be loaded"
              description={describeStoreError(all.error)}
              onRetry={all.reload}
            />
          ) : visible.length ? (
            <WinnerTimeline winners={visible} />
          ) : (
            <EmptyState
              title={filter === "all" ? "No winners have been announced yet" : "No winners yet for this tier"}
              description="Winners appear here only after an administrator publishes draw results."
            />
          )}
        </div>
      </div>
    </>
  );
}
