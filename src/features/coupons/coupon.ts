import type { Reward, RewardType, SpinTransaction } from "@/types";

/** Spin rewards collected in person rather than credited to the wallet. */
export function isCouponReward(type: RewardType): boolean {
  return type !== "wallet_credit" && type !== "no_prize";
}

export interface CouponView {
  spinId: string;
  couponId: string;
  name: string;
  description?: string;
  location?: string;
  link?: string;
  terms?: string;
  code?: string;
  wonAt: string;
  expiresAt?: string;
  expired: boolean;
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Stable printed id for coupons won before ids were issued. */
function legacyCouponId(spinId: string): string {
  let h = 2166136261;
  for (let i = 0; i < spinId.length; i += 1) h = Math.imul(h ^ spinId.charCodeAt(i), 16777619);
  let out = "CPN-";
  for (let i = 0; i < 6; i += 1) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    out += ALPHABET[h % ALPHABET.length];
  }
  return out;
}

/** Only http(s) links are ever rendered as clickable. */
export function safeLink(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** "https://maps.google.com/maps?q=…" → "maps.google.com/maps". */
export function shortLink(value: string): string {
  try {
    const url = new URL(value);
    const path = url.pathname === "/" ? "" : url.pathname;
    return `${url.host}${path}`.slice(0, 60);
  } catch {
    return value.slice(0, 60);
  }
}

/**
 * The redemption details come from the reward as it is now (so an
 * administrator's correction reaches every winner), falling back to the copy
 * saved with the spin if the reward has since been deleted.
 */
export function toCouponView(spin: SpinTransaction, reward: Reward | undefined, now = Date.now()): CouponView {
  return {
    spinId: spin.id,
    couponId: spin.couponId ?? legacyCouponId(spin.id),
    name: spin.rewardName,
    description: reward?.description ?? spin.rewardDescription,
    location: reward ? reward.couponLocation : spin.couponLocation,
    link: safeLink(reward ? reward.couponLink : spin.couponLink),
    terms: reward ? reward.couponTerms : spin.couponTerms,
    code: spin.couponCode,
    wonAt: spin.createdAt,
    expiresAt: spin.rewardExpiresAt,
    expired: Boolean(spin.rewardExpiresAt && Date.parse(spin.rewardExpiresAt) < now),
  };
}
