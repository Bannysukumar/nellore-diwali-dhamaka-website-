/**
 * Categories used when composing a support request. Shared between the public
 * contact page and the signed-in support page so both offer the same options.
 */
export const CONTACT_TOPICS = [
  "Deposit not credited",
  "Deposit rejected",
  "Ticket purchase problem",
  "Draw or result question",
  "Referral or spin reward",
  "Account access or suspension",
  "Refund request",
  "Something else",
] as const;

export type ContactTopic = (typeof CONTACT_TOPICS)[number];
