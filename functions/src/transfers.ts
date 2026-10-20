import { getAuth } from "firebase-admin/auth";
import { onCall, type CallableRequest } from "firebase-functions/v2/https";
import {
  CALLABLE_OPTIONS,
  COLLECTIONS,
  InsufficientFundsError,
  applyLedger,
  clean,
  db,
  enforceRateLimit,
  notify,
  readWallet,
  requireUser,
} from "./firestore.js";
import {
  failedPrecondition,
  invalidArgument,
  optionalString,
  permissionDenied,
  requireInteger,
  requireObject,
  requireRequestId,
  requireString,
} from "./errors.js";
import { formatPaise, nowIso } from "./domain/shared.js";
import type { UserProfile, WalletTransfer } from "./domain/types.js";
import { maskPhone } from "./profile.js";

/** ₹1 minimum and ₹50,000 maximum per transfer. */
export const MIN_TRANSFER_PAISE = 100;
export const MAX_TRANSFER_PAISE = 5_000_000;

/** Accepts 10-digit Indian mobile numbers with or without +91 / 0 prefixes. */
export function normaliseIndianPhone(input: string): string | null {
  let digits = input.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
}

/** "Sanjeevaraju Raju" → "Sanjeevaraju R." — enough to confirm, not enough to harvest. */
export function maskName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? "Customer";
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

type Profile = UserProfile & { id: string };

async function isAdminAccount(uid: string, profile?: Pick<UserProfile, "role">): Promise<boolean> {
  if (profile?.role === "admin") return true;
  const user = await getAuth().getUser(uid);
  return user.customClaims?.role === "admin";
}

/**
 * Customers only: administrators move money with `adjustWallet`, and admin
 * accounts can never receive a transfer.
 */
async function requireCustomerSender(auth: CallableRequest["auth"]): Promise<Profile> {
  const sender = await requireUser(auth);
  if (auth?.token.role === "admin" || sender.role === "admin") {
    permissionDenied("Administrator accounts cannot send wallet transfers.");
  }
  return sender;
}

async function resolveRecipient(phoneInput: string, senderUid: string): Promise<Profile> {
  const phone = normaliseIndianPhone(phoneInput);
  if (!phone) invalidArgument("Enter a valid 10-digit Indian mobile number.");

  const snap = await db().collection(COLLECTIONS.users).where("phone", "==", phone).limit(1).get();
  const doc = snap.docs[0];
  if (!doc) failedPrecondition("No customer account is registered with that mobile number.");
  const recipient = { ...(doc.data() as UserProfile), id: doc.id } as Profile;

  if (recipient.id === senderUid) failedPrecondition("You cannot transfer money to your own account.");
  if (await isAdminAccount(recipient.id, recipient)) {
    failedPrecondition("Transfers to administrator accounts are not allowed.");
  }
  if (recipient.status !== "active") {
    failedPrecondition("That account cannot receive transfers right now.");
  }
  return recipient;
}

export interface TransferRecipientResponse {
  maskedName: string;
  phoneMasked: string;
}

/** Lets the sender confirm who a number belongs to before sending money. */
export const findTransferRecipient = onCall<unknown>(
  CALLABLE_OPTIONS,
  async (request): Promise<TransferRecipientResponse> => {
    const sender = await requireCustomerSender(request.auth);
    const data = requireObject<Record<string, unknown>>(request.data);
    const phone = requireString(data, "phone", 20);
    await enforceRateLimit(sender.uid, "findTransferRecipient", { max: 30, windowSeconds: 600 });
    const recipient = await resolveRecipient(phone, sender.uid);
    return { maskedName: maskName(recipient.fullName), phoneMasked: maskPhone(recipient.phone) };
  },
);

export interface TransferFundsResponse {
  transferId: string;
  amountPaise: number;
  balancePaise: number;
  recipientName: string;
  createdAt: string;
}

/**
 * Moves money between two customer wallets. The sender's debit and the
 * recipient's credit are two ledger entries in one transaction, so the money
 * is never created, lost or half-moved. The transfer id derives from
 * `requestId`, so a retried request is applied at most once.
 */
export const transferFunds = onCall<unknown>(CALLABLE_OPTIONS, async (request): Promise<TransferFundsResponse> => {
  const sender = await requireCustomerSender(request.auth);
  const data = requireObject<Record<string, unknown>>(request.data);
  const requestId = requireRequestId(data);
  const phone = requireString(data, "toPhone", 20);
  const amountPaise = requireInteger(data, "amountPaise", { min: MIN_TRANSFER_PAISE, max: MAX_TRANSFER_PAISE });
  const note = optionalString(data, "note", 140)?.trim() || undefined;

  const transferRef = db().collection(COLLECTIONS.walletTransfers).doc(`trf_${sender.uid.slice(0, 12)}_${requestId}`);
  const replay = await transferRef.get();
  if (replay.exists) {
    const row = replay.data() as WalletTransfer;
    return {
      transferId: row.id,
      amountPaise: row.amountPaise,
      balancePaise: row.fromBalanceAfterPaise,
      recipientName: maskName(row.toName),
      createdAt: row.createdAt,
    };
  }

  await enforceRateLimit(sender.uid, "transferFunds", { max: 10, windowSeconds: 3600 });
  const recipient = await resolveRecipient(phone, sender.uid);
  const createdAt = nowIso();

  let transfer: WalletTransfer;
  try {
    transfer = await db().runTransaction(async (tx) => {
      const existing = await tx.get(transferRef);
      if (existing.exists) return existing.data() as WalletTransfer;
      const from = await readWallet(tx, sender.uid);
      const to = await readWallet(tx, recipient.id);

      const debit = applyLedger(tx, from, {
        uid: sender.uid,
        type: "transfer_out",
        direction: "debit",
        amountPaise,
        description: `Transfer to ${maskName(recipient.fullName)} (${maskPhone(recipient.phone)})${note ? ` — ${note}` : ""}`,
        refId: transferRef.id,
        actor: sender.uid,
      });
      const credit = applyLedger(tx, to, {
        uid: recipient.id,
        type: "transfer_in",
        direction: "credit",
        amountPaise,
        description: `Transfer from ${maskName(sender.fullName)} (${maskPhone(sender.phone)})${note ? ` — ${note}` : ""}`,
        refId: transferRef.id,
        actor: sender.uid,
      });

      const row: WalletTransfer = clean({
        id: transferRef.id,
        fromUid: sender.uid,
        fromName: sender.fullName,
        fromPhone: sender.phone,
        toUid: recipient.id,
        toName: recipient.fullName,
        toPhone: recipient.phone,
        amountPaise,
        note,
        status: "completed" as const,
        fromBalanceAfterPaise: debit.balancePaise,
        toBalanceAfterPaise: credit.balancePaise,
        requestId,
        createdAt,
      }) as WalletTransfer;
      tx.set(transferRef, row);
      return row;
    });
  } catch (error) {
    if (error instanceof InsufficientFundsError) {
      failedPrecondition(
        `Insufficient wallet balance. You tried to send ${formatPaise(amountPaise)} but have ${formatPaise(error.balancePaise)}.`,
      );
    }
    throw error;
  }

  if (transfer.createdAt === createdAt) {
    await Promise.all([
      notify(
        sender.uid,
        "system",
        "Transfer sent",
        `You sent ${formatPaise(amountPaise)} to ${maskName(recipient.fullName)}. New balance: ${formatPaise(transfer.fromBalanceAfterPaise)}.`,
        "/dashboard/wallet",
      ),
      notify(
        recipient.id,
        "system",
        "Money received",
        `${maskName(sender.fullName)} sent you ${formatPaise(amountPaise)}.${note ? ` Note: ${note}` : ""}`,
        "/dashboard/wallet",
      ),
    ]);
  }

  return {
    transferId: transfer.id,
    amountPaise: transfer.amountPaise,
    balancePaise: transfer.fromBalanceAfterPaise,
    recipientName: maskName(transfer.toName),
    createdAt: transfer.createdAt,
  };
});
