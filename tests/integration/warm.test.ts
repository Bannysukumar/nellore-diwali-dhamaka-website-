import { beforeAll, describe, expect, it } from "vitest";
import { call, callError, registerCustomer, resetEmulators, writeSettings, writeSpinConfig } from "./harness";

const HOT_CALLABLES = [
  "ensureUserProfile",
  "purchaseTickets",
  "executeSpin",
  "pickPaymentQr",
  "submitDeposit",
  "findTransferRecipient",
  "transferFunds",
];

describe("keep-warm pings", () => {
  beforeAll(async () => {
    await resetEmulators();
    await writeSettings();
    await writeSpinConfig();
  });

  it("are answered by every hot callable without signing in", async () => {
    for (const name of HOT_CALLABLES) {
      expect(await call(name, { warmup: true })).toEqual({ warm: true });
    }
  });

  it("do not bypass sign-in for other payloads", async () => {
    expect(await callError("executeSpin", { warmup: "yes" })).toBe("UNAUTHENTICATED");
    expect(await callError("executeSpin", {})).toBe("UNAUTHENTICATED");
  });

  it("are ignored for signed-in callers, who get the real handler", async () => {
    const user = await registerCustomer("Warm Caller");
    expect(await callError("findTransferRecipient", { warmup: true }, user.token)).toBe("INVALID_ARGUMENT");
  });
});
