import { randomInt } from "node:crypto";
import { getAuth } from "firebase-admin/auth";
import { onCall } from "firebase-functions/v2/https";
import {
  CALLABLE_OPTIONS,
  COLLECTIONS,
  clean,
  db,
  enforceRateLimit,
  notify,
  readDoc,
  requireUser,
} from "./firestore.js";
import { invalidArgument, requireObject, unauthenticated } from "./errors.js";
import type { SpinAccount, UserProfile, WalletAccount } from "./domain/types.js";
import { nowIso } from "./domain/shared.js";
import { attachReferral, qualifyOnActivitySafely } from "./domain/referrals.js";

/**
 * Creates or refreshes the caller's profile document.
 *
 * Phone numbers are never trusted from the payload: they come from the verified
 * Firebase Auth token. The referral code is generated server-side. The `role`
 * field is a display mirror of the `role` custom claim read from the Auth user
 * record (not the possibly stale ID token); it is never taken from the payload
 * and never grants access by itself (see `setAdminClaim` in `src/admin.ts`).
 */

async function claimRole(uid: string): Promise<UserProfile["role"]> {
  const user = await getAuth().getUser(uid);
  return user.customClaims?.role === "admin" ? "admin" : "customer";
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function makeReferralCode(length = 6): string {
  let out = "DD";
  for (let i = 0; i < length; i += 1) {
    out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return out;
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6) return "•".repeat(digits.length || 1);
  const head = digits.slice(0, 2);
  const tail = digits.slice(-3);
  return `+${head} ${"•".repeat(Math.max(0, digits.length - 5))}${tail}`;
}

export interface EnsureProfileResponse {
  uid: string;
  referralCode: string | null;
  isNewUser: boolean;
  /** True when the number is verified but no account exists and no registration details were sent. */
  needsRegistration: boolean;
  referral?: { status: "recorded" | "rejected"; reason?: string };
}

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const ensureUserProfile = onCall<unknown>(
  CALLABLE_OPTIONS,
  async (request): Promise<EnsureProfileResponse> => {
    const auth = request.auth;
    if (!auth?.uid) unauthenticated("Please sign in to continue.");
    const uid = auth.uid;
    const phone = auth.token.phone_number ?? "";
    if (!phone) invalidArgument("A verified mobile number is required.");

    const data = requireObject<Record<string, unknown>>(request.data ?? {});
    const existing = await readDoc<UserProfile>(COLLECTIONS.users, uid);

    if (existing) {
      if (existing.status === "suspended") {
        await requireUser(auth); // throws the standard suspended error
      }
      await db()
        .collection(COLLECTIONS.users)
        .doc(uid)
        .set(
          { phone, phoneMasked: maskPhone(phone), role: await claimRole(uid), lastLoginAt: nowIso() },
          { merge: true },
        );
      return { uid, referralCode: existing.referralCode, isNewUser: false, needsRegistration: false };
    }

    // Sign-in for a verified number without an account: ask for registration
    // details rather than creating a nameless profile.
    if (typeof data.fullName !== "string") {
      return { uid, referralCode: null, isNewUser: false, needsRegistration: true };
    }

    await enforceRateLimit(uid, "ensureUserProfile", { max: 10, windowSeconds: 3600 });

    const fullName = data.fullName.trim().replace(/\s+/g, " ");
    if (fullName.length < 2 || fullName.length > 120) invalidArgument("Please enter your full name.");
    if (data.acceptedTerms !== true) {
      invalidArgument("You must accept the terms to create an account.");
    }
    const email = typeof data.email === "string" && data.email.trim() ? data.email.trim().slice(0, 200) : undefined;
    if (email && !EMAIL_PATTERN.test(email)) invalidArgument("Enter a valid email address.");
    const address =
      typeof data.address === "string" && data.address.trim() ? data.address.trim().slice(0, 400) : undefined;
    const referralCode =
      typeof data.referralCode === "string" && data.referralCode.trim()
        ? data.referralCode.trim().toUpperCase().slice(0, 20)
        : undefined;

    // A number that already had an account (for example a deleted and
    // re-created Auth user) is not a genuinely new participant.
    const priorAccount = await db().collection(COLLECTIONS.users).where("phone", "==", phone).limit(1).get();
    const referralEligible = priorAccount.empty;

    let code = makeReferralCode();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const clash = await db().collection(COLLECTIONS.users).where("referralCode", "==", code).limit(1).get();
      if (clash.empty) break;
      code = makeReferralCode();
    }

    const now = nowIso();
    const profile = clean({
      uid,
      fullName,
      phone,
      phoneMasked: maskPhone(phone),
      email,
      address,
      role: await claimRole(uid),
      status: "active" as const,
      referralCode: code,
      referralEligible,
      termsAcceptedAt: now,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
    }) as UserProfile;
    const wallet: WalletAccount = {
      uid,
      balancePaise: 0,
      totalDepositedPaise: 0,
      totalSpentPaise: 0,
      pendingDepositPaise: 0,
      updatedAt: now,
    };
    const spins: SpinAccount = { uid, availableSpins: 0, totalEarned: 0, totalUsed: 0, updatedAt: now };

    // Profile, wallet and spin account appear together or not at all; a
    // concurrent duplicate call finds the profile and becomes a no-op.
    const created = await db().runTransaction(async (tx) => {
      const userRef = db().collection(COLLECTIONS.users).doc(uid);
      const snap = await tx.get(userRef);
      if (snap.exists) return false;
      tx.set(userRef, profile);
      tx.set(db().collection(COLLECTIONS.walletAccounts).doc(uid), wallet, { merge: true });
      tx.set(db().collection(COLLECTIONS.spinAccounts).doc(uid), spins, { merge: true });
      return true;
    });
    if (!created) {
      const stored = await readDoc<UserProfile>(COLLECTIONS.users, uid);
      return { uid, referralCode: stored?.referralCode ?? code, isNewUser: false, needsRegistration: false };
    }

    let referral: EnsureProfileResponse["referral"];
    if (referralCode) {
      const result = await attachReferral(profile, referralCode);
      referral = { status: result.status, reason: result.reason };
      if (result.status === "recorded") await qualifyOnActivitySafely(uid, "signup");
    }

    await notify(
      uid,
      "system",
      "Welcome to Nellore Diwali Dhamaka",
      "Your account is ready. Add money to your wallet to book festival tickets.",
      "/dashboard/add-money",
    );

    return { uid, referralCode: code, isNewUser: true, needsRegistration: false, referral };
  },
);
