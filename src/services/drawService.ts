import type { Draw, DrawResult, Ticket } from "@/types";
import { store } from "@/lib/backend";
import { slugify } from "@/utils/id";

export interface DrawStats {
  total: number;
  available: number;
  pending: number;
  booked: number;
  blocked: number;
  soldPercent: number;
}

export const drawService = {
  /** Published draws ordered by their scheduled time — used by public pages. */
  async listPublic(limit = 50): Promise<Draw[]> {
    const rows = await store.list<Draw>("draws", {
      where: [{ field: "published", op: "==", value: true }],
      orderBy: [{ field: "drawAt", dir: "asc" }],
      limit,
    });
    return rows.filter((d) => d.status !== "draft");
  },

  /** Every draw including drafts — admin only (enforced by rules). */
  async listAll(limit = 200): Promise<Draw[]> {
    return store.list<Draw>("draws", {
      orderBy: [{ field: "drawAt", dir: "desc" }],
      limit,
    });
  },

  /** `null` when the draw is missing or unpublished (unpublished draws are admin-only). */
  async getById(id: string): Promise<Draw | null> {
    try {
      return await store.get<Draw>("draws", id);
    } catch (error) {
      if ((error as { code?: string }).code === "permission-denied") return null;
      throw error;
    }
  },

  /** Published draws only — the public draw page never reveals drafts. */
  async getBySlug(slug: string): Promise<Draw | null> {
    const rows = await store.list<Draw>("draws", {
      where: [
        { field: "slug", op: "==", value: slug },
        { field: "published", op: "==", value: true },
      ],
      limit: 1,
    });
    return rows[0] ?? null;
  },

  async activeOpenDraw(): Promise<Draw | null> {
    const rows = await store.list<Draw>("draws", {
      where: [
        { field: "published", op: "==", value: true },
        { field: "status", op: "==", value: "open" },
      ],
      orderBy: [{ field: "salesCloseAt", dir: "asc" }],
      limit: 1,
    });
    return rows[0] ?? null;
  },

  async upcoming(limit = 6): Promise<Draw[]> {
    const rows = await store.list<Draw>("draws", {
      where: [{ field: "published", op: "==", value: true }],
      orderBy: [{ field: "drawAt", dir: "asc" }],
      limit: 50,
    });
    return rows.filter((d) => d.status === "upcoming" || d.status === "open").slice(0, limit);
  },

  /** Ticket inventory snapshot for one draw. */
  async stats(drawId: string): Promise<DrawStats> {
    const [total, available, pending, booked, blocked] = await Promise.all([
      store.count("tickets", { where: [{ field: "drawId", op: "==", value: drawId }] }),
      store.count("tickets", {
        where: [
          { field: "drawId", op: "==", value: drawId },
          { field: "status", op: "==", value: "available" },
        ],
      }),
      store.count("tickets", {
        where: [
          { field: "drawId", op: "==", value: drawId },
          { field: "status", op: "==", value: "pending" },
        ],
      }),
      store.count("tickets", {
        where: [
          { field: "drawId", op: "==", value: drawId },
          { field: "status", op: "==", value: "booked" },
        ],
      }),
      store.count("tickets", {
        where: [
          { field: "drawId", op: "==", value: drawId },
          { field: "status", op: "==", value: "blocked" },
        ],
      }),
    ]);
    return {
      total,
      available,
      pending,
      booked,
      blocked,
      soldPercent: total ? (booked + pending + blocked) / total : 0,
    };
  },

  /** The draw result, or `null` while it is missing or not yet published (non-admins). */
  async result(drawId: string): Promise<DrawResult | null> {
    try {
      return await store.get<DrawResult>("drawResults", drawId);
    } catch (error) {
      if ((error as { code?: string }).code === "permission-denied") return null;
      throw error;
    }
  },

  async create(input: Omit<Draw, "id" | "createdAt" | "updatedAt" | "slug"> & { slug?: string }) {
    const now = new Date().toISOString();
    const id = await store.create("draws", {
      ...input,
      slug: input.slug || slugify(input.title),
      createdAt: now,
      updatedAt: now,
    } as never);
    return id;
  },

  async update(id: string, patch: Partial<Draw>) {
    await store.update("draws", id, { ...patch, updatedAt: new Date().toISOString() });
  },

  async remove(id: string) {
    await store.remove("draws", id);
  },
};

export function ticketStatusCounts(tickets: Ticket[]) {
  return tickets.reduce(
    (acc, t) => {
      acc[t.status] += 1;
      return acc;
    },
    { available: 0, pending: 0, booked: 0, blocked: 0 } as Record<Ticket["status"], number>,
  );
}
