import type { Referral, Reward, SpinAccount, SpinConfig, SpinTransaction, WheelSegment } from "@/types";
import { store } from "@/lib/backend";
import { APP_ORIGIN } from "@/lib/firebase/config";

export const rewardService = {
  async spinConfig(): Promise<SpinConfig | null> {
    const row = await store.get<SpinConfig & { id: string }>("siteSettings", "spin");
    if (!row) return null;
    const { id: _id, ...config } = row;
    void _id;
    return config;
  },

  async spinAccount(uid: string): Promise<SpinAccount> {
    const account = await store.get<SpinAccount>("spinAccounts", uid);
    return (
      account ?? { uid, availableSpins: 0, totalEarned: 0, totalUsed: 0, updatedAt: new Date().toISOString() }
    );
  },

  async spinHistory(uid: string, limit = 60): Promise<SpinTransaction[]> {
    return store.list<SpinTransaction>("spinTransactions", {
      where: [{ field: "uid", op: "==", value: uid }],
      orderBy: [{ field: "createdAt", dir: "desc" }],
      limit,
    });
  },

  async allSpinTransactions(limit = 200): Promise<SpinTransaction[]> {
    return store.list<SpinTransaction>("spinTransactions", {
      orderBy: [{ field: "createdAt", dir: "desc" }],
      limit,
    });
  },

  async rewards(): Promise<Reward[]> {
    return store.list<Reward>("rewards", { orderBy: [{ field: "name", dir: "asc" }], limit: 200 });
  },

  async saveReward(reward: Reward) {
    await store.set("rewards", reward.id, {
      ...reward,
      updatedAt: new Date().toISOString(),
    } as never);
  },

  async removeReward(id: string) {
    await store.remove("rewards", id);
  },

  async saveSpinConfig(config: SpinConfig) {
    await store.set("siteSettings", "spin", {
      ...config,
      updatedAt: new Date().toISOString(),
    } as never);
  },

  async activeSegments(): Promise<WheelSegment[]> {
    const config = await this.spinConfig();
    return (config?.segments ?? []).filter((s) => s.active);
  },

  /* ----------------------------------------------------------- referrals */

  async referralsByReferrer(uid: string, limit = 100): Promise<Referral[]> {
    return store.list<Referral>("referrals", {
      where: [{ field: "referrerUid", op: "==", value: uid }],
      orderBy: [{ field: "createdAt", dir: "desc" }],
      limit,
    });
  },

  async allReferrals(limit = 200, status?: Referral["status"]): Promise<Referral[]> {
    return store.list<Referral>("referrals", {
      where: status ? [{ field: "status", op: "==", value: status }] : undefined,
      orderBy: [{ field: "createdAt", dir: "desc" }],
      limit,
    });
  },

  referralLink(code: string): string {
    return `${APP_ORIGIN}/register?ref=${encodeURIComponent(code)}`;
  },

  whatsappShareUrl(code: string, brandName: string): string {
    const link = this.referralLink(code);
    const message = `🪔 ${brandName}: join with my referral code ${code} and get festival rewards. ${link}`;
    return `https://wa.me/?text=${encodeURIComponent(message)}`;
  },

  /** Referral counts for the admin overview, aggregated server-side. */
  async referralSummary() {
    const byStatus = (status: Referral["status"]) =>
      store.count("referrals", { where: [{ field: "status", op: "==", value: status }] });
    const [all, qualified, pending] = await Promise.all([
      store.aggregate("referrals", undefined, ["rewardSpins"]),
      byStatus("qualified"),
      byStatus("pending"),
    ]);
    return {
      total: all.count,
      qualified,
      pending,
      spinsGranted: all.sums.rewardSpins,
    };
  },

  /** Unused spins held across all accounts (admin metric). */
  async totalAvailableSpins(): Promise<number> {
    const { sums } = await store.aggregate("spinAccounts", undefined, ["availableSpins"]);
    return sums.availableSpins;
  },
};
