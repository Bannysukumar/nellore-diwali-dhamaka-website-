/**
 * Server-side domain model.
 *
 * This is the authoritative copy of the shapes the Cloud Functions read and
 * write. It is intentionally kept in sync with `src/types/index.ts` in the web
 * app; the two must never diverge, because the same Firestore documents are
 * consumed by both. Money is ALWAYS integer paise.
 */

export type ISODate = string;

export type UserRole = "customer" | "admin";
export type UserStatus = "active" | "suspended";

export interface UserProfile {
  uid: string;
  fullName: string;
  phone: string;
  phoneMasked: string;
  email?: string;
  address?: string;
  role: UserRole;
  status: UserStatus;
  referralCode: string;
  referredByCode?: string;
  referredByUid?: string;
  referralEligible: boolean;
  createdAt: ISODate;
  updatedAt: ISODate;
  lastLoginAt?: ISODate;
  termsAcceptedAt?: ISODate;
  suspendedReason?: string;
}

export type DrawStatus =
  | "draft"
  | "upcoming"
  | "open"
  | "sales_closed"
  | "in_progress"
  | "results_pending"
  | "completed"
  | "cancelled";

export type PrizeTier = "gold" | "silver" | "bronze" | "special";

export interface Prize {
  id: string;
  tier: PrizeTier;
  title: string;
  description: string;
  quantity: number;
  imageUrl?: string;
}

export interface Draw {
  id: string;
  title: string;
  slug: string;
  description: string;
  bannerUrl?: string;
  ticketPricePaise: number;
  currency: "INR";
  ticketNumberStart: number;
  ticketNumberEnd: number;
  numberPadding: number;
  totalTickets: number;
  salesOpenAt: ISODate;
  salesCloseAt: ISODate;
  drawAt: ISODate;
  timezone: string;
  status: DrawStatus;
  maxTicketsPerUser: number;
  prizes: Prize[];
  eligibility: string;
  published: boolean;
  cancelledAt?: ISODate;
  cancelReason?: string;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export type TicketStatus = "available" | "pending" | "booked" | "blocked";
export type TicketResultStatus = "none" | "winner" | "not_selected";

export interface Ticket {
  id: string;
  number: number;
  numberLabel: string;
  drawId: string;
  status: TicketStatus;
  pricePaise: number;
  ownerUid?: string;
  ownerMaskedName?: string;
  orderId?: string;
  purchasedAt?: ISODate;
  resultStatus: TicketResultStatus;
  prizeId?: string;
  prizeTier?: PrizeTier;
  prizeTitle?: string;
  blockedReason?: string;
  updatedAt: ISODate;
}

export type OrderStatus = "completed" | "failed" | "refunded";

export interface Order {
  id: string;
  uid: string;
  drawId: string;
  drawTitle?: string;
  ticketIds: string[];
  ticketNumbers: number[];
  quantity: number;
  unitPricePaise: number;
  totalPaise: number;
  paymentSource: "wallet";
  status: OrderStatus;
  requestId: string;
  refundedAt?: ISODate;
  refundTxId?: string;
  createdAt: ISODate;
}

export interface WalletAccount {
  uid: string;
  balancePaise: number;
  totalDepositedPaise: number;
  totalSpentPaise: number;
  pendingDepositPaise: number;
  updatedAt: ISODate;
}

export type WalletTxType =
  | "deposit"
  | "ticket_purchase"
  | "refund"
  | "adjustment"
  | "reward_credit"
  | "spin_purchase"
  | "transfer_out"
  | "transfer_in";

export type WalletTxDirection = "credit" | "debit";

/** A customer-to-customer wallet transfer; both ledger entries share its id as `refId`. */
export interface WalletTransfer {
  id: string;
  fromUid: string;
  fromName: string;
  fromPhone: string;
  toUid: string;
  toName: string;
  toPhone: string;
  amountPaise: number;
  note?: string;
  status: "completed";
  fromBalanceAfterPaise: number;
  toBalanceAfterPaise: number;
  requestId: string;
  createdAt: ISODate;
}

export interface WalletTransaction {
  id: string;
  uid: string;
  type: WalletTxType;
  direction: WalletTxDirection;
  amountPaise: number;
  balanceAfterPaise: number;
  description: string;
  refId?: string;
  actor: string;
  createdAt: ISODate;
}

export type DepositStatus = "pending" | "approved" | "rejected" | "requires_review";

export interface DepositRequest {
  id: string;
  uid: string;
  userDisplayName: string;
  userPhoneMasked: string;
  amountPaise: number;
  qrId: string;
  qrLabel: string;
  qrUpiId?: string;
  utr: string;
  screenshotPath: string;
  screenshotUrl?: string;
  status: DepositStatus;
  reviewNote?: string;
  rejectionReason?: string;
  submittedAt: ISODate;
  reviewedAt?: ISODate;
  reviewedBy?: string;
  creditedTransactionId?: string;
  /** Amount actually credited; `amountPaise` always keeps what the customer declared. */
  verifiedAmountPaise?: number;
}

export interface PaymentQrCode {
  id: string;
  label: string;
  payeeName: string;
  upiId: string;
  appHint?: string;
  imageUrl: string;
  imagePath: string;
  active: boolean;
  notes?: string;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export type ReferralStatus = "pending" | "qualified" | "rejected";

export interface Referral {
  id: string;
  referrerUid: string;
  referrerName: string;
  refereeUid: string;
  refereePhoneMasked: string;
  code: string;
  status: ReferralStatus;
  qualifiedAt?: ISODate;
  rewardGrantedAt?: ISODate;
  rewardSpins: number;
  note?: string;
  reviewedBy?: string;
  reviewedAt?: ISODate;
  createdAt: ISODate;
}

export type ReferralTrigger = ReferralQualification;

export type RewardType = "coupon" | "gift" | "wallet_credit" | "free_ticket" | "no_prize";

export interface Reward {
  id: string;
  name: string;
  description: string;
  type: RewardType;
  valuePaise?: number;
  couponCode?: string;
  /** Where a coupon or gift is redeemed: shop name and address. */
  couponLocation?: string;
  /** Map or website link for the redemption place (http/https only). */
  couponLink?: string;
  /** How to redeem, shown on the back of the coupon. */
  couponTerms?: string;
  inventory: number;
  remaining: number;
  validDays?: number;
  active: boolean;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface WheelSegment {
  id: string;
  rewardId: string;
  label: string;
  color: string;
  weight: number;
  active: boolean;
}

/**
 * What a referred account must do before its referrer is rewarded. `signup`
 * means "completed registration with an OTP-verified mobile number".
 */
export type ReferralQualification = "signup" | "verified_deposit" | "ticket_purchase";

export interface SpinConfig {
  enabled: boolean;
  spinsPerReferral: number;
  /** Defaults to `signup` when absent. */
  referralQualification?: ReferralQualification;
  /** A referral code can only be attached this many hours after account creation. */
  referralClaimWindowHours?: number;
  maxSpinsPerUser: number;
  /** Earned (free) spins a customer may use per IST day. */
  dailySpinLimit: number;
  /** Wallet-paid spins a customer may buy per IST day. 0 or absent: unlimited. */
  dailyPaidSpinLimit?: number;
  maxRewardsPerReferrer: number;
  campaignStart?: ISODate;
  campaignEnd?: ISODate;
  rewardValidDays: number;
  minAge: number;
  maxReferralsPerAccount: number;
  /** Price of one wallet-paid spin. 0 or absent: spins are earned only. */
  spinPricePaise?: number;
  segments: WheelSegment[];
  updatedAt: ISODate;
}

export interface SpinAccount {
  uid: string;
  availableSpins: number;
  totalEarned: number;
  totalUsed: number;
  updatedAt: ISODate;
}

export interface SpinTransaction {
  id: string;
  uid: string;
  segmentId: string;
  rewardId: string;
  rewardName: string;
  rewardType: RewardType;
  rewardExpiresAt?: ISODate;
  couponCode?: string;
  /** Unique id printed on a won coupon or gift, e.g. "CPN-7KQ2M9". */
  couponId?: string;
  /** Redemption details copied from the reward when it was won. */
  rewardDescription?: string;
  couponLocation?: string;
  couponLink?: string;
  couponTerms?: string;
  /** Set once a coupon shop owner confirms the customer's coupon PIN. */
  redeemedAt?: ISODate;
  redeemedByUid?: string;
  redeemedShop?: string;
  /** Set when the spin was paid from the wallet instead of using an earned spin. */
  paidPaise?: number;
  status: "awarded" | "reversed";
  requestId: string;
  createdAt: ISODate;
}

/** A customer account an administrator allowed to redeem certain coupon rewards. */
export interface CouponShop {
  uid: string;
  shopName: string;
  rewardIds: string[];
  active: boolean;
  assignedByUid: string;
  createdAt: ISODate;
  updatedAt: ISODate;
}

/** Short-lived PIN a customer shows at the shop to use one coupon (server-only). */
export interface CouponPin {
  spinId: string;
  uid: string;
  rewardId: string;
  pin: string;
  expiresAt: ISODate;
  createdAt: ISODate;
}

/** Receipt of a used coupon, visible to the shop, the customer and admins. */
export interface CouponRedemption {
  spinId: string;
  couponId: string;
  rewardId: string;
  rewardName: string;
  customerUid: string;
  customerName: string;
  customerPhoneMasked: string;
  shopUid: string;
  shopName: string;
  redeemedAt: ISODate;
}

/**
 * A customer's own shuffled pack of wheel results (server-only). Each spin
 * takes the next card, so over one pack every customer receives exactly the
 * configured share of each segment. `key` records the segments and weights the
 * pack was built from; any wheel change rebuilds it.
 */
export interface SpinDeck {
  uid: string;
  key: string;
  cards: string[];
  updatedAt: ISODate;
}

export type WinnerStatus = "draft" | "published";

export interface WinnerAnnouncement {
  id: string;
  drawId: string;
  drawTitle: string;
  drawAt?: ISODate;
  prizeId: string;
  prizeTier: PrizeTier;
  prizeTitle: string;
  prizeDescription: string;
  ticketNumberMasked: string;
  winnerDisplayName: string;
  winnerUid?: string;
  status: WinnerStatus;
  publishedAt?: ISODate;
  createdAt: ISODate;
}

export interface DrawResult {
  id: string;
  drawId: string;
  drawTitle: string;
  eligibleTicketCount: number;
  winningTicketIds: string[];
  winningTicketNumbers: number[];
  drawnAt: ISODate;
  drawnBy: string;
  published: boolean;
  publishedAt?: ISODate;
  executionCount: number;
  /** SHA-256 over the sorted eligible ticket ids, so the entry set can be re-verified. */
  eligibleSetHash?: string;
  /** Prize assignment fixed at run time, so later prize edits cannot reshuffle winners. */
  assignments?: DrawAssignment[];
  auditNote?: string;
}

export interface DrawAssignment {
  ticketId: string;
  ticketNumber: number;
  prizeId: string;
  prizeTier: PrizeTier;
  prizeTitle: string;
  prizeDescription: string;
}

export interface SiteSettings {
  brandName: string;
  tagline: string;
  supportPhone: string;
  supportEmail: string;
  minDepositPaise: number;
  maxDepositPaise: number;
  allowMultiTicketPurchase: boolean;
  maxTicketsPerOrder: number;
  allowPaidDraws: boolean;
  refundWindowHours: number;
  minAge: number;
  legalDisclaimer: string;
  whatsappNumber?: string;
  whatsappMessage?: string;
  updatedAt: ISODate;
}

export type NotificationType =
  | "deposit_submitted"
  | "deposit_approved"
  | "deposit_rejected"
  | "ticket_purchase"
  | "draw_reminder"
  | "draw_schedule_change"
  | "winner_announcement"
  | "referral_reward"
  | "spin_awarded"
  | "system";

export interface AppNotification {
  id: string;
  uid: string;
  type: NotificationType;
  title: string;
  body: string;
  href?: string;
  read: boolean;
  createdAt: ISODate;
}

export interface AdminAuditLog {
  id: string;
  actorUid: string;
  actorName: string;
  action: string;
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  note?: string;
  /** `callable` = written by a privileged function, `trigger` = derived from a console write. */
  source?: "callable" | "trigger";
  createdAt: ISODate;
}
