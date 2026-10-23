import { useLocation } from "react-router-dom";
import { useSettings } from "@/app/SettingsProvider";
import type { SiteVideo } from "@/types";
import { cn } from "@/utils/cn";
import { parseYouTubeUrl, videoPageForPath, videosFor, youtubeEmbedSrc } from "./youtube";

export function YouTubeEmbed({ video, className }: { video: Pick<SiteVideo, "url" | "title" | "autoplay">; className?: string }) {
  const parsed = parseYouTubeUrl(video.url);
  if (!parsed.ok) return null;
  return (
    <div className={cn("relative aspect-video overflow-hidden rounded-2xl border border-line bg-black shadow-[var(--shadow-card)]", className)}>
      <iframe
        src={youtubeEmbedSrc(parsed, video.autoplay)}
        title={video.title || "YouTube video"}
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
        className="absolute inset-0 size-full"
      />
    </div>
  );
}

function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-status-booked px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-white">
      <span className="relative flex size-1.5">
        <span className="absolute inset-0 animate-ping rounded-full bg-white/80" />
        <span className="relative size-1.5 rounded-full bg-white" />
      </span>
      Live
    </span>
  );
}

/** YouTube videos and live streams an administrator placed on the current public page. */
export function PageVideos({ position }: { position: SiteVideo["position"] }) {
  const { pathname } = useLocation();
  const { videos } = useSettings();
  const items = videosFor(videos, videoPageForPath(pathname), position).filter((v) => parseYouTubeUrl(v.url).ok);
  if (!items.length) return null;

  return (
    <section aria-label={items.some((v) => v.live) ? "Live stream" : "Videos"} className="page py-6">
      <div className={cn("grid gap-5", items.length > 1 ? "md:grid-cols-2" : "mx-auto max-w-4xl")}>
        {items.map((video) => (
          <figure key={video.id} className="min-w-0">
            <YouTubeEmbed video={video} />
            {video.title || video.live ? (
              <figcaption className="mt-2.5 flex items-center gap-2 px-1">
                {video.live ? <LiveBadge /> : null}
                {video.title ? <span className="truncate font-display text-[16px] text-ink">{video.title}</span> : null}
              </figcaption>
            ) : null}
          </figure>
        ))}
      </div>
    </section>
  );
}
