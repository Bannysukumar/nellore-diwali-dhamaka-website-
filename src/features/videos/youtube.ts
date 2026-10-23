import type { SiteVideo, VideoPageKey } from "@/types";

export type ParsedYouTube =
  | { ok: true; kind: "video"; id: string; liveHint: boolean }
  | { ok: true; kind: "channel"; channelId: string; liveHint: true }
  | { ok: false; reason: string };

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
const YOUTUBE_HOSTS = new Set(["youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com", "youtu.be"]);

/** Reads any common YouTube video, live-stream or channel-live link. */
export function parseYouTubeUrl(input: string): ParsedYouTube {
  const value = input.trim();
  if (!value) return { ok: false, reason: "Paste a YouTube link." };

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return { ok: false, reason: "That is not a valid link." };
  }
  const host = url.hostname.replace(/^www\./, "");
  if (!YOUTUBE_HOSTS.has(host)) return { ok: false, reason: "Only YouTube links are supported." };

  const parts = url.pathname.split("/").filter(Boolean);
  const video = (id: string | null | undefined, liveHint = false): ParsedYouTube =>
    id && VIDEO_ID.test(id)
      ? { ok: true, kind: "video", id, liveHint }
      : { ok: false, reason: "The video id in that link is not valid." };

  if (host === "youtu.be") return video(parts[0]);
  if (parts[0] === "watch") return video(url.searchParams.get("v"));
  if (parts[0] === "live") return video(parts[1], true);
  if (parts[0] === "embed" && parts[1] === "live_stream") {
    const channelId = url.searchParams.get("channel") ?? "";
    return CHANNEL_ID.test(channelId)
      ? { ok: true, kind: "channel", channelId, liveHint: true }
      : { ok: false, reason: "The channel id in that link is not valid." };
  }
  if (parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "v") return video(parts[1]);
  if (parts[0] === "channel" && CHANNEL_ID.test(parts[1] ?? "")) {
    return { ok: true, kind: "channel", channelId: parts[1], liveHint: true };
  }
  if (parts[0]?.startsWith("@") || parts[0] === "c" || parts[0] === "user") {
    return {
      ok: false,
      reason:
        "Channel name links cannot be embedded. Open the live stream on YouTube, tap Share and paste that link, or use youtube.com/channel/UC…/live.",
    };
  }
  return { ok: false, reason: "Paste a YouTube video, live stream or Shorts link." };
}

/**
 * Privacy-enhanced embed address. Autoplay is muted unless the visitor already
 * asked for sound; `controlOrigin` enables the postMessage player API.
 */
export function youtubeEmbedSrc(
  parsed: Extract<ParsedYouTube, { ok: true }>,
  autoplay: boolean,
  options: { muted?: boolean; controlOrigin?: string } = {},
): string {
  const params = new URLSearchParams({ rel: "0", playsinline: "1", modestbranding: "1" });
  if (autoplay) {
    params.set("autoplay", "1");
    params.set("mute", options.muted === false ? "0" : "1");
  }
  if (options.controlOrigin) {
    params.set("enablejsapi", "1");
    params.set("origin", options.controlOrigin);
  }
  if (parsed.kind === "channel") {
    params.set("channel", parsed.channelId);
    return `https://www.youtube.com/embed/live_stream?${params.toString()}`;
  }
  return `https://www.youtube-nocookie.com/embed/${parsed.id}?${params.toString()}`;
}

export function youtubeThumbnail(parsed: ParsedYouTube): string | null {
  return parsed.ok && parsed.kind === "video" ? `https://i.ytimg.com/vi/${parsed.id}/hqdefault.jpg` : null;
}

export const VIDEO_PAGES: Array<{ key: Exclude<VideoPageKey, "all">; label: string }> = [
  { key: "home", label: "Home" },
  { key: "draws", label: "Draws list" },
  { key: "draw-detail", label: "Draw details" },
  { key: "book", label: "Book tickets" },
  { key: "winners", label: "Winners" },
  { key: "leaderboard", label: "Leaderboard" },
  { key: "products", label: "Products" },
  { key: "about", label: "About" },
  { key: "contact", label: "Contact" },
  { key: "faqs", label: "FAQs" },
  { key: "legal", label: "Legal pages" },
  { key: "login", label: "Sign in" },
  { key: "register", label: "Register" },
];

/** Which selectable public page a path belongs to, or null for pages that never show videos. */
export function videoPageForPath(pathname: string): Exclude<VideoPageKey, "all"> | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return "home";
  if (path === "/draws") return "draws";
  if (path.startsWith("/draws/")) return "draw-detail";
  if (path.startsWith("/legal/")) return "legal";
  const key = path.slice(1);
  return VIDEO_PAGES.some((page) => page.key === key) ? (key as Exclude<VideoPageKey, "all">) : null;
}

/** Enabled videos for one page and slot, in display order. */
export function videosFor(
  videos: SiteVideo[],
  page: Exclude<VideoPageKey, "all"> | null,
  position: SiteVideo["position"],
): SiteVideo[] {
  if (!page) return [];
  return videos
    .filter((v) => v.enabled && v.position === position && (v.pages.includes("all") || v.pages.includes(page)))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}
