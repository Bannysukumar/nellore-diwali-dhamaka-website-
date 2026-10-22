import { beforeAll, describe, expect, it } from "vitest";
import {
  call,
  callError,
  db,
  ledgerOf,
  registerCustomer,
  requestId,
  resetEmulators,
  walletOf,
  writeSettings,
  writeSpinConfig,
} from "./harness";

const spinsOf = async (uid: string) => ((await db.doc(`spinAccounts/${uid}`).get()).data()?.availableSpins ?? 0) as number;

describe("referrals and the spin wheel", () => {
  beforeAll(async () => {
    await resetEmulators();
    await writeSettings();
    await writeSpinConfig();
  });

  it("rewards a qualified referral once, server-side", async () => {
    const referrer = await registerCustomer("Referrer Ravi");
    const referee = await registerCustomer("Referee Rani", { referralCode: referrer.referralCode });
    expect(referee.referral?.status).toBe("recorded");

    const referral = (await db.doc(`referrals/${referrer.uid}_${referee.uid}`).get()).data();
    expect(referral).toMatchObject({ status: "qualified", rewardSpins: 1 });
    expect(await spinsOf(referrer.uid)).toBe(1);

    const again = await call<{ qualified: boolean; spinsGranted: number }>(
      "qualifyReferral",
      { refereeUid: referee.uid, trigger: "signup" },
      referee.token,
    );
    expect(again.qualified).toBe(false);
    expect(await spinsOf(referrer.uid)).toBe(1);
  });

  it("only lets the referee trigger their own qualification, and checks the activity happened", async () => {
    await writeSpinConfig({ referralQualification: "ticket_purchase" });
    try {
      const referrer = await registerCustomer("Purchase Referrer");
      const referee = await registerCustomer("Purchase Referee", { referralCode: referrer.referralCode });
      expect(await spinsOf(referrer.uid)).toBe(0);

      expect(
        await callError("qualifyReferral", { refereeUid: referee.uid, trigger: "ticket_purchase" }, referrer.token),
      ).toBe("PERMISSION_DENIED");
      const claimed = await call<{ qualified: boolean }>(
        "qualifyReferral",
        { refereeUid: referee.uid, trigger: "ticket_purchase" },
        referee.token,
      );
      expect(claimed.qualified).toBe(false);
      expect(await spinsOf(referrer.uid)).toBe(0);
    } finally {
      await writeSpinConfig();
    }
  });

  it("does not reward unknown codes, and a referred account cannot be re-attributed", async () => {
    const unknown = await registerCustomer("Unknown Code", { referralCode: "NOPE1234" });
    expect(unknown.referral?.status).toBe("rejected");
    expect((await db.doc(`users/${unknown.uid}`).get()).exists).toBe(true);

    const first = await registerCustomer("First Referrer");
    const second = await registerCustomer("Second Referrer");
    const referee = await registerCustomer("Attributed Once", { referralCode: first.referralCode });
    const claim = await call<{ status: string }>("claimReferral", { code: second.referralCode }, referee.token);
    expect(claim.status).toBe("rejected");
    expect((await db.doc(`users/${referee.uid}`).get()).data()?.referredByUid).toBe(first.uid);
  });

  it("refuses to spin without spins", async () => {
    const user = await registerCustomer("No Spins");
    expect(await callError("executeSpin", { requestId: requestId("spin") }, user.token)).toBe("FAILED_PRECONDITION");
  });

  it("consumes one spin per request, credits wallet rewards via the ledger, and replays safely", async () => {
    const user = await registerCustomer("Lucky Spinner");
    await db.doc(`spinAccounts/${user.uid}`).set({ availableSpins: 3 }, { merge: true });

    const id = requestId("spin");
    const first = await call<{ spinId: string; walletCreditPaise: number; availableSpins: number }>(
      "executeSpin",
      { requestId: id },
      user.token,
    );
    const replay = await call<{ spinId: string }>("executeSpin", { requestId: id }, user.token);

    expect(replay.spinId).toBe(first.spinId);
    expect(first.availableSpins).toBe(2);
    expect(await spinsOf(user.uid)).toBe(2);
    expect(first.walletCreditPaise).toBe(1_000);
    expect((await walletOf(user.uid)).balancePaise).toBe(1_000);
    expect((await ledgerOf(user.uid)).filter((t) => t.type === "reward_credit")).toHaveLength(1);
  });

  it("enforces the daily spin limit", async () => {
    const user = await registerCustomer("Daily Limit");
    await db.doc(`spinAccounts/${user.uid}`).set({ availableSpins: 5 }, { merge: true });
    await call("executeSpin", { requestId: requestId("spin") }, user.token);
    await call("executeSpin", { requestId: requestId("spin") }, user.token);
    expect(await callError("executeSpin", { requestId: requestId("spin") }, user.token)).toBe("RESOURCE_EXHAUSTED");
    expect(await spinsOf(user.uid)).toBe(3);
  });

  it("refuses to spin while the wheel is disabled", async () => {
    const user = await registerCustomer("Paused Wheel");
    await db.doc(`spinAccounts/${user.uid}`).set({ availableSpins: 1 }, { merge: true });
    await writeSpinConfig({ enabled: false });
    try {
      expect(await callError("executeSpin", { requestId: requestId("spin") }, user.token)).toBe("FAILED_PRECONDITION");
    } finally {
      await writeSpinConfig();
    }
    expect(await spinsOf(user.uid)).toBe(1);
  });

  it("sells a spin for the configured price from the wallet without touching earned spins", async () => {
    const user = await registerCustomer("Paid Spinner");
    await db.doc(`spinAccounts/${user.uid}`).set({ availableSpins: 1 }, { merge: true });
    await db.doc(`walletAccounts/${user.uid}`).set({
      uid: user.uid,
      balancePaise: 3_000,
      totalDepositedPaise: 3_000,
      totalSpentPaise: 0,
      pendingDepositPaise: 0,
      updatedAt: new Date().toISOString(),
    });

    expect(
      await callError("executeSpin", { requestId: requestId("spin"), payWithWallet: true }, user.token),
    ).toBe("FAILED_PRECONDITION");

    await writeSpinConfig({ spinPricePaise: 2_000 });
    try {
      const id = requestId("spin");
      const paid = await call<{ spinId: string; paidPaise: number; balancePaise: number; availableSpins: number }>(
        "executeSpin",
        { requestId: id, payWithWallet: true },
        user.token,
      );
      expect(paid.paidPaise).toBe(2_000);
      // 30.00 − 20.00 price + 10.00 wallet-credit reward
      expect(paid.balancePaise).toBe(2_000);
      expect(paid.availableSpins).toBe(1);
      expect(await spinsOf(user.uid)).toBe(1);

      const replay = await call<{ spinId: string }>("executeSpin", { requestId: id, payWithWallet: true }, user.token);
      expect(replay.spinId).toBe(paid.spinId);
      expect((await walletOf(user.uid)).balancePaise).toBe(2_000);
      expect((await ledgerOf(user.uid)).filter((t) => t.type === "spin_purchase")).toHaveLength(1);
      expect((await walletOf(user.uid)).totalSpentPaise).toBe(2_000);
    } finally {
      await writeSpinConfig();
    }
  });

  it("caps free spins per day but leaves paid spins unlimited unless a paid limit is set", async () => {
    const user = await registerCustomer("Daily Paid Spinner");
    await db.doc(`spinAccounts/${user.uid}`).set({ availableSpins: 5 }, { merge: true });
    await db.doc(`walletAccounts/${user.uid}`).set({
      uid: user.uid,
      balancePaise: 100_000,
      totalDepositedPaise: 100_000,
      totalSpentPaise: 0,
      pendingDepositPaise: 0,
      updatedAt: new Date().toISOString(),
    });
    const spin = (payWithWallet: boolean) =>
      call("executeSpin", { requestId: requestId("spin"), payWithWallet }, user.token);
    const refused = (payWithWallet: boolean) =>
      callError("executeSpin", { requestId: requestId("spin"), payWithWallet }, user.token);

    await writeSpinConfig({ spinPricePaise: 2_000 });
    try {
      // The harness free limit is 2 a day; paid spins go past it.
      for (let i = 0; i < 4; i += 1) await spin(true);
      await spin(false);
      await spin(false);
      expect(await refused(false)).toBe("RESOURCE_EXHAUSTED");
      expect(await spinsOf(user.uid)).toBe(3);
      await spin(true);

      await writeSpinConfig({ spinPricePaise: 2_000, dailyPaidSpinLimit: 5 });
      const before = (await walletOf(user.uid)).balancePaise;
      expect(await refused(true)).toBe("RESOURCE_EXHAUSTED");
      expect((await walletOf(user.uid)).balancePaise).toBe(before);
      expect((await ledgerOf(user.uid)).filter((t) => t.type === "spin_purchase")).toHaveLength(5);
    } finally {
      await writeSpinConfig();
    }
  });

  describe("per-customer prize packs and coupons", () => {
    const now = new Date().toISOString();
    const reward = (id: string, fields: Record<string, unknown>) =>
      db.doc(`rewards/${id}`).set({
        id,
        name: id,
        description: `${id} reward`,
        inventory: 0,
        remaining: 0,
        active: true,
        createdAt: now,
        updatedAt: now,
        ...fields,
      });
    const segment = (id: string, rewardId: string, weight: number) => ({
      id,
      rewardId,
      label: id,
      color: "#000",
      weight,
      active: true,
    });
    const funded = async (name: string) => {
      const user = await registerCustomer(name);
      await db.doc(`walletAccounts/${user.uid}`).set({
        uid: user.uid,
        balancePaise: 100_000,
        totalDepositedPaise: 100_000,
        totalSpentPaise: 0,
        pendingDepositPaise: 0,
        updatedAt: now,
      });
      return user;
    };
    type Spun = { segmentId: string; couponId?: string; spinId: string };
    const paidSpin = (token: string) =>
      call<Spun>("executeSpin", { requestId: requestId("spin"), payWithWallet: true }, token);

    beforeAll(async () => {
      await reward("rw_none", { type: "no_prize", name: "Better luck next time" });
      await reward("rw_coffee", {
        type: "coupon",
        name: "₹25 coffee",
        inventory: 50,
        remaining: 50,
        couponLocation: "Shop 1, Main Road, Nellore",
        couponLink: "https://maps.example/shop",
        couponTerms: "Show this coupon at the counter.",
      });
      await reward("rw_sold_out", { type: "coupon", inventory: 5, remaining: 0 });
    });

    it("gives each customer exactly the configured share over one pack", async () => {
      await writeSpinConfig({
        spinPricePaise: 1_000,
        segments: [segment("seg_credit", "rw_credit", 2), segment("seg_none", "rw_none", 3)],
      });
      try {
        const user = await funded("Pack Spinner");
        const results: string[] = [];
        for (let i = 0; i < 5; i += 1) results.push((await paidSpin(user.token)).segmentId);
        expect(results.filter((s) => s === "seg_credit")).toHaveLength(2);
        expect(results.filter((s) => s === "seg_none")).toHaveLength(3);
        expect((await db.doc(`spinDecks/${user.uid}`).get()).data()?.cards).toEqual([]);
      } finally {
        await writeSpinConfig();
      }
    });

    it("skips a reward that is out of stock", async () => {
      await writeSpinConfig({
        spinPricePaise: 1_000,
        segments: [segment("seg_gone", "rw_sold_out", 5), segment("seg_none", "rw_none", 1)],
      });
      try {
        const user = await funded("Sold Out Spinner");
        expect((await paidSpin(user.token)).segmentId).toBe("seg_none");
        expect((await paidSpin(user.token)).segmentId).toBe("seg_none");
      } finally {
        await writeSpinConfig();
      }
    });

    it("issues a coupon with its own id and the redemption details", async () => {
      await writeSpinConfig({ spinPricePaise: 1_000, segments: [segment("seg_coffee", "rw_coffee", 1)] });
      try {
        const user = await funded("Coupon Winner");
        const won = await paidSpin(user.token);
        expect(won.couponId).toMatch(/^CPN-[A-Z2-9]{6}$/);
        const row = (await db.doc(`spinTransactions/${won.spinId}`).get()).data();
        expect(row).toMatchObject({
          rewardType: "coupon",
          couponId: won.couponId,
          couponLocation: "Shop 1, Main Road, Nellore",
          couponLink: "https://maps.example/shop",
          couponTerms: "Show this coupon at the counter.",
        });
        expect((await db.doc("rewards/rw_coffee").get()).data()?.remaining).toBe(49);
      } finally {
        await writeSpinConfig();
      }
    });
  });

  it("refuses a paid spin the wallet cannot cover and leaves nothing behind", async () => {
    const user = await registerCustomer("Short Wallet");
    await writeSpinConfig({ spinPricePaise: 5_000 });
    try {
      expect(
        await callError("executeSpin", { requestId: requestId("spin"), payWithWallet: true }, user.token),
      ).toBe("FAILED_PRECONDITION");
    } finally {
      await writeSpinConfig();
    }
    expect((await db.collection("spinTransactions").where("uid", "==", user.uid).get()).size).toBe(0);
    expect(await ledgerOf(user.uid)).toHaveLength(0);
  });
});
