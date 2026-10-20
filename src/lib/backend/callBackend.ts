import { BackendError, type BackendErrorShape } from "./api";

/**
 * Single entry point for every privileged operation: a Cloud Functions
 * callable in `us-central1`, next to the Firestore database. Feature code must never mutate wallets, tickets,
 * spins or draw results through the store directly.
 */
export async function callBackend<TReq, TRes>(name: BackendFunctionName, payload: TReq): Promise<TRes> {
  try {
    const [{ httpsCallable }, { cloudFunctions }] = await Promise.all([
      import("firebase/functions"),
      import("@/lib/firebase/client"),
    ]);
    const callable = httpsCallable<TReq, TRes>(cloudFunctions(), name);
    const result = await callable(payload);
    return result.data;
  } catch (error) {
    throw toBackendError(error);
  }
}

function toBackendError(error: unknown): BackendError {
  if (error instanceof BackendError) return error;
  const e = error as { code?: string; message?: string; details?: unknown };
  const raw = e?.code ?? "internal";
  const code = raw.replace(/^functions\//, "").replace(/^auth\//, "");
  const message =
    e?.message && !e.message.startsWith("internal")
      ? e.message
      : "Something went wrong completing that request. Please try again.";
  return new BackendError(code, message, e?.details);
}

export function isBackendError(error: unknown): error is BackendError {
  return error instanceof BackendError;
}

export function backendErrorShape(error: unknown): BackendErrorShape {
  if (error instanceof BackendError) {
    return { code: error.code, message: error.message, details: error.details };
  }
  return { code: "internal", message: "Unexpected error." };
}

/** Maps a backend error code to a user-facing next step. */
export function errorActionHint(code: string): string | null {
  switch (code) {
    case "failed-precondition":
    case "resource-exhausted":
      return "Adjust your selection or try again later.";
    case "already-exists":
      return "Refresh the page to see the latest availability.";
    case "unauthenticated":
      return "Sign in to continue.";
    case "permission-denied":
      return "This action requires additional permissions.";
    case "not-found":
      return "The item you were working with no longer exists.";
    default:
      return null;
  }
}

export const BACKEND_FUNCTIONS = [
  "ensureUserProfile",
  "pickPaymentQr",
  "submitDeposit",
  "reviewDeposit",
  "purchaseTickets",
  "generateTicketInventory",
  "claimReferral",
  "qualifyReferral",
  "moderateReferral",
  "executeSpin",
  "runDraw",
  "publishDrawResults",
  "cancelDraw",
  "moderateWinner",
  "logAdminAction",
  "broadcastAnnouncement",
  "adjustWallet",
  "startViewAs",
  "findTransferRecipient",
  "transferFunds",
  "getProductCoupons",
] as const;

export type BackendFunctionName = (typeof BACKEND_FUNCTIONS)[number];
