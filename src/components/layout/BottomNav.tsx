import {
  Home,
  Sparkles,
  Ticket,
  Trophy,
  User,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/app/AuthProvider";
import { useSettings } from "@/app/SettingsProvider";
import {
  BOTTOM_NAV_LABELS,
  visibleBottomNav,
} from "@/features/navigation/bottomNav";
import type { BottomNavKey } from "@/types";
import { cn } from "@/utils/cn";

export const BOTTOM_NAV_ITEMS: Record<
  BottomNavKey,
  { to: string; icon: LucideIcon; end: boolean; highlight?: boolean }
> = {
  spin: { to: "/dashboard/spin", icon: Sparkles, end: false, highlight: true },
  home: { to: "/", icon: Home, end: true },
  draws: { to: "/draws", icon: Trophy, end: false },
  book: { to: "/book", icon: Ticket, end: false },
  wallet: { to: "/dashboard/wallet", icon: Wallet, end: false },
  account: { to: "/dashboard", icon: User, end: false },
};

/**
 * Accessible bottom navigation for the main customer sections on phones, in
 * the order an administrator set. Hidden on larger screens where the header
 * carries the same links.
 */
export function BottomNav() {
  const { user } = useAuth();
  const { bottomNav } = useSettings();
  const { pathname } = useLocation();
  const keys = visibleBottomNav(bottomNav);
  /** Spin and Wallet have their own tabs, so they must not also light up Account. */
  const overrideActive = (to: string): boolean | null =>
    to === "/dashboard"
      ? pathname.startsWith("/dashboard") &&
        !(
          keys.includes("wallet") && pathname.startsWith("/dashboard/wallet")
        ) &&
        !(keys.includes("spin") && pathname.startsWith("/dashboard/spin"))
      : null;
  return (
    <nav
      aria-label="Primary mobile"
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 backdrop-blur-md lg:hidden"
    >
      <ul
        className="mx-auto grid max-w-lg"
        style={{
          gridTemplateColumns: `repeat(${keys.length}, minmax(0, 1fr))`,
        }}
      >
        {keys.map((key) => {
          const { to, icon: Icon, end, highlight } = BOTTOM_NAV_ITEMS[key];
          const label =
            key === "account" && !user ? "Sign in" : BOTTOM_NAV_LABELS[key];
          return (
            <li key={key}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    "flex min-h-14 flex-col items-center justify-center gap-0.5 px-0.5 py-1.5 text-[10.5px] font-semibold transition",
                    highlight
                      ? "text-gold-deep"
                      : (overrideActive(to) ?? isActive)
                        ? "text-brand"
                        : "text-muted",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={cn(
                        "grid size-8 place-items-center rounded-full transition",
                        highlight
                          ? cn(
                              "bg-gradient-to-br from-gold to-gold-deep text-white shadow-[0_4px_12px_-4px_rgb(168_132_42/0.8)]",
                              isActive &&
                                "ring-2 ring-gold/40 ring-offset-1 ring-offset-paper",
                            )
                          : (overrideActive(to) ?? isActive)
                            ? "bg-brand/10"
                            : "",
                      )}
                    >
                      <Icon className="size-[18px]" aria-hidden />
                    </span>
                    {label}
                  </>
                )}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
