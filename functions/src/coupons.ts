import { onCall } from "firebase-functions/v2/https";
import {
  CALLABLE_OPTIONS,
  COLLECTIONS,
  audit,
  db,
  enforceRateLimit,
  notify,
  readDoc,
  requireUser,
} from "./firestore.js";
import {
  failedPrecondition,
  invalidArgument,
  notFound,
  permissionDenied,
  requireObject,
  requireString,
  requireStringArray,
} from "./errors.js";
import { displayName, nowIso, secureRandomInt } from "./domain/shared.js";
import type {
  CouponPin,
  CouponRedemption,
  CouponShop,
  Reward,
  SpinTransaction,
  UserProfile,
} from "./domain/types.js";

/** How long a coupon PIN stays usable after the customer taps "Use coupon". */
export const COUPON_PIN_MINUTES = 10;

const isCouponType = (type: Reward["type"]) => type !== "wallet_credit" && type !== "no_prize";

/**
 * Makes a customer account a coupon shop owner (or removes that role).
 *
 * The role lives in `couponShops/{uid}`, written only here; it lets the account
 * redeem coupons of the listed rewards and nothing else. It is unrelated to the
 * administrator claim.
 */
export const setCouponShop = onCall<unknown>(CALLABLE_OPTIONS, async (request) => {
  const caller = await requireUser(request.auth, { admin: true });
  const data = requireObject<Record<string, unknown>>(request.data);
  const uid = requireString(data, "uid", 128);
  const active = data.active === true;
  await enforceRateLimit(caller.uid, "setCouponShop", { max: 60, windowSeconds: 3600 });

  const target = await readDoc<UserProfile>(COLLECTIONS.users, uid);
  if (!target) failedPrecondition("That user does not exist.");
  const ref = db().collection(COLLECTIONS.couponShops).doc(uid);
  const existing = await readDoc<CouponShop>(COLLECTIONS.couponShops, uid);
  const now = nowIso();

  if (!active) {
    if (!existing?.active) return { uid, active: false };
    await ref.set({ active: false, updatedAt: now }, { merge: true });
    await audit(caller, "couponShop.revoke", COLLECTIONS.couponShops, uid, `Removed coupon shop access (${existing.shopName}).`);
    await notify(uid, "system", "Coupon shop access removed", `${caller.fullName} removed your coupon shop access.`);
    return { uid, active: false };
  }

  if (target.status !== "active") failedPrecondition("Reactivate this account before giving it coupon shop access.");
  const shopName = requireString(data, "shopName", 80).trim();
  if (shopName.length < 2) invalidArgument("Enter the shop name.");
  const rewardIds = Array.from(new Set(requireStringArray(data, "rewardIds", { min: 1, max: 30 })));
  const rewards = await Promise.all(rewardIds.map((id) => readDoc<Reward>(COLLECTIONS.rewards, id)));
  if (rewards.some((reward) => !reward || !isCouponType(reward.type))) {
    invalidArgument("Choose coupon or gift rewards only.");
  }

  const shop: CouponShop = {
    uid,
    shopName,
    rewardIds,
    active: true,
    assignedByUid: caller.uid,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await ref.set(shop);
  const names = rewards.map((reward) => reward?.name).join(", ");
  await audit(
    caller,
    existing?.active ? "couponShop.update" : "couponShop.grant",
    COLLECTIONS.couponShops,
    uid,
    `${shopName}: can redeem ${names}.`,
    existing ? { shopName: existing.shopName, rewardIds: existing.rewardIds, active: existing.active } : undefined,
    { shopName, rewardIds, active: true },
  );
  if (!existing?.active) {
    await notify(
      uid,
      "system",
      "You can now redeem coupons",
      `${caller.fullName} made you the coupon owner for ${shopName}. Open your shop dashboard to mark customers' coupons as used.`,
      "/shop",
    );
  }
  return { uid, active: true };
});

async function uniquePin(now: number): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const pin = String(secureRandomInt(1_000_000)).padStart(6, "0");
    const clash = await db().collection(COLLECTIONS.couponPins).where("pin", "==", pin).get();
    if (clash.docs.every((d) => Date.parse((d.data() as CouponPin).expiresAt) <= now)) return pin;
  }
  failedPrecondition("Please try again in a moment.");
}

function assertUsable(spin: SpinTransaction | null, now: number): asserts spin is SpinTransaction {
  if (!spin || spin.status !== "awarded" || !isCouponType(spin.rewardType)) notFound("That coupon was not found.");
  if (spin.redeemedAt) failedPrecondition(`This coupon was already used${spin.redeemedShop ? ` at ${spin.redeemedShop}` : ""}.`);
  if (spin.rewardExpiresAt && Date.parse(spin.rewardExpiresAt) < now) failedPrecondition("This coupon has expired.");
}

/**
 * Gives the customer a 6-digit PIN for one of their coupons. The shop owner
 * enters it to mark that coupon used. Asking again while the PIN is still
 * valid returns the same PIN.
 */
export const getCouponPin = onCall<unknown>(CALLABLE_OPTIONS, async (request) => {
  const user = await requireUser(request.auth);
  const data = requireObject<Record<string, unknown>>(request.data);
  const spinId = requireString(data, "spinId", 200);
  await enforceRateLimit(user.uid, "getCouponPin", { max: 20, windowSeconds: 600 });

  const now = Date.now();
  const spin = await readDoc<SpinTransaction>(COLLECTIONS.spinTransactions, spinId);
  if (spin && spin.uid !== user.uid) notFound("That coupon was not found.");
  assertUsable(spin, now);

  const ref = db().collection(COLLECTIONS.couponPins).doc(spinId);
  const current = (await ref.get()).data() as CouponPin | undefined;
  if (current && Date.parse(current.expiresAt) > now) return { pin: current.pin, expiresAt: current.expiresAt };

  const row: CouponPin = {
    spinId,
    uid: user.uid,
    rewardId: spin.rewardId,
    pin: await uniquePin(now),
    expiresAt: new Date(now + COUPON_PIN_MINUTES * 60_000).toISOString(),
    createdAt: new Date(now).toISOString(),
  };
  await ref.set(row);
  return { pin: row.pin, expiresAt: row.expiresAt };
});

/**
 * A coupon shop owner enters the PIN the customer shows. Only a live PIN for a
 * coupon of one of the shop's own rewards is accepted, and the coupon is
 * marked used exactly once.
 */
export const redeemCouponPin = onCall<unknown>(CALLABLE_OPTIONS, async (request) => {
  const caller = await requireUser(request.auth);
  const data = requireObject<Record<string, unknown>>(request.data);
  const pin = requireString(data, "pin", 6).trim();
  if (!/^\d{6}$/.test(pin)) invalidArgument("Enter the 6-digit coupon PIN.");

  const shop = await readDoc<CouponShop>(COLLECTIONS.couponShops, caller.uid);
  if (!shop?.active) permissionDenied("Only coupon shop owners can mark coupons as used.");
  // Stops PIN guessing: a shop gets 20 tries every 10 minutes.
  await enforceRateLimit(caller.uid, "redeemCouponPin", { max: 20, windowSeconds: 600 });

  const now = Date.now();
  const matches = await db().collection(COLLECTIONS.couponPins).where("pin", "==", pin).get();
  const live = matches.docs.find((d) => Date.parse((d.data() as CouponPin).expiresAt) > now);
  if (!live) notFound("That PIN is wrong or has expired. Ask the customer to tap “Use coupon” again.");
  const pinRow = live.data() as CouponPin;
  if (!shop.rewardIds.includes(pinRow.rewardId)) permissionDenied("This coupon is not for your shop.");

  const customer = await readDoc<UserProfile>(COLLECTIONS.users, pinRow.uid);
  const spinRef = db().collection(COLLECTIONS.spinTransactions).doc(pinRow.spinId);
  const receiptRef = db().collection(COLLECTIONS.couponRedemptions).doc(pinRow.spinId);
  const redeemedAt = new Date(now).toISOString();

  const receipt = await db().runTransaction(async (tx) => {
    const [spinSnap, pinSnap] = await Promise.all([tx.get(spinRef), tx.get(live.ref)]);
    if (!pinSnap.exists) notFound("That PIN has just been used. Ask the customer to refresh their coupon.");
    const spin = spinSnap.exists ? (spinSnap.data() as SpinTransaction) : null;
    assertUsable(spin, now);

    const row: CouponRedemption = {
      spinId: pinRow.spinId,
      couponId: spin.couponId ?? pinRow.spinId,
      rewardId: spin.rewardId,
      rewardName: spin.rewardName,
      customerUid: pinRow.uid,
      customerName: displayName(customer?.fullName ?? "Customer"),
      customerPhoneMasked: customer?.phoneMasked ?? "",
      shopUid: caller.uid,
      shopName: shop.shopName,
      redeemedAt,
    };
    tx.update(spinRef, { redeemedAt, redeemedByUid: caller.uid, redeemedShop: shop.shopName });
    tx.set(receiptRef, row);
    tx.delete(live.ref);
    return row;
  });

  await notify(
    pinRow.uid,
    "system",
    "Coupon used",
    `Your coupon ${receipt.couponId} (${receipt.rewardName}) was used at ${shop.shopName}.`,
    "/dashboard/coupons",
  );
  return receipt;
});
