import { describe, expect, it } from "vitest";
import { describeAuthError, isValidIndianPhone, normaliseIndianPhone } from "./authService";
import { describeStoreError } from "@/lib/backend/store";

describe("phone helpers", () => {
  it("accepts only 10-digit Indian mobile numbers", () => {
    expect(isValidIndianPhone("9876543210")).toBe(true);
    expect(isValidIndianPhone("+91 98765 43210")).toBe(true);
    expect(isValidIndianPhone("5876543210")).toBe(false);
    expect(isValidIndianPhone("98765")).toBe(false);
  });

  it("normalises to E.164", () => {
    expect(normaliseIndianPhone("098765 43210")).toBe("+919876543210");
    expect(normaliseIndianPhone("+91-9876543210")).toBe("+919876543210");
  });
});

describe("describeAuthError", () => {
  it("explains OTP failures in plain language", () => {
    expect(describeAuthError({ code: "auth/invalid-verification-code" })).toMatch(/code is not correct/);
    expect(describeAuthError({ code: "auth/code-expired" })).toMatch(/expired/);
    expect(describeAuthError({ code: "auth/too-many-requests" })).toMatch(/Too many attempts/);
    expect(describeAuthError({ code: "auth/operation-not-allowed" })).toMatch(/not enabled/);
  });

  it("falls back to a generic message", () => {
    expect(describeAuthError({})).toBe("Something went wrong. Please try again.");
    expect(describeAuthError(new Error("Custom failure"))).toBe("Custom failure");
  });
});

describe("describeStoreError", () => {
  it("maps Firestore failures to honest messages", () => {
    expect(describeStoreError({ code: "permission-denied" })).toMatch(/do not have access/);
    expect(describeStoreError({ code: "firestore/unavailable" })).toMatch(/unreachable/);
    expect(describeStoreError({ code: "failed-precondition" })).toMatch(/index/);
    expect(describeStoreError(null)).toMatch(/could not load/);
  });
});
