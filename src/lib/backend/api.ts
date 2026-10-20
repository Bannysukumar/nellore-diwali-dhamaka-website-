import type { DepositStatus, RewardType, UserRole } from "@/types";

/**
 * Request/response contract of the Cloud Functions callables. Mirrors
 * `functions/src` — keep both sides in sync when a callable changes.
 */

export interface BackendErrorShape {
  code: string;
  message: string;
  details?: unknown;
}

export class BackendError extends Error {
  code: string;
  details?: unknown;
  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "BackendError";
    this.code = code;
    this.details = details;
  }
}

export interface BackendIdentity {
  uid: string;
  role: UserRole;
  fullName: string;
  phone: string;
  phoneMasked: string;
}

/* ------------------------------------------------------------- profile ---- */

/**
 * Called after every phone sign-in. Without `fullName` it only refreshes an
 * existing profile (and reports `needsRegistration` for a first-time number);
 * with `fullName` + `acceptedTerms` it creates the profile, wallet and spin
 * account together and attributes any referral code server-side.
 */
export interface EnsureProfileRequest {
  fullName?: string;
  email?: string;
  address?: string;
  referralCode?: string;
  acceptedTerms?: boolean;
}
export interface EnsureProfileResponse {
  uid: string;
  referralCode: string | null;
  isNewUser: boolean;
  needsRegistration: boolean;
  referral?: { status: "recorded" | "rejected"; reason?: string };
}

/* ------------------------------------------------------------- deposits --- */

export interface PickPaymentQrRequest {
  /** Client-supplied session key so the QR stays stable for one deposit. */
  sessionKey: string;
}
export interface PickPaymentQrResponse {
  qrId: string;
  label: string;
  payeeName: string;
  upiId: string;
  appHint?: string;
  imageUrl: string;
}

export interface SubmitDepositRequest {
  amountPaise: number;
  qrId: string;
  utr: string;
  screenshotPath: string;
  screenshotUrl?: string;
  requestId: string;
}
export interface SubmitDepositResponse {
  depositId: string;
  status: DepositStatus;
  submittedAt: string;
}

export interface ReviewDepositRequest {
  depositId: string;
  decision: "approve" | "reject" | "requires_review";
  note?: string;
  reason?: string;
  verifiedAmountPaise?: number;
}
export interface ReviewDepositResponse {
  depositId: string;
  status: DepositStatus;
  creditedPaise: number;
  balancePaise: number;
}

/* ------------------------------------------------------------- tickets ---- */

export interface PurchaseTicketsRequest {
  drawId: string;
  ticketIds: string[];
  requestId: string;
}
export interface PurchaseTicketsResponse {
  orderId: string;
  drawId: string;
  ticketNumbers: number[];
  totalPaise: number;
  balancePaise: number;
  createdAt: string;
}

export interface GenerateInventoryRequest {
  drawId: string;
}
export interface GenerateInventoryResponse {
  drawId: string;
  created: number;
  total: number;
}

/* ------------------------------------------------------------ referrals --- */

export interface ClaimReferralRequest {
  code: string;
}
export interface ClaimReferralResponse {
  referralId: string | null;
  status: "recorded" | "rejected";
  reason?: string;
}

export interface QualifyReferralRequest {
  refereeUid: string;
  trigger: "signup" | "verified_deposit" | "ticket_purchase";
}
export interface QualifyReferralResponse {
  qualified: boolean;
  spinsGranted: number;
  reason?: string;
}

export interface ModerateReferralRequest {
  referralId: string;
  decision: "qualify" | "reject";
  note?: string;
}
export interface ModerateReferralResponse {
  referralId: string;
  status: "qualified" | "rejected";
  spinsGranted: number;
}

/* ----------------------------------------------------------------- spin --- */

export interface ExecuteSpinRequest {
  requestId: string;
}
export interface ExecuteSpinResponse {
  spinId: string;
  segmentId: string;
  rewardId: string;
  rewardName: string;
  rewardType: RewardType;
  rewardExpiresAt?: string;
  walletCreditPaise: number;
  availableSpins: number;
}

/* ----------------------------------------------------------------- draw --- */

export interface RunDrawRequest {
  drawId: string;
}
export interface RunDrawResponse {
  drawId: string;
  eligibleTicketCount: number;
  winningTicketNumbers: number[];
  drawnAt: string;
}

export interface PublishResultsRequest {
  drawId: string;
  note?: string;
}
export interface PublishResultsResponse {
  drawId: string;
  publishedWinners: number;
  publishedAt: string;
}

export interface CancelDrawRequest {
  drawId: string;
  reason: string;
}
export interface CancelDrawResponse {
  drawId: string;
  refundedOrders: number;
  refundedPaise: number;
}

export interface ModerateWinnerRequest {
  winnerId: string;
  action: "publish" | "hide" | "delete";
  note?: string;
}
export interface ModerateWinnerResponse {
  winnerId: string;
  action: ModerateWinnerRequest["action"];
}

/* ---------------------------------------------------------------- admin --- */

export interface BroadcastAnnouncementRequest {
  /** Idempotency key: retrying with the same id completes a partial send without duplicates. */
  requestId: string;
  type: "system" | "draw_reminder" | "draw_schedule_change";
  title: string;
  body: string;
  /** In-app path only, e.g. `/draws`. */
  href?: string;
  /** Omit to target every active customer account. */
  uids?: string[];
}

export interface BroadcastAnnouncementResponse {
  delivered: number;
  createdAt: string;
}

export interface LogAdminActionRequest {
  action: string;
  entity: string;
  entityId: string;
  note?: string;
  before?: unknown;
  after?: unknown;
}
