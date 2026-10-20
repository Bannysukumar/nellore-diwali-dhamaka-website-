import { useRef, useState } from "react";
import { Bell, BellRing, Info, Megaphone, Send, Users } from "lucide-react";
import { useAsync } from "@/hooks/useAsync";
import { useToast } from "@/app/ToastProvider";
import { store } from "@/lib/backend";
import { callBackend } from "@/lib/backend/callBackend";
import type { BroadcastAnnouncementRequest, BroadcastAnnouncementResponse } from "@/lib/backend/api";
import { userService } from "@/services/userService";
import { adminService } from "@/services/adminService";
import type { AppNotification, UserProfile } from "@/types";
import { newId } from "@/utils/id";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  DataTable,
  FieldError,
  FormRow,
  Input,
  Label,
  LoadErrors,
  Segmented,
  Select,
  Skeleton,
  StatCard,
  Textarea,
  type Column,
} from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatDateTime, formatNumber } from "@/utils/format";
type BroadcastType = BroadcastAnnouncementRequest["type"];

const RECIPIENT_LIST_LIMIT = 500;

const TYPE_OPTIONS: Array<{ value: BroadcastType; label: string }> = [
  { value: "system", label: "General announcement" },
  { value: "draw_reminder", label: "Draw reminder" },
  { value: "draw_schedule_change", label: "Schedule change" },
];

export function AdminAnnouncementsPage() {
  const toast = useToast();
  const [audience, setAudience] = useState<"all" | "selected">("all");
  const [selectedUids, setSelectedUids] = useState<string[]>([]);
  const [type, setType] = useState<BroadcastType>("system");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [href, setHref] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);

  const requestId = useRef(newId("bc_"));
  const customers = useAsync(() => userService.listCustomers(RECIPIENT_LIST_LIMIT, "active"), []);
  const activeCount = useAsync(
    () => adminService.countByStatus("users", ["active"], [{ field: "role", op: "==", value: "customer" }]),
    [],
  );
  const recent = useAsync(
    () =>
      store.list<AppNotification>("notifications", {
        orderBy: [{ field: "createdAt", dir: "desc" }],
        limit: 40,
      }),
    [],
  );

  const recipients: UserProfile[] = customers.data ?? [];
  const activeTotal = activeCount.data?.active;

  const targetCount = audience === "all" ? activeTotal : selectedUids.length;

  const toggleUid = (uid: string) => {
    setSelectedUids((current) =>
      current.includes(uid) ? current.filter((u) => u !== uid) : [...current, uid],
    );
  };

  const openConfirm = () => {
    setError(null);
    if (title.trim().length < 3) return setError("Write a subject of at least 3 characters.");
    if (body.trim().length < 5) return setError("Write the message body.");
    if (href.trim() && !href.trim().startsWith("/")) {
      return setError("Links must be in-app paths that start with “/”, for example /draws.");
    }
    if (audience === "selected" && !selectedUids.length) return setError("Select at least one recipient.");
    if (audience === "all" && !activeTotal) return setError("There are no active customer accounts to notify.");
    setConfirming(true);
  };

  const send = async () => {
    setSending(true);
    try {
      // Delivery happens server-side, one inbox entry per recipient. The same
      // requestId is reused on retry so a partial send completes without
      // duplicating anyone's notification.
      const result = await callBackend<BroadcastAnnouncementRequest, BroadcastAnnouncementResponse>(
        "broadcastAnnouncement",
        {
          requestId: requestId.current,
          type,
          title: title.trim(),
          body: body.trim(),
          href: href.trim() || undefined,
          uids: audience === "selected" ? selectedUids : undefined,
        },
      );
      toast.success("Announcement sent", `Delivered to ${formatNumber(result.delivered)} account(s).`);
      requestId.current = newId("bc_");
      setConfirming(false);
      setTitle("");
      setBody("");
      setHref("");
      setSelectedUids([]);
      recent.reload();
    } catch (err) {
      toast.error(
        "Delivery not completed",
        `${err instanceof Error ? err.message : "Please retry."} Retrying will not send duplicates.`,
      );
    } finally {
      setSending(false);
    }
  };

  const recentColumns: Array<Column<AppNotification & { recipientName?: string }>> = [
    {
      key: "when",
      header: "When",
      render: (row) => <span className="whitespace-nowrap text-muted">{formatDateTime(row.createdAt)}</span>,
    },
    {
      key: "title",
      header: "Notification",
      render: (row) => (
        <div className="min-w-0">
          <p className="font-medium text-ink">{row.title}</p>
          <p className="line-clamp-2 text-[11.5px] text-muted">{row.body}</p>
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      hideBelow: "md",
      render: (row) => <Badge tone="neutral">{row.type.replace(/_/g, " ")}</Badge>,
    },
    {
      key: "read",
      header: "Read",
      align: "right",
      hideBelow: "sm",
      render: (row) => (
        <Badge tone={row.read ? "emerald" : "warning"}>{row.read ? "Read" : "Unread"}</Badge>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Content"
        icon={Megaphone}
        title="Announcements"
        description="Deliver an in-app notification to customers. Each recipient gets their own inbox entry — nothing is marked as delivered unless it was actually written."
      />

      <LoadErrors className="mt-5" sources={[customers, activeCount, recent]} />

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Active customers"
          value={formatNumber(activeTotal)}
          hint="Excludes suspended and administrator accounts"
          icon={Users}
          tone="brand"
        />
        <StatCard
          label="Selected recipients"
          value={audience === "all" ? "All" : formatNumber(selectedUids.length)}
          hint={audience === "all" ? "Everyone active will receive this" : "Only checked accounts"}
          icon={BellRing}
          tone="gold"
        />
        <StatCard
          label="Recent notifications"
          value={formatNumber((recent.data ?? []).length)}
          hint="Across all accounts, newest first"
          icon={Bell}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <Card>
          <CardHeader icon={Megaphone} title="Compose" description="Short, factual messages only." />
          <CardBody className="space-y-4">
            {error ? <FieldError>{error}</FieldError> : null}

            <Segmented
              options={[
                { value: "all", label: "All customers" },
                { value: "selected", label: "Choose recipients" },
              ]}
              value={audience}
              onChange={setAudience}
              ariaLabel="Choose the audience"
            />

            <FormRow columns={2}>
              <div>
                <Label htmlFor="ann-type" required>
                  Notification type
                </Label>
                <Select
                  id="ann-type"
                  value={type}
                  onChange={(event) => setType(event.target.value as BroadcastType)}
                >
                  {TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="ann-href" hint="Optional in-app link">
                  Link
                </Label>
                <Input
                  id="ann-href"
                  value={href}
                  onChange={(event) => setHref(event.target.value)}
                  placeholder="/draws"
                />
              </div>
            </FormRow>

            <div>
              <Label htmlFor="ann-title" required>
                Subject
              </Label>
              <Input
                id="ann-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. Draw scheduled for 20 October, 8 PM"
              />
            </div>

            <div>
              <Label htmlFor="ann-body" required>
                Message
              </Label>
              <Textarea
                id="ann-body"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                className="min-h-28"
                placeholder="State only what is confirmed. Never promise a prize or a guaranteed outcome."
              />
            </div>

            <Alert tone="info" title="Write outcomes honestly">
              Announcements must not promise a win or imply guaranteed returns. Describe schedules and steps,
              and link customers to the published terms.
            </Alert>

            <div className="flex justify-end">
              <Button onClick={openConfirm} iconLeft={<Send className="size-4" aria-hidden />}>
                Review &amp; send
              </Button>
            </div>
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader
              icon={Users}
              title="Recipients"
              description={
                audience === "all"
                  ? "Every active customer account."
                  : "Tick the accounts that should receive this announcement."
              }
            />
            <CardBody>
              {audience === "all" ? (
                <p className="py-4 text-[13px] leading-relaxed text-muted">
                  {activeCount.loading
                    ? "Counting active customer accounts…"
                    : activeTotal
                      ? `The server will deliver this to all ${formatNumber(activeTotal)} active customer account(s), including any not listed on this screen.`
                      : activeCount.error
                        ? "The recipient count could not be loaded."
                        : "No active customer accounts yet."}
                </p>
              ) : customers.loading ? (
                <Skeleton className="h-56" rounded="lg" />
              ) : (
                <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                  {recipients.map((customer) => (
                    <li key={customer.uid}>
                      <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line bg-ivory/40 px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selectedUids.includes(customer.uid)}
                          onChange={() => toggleUid(customer.uid)}
                          className="size-4 accent-[#9F2028]"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-ink">{customer.fullName}</p>
                          <p className="text-[11px] text-muted">{customer.phoneMasked}</p>
                        </div>
                      </label>
                    </li>
                  ))}
                  {!recipients.length ? (
                    <p className="py-6 text-center text-[13px] text-muted">
                      No active customer accounts yet.
                    </p>
                  ) : null}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader icon={Info} title="How delivery works" />
            <CardBody className="space-y-2.5 text-[12.5px] leading-relaxed text-muted">
              <p>
                Each recipient receives an individual document in the <code>notifications</code> collection,
                shown instantly in their dashboard inbox.
              </p>
              <p>
                This panel only writes in-app notifications. SMS or email delivery would require a separate,
                verified provider and is intentionally not simulated here.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>

      <Card className="mt-4">
        <CardHeader
          icon={Bell}
          title="Recent notifications"
          description="The newest inbox entries across every account."
        />
        <CardBody>
          {recent.loading ? (
            <Skeleton className="h-52" rounded="lg" />
          ) : (
            <DataTable
              columns={recentColumns}
              rows={recent.data ?? []}
              keyOf={(row) => row.id}
              caption="Recent notifications"
              emptyTitle="No notifications yet"
              emptyDescription="Announcements and transactional notifications appear here."
            />
          )}
        </CardBody>
      </Card>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => void send()}
        busy={sending}
        title="Send this announcement?"
        description="The notification is written to each recipient's inbox immediately and cannot be recalled."
        confirmLabel={`Send to ${formatNumber(targetCount)} account(s)`}
      >
        <div className="space-y-3">
          <dl className="space-y-1.5 rounded-xl border border-line bg-ivory/60 p-3 text-[13px]">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Type</dt>
              <dd className="text-ink">{type.replace(/_/g, " ")}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Recipients</dt>
              <dd className="tabular-nums text-ink">{formatNumber(targetCount)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Subject</dt>
              <dd className="max-w-[60%] truncate text-right text-ink">{title || "—"}</dd>
            </div>
          </dl>
          <p className="rounded-xl border border-line bg-paper p-3 text-[13px] leading-relaxed text-ink">
            {body || "—"}
          </p>
        </div>
      </ConfirmDialog>
    </>
  );
}
