import type {
  DepositRequest,
  DepositStatus,
  PaymentQrCode,
  WalletAccount,
  WalletTransaction,
  WalletTransfer,
} from "@/types";
import { store } from "@/lib/backend";

export const walletService = {
  /**
   * A wallet document is created server-side on the first ledger movement, so
   * a missing document genuinely means a zero balance.
   */
  async account(uid: string): Promise<WalletAccount> {
    const account = await store.get<WalletAccount>("walletAccounts", uid);
    return (
      account ?? {
        uid,
        balancePaise: 0,
        totalDepositedPaise: 0,
        totalSpentPaise: 0,
        pendingDepositPaise: 0,
        updatedAt: "",
      }
    );
  },

  /** Wallet documents for the admin customer list (admins only). */
  async accounts(limit = 500): Promise<WalletAccount[]> {
    return store.list<WalletAccount>("walletAccounts", { limit });
  },

  /** The ledger is append-only and read in reverse chronological order. */
  async transactions(uid: string, limit = 100): Promise<WalletTransaction[]> {
    return store.list<WalletTransaction>("walletTransactions", {
      where: [{ field: "uid", op: "==", value: uid }],
      orderBy: [{ field: "createdAt", dir: "desc" }],
      limit,
    });
  },

  /** Every customer-to-customer transfer, newest first (admins only). */
  async allTransfers(limit = 500): Promise<WalletTransfer[]> {
    return store.list<WalletTransfer>("walletTransfers", {
      orderBy: [{ field: "createdAt", dir: "desc" }],
      limit,
    });
  },

  async allTransactions(limit = 300, type?: WalletTransaction["type"]): Promise<WalletTransaction[]> {
    return store.list<WalletTransaction>("walletTransactions", {
      where: type ? [{ field: "type", op: "==", value: type }] : undefined,
      orderBy: [{ field: "createdAt", dir: "desc" }],
      limit,
    });
  },

  /** Lifetime credit and debit totals across the whole ledger (admin metric). */
  async ledgerTotals(): Promise<{ creditsPaise: number; debitsPaise: number; entries: number }> {
    const byDirection = (direction: WalletTransaction["direction"]) =>
      store.aggregate("walletTransactions", { where: [{ field: "direction", op: "==", value: direction }] }, [
        "amountPaise",
      ]);
    const [credits, debits] = await Promise.all([byDirection("credit"), byDirection("debit")]);
    return {
      creditsPaise: credits.sums.amountPaise,
      debitsPaise: debits.sums.amountPaise,
      entries: credits.count + debits.count,
    };
  },

  async deposits(uid: string, limit = 100): Promise<DepositRequest[]> {
    return store.list<DepositRequest>("depositRequests", {
      where: [{ field: "uid", op: "==", value: uid }],
      orderBy: [{ field: "submittedAt", dir: "desc" }],
      limit,
    });
  },

  /** Filters server-side, so a status view is never truncated by other statuses. */
  async allDeposits(status?: DepositStatus | DepositStatus[], limit = 200): Promise<DepositRequest[]> {
    const where = Array.isArray(status)
      ? [{ field: "status", op: "in" as const, value: status }]
      : status
        ? [{ field: "status", op: "==" as const, value: status }]
        : undefined;
    return store.list<DepositRequest>("depositRequests", {
      where,
      orderBy: [{ field: "submittedAt", dir: "desc" }],
      limit,
    });
  },

  async deposit(id: string): Promise<DepositRequest | null> {
    return store.get<DepositRequest>("depositRequests", id);
  },

  /** Live view of one of the caller's own deposits, e.g. to follow a pay-and-book request. */
  watchDeposit(
    uid: string,
    id: string,
    cb: (deposit: DepositRequest | null) => void,
    onError?: (error: Error) => void,
  ): () => void {
    return store.subscribe<DepositRequest>(
      "depositRequests",
      {
        where: [
          { field: "uid", op: "==", value: uid },
          { field: "id", op: "==", value: id },
        ],
        limit: 1,
      },
      (rows) => cb(rows[0] ?? null),
      onError,
    );
  },

  async qrCodes(activeOnly = false): Promise<PaymentQrCode[]> {
    return store.list<PaymentQrCode>("paymentQrCodes", {
      where: activeOnly ? [{ field: "active", op: "==", value: true }] : undefined,
      orderBy: [{ field: "createdAt", dir: "desc" }],
    });
  },

  async qrCode(id: string): Promise<PaymentQrCode | null> {
    return store.get<PaymentQrCode>("paymentQrCodes", id);
  },

  /** Total wallet liability across all accounts (admin metric). */
  async totalLiability(): Promise<number> {
    const { sums } = await store.aggregate("walletAccounts", undefined, ["balancePaise"]);
    return sums.balancePaise;
  },

  async pendingDepositTotal(): Promise<{ count: number; amountPaise: number }> {
    return walletService.depositTotals(["pending", "requires_review"], "amountPaise");
  },

  /** Server-side count and total for deposits in the given statuses. */
  async depositTotals(
    statuses: DepositStatus[],
    amountField: "amountPaise" | "verifiedAmountPaise",
  ): Promise<{ count: number; amountPaise: number }> {
    const { count, sums } = await store.aggregate(
      "depositRequests",
      { where: [{ field: "status", op: "in", value: statuses }] },
      [amountField],
    );
    return { count, amountPaise: sums[amountField] };
  },
};
