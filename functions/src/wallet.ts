import { onCall } from "firebase-functions/v2/https";
import {
  CALLABLE_OPTIONS,
  COLLECTIONS,
  InsufficientFundsError,
  applyLedger,
  audit,
  db,
  enforceRateLimit,
  notify,
  readWallet,
  requireUser,
} from "./firestore.js";
import {
  failedPrecondition,
  invalidArgument,
  requireInteger,
  requireObject,
  requireRequestId,
  requireString,
} from "./errors.js";
import { formatPaise, nowIso } from "./domain/shared.js";

/** ₹1,00,000 — upper bound for a single adjustment or a set balance. */
export const MAX_ADJUSTMENT_PAISE = 10_000_000;

export type AdjustWalletMode = "credit" | "debit" | "set";

export interface AdjustWalletResponse {
  uid: string;
  mode: AdjustWalletMode;
  deltaPaise: number;
  balancePaise: number;
}

/**
 * Administrator correction of a customer's wallet balance.
 *
 * Every change is an `adjustment` ledger entry with the admin as actor and a
 * mandatory reason, so the balance always equals the sum of the ledger. `set`
 * computes the difference here from the balance read inside the transaction.
 * The adjustment id is derived from `requestId`, so a retried request is
 * applied at most once.
 */
export const adjustWallet = onCall<unknown>(CALLABLE_OPTIONS, async (request): Promise<AdjustWalletResponse> => {
  const admin = await requireUser(request.auth, { admin: true });
  const data = requireObject<Record<string, unknown>>(request.data);
  const requestId = requireRequestId(data);
  const uid = requireString(data, "uid", 128);
  const mode = requireString(data, "mode", 10) as AdjustWalletMode;
  if (!["credit", "debit", "set"].includes(mode)) invalidArgument("Mode must be credit, debit or set.");
  const amountPaise = requireInteger(data, "amountPaise", {
    min: mode === "set" ? 0 : 1,
    max: MAX_ADJUSTMENT_PAISE,
  });
  const reason = requireString(data, "reason", 300).trim();
  if (reason.length < 3) invalidArgument("Write a reason of at least 3 characters.");

  await enforceRateLimit(admin.uid, "adjustWallet", { max: 30, windowSeconds: 60 });

  const userSnap = await db().collection(COLLECTIONS.users).doc(uid).get();
  if (!userSnap.exists) failedPrecondition("That customer does not exist.");

  const adjustmentRef = db().collection(COLLECTIONS.walletAdjustments).doc(`adj_${requestId}`);

  let outcome: { deltaPaise: number; beforePaise: number; balancePaise: number; replay: boolean };
  try {
    outcome = await db().runTransaction(async (tx) => {
      const existing = await tx.get(adjustmentRef);
      const wallet = await readWallet(tx, uid);
      if (existing.exists) {
        const row = existing.data() as { uid: string; deltaPaise: number; beforePaise: number; balancePaise: number };
        if (row.uid !== uid) failedPrecondition("That request id was already used for another customer.");
        return { ...row, replay: true };
      }

      const beforePaise = wallet.account.balancePaise;
      const deltaPaise =
        mode === "credit" ? amountPaise : mode === "debit" ? -amountPaise : amountPaise - beforePaise;
      if (deltaPaise === 0) failedPrecondition(`The balance is already ${formatPaise(beforePaise)}.`);

      const { balancePaise } = applyLedger(tx, wallet, {
        uid,
        type: "adjustment",
        direction: deltaPaise > 0 ? "credit" : "debit",
        amountPaise: Math.abs(deltaPaise),
        description: `Balance adjustment — ${reason}`,
        refId: adjustmentRef.id,
        actor: admin.uid,
      });

      tx.set(adjustmentRef, {
        uid,
        mode,
        amountPaise,
        deltaPaise,
        beforePaise,
        balancePaise,
        reason,
        actorUid: admin.uid,
        actorName: admin.fullName,
        requestId,
        createdAt: nowIso(),
      });
      return { deltaPaise, beforePaise, balancePaise, replay: false };
    });
  } catch (error) {
    if (error instanceof InsufficientFundsError) {
      failedPrecondition(
        `The customer has only ${formatPaise(error.balancePaise)}; a debit cannot take the balance below zero.`,
      );
    }
    throw error;
  }

  if (!outcome.replay) {
    await audit(
      admin,
      `wallet.${mode}`,
      COLLECTIONS.walletAccounts,
      uid,
      `${outcome.deltaPaise > 0 ? "+" : "−"}${formatPaise(Math.abs(outcome.deltaPaise))} → ${formatPaise(outcome.balancePaise)}. Reason: ${reason}`,
      { balancePaise: outcome.beforePaise },
      { balancePaise: outcome.balancePaise },
    );
    await notify(
      uid,
      "system",
      "Wallet balance updated",
      `${outcome.deltaPaise > 0 ? "Credited" : "Debited"} ${formatPaise(Math.abs(outcome.deltaPaise))}. New balance: ${formatPaise(outcome.balancePaise)}.`,
      "/dashboard/wallet",
    );
  }

  return { uid, mode, deltaPaise: outcome.deltaPaise, balancePaise: outcome.balancePaise };
});
