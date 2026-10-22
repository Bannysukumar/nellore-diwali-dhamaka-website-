import { useMemo, useState } from "react";
import { Award, Crown, Search, Trophy } from "lucide-react";
import { useAuth } from "@/app/AuthProvider";
import { useAsync } from "@/hooks/useAsync";
import { callBackend } from "@/lib/backend/callBackend";
import type { LeaderboardEntry, ReferralLeaderboardResponse } from "@/lib/backend/api";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Input } from "@/components/ui";
import { initials } from "@/utils/mask";
import { formatNumber } from "@/utils/format";
import { cn } from "@/utils/cn";

/** Re-fetches when the person signs in or out, so "You" and "Your rank" stay right. */
export function useReferralLeaderboard() {
  const { uid } = useAuth();
  return useAsync(
    () => callBackend<Record<string, never>, ReferralLeaderboardResponse>("getReferralLeaderboard", {}),
    [uid],
  );
}

const PODIUM = [
  { badge: "gradient-gold text-maroon-deep", ring: "ring-gold/50", text: "text-gold-deep", icon: Crown, label: "1st" },
  { badge: "bg-[#E4E7EB] text-[#5B6472]", ring: "ring-[#C9CDD2]", text: "text-[#5B6472]", icon: Award, label: "2nd" },
  { badge: "bg-saffron-soft text-saffron", ring: "ring-saffron/40", text: "text-saffron", icon: Award, label: "3rd" },
];

const PAGE = 100;

const referralsLabel = (count: number) => `${formatNumber(count)} referral${count === 1 ? "" : "s"}`;

function Podium({ top }: { top: LeaderboardEntry[] }) {
  return (
    <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
      {top.map((entry, i) => {
        const style = PODIUM[Math.min(entry.rank, 3) - 1] ?? PODIUM[2];
        return (
          <Card
            key={`${entry.rank}-${entry.name}-${i}`}
            className={cn("text-center ring-1", style.ring, i === 0 && "sm:-translate-y-2", entry.you && "bg-gold-soft/30")}
          >
            <CardBody className="flex flex-col items-center gap-1.5 px-2 py-4 sm:px-4">
              <span className={cn("grid size-11 place-items-center rounded-2xl sm:size-14", style.badge)}>
                <style.icon className="size-5 sm:size-6" aria-hidden />
              </span>
              <p className={cn("text-[10.5px] font-bold uppercase tracking-[0.16em]", style.text)}>
                Rank {entry.rank}
              </p>
              <p className="w-full truncate font-display text-[15px] text-ink sm:text-[19px]">{entry.name}</p>
              <p className="font-display text-[22px] leading-none text-brand tabular-nums sm:text-[30px]">
                {formatNumber(entry.count)}
              </p>
              <p className="text-[11px] text-muted">referral{entry.count === 1 ? "" : "s"}</p>
              {entry.you ? <Badge tone="gold">You</Badge> : null}
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}

/** Podium for the top three, then every sponsor with a search box. */
export function ReferralLeaderboard({ board }: { board: ReferralLeaderboardResponse }) {
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? board.entries.filter((e) => e.name.toLowerCase().includes(q)) : board.entries;
  }, [board.entries, query]);

  if (!board.entries.length) {
    return (
      <EmptyState
        icon={Trophy}
        title="No referrals yet"
        description="The leaderboard fills up as soon as people join with a sponsor's referral code."
      />
    );
  }

  return (
    <div className="space-y-5">
      <Podium top={board.entries.slice(0, 3)} />

      <Card>
        <CardHeader
          icon={Trophy}
          title="All sponsors"
          description={`${formatNumber(board.totalSponsors)} sponsors · ${referralsLabel(board.totalReferrals)} in total`}
        />
        <CardBody className="space-y-3">
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setShown(PAGE);
            }}
            placeholder="Search a name"
            aria-label="Search the leaderboard by name"
            prefix={<Search className="size-4" aria-hidden />}
          />

          {visible.length ? (
            <ol className="divide-y divide-line overflow-hidden rounded-xl border border-line">
              {visible.slice(0, shown).map((entry, i) => (
                <li
                  key={`${entry.rank}-${entry.name}-${i}`}
                  className={cn("flex items-center gap-3 px-3 py-2.5", entry.you ? "bg-gold-soft/40" : "bg-white")}
                >
                  <span
                    className={cn(
                      "grid h-8 min-w-8 shrink-0 place-items-center rounded-full px-1.5 text-[12.5px] font-bold tabular-nums",
                      entry.rank <= 3 ? PODIUM[entry.rank - 1].badge : "bg-ivory text-muted",
                    )}
                  >
                    {entry.rank}
                  </span>
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand/10 text-[11px] font-bold text-brand">
                    {initials(entry.name)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink">
                    {entry.name}
                    {entry.you ? (
                      <Badge tone="gold" className="ml-2 align-middle">
                        You
                      </Badge>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="font-display text-[17px] text-ink tabular-nums">{formatNumber(entry.count)}</span>
                    <span className="ml-1 text-[11.5px] text-muted">ref{entry.count === 1 ? "" : "s"}</span>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="py-6 text-center text-[13px] text-muted">No sponsor matches “{query}”.</p>
          )}

          {visible.length > shown ? (
            <Button variant="outline" block onClick={() => setShown(visible.length)}>
              Show all {formatNumber(visible.length)} sponsors
            </Button>
          ) : null}
          <p className="text-[11.5px] leading-relaxed text-muted">
            Counts every person who joined with the sponsor's code, except referrals rejected under the fair-use rules.
            When two sponsors have the same count, whoever reached it first ranks higher. Names are shortened for
            privacy. Updated every minute.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
