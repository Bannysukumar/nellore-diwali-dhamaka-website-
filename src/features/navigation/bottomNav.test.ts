import { describe, expect, it } from "vitest";
import type { BottomNavSetting } from "@/types";
import {
  BOTTOM_NAV_KEYS,
  resolveBottomNav,
  visibleBottomNav,
} from "./bottomNav";

describe("bottom nav order", () => {
  it("uses the default order when nothing is saved", () => {
    expect(visibleBottomNav(null)).toEqual(BOTTOM_NAV_KEYS);
  });

  it("follows the administrator's order and hides switched-off tabs", () => {
    const setting: BottomNavSetting[] = [
      { key: "home", visible: true },
      { key: "book", visible: true },
      { key: "spin", visible: false },
      { key: "wallet", visible: true },
      { key: "draws", visible: true },
      { key: "account", visible: true },
    ];
    expect(visibleBottomNav(setting)).toEqual([
      "home",
      "book",
      "wallet",
      "draws",
      "account",
    ]);
  });

  it("drops unknown or repeated keys and appends tabs the setting forgot", () => {
    const setting = [
      { key: "wallet", visible: true },
      { key: "wallet", visible: false },
      { key: "bogus", visible: true },
      { key: "home", visible: true },
    ] as unknown as BottomNavSetting[];
    expect(resolveBottomNav(setting).map((i) => i.key)).toEqual([
      "wallet",
      "home",
      "spin",
      "draws",
      "book",
      "account",
    ]);
  });

  it("falls back to every tab when too few would be shown", () => {
    const setting: BottomNavSetting[] = BOTTOM_NAV_KEYS.map((key) => ({
      key,
      visible: key === "home",
    }));
    expect(visibleBottomNav(setting)).toEqual(BOTTOM_NAV_KEYS);
  });
});
