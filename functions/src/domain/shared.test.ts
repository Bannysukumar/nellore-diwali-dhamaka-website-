import { describe, expect, it } from "vitest";
import type { Prize } from "./types.js";
import {
  formatPaise,
  hashString,
  isPositiveInteger,
  maskTicket,
  maskUtr,
  displayName,
  secureRandomInt,
  weightedPick,
  prizeAssignmentOrder,
} from "./shared.js";

/**
 * These helpers decide what a participant sees and, in the case of the random
 * helpers, who wins. They are pure and exhaustively testable, so they are.
 */
describe("money formatting", () => {
  it("formats paise as rupees with two decimals", () => {
    expect(formatPaise(0)).toBe("₹0.00");
    expect(formatPaise(50)).toBe("₹0.50");
    expect(formatPaise(100)).toBe("₹1.00");
    expect(formatPaise(187500)).toBe("₹1,875.00");
    expect(formatPaise(123456789)).toBe("₹12,34,567.89");
  });

  it("never loses a paisa to floating point", () => {
    // 0.1 + 0.2 !== 0.3 in binary floating point. Integer paise must not drift.
    const total = 10 + 20;
    expect(formatPaise(total)).toBe("₹0.30");
  });
});

describe("isPositiveInteger", () => {
  it("accepts only genuine positive integers", () => {
    expect(isPositiveInteger(1)).toBe(true);
    expect(isPositiveInteger(999)).toBe(true);
    expect(isPositiveInteger(0)).toBe(false);
    expect(isPositiveInteger(-1)).toBe(false);
    expect(isPositiveInteger(1.5)).toBe(false);
    expect(isPositiveInteger(Number.NaN)).toBe(false);
    expect(isPositiveInteger("100")).toBe(false);
    expect(isPositiveInteger(null)).toBe(false);
  });
});

describe("maskTicket", () => {
  it("hides all but the ends of a ticket number", () => {
    expect(maskTicket("100245")).toBe("10••45");
    expect(maskTicket("1000001")).toBe("100••01");
  });

  it("fully masks very short values rather than leaking them", () => {
    expect(maskTicket("1234")).toBe("••••");
    expect(maskTicket("12")).toBe("••");
  });
});

describe("maskUtr", () => {
  it("shows only the last four characters", () => {
    expect(maskUtr("123456789012")).toBe("••••••••9012");
    expect(maskUtr("ABCD1234")).toBe("••••1234");
  });
});

describe("displayName", () => {
  it("shortens to a first name plus initial — never a full legal name", () => {
    expect(displayName("Priya Sharma")).toBe("Priya S.");
    expect(displayName("Ravi Kumar Reddy")).toBe("Ravi K.");
    expect(displayName("Madonna")).toBe("Madonna.");
    expect(displayName("  Anil   Verma  ")).toBe("Anil V.");
  });
});

describe("hashString", () => {
  it("is deterministic, so a QR never changes mid-payment", () => {
    expect(hashString("session-abc")).toBe(hashString("session-abc"));
  });

  it("separates different keys", () => {
    expect(hashString("session-a")).not.toBe(hashString("session-b"));
  });

  it("is always non-negative (usable as an index)", () => {
    for (const key of ["", "a", "session", "a-very-long-session-key-value"]) {
      expect(hashString(key)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("secureRandomInt", () => {
  it("stays inside the requested range", () => {
    for (let i = 0; i < 2000; i += 1) {
      const value = secureRandomInt(10);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(10);
    }
  });

  it("rejects a non-positive bound instead of returning nonsense", () => {
    expect(() => secureRandomInt(0)).toThrow();
    expect(() => secureRandomInt(-5)).toThrow();
    expect(() => secureRandomInt(1.5)).toThrow();
  });

  it("eventually covers the whole range (no obvious bias to one index)", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i += 1) seen.add(secureRandomInt(6));
    expect(seen.size).toBe(6);
  });
});

describe("weightedPick", () => {
  const options = [
    { id: "common", weight: 90 },
    { id: "rare", weight: 10 },
  ];

  it("returns the only option when there is one", () => {
    expect(weightedPick([{ id: "only", weight: 5 }]).id).toBe("only");
  });

  it("respects weights over many draws", () => {
    let rare = 0;
    for (let i = 0; i < 10_000; i += 1) {
      if (weightedPick(options).id === "rare") rare += 1;
    }
    // Expected 10%; allow a wide band so the test is not flaky.
    expect(rare).toBeGreaterThan(600);
    expect(rare).toBeLessThan(1400);
  });

  it("ignores zero-weight options entirely", () => {
    const withZero = [
      { id: "never", weight: 0 },
      { id: "always", weight: 3 },
    ];
    for (let i = 0; i < 500; i += 1) {
      expect(weightedPick(withZero).id).toBe("always");
    }
  });

  it("throws rather than guessing when nothing is selectable", () => {
    expect(() => weightedPick([{ id: "x", weight: 0 }])).toThrow();
    expect(() => weightedPick([])).toThrow();
  });
});

describe("prizeAssignmentOrder", () => {
  function prize(tier: Prize["tier"], id: string): Prize {
    return { id, tier, title: id, description: id, quantity: 1 };
  }

  it("orders prizes highest tier first, regardless of input order", () => {
    const prizes = [
      prize("special", "s"),
      prize("bronze", "b"),
      prize("gold", "g"),
      prize("silver", "v"),
    ];
    expect(prizeAssignmentOrder(prizes).map((p) => p.id)).toEqual(["g", "v", "b", "s"]);
  });

  it("skips tiers the draw does not offer", () => {
    const prizes = [prize("gold", "g")];
    expect(prizeAssignmentOrder(prizes).map((p) => p.id)).toEqual(["g"]);
  });
});
