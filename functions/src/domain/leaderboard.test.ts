import { describe, expect, it } from "vitest";
import { buildReferralLeaderboard } from "./leaderboard.js";

const active = (fullName: string) => ({ fullName, status: "active" as const });
const on = (day: number) => `2026-10-${String(day).padStart(2, "0")}T10:00:00.000Z`;

describe("referral leaderboard", () => {
  it("counts non-rejected referrals per sponsor and ranks the highest first", () => {
    const rows = buildReferralLeaderboard(
      [
        { referrerUid: "a", status: "qualified", createdAt: on(1) },
        { referrerUid: "a", status: "pending", createdAt: on(2) },
        { referrerUid: "a", status: "rejected", createdAt: on(3) },
        { referrerUid: "b", status: "qualified", createdAt: on(1) },
        { referrerUid: "b", status: "qualified", createdAt: on(2) },
        { referrerUid: "b", status: "pending", createdAt: on(4) },
        { referrerUid: "c", status: "pending", createdAt: on(5) },
      ],
      new Map([
        ["a", active("Ravi Kumar")],
        ["b", active("Sita Devi")],
        ["c", active("Arjun")],
      ]),
    );
    expect(rows).toEqual([
      { uid: "b", name: "Sita D.", count: 3, rank: 1, reachedAt: on(4) },
      { uid: "a", name: "Ravi K.", count: 2, rank: 2, reachedAt: on(2) },
      { uid: "c", name: "Arjun", count: 1, rank: 3, reachedAt: on(5) },
    ]);
  });

  it("ranks equal counts by who reached that count first, with no shared ranks", () => {
    const rows = buildReferralLeaderboard(
      [
        { referrerUid: "x", status: "pending", createdAt: on(1) },
        { referrerUid: "x", status: "pending", createdAt: on(6) },
        { referrerUid: "y", status: "pending", createdAt: on(2) },
        { referrerUid: "y", status: "pending", createdAt: on(3) },
        { referrerUid: "y", status: "rejected", createdAt: on(9) },
        { referrerUid: "z", status: "pending", createdAt: on(4) },
        { referrerUid: "z", status: "pending", createdAt: on(5) },
        { referrerUid: "w", status: "pending", createdAt: on(7) },
      ],
      new Map([
        ["w", active("Zoya")],
        ["x", active("Bala")],
        ["y", active("Anu")],
        ["z", active("Kiran")],
      ]),
    );
    expect(rows.map((r) => [r.name, r.count, r.rank])).toEqual([
      ["Anu", 2, 1],
      ["Kiran", 2, 2],
      ["Bala", 2, 3],
      ["Zoya", 1, 4],
    ]);
  });

  it("leaves out suspended, missing and fully rejected sponsors", () => {
    const rows = buildReferralLeaderboard(
      [
        { referrerUid: "ok", status: "pending", createdAt: on(1) },
        { referrerUid: "banned", status: "qualified", createdAt: on(1) },
        { referrerUid: "ghost", status: "qualified", createdAt: on(1) },
        { referrerUid: "spam", status: "rejected", createdAt: on(1) },
      ],
      new Map([
        ["ok", active("Good User")],
        ["banned", { fullName: "Bad User", status: "suspended" as const }],
        ["spam", active("Spam User")],
      ]),
    );
    expect(rows.map((r) => r.uid)).toEqual(["ok"]);
  });
});
