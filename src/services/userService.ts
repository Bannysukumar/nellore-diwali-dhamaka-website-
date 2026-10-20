import type { AppNotification, UserProfile } from "@/types";
import { store } from "@/lib/backend";

export const userService = {
  async profile(uid: string): Promise<UserProfile | null> {
    return store.get<UserProfile>("users", uid);
  },

  async updateProfile(uid: string, patch: Partial<Pick<UserProfile, "fullName" | "email" | "address">>) {
    await store.update("users", uid, {
      ...patch,
      updatedAt: new Date().toISOString(),
    });
  },

  /** Live list of notifications for the signed-in user, newest first. */
  subscribeNotifications(
    uid: string,
    cb: (rows: AppNotification[]) => void,
    onError?: (error: Error) => void,
  ): () => void {
    return store.subscribe<AppNotification>(
      "notifications",
      {
        where: [{ field: "uid", op: "==", value: uid }],
        orderBy: [{ field: "createdAt", dir: "desc" }],
        limit: 100,
      },
      cb,
      onError,
    );
  },

  async notifications(uid: string, limit = 100): Promise<AppNotification[]> {
    return store.list<AppNotification>("notifications", {
      where: [{ field: "uid", op: "==", value: uid }],
      orderBy: [{ field: "createdAt", dir: "desc" }],
      limit,
    });
  },

  async markNotificationRead(uid: string, id: string) {
    await store.update("notifications", id, { read: true });
    void uid;
  },

  async markAllRead(uid: string, ids: string[]) {
    await Promise.all(ids.map((id) => store.update("notifications", id, { read: true })));
    void uid;
  },

  /* -------------------------------------------------------------- admin */

  async listCustomers(limit = 300, status?: UserProfile["status"]): Promise<UserProfile[]> {
    return store.list<UserProfile>("users", {
      where: [
        { field: "role", op: "==", value: "customer" },
        ...(status ? [{ field: "status", op: "==" as const, value: status }] : []),
      ],
      orderBy: [{ field: "createdAt", dir: "desc" }],
      limit,
    });
  },

  async listAdmins(limit = 100): Promise<UserProfile[]> {
    return store.list<UserProfile>("users", {
      where: [{ field: "role", op: "==", value: "admin" }],
      orderBy: [{ field: "createdAt", dir: "desc" }],
      limit,
    });
  },

  async customer(uid: string): Promise<UserProfile | null> {
    return store.get<UserProfile>("users", uid);
  },

  async setCustomerStatus(uid: string, status: UserProfile["status"], reason?: string) {
    await store.update("users", uid, {
      status,
      suspendedReason: status === "suspended" ? reason : undefined,
      updatedAt: new Date().toISOString(),
    });
  },

  async countCustomers(): Promise<number> {
    return store.count("users", { where: [{ field: "role", op: "==", value: "customer" }] });
  },

  async allProfilesByUids(uids: string[]): Promise<Record<string, UserProfile>> {
    const unique = Array.from(new Set(uids.filter(Boolean)));
    const rows = await Promise.all(unique.map((uid) => store.get<UserProfile>("users", uid)));
    return rows.reduce<Record<string, UserProfile>>((acc, row) => {
      if (row) acc[row.uid] = row;
      return acc;
    }, {});
  },
};
