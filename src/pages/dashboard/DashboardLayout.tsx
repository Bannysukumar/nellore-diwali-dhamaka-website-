import { useEffect, useMemo, useRef } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Bell,
  ChevronRight,
  History,
  LifeBuoy,
  LayoutDashboard,
  Sparkles,
  Ticket,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/app/AuthProvider";
import { useSiteSettings } from "@/app/SettingsProvider";
import { walletService } from "@/services/walletService";
import { useAsync } from "@/hooks/useAsync";
import { useCollection } from "@/hooks/useCollection";
import type { AppNotification } from "@/types";
import { Badge, Spinner } from "@/components/ui";
import { cn } from "@/utils/cn";
import { formatINR } from "@/utils/money";
import { initials } from "@/utils/mask";

const LINKS = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/dashboard/wallet", label: "Wallet", icon: Wallet, end: false },
  { to: "/dashboard/tickets", label: "My tickets", icon: Ticket, end: false },
  { to: "/dashboard/referrals", label: "Referrals", icon: Users, end: false },
  { to: "/dashboard/spin", label: "Spin wheel", icon: Sparkles, end: false },
  { to: "/dashboard/history", label: "Draw history", icon: History, end: false },
  { to: "/dashboard/notifications", label: "Notifications", icon: Bell, end: false },
  { to: "/dashboard/profile", label: "Profile", icon: UserRound, end: false },
  { to: "/dashboard/support", label: "Support", icon: LifeBuoy, end: false },
];

export function DashboardLayout() {
  const { profile, uid } = useAuth();
  const settings = useSiteSettings();
  const location = useLocation();

  const wallet = useAsync(
    async () => (uid ? await walletService.account(uid) : null),
    [uid, location.pathname],
    { enabled: Boolean(uid) },
  );

  const notifications = useCollection<AppNotification>("notifications", {
    where: [{ field: "uid", op: "==", value: uid ?? "" }],
    orderBy: [{ field: "createdAt", dir: "desc" }],
    limit: 50,
  });

  const unread = useMemo(
    () => (notifications.data ?? []).filter((n) => !n.read).length,
    [notifications.data],
  );

  // On phones the section links are a swipeable strip; keep the current one in view.
  const strip = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const list = strip.current;
    const active = list?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!list || !active || list.scrollWidth <= list.clientWidth) return;
    list.scrollTo({ left: active.offsetLeft - (list.clientWidth - active.offsetWidth) / 2, behavior: "smooth" });
  }, [location.pathname]);

  return (
    <div className="page grid grid-cols-[minmax(0,1fr)] gap-6 py-6 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="min-w-0 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain lg:pb-2 lg:pr-1">
        <div className="rounded-[var(--radius-card)] border border-line bg-paper p-4 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand text-[15px] font-bold text-white">
              {initials(profile?.fullName ?? "?")}
            </span>
            <div className="min-w-0">
              <p className="truncate font-display text-[15px] leading-tight text-ink">
                {profile?.fullName ?? "Participant"}
              </p>
              <p className="truncate text-[12px] text-muted">{profile?.phoneMasked ?? ""}</p>
            </div>
          </div>

          <div className="mt-3.5 rounded-xl border border-line bg-ivory/70 px-3 py-2.5">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">
              Wallet balance
            </p>
            <p className="mt-0.5 font-display text-[20px] font-bold tabular-nums text-emerald">
              {wallet.loading ? <Spinner /> : formatINR(wallet.data?.balancePaise)}
            </p>
            {wallet.data?.pendingDepositPaise ? (
              <p className="mt-1 text-[11px] text-status-pending">
                {formatINR(wallet.data.pendingDepositPaise)} awaiting verification
              </p>
            ) : null}
          </div>

          {!settings.allowPaidDraws ? (
            <p className="mt-3 rounded-lg border border-dashed border-gold bg-gold-soft/40 px-2.5 py-2 text-[11px] leading-relaxed text-gold-deep">
              Ticket purchasing is disabled until paid draws are enabled in the admin settings.
            </p>
          ) : null}
        </div>

        <nav aria-label="Account sections" className="mt-3">
          <ul
            ref={strip}
            className="no-scrollbar relative flex gap-1.5 overflow-x-auto overscroll-x-contain rounded-[var(--radius-card)] border border-line bg-paper p-2 lg:flex-col lg:gap-1 lg:overflow-visible"
          >
            {LINKS.map((item) => (
              <li key={item.to} className="shrink-0 lg:shrink">
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2.5 text-[13px] font-semibold transition",
                      isActive
                        ? "bg-brand/10 text-brand"
                        : "text-muted hover:bg-ivory hover:text-ink",
                    )
                  }
                >
                  <item.icon className="size-4 shrink-0" aria-hidden />
                  <span className="flex-1">{item.label}</span>
                  {item.to === "/dashboard/notifications" && unread ? (
                    <Badge tone="brand" className="hidden lg:inline-flex">
                      {unread}
                    </Badge>
                  ) : (
                    <ChevronRight className="hidden size-3.5 text-line-strong lg:block" aria-hidden />
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <div className="min-w-0">
        <Outlet context={{ unreadNotifications: unread }} />
      </div>
    </div>
  );
}

/** Refreshes the notification count shown in the dashboard shell. */
export function useUnreadNotifications(uid: string | null): number {
  const rows = useCollection<AppNotification>("notifications", {
    where: [{ field: "uid", op: "==", value: uid ?? "" }],
    limit: 100,
  });
  return (rows.data ?? []).filter((n) => !n.read).length;
}
