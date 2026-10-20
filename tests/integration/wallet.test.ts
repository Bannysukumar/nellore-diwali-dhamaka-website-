import { beforeAll, describe, expect, it } from "vitest";
import {
  call,
  callError,
  db,
  ledgerOf,
  nextUtr,
  registerAdmin,
  registerCustomer,
  requestId,
  resetEmulators,
  uploadScreenshot,
  walletOf,
  writePaymentQr,
  writeSettings,
  type TestUser,
} from "./harness";

describe("wallet deposits and manual verification", () => {
  let admin: TestUser;
  let qrId: string;

  beforeAll(async () => {
    await resetEmulators();
    await writeSettings();
    qrId = await writePaymentQr();
    admin = await registerAdmin();
  });

  async function submit(user: TestUser, overrides: Record<string, unknown> = {}) {
    const screenshotPath = await uploadScreenshot(user.uid);
    return call<{ depositId: string; status: string }>(
      "submitDeposit",
      { amountPaise: 50_000, qrId, utr: nextUtr(), screenshotPath, requestId: requestId("dep"), ...overrides },
      user.token,
    );
  }

  it("rejects a deposit whose screenshot was never uploaded", async () => {
    const user = await registerCustomer("No Screenshot");
    const status = await callError(
      "submitDeposit",
      {
        amountPaise: 50_000,
        qrId,
        utr: nextUtr(),
        screenshotPath: `deposit-screenshots/${user.uid}/missing.png`,
        requestId: requestId("dep"),
      },
      user.token,
    );
    expect(status).toBe("INVALID_ARGUMENT");
    expect((await walletOf(user.uid)).pendingDepositPaise).toBe(0);
  });

  it("rejects a screenshot from another customer's folder", async () => {
    const owner = await registerCustomer("Screenshot Owner");
    const thief = await registerCustomer("Screenshot Thief");
    const foreignPath = await uploadScreenshot(owner.uid);
    expect(
      await callError(
        "submitDeposit",
        { amountPaise: 50_000, qrId, utr: nextUtr(), screenshotPath: foreignPath, requestId: requestId("dep") },
        thief.token,
      ),
    ).toBe("INVALID_ARGUMENT");
  });

  it("enforces the configured minimum deposit", async () => {
    const user = await registerCustomer("Tiny Deposit");
    await expect(submit(user, { amountPaise: 100 })).rejects.toMatchObject({ status: "INVALID_ARGUMENT" });
  });

  it("records a submitted UTR as pending without crediting the wallet", async () => {
    const user = await registerCustomer("Pending Payer");
    const deposit = await submit(user);
    expect(deposit.status).toBe("pending");
    const wallet = await walletOf(user.uid);
    expect(wallet.balancePaise).toBe(0);
    expect(wallet.pendingDepositPaise).toBe(50_000);
    expect(await ledgerOf(user.uid)).toHaveLength(0);
  });

  it("treats a replayed submission as the same deposit", async () => {
    const user = await registerCustomer("Replay Payer");
    const screenshotPath = await uploadScreenshot(user.uid);
    const payload = { amountPaise: 50_000, qrId, utr: nextUtr(), screenshotPath, requestId: requestId("dep") };
    const first = await call<{ depositId: string }>("submitDeposit", payload, user.token);
    const second = await call<{ depositId: string }>("submitDeposit", payload, user.token);
    expect(second.depositId).toBe(first.depositId);
    const rows = await db.collection("depositRequests").where("uid", "==", user.uid).get();
    expect(rows.size).toBe(1);
    expect((await walletOf(user.uid)).pendingDepositPaise).toBe(50_000);
  });

  it("does not let a customer review deposits", async () => {
    const user = await registerCustomer("Self Approver");
    const deposit = await submit(user);
    expect(await callError("reviewDeposit", { depositId: deposit.depositId, decision: "approve" }, user.token)).toBe(
      "PERMISSION_DENIED",
    );
    expect((await walletOf(user.uid)).balancePaise).toBe(0);
  });

  it("credits exactly once when approvals and a rejection race", async () => {
    const user = await registerCustomer("Racing Approvals");
    const deposit = await submit(user);
    const attempts = await Promise.allSettled([
      call("reviewDeposit", { depositId: deposit.depositId, decision: "approve" }, admin.token),
      call("reviewDeposit", { depositId: deposit.depositId, decision: "approve" }, admin.token),
      call("reviewDeposit", { depositId: deposit.depositId, decision: "reject", reason: "Race" }, admin.token),
    ]);
    expect(attempts.some((a) => a.status === "fulfilled")).toBe(true);

    const stored = (await db.doc(`depositRequests/${deposit.depositId}`).get()).data();
    const wallet = await walletOf(user.uid);
    const credits = (await ledgerOf(user.uid)).filter((t) => t.type === "deposit");
    expect(wallet.pendingDepositPaise).toBe(0);
    if (stored?.status === "approved") {
      expect(credits).toHaveLength(1);
      expect(wallet.balancePaise).toBe(50_000);
    } else {
      expect(stored?.status).toBe("rejected");
      expect(credits).toHaveLength(0);
      expect(wallet.balancePaise).toBe(0);
    }
  });

  it("credits the verified amount when it differs from the declared one", async () => {
    const user = await registerCustomer("Partial Payer");
    const deposit = await submit(user);
    await call("reviewDeposit", { depositId: deposit.depositId, decision: "approve", verifiedAmountPaise: 30_000 }, admin.token);
    const wallet = await walletOf(user.uid);
    expect(wallet.balancePaise).toBe(30_000);
    expect(wallet.pendingDepositPaise).toBe(0);
  });

  it("requires a reason to reject and never credits a rejected deposit", async () => {
    const user = await registerCustomer("Rejected Payer");
    const deposit = await submit(user);
    expect(await callError("reviewDeposit", { depositId: deposit.depositId, decision: "reject" }, admin.token)).toBe(
      "INVALID_ARGUMENT",
    );
    await call("reviewDeposit", { depositId: deposit.depositId, decision: "reject", reason: "No such UTR" }, admin.token);
    await call("reviewDeposit", { depositId: deposit.depositId, decision: "approve" }, admin.token);
    const wallet = await walletOf(user.uid);
    expect(wallet.balancePaise).toBe(0);
    expect(wallet.pendingDepositPaise).toBe(0);
  });

  it("routes a UTR already used by someone else to manual review", async () => {
    const first = await registerCustomer("First UTR");
    const second = await registerCustomer("Second UTR");
    const utr = nextUtr();
    await submit(first, { utr });
    const duplicate = await submit(second, { utr });
    expect(duplicate.status).toBe("requires_review");
  });

  it("never credits the same UTR twice, even when both requests are approved concurrently", async () => {
    const first = await registerCustomer("UTR Holder");
    const second = await registerCustomer("UTR Reuser");
    const utr = nextUtr();
    const a = await submit(first, { utr });
    const b = await submit(second, { utr });

    const attempts = await Promise.allSettled([
      call("reviewDeposit", { depositId: a.depositId, decision: "approve" }, admin.token),
      call("reviewDeposit", { depositId: b.depositId, decision: "approve" }, admin.token),
    ]);
    expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const refused = attempts.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(refused.reason).toMatchObject({ status: "FAILED_PRECONDITION" });

    const balances = [(await walletOf(first.uid)).balancePaise, (await walletOf(second.uid)).balancePaise];
    expect(balances.reduce((sum, v) => sum + v, 0)).toBe(50_000);

    const loser = attempts[0].status === "fulfilled" ? b : a;
    await call("reviewDeposit", { depositId: loser.depositId, decision: "reject", reason: "UTR already credited" }, admin.token);
    expect((await db.doc(`depositRequests/${loser.depositId}`).get()).get("status")).toBe("rejected");
  });

  it("lets only an administrator adjust a balance, through the ledger, exactly once per request", async () => {
    const user = await registerCustomer("Adjusted Customer");
    const credit = (mode: string, amountPaise: number, id = requestId("adj"), token = admin.token) =>
      call<{ deltaPaise: number; balancePaise: number }>(
        "adjustWallet",
        { requestId: id, uid: user.uid, mode, amountPaise, reason: "Counter cash" },
        token,
      );

    expect(
      await callError(
        "adjustWallet",
        { requestId: requestId("adj"), uid: user.uid, mode: "credit", amountPaise: 10_000, reason: "Self credit" },
        user.token,
      ),
    ).toBe("PERMISSION_DENIED");

    const id = requestId("adj");
    expect(await credit("credit", 10_000, id)).toMatchObject({ deltaPaise: 10_000, balancePaise: 10_000 });
    expect(await credit("credit", 10_000, id)).toMatchObject({ balancePaise: 10_000 });
    expect((await walletOf(user.uid)).balancePaise).toBe(10_000);

    expect(await credit("debit", 2_500)).toMatchObject({ deltaPaise: -2_500, balancePaise: 7_500 });
    expect(await credit("set", 20_000)).toMatchObject({ deltaPaise: 12_500, balancePaise: 20_000 });
    expect(await credit("set", 0)).toMatchObject({ deltaPaise: -20_000, balancePaise: 0 });
    expect(
      await callError(
        "adjustWallet",
        { requestId: requestId("adj"), uid: user.uid, mode: "debit", amountPaise: 1, reason: "Overdraw" },
        admin.token,
      ),
    ).toBe("FAILED_PRECONDITION");

    const adjustments = (await ledgerOf(user.uid)).filter((t) => t.type === "adjustment");
    expect(adjustments).toHaveLength(4);
    const net = adjustments.reduce((sum, t) => sum + (t.direction === "credit" ? t.amountPaise : -t.amountPaise), 0);
    expect(net).toBe((await walletOf(user.uid)).balancePaise);
  });
});
