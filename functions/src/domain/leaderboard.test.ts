import { describe, expect, it } from "vitest";
import { buildReferralLeaderboard } from "./leaderboard.js";

const active = (fullName: string) => ({ fullName, status: "active" as const });

describe("referral leaderboard", () => {
  it("counts non-rejected referrals per sponsor and ranks the highest first", () => {
    const rows = buildReferralLeaderboard(
      [
        { referrerUid: "a", status: "qualified" },
        { referrerUid: "a", status: "pending" },
        { referrerUid: "a", status: "rejected" },
        { referrerUid: "b", status: "qualified" },
        { referrerUid: "b", status: "qualified" },
        { referrerUid: "b", status: "pending" },
        { referrerUid: "c", status: "pending" },
      ],
      new Map([
        ["a", active("Ravi Kumar")],
        ["b", active("Sita Devi")],
        ["c", active("Arjun")],
      ]),
    );
    expect(rows).toEqual([
      { uid: "b", name: "Sita D.", count: 3, rank: 1 },
      { uid: "a", name: "Ravi K.", count: 2, rank: 2 },
      { uid: "c", name: "Arjun", count: 1, rank: 3 },
    ]);
  });

  it("gives equal counts the same rank and skips the next rank", () => {
    const rows = buildReferralLeaderboard(
      [
        { referrerUid: "x", status: "pending" },
        { referrerUid: "y", status: "pending" },
        { referrerUid: "z", status: "pending" },
        { referrerUid: "z", status: "pending" },
        { referrerUid: "w", status: "pending" },
      ],
      new Map([
        ["w", active("Zoya")],
        ["x", active("Bala")],
        ["y", active("Anu")],
        ["z", active("Kiran")],
      ]),
    );
    expect(rows.map((r) => [r.name, r.rank])).toEqual([
      ["Kiran", 1],
      ["Anu", 2],
      ["Bala", 2],
      ["Zoya", 2],
    ]);
  });

  it("leaves out suspended, missing and fully rejected sponsors", () => {
    const rows = buildReferralLeaderboard(
      [
        { referrerUid: "ok", status: "pending" },
        { referrerUid: "banned", status: "qualified" },
        { referrerUid: "ghost", status: "qualified" },
        { referrerUid: "spam", status: "rejected" },
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
