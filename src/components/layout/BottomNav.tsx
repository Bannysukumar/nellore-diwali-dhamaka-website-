import { Home, Ticket, Trophy, User, Wallet } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/app/AuthProvider";
import { cn } from "@/utils/cn";

const items = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/draws", label: "Draws", icon: Trophy, end: false },
  { to: "/book", label: "Book", icon: Ticket, end: false },
  { to: "/dashboard/wallet", label: "Wallet", icon: Wallet, end: false },
  { to: "/dashboard", label: "Account", icon: User, end: false },
];

/**
 * Accessible bottom navigation for the main customer sections on phones.
 * Hidden on larger screens where the header carries the same links.
 */
export function BottomNav() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  /** Wallet has its own tab, so it must not also light up Account. */
  const overrideActive = (to: string): boolean | null =>
    to === "/dashboard" ? pathname.startsWith("/dashboard") && !pathname.startsWith("/dashboard/wallet") : null;
  return (
    <nav
      aria-label="Primary mobile"
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 backdrop-blur-md lg:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {items.map(({ to, label, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10.5px] font-semibold transition",
                  (overrideActive(to) ?? isActive) ? "text-brand" : "text-muted",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      "grid size-8 place-items-center rounded-full transition",
                      (overrideActive(to) ?? isActive) ? "bg-brand/10" : "",
                    )}
                  >
                    <Icon className="size-[18px]" aria-hidden />
                  </span>
                  {label === "Account" && !user ? "Sign in" : label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
