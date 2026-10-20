/**
 * Domain model for Nellore Diwali Dhamaka.
 *
 * Money is ALWAYS stored as integer paise (1 rupee = 100 paise). Never use
 * floating-point values for currency anywhere in this codebase.
 */

export type ISODate = string;

/* --------------------------------------------------------------------------
 * Users & auth
 * ------------------------------------------------------------------------ */

export type UserRole = "customer" | "admin";
export type UserStatus = "active" | "suspended";

export interface UserProfile {
  uid: string;
  fullName: string;
  /** Full phone number including country code, e.g. +919000000000. */
  phone: string;
  /** Masked phone for public/administrative display, e.g. +91 90•••••000. */
  phoneMasked: string;
  email?: string;
  address?: string;
  role: UserRole;
  status: UserStatus;
  referralCode: string;
  /** Referral code supplied by the user at registration (their referrer). */
  referredByCode?: string;
  /** UID of the referrer once the relationship has been recorded. */
  referredByUid?: string;
  /** True once the account is eligible to earn referral rewards. */
  referralEligible: boolean;
  createdAt: ISODate;
  updatedAt: ISODate;
  lastLoginAt?: ISODate;
  termsAcceptedAt?: ISODate;
  suspendedReason?: string;
}

/* --------------------------------------------------------------------------
 * Draws & prizes
 * ------------------------------------------------------------------------ */

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
  /** Number of digits used when rendering a ticket number (zero padded). */
  numberPadding: number;
  totalTickets: number;
  salesOpenAt: ISODate;
  salesCloseAt: ISODate;
  drawAt: ISODate;
  timezone: string;
  status: DrawStatus;
  /** Maximum tickets a single account may buy across this draw. */
  maxTicketsPerUser: number;
  prizes: Prize[];
  eligibility: string;
  published: boolean;
  cancelledAt?: ISODate;
  cancelReason?: string;
  createdAt: ISODate;
  updatedAt: ISODate;
}

/* --------------------------------------------------------------------------
 * Tickets & orders
 * ------------------------------------------------------------------------ */

export type TicketStatus = "available" | "pending" | "booked" | "blocked";
export type TicketResultStatus = "none" | "winner" | "not_selected";

export interface Ticket {
  id: string;
  /** Human-facing ticket number, e.g. 100245. */
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
  /** Idempotency key supplied by the client for safe retries. */
  requestId: string;
  refundedAt?: ISODate;
  refundTxId?: string;
  createdAt: ISODate;
}

/* --------------------------------------------------------------------------
 * Wallet
 * ------------------------------------------------------------------------ */

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
  | "reward_credit";

export type WalletTxDirection = "credit" | "debit";

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

/* --------------------------------------------------------------------------
 * Referrals & rewards
 * ------------------------------------------------------------------------ */

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

export type RewardType = "coupon" | "gift" | "wallet_credit" | "free_ticket" | "no_prize";

export interface Reward {
  id: string;
  name: string;
  description: string;
  type: RewardType;
  /** Wallet credit value in paise — only meaningful for `wallet_credit`. */
  valuePaise?: number;
  couponCode?: string;
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
  /** Relative weight used by the server-side weighted selection. */
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
  dailySpinLimit: number;
  maxRewardsPerReferrer: number;
  campaignStart?: ISODate;
  campaignEnd?: ISODate;
  rewardValidDays: number;
  minAge: number;
  maxReferralsPerAccount: number;
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
  status: "awarded" | "reversed";
  requestId: string;
  createdAt: ISODate;
}

/* --------------------------------------------------------------------------
 * Winners
 * ------------------------------------------------------------------------ */

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
  /** Partially masked ticket number, e.g. 100••45. */
  ticketNumberMasked: string;
  /** Display name chosen for publication, never the full legal name. */
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
  /** Number of times this draw has been executed — guards duplicate runs. */
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

/* --------------------------------------------------------------------------
 * Content & configuration
 * ------------------------------------------------------------------------ */

export type BannerSlot = "home_hero" | "promo" | "draw" | "splash";

export interface Banner {
  id: string;
  slot: BannerSlot;
  title: string;
  subtitle?: string;
  imageUrl: string;
  imagePath: string;
  mobileImageUrl?: string;
  ctaLabel?: string;
  ctaHref?: string;
  active: boolean;
  startAt?: ISODate;
  endAt?: ISODate;
  sortOrder: number;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface SplashConfig {
  enabled: boolean;
  desktopBannerUrl?: string;
  desktopBannerPath?: string;
  mobileBannerUrl?: string;
  mobileBannerPath?: string;
  logoUrl?: string;
  /** Show the artwork uncropped with no text overlay, for images that carry their own greeting. */
  artworkOnly?: boolean;
  greeting: string;
  heading: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
  backgroundColor: string;
  announcement?: string;
  startAt?: ISODate;
  endAt?: ISODate;
  allowSkip: boolean;
  /** Days to suppress the splash after a dismiss. 0 = show every visit. */
  dismissDays: number;
  updatedAt: ISODate;
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
  updatedAt: ISODate;
}

/**
 * Marketing ticket package. Packages are administrator-editable presets: the
 * amount paid and the number of tickets received are stated separately so the
 * two can never be confused. A package never changes the authoritative price —
 * checkout always re-prices from the draw document on the server.
 */
export interface TicketPackage {
  id: string;
  name: string;
  pricePaise: number;
  ticketCount: number;
  badge?: string;
  rewardDescription?: string;
  benefits: string[];
  terms?: string;
  /** Restricts the package to one draw; omitted means "any open draw". */
  drawId?: string;
  enabled: boolean;
  sortOrder: number;
}

export interface LegalPage {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  updatedAt: ISODate;
  updatedBy?: string;
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

/* --------------------------------------------------------------------------
 * Misc
 * ------------------------------------------------------------------------ */

export interface Paginated<T> {
  items: T[];
  cursor: string | number | null;
  hasMore: boolean;
  total?: number;
}

export interface ApiError {
  code: string;
  message: string;
}
