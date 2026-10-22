import type { CouponShop } from "@/types";
import { store } from "@/lib/backend";

export const couponService = {
  /** The account's coupon shop role, or null when it has none. */
  async shop(uid: string): Promise<CouponShop | null> {
    return store.get<CouponShop>("couponShops", uid);
  },
};
