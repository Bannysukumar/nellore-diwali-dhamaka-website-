import { useMemo } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  ArrowLeftRight,
  BadgePercent,
  Bell,
  BookOpen,
  ChevronRight,
  ClipboardList,
  Cog,
  Coins,
  Images,
  LayoutDashboard,
  LogOut,
  Menu,
  MonitorPlay,
  Navigation,
  Youtube,
  QrCode,
  ScrollText,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Ticket,
  Trophy,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { useAuth } from "@/app/AuthProvider";
import { useSiteSettings } from "@/app/SettingsProvider";
import { walletService } from "@/services/walletService";
import { useAsync } from "@/hooks/useAsync";
import { useMobileMenu } from "@/hooks/useMobileMenu";
import { ScrollToTop } from "@/components/layout/PublicLayout";
import { IS_EMULATOR, EMULATOR_NOTICE } from "@/lib/firebase/config";
import { Badge, Button } from "@/components/ui";
import { Logo } from "@/components/brand/Logo";
import { cn } from "@/utils/cn";
import { formatINRCompact } from "@/utils/money";
import { initials } from "@/utils/mask";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
  group: string;
}

const LINKS: NavItem[] = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, end: true, group: "Operations" },
  { to: "/admin/deposits", label: "Deposits", icon: Wallet, group: "Operations" },
  { to: "/admin/orders", label: "Ticket orders", icon: ClipboardList, group: "Operations" },
  { to: "/admin/inventory", label: "Ticket inventory", icon: Ticket, group: "Operations" },
  { to: "/admin/draws", label: "Draws", icon: Coins, group: "Draws & prizes" },
  { to: "/admin/winners", label: "Winners", icon: Trophy, group: "Draws & prizes" },
  { to: "/admin/rewards", label: "Spin rewards", icon: Sparkles, group: "Draws & prizes" },
  { to: "/admin/spin", label: "Spin activity", icon: Sparkles, group: "Draws & prizes" },
  { to: "/admin/customers", label: "Customers", icon: Users, group: "People" },
  { to: "/admin/referrals", label: "Referrals", icon: Users, group: "People" },
  { to: "/admin/ledger", label: "Wallet ledger", icon: ScrollText, group: "Money" },
  { to: "/admin/transfers", label: "Wallet transfers", icon: ArrowLeftRight, group: "Money" },
  { to: "/admin/payment-qr", label: "Payment QR codes", icon: QrCode, group: "Money" },
  { to: "/admin/reports", label: "Reports", icon: BadgePercent, group: "Money" },
  { to: "/admin/products", label: "Products", icon: ShoppingBag, group: "Content" },
  { to: "/admin/banners", label: "Banners", icon: Images, group: "Content" },
  { to: "/admin/splash", label: "Splash screen", icon: MonitorPlay, group: "Content" },
  { to: "/admin/videos", label: "YouTube videos", icon: Youtube, group: "Content" },
  { to: "/admin/navigation", label: "Mobile bottom bar", icon: Navigation, group: "Content" },
  { to: "/admin/announcements", label: "Announcements", icon: Bell, group: "Content" },
  { to: "/admin/legal", label: "Legal pages", icon: BookOpen, group: "Content" },
  { to: "/admin/audit", label: "Audit log", icon: ShieldCheck, group: "System" },
  { to: "/admin/settings", label: "Settings", icon: Cog, group: "System" },
];

export function AdminLayout() {
  const { profile, signOut } = useAuth();
  const settings = useSiteSettings();
  const location = useLocation();
  const menu = useMobileMenu();

  const pending = useAsync(() => walletService.pendingDepositTotal(), [location.pathname]);

  const groups = useMemo(() => {
    const order = ["Operations", "Draws & prizes", "People", "Money", "Content", "System"];
    const map = new Map<string, NavItem[]>();
    LINKS.forEach((item) => {
      const list = map.get(item.group) ?? [];
      list.push(item);
      map.set(item.group, list);
    });
    return order
      .filter((group) => map.has(group))
      .map((group) => ({ group, items: map.get(group) ?? [] }));
  }, []);

  const sidebar = (
    <nav aria-label="Admin sections" className="space-y-4">
      {groups.map((section) => (
        <div key={section.group}>
          <p className="px-3 text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted/80">
            {section.group}
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {section.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={menu.close}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition",
                      isActive ? "bg-maroon text-ivory" : "text-muted hover:bg-ivory hover:text-ink",
                    )
                  }
                >
                  <item.icon className="size-4 shrink-0" aria-hidden />
                  <span className="flex-1">{item.label}</span>
                  {item.to === "/admin/deposits" && pending.data?.count ? (
                    <Badge tone="warning">{pending.data.count}</Badge>
                  ) : (
                    <ChevronRight className="size-3.5 text-line-strong" aria-hidden />
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );

  const pendingCard = (
    <div className="rounded-[var(--radius-card)] border border-line bg-paper p-4 shadow-[var(--shadow-card)]">
      <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted">Pending deposits</p>
      <p className="mt-1 font-display text-[22px] font-bold tabular-nums text-status-pending">
        {pending.error ? "—" : pending.data ? pending.data.count : "…"}
      </p>
      <p className="text-[12px] text-muted">
        {pending.error
          ? "Could not load pending deposits"
          : `${formatINRCompact(pending.data?.amountPaise)} awaiting review`}
      </p>
    </div>
  );

  return (
    <div className="min-h-dvh bg-ivory">
      <ScrollToTop />
      {IS_EMULATOR ? (
        <div className="bg-maroon-deep text-[11px] font-semibold uppercase tracking-[0.14em] text-gold-soft">
          <p className="page-app py-1.5 text-center">Admin · {EMULATOR_NOTICE}</p>
        </div>
      ) : null}

      <header className="sticky top-0 z-50 border-b border-line bg-paper/95 backdrop-blur-md">
        <div className="page-app flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={menu.toggle}
              aria-expanded={menu.open}
              aria-controls="admin-mobile-menu"
              aria-label={menu.open ? "Close admin menu" : "Open admin menu"}
              className="grid size-10 place-items-center rounded-xl border border-line bg-paper text-ink lg:hidden"
            >
              {menu.open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
            </button>
            <Logo />
            <Badge tone="brand" className="hidden sm:inline-flex">
              Admin
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            {!settings.allowPaidDraws ? (
              <Badge tone="warning" className="hidden md:inline-flex">
                Paid draws disabled
              </Badge>
            ) : null}
            <NavLink
              to="/"
              className="hidden rounded-xl border border-line bg-paper px-3 py-2 text-[13px] font-semibold text-ink transition hover:border-gold sm:inline-flex"
            >
              View site
            </NavLink>
            <div className="flex items-center gap-2 rounded-xl border border-line bg-ivory px-2.5 py-1.5">
              <span className="grid size-7 place-items-center rounded-full bg-maroon text-[11px] font-bold text-ivory">
                {initials(profile?.fullName ?? "A")}
              </span>
              <span className="hidden max-w-[140px] truncate text-[12.5px] font-semibold text-ink sm:block">
                {profile?.fullName ?? "Administrator"}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void signOut()}
              iconLeft={<LogOut className="size-4" aria-hidden />}
              className="hidden sm:inline-flex"
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>

      {menu.open ? (
        <div id="admin-mobile-menu" className="fixed inset-x-0 bottom-0 top-16 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close admin menu"
            className="absolute inset-0 bg-ink/30 backdrop-blur-[1px]"
            onClick={menu.close}
          />
          <div className="relative max-h-full overflow-y-auto overscroll-contain border-b border-line bg-paper shadow-[var(--shadow-card)]">
            <div className="page-app space-y-4 py-4">
              {pendingCard}
              {sidebar}
              <div className="grid grid-cols-2 gap-2 border-t border-line pt-3 sm:hidden">
                <NavLink
                  to="/"
                  className="inline-flex items-center justify-center rounded-xl border border-line bg-paper px-3 py-2.5 text-[13px] font-semibold text-ink"
                >
                  View site
                </NavLink>
                <Button
                  variant="ghost"
                  onClick={() => void signOut()}
                  iconLeft={<LogOut className="size-4" aria-hidden />}
                >
                  Sign out
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="page-app grid grid-cols-[minmax(0,1fr)] gap-6 py-6 lg:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-20 max-h-[calc(100dvh-6rem)] space-y-4 overflow-y-auto overscroll-contain pb-2 pr-1">
            {pendingCard}
            {sidebar}
          </div>
        </aside>

        <main className="min-w-0">
          <Outlet />
        </main>
      </div>

      <footer className="border-t border-line bg-paper px-4 py-4">
        <div className="page-app flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted">
          <span>
            Signed in as {profile?.fullName ?? "Administrator"} · every privileged action is written to the
            audit log.
          </span>        </div>
      </footer>
    </div>
  );
}
