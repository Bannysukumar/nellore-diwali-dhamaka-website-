import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import type { CallableOptions, CallableRequest } from "firebase-functions/v2/https";
import type {
  AdminAuditLog,
  AppNotification,
  DepositRequest,
  Draw,
  DrawResult,
  NotificationType,
  PaymentQrCode,
  Prize,
  Referral,
  Reward,
  SiteSettings,
  SpinAccount,
  SpinConfig,
  Ticket,
  UserProfile,
  WalletAccount,
  WalletTransaction,
} from "./domain/types.js";
import { notFound, permissionDenied, resourceExhausted, unauthenticated } from "./errors.js";
import { nowIso } from "./domain/shared.js";

/**
 * Callables run in `us-central1`, next to the `nam5` Firestore database: a
 * callable makes several sequential database round trips, and from Mumbai each
 * one crossed to the US. The web client calls this region (`src/lib/firebase/client.ts`).
 */
export const CALLABLE_REGIONS = ["us-central1"];

/**
 * Options shared by every callable. App Check is opt-in through
 * `ENFORCE_APP_CHECK=true` in `functions/.env` so local emulator runs and the
 * first deployment work before an App Check provider has been registered.
 */
export const CALLABLE_OPTIONS: CallableOptions = {
  region: CALLABLE_REGIONS,
  enforceAppCheck: process.env.ENFORCE_APP_CHECK === "true",
};
/**
 * Thin, typed access layer over Firestore.
 *
 * Every privileged read/write in this codebase goes through here so the
 * collection names, the audit trail and the identity checks live in exactly one
 * place. No function touches `db` directly.
 */

export const db = () => getFirestore();

export const COLLECTIONS = {
  users: "users",
  draws: "draws",
  tickets: "tickets",
  orders: "orders",
  walletAccounts: "walletAccounts",
  walletTransactions: "walletTransactions",
  depositRequests: "depositRequests",
  paymentQrCodes: "paymentQrCodes",
  referrals: "referrals",
  rewards: "rewards",
  spinAccounts: "spinAccounts",
  spinTransactions: "spinTransactions",
  drawResults: "drawResults",
  winnerAnnouncements: "winnerAnnouncements",
  notifications: "notifications",
  siteSettings: "siteSettings",
  adminAuditLogs: "adminAuditLogs",
  rateLimits: "rateLimits",
  /** One document per credited UTR (id = UTR); server-only, denied to every client. */
  creditedUtrs: "creditedUtrs",
  /** One document per admin balance adjustment (id from requestId); server-only. */
  walletAdjustments: "walletAdjustments",
  walletTransfers: "walletTransfers",
  products: "products",
  /** Coupon codes keyed by product id; admin-only in rules, handed out by `getProductCoupons`. */
  productCoupons: "productCoupons",
} as const;

/** Firestore rejects `undefined`; strip it so optional fields stay optional. */
export function clean<T extends Record<string, unknown>>(data: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) out[key] = value;
  }
  return out as T;
}

export const serverTimestamp = () => FieldValue.serverTimestamp();

export function toIso(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  return nowIso();
}

/** Reads a document and returns it typed (with its id), or `null` when absent. */
export async function readDoc<T>(collection: string, id: string): Promise<T | null> {
  const snap = await db().collection(collection).doc(id).get();
  return snap.exists ? ({ ...(snap.data() as T), id: snap.id } as T) : null;
}

export async function readSettings(): Promise<SiteSettings & { id: string }> {
  const row = await readDoc<SiteSettings & { id: string }>(COLLECTIONS.siteSettings, "general");
  if (!row) notFound("Site settings are not configured.");
  return row;
}

export async function readSpinConfig(): Promise<SpinConfig> {
  const row = await readDoc<SpinConfig>(COLLECTIONS.siteSettings, "spin");
  if (!row) notFound("Spin configuration is missing.");
  return row;
}

export async function readDraw(drawId: string): Promise<Draw & { id: string }> {
  const draw = await readDoc<Draw & { id: string }>(COLLECTIONS.draws, drawId);
  if (!draw) notFound("That draw does not exist.");
  return draw;
}

/**
 * Resolves the caller's profile from the verified Firebase Auth token.
 *
 * The `role` custom claim — which only this backend can set — is the single
 * source of truth for administrator access. A `role: "admin"` field written
 * into Firestore by a client is ignored, and would be rejected by rules anyway.
 */
/**
 * Sessions an administrator opened with `startViewAs` carry the
 * `impersonatedBy` claim and are strictly read-only: no callable may act on
 * the customer's behalf.
 */
export function rejectViewAs(auth: CallableRequest["auth"]): void {
  if (auth?.token.impersonatedBy) {
    permissionDenied("This is a read-only admin view. Customers must make changes themselves.");
  }
}

export async function requireUser(
  auth: CallableRequest["auth"],
  options: { admin?: boolean } = {},
): Promise<UserProfile & { id: string }> {
  if (!auth?.uid) unauthenticated("Please sign in to continue.");
  rejectViewAs(auth);

  const profile = await readDoc<UserProfile & { id: string }>(COLLECTIONS.users, auth.uid);
  if (!profile) unauthenticated("Your account could not be found.");

  if (profile.status === "suspended") {
    permissionDenied("This account is suspended. Contact support.");
  }
  // The Firestore `role` field is display-only; only the verified token counts.
  if (options.admin && auth.token.role !== "admin") {
    permissionDenied("Administrator privileges are required.");
  }
  return profile;
}

/**
 * Fixed-window rate limit per user and operation. Idempotency keys already
 * make retries safe; this caps how fast a single account can hammer an
 * expensive or abusable callable.
 */
export async function enforceRateLimit(
  uid: string,
  operation: string,
  limit: { max: number; windowSeconds: number },
): Promise<void> {
  const ref = db().collection(COLLECTIONS.rateLimits).doc(`${uid}__${operation}`);
  const allowed = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Date.now();
    const row = snap.exists ? (snap.data() as { windowStart: number; count: number }) : null;
    if (!row || now - row.windowStart >= limit.windowSeconds * 1000) {
      tx.set(ref, { uid, operation, windowStart: now, count: 1 });
      return true;
    }
    if (row.count >= limit.max) return false;
    tx.update(ref, { count: row.count + 1 });
    return true;
  });
  if (!allowed) {
    resourceExhausted("Too many requests. Please wait a moment and try again.");
  }
}

/* ------------------------------------------------------------------ writes - */

/**
 * Wallet access inside a transaction is split in two because Firestore
 * transactions must perform every read before any write:
 *
 *   const wallet = await readWallet(tx, uid);   // read phase
 *   ...other tx.get calls...
 *   applyLedger(tx, wallet, { ... });           // write phase
 *
 * `applyLedger` mutates `wallet.account`, so several entries can be applied to
 * the same wallet in one transaction and each sees the running balance.
 */
export interface WalletHandle {
  ref: FirebaseFirestore.DocumentReference;
  account: WalletAccount;
}

export async function readWallet(
  tx: FirebaseFirestore.Transaction,
  uid: string,
): Promise<WalletHandle> {
  const ref = db().collection(COLLECTIONS.walletAccounts).doc(uid);
  const snap = await tx.get(ref);
  const account: WalletAccount = snap.exists
    ? (snap.data() as WalletAccount)
    : {
        uid,
        balancePaise: 0,
        totalDepositedPaise: 0,
        totalSpentPaise: 0,
        pendingDepositPaise: 0,
        updatedAt: nowIso(),
      };
  return { ref, account };
}

export class InsufficientFundsError extends Error {
  readonly balancePaise: number;
  constructor(balancePaise: number) {
    super("INSUFFICIENT_FUNDS");
    this.balancePaise = balancePaise;
  }
}

export interface LedgerInput {
  uid: string;
  type: WalletTransaction["type"];
  direction: WalletTransaction["direction"];
  amountPaise: number;
  description: string;
  refId?: string;
  actor: string;
  /** Adjusts the pending-deposit counter in the same write (never below zero). */
  pendingDeltaPaise?: number;
}

/**
 * Appends one immutable ledger entry and writes the resulting balance. Throws
 * {@link InsufficientFundsError} before writing anything if a debit would
 * overdraw the wallet, which aborts the surrounding transaction.
 */
export function applyLedger(
  tx: FirebaseFirestore.Transaction,
  wallet: WalletHandle,
  input: LedgerInput,
): { balancePaise: number; txId: string } {
  if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) {
    throw new Error("Ledger amounts must be positive integer paise.");
  }
  const account = wallet.account;
  const delta = input.direction === "credit" ? input.amountPaise : -input.amountPaise;
  const balancePaise = account.balancePaise + delta;
  if (balancePaise < 0) throw new InsufficientFundsError(account.balancePaise);

  const now = nowIso();
  const txRef = db().collection(COLLECTIONS.walletTransactions).doc();
  const entry: WalletTransaction = clean({
    id: txRef.id,
    uid: input.uid,
    type: input.type,
    direction: input.direction,
    amountPaise: input.amountPaise,
    balanceAfterPaise: balancePaise,
    description: input.description,
    refId: input.refId,
    actor: input.actor,
    createdAt: now,
  }) as WalletTransaction;
  tx.set(txRef, entry);

  wallet.account = {
    ...account,
    uid: input.uid,
    balancePaise,
    totalDepositedPaise:
      input.type === "deposit"
        ? account.totalDepositedPaise + input.amountPaise
        : account.totalDepositedPaise,
    totalSpentPaise:
      input.type === "ticket_purchase" || input.type === "spin_purchase"
        ? account.totalSpentPaise + input.amountPaise
        : input.type === "refund"
          ? Math.max(0, account.totalSpentPaise - input.amountPaise)
          : account.totalSpentPaise,
    pendingDepositPaise: Math.max(0, account.pendingDepositPaise + (input.pendingDeltaPaise ?? 0)),
    updatedAt: now,
  };
  tx.set(wallet.ref, clean({ ...wallet.account }), { merge: true });

  return { balancePaise, txId: txRef.id };
}

/** Writes a non-ledger wallet change (pending counter only) in the write phase. */
export function adjustPending(
  tx: FirebaseFirestore.Transaction,
  wallet: WalletHandle,
  pendingDeltaPaise: number,
): void {
  wallet.account = {
    ...wallet.account,
    pendingDepositPaise: Math.max(0, wallet.account.pendingDepositPaise + pendingDeltaPaise),
    updatedAt: nowIso(),
  };
  tx.set(wallet.ref, clean({ ...wallet.account }), { merge: true });
}

export async function walletBalance(uid: string): Promise<number> {
  const account = await readDoc<WalletAccount>(COLLECTIONS.walletAccounts, uid);
  return account?.balancePaise ?? 0;
}

export async function notify(
  uid: string,
  type: NotificationType,
  title: string,
  body: string,
  href?: string,
): Promise<void> {
  const payload: AppNotification = clean({
    uid,
    type,
    title,
    body,
    href,
    read: false,
    createdAt: nowIso(),
  }) as AppNotification;
  await db().collection(COLLECTIONS.notifications).add(payload);
}

export async function audit(
  actor: { uid: string; fullName: string },
  action: string,
  entity: string,
  entityId: string,
  note?: string,
  before?: unknown,
  after?: unknown,
): Promise<void> {
  const entry: AdminAuditLog = clean({
    actorUid: actor.uid,
    actorName: actor.fullName,
    action,
    entity,
    entityId,
    note,
    before,
    after,
    source: "callable" as const,
    createdAt: nowIso(),
  }) as AdminAuditLog;
  await db().collection(COLLECTIONS.adminAuditLogs).add(entry);
}

/* -------------------------------------------------------------- re-exports - */

export type {
  AdminAuditLog,
  AppNotification,
  DepositRequest,
  Draw,
  DrawResult,
  PaymentQrCode,
  Prize,
  Referral,
  Reward,
  SiteSettings,
  SpinAccount,
  SpinConfig,
  Ticket,
  UserProfile,
  WalletAccount,
  WalletTransaction,
};
