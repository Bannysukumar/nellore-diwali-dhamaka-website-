import { useState } from "react";
import { Eye, MonitorPlay, Save, Smartphone, Upload, UserX } from "lucide-react";
import { useAsync } from "@/hooks/useAsync";
import { useToast } from "@/app/ToastProvider";
import { useAuth } from "@/app/AuthProvider";
import { describeStoreError, store } from "@/lib/backend";
import { contentService } from "@/services/contentService";
import { uploadImage, validateImage } from "@/services/storageService";
import { adminService } from "@/services/adminService";
import type { SplashConfig } from "@/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  ErrorState,
  FieldError,
  FormRow,
  Input,
  Label,
  Skeleton,
  Switch,
  Textarea,
} from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatDateTime } from "@/utils/format";

interface SplashDraft {
  enabled: boolean;
  greeting: string;
  heading: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
  backgroundColor: string;
  announcement: string;
  allowSkip: boolean;
  dismissDays: string;
  startAt: string;
  endAt: string;
  desktopBannerUrl: string;
  desktopBannerPath: string;
  mobileBannerUrl: string;
  mobileBannerPath: string;
  logoUrl: string;
}

const DEFAULTS: SplashDraft = {
  enabled: false,
  greeting: "🪔 Happy Diwali",
  heading: "Nellore Diwali Dhamaka",
  description: "Festival ticket booking, rewards and lucky draws.",
  ctaLabel: "Explore draws",
  ctaHref: "/draws",
  backgroundColor: "#651B24",
  announcement: "",
  allowSkip: true,
  dismissDays: "1",
  startAt: "",
  endAt: "",
  desktopBannerUrl: "",
  desktopBannerPath: "",
  mobileBannerUrl: "",
  mobileBannerPath: "",
  logoUrl: "",
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

function fromLocal(value: string): string | undefined {
  return value ? new Date(value).toISOString() : undefined;
}

function toDraft(config: SplashConfig | null): SplashDraft {
  if (!config) return DEFAULTS;
  return {
    enabled: config.enabled,
    greeting: config.greeting,
    heading: config.heading,
    description: config.description,
    ctaLabel: config.ctaLabel,
    ctaHref: config.ctaHref,
    backgroundColor: config.backgroundColor,
    announcement: config.announcement ?? "",
    allowSkip: config.allowSkip,
    dismissDays: String(config.dismissDays),
    startAt: toLocal(config.startAt),
    endAt: toLocal(config.endAt),
    desktopBannerUrl: config.desktopBannerUrl ?? "",
    desktopBannerPath: config.desktopBannerPath ?? "",
    mobileBannerUrl: config.mobileBannerUrl ?? "",
    mobileBannerPath: config.mobileBannerPath ?? "",
    logoUrl: config.logoUrl ?? "",
  };
}

export function AdminSplashPage() {
  const toast = useToast();
  const { profile } = useAuth();
  const config = useAsync(() => contentService.splash(), []);

  const [draft, setDraft] = useState<SplashDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"desktop" | "mobile" | "logo" | null>(null);

  const current = draft ?? toDraft(config.data);

  const update = (patch: Partial<SplashDraft>) => {
    setDraft({ ...current, ...patch });
  };

  const pickImage = async (kind: "desktop" | "mobile" | "logo", file: File | undefined) => {
    if (!file) return;
    const problem = validateImage(file);
    if (problem) {
      setError(problem);
      return;
    }
    setUploading(kind);
    setError(null);
    try {
      const result = await uploadImage("splash", file, profile?.uid ?? "admin");
      if (kind === "desktop") {
        update({ desktopBannerUrl: result.url, desktopBannerPath: result.path });
      } else if (kind === "mobile") {
        update({ mobileBannerUrl: result.url, mobileBannerPath: result.path });
      } else {
        update({ logoUrl: result.url });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "The image could not be uploaded.");
    } finally {
      setUploading(null);
    }
  };

  const save = async () => {
    setError(null);
    if (current.heading.trim().length < 3) return setError("Enter the splash heading.");
    if (current.startAt && current.endAt && new Date(current.startAt) > new Date(current.endAt)) {
      return setError("The start time must be before the end time.");
    }

    setSaving(true);
    try {
      const payload: SplashConfig = {
        enabled: current.enabled,
        desktopBannerUrl: current.desktopBannerUrl || undefined,
        desktopBannerPath: current.desktopBannerPath || undefined,
        mobileBannerUrl: current.mobileBannerUrl || undefined,
        mobileBannerPath: current.mobileBannerPath || undefined,
        logoUrl: current.logoUrl || undefined,
        greeting: current.greeting.trim(),
        heading: current.heading.trim(),
        description: current.description.trim(),
        ctaLabel: current.ctaLabel.trim(),
        ctaHref: current.ctaHref.trim() || "/",
        backgroundColor: current.backgroundColor,
        announcement: current.announcement.trim() || undefined,
        startAt: fromLocal(current.startAt),
        endAt: fromLocal(current.endAt),
        allowSkip: current.allowSkip,
        dismissDays: Math.max(0, Number(current.dismissDays) || 0),
        updatedAt: new Date().toISOString(),
      };

      await store.set("siteSettings", "splash", payload as never);
      await adminService.log({
        actorUid: profile?.uid ?? "",
        actorName: profile?.fullName ?? "Administrator",
        action: "splash.update",
        entity: "siteSettings",
        entityId: "splash",
        note: payload.enabled ? "Splash enabled" : "Splash disabled",
      });
      toast.success("Splash saved", payload.enabled ? "Visitors will see it on their next visit." : "Splash is off.");
      config.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The splash configuration could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  if (config.loading || config.error) {
    return (
      <>
        <PageHeader eyebrow="Content" icon={MonitorPlay} title="Splash screen" />
        {config.error ? (
          <ErrorState
            className="mt-5"
            title="The splash configuration could not be loaded"
            description={describeStoreError(config.error)}
            onRetry={config.reload}
          />
        ) : (
          <Skeleton className="mt-5 h-96" rounded="lg" />
        )}
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Content"
        icon={MonitorPlay}
        title="Splash screen"
        description="The full-screen festival greeting shown before the site loads. It is streamed live, so changes reach every open session without a deploy."
      />

      <Alert tone="info" className="mt-4" title="The splash never locks visitors out">
        The splash never blocks access to the site. Visitors can dismiss it, and dismissals are suppressed for
        the number of days you configure.
      </Alert>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader icon={MonitorPlay} title="Configuration" description="Saved to the `siteSettings/splash` document." />
          <CardBody className="space-y-4">
            {error ? <FieldError>{error}</FieldError> : null}

            <div className="rounded-xl border border-line bg-ivory/50 p-3">
              <Switch
                checked={current.enabled}
                onChange={(value) => update({ enabled: value })}
                label="Show the splash"
                description="Disabled splashes are stored but never rendered."
              />
            </div>

            <FormRow columns={2}>
              <div>
                <Label htmlFor="splash-greeting">Greeting</Label>
                <Input
                  id="splash-greeting"
                  value={current.greeting}
                  onChange={(event) => update({ greeting: event.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="splash-heading" required>
                  Heading
                </Label>
                <Input
                  id="splash-heading"
                  value={current.heading}
                  onChange={(event) => update({ heading: event.target.value })}
                />
              </div>
            </FormRow>

            <div>
              <Label htmlFor="splash-description">Description</Label>
              <Textarea
                id="splash-description"
                value={current.description}
                onChange={(event) => update({ description: event.target.value })}
                className="min-h-20"
              />
            </div>

            <div>
              <Label htmlFor="splash-announcement" hint="Optional notice bar">
                Announcement
              </Label>
              <Input
                id="splash-announcement"
                value={current.announcement}
                onChange={(event) => update({ announcement: event.target.value })}
                placeholder="e.g. Draw scheduled for 20 October, 8 PM"
              />
            </div>

            <FormRow columns={2}>
              <div>
                <Label htmlFor="splash-cta-label">Button label</Label>
                <Input
                  id="splash-cta-label"
                  value={current.ctaLabel}
                  onChange={(event) => update({ ctaLabel: event.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="splash-cta-href">Button link</Label>
                <Input
                  id="splash-cta-href"
                  value={current.ctaHref}
                  onChange={(event) => update({ ctaHref: event.target.value })}
                />
              </div>
            </FormRow>

            <FormRow columns={3}>
              <div>
                <Label htmlFor="splash-bg">Background</Label>
                <Input
                  id="splash-bg"
                  type="color"
                  value={current.backgroundColor}
                  onChange={(event) => update({ backgroundColor: event.target.value })}
                  className="h-11 p-1"
                />
              </div>
              <div>
                <Label htmlFor="splash-start">Show from</Label>
                <Input
                  id="splash-start"
                  type="datetime-local"
                  value={current.startAt}
                  onChange={(event) => update({ startAt: event.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="splash-end">Hide after</Label>
                <Input
                  id="splash-end"
                  type="datetime-local"
                  value={current.endAt}
                  onChange={(event) => update({ endAt: event.target.value })}
                />
              </div>
            </FormRow>

            <FormRow columns={2}>
              <div>
                <Label htmlFor="splash-dismiss" hint="0 = show every visit">
                  Suppress after dismiss (days)
                </Label>
                <Input
                  id="splash-dismiss"
                  inputMode="numeric"
                  value={current.dismissDays}
                  onChange={(event) => update({ dismissDays: event.target.value.replace(/\D/g, "") })}
                />
              </div>
              <div className="flex items-end">
                <Checkbox
                  checked={current.allowSkip}
                  onChange={(event) => update({ allowSkip: event.target.checked })}
                  label="Allow visitors to skip"
                  description="Keep this on so the splash never traps a visitor."
                />
              </div>
            </FormRow>

            <div className="flex justify-end">
              <Button
                onClick={() => void save()}
                loading={saving}
                disabled={Boolean(uploading)}
                iconLeft={<Save className="size-4" aria-hidden />}
              >
                Save splash
              </Button>
            </div>
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader icon={Upload} title="Artwork" description="Optional images layered over the background colour." />
            <CardBody className="space-y-4">
              <ImagePicker
                kind="desktop"
                label="Desktop banner"
                preview={current.desktopBannerUrl}
                uploading={uploading === "desktop"}
                onPick={(file) => void pickImage("desktop", file)}
                onClear={() => update({ desktopBannerUrl: "", desktopBannerPath: "" })}
              />
              <ImagePicker
                kind="mobile"
                label="Mobile banner"
                preview={current.mobileBannerUrl}
                uploading={uploading === "mobile"}
                onPick={(file) => void pickImage("mobile", file)}
                onClear={() => update({ mobileBannerUrl: "", mobileBannerPath: "" })}
              />
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-paper px-3.5 py-2 text-[13px] font-semibold text-ink transition hover:border-gold">
                  <Upload className="size-4" aria-hidden />
                  {uploading === "logo" ? "Uploading…" : "Upload logo"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    onChange={(event) => void pickImage("logo", event.target.files?.[0])}
                  />
                </label>
                {current.logoUrl ? (
                  <>
                    <span className="size-12 overflow-hidden rounded-lg border border-line bg-ivory">
                      <img src={current.logoUrl} alt="" className="size-full object-contain" />
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => update({ logoUrl: "" })}>
                      Remove
                    </Button>
                  </>
                ) : (
                  <span className="text-[12px] text-muted">No logo selected.</span>
                )}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader icon={Eye} title="Live preview" description="How the splash reads on a phone." />
            <CardBody>
              <div
                className="relative mx-auto w-[220px] overflow-hidden rounded-[26px] border-[6px] border-ink/80 shadow-[var(--shadow-raised)]"
                style={{ backgroundColor: current.backgroundColor }}
              >
                <div className="aspect-[9/19.5] p-4 text-ivory">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold-soft">
                    {current.greeting}
                  </p>
                  {current.logoUrl ? (
                    <img src={current.logoUrl} alt="" className="mx-auto mt-4 h-12 object-contain" />
                  ) : null}
                  <h3 className="mt-4 font-display text-[20px] leading-tight">{current.heading}</h3>
                  <p className="mt-2 text-[12px] leading-relaxed text-ivory/80">{current.description}</p>
                  {current.announcement ? (
                    <p className="mt-3 rounded-lg border border-gold/40 bg-gold-soft/15 px-2.5 py-1.5 text-[11px] text-gold-soft">
                      {current.announcement}
                    </p>
                  ) : null}
                  <span className="mt-4 inline-block rounded-full bg-gold px-3 py-1.5 text-[11px] font-bold text-maroon-deep">
                    {current.ctaLabel || "Explore draws"}
                  </span>
                  {current.allowSkip ? (
                    <p className="mt-4 flex items-center gap-1 text-[10.5px] text-ivory/60">
                      <UserX className="size-3" aria-hidden />
                      Skip
                    </p>
                  ) : null}
                </div>
              </div>
              <p className="mt-3 flex items-center justify-center gap-1.5 text-[11.5px] text-muted">
                <Smartphone className="size-3.5" aria-hidden />
                Preview only — the real splash renders from saved settings.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="space-y-2 text-[12px] text-muted">
              <div className="flex items-center justify-between gap-3">
                <span>Status</span>
                <Badge tone={current.enabled ? "emerald" : "muted"}>
                  {current.enabled ? "Enabled" : "Disabled"}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Last saved</span>
                <span className="text-ink">
                  {config.data?.updatedAt ? formatDateTime(config.data.updatedAt) : "Never"}
                </span>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

function ImagePicker({
  kind,
  label,
  preview,
  uploading,
  onPick,
  onClear,
}: {
  kind: string;
  label: string;
  preview: string;
  uploading: boolean;
  onPick: (file: File | undefined) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-paper px-3.5 py-2 text-[13px] font-semibold text-ink transition hover:border-gold">
        <Upload className="size-4" aria-hidden />
        {uploading ? "Uploading…" : preview ? `Replace ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          aria-label={label}
          data-kind={kind}
          onChange={(event) => onPick(event.target.files?.[0])}
        />
      </label>
      {preview ? (
        <>
          <span className="h-12 w-20 overflow-hidden rounded-lg border border-line bg-ivory">
            <img src={preview} alt="" className="size-full object-cover" />
          </span>
          <Button size="sm" variant="ghost" onClick={onClear}>
            Remove
          </Button>
        </>
      ) : (
        <span className="text-[12px] text-muted">Not set.</span>
      )}
    </div>
  );
}
