import "server-only";
import { Innertube } from "youtubei.js";
import type { Video } from "./types";

let client: Promise<Innertube> | null = null;

async function youtube() {
  if (!client) client = Innertube.create({ lang: "en", location: "US", retrieve_player: false });
  return client;
}

function text(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  const v = value as { text?: string; toString?: () => string };
  if (typeof v.text === "string") return v.text;
  const out = v.toString?.();
  return out && out !== "[object Object]" ? out : "";
}

function thumb(value: unknown, id: string): string {
  const v = value as { contents?: { url?: string; width?: number }[] } | { url?: string; width?: number }[] | undefined;
  const list = Array.isArray(v) ? v : v?.contents;
  const best = list?.filter((item) => item?.url).sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url;
  return best ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

function videoFrom(node: Record<string, unknown>): Video | null {
  const id = String(node.video_id ?? (node.endpoint as { payload?: { videoId?: string } } | undefined)?.payload?.videoId ?? "");
  if (!/^[\w-]{11}$/.test(id)) return null;
  const author = node.author as { name?: string; id?: string } | string | undefined;
  const authors = node.authors as { name?: string; channel_id?: string }[] | undefined;
  const channel = typeof author === "string" ? author : author?.name ?? authors?.map((a) => a.name).filter(Boolean).join(", ") ?? "YouTube";
  return {
    id,
    title: text(node.title) || text(node.name) || "Untitled video",
    channel,
    channelId: typeof author === "object" ? author?.id : authors?.[0]?.channel_id,
    thumb: thumb(node.thumbnails ?? node.thumbnail, id),
    views: text(node.short_view_count) || text(node.view_count) || text(node.view_count_text),
    published: text(node.published) || text(node.published_time) || text(node.published_time_text),
    duration: text(node.duration) || text(node.length_text),
    description: text(node.description_snippet) || text(node.description)
  };
}

function collect(input: unknown, limit = 60): Video[] {
  const found: Video[] = [];
  const ids = new Set<string>();
  const seen = new WeakSet<object>();
  const visit = (value: unknown, depth: number) => {
    if (!value || found.length >= limit || depth > 10) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    if (typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    const record = value as Record<string, unknown>;
    const video = videoFrom(record);
    if (video && !ids.has(video.id)) {
      ids.add(video.id);
      found.push(video);
    }
    for (const child of Object.values(record)) visit(child, depth + 1);
  };
  visit(input, 0);
  return found;
}

export async function trending(): Promise<Video[]> {
  const yt = await youtube();
  const home = collect(await yt.getHomeFeed(), 48);
  if (home.length) return home;
  const results = await Promise.all([
    yt.search("trending today", { type: "video" }),
    yt.search("documentary", { type: "video" }),
    yt.search("technology", { type: "video" }),
    yt.search("live music performance", { type: "video" })
  ]);
  const groups = results.map((result) => collect(result, 16));
  const videos: Video[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < 16; index++) {
    for (const group of groups) {
      const video = group[index];
      if (video && !seen.has(video.id)) {
        seen.add(video.id);
        videos.push(video);
      }
    }
  }
  return videos.slice(0, 48);
}

export async function searchVideos(query: string): Promise<Video[]> {
  const yt = await youtube();
  const result = await yt.search(query, { type: "video" });
  return collect(result, 48);
}

export async function relatedVideos(id: string): Promise<Video[]> {
  const yt = await youtube();
  const result = await yt.getInfo(id);
  return collect(result, 30).filter((video) => video.id !== id);
}
