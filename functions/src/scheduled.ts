import { onSchedule } from "firebase-functions/v2/scheduler";
import { COLLECTIONS, clean, db, readDoc } from "./firestore.js";
import type { Draw, Order, UserProfile } from "./domain/types.js";
import { nowIso } from "./domain/shared.js";
import { releaseHolds } from "./deposits.js";

/**
 * Housekeeping jobs.
 *
 * These only ever move a draw between states or send a reminder — they never
 * choose winners or move money. Anything that does is an explicit, human-run
 * callable so it is always attributable to an operator.
 */

const IST = "Asia/Kolkata";

/**
 * Opens sales for published `upcoming` draws whose window has started.
 * Draws an administrator has deliberately paused (moved back to `upcoming`
 * with `salesPaused: true`) are left alone.
 */
export const openSales = onSchedule({ schedule: "every 5 minutes", timeZone: IST }, async () => {
  const at = nowIso();
  const snap = await db()
    .collection(COLLECTIONS.draws)
    .where("status", "==", "upcoming")
    .where("salesOpenAt", "<=", at)
    .get();
  let opened = 0;
  for (const doc of snap.docs) {
    const draw = doc.data() as Draw & { salesPaused?: boolean };
    if (!draw.published || draw.salesPaused || draw.salesCloseAt <= at) continue;
    await doc.ref.update(clean({ status: "open" as const, updatedAt: at }));
    opened += 1;
  }
  if (opened) console.log(`openSales: opened ${opened} draw(s).`);
});

/**
 * Frees numbers held for deposits that were not decided within the hold window.
 * The deposit itself stays in the queue; if it is approved later the booking is
 * retried and only succeeds if the numbers are still free.
 */
export const releaseExpiredHolds = onSchedule({ schedule: "every 15 minutes", timeZone: IST }, async () => {
  const snap = await db().collection(COLLECTIONS.tickets).where("heldUntil", "<=", nowIso()).limit(500).get();
  const byDeposit = new Map<string, string[]>();
  for (const doc of snap.docs) {
    const depositId = doc.get("holdDepositId") as string | undefined;
    if (depositId) byDeposit.set(depositId, [...(byDeposit.get(depositId) ?? []), doc.id]);
  }
  let released = 0;
  for (const [depositId, ticketIds] of byDeposit) released += await releaseHolds(depositId, ticketIds);
  if (released) console.log(`releaseExpiredHolds: released ${released} ticket(s).`);
});

/** Closes sales for draws whose window has elapsed. Runs every 5 minutes. */
export const closeSales = onSchedule({ schedule: "every 5 minutes", timeZone: IST }, async () => {
  const at = nowIso();
  const snap = await db()
    .collection(COLLECTIONS.draws)
    .where("status", "==", "open")
    .where("salesCloseAt", "<=", at)
    .get();

  for (const doc of snap.docs) {
    await doc.ref.update(clean({ status: "sales_closed" as const, updatedAt: at }));
  }
  if (!snap.empty) {
    console.log(`closeSales: closed ${snap.size} draw(s).`);
  }
});

/**
 * Reminds ticket holders the day before their draw.
 *
 * Runs once a day; the notification is a single document per holder so it can
 * be marked as read like any other. Delivery channels beyond in-app are left to
 * the operator — nothing is simulated.
 */
export const remindDraw = onSchedule({ schedule: "every day 09:00", timeZone: IST }, async () => {
  const at = new Date();
  const in24h = new Date(at.getTime() + 86_400_000);
  const snap = await db()
    .collection(COLLECTIONS.draws)
    .where("status", "in", ["open", "sales_closed"])
    .get();

  for (const doc of snap.docs) {
    const draw = { ...(doc.data() as Draw), id: doc.id };
    const drawAt = new Date(draw.drawAt);
    if (drawAt > in24h || drawAt < at) continue;

    const tickets = await db()
      .collection(COLLECTIONS.tickets)
      .where("drawId", "==", draw.id)
      .where("status", "==", "booked")
      .get();
    const uids = Array.from(new Set(tickets.docs.map((t) => (t.data() as { ownerUid?: string }).ownerUid))).filter(
      (uid): uid is string => Boolean(uid),
    );
    if (!uids.length) continue;

    const batch = db().batch();
    for (const uid of uids) {
      const ref = db().collection(COLLECTIONS.notifications).doc();
      batch.set(ref, clean({
        uid,
        type: "draw_reminder",
        title: "Your draw is tomorrow",
        body: `${draw.title} takes place on ${drawAt.toLocaleString("en-IN", { timeZone: IST })}.`,
        href: "/dashboard/tickets",
        read: false,
        createdAt: nowIso(),
      }));
    }
    await batch.commit();
    console.log(`remindDraw: notified ${uids.length} holder(s) for ${draw.id}.`);
  }
});

/**
 * Escalates draws whose results were drawn but never published, so a completed
 * draw cannot silently sit unpublished and leave winners unaware. Alerts
 * administrators only — publishing remains an explicit operator action.
 */
export const releaseUnpublishedDraws = onSchedule({ schedule: "every 6 hours", timeZone: IST }, async () => {
  const snap = await db()
    .collection(COLLECTIONS.drawResults)
    .where("published", "==", false)
    .get();
  if (snap.empty) return;

  const admins = await db().collection(COLLECTIONS.users).where("role", "==", "admin").get();
  const adminUids = admins.docs.map((d) => (d.data() as UserProfile).uid);

  for (const result of snap.docs) {
    const row = result.data() as { drawId: string; drawTitle: string; drawnAt: string };
    const batch = db().batch();
    for (const uid of adminUids) {
      const ref = db().collection(COLLECTIONS.notifications).doc();
      batch.set(ref, clean({
        uid,
        type: "system",
        title: "Draw results awaiting publication",
        body: `Results for ${row.drawTitle} were drawn on ${row.drawnAt} and have not been published yet.`,
        href: "/admin/draws",
        read: false,
        createdAt: nowIso(),
      }));
    }
    await batch.commit();
  }
  console.log(`releaseUnpublishedDraws: alerted for ${snap.size} draw(s).`);
});

/**
 * Reconciles orders that reference tickets whose owner does not match, which
 * would indicate a partially-applied write. Read-only: it reports, it does not
 * "fix" data behind an operator's back.
 */
export const verifyOrderIntegrity = onSchedule({ schedule: "every day 03:00", timeZone: IST }, async () => {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const snap = await db().collection(COLLECTIONS.orders).where("createdAt", ">=", since).get();
  let mismatches = 0;

  for (const doc of snap.docs) {
    const order = doc.data() as Order;
    for (const ticketId of order.ticketIds) {
      const ticket = await readDoc<{ ownerUid?: string; orderId?: string }>(
        COLLECTIONS.tickets,
        ticketId,
      );
      if (!ticket || ticket.ownerUid !== order.uid || ticket.orderId !== order.id) {
        mismatches += 1;
        console.error(`verifyOrderIntegrity: order ${order.id} / ticket ${ticketId} mismatch.`);
      }
    }
  }
  console.log(
    `verifyOrderIntegrity: checked ${snap.size} order(s), ${mismatches} mismatch(es).`,
  );
});
