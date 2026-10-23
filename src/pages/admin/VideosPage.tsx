import { useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, Save, Trash2, Youtube } from "lucide-react";
import { useAsync } from "@/hooks/useAsync";
import { useToast } from "@/app/ToastProvider";
import { useAuth } from "@/app/AuthProvider";
import { describeStoreError } from "@/lib/backend";
import { contentService } from "@/services/contentService";
import { adminService } from "@/services/adminService";
import { YouTubeEmbed } from "@/features/videos/PageVideos";
import { parseYouTubeUrl, VIDEO_PAGES, youtubeThumbnail } from "@/features/videos/youtube";
import type { SiteVideo, VideoPageKey } from "@/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  EmptyState,
  ErrorState,
  FieldError,
  FormRow,
  Input,
  Label,
  Select,
  Skeleton,
  Switch,
} from "@/components/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { newId } from "@/utils/id";

function newVideo(sortOrder: number): SiteVideo {
  return {
    id: newId("vid"),
    title: "",
    url: "",
    live: false,
    pages: ["home"],
    position: "top",
    autoplay: false,
    enabled: true,
    sortOrder,
  };
}

function problemWith(video: SiteVideo, index: number): string | null {
  const label = video.title.trim() || `Video ${index + 1}`;
  const parsed = parseYouTubeUrl(video.url);
  if (!parsed.ok) return `${label}: ${parsed.reason}`;
  if (!video.pages.length) return `${label}: choose at least one page.`;
  return null;
}

export function AdminVideosPage() {
  const toast = useToast();
  const { profile } = useAuth();
  const saved = useAsync(() => contentService.allVideos(), []);
  const [draft, setDraft] = useState<SiteVideo[] | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const items = draft ?? saved.data ?? [];
  const dirty = draft !== null;

  const setItems = (next: SiteVideo[]) => setDraft(next);
  const update = (id: string, patch: Partial<SiteVideo>) =>
    setItems(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  const move = (index: number, delta: number) => {
    const next = [...items];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    setItems(next);
  };

  const togglePage = (video: SiteVideo, key: VideoPageKey, on: boolean) => {
    if (key === "all") return update(video.id, { pages: on ? ["all"] : ["home"] });
    const pages = video.pages.filter((p) => p !== "all" && p !== key);
    update(video.id, { pages: on ? [...pages, key] : pages });
  };

  const save = async () => {
    setError(null);
    const cleaned = items.map((item) => ({ ...item, title: item.title.trim(), url: item.url.trim() }));
    const problem = cleaned.map(problemWith).find(Boolean);
    if (problem) return setError(problem);

    setSaving(true);
    try {
      await contentService.saveVideos(cleaned);
      await adminService.log({
        actorUid: profile?.uid ?? "",
        actorName: profile?.fullName ?? "Administrator",
        action: "videos.update",
        entity: "siteSettings",
        entityId: "videos",
        note: `${cleaned.filter((v) => v.enabled).length} of ${cleaned.length} videos shown`,
      });
      toast.success("Videos saved", "Open pages update straight away.");
      setDraft(null);
      saved.reload();
    } catch (err) {
      setError(describeStoreError(err));
    } finally {
      setSaving(false);
    }
  };

  const saveButton = (
    <Button onClick={() => void save()} loading={saving} disabled={!dirty} iconLeft={<Save className="size-4" aria-hidden />}>
      Save videos
    </Button>
  );

  if (saved.loading || saved.error) {
    return (
      <>
        <PageHeader eyebrow="Content" icon={Youtube} title="YouTube videos" />
        {saved.error ? (
          <ErrorState
            className="mt-5"
            title="The video settings could not be loaded"
            description={describeStoreError(saved.error)}
            onRetry={saved.reload}
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
        icon={Youtube}
        title="YouTube videos"
        description="Paste a YouTube video or live stream link and choose the public pages it appears on. Changes reach open pages without a redeploy."
        actions={
          <>
            <Button variant="outline" onClick={() => setItems([...items, newVideo(items.length)])} iconLeft={<Plus className="size-4" aria-hidden />}>
              Add video
            </Button>
            {saveButton}
          </>
        }
      />

      <Alert tone="info" className="mt-4" title="Which links work">
        Video links (youtube.com/watch?v=…, youtu.be/…), Shorts, and live stream links (youtube.com/live/…) all work.
        To always show whatever your channel is streaming now, use youtube.com/channel/UC…/live. The video must be
        Public or Unlisted with embedding allowed in YouTube Studio.
      </Alert>

      {error ? (
        <Alert tone="danger" className="mt-4" title="Not saved">
          {error}
        </Alert>
      ) : null}
      {dirty ? (
        <p className="mt-3 text-[12.5px] font-semibold text-status-pending">You have unsaved changes.</p>
      ) : null}

      <div className="mt-5 space-y-4">
        {items.length === 0 ? (
          <EmptyState
            icon={Youtube}
            title="No videos yet"
            description="Add a YouTube video or live stream to show it on your public pages."
            action={
              <Button onClick={() => setItems([newVideo(0)])} iconLeft={<Plus className="size-4" aria-hidden />}>
                Add video
              </Button>
            }
          />
        ) : null}

        {items.map((video, index) => {
          const parsed = parseYouTubeUrl(video.url);
          const thumbnail = youtubeThumbnail(parsed);
          const allPages = video.pages.includes("all");
          return (
            <Card key={video.id}>
              <CardHeader
                icon={Youtube}
                title={video.title.trim() || `Video ${index + 1}`}
                action={
                  <div className="flex items-center gap-1.5">
                    {video.live ? <Badge tone="danger">Live</Badge> : null}
                    <Badge tone={video.enabled ? "emerald" : "muted"}>{video.enabled ? "Shown" : "Hidden"}</Badge>
                    <Button size="sm" variant="ghost" disabled={index === 0} onClick={() => move(index, -1)} aria-label="Move up">
                      <ArrowUp className="size-4" aria-hidden />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={index === items.length - 1}
                      onClick={() => move(index, 1)}
                      aria-label="Move down"
                    >
                      <ArrowDown className="size-4" aria-hidden />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setItems(items.filter((item) => item.id !== video.id))}
                      aria-label="Delete video"
                    >
                      <Trash2 className="size-4 text-status-booked" aria-hidden />
                    </Button>
                  </div>
                }
              />
              <CardBody className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor={`${video.id}-url`} required>
                        YouTube link
                      </Label>
                      <Input
                        id={`${video.id}-url`}
                        value={video.url}
                        placeholder="https://www.youtube.com/live/…"
                        invalid={Boolean(video.url) && !parsed.ok}
                        onChange={(event) => {
                          const url = event.target.value;
                          const next = parseYouTubeUrl(url);
                          update(video.id, { url, ...(next.ok && next.liveHint ? { live: true } : {}) });
                        }}
                      />
                      {video.url && !parsed.ok ? <FieldError>{parsed.reason}</FieldError> : null}
                    </div>
                    <FormRow columns={2}>
                      <div>
                        <Label htmlFor={`${video.id}-title`} hint="Optional">
                          Title
                        </Label>
                        <Input
                          id={`${video.id}-title`}
                          maxLength={120}
                          value={video.title}
                          placeholder="e.g. Diwali Dhamaka draw — live"
                          onChange={(event) => update(video.id, { title: event.target.value })}
                        />
                      </div>
                      <div>
                        <Label htmlFor={`${video.id}-position`}>Where on the page</Label>
                        <Select
                          id={`${video.id}-position`}
                          value={video.position}
                          onChange={(event) => update(video.id, { position: event.target.value as SiteVideo["position"] })}
                        >
                          <option value="top">Top — above the page content</option>
                          <option value="bottom">Bottom — below the page content</option>
                        </Select>
                      </div>
                    </FormRow>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Switch
                        checked={video.enabled}
                        onChange={(value) => update(video.id, { enabled: value })}
                        label="Show on site"
                      />
                      <Checkbox
                        checked={video.live}
                        onChange={(event) => update(video.id, { live: event.target.checked })}
                        label="Live stream"
                        description="Shows a red LIVE badge."
                      />
                      <Checkbox
                        checked={video.autoplay}
                        onChange={(event) => update(video.id, { autoplay: event.target.checked })}
                        label="Autoplay (muted)"
                        description="Visitors tap to unmute."
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    {previewId === video.id && parsed.ok ? (
                      <YouTubeEmbed video={video} className="rounded-xl" />
                    ) : (
                      <div className="relative grid aspect-video place-items-center overflow-hidden rounded-xl border border-line bg-ivory">
                        <span className="px-4 text-center text-[12px] text-muted">
                          {parsed.ok ? "Tap Play preview to check the video" : "Paste a link to see a preview"}
                        </span>
                        {thumbnail ? (
                          <img
                            key={thumbnail}
                            src={thumbnail}
                            alt=""
                            className="absolute inset-0 size-full object-cover"
                            onError={(event) => {
                              event.currentTarget.hidden = true;
                            }}
                          />
                        ) : null}
                      </div>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      block
                      disabled={!parsed.ok}
                      onClick={() => setPreviewId(previewId === video.id ? null : video.id)}
                      iconLeft={
                        previewId === video.id ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />
                      }
                    >
                      {previewId === video.id ? "Close preview" : "Play preview"}
                    </Button>
                  </div>
                </div>

                <fieldset className="rounded-xl border border-line bg-ivory/50 p-3">
                  <legend className="px-1 text-[12.5px] font-semibold text-ink">Show on these public pages</legend>
                  <Checkbox
                    checked={allPages}
                    onChange={(event) => togglePage(video, "all", event.target.checked)}
                    label="All public pages"
                  />
                  <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
                    {VIDEO_PAGES.map((page) => (
                      <Checkbox
                        key={page.key}
                        checked={allPages || video.pages.includes(page.key)}
                        disabled={allPages}
                        onChange={(event) => togglePage(video, page.key, event.target.checked)}
                        label={page.label}
                      />
                    ))}
                  </div>
                </fieldset>
              </CardBody>
            </Card>
          );
        })}
      </div>

      {items.length ? <div className="mt-5 flex justify-end">{saveButton}</div> : null}
    </>
  );
}
