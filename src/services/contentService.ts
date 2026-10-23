import type {
  Banner,
  BannerSlot,
  LegalPage,
  PerformanceSettings,
  SiteSettings,
  SiteVideo,
  BottomNavSetting,
  SplashConfig,
  TicketPackage,
  WinnerAnnouncement,
  PrizeTier,
} from "@/types";
import { store } from "@/lib/backend";

export const contentService = {
  async settings(): Promise<SiteSettings | null> {
    const row = await store.get<SiteSettings & { id: string }>("siteSettings", "general");
    if (!row) return null;
    const { id: _id, ...settings } = row;
    void _id;
    return settings;
  },

  async splash(): Promise<SplashConfig | null> {
    const row = await store.get<SplashConfig & { id: string }>("siteSettings", "splash");
    if (!row) return null;
    const { id: _id, ...config } = row;
    void _id;
    return config;
  },

  /** A splash is only shown when enabled and inside its schedule window. */
  isSplashActive(config: SplashConfig | null, at = Date.now()): boolean {
    if (!config?.enabled) return false;
    const start = config.startAt ? new Date(config.startAt).getTime() : -Infinity;
    const end = config.endAt ? new Date(config.endAt).getTime() : Infinity;
    return at >= start && at <= end;
  },

  async banners(slot?: BannerSlot, activeOnly = true): Promise<Banner[]> {
    const where = [];
    if (slot) where.push({ field: "slot", op: "==" as const, value: slot });
    if (activeOnly) where.push({ field: "active", op: "==" as const, value: true });
    const rows = await store.list<Banner>("banners", {
      where: where.length ? where : undefined,
      orderBy: [{ field: "sortOrder", dir: "asc" }],
    });
    return activeOnly ? contentService.activeOnly(rows) : rows;
  },

  /** Banners inside their scheduled window (an unset bound is open-ended). */
  activeOnly(rows: Banner[], at = Date.now()): Banner[] {
    return rows.filter((b) => {
      const start = b.startAt ? new Date(b.startAt).getTime() : -Infinity;
      const end = b.endAt ? new Date(b.endAt).getTime() : Infinity;
      return at >= start && at <= end;
    });
  },

  async allBanners(): Promise<Banner[]> {
    return store.list<Banner>("banners", { orderBy: [{ field: "sortOrder", dir: "asc" }], limit: 200 });
  },

  /** Administrator-editable ticket packages (marketing presets). */
  async packages(): Promise<TicketPackage[]> {
    const row = await store.get<{ items?: TicketPackage[] }>("siteSettings", "packages");
    return (row?.items ?? []).filter((p) => p.enabled).sort((a, b) => a.sortOrder - b.sortOrder);
  },

  async allPackages(): Promise<TicketPackage[]> {
    const row = await store.get<{ items?: TicketPackage[] }>("siteSettings", "packages");
    return (row?.items ?? []).sort((a, b) => a.sortOrder - b.sortOrder);
  },

  async savePackages(items: TicketPackage[]) {
    await store.set("siteSettings", "packages", {
      items: items.sort((a, b) => a.sortOrder - b.sortOrder),
      updatedAt: new Date().toISOString(),
    });
  },

  /** Every YouTube video placement, including disabled ones, for the admin editor. */
  async allVideos(): Promise<SiteVideo[]> {
    const row = await store.get<{ items?: SiteVideo[] }>("siteSettings", "videos");
    return (row?.items ?? []).sort((a, b) => a.sortOrder - b.sortOrder);
  },

  async saveVideos(items: SiteVideo[]) {
    await store.set("siteSettings", "videos", {
      items: items.map((item, index) => ({ ...item, sortOrder: index })),
      updatedAt: new Date().toISOString(),
    });
  },

  async saveBottomNav(items: BottomNavSetting[]) {
    await store.set("siteSettings", "navigation", {
      bottomNav: items.map(({ key, visible }) => ({ key, visible })),
      updatedAt: new Date().toISOString(),
    });
  },

  /** Keep-warm switch read by the `keepCallablesWarm` scheduled function. */
  async performance(): Promise<PerformanceSettings> {
    const row = await store.get<PerformanceSettings & { id: string }>("siteSettings", "performance");
    return { keepWarm: row?.keepWarm === true, updatedAt: row?.updatedAt };
  },

  async setKeepWarm(keepWarm: boolean) {
    await store.set("siteSettings", "performance", { keepWarm, updatedAt: new Date().toISOString() });
  },

  async legalPages(): Promise<LegalPage[]> {
    return store.list<LegalPage>("legalPages", { orderBy: [{ field: "title", dir: "asc" }] });
  },

  async legalPage(slug: string): Promise<LegalPage | null> {
    return store.get<LegalPage>("legalPages", slug);
  },

  async saveLegalPage(page: LegalPage & { updatedBy?: string }) {
    await store.set("legalPages", page.slug, {
      ...page,
      updatedAt: new Date().toISOString(),
    } as never);
  },

  /* ------------------------------------------------------------- winners */

  async publishedWinners(limit = 100): Promise<WinnerAnnouncement[]> {
    return store.list<WinnerAnnouncement>("winnerAnnouncements", {
      where: [{ field: "status", op: "==", value: "published" }],
      orderBy: [{ field: "publishedAt", dir: "desc" }],
      limit,
    });
  },

  /** Every announcement including hidden ones — administrators only. */
  async allWinners(limit = 200): Promise<WinnerAnnouncement[]> {
    return store.list<WinnerAnnouncement>("winnerAnnouncements", {
      orderBy: [{ field: "publishedAt", dir: "desc" }],
      limit,
    });
  },

  /** The signed-in customer's own announcements for one draw. */
  async myWinnings(uid: string, drawId: string): Promise<WinnerAnnouncement[]> {
    return store.list<WinnerAnnouncement>("winnerAnnouncements", {
      where: [
        { field: "winnerUid", op: "==", value: uid },
        { field: "drawId", op: "==", value: drawId },
      ],
      limit: 50,
    });
  },

  async winnersByTier(tier: PrizeTier, limit = 30): Promise<WinnerAnnouncement[]> {
    return store.list<WinnerAnnouncement>("winnerAnnouncements", {
      where: [
        { field: "status", op: "==", value: "published" },
        { field: "prizeTier", op: "==", value: tier },
      ],
      orderBy: [{ field: "publishedAt", dir: "desc" }],
      limit,
    });
  },
};

export const FAQS = [
  {
    q: "How do I register?",
    a: "Tap Register, enter your 10-digit Indian mobile number, complete the reCAPTCHA check and enter the one-time password sent to your phone. Your profile is created automatically after verification.",
  },
  {
    q: "How do I add money to my wallet?",
    a: "Open Add Money, enter the amount within the published limits, pay the displayed UPI QR code from any UPI app, then upload the payment screenshot and enter the UTR reference. An administrator verifies the payment before your wallet is credited.",
  },
  {
    q: "When is my wallet credited?",
    a: "Only after an administrator matches your payment against the operator's banking records. Uploading a screenshot does not complete a deposit by itself.",
  },
  {
    q: "How do I buy a ticket?",
    a: "Open the draw, pick the ticket numbers you want and confirm. The exact ticket price is debited from your wallet and the numbers are reserved to your account in the same transaction.",
  },
  {
    q: "What happens if two people pick the same ticket?",
    a: "The purchase runs as a single atomic transaction. The first confirmed purchase keeps the number, and the other user sees that the ticket is no longer available and is asked to pick again.",
  },
  {
    q: "How do referrals work?",
    a: "Every account gets a unique referral code. Share it via WhatsApp. When a genuinely new participant signs up with your code and qualifies under the published rules, you receive a free spin. Self-referrals and duplicate accounts are blocked.",
  },
  {
    q: "What can I win on the spin wheel?",
    a: "Rewards are promotional coupons, gifts or other permitted benefits configured by the administrator. No monetary return is guaranteed and no prize is promised in advance.",
  },
  {
    q: "How and when are winners announced?",
    a: "Draws run on the published schedule. Results become visible on the Winners page only after an authorised administrator completes the draw and separately publishes the results.",
  },
  {
    q: "Is this available across India?",
    a: "Each draw publishes its own eligibility and geographic restrictions. Paid chance-based draws remain disabled until the operator completes its legal and compliance review.",
  },
];
