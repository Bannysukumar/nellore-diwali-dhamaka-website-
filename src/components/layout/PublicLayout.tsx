import { Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { BottomNav } from "./BottomNav";
import { SplashGate } from "./SplashGate";
import { WhatsAppButton } from "./WhatsAppButton";
import { ErrorBoundary } from "@/components/system/ErrorBoundary";

export function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [pathname]);
  return null;
}

/** Shell for every public page: header, content, footer and mobile nav. */
export function PublicLayout() {
  return (
    <div className="flex min-h-dvh flex-col pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0">
      <SplashGate />
      <ScrollToTop />
      <Header />
      <main id="main" className="flex-1">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
      <Footer />
      <BottomNav />
      <WhatsAppButton />
    </div>
  );
}
