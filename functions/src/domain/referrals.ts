import { COLLECTIONS, clean, db, notify, readDoc, type SpinAccount } from "../firestore.js";
import type {
  Referral,
  ReferralQualification,
  ReferralTrigger,
  SpinConfig,
  UserProfile,
} from "../domain/types.js";
import { nowIso } from "../domain/shared.js";

export type { ReferralTrigger };

export interface QualifyResult {
  qualified: boolean;
  spinsGranted: number;
  reason?: string;
}

export const DEFAULT_REFERRAL_QUALIFICATION: ReferralQualification = "signup";
export const DEFAULT_CLAIM_WINDOW_HOURS = 24;

/** Later steps imply the earlier ones (a purchase needs a funded wallet, which needs a signup). */
const STEP_RANK: Record<ReferralQualification, number> = {
  signup: 0,
  verified_deposit: 1,
  ticket_purchase: 2,
};

export function triggerSatisfies(trigger: ReferralTrigger, required: ReferralQualification): boolean {
  return STEP_RANK[trigger] >= STEP_RANK[required];
}

export function campaignBlocked(config: SpinConfig, at = Date.now()): string | null {
  if (config.campaignStart && at < new Date(config.campaignStart).getTime()) {
    return "Campaign has not started.";
  }
  if (config.campaignEnd && at > new Date(config.campaignEnd).getTime()) {
    return "Campaign has ended.";
  }
  return null;
}

async function spinConfigOrNull(): Promise<SpinConfig | null> {
  return readDoc<SpinConfig>(COLLECTIONS.siteSettings, "spin");
}

/* ------------------------------------------------------------ attribution */

export interface AttachResult {
  referralId: string | null;
  status: "recorded" | "rejected";
  reason?: string;
}

/**
 * Records that `referee` was referred by the owner of `rawCode`.
 *
 * Attribution is permanent and single: once `referredByUid` is set it is never
 * replaced, so an account cannot be "re-referred" by a second person. Codes can
 * only be attached to a genuinely new account (inside the claim window).
 * Nothing is rewarded here.
 */
export async function attachReferral(referee: UserProfile, rawCode: string): Promise<AttachResult> {
  const code = rawCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,20}$/.test(code)) {
    return { referralId: null, status: "rejected", reason: "Invalid referral code." };
  }
  if (referee.referredByUid) {
    return { referralId: null, status: "rejected", reason: "A referral is already recorded for this account." };
  }
  if (!referee.referralEligible) {
    return { referralId: null, status: "rejected", reason: "Account is not referral eligible." };
  }
  if (code === referee.referralCode) {
    return { referralId: null, status: "rejected", reason: "Self-referral is not allowed." };
  }

  const config = await spinConfigOrNull();
  const windowHours = config?.referralClaimWindowHours ?? DEFAULT_CLAIM_WINDOW_HOURS;
  const ageMs = Date.now() - new Date(referee.createdAt).getTime();
  if (windowHours >= 0 && ageMs > windowHours * 3_600_000) {
    return {
      referralId: null,
      status: "rejected",
      reason: "Referral codes can only be added when an account is first created.",
    };
  }

  const referrers = await db()
    .collection(COLLECTIONS.users)
    .where("referralCode", "==", code)
    .limit(1)
    .get();
  if (referrers.empty) {
    return { referralId: null, status: "rejected", reason: "Unknown referral code." };
  }
  const referrer = { ...(referrers.docs[0].data() as UserProfile), uid: referrers.docs[0].id };
  if (referrer.uid === referee.uid) {
    return { referralId: null, status: "rejected", reason: "Self-referral is not allowed." };
  }
  if (referrer.status !== "active") {
    return { referralId: null, status: "rejected", reason: "That referral code is not active." };
  }
  if (referrer.phone && referrer.phone === referee.phone) {
    return { referralId: null, status: "rejected", reason: "Self-referral is not allowed." };
  }

  const id = `${referrer.uid}_${referee.uid}`;
  const required = config?.referralQualification ?? DEFAULT_REFERRAL_QUALIFICATION;
  const referral: Referral = clean({
    id,
    referrerUid: referrer.uid,
    referrerName: referrer.fullName,
    refereeUid: referee.uid,
    refereePhoneMasked: referee.phoneMasked,
    code,
    status: "pending" as const,
    rewardSpins: 0,
    note: `Awaiting qualification (${required.replace("_", " ")}).`,
    createdAt: nowIso(),
  }) as Referral;

  const recorded = await db().runTransaction(async (tx) => {
    const refereeRef = db().collection(COLLECTIONS.users).doc(referee.uid);
    const referralRef = db().collection(COLLECTIONS.referrals).doc(id);
    const [freshReferee, existing] = await Promise.all([tx.get(refereeRef), tx.get(referralRef)]);
    if ((freshReferee.data() as UserProfile | undefined)?.referredByUid || existing.exists) {
      return false;
    }
    tx.set(referralRef, referral);
    tx.set(
      refereeRef,
      { referredByUid: referrer.uid, referredByCode: code, updatedAt: nowIso() },
      { merge: true },
    );
    return true;
  });
  if (!recorded) {
    return { referralId: null, status: "rejected", reason: "A referral is already recorded for this account." };
  }

  await notify(
    referrer.uid,
    "referral_reward",
    "New referral signup",
    "Someone joined with your referral code. Your reward unlocks once they qualify.",
    "/dashboard/referrals",
  );
  return { referralId: id, status: "recorded" };
}

/* ---------------------------------------------------------- qualification */

/**
 * Called when a referred user performs an activity. Grants the configured
 * spins exactly once per referral when the activity satisfies the configured
 * qualification step, honouring the referrer caps. Everything that decides the
 * reward runs in one transaction keyed on the referral document, so a
 * double-fired trigger cannot double-credit.
 */
export async function qualifyOnActivity(
  refereeUid: string,
  trigger: ReferralTrigger,
): Promise<QualifyResult> {
  const user = await readDoc<UserProfile>(COLLECTIONS.users, refereeUid);
  if (!user?.referredByUid) return { qualified: false, spinsGranted: 0, reason: "No referrer." };
  if (user.status !== "active") {
    return { qualified: false, spinsGranted: 0, reason: "Referred account is not active." };
  }
  const referrerUid = user.referredByUid;

  const config = await spinConfigOrNull();
  if (!config) return { qualified: false, spinsGranted: 0, reason: "Referral rewards are not configured." };
  const required = config.referralQualification ?? DEFAULT_REFERRAL_QUALIFICATION;
  if (!triggerSatisfies(trigger, required)) {
    return { qualified: false, spinsGranted: 0, reason: `Requires ${required.replace("_", " ")}.` };
  }
  const campaignReason = campaignBlocked(config);
  if (campaignReason) return { qualified: false, spinsGranted: 0, reason: campaignReason };

  const referrer = await readDoc<UserProfile>(COLLECTIONS.users, referrerUid);
  if (!referrer || referrer.status !== "active") {
    return { qualified: false, spinsGranted: 0, reason: "Referrer is not active." };
  }

  const referralRef = db().collection(COLLECTIONS.referrals).doc(`${referrerUid}_${refereeUid}`);
  const referrerAccountRef = db().collection(COLLECTIONS.spinAccounts).doc(referrerUid);

  const result = await db().runTransaction(async (tx): Promise<QualifyResult> => {
    const referralSnap = await tx.get(referralRef);
    if (!referralSnap.exists) {
      return { qualified: false, spinsGranted: 0, reason: "Referral not recorded." };
    }
    const referral = referralSnap.data() as Referral;
    if (referral.status !== "pending") {
      return { qualified: false, spinsGranted: 0, reason: `Referral is already ${referral.status}.` };
    }

    const qualifiedSnap = await tx.get(
      db()
        .collection(COLLECTIONS.referrals)
        .where("referrerUid", "==", referrerUid)
        .where("status", "==", "qualified"),
    );
    const accountSnap = await tx.get(referrerAccountRef);

    const existing = qualifiedSnap.docs.map((d) => d.data() as Referral);
    if (existing.length >= config.maxReferralsPerAccount) {
      return { qualified: false, spinsGranted: 0, reason: "Referrer cap reached." };
    }
    const totalSpinsGranted = existing.reduce((sum, r) => sum + (r.rewardSpins ?? 0), 0);
    if (totalSpinsGranted >= config.maxRewardsPerReferrer) {
      return { qualified: false, spinsGranted: 0, reason: "Referrer reward cap reached." };
    }

    const account: SpinAccount = accountSnap.exists
      ? (accountSnap.data() as SpinAccount)
      : { uid: referrerUid, availableSpins: 0, totalEarned: 0, totalUsed: 0, updatedAt: nowIso() };

    const now = nowIso();
    const spins = Math.min(
      config.spinsPerReferral,
      Math.max(0, config.maxRewardsPerReferrer - totalSpinsGranted),
      Math.max(0, config.maxSpinsPerUser - account.availableSpins),
    );

    tx.set(
      referralRef,
      {
        status: "qualified",
        qualifiedAt: now,
        rewardGrantedAt: now,
        rewardSpins: spins,
        note:
          spins > 0
            ? `Qualified via ${trigger.replace("_", " ")}.`
            : `Qualified via ${trigger.replace("_", " ")}; no spins added (spin balance cap reached).`,
      },
      { merge: true },
    );
    tx.set(
      referrerAccountRef,
      {
        uid: referrerUid,
        availableSpins: account.availableSpins + spins,
        totalEarned: account.totalEarned + spins,
        totalUsed: account.totalUsed,
        updatedAt: now,
      },
      { merge: true },
    );
    return { qualified: true, spinsGranted: spins };
  });

  if (result.qualified && result.spinsGranted > 0) {
    await notify(
      referrerUid,
      "referral_reward",
      "Referral reward unlocked",
      `You earned ${result.spinsGranted} free spin(s) from a qualified referral.`,
      "/dashboard/spin",
    );
  }
  return result;
}

/**
 * Referral settlement runs after the primary operation (deposit approval,
 * checkout, signup) has committed. A failure here must never make that
 * operation look failed to the caller, so it is logged instead of thrown.
 */
export async function qualifyOnActivitySafely(
  refereeUid: string,
  trigger: ReferralTrigger,
): Promise<QualifyResult> {
  try {
    return await qualifyOnActivity(refereeUid, trigger);
  } catch (error) {
    console.error(`referral qualification failed for ${refereeUid} (${trigger})`, error);
    return { qualified: false, spinsGranted: 0, reason: "Referral processing failed." };
  }
}
