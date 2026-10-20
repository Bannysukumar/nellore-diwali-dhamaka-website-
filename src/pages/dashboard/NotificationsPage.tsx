import { useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { useAsync } from "@/hooks/useAsync";
import { useAuth } from "@/app/AuthProvider";
import { useToast } from "@/app/ToastProvider";
import { userService } from "@/services/userService";
import type { AppNotification, NotificationType } from "@/types";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  LoadErrors,
  Skeleton,
} from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { cn } from "@/utils/cn";
import { relativeTime } from "@/utils/format";

const TYPE_TONE: Partial<Record<NotificationType, "emerald" | "gold" | "brand" | "warning" | "danger">> = {
  deposit_approved: "emerald",
  deposit_rejected: "danger",
  ticket_purchase: "brand",
  referral_reward: "gold",
  spin_awarded: "gold",
  winner_announcement: "gold",
  draw_reminder: "warning",
};

export function NotificationsPage() {
  const { uid } = useAuth();
  const toast = useToast();
  const [marking, setMarking] = useState(false);

  const notifications = useAsync(
    async () => (uid ? await userService.notifications(uid, 100) : []),
    [uid],
    { enabled: Boolean(uid) },
  );

  const rows = (notifications.data ?? []) as AppNotification[];
  const unread = rows.filter((n) => !n.read);

  const markOne = async (id: string) => {
    if (!uid) return;
    await userService.markNotificationRead(uid, id);
    notifications.setData(rows.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const markAll = async () => {
    if (!uid || !unread.length) return;
    setMarking(true);
    try {
      await userService.markAllRead(
        uid,
        unread.map((n) => n.id),
      );
      notifications.setData(rows.map((n) => ({ ...n, read: true })));
      toast.success("All notifications marked as read");
    } catch {
      toast.error("Could not update notifications");
    } finally {
      setMarking(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Notifications"
        icon={Bell}
        title="Your notifications"
        description="Deposit decisions, ticket confirmations, referral rewards and draw reminders — all recorded here."
        crumbs={[
          { label: "Home", to: "/" },
          { label: "Dashboard", to: "/dashboard" },
          { label: "Notifications" },
        ]}
        actions={
          <Button
            variant="outline"
            onClick={() => void markAll()}
            disabled={!unread.length}
            loading={marking}
            iconLeft={<CheckCheck className="size-4" aria-hidden />}
          >
            Mark all read
          </Button>
        }
      />

      <Card className="mt-5">
        <CardHeader
          icon={Bell}
          title="Inbox"
          description="Newest first."
          action={<Badge tone={unread.length ? "brand" : "neutral"}>{unread.length} unread</Badge>}
        />
        <CardBody>
          {notifications.loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16" rounded="lg" />
              ))}
            </div>
          ) : notifications.error ? (
            <LoadErrors sources={[notifications]} title="Notifications could not be loaded" />
          ) : !rows.length ? (
            <EmptyState
              title="You have no notifications"
              description="We notify you here whenever a deposit is reviewed, tickets are confirmed or a draw you entered is published."
              action={
                <Link to="/book">
                  <Button variant="outline">Book a ticket</Button>
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-line">
              {rows.map((item) => (
                <li
                  key={item.id}
                  className={cn(
                    "flex items-start gap-3 py-3.5 transition",
                    !item.read && "-mx-2 rounded-xl bg-ivory/60 px-2",
                  )}
                >
                  <span
                    className={cn(
                      "mt-1.5 size-2 shrink-0 rounded-full",
                      item.read ? "bg-line-strong" : "bg-brand",
                    )}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[14px] font-semibold text-ink">{item.title}</p>
                      {TYPE_TONE[item.type] ? (
                        <Badge tone={TYPE_TONE[item.type]}>{item.type.replace(/_/g, " ")}</Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-[13px] leading-relaxed text-muted">{item.body}</p>
                    <p className="mt-1 text-[11.5px] text-muted">{relativeTime(item.createdAt)}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {item.href ? (
                        <Link
                          to={item.href}
                          className="text-[12px] font-semibold text-brand hover:underline"
                        >
                          Open
                        </Link>
                      ) : null}
                      {!item.read ? (
                        <button
                          type="button"
                          onClick={() => void markOne(item.id)}
                          className="text-[12px] font-semibold text-muted transition hover:text-ink"
                        >
                          Mark as read
                        </button>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </>
  );
}
