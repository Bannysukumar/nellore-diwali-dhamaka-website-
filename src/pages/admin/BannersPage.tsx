import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Images, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { useAsync } from "@/hooks/useAsync";
import { useToast } from "@/app/ToastProvider";
import { store } from "@/lib/backend";
import { contentService } from "@/services/contentService";
import { uploadImage, validateImage } from "@/services/storageService";
import { adminService } from "@/services/adminService";
import { useAuth } from "@/app/AuthProvider";
import type { Banner, BannerSlot } from "@/types";
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
  Switch,
  type Column,
} from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatDateTime } from "@/utils/format";

const SLOT_LABEL: Record<BannerSlot, string> = {
  home_hero: "Home hero",
  promo: "Promotional strip",
  draw: "Draw banner",
  splash: "Splash slot",
};

interface BannerDraft {
  slot: BannerSlot;
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaHref: string;
  active: boolean;
  startAt: string;
  endAt: string;
  sortOrder: string;
  imageUrl: string;
  imagePath: string;
}

const EMPTY: BannerDraft = {
  slot: "promo",
  title: "",
  subtitle: "",
  ctaLabel: "",
  ctaHref: "",
  active: true,
  startAt: "",
  endAt: "",
  sortOrder: "0",
  imageUrl: "",
  imagePath: "",
};

function toLocal(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
}

export function AdminBannersPage() {
  const toast = useToast();
  const { profile } = useAuth();
  const [filter, setFilter] = useState<"all" | BannerSlot>("all");
  const [editing, setEditing] = useState<Banner | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<BannerDraft>(EMPTY);
  const [formError, setFormError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<Banner | null>(null);

  const banners = useAsync(() => contentService.allBanners(), []);
  const all = useMemo(() => banners.data ?? [], [banners.data]);

  const rows = useMemo(
    () => (filter === "all" ? all : all.filter((b) => b.slot === filter)),
    [all, filter],
  );

  const openCreate = () => {
    setDraft({ ...EMPTY, sortOrder: String(all.length) });
    setEditing(null);
    setFormError(null);
    setOpen(true);
  };

  const openEdit = (banner: Banner) => {
    setDraft({
      slot: banner.slot,
      title: banner.title,
      subtitle: banner.subtitle ?? "",
      ctaLabel: banner.ctaLabel ?? "",
      ctaHref: banner.ctaHref ?? "",
      active: banner.active,
      startAt: toLocal(banner.startAt),
      endAt: toLocal(banner.endAt),
      sortOrder: String(banner.sortOrder),
      imageUrl: banner.imageUrl,
      imagePath: banner.imagePath,
    });
    setEditing(banner);
    setFormError(null);
    setOpen(true);
  };

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    const problem = validateImage(file);
    if (problem) {
      setFormError(problem);
      return;
    }
    setUploading(true);
    setFormError(null);
    try {
      const result = await uploadImage("banners", file, profile?.uid ?? "admin");
      setDraft((d) => ({ ...d, imageUrl: result.url, imagePath: result.path }));
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "The image could not be uploaded.");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setFormError(null);
    if (draft.title.trim().length < 3) return setFormError("Give the banner a short title.");
    if (!draft.imageUrl) return setFormError("Upload the banner image before saving.");
    if (draft.startAt && draft.endAt && new Date(draft.startAt) > new Date(draft.endAt)) {
      return setFormError("The start date must be before the end date.");
    }

    setSaving(true);
    try {
      const payload = {
        slot: draft.slot,
        title: draft.title.trim(),
        subtitle: draft.subtitle.trim() || undefined,
        imageUrl: draft.imageUrl,
        imagePath: draft.imagePath,
        ctaLabel: draft.ctaLabel.trim() || undefined,
        ctaHref: draft.ctaHref.trim() || undefined,
        active: draft.active,
        startAt: draft.startAt ? new Date(draft.startAt).toISOString() : undefined,
        endAt: draft.endAt ? new Date(draft.endAt).toISOString() : undefined,
        sortOrder: Number(draft.sortOrder) || 0,
      };

      if (editing) {
        await store.update("banners", editing.id, { ...payload, updatedAt: new Date().toISOString() });
        await adminService.log({
          actorUid: profile?.uid ?? "",
          actorName: profile?.fullName ?? "Administrator",
          action: "banner.update",
          entity: "banners",
          entityId: editing.id,
          note: payload.title,
        });
        toast.success("Banner updated", payload.title);
      } else {
        const id = await store.create("banners", {
          ...payload,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        await adminService.log({
          actorUid: profile?.uid ?? "",
          actorName: profile?.fullName ?? "Administrator",
          action: "banner.create",
          entity: "banners",
          entityId: id,
          note: payload.title,
        });
        toast.success("Banner created", "It appears on the site while active and inside its schedule.");
      }
      setOpen(false);
      setEditing(null);
      banners.reload();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "The banner could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (banner: Banner) => {
    try {
      await store.update("banners", banner.id, {
        active: !banner.active,
        updatedAt: new Date().toISOString(),
      });
      toast.success(banner.active ? "Banner hidden" : "Banner activated", banner.title);
      banners.reload();
    } catch (error) {
      toast.error("Could not update", error instanceof Error ? error.message : "Please retry.");
    }
  };

  const reorder = async (banner: Banner, direction: -1 | 1) => {
    try {
      await store.update("banners", banner.id, {
        sortOrder: Math.max(0, banner.sortOrder + direction),
        updatedAt: new Date().toISOString(),
      });
      banners.reload();
    } catch (error) {
      toast.error("Could not reorder", error instanceof Error ? error.message : "Please retry.");
    }
  };

  const confirmRemove = async () => {
    if (!removing) return;
    try {
      await store.remove("banners", removing.id);
      await adminService.log({
        actorUid: profile?.uid ?? "",
        actorName: profile?.fullName ?? "Administrator",
        action: "banner.delete",
        entity: "banners",
        entityId: removing.id,
        note: removing.title,
      });
      toast.success("Banner deleted", removing.title);
      setRemoving(null);
      banners.reload();
    } catch (error) {
      toast.error("Could not delete", error instanceof Error ? error.message : "Please retry.");
    }
  };

  const columns: Array<Column<Banner>> = [
    {
      key: "banner",
      header: "Banner",
      render: (row) => (
        <div className="flex items-center gap-3">
          <span className="size-12 shrink-0 overflow-hidden rounded-lg border border-line bg-ivory">
            {row.imageUrl ? (
              <img src={row.imageUrl} alt="" className="size-full object-cover" />
            ) : null}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-ink">{row.title}</p>
            <p className="text-[11px] text-muted">{row.subtitle ?? SLOT_LABEL[row.slot]}</p>
          </div>
        </div>
      ),
    },
    {
      key: "slot",
      header: "Slot",
      hideBelow: "sm",
      render: (row) => <Badge tone="neutral">{SLOT_LABEL[row.slot]}</Badge>,
    },
    {
      key: "schedule",
      header: "Schedule",
      hideBelow: "md",
      render: (row) => (
        <div className="text-[12px] text-muted">
          <p>{row.startAt ? formatDateTime(row.startAt) : "From now"}</p>
          <p>{row.endAt ? formatDateTime(row.endAt) : "No end date"}</p>
        </div>
      ),
    },
    {
      key: "order",
      header: "Order",
      align: "right",
      hideBelow: "sm",
      render: (row) => <span className="tabular-nums text-muted">{row.sortOrder}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <Badge tone={row.active ? "emerald" : "muted"}>{row.active ? "Active" : "Hidden"}</Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (row) => (
        <div className="flex flex-wrap justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => void reorder(row, -1)} aria-label="Move up">
            <ArrowUp className="size-3.5" aria-hidden />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void reorder(row, 1)} aria-label="Move down">
            <ArrowDown className="size-3.5" aria-hidden />
          </Button>
          <Button size="sm" variant="outline" onClick={() => void toggleActive(row)}>
            {row.active ? "Hide" : "Show"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => openEdit(row)} aria-label="Edit banner">
            <Pencil className="size-3.5" aria-hidden />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setRemoving(row)} aria-label="Delete banner">
            <Trash2 className="size-3.5 text-brand" aria-hidden />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Content"
        icon={Images}
        title="Banners"
        description="Promotional images shown across the site. A banner is only displayed while it is active and inside its schedule window."
        actions={
          <Button onClick={openCreate} iconLeft={<Plus className="size-4" aria-hidden />}>
            New banner
          </Button>
        }
      />

      <LoadErrors className="mt-4" sources={[banners]} />

      <Alert tone="info" className="mt-4" title="Real content only">
        These banners are fetched from Firestore and rendered on the live site. Upload artwork you own the
        rights to — nothing here is generated or simulated.
      </Alert>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          options={[
            { value: "all", label: "All slots" },
            { value: "home_hero", label: "Home hero" },
            { value: "promo", label: "Promo" },
            { value: "draw", label: "Draw" },
            { value: "splash", label: "Splash" },
          ]}
          value={filter}
          onChange={setFilter}
          ariaLabel="Filter banners by slot"
        />
        <div className="flex items-center gap-2">
          <p className="text-[12px] text-muted">{rows.length} banner(s)</p>
        </div>
      </div>

      <Card className="mt-4">
        <CardHeader icon={Images} title="Configured banners" description="Ordered by display priority." />
        <CardBody>
          {banners.loading ? (
            <Skeleton className="h-64" rounded="lg" />
          ) : (
            <DataTable
              columns={columns}
              rows={rows}
              keyOf={(row) => row.id}
              caption="Banners"
              emptyTitle="No banners configured"
              emptyDescription="Upload artwork and set a schedule to show it on the site."
              emptyAction={<Button onClick={openCreate}>Create the first banner</Button>}
            />
          )}
        </CardBody>
      </Card>

      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
          setEditing(null);
        }}
        size="lg"
        dismissible={!saving && !uploading}
        title={editing ? `Edit ${editing.title}` : "New banner"}
        description="Banners are stored in Cloud Storage and referenced from Firestore."
      >
        <div className="space-y-4">
          {formError ? <FieldError>{formError}</FieldError> : null}

          <div>
            <Label htmlFor="banner-title" required>
              Title
            </Label>
            <Input
              id="banner-title"
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              placeholder="e.g. Diwali Dhamaka — tickets now open"
            />
          </div>

          <div>
            <Label htmlFor="banner-subtitle">Subtitle</Label>
            <Input
              id="banner-subtitle"
              value={draft.subtitle}
              onChange={(event) => setDraft({ ...draft, subtitle: event.target.value })}
            />
          </div>

          <FormRow columns={2}>
            <div>
              <Label htmlFor="banner-slot" required>
                Slot
              </Label>
              <Select
                id="banner-slot"
                value={draft.slot}
                onChange={(event) => setDraft({ ...draft, slot: event.target.value as BannerSlot })}
              >
                {Object.entries(SLOT_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="banner-order" hint="Lower shows first">
                Sort order
              </Label>
              <Input
                id="banner-order"
                inputMode="numeric"
                value={draft.sortOrder}
                onChange={(event) =>
                  setDraft({ ...draft, sortOrder: event.target.value.replace(/[^\d-]/g, "") })
                }
              />
            </div>
          </FormRow>

          <FormRow columns={2}>
            <div>
              <Label htmlFor="banner-start">Show from</Label>
              <Input
                id="banner-start"
                type="datetime-local"
                value={draft.startAt}
                onChange={(event) => setDraft({ ...draft, startAt: event.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="banner-end">Hide after</Label>
              <Input
                id="banner-end"
                type="datetime-local"
                value={draft.endAt}
                onChange={(event) => setDraft({ ...draft, endAt: event.target.value })}
              />
            </div>
          </FormRow>

          <FormRow columns={2}>
            <div>
              <Label htmlFor="banner-cta-label">Button label</Label>
              <Input
                id="banner-cta-label"
                value={draft.ctaLabel}
                onChange={(event) => setDraft({ ...draft, ctaLabel: event.target.value })}
                placeholder="e.g. Book tickets"
              />
            </div>
            <div>
              <Label htmlFor="banner-cta-href">Button link</Label>
              <Input
                id="banner-cta-href"
                value={draft.ctaHref}
                onChange={(event) => setDraft({ ...draft, ctaHref: event.target.value })}
                placeholder="/book"
              />
            </div>
          </FormRow>

          <div>
            <Label htmlFor="banner-image" required hint="PNG, JPEG or WebP, up to 5 MB">
              Artwork
            </Label>
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-paper px-3.5 py-2 text-[13px] font-semibold text-ink transition hover:border-gold">
                <Upload className="size-4" aria-hidden />
                {uploading ? "Uploading…" : draft.imageUrl ? "Replace image" : "Upload image"}
                <input
                  id="banner-image"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(event) => void pickImage(event.target.files?.[0])}
                />
              </label>
              {draft.imageUrl ? (
                <span className="size-16 overflow-hidden rounded-lg border border-line bg-ivory">
                  <img src={draft.imageUrl} alt="" className="size-full object-cover" />
                </span>
              ) : (
                <span className="text-[12px] text-muted">No image selected yet.</span>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-line bg-ivory/50 p-3">
            <Switch
              checked={draft.active}
              onChange={(value) => setDraft({ ...draft, active: value })}
              label="Active"
              description="Inactive banners are kept in the database but never rendered."
            />
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setOpen(false);
                setEditing(null);
              }}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={() => void save()} loading={saving} disabled={uploading}>
              {editing ? "Save changes" : "Create banner"}
            </Button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={() => void confirmRemove()}
        tone="danger"
        title={removing ? `Delete “${removing.title}”?` : "Delete banner"}
        description="The banner is removed from the site immediately. The uploaded file stays in Cloud Storage."
        confirmLabel="Delete banner"
      />
    </>
  );
}
