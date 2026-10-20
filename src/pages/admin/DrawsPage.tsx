import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Coins,
  Dices,
  Plus,
  Send,
  Ticket as TicketIcon,
  Trash2,
} from "lucide-react";
import { useAsync } from "@/hooks/useAsync";
import { useToast } from "@/app/ToastProvider";
import { callBackend, errorActionHint } from "@/lib/backend/callBackend";
import type {
  CancelDrawRequest,
  CancelDrawResponse,
  GenerateInventoryRequest,
  GenerateInventoryResponse,
  PublishResultsRequest,
  PublishResultsResponse,
  RunDrawRequest,
  RunDrawResponse,
} from "@/lib/backend/api";
import { drawService } from "@/services/drawService";
import type { Draw, DrawResult, DrawStatus, Prize, PrizeTier } from "@/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  DataTable,
  Dialog,
  FieldError,
  FormRow,
  Input,
  Label,
  LoadErrors,
  Segmented,
  Select,
  Skeleton,
  Textarea,
  type Column,
} from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { DrawStatusBadge } from "@/features/draws/DrawMeta";
import { formatINR } from "@/utils/money";
import { formatDateTime, formatNumber } from "@/utils/format";
import { newId, slugify } from "@/utils/id";

/**
 * Statuses an administrator can set by editing. Results and cancellation are
 * server actions (Run / Publish / Cancel) so they always come with their
 * winner selection, announcements or refunds.
 */
const STATUS_OPTIONS: DrawStatus[] = ["draft", "upcoming", "open", "sales_closed", "in_progress"];
const LOCKED_STATUSES: DrawStatus[] = ["results_pending", "completed", "cancelled"];

const TIER_OPTIONS: Array<{ value: PrizeTier; label: string }> = [
  { value: "gold", label: "Gold (picked 1st)" },
  { value: "silver", label: "Silver (picked 2nd)" },
  { value: "bronze", label: "Bronze (picked 3rd)" },
  { value: "special", label: "Special (picked last)" },
];

interface PrizeDraft {
  id: string;
  tier: PrizeTier;
  title: string;
  description: string;
  quantity: string;
  imageUrl?: string;
}

function toPrizeDraft(prize: Prize): PrizeDraft {
  return { ...prize, quantity: String(prize.quantity) };
}

function newPrizeDraft(): PrizeDraft {
  return { id: newId("prize"), tier: "special", title: "", description: "", quantity: "1" };
}

interface DrawDraft {
  title: string;
  description: string;
  ticketPriceRupees: string;
  ticketNumberStart: string;
  ticketNumberEnd: string;
  numberPadding: string;
  salesOpenAt: string;
  salesCloseAt: string;
  drawAt: string;
  maxTicketsPerUser: string;
  eligibility: string;
  status: DrawStatus;
  published: boolean;
  prizes: PrizeDraft[];
}

function toLocalInput(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

const EMPTY_DRAFT: DrawDraft = {
  title: "",
  description: "",
  ticketPriceRupees: "499",
  ticketNumberStart: "100001",
  ticketNumberEnd: "100400",
  numberPadding: "6",
  salesOpenAt: toLocalInput(new Date().toISOString()),
  salesCloseAt: "",
  drawAt: "",
  maxTicketsPerUser: "10",
  eligibility: "Open to participants aged 18 and above.",
  status: "draft",
  published: false,
  prizes: [],
};

export function AdminDrawsPage() {
  const toast = useToast();
  const [filter, setFilter] = useState<"all" | "active" | "draft" | "completed">("all");
  const [editing, setEditing] = useState<Draw | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<DrawDraft>(EMPTY_DRAFT);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{
    kind: "run" | "publish" | "inventory" | "cancel";
    draw: Draw;
  } | null>(null);
  const [result, setResult] = useState<DrawResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const draws = useAsync(() => drawService.listAll(200), []);
  const prizesLocked = LOCKED_STATUSES.includes(draft.status);

  const rows = useMemo(() => {
    const all = draws.data ?? [];
    if (filter === "active") {
      return all.filter((d) =>
        ["open", "upcoming", "sales_closed", "in_progress", "results_pending"].includes(d.status),
      );
    }
    if (filter === "draft") return all.filter((d) => d.status === "draft");
    if (filter === "completed") return all.filter((d) => d.status === "completed");
    return all;
  }, [draws.data, filter]);

  const openCreate = () => {
    setDraft(EMPTY_DRAFT);
    setEditing(null);
    setFormError(null);
    setCreating(true);
  };

  const openEdit = (draw: Draw) => {
    setDraft({
      title: draw.title,
      description: draw.description,
      ticketPriceRupees: (draw.ticketPricePaise / 100).toString(),
      ticketNumberStart: String(draw.ticketNumberStart),
      ticketNumberEnd: String(draw.ticketNumberEnd),
      numberPadding: String(draw.numberPadding),
      salesOpenAt: toLocalInput(draw.salesOpenAt),
      salesCloseAt: toLocalInput(draw.salesCloseAt),
      drawAt: toLocalInput(draw.drawAt),
      maxTicketsPerUser: String(draw.maxTicketsPerUser),
      eligibility: draw.eligibility,
      status: draw.status,
      published: draw.published,
      prizes: (draw.prizes ?? []).map(toPrizeDraft),
    });
    setEditing(draw);
    setFormError(null);
    setCreating(true);
  };

  const save = async () => {
    setFormError(null);
    const title = draft.title.trim();
    const pricePaise = Math.round(Number(draft.ticketPriceRupees) * 100);
    const start = Number(draft.ticketNumberStart);
    const end = Number(draft.ticketNumberEnd);
    const padding = Number(draft.numberPadding);
    const maxPerUser = Number(draft.maxTicketsPerUser);

    if (title.length < 4) return setFormError("Enter a draw title of at least 4 characters.");
    if (!Number.isFinite(pricePaise) || pricePaise <= 0) return setFormError("Enter a valid ticket price.");
    if (!Number.isInteger(start) || !Number.isInteger(end) || end <= start) {
      return setFormError("Ticket number range must be valid and ascending.");
    }
    if (end - start + 1 > 20000) {
      return setFormError("A single draw supports at most 20,000 ticket numbers.");
    }
    if (!Number.isInteger(padding) || padding < 3 || padding > 10) {
      return setFormError("Number padding must be between 3 and 10 digits.");
    }
    if (!Number.isInteger(maxPerUser) || maxPerUser < 1) {
      return setFormError("Maximum tickets per account must be at least 1.");
    }
    if (!draft.salesCloseAt || !draft.drawAt) {
      return setFormError("Set both the sales close time and the draw time.");
    }
    if (new Date(draft.salesCloseAt) > new Date(draft.drawAt)) {
      return setFormError("Sales must close before the draw time.");
    }

    const prizes: Prize[] = [];
    for (const [index, row] of draft.prizes.entries()) {
      const label = row.title.trim() || `Prize ${index + 1}`;
      const quantity = Number(row.quantity);
      if (row.title.trim().length < 2) return setFormError(`Give prize ${index + 1} a name, e.g. “1st prize”.`);
      if (row.description.trim().length < 3) return setFormError(`Describe the reward for “${label}”.`);
      if (!Number.isInteger(quantity) || quantity < 0) {
        return setFormError(`“${label}” needs a whole number of winners (0 for every participant).`);
      }
      prizes.push({
        id: row.id,
        tier: row.tier,
        title: row.title.trim(),
        description: row.description.trim(),
        quantity,
        ...(row.imageUrl ? { imageUrl: row.imageUrl } : {}),
      });
    }
    const winnerCount = prizes.reduce((sum, prize) => sum + prize.quantity, 0);
    if (winnerCount > end - start + 1) {
      return setFormError(
        `The prizes need ${formatNumber(winnerCount)} winners but the draw has only ${formatNumber(end - start + 1)} tickets.`,
      );
    }
    if (draft.status !== "draft" && !prizesLocked && winnerCount === 0) {
      return setFormError("Add at least one prize with winners before opening this draw.");
    }

    setSaving(true);
    try {
      const payload = {
        title,
        slug: editing?.slug ?? slugify(title),
        description: draft.description.trim(),
        ticketPricePaise: pricePaise,
        currency: "INR" as const,
        ticketNumberStart: start,
        ticketNumberEnd: end,
        numberPadding: padding,
        totalTickets: end - start + 1,
        salesOpenAt: fromLocalInput(draft.salesOpenAt),
        salesCloseAt: fromLocalInput(draft.salesCloseAt),
        drawAt: fromLocalInput(draft.drawAt),
        timezone: "Asia/Kolkata",
        status: draft.status,
        maxTicketsPerUser: maxPerUser,
        eligibility: draft.eligibility.trim(),
        published: draft.published,
        ...(prizesLocked ? {} : { prizes }),
      };

      if (editing) {
        await drawService.update(editing.id, payload as Partial<Draw>);
        toast.success("Draw updated", title);
      } else {
        await drawService.create(payload as never);
        toast.success("Draw created", "Generate its ticket inventory before opening sales.");
      }
      setCreating(false);
      setEditing(null);
      draws.reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "The draw could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const runAction = async () => {
    if (!confirm) return;
    const { kind, draw } = confirm;
    setError(null);
    setActionBusy(draw.id);
    try {
      if (kind === "inventory") {
        const res = await callBackend<GenerateInventoryRequest, GenerateInventoryResponse>(
          "generateTicketInventory",
          { drawId: draw.id },
        );
        toast.success(
          "Ticket inventory generated",
          res.created
            ? `${formatNumber(res.created)} numbers created for ${draw.title}.`
            : `Inventory already exists (${formatNumber(res.total)} numbers). Nothing was duplicated.`,
        );
      } else if (kind === "run") {
        const res = await callBackend<RunDrawRequest, RunDrawResponse>("runDraw", { drawId: draw.id });
        toast.success(
          "Draw executed",
          `${formatNumber(res.winningTicketNumbers.length)} winning tickets selected from ${formatNumber(
            res.eligibleTicketCount,
          )}. Results are NOT public yet.`,
        );
      } else if (kind === "publish") {
        const res = await callBackend<PublishResultsRequest, PublishResultsResponse>(
          "publishDrawResults",
          { drawId: draw.id, note: note.trim() || undefined },
        );
        toast.success("Results published", `${formatNumber(res.publishedWinners)} winners announced.`);
        setNote("");
      } else if (kind === "cancel") {
        if (note.trim().length < 4) {
          setError("Give a short cancellation reason before cancelling.");
          setActionBusy(null);
          return;
        }
        const res = await callBackend<CancelDrawRequest, CancelDrawResponse>("cancelDraw", {
          drawId: draw.id,
          reason: note.trim(),
        });
        toast.success(
          "Draw cancelled",
          res.refundedOrders
            ? `${formatNumber(res.refundedOrders)} order(s) refunded to wallets (${formatINR(res.refundedPaise)}).`
            : "Ticket sales are closed for this draw. No orders needed a refund.",
        );
        setNote("");
      }
      setConfirm(null);
      draws.reload();
    } catch (err) {
      const message = err instanceof Error ? err.message : "The action could not be completed.";
      const hint = errorActionHint((err as { code?: string }).code ?? "");
      setError(hint ? `${message} ${hint}` : message);
      setConfirm(null);
    } finally {
      setActionBusy(null);
    }
  };

  const viewResult = async (draw: Draw) => {
    setResult(await drawService.result(draw.id));
  };

  const columns: Array<Column<Draw>> = [
    {
      key: "title",
      header: "Draw",
      render: (row) => (
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-medium text-ink">
            {row.title}
          </p>
          <p className="text-[11px] text-muted">
            {formatINR(row.ticketPricePaise)} · #{row.ticketNumberStart}–{row.ticketNumberEnd} · max{" "}
            {row.maxTicketsPerUser}/account
          </p>
        </div>
      ),
    },
    {
      key: "schedule",
      header: "Schedule",
      hideBelow: "md",
      render: (row) => (
        <div className="text-[12px]">
          <p className="text-muted">Closes {formatDateTime(row.salesCloseAt)}</p>
          <p className="text-ink">Draws {formatDateTime(row.drawAt)}</p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <div className="flex flex-col items-end gap-1 sm:items-start">
          <DrawStatusBadge status={row.status} />
          {!row.published ? <Badge tone="muted">Unpublished</Badge> : null}
        </div>
      ),
    },
    {
      key: "capacity",
      header: "Capacity",
      align: "right",
      hideBelow: "sm",
      render: (row) => <span className="tabular-nums text-muted">{formatNumber(row.totalTickets)}</span>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (row) => (
        <div className="flex flex-wrap justify-end gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => openEdit(row)}>
            Edit
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setConfirm({ kind: "inventory", draw: row })}
            iconLeft={<TicketIcon className="size-3.5" aria-hidden />}
          >
            Inventory
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={["draft", "cancelled", "completed"].includes(row.status)}
            onClick={() => setConfirm({ kind: "run", draw: row })}
            iconLeft={<Dices className="size-3.5" aria-hidden />}
          >
            Run
          </Button>
          <Button
            size="sm"
            variant="gold"
            disabled={row.status !== "results_pending"}
            onClick={() => setConfirm({ kind: "publish", draw: row })}
            iconLeft={<Send className="size-3.5" aria-hidden />}
          >
            Publish
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void viewResult(row)}>
            Result
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Draws & prizes"
        icon={Coins}
        title="Draw management"
        description="Configure schedules, generate inventory, execute draws and — separately — publish results. Executing a draw never exposes winners on its own."
        actions={
          <Button onClick={openCreate} iconLeft={<Plus className="size-4" aria-hidden />}>
            New draw
          </Button>
        }
      />

      <LoadErrors className="mt-4" sources={[draws]} />

      <Alert tone="warning" className="mt-4" title="Two-step result release">
        Running a draw selects winning tickets and stores the result privately. Winners become public
        only after you press <strong>Publish</strong>, which writes the announcements and notifies
        everyone holding a winning number.
      </Alert>

      {error ? (
        <Alert tone="danger" className="mt-4" title="Action not completed">
          {error}
        </Alert>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          options={[
            { value: "all", label: "All draws" },
            { value: "active", label: "Active" },
            { value: "draft", label: "Drafts" },
            { value: "completed", label: "Completed" },
          ]}
          value={filter}
          onChange={setFilter}
          ariaLabel="Filter draws"
        />
        <p className="text-[12px] text-muted">{formatNumber(rows.length)} draw(s)</p>
      </div>

      <Card className="mt-4">
        <CardHeader icon={Coins} title="Configured draws" description="Every draw, including unpublished drafts." />
        <CardBody>
          {draws.loading ? (
            <Skeleton className="h-64" rounded="lg" />
          ) : (
            <DataTable
              columns={columns}
              rows={rows}
              keyOf={(row) => row.id}
              caption="Draws"
              emptyTitle="No draws yet"
              emptyDescription="Create a draw, generate its inventory, then open sales."
              emptyAction={
                <Button onClick={openCreate} iconLeft={<Plus className="size-4" aria-hidden />}>
                  Create a draw
                </Button>
              }
            />
          )}
        </CardBody>
      </Card>

      {/* --------------------------------------------------------- create/edit */}
      <Dialog
        open={creating}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        size="xl"
        dismissible={!saving}
        title={editing ? `Edit ${editing.title}` : "Create a draw"}
        description="Schedules are stored in Asia/Kolkata. Inventory is generated separately so numbers are never created twice."
      >
        <div className="space-y-4">
          {formError ? <FieldError>{formError}</FieldError> : null}

          <FormRow columns={1}>
            <div>
              <Label htmlFor="draw-title" required>
                Draw title
              </Label>
              <Input
                id="draw-title"
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                placeholder="e.g. Diwali Dhamaka Main Draw"
              />
            </div>
          </FormRow>

          <div>
            <Label htmlFor="draw-description">Description</Label>
            <Textarea
              id="draw-description"
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              placeholder="What participants should know about this draw."
            />
          </div>

          <FormRow columns={3}>
            <div>
              <Label htmlFor="draw-price" required hint="Rupees">
                Ticket price
              </Label>
              <Input
                id="draw-price"
                inputMode="decimal"
                prefix="₹"
                value={draft.ticketPriceRupees}
                onChange={(event) =>
                  setDraft({ ...draft, ticketPriceRupees: event.target.value.replace(/[^\d.]/g, "") })
                }
              />
            </div>
            <div>
              <Label htmlFor="draw-start" required>
                First number
              </Label>
              <Input
                id="draw-start"
                inputMode="numeric"
                value={draft.ticketNumberStart}
                onChange={(event) =>
                  setDraft({ ...draft, ticketNumberStart: event.target.value.replace(/\D/g, "") })
                }
              />
            </div>
            <div>
              <Label htmlFor="draw-end" required>
                Last number
              </Label>
              <Input
                id="draw-end"
                inputMode="numeric"
                value={draft.ticketNumberEnd}
                onChange={(event) =>
                  setDraft({ ...draft, ticketNumberEnd: event.target.value.replace(/\D/g, "") })
                }
              />
            </div>
          </FormRow>

          <FormRow columns={3}>
            <div>
              <Label htmlFor="draw-padding" required hint="Digits">
                Number padding
              </Label>
              <Input
                id="draw-padding"
                inputMode="numeric"
                value={draft.numberPadding}
                onChange={(event) =>
                  setDraft({ ...draft, numberPadding: event.target.value.replace(/\D/g, "") })
                }
              />
            </div>
            <div>
              <Label htmlFor="draw-max" required hint="Per account">
                Max tickets
              </Label>
              <Input
                id="draw-max"
                inputMode="numeric"
                value={draft.maxTicketsPerUser}
                onChange={(event) =>
                  setDraft({ ...draft, maxTicketsPerUser: event.target.value.replace(/\D/g, "") })
                }
              />
            </div>
            <div>
              <Label htmlFor="draw-status" required>
                Status
              </Label>
              <Select
                id="draw-status"
                value={draft.status}
                disabled={LOCKED_STATUSES.includes(draft.status)}
                onChange={(event) => setDraft({ ...draft, status: event.target.value as DrawStatus })}
              >
                {(LOCKED_STATUSES.includes(draft.status) ? [draft.status] : STATUS_OPTIONS).map((status) => (
                  <option key={status} value={status}>
                    {status.replace(/_/g, " ")}
                  </option>
                ))}
              </Select>
            </div>
          </FormRow>

          <FormRow columns={3}>
            <div>
              <Label htmlFor="draw-open" required>
                Sales open
              </Label>
              <Input
                id="draw-open"
                type="datetime-local"
                value={draft.salesOpenAt}
                onChange={(event) => setDraft({ ...draft, salesOpenAt: event.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="draw-close" required>
                Sales close
              </Label>
              <Input
                id="draw-close"
                type="datetime-local"
                value={draft.salesCloseAt}
                onChange={(event) => setDraft({ ...draft, salesCloseAt: event.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="draw-at" required>
                Draw time
              </Label>
              <Input
                id="draw-at"
                type="datetime-local"
                value={draft.drawAt}
                onChange={(event) => setDraft({ ...draft, drawAt: event.target.value })}
              />
            </div>
          </FormRow>

          <div>
            <Label htmlFor="draw-eligibility">Eligibility</Label>
            <Textarea
              id="draw-eligibility"
              value={draft.eligibility}
              onChange={(event) => setDraft({ ...draft, eligibility: event.target.value })}
              className="min-h-20"
            />
          </div>

          <label className="flex items-start gap-2.5 rounded-xl border border-line bg-ivory/50 p-3">
            <input
              type="checkbox"
              checked={draft.published}
              onChange={(event) => setDraft({ ...draft, published: event.target.checked })}
              className="mt-0.5 size-4 accent-[#9F2028]"
            />
            <span className="text-[13px] leading-relaxed text-ink">
              Publish this draw on the public site
              <span className="mt-0.5 block text-[12px] text-muted">
                Draft or unpublished draws are invisible to customers even when their status is “open”.
              </span>
            </span>
          </label>

          <section aria-labelledby="draw-prizes-title" className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h3 id="draw-prizes-title" className="text-[14px] font-semibold text-ink">
                  Prizes
                </h3>
                <p className="text-[12px] text-muted">
                  Shown on the home page, the booking page and the draw page. Set winners to 0 for a perk
                  every participant gets, such as a discount coupon.
                </p>
              </div>
              {prizesLocked ? null : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDraft({ ...draft, prizes: [...draft.prizes, newPrizeDraft()] })}
                  iconLeft={<Plus className="size-3.5" aria-hidden />}
                >
                  Add prize
                </Button>
              )}
            </div>

            {prizesLocked ? (
              <Alert tone="info" title="Prizes are locked">
                Winners have already been drawn for this draw (or it was cancelled), so its prizes can no
                longer change.
              </Alert>
            ) : null}

            {draft.prizes.length ? (
              draft.prizes.map((prize, index) => (
                <PrizeRow
                  key={prize.id}
                  prize={prize}
                  index={index}
                  count={draft.prizes.length}
                  disabled={prizesLocked}
                  onChange={(patch) =>
                    setDraft({
                      ...draft,
                      prizes: draft.prizes.map((p) => (p.id === prize.id ? { ...p, ...patch } : p)),
                    })
                  }
                  onMove={(delta) => {
                    const next = [...draft.prizes];
                    const [moved] = next.splice(index, 1);
                    next.splice(index + delta, 0, moved);
                    setDraft({ ...draft, prizes: next });
                  }}
                  onRemove={() => setDraft({ ...draft, prizes: draft.prizes.filter((p) => p.id !== prize.id) })}
                />
              ))
            ) : (
              <p className="rounded-xl border border-dashed border-line px-3 py-5 text-center text-[13px] text-muted">
                No prizes yet. Add the 1st, 2nd and 3rd prizes and any gift boxes or coupons.
              </p>
            )}

            {!prizesLocked && editing?.published ? (
              <Alert tone="warning" title="Ticket holders are told about changes">
                This draw is public. Saving changed prizes sends every ticket holder a notification that the
                prize details were updated.
              </Alert>
            ) : null}
          </section>

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setCreating(false);
                setEditing(null);
              }}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={() => void save()} loading={saving}>
              {editing ? "Save changes" : "Create draw"}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* --------------------------------------------------------- confirmations */}
      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={() => void runAction()}
        busy={Boolean(actionBusy)}
        tone={confirm?.kind === "publish" ? "success" : "primary"}
        title={
          confirm?.kind === "inventory"
            ? "Generate ticket inventory"
            : confirm?.kind === "run"
              ? "Execute this draw now"
              : confirm?.kind === "publish"
                ? "Publish draw results"
                : "Cancel this draw"
        }
        description="This action is recorded in the audit log."
        confirmLabel={
          confirm?.kind === "inventory"
            ? "Generate numbers"
            : confirm?.kind === "run"
              ? "Run the draw"
              : confirm?.kind === "publish"
                ? "Publish results"
                : "Cancel the draw"
        }
      >
        {confirm ? (
          <div className="space-y-3">
            <p className="text-[13px] leading-relaxed text-muted">
              {confirm.kind === "inventory" ? (
                <>
                  Creates one document per number between{" "}
                  <strong className="text-ink">{confirm.draw.ticketNumberStart}</strong> and{" "}
                  <strong className="text-ink">{confirm.draw.ticketNumberEnd}</strong>. If inventory
                  already exists, nothing is duplicated.
                </>
              ) : confirm.kind === "run" ? (
                <>
                  Selects winning tickets using a cryptographically secure random index.{" "}
                  <strong className="text-ink">Winners stay private</strong> until you publish. A draw
                  can only be executed once.
                </>
              ) : confirm.kind === "publish" ? (
                <>
                  Writes the winner announcements, marks the draw completed and notifies every winning
                  account. This makes the outcome public.
                </>
              ) : (
                <>
                  Marks the draw cancelled, stops sales and refunds every completed ticket order to
                  the buyer&apos;s wallet as a ledger credit. Holders are notified. This cannot be undone.
                </>
              )}
            </p>
            {confirm.kind === "publish" || confirm.kind === "cancel" ? (
              <div>
                <Label htmlFor="action-note" hint="Optional for publish, required for cancel">
                  {confirm.kind === "cancel" ? "Cancellation reason" : "Publish note"}
                </Label>
                <Textarea
                  id="action-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  className="min-h-20"
                  placeholder={
                    confirm.kind === "cancel"
                      ? "e.g. Insufficient participation — cancelled and refunded."
                      : "e.g. Verified by two operators."
                  }
                />
              </div>
            ) : null}
            {confirm.kind === "run" ? (
              <Alert tone="warning" title="Run once only">
                <span className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-gold-deep" aria-hidden />
                  A draw cannot be re-run. Confirm the schedule and prize tiers before proceeding.
                </span>
              </Alert>
            ) : null}
          </div>
        ) : null}
      </ConfirmDialog>

      {/* ------------------------------------------------------------- result */}
      <Dialog
        open={Boolean(result)}
        onClose={() => setResult(null)}
        title="Stored draw result"
        description="Private until published. This is the raw selection recorded at execution time."
      >
        {result ? (
          <div className="space-y-3">
            <dl className="space-y-2 rounded-xl border border-line bg-ivory/60 p-3 text-[13px]">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Draw</dt>
                <dd className="font-semibold text-ink">{result.drawTitle}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Executed</dt>
                <dd className="text-ink">{formatDateTime(result.drawnAt)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Eligible tickets</dt>
                <dd className="tabular-nums text-ink">{formatNumber(result.eligibleTicketCount)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Winning tickets</dt>
                <dd className="tabular-nums text-ink">{formatNumber(result.winningTicketIds.length)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Published</dt>
                <dd>
                  <Badge tone={result.published ? "emerald" : "warning"}>
                    {result.published ? "Published" : "Private"}
                  </Badge>
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Executions</dt>
                <dd className="tabular-nums text-ink">{result.executionCount}</dd>
              </div>
            </dl>
            {result.winningTicketNumbers.length ? (
              <div className="flex flex-wrap gap-1.5">
                {result.winningTicketNumbers.map((number) => (
                  <span
                    key={number}
                    className="rounded-md border border-gold/40 bg-gold-soft/50 px-2 py-1 text-[12px] font-bold tabular-nums text-gold-deep"
                  >
                    {number}
                  </span>
                ))}
              </div>
            ) : null}
            {result.auditNote ? (
              <p className="text-[12px] leading-relaxed text-muted">{result.auditNote}</p>
            ) : null}
          </div>
        ) : (
          <p className="text-[13px] text-muted">This draw has not been executed yet.</p>
        )}
      </Dialog>
    </>
  );
}

function PrizeRow({
  prize,
  index,
  count,
  disabled,
  onChange,
  onMove,
  onRemove,
}: {
  prize: PrizeDraft;
  index: number;
  count: number;
  disabled: boolean;
  onChange: (patch: Partial<PrizeDraft>) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  const id = `prize-${prize.id}`;
  return (
    <div className="rounded-xl border border-line bg-ivory/50 p-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_6.5rem_11rem]">
        <div>
          <Label htmlFor={`${id}-title`} required>
            Prize name
          </Label>
          <Input
            id={`${id}-title`}
            value={prize.title}
            disabled={disabled}
            maxLength={60}
            onChange={(event) => onChange({ title: event.target.value })}
            placeholder="e.g. 1st prize"
          />
        </div>
        <div>
          <Label htmlFor={`${id}-qty`} required hint="0 = all">
            Winners
          </Label>
          <Input
            id={`${id}-qty`}
            inputMode="numeric"
            value={prize.quantity}
            disabled={disabled}
            onChange={(event) => onChange({ quantity: event.target.value.replace(/\D/g, "") })}
          />
        </div>
        <div>
          <Label htmlFor={`${id}-tier`} required>
            Tier
          </Label>
          <Select
            id={`${id}-tier`}
            value={prize.tier}
            disabled={disabled}
            onChange={(event) => onChange({ tier: event.target.value as PrizeTier })}
          >
            {TIER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="mt-3">
        <Label htmlFor={`${id}-reward`} required>
          Reward
        </Label>
        <Input
          id={`${id}-reward`}
          value={prize.description}
          disabled={disabled}
          maxLength={200}
          onChange={(event) => onChange({ description: event.target.value })}
          placeholder="e.g. ₹7,500 cash or a gift of equal value"
        />
      </div>
      {disabled ? null : (
        <div className="mt-2 flex justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            disabled={index === 0}
            onClick={() => onMove(-1)}
            aria-label={`Move ${prize.title || "prize"} up`}
          >
            <ArrowUp className="size-3.5" aria-hidden />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={index === count - 1}
            onClick={() => onMove(1)}
            aria-label={`Move ${prize.title || "prize"} down`}
          >
            <ArrowDown className="size-3.5" aria-hidden />
          </Button>
          <Button size="sm" variant="ghost" onClick={onRemove} aria-label={`Remove ${prize.title || "prize"}`}>
            <Trash2 className="size-3.5 text-brand" aria-hidden />
          </Button>
        </div>
      )}
    </div>
  );
}
