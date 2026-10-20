import { onCall } from "firebase-functions/v2/https";
import {
  CALLABLE_OPTIONS,
  COLLECTIONS,
  HOT_CALLABLE_OPTIONS,
  InsufficientFundsError,
  applyLedger,
  audit,
  clean,
  db,
  enforceRateLimit,
  notify,
  readDraw,
  readSettings,
  readWallet,
  requireUser,
} from "./firestore.js";
import {
  alreadyExists,
  failedPrecondition,
  invalidArgument,
  notFound,
  requireObject,
  requireRequestId,
  requireString,
  requireStringArray,
} from "./errors.js";
import type { Draw, Order, SiteSettings, Ticket } from "./domain/types.js";
import { displayName, formatPaise, nowIso } from "./domain/shared.js";
import { qualifyOnActivitySafely } from "./domain/referrals.js";

/* --------------------------------------------------------- purchaseTickets */

export interface PurchaseTicketsResponse {
  orderId: string;
  drawId: string;
  ticketNumbers: number[];
  totalPaise: number;
  balancePaise: number;
  createdAt: string;
}

/**
 * Atomic wallet-funded ticket checkout.
 *
 * The price is always re-read from the draw document — a client-supplied amount
 * is never trusted. Every check (draw window, availability, per-account cap,
 * balance) and every write (tickets, ledger, wallet, order) happens in one
 * Firestore transaction, so concurrent buyers cannot both claim a ticket and a
 * failure anywhere leaves no partial debit. The order id is derived from the
 * caller's `requestId`, which makes a retried checkout return the original
 * order instead of charging again.
 */
export const purchaseTickets = onCall<unknown>(HOT_CALLABLE_OPTIONS, async (request): Promise<PurchaseTicketsResponse> => {
  const user = await requireUser(request.auth);
  const config = await readSettings();
  const data = requireObject<Record<string, unknown>>(request.data);

  const drawId = requireString(data, "drawId", 120);
  const requestId = requireRequestId(data);
  const ticketIds = requireStringArray(data, "ticketIds", { min: 1, max: 50 });
  const unique = Array.from(new Set(ticketIds));
  const orderId = `ord_${user.uid.slice(0, 12)}_${requestId}`;

  await enforceRateLimit(user.uid, "purchaseTickets", { max: 20, windowSeconds: 60 });

  const draw = await readDraw(drawId);
  assertSelection(config, unique, draw);

  const outcome = await db().runTransaction(async (tx) => {
    // ---- read phase: every tx.get happens before the first write ---------
    const orderRef = db().collection(COLLECTIONS.orders).doc(orderId);
    const orderSnap = await tx.get(orderRef);
    const wallet = await readWallet(tx, user.uid);
    if (orderSnap.exists) {
      const order = orderSnap.data() as Order;
      return {
        replay: true,
        orderId,
        drawId: order.drawId,
        ticketNumbers: order.ticketNumbers,
        totalPaise: order.totalPaise,
        balancePaise: wallet.account.balancePaise,
        createdAt: order.createdAt,
      };
    }

    const drawSnap = await tx.get(db().collection(COLLECTIONS.draws).doc(draw.id));
    const liveDraw = { ...(drawSnap.data() as Draw), id: draw.id };
    assertDrawOpen(liveDraw, config);

    const ownedSnap = await tx.get(
      db()
        .collection(COLLECTIONS.tickets)
        .where("drawId", "==", liveDraw.id)
        .where("ownerUid", "==", user.uid),
    );
    if (ownedSnap.size + unique.length > liveDraw.maxTicketsPerUser) {
      failedPrecondition(
        `This draw allows at most ${liveDraw.maxTicketsPerUser} tickets per account. You already hold ${ownedSnap.size}.`,
      );
    }

    const ticketSnaps = await Promise.all(
      unique.map((id) => tx.get(db().collection(COLLECTIONS.tickets).doc(id))),
    );
    const tickets: (Ticket & { id: string })[] = [];
    for (const snap of ticketSnaps) {
      if (!snap.exists) notFound("A selected ticket no longer exists.");
      const ticket = { ...(snap.data() as Ticket), id: snap.id };
      if (ticket.drawId !== liveDraw.id) invalidArgument("A selected ticket belongs to another draw.");
      if (ticket.status !== "available") {
        alreadyExists(`Ticket ${ticket.numberLabel} is no longer available. Please refresh your selection.`);
      }
      tickets.push(ticket);
    }

    // ---- write phase ------------------------------------------------------
    const totalPaise = tickets.length * liveDraw.ticketPricePaise;
    const createdAt = nowIso();
    let balancePaise: number;
    try {
      ({ balancePaise } = applyLedger(tx, wallet, {
        uid: user.uid,
        type: "ticket_purchase",
        direction: "debit",
        amountPaise: totalPaise,
        description: `Ticket purchase — ${liveDraw.title} (${tickets.length} ticket${tickets.length === 1 ? "" : "s"})`,
        refId: orderId,
        actor: user.uid,
      }));
    } catch (error) {
      if (error instanceof InsufficientFundsError) {
        failedPrecondition(
          `Insufficient wallet balance. You need ${formatPaise(totalPaise)} but have ${formatPaise(error.balancePaise)}. Add money to continue.`,
        );
      }
      throw error;
    }

    const masked = displayName(user.fullName);
    for (const ticket of tickets) {
      tx.update(
        db().collection(COLLECTIONS.tickets).doc(ticket.id),
        clean({
          status: "booked",
          ownerUid: user.uid,
          ownerMaskedName: masked,
          orderId,
          purchasedAt: createdAt,
          pricePaise: liveDraw.ticketPricePaise,
          updatedAt: createdAt,
        }),
      );
    }
    tx.set(
      orderRef,
      clean({
        id: orderId,
        uid: user.uid,
        drawId: liveDraw.id,
        drawTitle: liveDraw.title,
        ticketIds: tickets.map((t) => t.id),
        ticketNumbers: tickets.map((t) => t.number),
        quantity: tickets.length,
        unitPricePaise: liveDraw.ticketPricePaise,
        totalPaise,
        paymentSource: "wallet" as const,
        status: "completed" as const,
        requestId,
        createdAt,
      }),
    );

    return {
      replay: false,
      orderId,
      drawId: liveDraw.id,
      ticketNumbers: tickets.map((t) => t.number),
      totalPaise,
      balancePaise,
      createdAt,
    };
  });

  if (!outcome.replay) {
    await notify(
      user.uid,
      "ticket_purchase",
      "Tickets confirmed",
      `${outcome.ticketNumbers.length} ticket(s) confirmed for ${draw.title}. Order ${orderId}.`,
      "/dashboard/tickets",
    );
    await qualifyOnActivitySafely(user.uid, "ticket_purchase");
  }

  return {
    orderId: outcome.orderId,
    drawId: outcome.drawId,
    ticketNumbers: outcome.ticketNumbers,
    totalPaise: outcome.totalPaise,
    balancePaise: outcome.balancePaise,
    createdAt: outcome.createdAt,
  };
});

export function assertDrawOpen(
  draw: Draw,
  config: Pick<SiteSettings, "allowPaidDraws">,
  at = Date.now(),
): void {
  if (!draw.published || draw.status === "draft") {
    failedPrecondition("This draw is not open for sales.");
  }
  if (draw.status !== "open") {
    failedPrecondition("Ticket sales are not open for this draw.");
  }
  if (at < new Date(draw.salesOpenAt).getTime()) {
    failedPrecondition("Sales for this draw have not opened yet.");
  }
  if (at > new Date(draw.salesCloseAt).getTime()) {
    failedPrecondition("Sales for this draw have closed.");
  }
  if (!config.allowPaidDraws) {
    failedPrecondition(
      "Paid draws are disabled pending the operator's legal and compliance review. " +
        "Enable them in Admin → Settings once approved.",
    );
  }
}

function assertSelection(
  config: Pick<SiteSettings, "allowMultiTicketPurchase" | "maxTicketsPerOrder">,
  unique: string[],
  draw: Draw,
): void {
  if (!unique.length) invalidArgument("Select at least one ticket.");
  if (!config.allowMultiTicketPurchase && unique.length > 1) {
    failedPrecondition("This draw allows one ticket per order.");
  }
  if (unique.length > config.maxTicketsPerOrder) {
    invalidArgument(`You can purchase at most ${config.maxTicketsPerOrder} tickets in one order.`);
  }
  if (unique.length > draw.maxTicketsPerUser) {
    failedPrecondition(`This draw allows at most ${draw.maxTicketsPerUser} tickets per account.`);
  }
}

/* ------------------------------------------------- generateTicketInventory */

export interface GenerateInventoryResponse {
  drawId: string;
  created: number;
  total: number;
}

const INVENTORY_BATCH = 400;

/**
 * Materialises the ticket inventory for a draw.
 *
 * Ticket ids are deterministic (`tkt_{drawId}_{number}`) and written with
 * `create`, so a re-run — or a run that was interrupted halfway — only fills
 * the gaps and can never overwrite a sold ticket. The run is audit-logged.
 */
export const generateTicketInventory = onCall<unknown>(
  { ...CALLABLE_OPTIONS, timeoutSeconds: 540, memory: "512MiB" },
  async (request): Promise<GenerateInventoryResponse> => {
    const admin = await requireUser(request.auth, { admin: true });
    const data = requireObject<Record<string, unknown>>(request.data);
    const drawId = requireString(data, "drawId", 120);
    const draw = await readDraw(drawId);

    if (["completed", "cancelled", "results_pending"].includes(draw.status)) {
      failedPrecondition("Inventory cannot be generated for a finished or cancelled draw.");
    }
    if (!Number.isInteger(draw.ticketNumberStart) || !Number.isInteger(draw.ticketNumberEnd)) {
      invalidArgument("The ticket number range is invalid.");
    }
    if (draw.ticketNumberEnd < draw.ticketNumberStart) {
      invalidArgument("The ticket number range is invalid.");
    }
    const size = draw.ticketNumberEnd - draw.ticketNumberStart + 1;
    if (size > 200_000) {
      invalidArgument("That is too many tickets to generate in one run. Narrow the range.");
    }

    const existingSnap = await db()
      .collection(COLLECTIONS.tickets)
      .where("drawId", "==", draw.id)
      .select()
      .get();
    const existing = new Set(existingSnap.docs.map((d) => d.id));

    const now = nowIso();
    let created = 0;
    let batch = db().batch();
    let inBatch = 0;
    for (let n = draw.ticketNumberStart; n <= draw.ticketNumberEnd; n += 1) {
      const id = `tkt_${draw.id}_${n}`;
      if (existing.has(id)) continue;
      batch.create(
        db().collection(COLLECTIONS.tickets).doc(id),
        clean({
          id,
          number: n,
          numberLabel: String(n).padStart(draw.numberPadding, "0"),
          drawId: draw.id,
          status: "available" as const,
          pricePaise: draw.ticketPricePaise,
          resultStatus: "none" as const,
          updatedAt: now,
        }),
      );
      created += 1;
      inBatch += 1;
      if (inBatch >= INVENTORY_BATCH) {
        await batch.commit();
        batch = db().batch();
        inBatch = 0;
      }
    }
    if (inBatch > 0) await batch.commit();

    const total = existing.size + created;
    await db().collection(COLLECTIONS.draws).doc(draw.id).update({ totalTickets: total, updatedAt: now });
    await audit(
      admin,
      "draw.generate_inventory",
      COLLECTIONS.draws,
      draw.id,
      `Generated ${created} tickets (${total} total).`,
    );
    return { drawId: draw.id, created, total };
  },
);
