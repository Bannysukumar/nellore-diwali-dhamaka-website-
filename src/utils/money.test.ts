import { describe, expect, it } from "vitest";
import { formatINR, formatINRCompact, parseRupeesToPaise, sumPaise } from "./money";
import { formatNumber } from "./format";

describe("money helpers", () => {
  it("formats paise as rupees", () => {
    expect(formatINR(49_900)).toBe("₹499");
    expect(formatINR(49_950)).toBe("₹499.50");
    expect(formatINR(0)).toBe("₹0");
  });

  it("renders unknown amounts as a dash, never as ₹0", () => {
    expect(formatINR(null)).toBe("—");
    expect(formatINR(undefined)).toBe("—");
    expect(formatINR(Number.NaN)).toBe("—");
    expect(formatINRCompact(null)).toBe("—");
    expect(formatNumber(null)).toBe("—");
    expect(formatNumber(undefined)).toBe("—");
  });

  it("parses user input into integer paise", () => {
    expect(parseRupeesToPaise("1,499.50")).toBe(149_950);
    expect(parseRupeesToPaise("₹ 10")).toBe(1_000);
    expect(parseRupeesToPaise("0.1")).toBe(10);
    expect(parseRupeesToPaise("abc")).toBeNaN();
    expect(parseRupeesToPaise("")).toBeNaN();
  });

  it("keeps sums in integer paise", () => {
    expect(sumPaise([10, 20.4, 30.6])).toBe(61);
  });
});
