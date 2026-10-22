import { Trophy, UserPlus } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/app/AuthProvider";
import { describeStoreError } from "@/lib/backend";
import { Button, Card, CardBody, ErrorState, Skeleton } from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { ReferralLeaderboard, useReferralLeaderboard } from "@/features/referrals/ReferralLeaderboard";
import { formatNumber } from "@/utils/format";

export function LeaderboardPage() {
  const { user } = useAuth();
  const board = useReferralLeaderboard();
  const me = board.data?.me;

  return (
    <>
      <PageHeader
        eyebrow="Leaderboard"
        icon={Trophy}
        title="Top referral sponsors"
        description="Sponsors ranked by how many people joined Diwali Dhamaka with their referral code."
        crumbs={[{ label: "Home", to: "/" }, { label: "Leaderboard" }]}
      />

      <div className="page py-8">
        <Card className="gradient-reward mb-6 text-ivory">
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gold-soft">
                {user ? "Your standing" : "Join the leaderboard"}
              </p>
              <p className="mt-1 font-display text-[20px] leading-snug">
                {user
                  ? me?.rank
                    ? `Rank ${me.rank} · ${formatNumber(me.count)} referral${me.count === 1 ? "" : "s"}`
                    : "Not on the board yet. Invite a friend to get started."
                  : "Register, share your code and climb the board."}
              </p>
            </div>
            <Link to={user ? "/dashboard/referrals" : "/register"}>
              <Button variant="gold" iconLeft={<UserPlus className="size-4" aria-hidden />}>
                {user ? "Invite friends" : "Register now"}
              </Button>
            </Link>
          </CardBody>
        </Card>

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
