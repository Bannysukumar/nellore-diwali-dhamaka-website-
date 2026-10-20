/**
 * Shared harness for the Cloud Functions integration tests.
 *
 * Everything here talks to the local Emulator Suite only: callables are
 * invoked over HTTP exactly as the web client invokes them, users sign in
 * through the Auth emulator's real phone-OTP flow, and setup data is written
 * with the Admin SDK. The harness refuses to start unless the project id is a
 * `demo-*` id and every emulator host is a loopback address.
 */
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

export const PROJECT = process.env.GCLOUD_PROJECT ?? "demo-ndd";
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "";
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "";
const STORAGE_HOST = process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? "";
const FUNCTIONS_HOST = process.env.FUNCTIONS_EMULATOR_HOST ?? "127.0.0.1:5001";
const REGION = "asia-south1";
const LOOPBACK = /^(127\.0\.0\.1|localhost|\[::1\]):\d+$/;

if (!PROJECT.startsWith("demo-")) throw new Error(`Refusing to run integration tests against "${PROJECT}".`);
for (const [name, host] of Object.entries({ AUTH_HOST, FIRESTORE_HOST, STORAGE_HOST, FUNCTIONS_HOST })) {
  if (!LOOPBACK.test(host)) {
    throw new Error(`${name}="${host}" is not a local emulator. Run through \`npm run test:functions\`.`);
  }
}

if (!getApps().length) initializeApp({ projectId: PROJECT, storageBucket: `${PROJECT}.appspot.com` });
export const db = getFirestore();
export const adminAuth = getAuth();
export const bucket = getStorage().bucket();

/* --------------------------------------------------------------- callables */

export class CallError extends Error {
  constructor(
    public status: string,
    message: string,
  ) {
    super(`${status}: ${message}`);
  }
}

export async function call<T = Record<string, unknown>>(name: string, data: unknown, token?: string): Promise<T> {
  const response = await fetch(`http://${FUNCTIONS_HOST}/${PROJECT}/${REGION}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ data }),
  });
  const body = (await response.json()) as { result?: T; error?: { status: string; message: string } };
  if (body.error) throw new CallError(body.error.status, body.error.message);
  return body.result as T;
}

/** Resolves to the error status of a callable that is expected to fail. */
export async function callError(name: string, data: unknown, token?: string): Promise<string> {
  try {
    await call(name, data, token);
  } catch (error) {
    if (error instanceof CallError) return error.status;
    throw error;
  }
  throw new Error(`${name} unexpectedly succeeded`);
}

/* -------------------------------------------------------------------- auth */

const identity = (path: string) => `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/${path}?key=emulator-key`;

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await response.json()) as T & { error?: { message: string } };
  if (!response.ok || json.error) throw new Error(`Auth emulator: ${json.error?.message ?? response.status}`);
  return json;
}

/** Signs in with the Auth emulator's phone-OTP flow and returns a fresh ID token. */
export async function signInWithPhone(phoneNumber: string): Promise<{ uid: string; token: string }> {
  const { sessionInfo } = await postJson<{ sessionInfo: string }>(identity("accounts:sendVerificationCode"), {
    phoneNumber,
    recaptchaToken: "emulator",
  });
  const codes = (await (
    await fetch(`http://${AUTH_HOST}/emulator/v1/projects/${PROJECT}/verificationCodes`)
  ).json()) as { verificationCodes: Array<{ sessionInfo: string; code: string }> };
  const code = codes.verificationCodes.find((c) => c.sessionInfo === sessionInfo)?.code;
  if (!code) throw new Error(`No verification code issued for ${phoneNumber}`);
  const signedIn = await postJson<{ idToken: string; localId: string }>(identity("accounts:signInWithPhoneNumber"), {
    sessionInfo,
    code,
  });
  return { uid: signedIn.localId, token: signedIn.idToken };
}

/** Exchanges a custom token (for example from `startViewAs`) for an ID token. */
export async function signInWithCustomToken(token: string): Promise<string> {
  const signedIn = await postJson<{ idToken: string }>(identity("accounts:signInWithCustomToken"), {
    token,
    returnSecureToken: true,
  });
  return signedIn.idToken;
}

export interface TestUser {
  uid: string;
  token: string;
  phone: string;
  referralCode: string;
}

let phoneCounter = 0;
/** Unique Indian test numbers in the reserved +91 90000 range. */
export function nextPhone(): string {
  phoneCounter += 1;
  return `+9190000${String(10_000 + phoneCounter).slice(-5)}`;
}

export async function registerCustomer(
  fullName: string,
  extra: { referralCode?: string } = {},
): Promise<TestUser & { referral?: { status: string; reason?: string } }> {
  const phone = nextPhone();
  const { uid, token } = await signInWithPhone(phone);
  const result = await call<{ referralCode: string; referral?: { status: string; reason?: string } }>(
    "ensureUserProfile",
    { fullName, acceptedTerms: true, ...extra },
    token,
  );
  return { uid, token, phone, referralCode: result.referralCode, referral: result.referral };
}

/** Registers a person, then grants the custom claim the way `tools/setAdmin.mjs` does. */
export async function registerAdmin(): Promise<TestUser> {
  const user = await registerCustomer("Test Administrator");
  await adminAuth.setCustomUserClaims(user.uid, { role: "admin" });
  await db.doc(`users/${user.uid}`).set({ role: "admin" }, { merge: true });
  const { token } = await signInWithPhone(user.phone);
  return { ...user, token };
}

/* ------------------------------------------------------------------- state */

export async function resetEmulators(): Promise<void> {
  await fetch(`http://${FIRESTORE_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: "DELETE",
  });
  await fetch(`http://${AUTH_HOST}/emulator/v1/projects/${PROJECT}/accounts`, { method: "DELETE" });
}

export const nowIso = (offsetHours = 0) => new Date(Date.now() + offsetHours * 3_600_000).toISOString();

export async function writeSettings(overrides: Record<string, unknown> = {}): Promise<void> {
  await db.doc("siteSettings/general").set({
    brandName: "Integration test",
    tagline: "",
    supportPhone: "",
    supportEmail: "",
    minDepositPaise: 10_000,
    maxDepositPaise: 5_000_000,
    allowMultiTicketPurchase: true,
    maxTicketsPerOrder: 10,
    allowPaidDraws: true,
    refundWindowHours: 0,
    minAge: 18,
    legalDisclaimer: "",
    updatedAt: nowIso(),
    ...overrides,
  });
}

export async function writeSpinConfig(overrides: Record<string, unknown> = {}): Promise<void> {
  await db.doc("rewards/rw_credit").set({
    id: "rw_credit",
    name: "₹10 credit",
    description: "Test credit",
    type: "wallet_credit",
    valuePaise: 1_000,
    inventory: 0,
    remaining: 0,
    active: true,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
  await db.doc("siteSettings/spin").set({
    enabled: true,
    spinsPerReferral: 1,
    referralQualification: "signup",
    referralClaimWindowHours: 72,
    maxSpinsPerUser: 5,
    dailySpinLimit: 2,
    maxRewardsPerReferrer: 10,
    maxReferralsPerAccount: 10,
    rewardValidDays: 30,
    minAge: 18,
    segments: [{ id: "seg_credit", rewardId: "rw_credit", label: "₹10", color: "#000", weight: 1, active: true }],
    updatedAt: nowIso(),
    ...overrides,
  });
}

export async function writePaymentQr(): Promise<string> {
  await db.doc("paymentQrCodes/qr_test").set({
    id: "qr_test",
    label: "Test QR",
    payeeName: "Test payee",
    upiId: "test@upi",
    imageUrl: "https://example.invalid/qr.png",
    active: true,
    createdAt: nowIso(),
  });
  return "qr_test";
}

let drawCounter = 0;
/** Creates a published draw and materialises its inventory through the real callable. */
export async function createDraw(
  admin: TestUser,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; ticketIds: string[]; pricePaise: number }> {
  drawCounter += 1;
  const id = `draw_${Date.now()}_${drawCounter}`;
  const start = 1;
  const end = (overrides.ticketNumberEnd as number | undefined) ?? 10;
  const pricePaise = (overrides.ticketPricePaise as number | undefined) ?? 5_000;
  await db.doc(`draws/${id}`).set({
    title: `Integration draw ${drawCounter}`,
    slug: id,
    description: "",
    ticketPricePaise: pricePaise,
    currency: "INR",
    ticketNumberStart: start,
    ticketNumberEnd: end,
    numberPadding: 3,
    totalTickets: end - start + 1,
    salesOpenAt: nowIso(-1),
    salesCloseAt: nowIso(24),
    drawAt: nowIso(48),
    timezone: "Asia/Kolkata",
    status: "open",
    maxTicketsPerUser: 5,
    prizes: [
      { id: "p_gold", tier: "gold", title: "Gold", description: "", quantity: 1 },
      { id: "p_silver", tier: "silver", title: "Silver", description: "", quantity: 2 },
    ],
    eligibility: "",
    published: true,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ...overrides,
  });
  await call("generateTicketInventory", { drawId: id }, admin.token);
  const ticketIds = Array.from({ length: end - start + 1 }, (_, i) => `tkt_${id}_${start + i}`);
  return { id, ticketIds, pricePaise };
}

let utrCounter = 0;
export function nextUtr(): string {
  utrCounter += 1;
  return `UTR${Date.now()}${utrCounter}`.slice(0, 22);
}

export async function uploadScreenshot(uid: string): Promise<string> {
  const path = `deposit-screenshots/${uid}/${Date.now()}_${Math.random().toString(36).slice(2)}.png`;
  await bucket.file(path).save(Buffer.from([0x89, 0x50, 0x4e, 0x47]), { contentType: "image/png" });
  return path;
}

let requestCounter = 0;
export function requestId(prefix = "req"): string {
  requestCounter += 1;
  return `${prefix}_${Date.now()}_${requestCounter}`;
}

/** Funds a wallet through the real deposit + admin approval path. */
export async function fundWallet(user: TestUser, admin: TestUser, amountPaise: number): Promise<void> {
  const screenshotPath = await uploadScreenshot(user.uid);
  const deposit = await call<{ depositId: string }>(
    "submitDeposit",
    { amountPaise, qrId: "qr_test", utr: nextUtr(), screenshotPath, requestId: requestId("dep") },
    user.token,
  );
  await call("reviewDeposit", { depositId: deposit.depositId, decision: "approve" }, admin.token);
}

export async function walletOf(uid: string) {
  return (await db.doc(`walletAccounts/${uid}`).get()).data() as {
    balancePaise: number;
    pendingDepositPaise: number;
    totalDepositedPaise: number;
    totalSpentPaise: number;
  };
}

export async function ledgerOf(uid: string) {
  const snap = await db.collection("walletTransactions").where("uid", "==", uid).get();
  return snap.docs.map((d) => d.data() as { type: string; direction: string; amountPaise: number; refId: string });
}
