import { onCall } from "firebase-functions/v2/https";
import { CALLABLE_OPTIONS, COLLECTIONS, clean, db } from "./firestore.js";
import { buildReferralLeaderboard, type LeaderboardRow } from "./domain/leaderboard.js";
import type { Referral, UserProfile } from "./domain/types.js";
import { nowIso } from "./domain/shared.js";

/** Public traffic reads the cached ranking; it is recounted at most once a minute. */
const CACHE_SECONDS = 60;
/** Keeps the cache document well under Firestore's 1 MiB limit. */
const MAX_ROWS = 5000;

interface CachedLeaderboard {
  rows: LeaderboardRow[];
  totalReferrals: number;
  generatedAt: string;
}

export interface ReferralLeaderboardResponse {
  generatedAt: string;
  totalReferrals: number;
  totalSponsors: number;
  entries: Array<{ rank: number; name: string; count: number; you?: boolean }>;
  /** The caller's own standing; null when signed out. */
  me: { rank: number | null; count: number } | null;
}

async function rebuild(): Promise<CachedLeaderboard> {
  const referrals = (await db().collection(COLLECTIONS.referrals).select("referrerUid", "status").get()).docs.map(
    (d) => d.data() as Pick<Referral, "referrerUid" | "status">,
  );
  const uids = [...new Set(referrals.map((r) => r.referrerUid))];
  const sponsors = new Map<string, Pick<UserProfile, "fullName" | "status">>();
  for (let i = 0; i < uids.length; i += 300) {
    const refs = uids.slice(i, i + 300).map((uid) => db().collection(COLLECTIONS.users).doc(uid));
    const snaps = await db().getAll(...refs, { fieldMask: ["fullName", "status"] });
    for (const snap of snaps) {
      if (snap.exists) sponsors.set(snap.id, snap.data() as Pick<UserProfile, "fullName" | "status">);
    }
  }
  const rows = buildReferralLeaderboard(referrals, sponsors);
  const board: CachedLeaderboard = {
    rows: rows.slice(0, MAX_ROWS),
    totalReferrals: rows.reduce((sum, row) => sum + row.count, 0),
    generatedAt: nowIso(),
  };
  await db().collection(COLLECTIONS.leaderboards).doc("referrals").set(board);
  return board;
}

/**
 * Public ranking of sponsors by referral count. Open to signed-out visitors:
 * it exposes only shortened names and counts, never ids or phone numbers.
 */
export const getReferralLeaderboard = onCall<unknown>(
  CALLABLE_OPTIONS,
  async (request): Promise<ReferralLeaderboardResponse> => {
    const cached = (await db().collection(COLLECTIONS.leaderboards).doc("referrals").get()).data() as
      | CachedLeaderboard
      | undefined;
    const fresh = cached && Date.now() - Date.parse(cached.generatedAt) < CACHE_SECONDS * 1000;
    const board = fresh ? cached : await rebuild();

    const uid = request.auth?.uid;
    const mine = uid ? board.rows.find((row) => row.uid === uid) : undefined;
    return {
      generatedAt: board.generatedAt,
      totalReferrals: board.totalReferrals,
      totalSponsors: board.rows.length,
      entries: board.rows.map((row) =>
        clean({ rank: row.rank, name: row.name, count: row.count, you: uid && row.uid === uid ? true : undefined }),
      ),
      me: uid ? { rank: mine?.rank ?? null, count: mine?.count ?? 0 } : null,
    };
  },
);
