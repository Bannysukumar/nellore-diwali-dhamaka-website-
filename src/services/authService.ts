import type { UserProfile } from "@/types";
import { callBackend } from "@/lib/backend/callBackend";
import type { EnsureProfileRequest, EnsureProfileResponse } from "@/lib/backend/api";

export interface RegistrationDraft {
  fullName: string;
  email?: string;
  address?: string;
  referralCode?: string;
  acceptedTerms: boolean;
}

export interface AuthUser {
  uid: string;
  phone: string;
  profile: UserProfile | null;
  /** True when the profile document could not be loaded (as opposed to not existing). */
  profileError: boolean;
  /**
   * The server-set `role` custom claim on the ID token — the same signal the
   * rules and functions trust. UI only; it never grants access by itself.
   */
  isAdmin: boolean;
}

/** Seconds a customer must wait before requesting another OTP. */
export const OTP_RESEND_COOLDOWN_SECONDS = 30;

/* ------------------------------------------------------------------ helpers */

export function normaliseIndianPhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  const local = digits.length > 10 ? digits.slice(-10) : digits;
  return `+91${local}`;
}

export function isValidIndianPhone(input: string): boolean {
  const digits = input.replace(/\D/g, "");
  const local = digits.length > 10 ? digits.slice(-10) : digits;
  return /^[6-9]\d{9}$/.test(local);
}

/** Plain-language messages for Firebase Auth phone-sign-in failures. */
export function describeAuthError(error: unknown): string {
  const code = String((error as { code?: string })?.code ?? "").replace(/^auth\//, "");
  switch (code) {
    case "invalid-verification-code":
      return "That code is not correct. Check the SMS and try again.";
    case "code-expired":
    case "session-expired":
      return "That code has expired. Request a new OTP.";
    case "too-many-requests":
      return "Too many attempts from this number or device. Firebase has paused new codes, usually for about an hour. Wait, then request one code and enter it as soon as it arrives.";
    case "quota-exceeded":
      return "We cannot send more codes right now. Please try again later.";
    case "invalid-phone-number":
    case "missing-phone-number":
      return "Enter a valid 10-digit Indian mobile number.";
    case "captcha-check-failed":
    case "invalid-app-credential":
    case "missing-app-credential":
      return "The security check did not complete. Refresh the page and try again.";
    case "network-request-failed":
      return "Network problem — check your connection and try again.";
    case "user-disabled":
      return "This account has been disabled. Contact support.";
    case "operation-not-allowed":
      return "Phone sign-in is not enabled for this site yet. Contact support.";
    default:
      return error instanceof Error && error.message
        ? error.message
        : "Something went wrong. Please try again.";
  }
}

async function loadAuth() {
  const mod = await import("firebase/auth");
  const { firebaseAuth } = await import("@/lib/firebase/client");
  return { mod, auth: firebaseAuth() };
}

let recaptchaVerifier: { clear?: () => void } | null = null;
let recaptchaHost: HTMLElement | null = null;

export function resetRecaptcha() {
  try {
    recaptchaVerifier?.clear?.();
  } catch {
    // The widget may already be gone with its host element.
  }
  recaptchaVerifier = null;
  recaptchaHost?.remove();
  recaptchaHost = null;
}

/* --------------------------------------------------------------- public API */

export type AuthListener = (user: AuthUser | null) => void;

/**
 * Subscribes to authentication state: Firebase Auth plus a realtime
 * subscription to the caller's own profile document, so a profile created
 * moments later by `ensureUserProfile` appears without a reload.
 */
export function onAuthChange(cb: AuthListener): () => void {
  let unsubscribeAuth: (() => void) | null = null;
  let unsubscribeProfile: (() => void) | null = null;
  let cancelled = false;
  void (async () => {
    const { mod, auth } = await loadAuth();
    const [{ doc, onSnapshot }, { firestore }] = await Promise.all([
      import("firebase/firestore"),
      import("@/lib/firebase/client"),
    ]);
    if (cancelled) return;
    unsubscribeAuth = mod.onIdTokenChanged(auth, async (user) => {
      unsubscribeProfile?.();
      unsubscribeProfile = null;
      if (cancelled) return;
      if (!user) {
        cb(null);
        return;
      }
      const token = await user.getIdTokenResult();
      const isAdmin = token.claims.role === "admin";
      const phone = user.phoneNumber ?? "";
      unsubscribeProfile = onSnapshot(
        doc(firestore(), "users", user.uid),
        (snap) => {
          if (cancelled) return;
          const profile = snap.exists() ? ({ ...(snap.data() as UserProfile), uid: snap.id }) : null;
          cb({ uid: user.uid, phone, profile, profileError: false, isAdmin });
        },
        (error) => {
          console.error("[auth] profile subscription failed", error);
          cb({ uid: user.uid, phone, profile: null, profileError: true, isAdmin });
        },
      );
    });
  })();
  return () => {
    cancelled = true;
    unsubscribeAuth?.();
    unsubscribeProfile?.();
  };
}

export interface OtpRequestResult {
  verificationId: string;
}

let pendingConfirmation: { verificationId: string; confirm: (code: string) => Promise<unknown> } | null =
  null;

/**
 * Step 1 of phone authentication: Firebase sends the SMS after an invisible
 * reCAPTCHA check. The code itself never passes through this application.
 */
export async function requestOtp(phoneInput: string, recaptchaContainerId: string): Promise<OtpRequestResult> {
  const phone = normaliseIndianPhone(phoneInput);
  if (!isValidIndianPhone(phone)) {
    throw new Error("Enter a valid 10-digit Indian mobile number.");
  }

  const { mod, auth } = await loadAuth();
  resetRecaptcha();
  const container = document.getElementById(recaptchaContainerId);
  if (!container) throw new Error("reCAPTCHA container is missing from the page.");
  // reCAPTCHA can only render once per element, so every request gets a fresh host.
  container.replaceChildren();
  const host = document.createElement("div");
  container.appendChild(host);
  recaptchaHost = host;
  try {
    const verifier = new mod.RecaptchaVerifier(auth, host, { size: "invisible" });
    recaptchaVerifier = verifier;
    const confirmation = await mod.signInWithPhoneNumber(auth, phone, verifier);
    pendingConfirmation = confirmation;
    return { verificationId: confirmation.verificationId };
  } catch (error) {
    resetRecaptcha();
    throw new Error(describeAuthError(error));
  }
}

export interface ConfirmResult {
  uid: string;
  /** True when a brand-new profile was created during this verification. */
  isNewUser: boolean;
  /** The number is verified but has no account yet; collect registration details. */
  needsRegistration: boolean;
  referral?: EnsureProfileResponse["referral"];
}

/**
 * Step 2 of phone authentication. Verifies the code with Firebase, then asks
 * the backend to refresh — or, when registration details are supplied,
 * create — the profile. Wallet, spin account and referral attribution are
 * created server-side.
 */
export async function confirmOtp(
  verificationId: string,
  code: string,
  draft?: RegistrationDraft,
): Promise<ConfirmResult> {
  if (!pendingConfirmation || pendingConfirmation.verificationId !== verificationId) {
    throw new Error("No verification is in progress. Please request a new OTP.");
  }
  try {
    await pendingConfirmation.confirm(code.trim());
  } catch (error) {
    throw new Error(describeAuthError(error));
  }
  pendingConfirmation = null;
  resetRecaptcha();
  return ensureProfile(draft);
}

/**
 * Completes registration for a verified number that has no account yet (for
 * example someone who used "Sign in" before registering).
 */
export async function completeRegistration(draft: RegistrationDraft): Promise<ConfirmResult> {
  return ensureProfile(draft);
}

async function ensureProfile(draft?: RegistrationDraft): Promise<ConfirmResult> {
  const payload: EnsureProfileRequest = draft
    ? {
        fullName: draft.fullName,
        email: draft.email,
        address: draft.address,
        referralCode: draft.referralCode,
        acceptedTerms: draft.acceptedTerms,
      }
    : {};
  const result = await callBackend<EnsureProfileRequest, EnsureProfileResponse>("ensureUserProfile", payload);
  return {
    uid: result.uid,
    isNewUser: result.isNewUser,
    needsRegistration: result.needsRegistration,
    referral: result.referral,
  };
}

export async function signOutUser(): Promise<void> {
  pendingConfirmation = null;
  resetRecaptcha();
  const { mod, auth } = await loadAuth();
  await mod.signOut(auth);
}
