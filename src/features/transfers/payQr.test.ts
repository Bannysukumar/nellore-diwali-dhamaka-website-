import { describe, expect, it } from "vitest";
import { parsePayQr, payQrValue, tenDigitMobile } from "./payQr";

describe("pay QR", () => {
  it("normalises Indian mobile numbers", () => {
    expect(tenDigitMobile("+91 98765 43210")).toBe("9876543210");
    expect(tenDigitMobile("09876543210")).toBe("9876543210");
    expect(tenDigitMobile("12345")).toBeNull();
    expect(tenDigitMobile("1234567890")).toBeNull();
  });

  it("round-trips a customer's QR link", () => {
    const value = payQrValue("+919876543210", "https://nellorediwalidhamaka.com");
    expect(value).toBe("https://nellorediwalidhamaka.com/dashboard/send-money?to=9876543210");
    expect(parsePayQr(value!)).toEqual({ ok: true, mobile: "9876543210" });
  });

  it("accepts a plain mobile number", () => {
    expect(parsePayQr(" +91 98765 43210 ")).toEqual({ ok: true, mobile: "9876543210" });
  });

  it("refuses UPI and unrelated QR codes", () => {
    expect(parsePayQr("upi://pay?pa=shop@okaxis&pn=Shop").ok).toBe(false);
    expect(parsePayQr("https://example.com/menu").ok).toBe(false);
    expect(parsePayQr("https://nellorediwalidhamaka.com/dashboard/send-money?to=123").ok).toBe(false);
    expect(parsePayQr("hello").ok).toBe(false);
  });
});
