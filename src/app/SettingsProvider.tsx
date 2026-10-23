import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { SiteSettings, SiteVideo, SpinConfig, SplashConfig } from "@/types";
import { store } from "@/lib/backend";

interface SettingsContextValue {
  /** `siteSettings/general`, or `null` until an administrator saves it. */
  settings: SiteSettings | null;
  splash: SplashConfig | null;
  spin: SpinConfig | null;
  /** YouTube videos placed on public pages (`siteSettings/videos`). */
  videos: SiteVideo[];
  loading: boolean;
  error: Error | null;
  reload: () => void;
}

/**
 * Used only while `siteSettings/general` is missing or unreadable. Every value
 * is the restrictive choice — paid draws off, no contact details — so a
 * missing configuration can never enable commerce or show invented contacts.
 */
export const UNCONFIGURED_SETTINGS: SiteSettings = {
  brandName: "Nellore Diwali Dhamaka",
  tagline: "Festival ticket booking, rewards and lucky draws.",
  supportPhone: "",
  supportEmail: "",
  minDepositPaise: 0,
  maxDepositPaise: 0,
  allowMultiTicketPurchase: false,
  maxTicketsPerOrder: 1,
  allowPaidDraws: false,
  refundWindowHours: 0,
  minAge: 18,
  legalDisclaimer:
    "Paid chance-based draws remain disabled until the operator completes its legal and compliance review.",
  updatedAt: "",
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

/**
 * Site-wide configuration (settings, splash and spin campaigns) is streamed
 * from `siteSettings` so an administrator's change reaches open sessions
 * without a redeploy.
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [splash, setSplash] = useState<SplashConfig | null>(null);
  const [spin, setSpin] = useState<SpinConfig | null>(null);
  const [videos, setVideos] = useState<SiteVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [nonce, setNonce] = useState(0);
  // Until the first snapshot (or failure) the restrictive defaults would render
  // as if they were the operator's choices, e.g. "Paid draws are disabled".
  const [firstResolved, setFirstResolved] = useState(false);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = store.subscribe<Record<string, unknown>>(
      "siteSettings",
      undefined,
      (rows) => {
        const byId = Object.fromEntries(rows.map((row) => [row.id as string, row]));
        setSettings((byId.general as unknown as SiteSettings) ?? null);
        setSplash((byId.splash as unknown as SplashConfig) ?? null);
        setSpin((byId.spin as unknown as SpinConfig) ?? null);
        const videoItems = (byId.videos as { items?: unknown } | undefined)?.items;
        setVideos(Array.isArray(videoItems) ? (videoItems as SiteVideo[]) : []);
        setError(null);
        setLoading(false);
        setFirstResolved(true);
      },
      (failure) => {
        setError(failure);
        setLoading(false);
        setFirstResolved(true);
      },
    );
    return unsubscribe;
  }, [nonce]);

  const value = useMemo<SettingsContextValue>(
    () => ({ settings, splash, spin, videos, loading, error, reload: () => setNonce((n) => n + 1) }),
    [settings, splash, spin, videos, loading, error],
  );

  return (
    <SettingsContext.Provider value={value}>
      {firstResolved ? (
        children
      ) : (
        <div className="grid min-h-dvh place-items-center bg-paper" role="status" aria-live="polite">
          <p className="text-[13px] text-muted">Loading…</p>
        </div>
      )}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside <SettingsProvider>.");
  return ctx;
}

/** Effective settings: the stored document, or the restrictive unconfigured values. */
export function useSiteSettings(): SiteSettings {
  return useSettings().settings ?? UNCONFIGURED_SETTINGS;
}

export interface SupportContact {
  phone: string | null;
  phoneHref: string | null;
  email: string | null;
  whatsappUrl: string | null;
  /** Set only when the dedicated WhatsApp number is configured (floating button). */
  whatsappChatUrl: string | null;
}

/** wa.me needs the country code; a bare 10-digit number is taken as Indian. */
export function whatsappDigits(input?: string): string | null {
  const digits = (input ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (digits.length === 10) return `91${digits}`;
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}

export function supportContactFrom(
  settings: Pick<SiteSettings, "supportPhone" | "supportEmail" | "whatsappNumber" | "whatsappMessage">,
): SupportContact {
  const phone = settings.supportPhone?.trim() || null;
  const email = settings.supportEmail?.trim() || null;
  const dedicated = whatsappDigits(settings.whatsappNumber);
  const whatsapp = dedicated ?? whatsappDigits(phone ?? "");
  const message = settings.whatsappMessage?.trim();
  const query = message ? `?text=${encodeURIComponent(message)}` : "";
  return {
    phone,
    phoneHref: phone ? `tel:${phone.replace(/\s/g, "")}` : null,
    email,
    whatsappUrl: whatsapp ? `https://wa.me/${whatsapp}${query}` : null,
    whatsappChatUrl: dedicated ? `https://wa.me/${dedicated}${query}` : null,
  };
}

/** Support contacts configured by the operator; fields are `null` when not set. */
export function useSupportContact(): SupportContact {
  return supportContactFrom(useSiteSettings());
}
