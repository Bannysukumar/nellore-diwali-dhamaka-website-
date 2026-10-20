import { AnimatePresence, motion } from "framer-motion";
import { LogOut, Menu, ShieldCheck, User, Wallet, X } from "lucide-react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/app/AuthProvider";
import { useSettings } from "@/app/SettingsProvider";
import { useMobileMenu } from "@/hooks/useMobileMenu";
import { IS_EMULATOR, EMULATOR_NOTICE } from "@/lib/firebase/config";
import { Button } from "@/components/ui";
import { Logo } from "@/components/brand/Logo";
import { cn } from "@/utils/cn";

const NAV = [
  { to: "/", label: "Home" },
  { to: "/draws", label: "Draws" },
  { to: "/book", label: "Book Tickets" },
  { to: "/winners", label: "Winners" },
  { to: "/about", label: "About" },
  { to: "/faqs", label: "FAQs" },
  { to: "/contact", label: "Contact" },
];

export function Header() {
  const { user, profile, isAdmin, signOut } = useAuth();
  const { error: settingsError, reload: reloadSettings } = useSettings();
  const { open, setOpen, toggle } = useMobileMenu();
  /** The dashboard uses the wider app container; match it so the logo lines up. */
  const container = useLocation().pathname.startsWith("/dashboard") ? "page-app" : "page";

  return (
    <>
      {IS_EMULATOR ? (
        <div className="bg-maroon-deep text-[11px] font-semibold uppercase tracking-[0.14em] text-gold-soft">
          <p className="page py-1.5 text-center">{EMULATOR_NOTICE}</p>
        </div>
      ) : null}
      {settingsError ? (
        <div className="bg-status-booked-bg text-[12px] text-status-booked" role="alert">
          <p className="page py-1.5 text-center">
            Site settings could not be loaded, so purchasing and deposits are paused.{" "}
            <button type="button" className="font-semibold underline" onClick={reloadSettings}>
              Retry
            </button>
          </p>
        </div>
      ) : null}

      <header className="sticky top-0 z-50 border-b border-line bg-ivory/85 backdrop-blur-md">
        <div className={cn(container, "flex h-16 items-center justify-between gap-4")}>
          <Logo />

          <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "rounded-lg px-3 py-2 text-[13.5px] font-semibold transition",
                    isActive
                      ? "bg-brand/10 text-brand"
                      : "text-muted hover:bg-paper hover:text-ink",
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {user ? (
              <>
                <Link
                  to="/dashboard/wallet"
                  className="hidden items-center gap-2 rounded-xl border border-line bg-paper px-3 py-2 text-[13px] font-semibold text-ink transition hover:border-gold sm:inline-flex"
                >
                  <Wallet className="size-4 text-brand" aria-hidden />
                  {profile?.fullName?.split(" ")[0] ?? "Account"}
                </Link>
                {isAdmin ? (
                  <Link
                    to="/admin"
                    className="hidden items-center gap-1.5 rounded-xl bg-maroon px-3 py-2 text-[13px] font-semibold text-ivory transition hover:bg-maroon-deep md:inline-flex"
                  >
                    <ShieldCheck className="size-4" aria-hidden />
                    Admin
                  </Link>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void signOut()}
                  className="hidden sm:inline-flex"
                  iconLeft={<LogOut className="size-4" aria-hidden />}
                >
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <Link to="/login" className="hidden sm:block">
                  <Button variant="ghost" size="sm">
                    Sign in
                  </Button>
                </Link>
                <Link to="/register" className="hidden sm:block">
                  <Button size="sm" variant="gold">
                    Register
                  </Button>
                </Link>
              </>
            )}

            <button
              type="button"
              onClick={toggle}
              aria-expanded={open}
              aria-controls="site-mobile-menu"
              aria-label={open ? "Close menu" : "Open menu"}
              className="grid size-10 place-items-center rounded-xl border border-line bg-paper text-ink transition hover:border-gold lg:hidden"
            >
              {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {open ? (
            <motion.div
              id="site-mobile-menu"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain border-t border-line bg-paper lg:hidden"
            >
              <nav aria-label="Mobile" className={cn(container, "grid gap-1 py-3")}>
                {NAV.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        "rounded-xl px-3 py-2.5 text-[15px] font-semibold transition",
                        isActive ? "bg-brand/10 text-brand" : "text-ink hover:bg-ivory",
                      )
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
                <div className="mt-2 grid gap-2 border-t border-line pt-3">
                  {user ? (
                    <>
                      <Link to="/dashboard" onClick={() => setOpen(false)}>
                        <Button block variant="outline" iconLeft={<User className="size-4" aria-hidden />}>
                          My dashboard
                        </Button>
                      </Link>
                      {isAdmin ? (
                        <Link to="/admin" onClick={() => setOpen(false)}>
                          <Button block variant="secondary" iconLeft={<ShieldCheck className="size-4" aria-hidden />}>
                            Admin panel
                          </Button>
                        </Link>
                      ) : null}
                      <Button
                        block
                        variant="ghost"
                        onClick={() => {
                          setOpen(false);
                          void signOut();
                        }}
                        iconLeft={<LogOut className="size-4" aria-hidden />}
                      >
                        Sign out
                      </Button>
                    </>
                  ) : (
                    <>
                      <Link to="/register" onClick={() => setOpen(false)}>
                        <Button block variant="gold">
                          Register with mobile
                        </Button>
                      </Link>
                      <Link to="/login" onClick={() => setOpen(false)}>
                        <Button block variant="outline">
                          Sign in
                        </Button>
                      </Link>
                    </>
                  )}
                </div>
              </nav>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </header>
    </>
  );
}
