import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

/**
 * Open/close state for a slide-down mobile menu. The menu closes on every
 * route change and on Escape, and the page behind it does not scroll while
 * it is open.
 */
export function useMobileMenu() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    // Rotating to a desktop width hides the menu button; don't leave the page locked.
    const desktop = window.matchMedia("(min-width: 1024px)");
    const onResize = () => {
      if (desktop.matches) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    desktop.addEventListener("change", onResize);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
      desktop.removeEventListener("change", onResize);
    };
  }, [open]);

  return { open, setOpen, close, toggle: () => setOpen((v) => !v) };
}
