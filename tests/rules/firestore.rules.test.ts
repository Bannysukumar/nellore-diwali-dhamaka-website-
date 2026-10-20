import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

const PROJECT = "demo-ndd";
let env: RulesTestEnvironment;

const now = "2026-10-20T10:00:00.000Z";
const draw = (overrides: Record<string, unknown> = {}) => ({
  title: "Festival draw",
  slug: "festival",
  description: "",
  ticketPricePaise: 5_000,
  ticketNumberStart: 1,
  ticketNumberEnd: 100,
  numberPadding: 3,
  totalTickets: 100,
  maxTicketsPerUser: 5,
  published: true,
  status: "open",
  salesOpenAt: "2026-10-19T00:00:00.000Z",
  salesCloseAt: "2026-10-25T00:00:00.000Z",
  drawAt: "2026-10-26T00:00:00.000Z",
  prizes: [],
  eligibility: "",
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const customer = () => env.authenticatedContext("alice", { phone_number: "+919000000001" }).firestore();
const otherCustomer = () => env.authenticatedContext("bob").firestore();
const admin = () => env.authenticatedContext("admin1", { role: "admin" }).firestore();
const anonymous = () => env.unauthenticatedContext().firestore();

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8") },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc("users/alice").set({ uid: "alice", fullName: "Alice", role: "customer", status: "active", phone: "+919000000001" });
    await db.doc("users/bob").set({ uid: "bob", fullName: "Bob", role: "admin", status: "active" });
    await db.doc("walletAccounts/alice").set({ uid: "alice", balancePaise: 1_000 });
    await db.doc("walletTransactions/tx1").set({ uid: "alice", amountPaise: 1_000 });
    await db.doc("orders/o1").set({ uid: "alice", totalPaise: 5_000 });
    await db.doc("depositRequests/d1").set({ uid: "alice", amountPaise: 1_000, status: "pending" });
    await db.doc("spinAccounts/alice").set({ uid: "alice", availableSpins: 1 });
    await db.doc("referrals/bob_alice").set({ referrerUid: "bob", refereeUid: "alice", status: "pending" });
    await db.doc("draws/live").set(draw());
    await db.doc("draws/hidden").set(draw({ published: false, status: "draft", slug: "hidden" }));
    await db.doc("draws/sold").set(draw({ slug: "sold" }));
    await db.doc("tickets/tkt_sold_1").set({ drawId: "sold", number: 1, status: "available" });
    await db.doc("tickets/tkt_live_5").set({ drawId: "live", number: 5, status: "available" });
    await db.doc("drawResults/live").set({ drawId: "live", published: false });
    await db.doc("drawResults/old").set({ drawId: "old", published: true });
    await db.doc("winnerAnnouncements/w1").set({ drawId: "live", status: "draft", winnerUid: "alice" });
    await db.doc("winnerAnnouncements/w2").set({ drawId: "old", status: "draft", winnerUid: "bob" });
    await db.doc("winnerAnnouncements/w3").set({ drawId: "old", status: "published", winnerUid: "bob" });
    await db.doc("adminAuditLogs/a1").set({ action: "x" });
    await db.doc("notifications/n1").set({ uid: "alice", read: false, title: "Hi", body: "Hello" });
    await db.doc("paymentQrCodes/active").set({ active: true });
    await db.doc("paymentQrCodes/inactive").set({ active: false });
    await db.doc("siteSettings/general").set({ brandName: "X" });
    await db.doc("rateLimits/alice__x").set({ count: 1 });
  });
});

describe("users", () => {
  it("lets a person read only their own profile", async () => {
    await assertSucceeds(customer().doc("users/alice").get());
    await assertFails(customer().doc("users/bob").get());
    await assertFails(anonymous().doc("users/alice").get());
  });

  it("ignores a role field in Firestore: only the custom claim grants admin reads", async () => {
    await assertFails(otherCustomer().doc("users/alice").get());
    await assertSucceeds(admin().doc("users/alice").get());
  });

  it("allows limited self-service edits only", async () => {
    await assertSucceeds(customer().doc("users/alice").update({ fullName: "Alice R", updatedAt: now }));
    await assertFails(customer().doc("users/alice").update({ role: "admin" }));
    await assertFails(customer().doc("users/alice").update({ status: "suspended", updatedAt: now }));
    await assertFails(customer().doc("users/alice").update({ phone: "+919999999999", updatedAt: now }));
    await assertFails(customer().doc("users/alice").update({ referralCode: "FREE" }));
    await assertFails(customer().doc("users/carol").set({ role: "customer" }));
  });

  it("lets an admin suspend but never change a role", async () => {
    await assertSucceeds(admin().doc("users/alice").update({ status: "suspended", suspendedReason: "Fraud", updatedAt: now }));
    await assertFails(admin().doc("users/alice").update({ role: "admin" }));
  });
});

describe("money and outcomes are server-only", () => {
  const ownedPaths = ["walletAccounts/alice", "walletTransactions/tx1", "orders/o1", "depositRequests/d1", "spinAccounts/alice"];

  it("lets the owner read, and nobody else except admins", async () => {
    for (const path of ownedPaths) {
      await assertSucceeds(customer().doc(path).get());
      await assertFails(otherCustomer().doc(path).get());
      await assertFails(anonymous().doc(path).get());
      await assertSucceeds(admin().doc(path).get());
    }
  });

  it("denies every client write, including from administrators", async () => {
    for (const path of ownedPaths) {
      await assertFails(customer().doc(path).set({ uid: "alice", balancePaise: 999_999 }));
      await assertFails(admin().doc(path).set({ uid: "alice", balancePaise: 999_999 }));
    }
    await assertFails(customer().doc("walletAccounts/alice").update({ balancePaise: 999_999 }));
    await assertFails(admin().doc("drawResults/live").set({ published: true }));
    await assertFails(admin().doc("winnerAnnouncements/w9").set({ status: "published" }));
    await assertFails(admin().doc("referrals/x_y").set({ status: "qualified" }));
  });

  it("only lets an owner query their own ledger", async () => {
    await assertSucceeds(customer().collection("walletTransactions").where("uid", "==", "alice").get());
    await assertFails(customer().collection("walletTransactions").get());
  });

  it("shows referrals only to the two people involved", async () => {
    await assertSucceeds(customer().doc("referrals/bob_alice").get());
    await assertFails(env.authenticatedContext("carol").firestore().doc("referrals/bob_alice").get());
  });
});

describe("draws", () => {
  it("hides unpublished draws from the public", async () => {
    await assertSucceeds(anonymous().doc("draws/live").get());
    await assertFails(anonymous().doc("draws/hidden").get());
    await assertFails(customer().doc("draws/hidden").get());
    await assertSucceeds(admin().doc("draws/hidden").get());
  });

  it("allows public queries only when they filter on published", async () => {
    await assertSucceeds(anonymous().collection("draws").where("published", "==", true).get());
    await assertSucceeds(
      anonymous().collection("draws").where("slug", "==", "live").where("published", "==", true).get(),
    );
    await assertFails(anonymous().collection("draws").get());
  });

  it("lets admins create drafts but never set outcome statuses directly", async () => {
    await assertSucceeds(admin().doc("draws/new").set(draw({ status: "draft", published: false })));
    await assertFails(customer().doc("draws/new2").set(draw({ status: "draft" })));
    await assertFails(admin().doc("draws/live").update({ status: "completed", updatedAt: now }));
    await assertFails(admin().doc("draws/live").update({ status: "cancelled", updatedAt: now }));
    await assertSucceeds(admin().doc("draws/live").update({ status: "sales_closed", updatedAt: now }));
  });

  it("freezes ticket inventory fields once tickets exist", async () => {
    await assertFails(admin().doc("draws/sold").update({ ticketPricePaise: 1, updatedAt: now }));
    await assertSucceeds(admin().doc("draws/live").update({ description: "Updated", updatedAt: now }));
  });
});

describe("tickets", () => {
  it("are publicly readable but never sold or reassigned from a client", async () => {
    await assertSucceeds(anonymous().doc("tickets/tkt_live_5").get());
    await assertFails(customer().doc("tickets/tkt_live_5").update({ status: "booked", ownerUid: "alice" }));
    await assertFails(admin().doc("tickets/tkt_live_5").update({ status: "booked", updatedAt: now }));
    await assertFails(admin().doc("tickets/tkt_live_5").update({ ownerUid: "alice", updatedAt: now }));
    await assertFails(admin().doc("tickets/tkt_new").set({ drawId: "live", status: "available" }));
  });

  it("lets admins block and unblock unsold inventory", async () => {
    await assertSucceeds(
      admin().doc("tickets/tkt_live_5").update({ status: "blocked", blockedReason: "Misprint", updatedAt: now }),
    );
  });
});

describe("results and winners", () => {
  it("keeps unpublished results private", async () => {
    await assertFails(anonymous().doc("drawResults/live").get());
    await assertSucceeds(anonymous().doc("drawResults/old").get());
    await assertSucceeds(admin().doc("drawResults/live").get());
  });

  it("shows draft winners only to the winner and admins", async () => {
    await assertSucceeds(customer().doc("winnerAnnouncements/w1").get());
    await assertFails(customer().doc("winnerAnnouncements/w2").get());
    await assertSucceeds(anonymous().doc("winnerAnnouncements/w3").get());
  });
});

describe("audit, notifications, configuration", () => {
  it("lets only admins read audit logs, and nobody write them", async () => {
    await assertSucceeds(admin().doc("adminAuditLogs/a1").get());
    await assertFails(customer().doc("adminAuditLogs/a1").get());
    await assertFails(admin().doc("adminAuditLogs/a2").set({ action: "forged" }));
    await assertFails(admin().doc("adminAuditLogs/a1").delete());
  });

  it("lets a recipient only mark their notification read; nobody creates them client-side", async () => {
    await assertSucceeds(customer().doc("notifications/n1").update({ read: true }));
    await assertFails(customer().doc("notifications/n1").update({ title: "Changed" }));
    await assertFails(otherCustomer().doc("notifications/n1").get());
    await assertFails(admin().doc("notifications/n2").set({ uid: "alice", read: false, title: "x", body: "y" }));
  });

  it("exposes only active payment QRs to customers", async () => {
    await assertSucceeds(customer().doc("paymentQrCodes/active").get());
    await assertFails(customer().doc("paymentQrCodes/inactive").get());
    await assertSucceeds(admin().doc("paymentQrCodes/inactive").get());
    await assertFails(customer().doc("paymentQrCodes/new").set({ active: true }));
  });

  it("lets everyone read site settings but only admins change them", async () => {
    await assertSucceeds(anonymous().doc("siteSettings/general").get());
    await assertFails(customer().doc("siteSettings/general").set({ allowPaidDraws: true }));
    await assertSucceeds(admin().doc("siteSettings/general").set({ allowPaidDraws: false }, { merge: true }));
  });

  it("denies rate-limit counters and unknown collections to everybody", async () => {
    await assertFails(admin().doc("rateLimits/alice__x").get());
    await assertFails(customer().doc("rateLimits/alice__x").set({ count: 0 }));
    await assertFails(admin().doc("creditedUtrs/UTR12345678").get());
    await assertFails(admin().doc("creditedUtrs/UTR12345678").set({ depositId: "forged" }));
    await assertFails(customer().doc("creditedUtrs/UTR12345678").delete());
    await assertFails(admin().doc("somethingElse/x").set({ a: 1 }));
  });
});
