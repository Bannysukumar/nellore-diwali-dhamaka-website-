import type { Referral, UserProfile } from "./types.js";
import { displayName } from "./shared.js";

export interface LeaderboardRow {
  uid: string;
  name: string;
  count: number;
  rank: number;
  /** When the sponsor's latest counted referral joined, i.e. when they reached `count`. */
  reachedAt: string;
}

/**
 * Ranks sponsors by how many people joined with their referral code. Rejected
 * referrals and sponsors whose account is missing or not active are left out.
 * Every sponsor gets a distinct rank: on equal counts, whoever reached that
 * count first ranks higher.
 */
export function buildReferralLeaderboard(
  referrals: Array<Pick<Referral, "referrerUid" | "status" | "createdAt">>,
  sponsors: Map<string, Pick<UserProfile, "fullName" | "status">>,
): LeaderboardRow[] {
  const tally = new Map<string, { count: number; reachedAt: string }>();
  for (const referral of referrals) {
    if (referral.status === "rejected") continue;
    const entry = tally.get(referral.referrerUid) ?? { count: 0, reachedAt: "" };
    entry.count += 1;
    const createdAt = referral.createdAt || "9999";
    if (createdAt > entry.reachedAt) entry.reachedAt = createdAt;
    tally.set(referral.referrerUid, entry);
  }

  const rows = [...tally]
    .flatMap(([uid, { count, reachedAt }]) => {
      const sponsor = sponsors.get(uid);
      return sponsor?.status === "active"
        ? [{ uid, name: displayName(sponsor.fullName), count, reachedAt, rank: 0 }]
        : [];
    })
    .sort(
      (a, b) =>
        b.count - a.count ||
        a.reachedAt.localeCompare(b.reachedAt) ||
        a.name.localeCompare(b.name) ||
        a.uid.localeCompare(b.uid),
    );

  rows.forEach((row, i) => {
    row.rank = i + 1;
  });
  return rows;
}
