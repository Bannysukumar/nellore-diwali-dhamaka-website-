import type { Referral, UserProfile } from "./types.js";
import { displayName } from "./shared.js";

export interface LeaderboardRow {
  uid: string;
  name: string;
  count: number;
  rank: number;
}

/**
 * Ranks sponsors by how many people joined with their referral code. Rejected
 * referrals and sponsors whose account is missing or not active are left out.
 * Equal counts share a rank (1, 1, 3), and ties are listed alphabetically.
 */
export function buildReferralLeaderboard(
  referrals: Array<Pick<Referral, "referrerUid" | "status">>,
  sponsors: Map<string, Pick<UserProfile, "fullName" | "status">>,
): LeaderboardRow[] {
  const counts = new Map<string, number>();
  for (const referral of referrals) {
    if (referral.status === "rejected") continue;
    counts.set(referral.referrerUid, (counts.get(referral.referrerUid) ?? 0) + 1);
  }

  const rows = [...counts]
    .flatMap(([uid, count]) => {
      const sponsor = sponsors.get(uid);
      return sponsor?.status === "active" ? [{ uid, name: displayName(sponsor.fullName), count, rank: 0 }] : [];
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  rows.forEach((row, i) => {
    row.rank = i > 0 && rows[i - 1].count === row.count ? rows[i - 1].rank : i + 1;
  });
  return rows;
}
