import { beforeAll, describe, expect, it } from "vitest";
import {
  call,
  callError,
  createDraw,
  db,
  fundWallet,
  nowIso,
  registerAdmin,
  registerCustomer,
  requestId,
  resetEmulators,
  writePaymentQr,
  writeSettings,
  type TestUser,
} from "./harness";

interface CouponsResult {
  eligible: boolean;
  coupons: Record<string, string>;
}

const product = (active: boolean) => ({
  name: "Diya lamp set",
  imageUrl: "https://example.test/lamp.png",
  imagePath: "products/lamp.png",
  originalPricePaise: 50_000,
  discountPricePaise: 40_000,
  couponPricePaise: 35_000,
  active,
  sortOrder: 1,
  createdAt: nowIso(),
  updatedAt: nowIso(),
});

describe("ticket-buyer product coupons", () => {
  let admin: TestUser;

  beforeAll(async () => {
    await resetEmulators();
    await writeSettings();
    await writePaymentQr();
    admin = await registerAdmin();
    await db.doc("products/lamp").set(product(true));
    await db.doc("products/hidden").set(product(false));
    await db.doc("productCoupons/lamp").set({ code: "LAMP-50" });
    await db.doc("productCoupons/hidden").set({ code: "HIDDEN-10" });
  });

  it("rejects signed-out callers", async () => {
    expect(await callError("getProductCoupons", {})).toBe("UNAUTHENTICATED");
  });

  it("returns no codes to a customer without a completed ticket order", async () => {
    const user = await registerCustomer("Window Shopper");
    await fundWallet(user, admin, 10_000);
    expect(await call<CouponsResult>("getProductCoupons", {}, user.token)).toEqual({ eligible: false, coupons: {} });
  });

  it("returns codes for active products once the customer has bought a ticket", async () => {
    const draw = await createDraw(admin);
    const user = await registerCustomer("Ticket Buyer");
    await fundWallet(user, admin, 50_000);
    await call("purchaseTickets", { drawId: draw.id, ticketIds: [draw.ticketIds[0]], requestId: requestId() }, user.token);

    expect(await call<CouponsResult>("getProductCoupons", {}, user.token)).toEqual({
      eligible: true,
      coupons: { lamp: "LAMP-50" },
    });
  });
});
