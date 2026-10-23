import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { SkipForward, Volume2, VolumeX } from "lucide-react";
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
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-status-booked px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-white">
      <span className="relative flex size-1.5">
        <span className="absolute inset-0 animate-ping rounded-full bg-white/80" />
        <span className="relative size-1.5 rounded-full bg-white" />
      </span>
      Live
    </span>
  );
}

const ENDED = 0;

/**
 * One video at a time with sound and next-video controls. The player is driven
 * through YouTube's postMessage API; when a video ends the next one starts, and
 * the list loops.
 */
function VideoPlayer({ items }: { items: SiteVideo[] }) {
  const [index, setIndex] = useState(0);
  /* Once the visitor presses Next (or a video ends) every following video starts on its own. */
  const [advanced, setAdvanced] = useState(false);
  const [muted, setMuted] = useState(true);
  const [wantsSound, setWantsSound] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);

  const current = items[index % items.length];
  const parsed = parseYouTubeUrl(current.url);
  const autoplay = current.autoplay || advanced;

  useEffect(() => {
    if (index >= items.length) setIndex(0);
  }, [index, items.length]);

  useEffect(() => {
    setMuted(autoplay ? !wantsSound : false);
    // Only a new video resets the assumed sound state; YouTube reports the real one once it is ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, current.id]);

  const send = useCallback((func: string, args: unknown[] = []) => {
    frameRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), "*");
  }, []);

  const next = useCallback(() => {
    if (items.length < 2) return;
    setAdvanced(true);
    setIndex((i) => (i + 1) % items.length);
  }, [items.length]);

  /* Handshake with the embedded player so it reports mute state and when the video ends. */
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    let heard = false;
    let attempts = 0;
    const listen = () => {
      frame.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: current.id, channel: "widget" }), "*");
      frame.contentWindow?.postMessage(
        JSON.stringify({ event: "command", func: "addEventListener", args: ["onStateChange"], id: current.id, channel: "widget" }),
        "*",
      );
    };
    const timer = window.setInterval(() => {
      attempts += 1;
      if (heard || attempts > 20) window.clearInterval(timer);
      else listen();
    }, 500);
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow || typeof event.data !== "string") return;
      let data: { event?: string; info?: unknown };
      try {
        data = JSON.parse(event.data) as typeof data;
      } catch {
        return;
      }
      heard = true;
      if (data.event === "onStateChange" && data.info === ENDED) next();
      if (data.event === "infoDelivery" && data.info && typeof data.info === "object") {
        const info = data.info as { muted?: unknown; playerState?: unknown };
        if (typeof info.muted === "boolean") setMuted(info.muted);
        if (info.playerState === ENDED) next();
      }
    };
    window.addEventListener("message", onMessage);
    frame.addEventListener("load", listen);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("message", onMessage);
      frame.removeEventListener("load", listen);
    };
  }, [current.id, index, next]);

  const toggleSound = () => {
    if (muted) {
      send("unMute");
      send("setVolume", [100]);
      send("playVideo");
      setWantsSound(true);
      setMuted(false);
    } else {
      send("mute");
      setWantsSound(false);
      setMuted(true);
    }
  };

  if (!parsed.ok) return null;

  return (
    <figure className="mx-auto min-w-0 max-w-4xl">
      <div className="relative aspect-video overflow-hidden rounded-2xl border border-line bg-black shadow-[var(--shadow-card)]">
        <iframe
          key={`${current.id}-${index}`}
          ref={frameRef}
          src={youtubeEmbedSrc(parsed, autoplay, { muted: !wantsSound, controlOrigin: window.location.origin })}
          title={current.title || "YouTube video"}
          loading={advanced ? "eager" : "lazy"}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
          className="absolute inset-0 size-full"
        />
      </div>
      <figcaption className="mt-2.5 flex items-center gap-2 px-1">
        {current.live ? <LiveBadge /> : null}
        <span className="min-w-0 flex-1 truncate font-display text-[15px] text-ink sm:text-[16px]">
          {current.title}
        </span>
        <button
          type="button"
          onClick={toggleSound}
          aria-pressed={!muted}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition active:scale-[0.97]",
            muted ? "border-brand bg-brand text-white hover:bg-brand/90" : "border-line bg-paper text-ink hover:border-gold",
          )}
        >
          {muted ? <VolumeX className="size-4" aria-hidden /> : <Volume2 className="size-4" aria-hidden />}
          {muted ? "Unmute" : "Mute"}
        </button>
        {items.length > 1 ? (
          <button
            type="button"
            onClick={next}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1.5 text-[12.5px] font-semibold text-ink transition hover:border-gold active:scale-[0.97]"
            aria-label={`Next video (${(index % items.length) + 1} of ${items.length})`}
          >
            Next
            <SkipForward className="size-4" aria-hidden />
            <span className="text-[11px] font-medium tabular-nums text-muted">
              {(index % items.length) + 1}/{items.length}
            </span>
          </button>
        ) : null}
      </figcaption>
    </figure>
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
      <VideoPlayer items={items} />
    </section>
  );
}
