import { beforeAll, describe, expect, it } from "vitest";
import {
  call,
  callError,
  db,
  fundWallet,
  ledgerOf,
  registerAdmin,
  registerCustomer,
  requestId,
  resetEmulators,
  walletOf,
  writePaymentQr,
  writeSettings,
  type TestUser,
} from "./harness";

interface TransferResult {
  transferId: string;
  amountPaise: number;
  balancePaise: number;
  recipientName: string;
}

describe("customer-to-customer wallet transfers", () => {
  let admin: TestUser;

  beforeAll(async () => {
    await resetEmulators();
    await writeSettings();
    await writePaymentQr();
    admin = await registerAdmin();
  });

  const localNumber = (phone: string) => phone.replace(/^\+91/, "");

  it("looks up a recipient by mobile number and shows only a masked name", async () => {
    const sender = await registerCustomer("Lookup Sender");
    const recipient = await registerCustomer("Ravi Kumar");
    const found = await call<{ maskedName: string; phoneMasked: string }>(
      "findTransferRecipient",
      { phone: localNumber(recipient.phone) },
      sender.token,
    );
    expect(found.maskedName).toBe("Ravi K.");
    expect(found.phoneMasked).not.toContain(localNumber(recipient.phone));
  });

  it("moves money between two wallets with a matched debit and credit", async () => {
    const sender = await registerCustomer("Money Sender");
    const recipient = await registerCustomer("Money Receiver");
    await fundWallet(sender, admin, 50_000);

    const result = await call<TransferResult>(
      "transferFunds",
      { requestId: requestId("trf"), toPhone: localNumber(recipient.phone), amountPaise: 20_000, note: "Diwali" },
      sender.token,
    );
    expect(result.amountPaise).toBe(20_000);
    expect(result.balancePaise).toBe(30_000);

    expect((await walletOf(sender.uid)).balancePaise).toBe(30_000);
    expect((await walletOf(recipient.uid)).balancePaise).toBe(20_000);

    const debit = (await ledgerOf(sender.uid)).find((row) => row.type === "transfer_out");
    const credit = (await ledgerOf(recipient.uid)).find((row) => row.type === "transfer_in");
    expect(debit).toMatchObject({ direction: "debit", amountPaise: 20_000, refId: result.transferId });
    expect(credit).toMatchObject({ direction: "credit", amountPaise: 20_000, refId: result.transferId });

    const record = (await db.doc(`walletTransfers/${result.transferId}`).get()).data();
    expect(record).toMatchObject({
      fromUid: sender.uid,
      toUid: recipient.uid,
      amountPaise: 20_000,
      note: "Diwali",
      status: "completed",
      fromBalanceAfterPaise: 30_000,
      toBalanceAfterPaise: 20_000,
    });
  });

  it("applies a replayed request only once", async () => {
    const sender = await registerCustomer("Replay Sender");
    const recipient = await registerCustomer("Replay Receiver");
    await fundWallet(sender, admin, 50_000);
    const payload = { requestId: requestId("trf"), toPhone: recipient.phone, amountPaise: 10_000 };

    const first = await call<TransferResult>("transferFunds", payload, sender.token);
    const second = await call<TransferResult>("transferFunds", payload, sender.token);
    expect(second.transferId).toBe(first.transferId);
    expect((await walletOf(sender.uid)).balancePaise).toBe(40_000);
    expect((await walletOf(recipient.uid)).balancePaise).toBe(10_000);
  });

  it("refuses a transfer larger than the sender's balance and moves nothing", async () => {
    const sender = await registerCustomer("Short Sender");
    const recipient = await registerCustomer("Short Receiver");
    await fundWallet(sender, admin, 50_000);
    const status = await callError(
      "transferFunds",
      { requestId: requestId("trf"), toPhone: recipient.phone, amountPaise: 60_000 },
      sender.token,
    );
    expect(status).toBe("FAILED_PRECONDITION");
    expect((await walletOf(sender.uid)).balancePaise).toBe(50_000);
    expect((await ledgerOf(recipient.uid)).filter((row) => row.type === "transfer_in")).toHaveLength(0);
  });

  it("never lets money be sent to an administrator account", async () => {
    const sender = await registerCustomer("Admin Target Sender");
    await fundWallet(sender, admin, 50_000);
    expect(await callError("findTransferRecipient", { phone: admin.phone }, sender.token)).toBe(
      "FAILED_PRECONDITION",
    );
    expect(
      await callError(
        "transferFunds",
        { requestId: requestId("trf"), toPhone: admin.phone, amountPaise: 10_000 },
        sender.token,
      ),
    ).toBe("FAILED_PRECONDITION");
    expect((await walletOf(sender.uid)).balancePaise).toBe(50_000);
  });

  it("refuses transfers to yourself and to unregistered numbers", async () => {
    const sender = await registerCustomer("Self Sender");
    await fundWallet(sender, admin, 50_000);
    expect(
      await callError(
        "transferFunds",
        { requestId: requestId("trf"), toPhone: sender.phone, amountPaise: 10_000 },
        sender.token,
      ),
    ).toBe("FAILED_PRECONDITION");
    expect(await callError("findTransferRecipient", { phone: "9999999999" }, sender.token)).toBe(
      "FAILED_PRECONDITION",
    );
    expect(await callError("findTransferRecipient", { phone: "12345" }, sender.token)).toBe("INVALID_ARGUMENT");
  });

  it("does not let an administrator send a customer transfer", async () => {
    const recipient = await registerCustomer("Admin Sender Target");
    expect(
      await callError(
        "transferFunds",
        { requestId: requestId("trf"), toPhone: recipient.phone, amountPaise: 10_000 },
        admin.token,
      ),
    ).toBe("PERMISSION_DENIED");
  });

  it("rejects amounts outside the per-transfer limits", async () => {
    const sender = await registerCustomer("Limit Sender");
    const recipient = await registerCustomer("Limit Receiver");
    for (const amountPaise of [50, 5_000_100, 150.5]) {
      expect(
        await callError(
          "transferFunds",
          { requestId: requestId("trf"), toPhone: recipient.phone, amountPaise },
          sender.token,
        ),
      ).toBe("INVALID_ARGUMENT");
    }
  });

  it("requires a signed-in caller", async () => {
    expect(await callError("findTransferRecipient", { phone: "9000000000" })).toBe("UNAUTHENTICATED");
  });
});
