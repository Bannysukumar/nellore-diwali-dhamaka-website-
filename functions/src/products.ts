import { onCall } from "firebase-functions/v2/https";
import { CALLABLE_OPTIONS, COLLECTIONS, db, enforceRateLimit, requireUser } from "./firestore.js";

export interface ProductCouponsResponse {
  /** True once the caller has at least one completed ticket order. */
  eligible: boolean;
  /** Coupon code per active product id; empty unless `eligible`. */
  coupons: Record<string, string>;
}

/**
 * Coupon codes are a perk for ticket buyers, so they never sit on the public
 * product documents. This returns them only to customers with a completed order.
 */
export const getProductCoupons = onCall<unknown>(CALLABLE_OPTIONS, async (request): Promise<ProductCouponsResponse> => {
  const user = await requireUser(request.auth);
  await enforceRateLimit(user.uid, "getProductCoupons", { max: 60, windowSeconds: 600 });

  const orders = await db()
    .collection(COLLECTIONS.orders)
    .where("uid", "==", user.uid)
    .where("status", "==", "completed")
    .limit(1)
    .get();
  if (orders.empty) return { eligible: false, coupons: {} };

  const [products, coupons] = await Promise.all([
    db().collection(COLLECTIONS.products).where("active", "==", true).get(),
    db().collection(COLLECTIONS.productCoupons).get(),
  ]);
  const activeIds = new Set(products.docs.map((doc) => doc.id));
  const result: Record<string, string> = {};
  for (const doc of coupons.docs) {
    const code = doc.get("code");
    if (activeIds.has(doc.id) && typeof code === "string" && code) result[doc.id] = code;
  }
  return { eligible: true, coupons: result };
});
