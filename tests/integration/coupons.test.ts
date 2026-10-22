import { beforeAll, describe, expect, it } from "vitest";
import {
  call,
  callError,
  db,
  registerAdmin,
  registerCustomer,
  requestId,
  resetEmulators,
  writeSettings,
  writeSpinConfig,
  type TestUser,
} from "./harness";

const now = new Date().toISOString();

async function reward(id: string, type = "coupon") {
  await db.doc(`rewards/${id}`).set({
    id,
    name: `${id} coupon`,
    description: "Test coupon",
    type,
    inventory: 0,
    remaining: 0,
    active: true,
    couponLocation: "Main Road",
    createdAt: now,
    updatedAt: now,
  });
}

async function winCoupon(user: TestUser, rewardId: string): Promise<{ spinId: string; couponId: string }> {
  await writeSpinConfig({
    spinPricePaise: 1_000,
    segments: [{ id: `seg_${rewardId}`, rewardId, label: rewardId, color: "#000", weight: 1, active: true }],
  });
  await db.doc(`walletAccounts/${user.uid}`).set({
    uid: user.uid,
    balancePaise: 10_000,
    totalDepositedPaise: 10_000,
    totalSpentPaise: 0,
    pendingDepositPaise: 0,
    updatedAt: now,
  });
  const won = await call<{ spinId: string; couponId: string }>(
    "executeSpin",
    { requestId: requestId("spin"), payWithWallet: true },
    user.token,
  );
  await writeSpinConfig();
  return won;
}

describe("coupon shops and coupon PINs", () => {
  let admin: TestUser;
  let shop: TestUser;

  beforeAll(async () => {
    await resetEmulators();
    await writeSettings();
    await writeSpinConfig();
    await reward("rw_cafe");
    await reward("rw_other");
    await reward("rw_cash", "wallet_credit");
    admin = await registerAdmin();
    shop = await registerCustomer("Cafe Owner");
  });

  it("lets only an administrator assign a coupon shop, for coupon rewards only", async () => {
    const assign = { uid: shop.uid, active: true, shopName: "Saagaz Cafe", rewardIds: ["rw_cafe"] };
    expect(await callError("setCouponShop", assign, shop.token)).toBe("PERMISSION_DENIED");
    expect(await callError("setCouponShop", { ...assign, rewardIds: ["rw_cash"] }, admin.token)).toBe("INVALID_ARGUMENT");
    await call("setCouponShop", assign, admin.token);
    expect((await db.doc(`couponShops/${shop.uid}`).get()).data()).toMatchObject({
      shopName: "Saagaz Cafe",
      rewardIds: ["rw_cafe"],
      active: true,
    });
  });

  it("marks a coupon used only through its owner's PIN at the right shop, exactly once", async () => {
    const customer = await registerCustomer("Coupon Customer");
    const stranger = await registerCustomer("Stranger");
    const won = await winCoupon(customer, "rw_cafe");

    expect(await callError("getCouponPin", { spinId: won.spinId }, stranger.token)).toBe("NOT_FOUND");
    const { pin } = await call<{ pin: string; expiresAt: string }>("getCouponPin", { spinId: won.spinId }, customer.token);
    expect(pin).toMatch(/^\d{6}$/);
    const again = await call<{ pin: string }>("getCouponPin", { spinId: won.spinId }, customer.token);
    expect(again.pin).toBe(pin);
    expect((await db.doc(`couponPins/${won.spinId}`).get()).exists).toBe(true);

    // A customer who is not a shop owner cannot use a PIN, even a valid one.
    expect(await callError("redeemCouponPin", { pin }, stranger.token)).toBe("PERMISSION_DENIED");
    const wrong = pin === "000000" ? "000001" : "000000";
    expect(await callError("redeemCouponPin", { pin: wrong }, shop.token)).toBe("NOT_FOUND");

    const receipt = await call<{ couponId: string; shopName: string; customerName: string }>(
      "redeemCouponPin",
      { pin },
      shop.token,
    );
    expect(receipt).toMatchObject({ couponId: won.couponId, shopName: "Saagaz Cafe", customerName: "Coupon C." });
    expect((await db.doc(`spinTransactions/${won.spinId}`).get()).data()).toMatchObject({
      redeemedByUid: shop.uid,
      redeemedShop: "Saagaz Cafe",
    });
    expect((await db.doc(`couponPins/${won.spinId}`).get()).exists).toBe(false);

    expect(await callError("redeemCouponPin", { pin }, shop.token)).toBe("NOT_FOUND");
    expect(await callError("getCouponPin", { spinId: won.spinId }, customer.token)).toBe("FAILED_PRECONDITION");
  });

  it("refuses a PIN for another shop's coupon and leaves it unused", async () => {
    const customer = await registerCustomer("Other Shop Customer");
    const won = await winCoupon(customer, "rw_other");
    const { pin } = await call<{ pin: string }>("getCouponPin", { spinId: won.spinId }, customer.token);
    expect(await callError("redeemCouponPin", { pin }, shop.token)).toBe("PERMISSION_DENIED");
    expect((await db.doc(`spinTransactions/${won.spinId}`).get()).data()?.redeemedAt).toBeUndefined();
  });

  it("stops a removed shop from redeeming", async () => {
    const customer = await registerCustomer("Late Customer");
    const won = await winCoupon(customer, "rw_cafe");
    const { pin } = await call<{ pin: string }>("getCouponPin", { spinId: won.spinId }, customer.token);
    await call("setCouponShop", { uid: shop.uid, active: false }, admin.token);
    expect(await callError("redeemCouponPin", { pin }, shop.token)).toBe("PERMISSION_DENIED");
  });
});
