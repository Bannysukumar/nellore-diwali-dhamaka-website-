import {
  onDocumentWrittenWithAuthContext,
  type AuthType,
} from "firebase-functions/v2/firestore";
import { COLLECTIONS, clean, db, readDoc } from "./firestore.js";
import type {
  AdminAuditLog,
  Draw,
  Ticket,
  UserProfile,
} from "./domain/types.js";
import { nowIso } from "./domain/shared.js";

/**
 * Server-side audit of every administrator write made directly from the
 * console (draws, banners, settings, QR codes, rewards, legal pages, ticket
 * blocks, account suspensions).
 *
 * The audit log is written here, by a trigger, rather than by the browser:
 * the actor comes from the authenticated request that performed the write, so
 * an administrator cannot skip or forge the entry. Writes made by Cloud
 * Functions themselves (service account) are audited by those functions.
 */

/**
 * Firestore triggers must run in a region compatible with the database
 * location. The production database is in the `nam5` multi-region, which pairs
 * with `us-central1`; callables stay in `asia-south1` (see `bootstrap.ts`).
 */
const TRIGGER_REGION = "us-central1";

type Snapshot =
  { exists: boolean; data(): Record<string, unknown> | undefined } | undefined;

function isClientWrite(authType: AuthType): boolean {
  return authType !== "service_account" && authType !== "system";
}

export function changedKeys(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): string[] {
  const keys = new Set([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ]);
  return [...keys].filter(
    (key) =>
      key !== "updatedAt" &&
      JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key]),
  );
}

function pick(
  row: Record<string, unknown> | undefined,
  keys: string[],
): Record<string, unknown> | undefined {
  if (!row) return undefined;
  return Object.fromEntries(
    keys.filter((k) => k in row).map((k) => [k, row[k]]),
  );
}

async function recordClientWrite(params: {
  collection: string;
  docId: string;
  authType: AuthType;
  authId?: string;
  before: Snapshot;
  after: Snapshot;
}): Promise<void> {
  const before = params.before?.exists ? params.before.data() : undefined;
  const after = params.after?.exists ? params.after.data() : undefined;
  const keys = changedKeys(before, after);
  if (before && after && !keys.length) return;

  const action = !before ? "create" : !after ? "delete" : "update";
  const actor = params.authId
    ? await readDoc<UserProfile>(COLLECTIONS.users, params.authId)
    : null;
  const entry: Omit<AdminAuditLog, "id"> = clean({
    actorUid: params.authId ?? `(${params.authType})`,
    actorName: actor?.fullName ?? "Unknown actor",
    action: `${params.collection}.${action}`,
    entity: params.collection,
    entityId: params.docId,
    note: action === "update" ? `Changed: ${keys.join(", ")}` : undefined,
    before: pick(before, keys.length ? keys : Object.keys(before ?? {})),
    after: pick(after, keys.length ? keys : Object.keys(after ?? {})),
    source: "trigger",
    createdAt: nowIso(),
  });
  await db().collection(COLLECTIONS.adminAuditLogs).add(entry);
}

const AUDITED_COLLECTIONS = [
  "banners",
  "siteSettings",
  "paymentQrCodes",
  "rewards",
  "legalPages",
] as const;

/** Exported as a function group: deployed as `auditAdminContent-banners`, etc. */
export const auditAdminContent = Object.fromEntries(
  AUDITED_COLLECTIONS.map((collection) => [
    collection,
    onDocumentWrittenWithAuthContext(
      { document: `${collection}/{docId}`, region: TRIGGER_REGION },
      async (event) => {
        if (!isClientWrite(event.authType)) return;
        await recordClientWrite({
          collection,
          docId: event.params.docId,
          authType: event.authType,
          authId: event.authId,
          before: event.data?.before,
          after: event.data?.after,
        });
      },
    ),
  ]),
);

/** Ticket writes by customers' purchases are server-side; only console blocks are audited here. */
export const auditTicketBlocks = onDocumentWrittenWithAuthContext(
  { document: "tickets/{docId}", region: TRIGGER_REGION },
  async (event) => {
    if (!isClientWrite(event.authType)) return;
    await recordClientWrite({
      collection: "tickets",
      docId: event.params.docId,
      authType: event.authType,
      authId: event.authId,
      before: event.data?.before,
      after: event.data?.after,
    });
  },
);

/** Customer self-edits are not audit events; suspensions and reactivations are. */
export const auditAccountStatus = onDocumentWrittenWithAuthContext(
  { document: "users/{docId}", region: TRIGGER_REGION },
  async (event) => {
    if (!isClientWrite(event.authType)) return;
    const before = event.data?.before?.data() as UserProfile | undefined;
    const after = event.data?.after?.data() as UserProfile | undefined;
    if (!before || !after || before.status === after.status) return;
    await recordClientWrite({
      collection: "users",
      docId: event.params.docId,
      authType: event.authType,
      authId: event.authId,
      before: event.data?.before,
      after: event.data?.after,
    });
  },
);

/** Fields whose change on a published draw must be communicated to ticket holders. */
export const MATERIAL_DRAW_FIELDS = [
  "salesCloseAt",
  "drawAt",
  "prizes",
  "status",
  "ticketPricePaise",
] as const;

export function describeDrawChange(before: Draw, after: Draw): string | null {
  const parts: string[] = [];
  const when = (iso: string) =>
    new Date(iso).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      dateStyle: "medium",
      timeStyle: "short",
    });
  if (before.drawAt !== after.drawAt)
    parts.push(
      `draw time moved from ${when(before.drawAt)} to ${when(after.drawAt)}`,
    );
  if (before.salesCloseAt !== after.salesCloseAt)
    parts.push(`sales now close ${when(after.salesCloseAt)}`);
  if (JSON.stringify(before.prizes) !== JSON.stringify(after.prizes))
    parts.push("prize details were updated");
  if (before.status !== after.status && after.status === "cancelled")
    parts.push("the draw was cancelled");
  return parts.length ? parts.join("; ") : null;
}

/**
 * Every draw edit is audited, and a material change to a published draw
 * (schedule, prizes, cancellation) is announced to every ticket holder, so a
 * published draw can never be changed silently.
 */
export const onDrawWritten = onDocumentWrittenWithAuthContext(
  { document: "draws/{drawId}", region: TRIGGER_REGION },
  async (event) => {
    const beforeSnap = event.data?.before;
    const afterSnap = event.data?.after;
    if (isClientWrite(event.authType)) {
      await recordClientWrite({
        collection: "draws",
        docId: event.params.drawId,
        authType: event.authType,
        authId: event.authId,
        before: beforeSnap,
        after: afterSnap,
      });
    }

    const before = beforeSnap?.exists ? (beforeSnap.data() as Draw) : undefined;
    const after = afterSnap?.exists ? (afterSnap.data() as Draw) : undefined;
    if (!before || !after || !before.published) return;
    const summary = describeDrawChange(before, after);
    if (!summary) return;

    const holders = await db()
      .collection(COLLECTIONS.tickets)
      .where("drawId", "==", event.params.drawId)
      .where("status", "==", "booked")
      .select("ownerUid")
      .get();
    const uids = Array.from(
      new Set(
        holders.docs
          .map((d) => (d.data() as Pick<Ticket, "ownerUid">).ownerUid)
          .filter((u): u is string => Boolean(u)),
      ),
    );
    const createdAt = nowIso();
    for (let i = 0; i < uids.length; i += 400) {
      const batch = db().batch();
      for (const uid of uids.slice(i, i + 400)) {
        batch.set(db().collection(COLLECTIONS.notifications).doc(), {
          uid,
          type: "draw_schedule_change",
          title: `Update to ${after.title}`,
          body: `${summary.charAt(0).toUpperCase()}${summary.slice(1)}.`,
          href: `/draws/${after.slug}`,
          read: false,
          createdAt,
        });
      }
      await batch.commit();
    }
    await db()
      .collection(COLLECTIONS.adminAuditLogs)
      .add({
        actorUid: event.authId ?? "system",
        actorName: "Draw change notifier",
        action: "draws.holders_notified",
        entity: "draws",
        entityId: event.params.drawId,
        note: `${summary} — ${uids.length} ticket holder(s) notified.`,
        source: "trigger",
        createdAt,
      });
  },
);
