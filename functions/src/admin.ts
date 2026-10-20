import { getAuth } from "firebase-admin/auth";
import { FieldPath } from "firebase-admin/firestore";
import { onCall } from "firebase-functions/v2/https";
import {
  CALLABLE_OPTIONS,
  COLLECTIONS,
  audit,
  clean,
  db,
  enforceRateLimit,
  requireUser,
} from "./firestore.js";
import {
  failedPrecondition,
  invalidArgument,
  optionalString,
  requireObject,
  requireRequestId,
  requireString,
  requireStringArray,
} from "./errors.js";
import { nowIso } from "./domain/shared.js";
import type { AppNotification, NotificationType } from "./domain/types.js";

/**
 * Promotes or demotes an administrator.
 *
 * Administrator rights live exclusively in the Firebase Auth custom claim
 * `role`. A client can never grant itself this claim — writing `role: "admin"`
 * into a Firestore document has no effect on authorisation, and the security
 * rules reject such writes outright.
 *
 * The first administrator must be bootstrapped from the command line with
 * `tools/setAdmin.mjs` and service-account credentials. After that, existing
 * admins can promote others through this callable.
 */
export const setAdminClaim = onCall<unknown>(CALLABLE_OPTIONS, async (request) => {
  const data = requireObject<Record<string, unknown>>(request.data);
  const uid = requireString(data, "uid", 128);
  const admin = data.admin === true;

  const caller = await requireUser(request.auth, { admin: true });
  if (caller.uid === uid && !admin) {
    failedPrecondition("You cannot remove your own administrator access.");
  }

  const targetSnap = await db().collection(COLLECTIONS.users).doc(uid).get();
  if (!targetSnap.exists) failedPrecondition("That user does not exist.");

  const auth = getAuth();
  const user = await auth.getUser(uid);
  const claims = { ...(user.customClaims ?? {}) };
  if (admin) claims.role = "admin";
  else delete claims.role;
  await auth.setCustomUserClaims(uid, claims);
  // Existing ID tokens keep the old claim until refresh; revoking forces it.
  await auth.revokeRefreshTokens(uid);

  // Mirrored for display and admin lookups only; authorisation reads the claim.
  await db()
    .collection(COLLECTIONS.users)
    .doc(uid)
    .set({ role: admin ? "admin" : "customer", updatedAt: new Date().toISOString() }, { merge: true });

  await audit(
    caller,
    admin ? "admin.grant" : "admin.revoke",
    COLLECTIONS.users,
    uid,
    admin ? "Granted administrator access." : "Revoked administrator access.",
  );

  return { uid, admin };
});

/**
 * Records an administrator's own description of a console action (for example
 * "Approved QR swap after the old code expired"). Actor and timestamp are
 * stamped here from the verified token; the browser cannot write the audit
 * collection directly. Data changes themselves are additionally captured by the
 * Firestore audit triggers in `triggers.ts`.
 */
export const logAdminAction = onCall<unknown>(CALLABLE_OPTIONS, async (request) => {
  const admin = await requireUser(request.auth, { admin: true });
  const data = requireObject<Record<string, unknown>>(request.data);
  const action = requireString(data, "action", 80);
  if (!/^[a-zA-Z_]+(\.[a-zA-Z_]+){1,3}$/.test(action)) invalidArgument("Action must look like `entity.verb`.");
  const entity = requireString(data, "entity", 60);
  const entityId = requireString(data, "entityId", 200);
  const note = typeof data.note === "string" ? data.note.slice(0, 1000) : undefined;
  const limitSize = (value: unknown) => {
    if (value === undefined) return undefined;
    const json = JSON.stringify(value);
    return json && json.length <= 4000 ? JSON.parse(json) : { truncated: true };
  };
  await audit(admin, action, entity, entityId, note, limitSize(data.before), limitSize(data.after));
  return { ok: true };
});

const BROADCAST_TYPES: readonly NotificationType[] = ["system", "draw_reminder", "draw_schedule_change"];
const BROADCAST_PAGE = 400;
const MAX_SELECTED_RECIPIENTS = 500;

/**
 * Writes one in-app notification per recipient. With no `uids`, every active
 * customer account is targeted by paging through the whole `users` collection
 * — never just the rows an admin screen happened to load.
 *
 * Notification ids are `${requestId}_${uid}`, so retrying a partially failed
 * broadcast with the same `requestId` completes it without duplicates. The
 * response reports only what was actually written.
 */
export const broadcastAnnouncement = onCall<unknown>(CALLABLE_OPTIONS, async (request) => {
  const admin = await requireUser(request.auth, { admin: true });
  const data = requireObject<Record<string, unknown>>(request.data);
  const requestId = requireRequestId(data);
  const title = requireString(data, "title", 120).trim();
  const body = requireString(data, "body", 1000).trim();
  if (title.length < 3) invalidArgument("Write a subject of at least 3 characters.");
  if (body.length < 5) invalidArgument("Write the message body.");
  const type = requireString(data, "type", 40) as NotificationType;
  if (!BROADCAST_TYPES.includes(type)) invalidArgument("Unsupported notification type.");
  const href = optionalString(data, "href", 300)?.trim();
  if (href && !/^\/(?!\/)[\w\-./?=&#%]*$/.test(href)) {
    invalidArgument("Links must be in-app paths that start with “/”.");
  }
  const selected =
    data.uids === undefined
      ? null
      : Array.from(new Set(requireStringArray(data, "uids", { min: 1, max: MAX_SELECTED_RECIPIENTS })));

  await enforceRateLimit(admin.uid, "broadcastAnnouncement", { max: 10, windowSeconds: 3600 });

  const createdAt = nowIso();
  const notifications = db().collection(COLLECTIONS.notifications);
  let delivered = 0;

  const deliver = async (uids: string[]) => {
    if (!uids.length) return;
    const batch = db().batch();
    for (const uid of uids) {
      const payload = clean({
        uid,
        type,
        title,
        body,
        href,
        read: false,
        createdAt,
      }) as AppNotification;
      batch.set(notifications.doc(`${requestId}_${uid}`), payload);
    }
    await batch.commit();
    delivered += uids.length;
  };

  if (selected) {
    // Only active customers can be targeted, even when chosen by id.
    for (let i = 0; i < selected.length; i += 30) {
      const chunk = selected.slice(i, i + 30);
      const snap = await db()
        .collection(COLLECTIONS.users)
        .where(FieldPath.documentId(), "in", chunk)
        .get();
      await deliver(
        snap.docs
          .filter((d) => d.get("role") === "customer" && d.get("status") === "active")
          .map((d) => d.id),
      );
    }
  } else {
    let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
    for (;;) {
      let query = db()
        .collection(COLLECTIONS.users)
        .where("role", "==", "customer")
        .where("status", "==", "active")
        .orderBy(FieldPath.documentId())
        .limit(BROADCAST_PAGE);
      if (cursor) query = query.startAfter(cursor);
      const snap = await query.get();
      if (snap.empty) break;
      await deliver(snap.docs.map((d) => d.id));
      cursor = snap.docs[snap.docs.length - 1];
      if (snap.size < BROADCAST_PAGE) break;
    }
  }

  await audit(
    admin,
    "notification.broadcast",
    COLLECTIONS.notifications,
    requestId,
    `${title} → ${delivered} recipient(s)${selected ? " (selected)" : " (all active customers)"}`,
  );

  return { delivered, createdAt };
});
