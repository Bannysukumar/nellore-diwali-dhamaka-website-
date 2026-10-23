import { describe, expect, it } from "vitest";
import { UPI_APPS, appsForPlatform, detectPlatform, payAmountFor, upiLaunchUrl, upiQuery } from "./upi";

describe("payAmountFor", () => {
  it("rounds the shortfall up to whole rupees", () => {
    expect(payAmountFor(49_900, 10_000, 5_000_000)).toBe(49_900);
    expect(payAmountFor(12_345, 10_000, 5_000_000)).toBe(12_400);
  });

  it("never asks for less than the minimum deposit", () => {
    expect(payAmountFor(5_000, 10_000, 5_000_000)).toBe(10_000);
  });

  it("refuses an order one payment cannot cover", () => {
    expect(payAmountFor(6_000_000, 10_000, 5_000_000)).toBeNull();
  });
});

const payment = { upiId: "nellore.vrc@okaxis", payeeName: "Nellore VRC & Co", amountPaise: 50_050, note: "Wallet deposit" };
const fallback = "https://nellorediwalidhamaka.com/dashboard/add-money?upi_missing=phonepe";
const phonepe = UPI_APPS.find((app) => app.id === "phonepe")!;

describe("UPI payment links", () => {
  it("prefills payee, rupee amount with two decimals and INR, encoding spaces as %20", () => {
    expect(upiQuery(payment)).toBe(
      "pa=nellore.vrc%40okaxis&pn=Nellore%20VRC%20%26%20Co&am=500.50&cu=INR&tn=Wallet%20deposit",
    );
  });

  it("uses the generic upi:// scheme for the system chooser", () => {
    expect(upiLaunchUrl(null, "android", payment, fallback)).toBe(`upi://pay?${upiQuery(payment)}`);
  });

  it("targets one Android package with a fallback back to this page", () => {
    const url = upiLaunchUrl(phonepe, "android", payment, fallback);
    expect(url.startsWith(`intent://pay?${upiQuery(payment)}#Intent;scheme=upi;package=com.phonepe.app;`)).toBe(true);
    expect(url).toContain(`S.browser_fallback_url=${encodeURIComponent(fallback)}`);
    expect(url.endsWith(";end")).toBe(true);
  });

  it("uses the app's own scheme on iOS", () => {
    expect(upiLaunchUrl(phonepe, "ios", payment, fallback)).toBe(`phonepe://pay?${upiQuery(payment)}`);
  });

  it("detects the platform and offers no app buttons on desktop", () => {
    expect(detectPlatform("Mozilla/5.0 (Linux; Android 14; Pixel 8)")).toBe("android");
    expect(detectPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe("ios");
    expect(detectPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("desktop");
    expect(appsForPlatform("desktop")).toHaveLength(0);
    expect(appsForPlatform("ios").every((app) => app.iosPrefix)).toBe(true);
  });
});
