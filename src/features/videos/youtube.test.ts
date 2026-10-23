import { describe, expect, it } from "vitest";
import type { SiteVideo } from "@/types";
import { parseYouTubeUrl, videoPageForPath, videosFor, youtubeEmbedSrc } from "./youtube";

const ID = "dQw4w9WgXcQ";
const CHANNEL = "UC_x5XG1OV2P6uZZ5FSM9Ttw";

describe("parseYouTubeUrl", () => {
  it("reads every common video link format", () => {
    for (const link of [
      `https://www.youtube.com/watch?v=${ID}&t=30s`,
      `https://youtu.be/${ID}?si=abc`,
      `youtube.com/shorts/${ID}`,
      `https://m.youtube.com/watch?v=${ID}`,
      `https://www.youtube.com/embed/${ID}`,
    ]) {
      expect(parseYouTubeUrl(link)).toMatchObject({ ok: true, kind: "video", id: ID });
    }
  });

  it("marks /live/ links and channel links as live streams", () => {
    expect(parseYouTubeUrl(`https://www.youtube.com/live/${ID}?feature=share`)).toEqual({
      ok: true,
      kind: "video",
      id: ID,
      liveHint: true,
    });
    expect(parseYouTubeUrl(`https://www.youtube.com/channel/${CHANNEL}/live`)).toMatchObject({
      ok: true,
      kind: "channel",
      channelId: CHANNEL,
    });
  });

  it("refuses non-YouTube links, handles and broken ids", () => {
    expect(parseYouTubeUrl("https://vimeo.com/123").ok).toBe(false);
    expect(parseYouTubeUrl("https://www.youtube.com/@nellore/live").ok).toBe(false);
    expect(parseYouTubeUrl("https://www.youtube.com/watch?v=short").ok).toBe(false);
    expect(parseYouTubeUrl("").ok).toBe(false);
  });
});

describe("youtubeEmbedSrc", () => {
  it("mutes autoplay and uses the privacy-enhanced host for videos", () => {
    const parsed = parseYouTubeUrl(`https://youtu.be/${ID}`);
    if (!parsed.ok) throw new Error("parse failed");
    const src = youtubeEmbedSrc(parsed, true);
    expect(src.startsWith(`https://www.youtube-nocookie.com/embed/${ID}?`)).toBe(true);
    expect(src).toContain("autoplay=1");
    expect(src).toContain("mute=1");
  });

  it("embeds a channel's current live stream", () => {
    const parsed = parseYouTubeUrl(`https://www.youtube.com/channel/${CHANNEL}/live`);
    if (!parsed.ok) throw new Error("parse failed");
    expect(youtubeEmbedSrc(parsed, false)).toContain(`live_stream?`);
    expect(youtubeEmbedSrc(parsed, false)).toContain(`channel=${CHANNEL}`);
  });
});

describe("page matching", () => {
  it("maps public paths to selectable pages", () => {
    expect(videoPageForPath("/")).toBe("home");
    expect(videoPageForPath("/draws")).toBe("draws");
    expect(videoPageForPath("/draws/mega-draw")).toBe("draw-detail");
    expect(videoPageForPath("/legal/terms")).toBe("legal");
    expect(videoPageForPath("/winners/")).toBe("winners");
    expect(videoPageForPath("/dashboard")).toBeNull();
  });

  it("returns enabled videos for the page and slot in order", () => {
    const base = { url: "", live: false, autoplay: false, title: "" };
    const videos: SiteVideo[] = [
      { ...base, id: "a", pages: ["home"], position: "top", enabled: true, sortOrder: 2 },
      { ...base, id: "b", pages: ["all"], position: "top", enabled: true, sortOrder: 1 },
      { ...base, id: "c", pages: ["home"], position: "bottom", enabled: true, sortOrder: 0 },
      { ...base, id: "d", pages: ["home"], position: "top", enabled: false, sortOrder: 0 },
      { ...base, id: "e", pages: ["winners"], position: "top", enabled: true, sortOrder: 0 },
    ];
    expect(videosFor(videos, "home", "top").map((v) => v.id)).toEqual(["b", "a"]);
    expect(videosFor(videos, "home", "bottom").map((v) => v.id)).toEqual(["c"]);
    expect(videosFor(videos, null, "top")).toEqual([]);
  });
});
