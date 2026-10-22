import type { CouponRedemption, DepositStatus, RewardType, UserRole } from "@/types";

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
  /** Buy this spin for the configured price instead of using an earned spin. */
  payWithWallet?: boolean;
}
export interface ExecuteSpinResponse {
  spinId: string;
  segmentId: string;
  rewardId: string;
  rewardName: string;
  rewardType: RewardType;
  rewardExpiresAt?: string;
  /** Printed id of a won coupon or gift; it is listed on the Coupons page. */
  couponId?: string;
  walletCreditPaise: number;
  availableSpins: number;
  paidPaise: number;
  balancePaise?: number;
}

/* -------------------------------------------------------------- coupons --- */

export interface SetCouponShopRequest {
  uid: string;
  active: boolean;
  shopName?: string;
  rewardIds?: string[];
}

export interface SetCouponShopResponse {
  uid: string;
  active: boolean;
}

export interface GetCouponPinRequest {
  spinId: string;
}

export interface GetCouponPinResponse {
  pin: string;
  expiresAt: string;
}

export interface RedeemCouponPinRequest {
  pin: string;
}

export type RedeemCouponPinResponse = CouponRedemption;

/* ---------------------------------------------------------- leaderboard --- */

export interface LeaderboardEntry {
  rank: number;
  /** Shortened for privacy, e.g. "Ravi K.". */
  name: string;
  count: number;
  you?: boolean;
}

export interface ReferralLeaderboardResponse {
  generatedAt: string;
  totalReferrals: number;
  totalSponsors: number;
  entries: LeaderboardEntry[];
  /** The caller's own standing; null when signed out. */
  me: { rank: number | null; count: number } | null;
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

export interface AdjustWalletRequest {
  /** Idempotency key: a retried request is applied at most once. */
  requestId: string;
  uid: string;
  /** `set` replaces the balance; the server records the difference in the ledger. */
  mode: "credit" | "debit" | "set";
  amountPaise: number;
  reason: string;
}
export interface AdjustWalletResponse {
  uid: string;
  mode: AdjustWalletRequest["mode"];
  deltaPaise: number;
  balancePaise: number;
}

export interface SetAdminClaimRequest {
  uid: string;
  admin: boolean;
}

export interface SetAdminClaimResponse {
  uid: string;
  admin: boolean;
}

export interface StartViewAsRequest {
  uid: string;
}

export interface FindTransferRecipientRequest {
  phone: string;
}

export interface FindTransferRecipientResponse {
  maskedName: string;
  phoneMasked: string;
}

export interface TransferFundsRequest {
  /** Idempotency key: a retried request is applied at most once. */
  requestId: string;
  toPhone: string;
  amountPaise: number;
  note?: string;
}

export interface TransferFundsResponse {
  transferId: string;
  amountPaise: number;
  balancePaise: number;
  recipientName: string;
  createdAt: string;
}

export interface ProductCouponsResponse {
  eligible: boolean;
  coupons: Record<string, string>;
}

/** A custom token for a read-only session as the customer. */
export interface StartViewAsResponse {
  token: string;
  fullName: string;
}

export interface LogAdminActionRequest {
  action: string;
  entity: string;
  entityId: string;
  note?: string;
  before?: unknown;
  after?: unknown;
}
