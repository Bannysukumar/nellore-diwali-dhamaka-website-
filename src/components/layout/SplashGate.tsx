import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSettings } from "@/app/SettingsProvider";
import { contentService } from "@/services/contentService";
import { DiyaMark } from "@/components/brand/Logo";
import { Button } from "@/components/ui";
import { useMediaQuery } from "@/hooks/useMediaQuery";

const DISMISS_KEY = "ndd.splash.dismissedAt";
/** A "visit" is one browser session; live settings snapshots must not re-open a dismissed splash. */
const SESSION_KEY = "ndd.splash.dismissedThisVisit";

/**
 * Admin-configured festival splash.
 *
 * Everything shown here — artwork, greeting, copy, CTA and schedule — comes
 * from the `siteSettings/splash` document, never from hardcoded markup.
 */
export function SplashGate() {
  const { splash, settings } = useSettings();
  const [visible, setVisible] = useState(false);
  const isMobile = useMediaQuery("(max-width: 767px)");
  const navigate = useNavigate();
  const brandName = settings?.brandName ?? "Nellore Diwali Dhamaka";

  useEffect(() => {
    if (!splash || !contentService.isSplashActive(splash)) {
      setVisible(false);
      return;
    }
    if (sessionStorage.getItem(SESSION_KEY)) {
      setVisible(false);
      return;
    }
    if (splash.dismissDays > 0) {
      const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
      const expiresAt = dismissedAt + splash.dismissDays * 86_400_000;
      if (dismissedAt && Date.now() < expiresAt) {
        setVisible(false);
        return;
      }
    }
    // Short delay keeps the splash from flashing during first paint.
    const id = window.setTimeout(() => setVisible(true), 250);
    return () => window.clearTimeout(id);
  }, [splash]);

  const dismiss = (followCta = false) => {
    setVisible(false);
    sessionStorage.setItem(SESSION_KEY, "1");
    if (splash?.dismissDays) localStorage.setItem(DISMISS_KEY, String(Date.now()));
    if (followCta && splash?.ctaHref) navigate(splash.ctaHref);
  };

  if (!splash) return null;

  const artwork = isMobile
    ? splash.mobileBannerUrl || splash.desktopBannerUrl
    : splash.desktopBannerUrl || splash.mobileBannerUrl;

  if (splash.artworkOnly && artwork) {
    return (
      <AnimatePresence>
        {visible ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.32 }}
            className="fixed inset-0 z-[100] grid place-items-center p-4 sm:p-6"
            style={{ backgroundColor: splash.backgroundColor || "var(--color-maroon)" }}
            role="dialog"
            aria-modal="true"
            aria-label="Festival welcome"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="relative flex w-full max-w-5xl flex-col items-center gap-5"
            >
              <div className="relative w-full overflow-hidden rounded-[var(--radius-panel)] shadow-[var(--shadow-raised)]">
                <img
                  src={artwork}
                  alt={[splash.heading, splash.description].filter(Boolean).join(". ")}
                  className="block max-h-[75dvh] w-full object-contain"
                />
                {splash.allowSkip ? (
                  <button
                    type="button"
                    onClick={() => dismiss(false)}
                    aria-label="Skip and continue to the website"
                    className="absolute right-3 top-3 rounded-lg bg-black/45 p-2 text-ivory transition hover:bg-black/65"
                  >
                    <X className="size-5" aria-hidden />
                  </button>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button
                  size="lg"
                  variant="gold"
                  onClick={() => dismiss(true)}
                  iconRight={<ArrowRight className="size-4" aria-hidden />}
                >
                  {splash.ctaLabel || "Continue"}
                </Button>
                {splash.allowSkip ? (
                  <Button
                    size="lg"
                    variant="ghost"
                    className="text-ivory hover:bg-ivory/10"
                    onClick={() => dismiss(false)}
                  >
                    Skip for now
                  </Button>
                ) : null}
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.32 }}
          className="fixed inset-0 z-[100] grid place-items-center p-0 sm:p-6"
          style={{ backgroundColor: splash.backgroundColor || "var(--color-maroon)" }}
          role="dialog"
          aria-modal="true"
          aria-label="Festival welcome"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="relative flex h-full w-full max-w-5xl flex-col overflow-hidden bg-maroon-deep sm:h-auto sm:rounded-[var(--radius-panel)] sm:shadow-[var(--shadow-raised)]"
          >
            {artwork ? (
              <img
                src={artwork}
                alt=""
                className="absolute inset-0 size-full object-cover opacity-55"
                onError={(event) => {
                  // Broken or expired artwork must not break the splash.
                  (event.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-t from-maroon-deep via-maroon-deep/85 to-maroon-deep/40" />

            <div className="relative flex min-h-full flex-col justify-between p-6 sm:min-h-0 sm:p-10">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  {splash.logoUrl ? (
                    <img
                      src={splash.logoUrl}
                      alt=""
                      className="size-12 rounded-xl object-contain sm:size-14"
                    />
                  ) : (
                    <DiyaMark className="size-12 sm:size-14" />
                  )}
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-gold-soft">
                      {splash.greeting}
                    </p>
                    <p className="text-[12px] text-ivory/70">{brandName}</p>
                  </div>
                </div>
                {splash.allowSkip ? (
                  <button
                    type="button"
                    onClick={() => dismiss(false)}
                    aria-label="Skip and continue to the website"
                    className="rounded-lg border border-ivory/25 p-2 text-ivory/80 transition hover:bg-ivory/10"
                  >
                    <X className="size-5" aria-hidden />
                  </button>
                ) : null}
              </div>

              <div className="my-8 max-w-xl sm:my-14">
                <h1 className="font-display text-[34px] leading-[1.08] text-ivory sm:text-[54px]">
                  {splash.heading}
                </h1>
                <p className="mt-4 max-w-lg text-[14px] leading-relaxed text-ivory/80 sm:text-[16px]">
                  {splash.description}
                </p>
                {splash.announcement ? (
                  <p className="mt-4 inline-flex rounded-full border border-gold/40 bg-gold/10 px-3.5 py-1.5 text-[12px] font-semibold text-gold-soft">
                    {splash.announcement}
                  </p>
                ) : null}
                <div className="mt-7 flex flex-wrap items-center gap-3">
                  <Button
                    size="lg"
                    variant="gold"
                    onClick={() => dismiss(true)}
                    iconRight={<ArrowRight className="size-4" aria-hidden />}
                  >
                    {splash.ctaLabel || "Continue"}
                  </Button>
                  {splash.allowSkip ? (
                    <Button
                      size="lg"
                      variant="ghost"
                      className="text-ivory hover:bg-ivory/10"
                      onClick={() => dismiss(false)}
                    >
                      Skip for now
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
