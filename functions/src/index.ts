import "./bootstrap.js";

/**
 * Cloud Functions entry point for Nellore Diwali Dhamaka.
 *
 * Every money-sensitive or outcome-determining operation lives here — the web
 * client is never trusted with wallet balances, spin results or draw outcomes,
 * regardless of what it sends.
 */

/* --------------------------------------------------------------- callables  */
export { ensureUserProfile } from "./profile.js";
export { pickPaymentQr, submitDeposit, reviewDeposit } from "./deposits.js";
export { purchaseTickets, generateTicketInventory } from "./tickets.js";
export { claimReferral, qualifyReferral, moderateReferral } from "./referrals.js";
export { executeSpin } from "./spin.js";
export { setCouponShop, getCouponPin, redeemCouponPin } from "./coupons.js";
export { runDraw, publishDrawResults, cancelDraw, moderateWinner } from "./draws.js";
export { setAdminClaim, logAdminAction, broadcastAnnouncement, startViewAs } from "./admin.js";
export { adjustWallet } from "./wallet.js";
export { findTransferRecipient, transferFunds } from "./transfers.js";
export { getProductCoupons } from "./products.js";

/* --------------------------------------------------------------- scheduled  */
export {
  openSales,
  closeSales,
  remindDraw,
  releaseUnpublishedDraws,
  verifyOrderIntegrity,
} from "./scheduled.js";
export { keepCallablesWarm } from "./warm.js";

/* --------------------------------------------------------------- triggers   */
export {
  auditAdminContent,
  auditTicketBlocks,
  auditAccountStatus,
  onDrawWritten,
} from "./triggers.js";
