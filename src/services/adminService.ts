import type { AdminAuditLog, DepositRequest, Ticket } from "@/types";
import { store, type WhereClause } from "@/lib/backend";
import { callBackend } from "@/lib/backend/callBackend";
import type { LogAdminActionRequest } from "@/lib/backend/api";
import { walletService } from "./walletService";
import { userService } from "./userService";
import { drawService } from "./drawService";
import { rewardService } from "./rewardService";

export interface AdminOverview {
  customers: number;
  activeDraws: number;
  totalDraws: number;
  ticketsSold: number;
  ticketsAvailable: number;
  pendingDeposits: { count: number; amountPaise: number };
  approvedDeposits: { count: number; amountPaise: number };
  rejectedDeposits: { count: number; amountPaise: number };
  walletLiabilityPaise: number;
  ticketSalesPaise: number;
  referralActivity: { total: number; qualified: number; pending: number; spinsGranted: number };
  availableSpins: number;
  upcomingDraws: number;
  recentWinners: number;
}

export const adminService = {
  /**
   * Every figure below is a server-side aggregation over the whole collection
   * (count/sum queries, no row caps). Deposits, ticket sales and wallet
   * balances are reported separately — wallet deposits are NOT revenue, and
   * refunded orders are excluded from sales.
   */
  async overview(): Promise<AdminOverview> {
    const byStatus = (path: string, status: string) =>
      store.count(path, { where: [{ field: "status", op: "==", value: status }] });
    const [
      customers,
      draws,
      sold,
      available,
      pending,
      approved,
      rejected,
      liability,
      sales,
      referralActivity,
      winners,
      availableSpins,
    ] = await Promise.all([
      userService.countCustomers(),
      drawService.listAll(500),
      byStatus("tickets", "booked"),
      byStatus("tickets", "available"),
      walletService.pendingDepositTotal(),
      walletService.depositTotals(["approved"], "verifiedAmountPaise"),
      walletService.depositTotals(["rejected"], "amountPaise"),
      walletService.totalLiability(),
      store.aggregate("orders", { where: [{ field: "status", op: "==", value: "completed" }] }, ["totalPaise"]),
      rewardService.referralSummary(),
      byStatus("winnerAnnouncements", "published"),
      rewardService.totalAvailableSpins(),
    ]);

    return {
      customers,
      activeDraws: draws.filter((d) =>
        ["open", "upcoming", "sales_closed", "in_progress", "results_pending"].includes(d.status),
      ).length,
      totalDraws: draws.length,
      ticketsSold: sold,
      ticketsAvailable: available,
      pendingDeposits: pending,
      approvedDeposits: approved,
      rejectedDeposits: rejected,
      walletLiabilityPaise: liability,
      ticketSalesPaise: sales.sums.totalPaise,
      referralActivity,
      availableSpins,
      upcomingDraws: draws.filter((d) => d.status === "upcoming" || d.status === "open").length,
      recentWinners: winners,
    };
  },

  /**
   * Server-side counts per status across a whole collection, plus the total.
   * Used for headline figures so they never depend on how many rows a list
   * view happens to have loaded.
   */
  async countByStatus<S extends string>(
    path: string,
    statuses: readonly S[],
    extra: WhereClause[] = [],
  ): Promise<Record<S | "total", number>> {
    const [total, ...counts] = await Promise.all([
      store.count(path, extra.length ? { where: extra } : undefined),
      ...statuses.map((status) =>
        store.count(path, { where: [...extra, { field: "status", op: "==", value: status }] }),
      ),
    ]);
    const result = { total } as Record<S | "total", number>;
    statuses.forEach((status, index) => {
      result[status] = counts[index];
    });
    return result;
  },

  async auditLogs(limit = 200): Promise<AdminAuditLog[]> {
    return store.list<AdminAuditLog>("adminAuditLogs", {
      orderBy: [{ field: "createdAt", dir: "desc" }],
      limit,
    });
  },

  /**
   * Adds the operator's own description of a console action to the audit log.
   * The server stamps the actor from the verified token (any actor fields
   * passed here are ignored), and the underlying data change is recorded
   * independently by server-side audit triggers — so a failure here is
   * reported but never undoes or blocks the action itself.
   */
  async log(entry: Omit<AdminAuditLog, "id" | "createdAt" | "actorUid" | "actorName"> & {
    actorUid?: string;
    actorName?: string;
  }) {
    try {
      await callBackend<LogAdminActionRequest, { ok: true }>("logAdminAction", {
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        note: entry.note,
        before: entry.before,
        after: entry.after,
      });
    } catch (error) {
      console.warn("[audit] could not record admin note", error);
    }
  },

  /** Everything an administrator needs when investigating one deposit. */
  async depositContext(deposit: DepositRequest): Promise<{
    customerTickets: Ticket[];
    previousDeposits: DepositRequest[];
  }> {
    const [customerTickets, previousDeposits] = await Promise.all([
      store.list<Ticket>("tickets", {
        where: [{ field: "ownerUid", op: "==", value: deposit.uid }],
        orderBy: [{ field: "purchasedAt", dir: "desc" }],
        limit: 50,
      }),
      walletService.deposits(deposit.uid, 50),
    ]);
    return { customerTickets, previousDeposits };
  },

  /** Detects other deposit requests sharing the same UTR. */
  async duplicateUtrs(utr: string, excludeId: string): Promise<DepositRequest[]> {
    const rows = await store.list<DepositRequest>("depositRequests", {
      where: [{ field: "utr", op: "==", value: utr }],
      limit: 50,
    });
    return rows.filter((r) => r.id !== excludeId);
  },
};
