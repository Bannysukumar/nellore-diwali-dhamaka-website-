import { beforeAll, describe, expect, it } from "vitest";
import {
  call,
  callError,
  createDraw,
  db,
  fundWallet,
  ledgerOf,
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

describe("ticket purchases", () => {
  let admin: TestUser;

  beforeAll(async () => {
    await resetEmulators();
    await writeSettings();
    await writePaymentQr();
    admin = await registerAdmin();
  });

  it("fails cleanly on insufficient balance and changes nothing", async () => {
    const draw = await createDraw(admin);
    const user = await registerCustomer("Empty Wallet");
    expect(
      await callError("purchaseTickets", { drawId: draw.id, ticketIds: [draw.ticketIds[0]], requestId: requestId() }, user.token),
    ).toBe("FAILED_PRECONDITION");
    const ticket = (await db.doc(`tickets/${draw.ticketIds[0]}`).get()).data();
    expect(ticket?.status).toBe("available");
    expect(ticket?.ownerUid).toBeUndefined();
    expect((await db.collection("orders").where("uid", "==", user.uid).get()).size).toBe(0);
    expect(await ledgerOf(user.uid)).toHaveLength(0);
  });

  it("debits exactly price × quantity, books the tickets and is idempotent on retry", async () => {
    const draw = await createDraw(admin);
    const user = await registerCustomer("Happy Buyer");
    await fundWallet(user, admin, 50_000);

    const payload = { drawId: draw.id, ticketIds: draw.ticketIds.slice(0, 2), requestId: requestId() };
    const first = await call<{ orderId: string; totalPaise: number; balancePaise: number }>("purchaseTickets", payload, user.token);
    const replay = await call<{ orderId: string }>("purchaseTickets", payload, user.token);

    expect(first.totalPaise).toBe(2 * draw.pricePaise);
    expect(first.balancePaise).toBe(50_000 - 2 * draw.pricePaise);
    expect(replay.orderId).toBe(first.orderId);
    expect((await walletOf(user.uid)).balancePaise).toBe(50_000 - 2 * draw.pricePaise);
    expect((await ledgerOf(user.uid)).filter((t) => t.type === "ticket_purchase")).toHaveLength(1);

    for (const id of payload.ticketIds) {
      const ticket = (await db.doc(`tickets/${id}`).get()).data();
      expect(ticket).toMatchObject({ status: "booked", ownerUid: user.uid, orderId: first.orderId });
    }
    const order = (await db.doc(`orders/${first.orderId}`).get()).data();
    expect(order).toMatchObject({ status: "completed", quantity: 2, uid: user.uid });
  });

  it("sells a contested ticket to exactly one buyer and leaves the loser's wallet untouched", async () => {
    const draw = await createDraw(admin);
    const buyers = await Promise.all([registerCustomer("Racer One"), registerCustomer("Racer Two"), registerCustomer("Racer Three")]);
    for (const buyer of buyers) await fundWallet(buyer, admin, 20_000);

    const target = draw.ticketIds[3];
    const results = await Promise.allSettled(
      buyers.map((buyer) =>
        call("purchaseTickets", { drawId: draw.id, ticketIds: [target], requestId: requestId() }, buyer.token),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);

    const ticket = (await db.doc(`tickets/${target}`).get()).data();
    const winnerIndex = results.findIndex((r) => r.status === "fulfilled");
    expect(ticket?.ownerUid).toBe(buyers[winnerIndex].uid);
    for (const [index, buyer] of buyers.entries()) {
      const expected = index === winnerIndex ? 20_000 - draw.pricePaise : 20_000;
      expect((await walletOf(buyer.uid)).balancePaise).toBe(expected);
    }
  });

  it("enforces the per-account ticket limit across orders", async () => {
    const draw = await createDraw(admin, { maxTicketsPerUser: 2 });
    const user = await registerCustomer("Greedy Buyer");
    await fundWallet(user, admin, 50_000);
    await call("purchaseTickets", { drawId: draw.id, ticketIds: draw.ticketIds.slice(0, 2), requestId: requestId() }, user.token);
    expect(
      await callError("purchaseTickets", { drawId: draw.id, ticketIds: [draw.ticketIds[5]], requestId: requestId() }, user.token),
    ).toBe("FAILED_PRECONDITION");
  });

  it("refuses sales for closed, unpublished or legally disabled draws", async () => {
    const user = await registerCustomer("Late Buyer");
    await fundWallet(user, admin, 50_000);

    const closed = await createDraw(admin, { salesCloseAt: nowIso(-0.5), salesOpenAt: nowIso(-2) });
    expect(
      await callError("purchaseTickets", { drawId: closed.id, ticketIds: [closed.ticketIds[0]], requestId: requestId() }, user.token),
    ).toBe("FAILED_PRECONDITION");

    const hidden = await createDraw(admin, { published: false });
    expect(
      await callError("purchaseTickets", { drawId: hidden.id, ticketIds: [hidden.ticketIds[0]], requestId: requestId() }, user.token),
    ).toBe("FAILED_PRECONDITION");

    const open = await createDraw(admin);
    await writeSettings({ allowPaidDraws: false });
    try {
      expect(
        await callError("purchaseTickets", { drawId: open.id, ticketIds: [open.ticketIds[0]], requestId: requestId() }, user.token),
      ).toBe("FAILED_PRECONDITION");
    } finally {
      await writeSettings();
    }
    expect((await walletOf(user.uid)).balancePaise).toBe(50_000);
  });
});
