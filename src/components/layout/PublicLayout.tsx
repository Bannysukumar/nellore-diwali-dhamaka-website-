import { Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { BottomNav } from "./BottomNav";
import { SplashGate } from "./SplashGate";
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
    <div className="flex min-h-dvh flex-col">
      <SplashGate />
      <ScrollToTop />
      <Header />
      <main id="main" className="flex-1 pb-24 lg:pb-0">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
      <Footer />
      <BottomNav />
    </div>
  );
}
