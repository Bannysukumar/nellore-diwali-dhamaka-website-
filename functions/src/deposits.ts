import { onCall } from "firebase-functions/v2/https";
import { getStorage } from "firebase-admin/storage";
import { hotCallable } from "./warm.js";
import {
  CALLABLE_OPTIONS,
  COLLECTIONS,
  adjustPending,
  applyLedger,
  audit,
  clean,
  db,
  enforceRateLimit,
  notify,
  readDoc,
  readSettings,
  readWallet,
  requireUser,
  walletBalance,
} from "./firestore.js";
import {
  failedPrecondition,
  invalidArgument,
  notFound,
  requireObject,
  requireRequestId,
  requireString,
} from "./errors.js";
import type { DepositRequest, DepositStatus, PaymentQrCode } from "./domain/types.js";
import { formatPaise, hashString, isPositiveInteger, maskUtr, nowIso } from "./domain/shared.js";
import { qualifyOnActivitySafely } from "./domain/referrals.js";

/* ------------------------------------------------------------ pickPaymentQr */

export interface PickPaymentQrResponse {
  qrId: string;
  label: string;
  payeeName: string;
  upiId: string;
  appHint?: string;
  imageUrl: string;
}

/**
 * Returns the payment QR the customer should pay into.
 *
 * The client generates a random session key when the Add Money screen opens,
 * so the choice is random across sessions but stable within one: the QR never
 * changes while the customer is mid-payment. Only active codes are handed out.
 */
export const pickPaymentQr = hotCallable(async (request): Promise<PickPaymentQrResponse> => {
  await requireUser(request.auth);
  const data = requireObject<Record<string, unknown>>(request.data);
  const sessionKey = requireString(data, "sessionKey", 120);

  const snap = await db()
    .collection(COLLECTIONS.paymentQrCodes)
    .where("active", "==", true)
    .get();
  if (snap.empty) {
    failedPrecondition("No payment QR code is currently active. Please contact support.");
  }
  const active = snap.docs
    .map((d) => ({ ...(d.data() as PaymentQrCode), id: d.id }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const qr = active[hashString(sessionKey) % active.length];

  return {
    qrId: qr.id,
    label: qr.label,
    payeeName: qr.payeeName,
    upiId: qr.upiId,
    appHint: qr.appHint,
    imageUrl: qr.imageUrl,
  };
});

/* ------------------------------------------------------------ submitDeposit */

export interface SubmitDepositResponse {
  depositId: string;
  status: DepositRequest["status"];
  submittedAt: string;
}

const UTR_PATTERN = /^[A-Z0-9]{8,22}$/;

/** Screenshots must live in the caller's own private folder. */
export function isOwnScreenshotPath(path: string, uid: string): boolean {
  const prefix = `deposit-screenshots/${uid}/`;
  return path.startsWith(prefix) && !path.includes("..") && path.length > prefix.length;
}

/**
 * Records a customer-declared UPI deposit for human verification.
 *
 * Nothing is credited here: the wallet is only touched by `reviewDeposit` once
 * a finance operator has confirmed the money actually arrived. A UTR that has
 * already been used is never auto-credited — it is routed to manual review.
 */
export const submitDeposit = hotCallable(async (request): Promise<SubmitDepositResponse> => {
  const user = await requireUser(request.auth);
  const config = await readSettings();
  const data = requireObject<Record<string, unknown>>(request.data);

  const amountPaise = data.amountPaise;
  if (!isPositiveInteger(amountPaise)) invalidArgument("Enter a valid deposit amount.");
  if (amountPaise < config.minDepositPaise) {
    invalidArgument(`Minimum deposit is ${formatPaise(config.minDepositPaise)}.`);
  }
  if (amountPaise > config.maxDepositPaise) {
    invalidArgument(`Maximum deposit is ${formatPaise(config.maxDepositPaise)}.`);
  }

  const utr = requireString(data, "utr", 40).trim().toUpperCase();
  if (!UTR_PATTERN.test(utr)) {
    invalidArgument("Enter a valid UTR / reference number.");
  }

  const requestId = requireRequestId(data);
  const screenshotPath = requireString(data, "screenshotPath", 500);
  if (!isOwnScreenshotPath(screenshotPath, user.uid)) {
    invalidArgument("Upload the payment screenshot again before submitting.");
  }
  const qrId = requireString(data, "qrId", 120);

  // Idempotency: replaying the same submission returns the original request,
  // so a flaky network cannot create two deposits for one transfer.
  const replay = await readDoc<DepositRequest>(COLLECTIONS.depositRequests, requestId);
  if (replay) {
    if (replay.uid !== user.uid) invalidArgument("That request reference has already been used.");
    return { depositId: replay.id, status: replay.status, submittedAt: replay.submittedAt };
  }

  await enforceRateLimit(user.uid, "submitDeposit", { max: 5, windowSeconds: 600 });

  const [screenshotExists] = await getStorage().bucket().file(screenshotPath).exists();
  if (!screenshotExists) {
    invalidArgument("The payment screenshot was not found. Upload it again before submitting.");
  }

  const qr = await readDoc<PaymentQrCode>(COLLECTIONS.paymentQrCodes, qrId);
  if (!qr) invalidArgument("That payment QR code no longer exists.");
  if (!qr.active) failedPrecondition("That payment QR code is no longer active.");

  const duplicates = await db()
    .collection(COLLECTIONS.depositRequests)
    .where("utr", "==", utr)
    .get();
  // A customer resubmitting their own rejected UTR is a normal correction;
  // anything else sharing the UTR needs a human to look at it.
  const duplicate = duplicates.docs
    .map((d) => ({ ...(d.data() as DepositRequest), id: d.id }))
    .find((d) => d.uid !== user.uid || d.status !== "rejected");

  const submittedAt = nowIso();
  const deposit = clean({
    id: requestId,
    uid: user.uid,
    userDisplayName: user.fullName,
    userPhoneMasked: user.phoneMasked,
    amountPaise,
    qrId: qr.id,
    qrLabel: qr.label,
    qrUpiId: qr.upiId,
    utr,
    screenshotPath,
    status: duplicate ? ("requires_review" as const) : ("pending" as const),
    reviewNote: duplicate
      ? `UTR also used on request ${duplicate.id}. Manual verification required.`
      : undefined,
    submittedAt,
  }) as DepositRequest;

  const created = await db().runTransaction(async (tx) => {
    const depositRef = db().collection(COLLECTIONS.depositRequests).doc(requestId);
    const existingDeposit = await tx.get(depositRef);
    const wallet = await readWallet(tx, user.uid);
    if (existingDeposit.exists) return false; // lost a race — the winner already wrote it

    tx.set(depositRef, deposit);
    adjustPending(tx, wallet, amountPaise);
    return true;
  });

  const stored = await readDoc<DepositRequest>(COLLECTIONS.depositRequests, requestId);
  if (created) {
    await notify(
      user.uid,
      "deposit_submitted",
      "Deposit submitted",
      `Request ${requestId} for ${formatPaise(amountPaise)} is awaiting verification (UTR ${maskUtr(utr)}).`,
      "/dashboard/wallet",
    );
  }
  return {
    depositId: requestId,
    status: stored?.status ?? deposit.status,
    submittedAt: stored?.submittedAt ?? submittedAt,
  };
});

/* ------------------------------------------------------------ reviewDeposit */

export interface ReviewDepositResponse {
  depositId: string;
  status: DepositStatus;
  creditedPaise: number;
  balancePaise: number;
}

const OPEN_STATUSES: DepositStatus[] = ["pending", "requires_review"];

/**
 * Finance-side deposit review.
 *
 * Every decision re-reads the deposit inside its transaction and only acts on
 * an open (pending / requires-review) request, so approving twice, rejecting an
 * approved deposit, or racing an approve against a reject can never credit the
 * wallet twice or decrement the pending total twice.
 */
export const reviewDeposit = onCall<unknown>(CALLABLE_OPTIONS, async (request): Promise<ReviewDepositResponse> => {
  const admin = await requireUser(request.auth, { admin: true });
  const data = requireObject<Record<string, unknown>>(request.data);
  const depositId = requireString(data, "depositId", 120);
  const decision = requireString(data, "decision", 30);
  if (!["approve", "reject", "requires_review"].includes(decision)) {
    invalidArgument("Unknown review decision.");
  }
  const note = typeof data.note === "string" ? data.note.trim().slice(0, 500) || undefined : undefined;
  const reason =
    typeof data.reason === "string" ? data.reason.trim().slice(0, 500) || undefined : undefined;
  if (decision === "reject" && !reason) {
    invalidArgument("Give the customer a reason for the rejection.");
  }
  const verifiedRaw = data.verifiedAmountPaise;
  if (verifiedRaw !== undefined && !isPositiveInteger(verifiedRaw)) {
    invalidArgument("Verified amount must be a positive amount.");
  }

  const depositRef = db().collection(COLLECTIONS.depositRequests).doc(depositId);
  const reviewedAt = nowIso();

  const outcome = await db().runTransaction(async (tx) => {
    // ---- read phase -------------------------------------------------------
    const snap = await tx.get(depositRef);
    if (!snap.exists) notFound("Deposit request not found.");
    const deposit = { ...(snap.data() as DepositRequest), id: snap.id };
    const wallet = await readWallet(tx, deposit.uid);
    const utrRef = db().collection(COLLECTIONS.creditedUtrs).doc(deposit.utr);
    const utrClaim = decision === "approve" ? await tx.get(utrRef) : null;

    if (!OPEN_STATUSES.includes(deposit.status)) {
      return {
        deposit,
        changed: false,
        status: deposit.status,
        creditedPaise: 0,
        balancePaise: wallet.account.balancePaise,
      };
    }

    // ---- write phase ------------------------------------------------------
    if (decision === "approve") {
      if (utrClaim?.exists && utrClaim.get("depositId") !== deposit.id) {
        failedPrecondition(
          `UTR ${maskUtr(deposit.utr)} was already credited on request ${utrClaim.get("depositId")}. Reject this request instead.`,
        );
      }
      const verified = (verifiedRaw as number | undefined) ?? deposit.amountPaise;
      const { balancePaise, txId } = applyLedger(tx, wallet, {
        uid: deposit.uid,
        type: "deposit",
        direction: "credit",
        amountPaise: verified,
        description: `UPI deposit approved (UTR ${maskUtr(deposit.utr)})`,
        refId: deposit.id,
        actor: admin.uid,
        pendingDeltaPaise: -deposit.amountPaise,
      });
      tx.update(
        depositRef,
        clean({
          status: "approved",
          reviewedAt,
          reviewedBy: admin.uid,
          reviewNote: note ?? deposit.reviewNote,
          creditedTransactionId: txId,
          verifiedAmountPaise: verified,
        }),
      );
      tx.set(utrRef, { depositId: deposit.id, uid: deposit.uid, creditedAt: reviewedAt, creditedBy: admin.uid });
      return { deposit, changed: true, status: "approved" as const, creditedPaise: verified, balancePaise };
    }

    if (decision === "reject") {
      adjustPending(tx, wallet, -deposit.amountPaise);
      tx.update(
        depositRef,
        clean({
          status: "rejected",
          reviewedAt,
          reviewedBy: admin.uid,
          reviewNote: note ?? deposit.reviewNote,
          rejectionReason: reason,
        }),
      );
      return {
        deposit,
        changed: true,
        status: "rejected" as const,
        creditedPaise: 0,
        balancePaise: wallet.account.balancePaise,
      };
    }

    tx.update(
      depositRef,
      clean({
        status: "requires_review",
        reviewNote: note ?? "Flagged for additional review.",
        reviewedBy: admin.uid,
      }),
    );
    return {
      deposit,
      changed: true,
      status: "requires_review" as const,
      creditedPaise: 0,
      balancePaise: wallet.account.balancePaise,
    };
  });

  const { deposit } = outcome;
  if (outcome.changed) {
    if (outcome.status === "approved") {
      await notify(
        deposit.uid,
        "deposit_approved",
        "Deposit approved",
        `${formatPaise(outcome.creditedPaise)} has been added to your wallet.`,
        "/dashboard/wallet",
      );
      await audit(admin, "deposit.approve", COLLECTIONS.depositRequests, deposit.id, note, {
        status: deposit.status,
        amountPaise: deposit.amountPaise,
      }, { status: "approved", creditedPaise: outcome.creditedPaise });
      await qualifyOnActivitySafely(deposit.uid, "verified_deposit");
    } else if (outcome.status === "rejected") {
      await notify(
        deposit.uid,
        "deposit_rejected",
        "Deposit rejected",
        `${reason} You can submit a new request with the correct details.`,
        "/dashboard/add-money",
      );
      await audit(admin, "deposit.reject", COLLECTIONS.depositRequests, deposit.id, reason, {
        status: deposit.status,
      }, { status: "rejected" });
    } else {
      await audit(admin, "deposit.flag", COLLECTIONS.depositRequests, deposit.id, note);
    }
  }

  return {
    depositId: deposit.id,
    status: outcome.status,
    creditedPaise: outcome.creditedPaise,
    balancePaise: outcome.changed ? outcome.balancePaise : await walletBalance(deposit.uid),
  };
});
