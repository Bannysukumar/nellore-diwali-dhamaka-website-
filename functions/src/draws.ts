import { createHash } from "node:crypto";
import { onCall } from "firebase-functions/v2/https";
import {
  CALLABLE_OPTIONS,
  COLLECTIONS,
  applyLedger,
  audit,
  clean,
  db,
  notify,
  readDoc,
  readDraw,
  readWallet,
  requireUser,
} from "./firestore.js";
import {
  alreadyExists,
  failedPrecondition,
  invalidArgument,
  notFound,
  requireObject,
  requireString,
} from "./errors.js";
import type {
  Draw,
  DrawAssignment,
  DrawResult,
  Order,
  Ticket,
  UserProfile,
  WinnerAnnouncement,
} from "./domain/types.js";
import {
  displayName,
  maskTicket,
  nowIso,
  prizeAssignmentOrder,
  secureSample,
} from "./domain/shared.js";

export interface RunDrawResponse {
  drawId: string;
  eligibleTicketCount: number;
  winningTicketNumbers: number[];
  drawnAt: string;
}

/** A draw may only be executed once its sales window has closed. */
export function canRunDraw(draw: Draw, at = Date.now()): string | null {
  if (draw.status === "cancelled") return "A cancelled draw cannot be executed.";
  if (draw.status === "draft" || !draw.published) return "Publish the draw before running it.";
  if (["results_pending", "completed"].includes(draw.status)) return "This draw has already been executed.";
  const salesOver =
    draw.status === "sales_closed" ||
    draw.status === "in_progress" ||
    at >= new Date(draw.salesCloseAt).getTime();
  if (!salesOver) return "Close ticket sales before running the draw.";
  return null;
}

export function eligibleSetHash(ticketIds: string[]): string {
  return createHash("sha256").update([...ticketIds].sort().join("\n")).digest("hex");
}

/**
 * Executes the draw and selects the winning tickets.
 *
 * Only booked tickets backed by a completed order owned by the same account
 * enter the pool. Winners are chosen by secure random removal, so every
 * eligible ticket has an equal, unbiased chance, and the prize each ticket wins
 * is fixed in the stored result. The configured draw time only schedules this
 * step; nothing about the timestamp influences who wins. A draw can be executed
 * exactly once — the guard is re-checked inside the transaction.
 */
export const runDraw = onCall<unknown>(
  { ...CALLABLE_OPTIONS, timeoutSeconds: 300, memory: "512MiB" },
  async (request): Promise<RunDrawResponse> => {
    const admin = await requireUser(request.auth, { admin: true });
    const data = requireObject<Record<string, unknown>>(request.data);
    const drawId = requireString(data, "drawId", 120);
    const draw = await readDraw(drawId);

    const blocked = canRunDraw(draw);
    if (blocked) failedPrecondition(blocked);

    const previous = await readDoc<DrawResult>(COLLECTIONS.drawResults, draw.id);
    if (previous && previous.executionCount > 0) {
      alreadyExists("This draw has already been executed. Use a new draw instead of re-running an existing one.");
    }

    const bookedSnap = await db()
      .collection(COLLECTIONS.tickets)
      .where("drawId", "==", draw.id)
      .where("status", "==", "booked")
      .get();
    const booked = bookedSnap.docs.map((d) => ({ ...(d.data() as Ticket), id: d.id }));

    const orderIds = Array.from(new Set(booked.map((t) => t.orderId).filter((id): id is string => Boolean(id))));
    const orders = new Map<string, Order>();
    for (let i = 0; i < orderIds.length; i += 300) {
      const refs = orderIds.slice(i, i + 300).map((id) => db().collection(COLLECTIONS.orders).doc(id));
      const snaps = await db().getAll(...refs);
      for (const snap of snaps) if (snap.exists) orders.set(snap.id, snap.data() as Order);
    }
    const pool = booked.filter((t) => {
      const order = t.orderId ? orders.get(t.orderId) : undefined;
      return Boolean(
        t.ownerUid && order && order.status === "completed" && order.uid === t.ownerUid && order.ticketIds.includes(t.id),
      );
    });
    if (!pool.length) failedPrecondition("No eligible tickets found for this draw.");

    const prizes = prizeAssignmentOrder(draw.prizes);
    const slots = prizes.flatMap((prize) => Array.from({ length: prize.quantity }, () => prize));
    const winners = secureSample(pool, slots.length);
    const assignments: DrawAssignment[] = winners.map((ticket, i) => ({
      ticketId: ticket.id,
      ticketNumber: ticket.number,
      prizeId: slots[i].id,
      prizeTier: slots[i].tier,
      prizeTitle: slots[i].title,
      prizeDescription: slots[i].description,
    }));

    const drawnAt = nowIso();
    const result: DrawResult = {
      id: draw.id,
      drawId: draw.id,
      drawTitle: draw.title,
      eligibleTicketCount: pool.length,
      winningTicketIds: winners.map((t) => t.id),
      winningTicketNumbers: winners.map((t) => t.number),
      assignments,
      eligibleSetHash: eligibleSetHash(pool.map((t) => t.id)),
      drawnAt,
      drawnBy: admin.uid,
      published: false,
      executionCount: 1,
      auditNote: `Secure random selection of ${winners.length} winner(s) from ${pool.length} eligible ticket(s); ${booked.length - pool.length} booked ticket(s) excluded for failing ownership checks.`,
    };

    await db().runTransaction(async (tx) => {
      const resultRef = db().collection(COLLECTIONS.drawResults).doc(draw.id);
      const drawRef = db().collection(COLLECTIONS.draws).doc(draw.id);
      const [guard, liveDrawSnap] = await Promise.all([tx.get(resultRef), tx.get(drawRef)]);
      if (guard.exists && (guard.data() as DrawResult).executionCount > 0) {
        alreadyExists("This draw has already been executed.");
      }
      const liveBlocked = canRunDraw({ ...(liveDrawSnap.data() as Draw), id: draw.id });
      if (liveBlocked) failedPrecondition(liveBlocked);

      tx.set(resultRef, result);
      tx.update(drawRef, clean({ status: "results_pending" as const, updatedAt: drawnAt }));
    });

    await audit(
      admin,
      "draw.run",
      COLLECTIONS.draws,
      draw.id,
      result.auditNote,
      { status: draw.status },
      { status: "results_pending", winners: winners.length, eligibleSetHash: result.eligibleSetHash },
    );

    return {
      drawId: draw.id,
      eligibleTicketCount: pool.length,
      winningTicketNumbers: result.winningTicketNumbers,
      drawnAt,
    };
  },
);

export interface PublishResultsResponse {
  drawId: string;
  publishedWinners: number;
  publishedAt: string;
}

/**
 * Publishes a drawn result as masked public winner announcements.
 *
 * Running and publishing are separate, separately-audited steps. Announcement
 * ids are deterministic and the publish flag is checked inside the transaction,
 * so publishing twice can never create duplicate winners. Winners are shown by
 * masked ticket number and a shortened display name only.
 */
export const publishDrawResults = onCall<unknown>(
  { ...CALLABLE_OPTIONS, timeoutSeconds: 300 },
  async (request): Promise<PublishResultsResponse> => {
    const admin = await requireUser(request.auth, { admin: true });
    const data = requireObject<Record<string, unknown>>(request.data);
    const drawId = requireString(data, "drawId", 120);
    const note = typeof data.note === "string" ? data.note.slice(0, 500) : undefined;
    const draw = await readDraw(drawId);

    const result = await readDoc<DrawResult>(COLLECTIONS.drawResults, draw.id);
    if (!result) failedPrecondition("Run the draw before publishing results.");
    if (result.published) {
      const existing = await db().collection(COLLECTIONS.winnerAnnouncements).where("drawId", "==", draw.id).count().get();
      return { drawId: draw.id, publishedWinners: existing.data().count, publishedAt: result.publishedAt ?? nowIso() };
    }

    const assignments: DrawAssignment[] =
      result.assignments ?? legacyAssignments(draw, result);
    const publishedAt = nowIso();

    const published = await db().runTransaction(async (tx) => {
      const resultRef = db().collection(COLLECTIONS.drawResults).doc(draw.id);
      const resultSnap = await tx.get(resultRef);
      if ((resultSnap.data() as DrawResult | undefined)?.published) return null;

      const ticketSnaps = await Promise.all(
        assignments.map((a) => tx.get(db().collection(COLLECTIONS.tickets).doc(a.ticketId))),
      );
      const ownerUids = Array.from(
        new Set(ticketSnaps.map((s) => (s.data() as Ticket | undefined)?.ownerUid).filter((u): u is string => Boolean(u))),
      );
      const ownerSnaps = await Promise.all(ownerUids.map((uid) => tx.get(db().collection(COLLECTIONS.users).doc(uid))));
      const owners = new Map(ownerSnaps.map((s) => [s.id, s.data() as UserProfile | undefined]));

      const winners: { ownerUid?: string; ticketMasked: string; prizeTitle: string }[] = [];
      assignments.forEach((assignment, index) => {
        const ticket = ticketSnaps[index].data() as Ticket | undefined;
        if (!ticket) return;
        const owner = ticket.ownerUid ? owners.get(ticket.ownerUid) : undefined;
        const ticketMasked = maskTicket(ticket.numberLabel);
        const announcement: WinnerAnnouncement = clean({
          id: `win_${draw.id}_${String(index + 1).padStart(3, "0")}`,
          drawId: draw.id,
          drawTitle: draw.title,
          drawAt: draw.drawAt,
          prizeId: assignment.prizeId,
          prizeTier: assignment.prizeTier,
          prizeTitle: assignment.prizeTitle,
          prizeDescription: assignment.prizeDescription,
          ticketNumberMasked: ticketMasked,
          winnerDisplayName: owner ? displayName(owner.fullName) : "Festival Participant",
          winnerUid: ticket.ownerUid,
          status: "published" as const,
          publishedAt,
          createdAt: publishedAt,
        }) as WinnerAnnouncement;
        tx.set(db().collection(COLLECTIONS.winnerAnnouncements).doc(announcement.id), announcement);
        tx.update(
          db().collection(COLLECTIONS.tickets).doc(assignment.ticketId),
          clean({
            resultStatus: "winner" as const,
            prizeId: assignment.prizeId,
            prizeTier: assignment.prizeTier,
            prizeTitle: assignment.prizeTitle,
            updatedAt: publishedAt,
          }),
        );
        winners.push({ ownerUid: ticket.ownerUid, ticketMasked, prizeTitle: assignment.prizeTitle });
      });

      tx.update(resultRef, { published: true, publishedAt, publishedBy: admin.uid });
      tx.update(
        db().collection(COLLECTIONS.draws).doc(draw.id),
        clean({ status: "completed" as const, updatedAt: publishedAt }),
      );
      return winners;
    });

    if (!published) {
      const existing = await db().collection(COLLECTIONS.winnerAnnouncements).where("drawId", "==", draw.id).count().get();
      return { drawId: draw.id, publishedWinners: existing.data().count, publishedAt };
    }

    // Post-commit fan-out: winner notifications and "not selected" marks.
    // Both are idempotent and safe to repeat.
    const winningIds = new Set(assignments.map((a) => a.ticketId));
    let batch = db().batch();
    let pending = 0;
    const flush = async () => {
      if (pending) await batch.commit();
      batch = db().batch();
      pending = 0;
    };
    for (const winner of published) {
      if (!winner.ownerUid) continue;
      batch.set(db().collection(COLLECTIONS.notifications).doc(), {
        uid: winner.ownerUid,
        type: "winner_announcement",
        title: "You are a winner!",
        body: `Ticket ${winner.ticketMasked} won "${winner.prizeTitle}" in ${draw.title}. Our team will contact you about prize collection.`,
        href: "/dashboard/tickets",
        read: false,
        createdAt: publishedAt,
      });
      if (++pending >= 400) await flush();
    }
    const others = await db()
      .collection(COLLECTIONS.tickets)
      .where("drawId", "==", draw.id)
      .where("status", "==", "booked")
      .get();
    for (const doc of others.docs) {
      if (winningIds.has(doc.id)) continue;
      batch.update(doc.ref, { resultStatus: "not_selected", updatedAt: publishedAt });
      if (++pending >= 400) await flush();
    }
    await flush();

    await audit(admin, "draw.publish_results", COLLECTIONS.draws, draw.id, note, { published: false }, {
      published: true,
      winners: published.length,
    });

    return { drawId: draw.id, publishedWinners: published.length, publishedAt };
  },
);

/** Results drawn before assignments were stored: re-derive them in tier order. */
function legacyAssignments(draw: Draw, result: DrawResult): DrawAssignment[] {
  const slots = prizeAssignmentOrder(draw.prizes).flatMap((prize) =>
    Array.from({ length: prize.quantity }, () => prize),
  );
  return result.winningTicketIds.slice(0, slots.length).map((ticketId, i) => ({
    ticketId,
    ticketNumber: result.winningTicketNumbers[i],
    prizeId: slots[i].id,
    prizeTier: slots[i].tier,
    prizeTitle: slots[i].title,
    prizeDescription: slots[i].description,
  }));
}

/* ----------------------------------------------------------- cancelDraw */

export interface CancelDrawResponse {
  drawId: string;
  refundedOrders: number;
  refundedPaise: number;
}

/**
 * Cancels a draw and refunds every completed ticket order to the buyer's
 * wallet as a ledger credit, as the published terms promise.
 *
 * Resumable and idempotent: the draw is marked cancelled first, then each
 * order is refunded in its own transaction that re-checks the order is still
 * `completed`. Calling this again after a timeout refunds only what remains.
 * A draw whose winners have already been selected cannot be cancelled here.
 */
export const cancelDraw = onCall<unknown>(
  { ...CALLABLE_OPTIONS, timeoutSeconds: 540, memory: "512MiB" },
  async (request): Promise<CancelDrawResponse> => {
    const admin = await requireUser(request.auth, { admin: true });
    const data = requireObject<Record<string, unknown>>(request.data);
    const drawId = requireString(data, "drawId", 120);
    const reason = requireString(data, "reason", 500).trim();
    if (reason.length < 4) invalidArgument("Give a short cancellation reason.");

    const drawRef = db().collection(COLLECTIONS.draws).doc(drawId);
    const cancelledAt = nowIso();
    const before = await db().runTransaction(async (tx) => {
      const snap = await tx.get(drawRef);
      if (!snap.exists) notFound("That draw does not exist.");
      const draw = snap.data() as Draw;
      if (draw.status === "results_pending" || draw.status === "completed") {
        failedPrecondition("Winners have already been selected for this draw; it can no longer be cancelled.");
      }
      if (draw.status !== "cancelled") {
        tx.update(drawRef, { status: "cancelled", cancelledAt, cancelReason: reason, updatedAt: cancelledAt });
      }
      return draw;
    });

    const orders = await db()
      .collection(COLLECTIONS.orders)
      .where("drawId", "==", drawId)
      .where("status", "==", "completed")
      .get();

    let refundedOrders = 0;
    let refundedPaise = 0;
    for (const doc of orders.docs) {
      const refunded = await db().runTransaction(async (tx) => {
        const orderSnap = await tx.get(doc.ref);
        const order = orderSnap.data() as Order | undefined;
        if (!order || order.status !== "completed") return null;
        const wallet = await readWallet(tx, order.uid);
        const { txId } = applyLedger(tx, wallet, {
          uid: order.uid,
          type: "refund",
          direction: "credit",
          amountPaise: order.totalPaise,
          description: `Refund — ${before.title} was cancelled`,
          refId: doc.id,
          actor: admin.uid,
        });
        tx.update(doc.ref, { status: "refunded", refundedAt: nowIso(), refundTxId: txId });
        return order;
      });
      if (!refunded) continue;
      refundedOrders += 1;
      refundedPaise += refunded.totalPaise;
      await notify(
        refunded.uid,
        "system",
        "Ticket refund credited",
        `${before.title} was cancelled. ${refunded.quantity} ticket(s) were refunded to your wallet.`,
        "/dashboard/wallet",
      );
    }

    await audit(
      admin,
      "draw.cancel",
      COLLECTIONS.draws,
      drawId,
      `${reason} — ${refundedOrders} order(s) refunded.`,
      { status: before.status },
      { status: "cancelled", refundedOrders, refundedPaise },
    );
    return { drawId, refundedOrders, refundedPaise };
  },
);

/* ------------------------------------------------------- moderateWinner */

/**
 * Hides or re-shows a published winner announcement (for example at the
 * winner's request, or while a prize claim is investigated). The stored draw
 * result is never altered and every change is audit-logged.
 */
export const moderateWinner = onCall<unknown>(CALLABLE_OPTIONS, async (request) => {
  const admin = await requireUser(request.auth, { admin: true });
  const data = requireObject<Record<string, unknown>>(request.data);
  const winnerId = requireString(data, "winnerId", 200);
  const action = requireString(data, "action", 20);
  const note = typeof data.note === "string" ? data.note.trim().slice(0, 500) : undefined;
  if (!["publish", "hide", "delete"].includes(action)) invalidArgument("Unknown action.");

  const ref = db().collection(COLLECTIONS.winnerAnnouncements).doc(winnerId);
  const snap = await ref.get();
  if (!snap.exists) notFound("Winner announcement not found.");
  const before = snap.data() as WinnerAnnouncement;

  if (action === "delete") {
    await ref.delete();
  } else {
    await ref.update(
      clean({
        status: action === "publish" ? "published" : "draft",
        publishedAt: action === "publish" ? nowIso() : before.publishedAt,
        moderatedBy: admin.uid,
        moderatedAt: nowIso(),
      }),
    );
  }
  await audit(
    admin,
    `winner.${action}`,
    COLLECTIONS.winnerAnnouncements,
    winnerId,
    note ?? `${before.prizeTitle} · ${before.ticketNumberMasked}`,
    { status: before.status },
    action === "delete" ? { deleted: true } : { status: action === "publish" ? "published" : "draft" },
  );
  return { winnerId, action };
});
