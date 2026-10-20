import { beforeAll, describe, expect, it } from "vitest";
import {
  adminAuth,
  call,
  callError,
  db,
  nextPhone,
  registerAdmin,
  registerCustomer,
  requestId,
  resetEmulators,
  signInWithCustomToken,
  signInWithPhone,
  writeSettings,
  type TestUser,
} from "./harness";

describe("authentication, profiles and administrator authority", () => {
  let admin: TestUser;

  beforeAll(async () => {
    await resetEmulators();
    await writeSettings();
    admin = await registerAdmin();
  });

  it("rejects callables without a signed-in user", async () => {
    expect(await callError("purchaseTickets", { drawId: "x", ticketIds: ["y"], requestId: "abcdef" })).toBe(
      "UNAUTHENTICATED",
    );
  });

  it("asks a first-time verified number to register instead of creating a nameless profile", async () => {
    const { uid, token } = await signInWithPhone(nextPhone());
    const result = await call<{ needsRegistration: boolean }>("ensureUserProfile", {}, token);
    expect(result.needsRegistration).toBe(true);
    expect((await db.doc(`users/${uid}`).get()).exists).toBe(false);
  });

  it("requires accepting the terms to register", async () => {
    const { token } = await signInWithPhone(nextPhone());
    expect(await callError("ensureUserProfile", { fullName: "No Terms" }, token)).toBe("INVALID_ARGUMENT");
  });

  it("creates profile, empty wallet and spin account together, always as a customer", async () => {
    const user = await registerCustomer("Asha Reddy");
    const [profile, wallet, spins] = await Promise.all([
      db.doc(`users/${user.uid}`).get(),
      db.doc(`walletAccounts/${user.uid}`).get(),
      db.doc(`spinAccounts/${user.uid}`).get(),
    ]);
    expect(profile.data()).toMatchObject({ role: "customer", status: "active", phone: user.phone });
    expect(wallet.data()).toMatchObject({ balancePaise: 0, pendingDepositPaise: 0 });
    expect(spins.data()).toMatchObject({ availableSpins: 0 });
    expect(user.referralCode).toMatch(/^[A-Z0-9]{4,20}$/);
  });

  it("ignores role: admin written into a profile document — only the custom claim counts", async () => {
    const user = await registerCustomer("Forged Admin");
    await db.doc(`users/${user.uid}`).set({ role: "admin" }, { merge: true });
    expect(await callError("reviewDeposit", { depositId: "none", decision: "approve" }, user.token)).toBe(
      "PERMISSION_DENIED",
    );
    expect(await callError("setAdminClaim", { uid: user.uid, admin: true }, user.token)).toBe("PERMISSION_DENIED");
  });

  it("mirrors the custom claim into the profile role, never the payload", async () => {
    const phone = nextPhone();
    const { uid, token } = await signInWithPhone(phone);
    await adminAuth.setCustomUserClaims(uid, { role: "admin" });
    await call("ensureUserProfile", { fullName: "Claimed First", acceptedTerms: true }, token);
    expect((await db.doc(`users/${uid}`).get()).get("role")).toBe("admin");

    const forged = await registerCustomer("Forged Mirror", { role: "admin" } as never);
    expect((await db.doc(`users/${forged.uid}`).get()).get("role")).toBe("customer");
    await db.doc(`users/${forged.uid}`).set({ role: "admin" }, { merge: true });
    await call("ensureUserProfile", {}, forged.token);
    expect((await db.doc(`users/${forged.uid}`).get()).get("role")).toBe("customer");
  });

  it("lets an admin grant and revoke administrator access, audited and notified", async () => {
    const user = await registerCustomer("Future Admin");
    expect(await call("setAdminClaim", { uid: user.uid, admin: true }, admin.token)).toEqual({
      uid: user.uid,
      admin: true,
    });
    expect((await adminAuth.getUser(user.uid)).customClaims?.role).toBe("admin");
    expect((await db.doc(`users/${user.uid}`).get()).get("role")).toBe("admin");

    await call("setAdminClaim", { uid: user.uid, admin: false }, admin.token);
    expect((await adminAuth.getUser(user.uid)).customClaims?.role).toBeUndefined();
    expect((await db.doc(`users/${user.uid}`).get()).get("role")).toBe("customer");

    const audit = await db.collection("adminAuditLogs").where("entityId", "==", user.uid).get();
    expect(audit.docs.map((d) => d.get("action")).sort()).toEqual(["admin.grant", "admin.revoke"]);
    const notes = await db.collection("notifications").where("uid", "==", user.uid).get();
    expect(notes.docs.map((d) => d.get("title"))).toEqual(
      expect.arrayContaining(["You are now an administrator", "Administrator access removed"]),
    );
  });

  it("refuses admin access for suspended accounts and self-demotion", async () => {
    const user = await registerCustomer("Suspended Candidate");
    await db.doc(`users/${user.uid}`).set({ status: "suspended" }, { merge: true });
    expect(await callError("setAdminClaim", { uid: user.uid, admin: true }, admin.token)).toBe("FAILED_PRECONDITION");
    expect(await callError("setAdminClaim", { uid: admin.uid, admin: false }, admin.token)).toBe("FAILED_PRECONDITION");
  });

  it("blocks suspended accounts from privileged operations", async () => {
    const user = await registerCustomer("Suspended Person");
    await db.doc(`users/${user.uid}`).set({ status: "suspended" }, { merge: true });
    expect(
      await callError("purchaseTickets", { drawId: "x", ticketIds: ["y"], requestId: requestId() }, user.token),
    ).toBe("PERMISSION_DENIED");
  });

  it("broadcasts only to active customers, idempotently, and audit-logs it", async () => {
    const active = await registerCustomer("Active Customer");
    const suspended = await registerCustomer("Suspended Customer");
    await db.doc(`users/${suspended.uid}`).set({ status: "suspended" }, { merge: true });

    const id = requestId("bc");
    const payload = { requestId: id, type: "system", title: "Draw update", body: "Results are out soon." };
    const first = await call<{ delivered: number }>("broadcastAnnouncement", payload, admin.token);
    const second = await call<{ delivered: number }>("broadcastAnnouncement", payload, admin.token);
    expect(first.delivered).toBeGreaterThan(0);
    expect(second.delivered).toBe(first.delivered);

    const sent = await db.collection("notifications").where("title", "==", "Draw update").get();
    const recipients = sent.docs.map((d) => d.data().uid as string);
    expect(new Set(recipients).size).toBe(recipients.length);
    expect(recipients).toContain(active.uid);
    expect(recipients).not.toContain(suspended.uid);
    expect(recipients).not.toContain(admin.uid);

    const audit = await db.collection("adminAuditLogs").where("entityId", "==", id).get();
    expect(audit.size).toBeGreaterThanOrEqual(1);
  });

  it("refuses broadcasts from customers and external links", async () => {
    const user = await registerCustomer("Not Admin");
    const payload = { requestId: requestId("bc"), type: "system", title: "Hello there", body: "Body text" };
    expect(await callError("broadcastAnnouncement", payload, user.token)).toBe("PERMISSION_DENIED");
    expect(
      await callError("broadcastAnnouncement", { ...payload, href: "https://evil.example" }, admin.token),
    ).toBe("INVALID_ARGUMENT");
  });

  it("lets an admin open a read-only, audited view of a customer's account", async () => {
    const user = await registerCustomer("Viewed Customer");
    const { token } = await call<{ token: string }>("startViewAs", { uid: user.uid }, admin.token);
    const viewToken = await signInWithCustomToken(token);

    expect(await callError("ensureUserProfile", {}, viewToken)).toBe("PERMISSION_DENIED");
    expect(
      await callError("purchaseTickets", { drawId: "x", ticketIds: ["y"], requestId: requestId("vw") }, viewToken),
    ).toBe("PERMISSION_DENIED");
    expect(await callError("executeSpin", { requestId: requestId("vw") }, viewToken)).toBe("PERMISSION_DENIED");

    const audit = await db
      .collection("adminAuditLogs")
      .where("action", "==", "customer.view_as")
      .where("entityId", "==", user.uid)
      .get();
    expect(audit.size).toBe(1);
  });

  it("refuses view-as for customers and for administrator accounts", async () => {
    const user = await registerCustomer("Curious Customer");
    const other = await registerCustomer("Other Customer");
    expect(await callError("startViewAs", { uid: other.uid }, user.token)).toBe("PERMISSION_DENIED");
    const secondAdmin = await registerAdmin();
    expect(await callError("startViewAs", { uid: secondAdmin.uid }, admin.token)).toBe("FAILED_PRECONDITION");
  });
});
