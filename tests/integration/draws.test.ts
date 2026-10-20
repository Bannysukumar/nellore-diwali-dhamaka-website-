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
  walletOf,
  writePaymentQr,
  writeSettings,
  type TestUser,
} from "./harness";

async function closeSales(drawId: string) {
  await db.doc(`draws/${drawId}`).set({ status: "sales_closed", salesCloseAt: nowIso(-0.1) }, { merge: true });
}

describe("draw execution, publication and cancellation", () => {
  let admin: TestUser;
  let buyers: TestUser[];

  beforeAll(async () => {
    await resetEmulators();
    await writeSettings();
    await writePaymentQr();
    admin = await registerAdmin();
    buyers = await Promise.all([registerCustomer("Buyer Alpha"), registerCustomer("Buyer Beta")]);
    for (const buyer of buyers) await fundWallet(buyer, admin, 100_000);
  });

  it("will not run while sales are open, or for a non-admin", async () => {
    const draw = await createDraw(admin);
    expect(await callError("runDraw", { drawId: draw.id }, admin.token)).toBe("FAILED_PRECONDITION");
    await closeSales(draw.id);
    expect(await callError("runDraw", { drawId: draw.id }, buyers[0].token)).toBe("PERMISSION_DENIED");
  });

  it("creates no winners and no result when no tickets were sold", async () => {
    const draw = await createDraw(admin);
    await closeSales(draw.id);
    expect(await callError("runDraw", { drawId: draw.id }, admin.token)).toBe("FAILED_PRECONDITION");
    expect((await db.doc(`drawResults/${draw.id}`).get()).exists).toBe(false);
    expect((await db.collection("winnerAnnouncements").where("drawId", "==", draw.id).get()).size).toBe(0);
  });

  it("picks distinct winners only from sold tickets, runs once, and publishes without duplicates", async () => {
    const draw = await createDraw(admin);
    const sold = [draw.ticketIds[0], draw.ticketIds[1], draw.ticketIds[4], draw.ticketIds[7]];
    await call("purchaseTickets", { drawId: draw.id, ticketIds: sold.slice(0, 2), requestId: requestId() }, buyers[0].token);
    await call("purchaseTickets", { drawId: draw.id, ticketIds: sold.slice(2), requestId: requestId() }, buyers[1].token);
    await closeSales(draw.id);

    const run = await call<{ eligibleTicketCount: number; winningTicketNumbers: number[] }>(
      "runDraw",
      { drawId: draw.id },
      admin.token,
    );
    expect(run.eligibleTicketCount).toBe(4);
    expect(run.winningTicketNumbers).toHaveLength(3);
    expect(new Set(run.winningTicketNumbers).size).toBe(3);
    const soldNumbers = sold.map((id) => Number(id.split("_").pop()));
    for (const n of run.winningTicketNumbers) expect(soldNumbers).toContain(n);

    expect((await db.doc(`drawResults/${draw.id}`).get()).data()?.published).toBe(false);
    expect(await callError("runDraw", { drawId: draw.id }, admin.token)).toBe("FAILED_PRECONDITION");

    await call("publishDrawResults", { drawId: draw.id }, admin.token);
    await call("publishDrawResults", { drawId: draw.id }, admin.token).catch(() => undefined);
    const winners = await db.collection("winnerAnnouncements").where("drawId", "==", draw.id).get();
    expect(winners.size).toBe(3);
    expect((await db.doc(`draws/${draw.id}`).get()).data()?.status).toBe("completed");

    expect(await callError("cancelDraw", { drawId: draw.id, reason: "Too late" }, admin.token)).toBe(
      "FAILED_PRECONDITION",
    );
  });

  it("selects fewer winners than prizes when fewer tickets were sold", async () => {
    const draw = await createDraw(admin);
    await call("purchaseTickets", { drawId: draw.id, ticketIds: [draw.ticketIds[2]], requestId: requestId() }, buyers[0].token);
    await closeSales(draw.id);
    const run = await call<{ winningTicketNumbers: number[] }>("runDraw", { drawId: draw.id }, admin.token);
    expect(run.winningTicketNumbers).toEqual([3]);
  });

  it("refunds every completed order exactly once when a draw is cancelled", async () => {
    const draw = await createDraw(admin);
    const before = await Promise.all(buyers.map((b) => walletOf(b.uid)));
    await call("purchaseTickets", { drawId: draw.id, ticketIds: [draw.ticketIds[0]], requestId: requestId() }, buyers[0].token);
    await call("purchaseTickets", { drawId: draw.id, ticketIds: draw.ticketIds.slice(1, 3), requestId: requestId() }, buyers[1].token);

    const first = await call<{ refundedOrders: number; refundedPaise: number }>(
      "cancelDraw",
      { drawId: draw.id, reason: "Venue unavailable" },
      admin.token,
    );
    const second = await call<{ refundedOrders: number }>(
      "cancelDraw",
      { drawId: draw.id, reason: "Venue unavailable" },
      admin.token,
    );
    expect(first.refundedOrders).toBe(2);
    expect(first.refundedPaise).toBe(3 * draw.pricePaise);
    expect(second.refundedOrders).toBe(0);

    const after = await Promise.all(buyers.map((b) => walletOf(b.uid)));
    expect(after.map((w) => w.balancePaise)).toEqual(before.map((w) => w.balancePaise));
    expect(await callError("runDraw", { drawId: draw.id }, admin.token)).toBe("FAILED_PRECONDITION");
  });
});
