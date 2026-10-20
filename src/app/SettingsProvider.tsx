import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { SiteSettings, SpinConfig, SplashConfig } from "@/types";
import { store } from "@/lib/backend";

interface SettingsContextValue {
  /** `siteSettings/general`, or `null` until an administrator saves it. */
  settings: SiteSettings | null;
  splash: SplashConfig | null;
  spin: SpinConfig | null;
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
    () => ({ settings, splash, spin, loading, error, reload: () => setNonce((n) => n + 1) }),
    [settings, splash, spin, loading, error],
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
}

export function supportContactFrom(settings: Pick<SiteSettings, "supportPhone" | "supportEmail">): SupportContact {
  const phone = settings.supportPhone?.trim() || null;
  const digits = phone?.replace(/\D/g, "") ?? "";
  const email = settings.supportEmail?.trim() || null;
  return {
    phone,
    phoneHref: phone ? `tel:${phone.replace(/\s/g, "")}` : null,
    email,
    whatsappUrl: digits.length >= 10 ? `https://wa.me/${digits}` : null,
  };
}

/** Support contacts configured by the operator; fields are `null` when not set. */
export function useSupportContact(): SupportContact {
  return supportContactFrom(useSiteSettings());
}
