import { Trophy, UserPlus, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { describeStoreError } from "@/lib/backend";
import { Button, ErrorState, Skeleton, StatCard } from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReferralLeaderboard, useReferralLeaderboard } from "@/features/referrals/ReferralLeaderboard";
import { formatNumber } from "@/utils/format";

export function DashboardLeaderboardPage() {
  const board = useReferralLeaderboard();
  const me = board.data?.me;

  return (
    <>
      <PageHeader
        eyebrow="Leaderboard"
        icon={Trophy}
        title="Referral leaderboard"
        description="Every sponsor ranked by how many people joined with their referral code."
        crumbs={[
          { label: "Home", to: "/" },
          { label: "Dashboard", to: "/dashboard" },
          { label: "Leaderboard" },
        ]}
        actions={
          <Link to="/dashboard/referrals">
            <Button variant="gold" iconLeft={<UserPlus className="size-4" aria-hidden />}>
              Invite friends
            </Button>
          </Link>
        }
      />

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard
          label="Your rank"
          value={board.loading ? "…" : me?.rank ? `#${me.rank}` : "—"}
          hint={me?.rank ? `Out of ${formatNumber(board.data?.totalSponsors)} sponsors` : "Invite a friend to get on the board"}
          icon={Trophy}
          tone="gold"
        />
        <StatCard
          label="Your referrals"
          value={board.loading ? "…" : formatNumber(me?.count ?? 0)}
          hint="People who joined with your code"
          icon={UserPlus}
          tone="brand"
        />
        <StatCard
          label="Sponsors on the board"
          value={board.loading ? "…" : formatNumber(board.data?.totalSponsors)}
          hint={board.data ? `${formatNumber(board.data.totalReferrals)} referrals in total` : undefined}
          icon={Users}
        />
      </div>

      <div className="mt-5">
        {board.loading ? (
          <div className="space-y-4">
            <Skeleton className="h-44" rounded="lg" />
            <Skeleton className="h-72" rounded="lg" />
          </div>
        ) : board.error || !board.data ? (
          <ErrorState
            title="The leaderboard could not be loaded"
            description={board.error ? describeStoreError(board.error) : undefined}
            onRetry={board.reload}
          />
        ) : (
          <ReferralLeaderboard board={board.data} />
        )}
      </div>
    </>
  );
}
