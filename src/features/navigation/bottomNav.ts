import type { BottomNavKey, BottomNavSetting } from "@/types";

export const BOTTOM_NAV_KEYS: BottomNavKey[] = [
  "spin",
  "home",
  "draws",
  "book",
  "wallet",
  "account",
];

export const BOTTOM_NAV_LABELS: Record<BottomNavKey, string> = {
  spin: "Spin",
  home: "Home",
  draws: "Draws",
  book: "Book",
  wallet: "Wallet",
  account: "Account",
};

export const MIN_VISIBLE_NAV_ITEMS = 3;

/**
 * The administrator's order with unknown or repeated keys dropped and any
 * item the setting does not mention appended (shown), so a partial or stale
 * setting can never hide a tab by accident.
 */
export function resolveBottomNav(
  setting: BottomNavSetting[] | null | undefined,
): BottomNavSetting[] {
  const seen = new Set<BottomNavKey>();
  const ordered: BottomNavSetting[] = [];
  for (const item of setting ?? []) {
    if (!BOTTOM_NAV_KEYS.includes(item?.key) || seen.has(item.key)) continue;
    seen.add(item.key);
    ordered.push({ key: item.key, visible: item.visible !== false });
  }
  for (const key of BOTTOM_NAV_KEYS)
    if (!seen.has(key)) ordered.push({ key, visible: true });
  return ordered.filter((item) => item.visible).length >= MIN_VISIBLE_NAV_ITEMS
    ? ordered
    : BOTTOM_NAV_KEYS.map((key) => ({ key, visible: true }));
}

export function visibleBottomNav(
  setting: BottomNavSetting[] | null | undefined,
): BottomNavKey[] {
  return resolveBottomNav(setting)
    .filter((item) => item.visible)
    .map((item) => item.key);
}
