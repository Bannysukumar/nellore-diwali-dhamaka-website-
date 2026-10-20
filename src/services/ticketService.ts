import type { Order, OrderStatus, Paginated, Ticket, TicketStatus } from "@/types";
import { store } from "@/lib/backend";

export interface TicketPageParams {
  drawId: string;
  status?: TicketStatus | "all" | "mine" | "recent";
  ownerUid?: string;
  cursor?: number | null;
  limit?: number;
}

/**
 * Ticket access is always paginated. A draw can hold thousands of numbers and
 * the UI must never request the whole inventory in a single read.
 */
export const ticketService = {
  async page(params: TicketPageParams): Promise<Paginated<Ticket>> {
    const limit = params.limit ?? 120;
    const where = [{ field: "drawId", op: "==" as const, value: params.drawId }];

    if (params.status === "mine") {
      where.push({ field: "ownerUid", op: "==" as const, value: params.ownerUid ?? "" });
    } else if (params.status && params.status !== "all" && params.status !== "recent") {
      where.push({ field: "status", op: "==" as const, value: params.status });
    }

    const result = await store.page<Ticket>("tickets", {
      where,
      orderBy: [{ field: "number", dir: "asc" }],
      limit,
      startAfterValue: params.cursor ?? undefined,
    });

    if (params.status === "recent") {
      result.items = [...result.items].sort((a, b) => (b.purchasedAt ?? "").localeCompare(a.purchasedAt ?? ""));
    }
    return result;
  },

  /** Only returns the most recently sold tickets — used by the "Recently sold" tab. */
  async recentlySold(drawId: string, limit = 60): Promise<Ticket[]> {
    const rows = await store.list<Ticket>("tickets", {
      where: [
        { field: "drawId", op: "==", value: drawId },
        { field: "status", op: "==", value: "booked" },
      ],
      orderBy: [{ field: "purchasedAt", dir: "desc" }],
      limit,
    });
    return rows;
  },

  async mine(uid: string, limit = 200): Promise<Ticket[]> {
    return store.list<Ticket>("tickets", {
      where: [{ field: "ownerUid", op: "==", value: uid }],
      orderBy: [{ field: "purchasedAt", dir: "desc" }],
      limit,
    });
  },

  async mineForDraw(uid: string, drawId: string): Promise<Ticket[]> {
    return store.list<Ticket>("tickets", {
      where: [
        { field: "ownerUid", op: "==", value: uid },
        { field: "drawId", op: "==", value: drawId },
      ],
      orderBy: [{ field: "number", dir: "asc" }],
    });
  },

  async get(id: string): Promise<Ticket | null> {
    return store.get<Ticket>("tickets", id);
  },

  /** Exact-number lookup used by the booking page search box. */
  async search(drawId: string, query: string, limit = 40): Promise<Ticket[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const asNumber = Number(trimmed);
    if (Number.isFinite(asNumber)) {
      const rows = await store.list<Ticket>("tickets", {
        where: [
          { field: "drawId", op: "==", value: drawId },
          { field: "number", op: "==", value: asNumber },
        ],
        limit,
      });
      return rows;
    }
    // Non-numeric input: match the zero-padded label prefix.
    const rows = await store.list<Ticket>("tickets", {
      where: [{ field: "drawId", op: "==", value: drawId }],
      orderBy: [{ field: "number", dir: "asc" }],
      limit: 500,
    });
    return rows.filter((t) => t.numberLabel.includes(trimmed)).slice(0, limit);
  },

  async ordersForUser(uid: string, limit = 100): Promise<Order[]> {
    return store.list<Order>("orders", {
      where: [{ field: "uid", op: "==", value: uid }],
      orderBy: [{ field: "createdAt", dir: "desc" }],
      limit,
    });
  },

  async allOrders(limit = 200, status?: OrderStatus): Promise<Order[]> {
    return store.list<Order>("orders", {
      where: status ? [{ field: "status", op: "==", value: status }] : undefined,
      orderBy: [{ field: "createdAt", dir: "desc" }],
      limit,
    });
  },

  /** Server-side totals for every order in one status (admin metric). */
  async orderTotals(status: OrderStatus): Promise<{ count: number; totalPaise: number; quantity: number }> {
    const { count, sums } = await store.aggregate(
      "orders",
      { where: [{ field: "status", op: "==", value: status }] },
      ["totalPaise", "quantity"],
    );
    return { count, totalPaise: sums.totalPaise, quantity: sums.quantity };
  },
};
