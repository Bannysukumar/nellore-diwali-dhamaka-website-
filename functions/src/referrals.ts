import { onCall } from "firebase-functions/v2/https";
import {
  CALLABLE_OPTIONS,
  COLLECTIONS,
  audit,
  db,
  enforceRateLimit,
  notify,
  readSpinConfig,
  requireUser,
  type SpinAccount,
} from "./firestore.js";
import {
  failedPrecondition,
  invalidArgument,
  notFound,
  permissionDenied,
  requireObject,
  requireString,
} from "./errors.js";
import type { Referral } from "./domain/types.js";
import { nowIso } from "./domain/shared.js";
import {
  attachReferral,
  qualifyOnActivity,
  type AttachResult,
  type QualifyResult,
  type ReferralTrigger,
} from "./domain/referrals.js";

/* ----------------------------------------------------------- claimReferral */

/**
 * Attaches a referral code to the caller's (new) account. Registration already
 * does this inside `ensureUserProfile`; this callable exists for a customer who
 * opened an invite link right after signing up. Self-referral, unknown codes,
 * a second referrer and old accounts are all rejected with a reason.
 */
export const claimReferral = onCall<unknown>(CALLABLE_OPTIONS, async (request): Promise<AttachResult> => {
  const user = await requireUser(request.auth);
  await enforceRateLimit(user.uid, "claimReferral", { max: 5, windowSeconds: 3600 });
  const data = requireObject<Record<string, unknown>>(request.data);
  const code = requireString(data, "code", 40);
  const result = await attachReferral(user, code);
  if (result.status === "recorded") {
    await qualifyOnActivity(user.uid, "signup").catch((error) =>
      console.error("signup qualification failed", error),
    );
  }
  return result;
});

/* --------------------------------------------------------- qualifyReferral */

/**
 * Lets a referred user retry settlement of their own referral. Only the
 * referee may trigger this, and the server re-verifies that the activity
 * actually happened — the caller's claim alone is never enough.
 */
export const qualifyReferral = onCall<unknown>(CALLABLE_OPTIONS, async (request): Promise<QualifyResult> => {
  const user = await requireUser(request.auth);
  const data = requireObject<Record<string, unknown>>(request.data);
  const refereeUid = requireString(data, "refereeUid", 120);
  const trigger = requireString(data, "trigger", 40) as ReferralTrigger;
  if (refereeUid !== user.uid) {
    permissionDenied("You can only qualify your own referral.");
  }
  if (!["signup", "verified_deposit", "ticket_purchase"].includes(trigger)) {
    invalidArgument("Unsupported referral trigger.");
  }
  if (trigger === "verified_deposit") {
    const approved = await db()
      .collection(COLLECTIONS.depositRequests)
      .where("uid", "==", user.uid)
      .where("status", "==", "approved")
      .limit(1)
      .get();
    if (approved.empty) return { qualified: false, spinsGranted: 0, reason: "No verified deposit yet." };
  }
  if (trigger === "ticket_purchase") {
    const orders = await db()
      .collection(COLLECTIONS.orders)
      .where("uid", "==", user.uid)
      .where("status", "==", "completed")
      .limit(1)
      .get();
    if (orders.empty) return { qualified: false, spinsGranted: 0, reason: "No completed purchase yet." };
  }
  return qualifyOnActivity(user.uid, trigger);
});

/* -------------------------------------------------------- moderateReferral */

export interface ModerateReferralResponse {
  referralId: string;
  status: Referral["status"];
  spinsGranted: number;
}

/**
 * Administrator override for a pending referral: qualify it (granting the
 * configured spins once) or reject it as abusive. Already-settled referrals are
 * never re-rewarded.
 */
export const moderateReferral = onCall<unknown>(
  CALLABLE_OPTIONS,
  async (request): Promise<ModerateReferralResponse> => {
    const admin = await requireUser(request.auth, { admin: true });
    const data = requireObject<Record<string, unknown>>(request.data);
    const referralId = requireString(data, "referralId", 260);
    const decision = requireString(data, "decision", 20);
    const note = typeof data.note === "string" ? data.note.trim().slice(0, 500) : "";
    if (decision !== "qualify" && decision !== "reject") invalidArgument("Unknown decision.");
    if (decision === "reject" && note.length < 4) invalidArgument("Give a reason for rejecting this referral.");

    const config = await readSpinConfig();
    const referralRef = db().collection(COLLECTIONS.referrals).doc(referralId);

    const outcome = await db().runTransaction(async (tx) => {
      const snap = await tx.get(referralRef);
      if (!snap.exists) notFound("Referral not found.");
      const referral = snap.data() as Referral;
      const accountRef = db().collection(COLLECTIONS.spinAccounts).doc(referral.referrerUid);
      const accountSnap = await tx.get(accountRef);
      if (referral.status !== "pending") {
        failedPrecondition(`This referral is already ${referral.status}.`);
      }
      const now = nowIso();
      if (decision === "reject") {
        tx.update(referralRef, { status: "rejected", note, reviewedBy: admin.uid, reviewedAt: now });
        return { referral, spins: 0 };
      }
      const account: SpinAccount = accountSnap.exists
        ? (accountSnap.data() as SpinAccount)
        : { uid: referral.referrerUid, availableSpins: 0, totalEarned: 0, totalUsed: 0, updatedAt: now };
      const spins = Math.min(
        config.spinsPerReferral,
        Math.max(0, config.maxSpinsPerUser - account.availableSpins),
      );
      tx.update(referralRef, {
        status: "qualified",
        qualifiedAt: now,
        rewardGrantedAt: now,
        rewardSpins: spins,
        note: note || "Qualified by an administrator.",
        reviewedBy: admin.uid,
        reviewedAt: now,
      });
      tx.set(
        accountRef,
        {
          uid: referral.referrerUid,
          availableSpins: account.availableSpins + spins,
          totalEarned: account.totalEarned + spins,
          totalUsed: account.totalUsed,
          updatedAt: now,
        },
        { merge: true },
      );
      return { referral, spins };
    });

    await audit(
      admin,
      decision === "qualify" ? "referral.qualify" : "referral.reject",
      COLLECTIONS.referrals,
      referralId,
      note || undefined,
      { status: "pending" },
      { status: decision === "qualify" ? "qualified" : "rejected", spins: outcome.spins },
    );
    if (decision === "qualify" && outcome.spins > 0) {
      await notify(
        outcome.referral.referrerUid,
        "referral_reward",
        "Referral reward unlocked",
        `You earned ${outcome.spins} free spin(s) from a qualified referral.`,
        "/dashboard/spin",
      );
    }
    return {
      referralId,
      status: decision === "qualify" ? "qualified" : "rejected",
      spinsGranted: outcome.spins,
    };
  },
);
