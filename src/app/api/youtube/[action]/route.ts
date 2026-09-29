import type { NextRequest } from "next/server";
import { googleGet, googleVideo, readSession } from "@/lib/google";
import { relatedVideos, searchVideos, trending } from "@/lib/youtube";
import type { Video } from "@/lib/types";

export const maxDuration = 30;

type List<T> = { items?: T[]; nextPageToken?: string };
type Subscription = { snippet?: { title?: string; resourceId?: { channelId?: string }; thumbnails?: Record<string, { url?: string }> } };
type Playlist = { id?: string; snippet?: { title?: string; thumbnails?: Record<string, { url?: string }> }; contentDetails?: { itemCount?: number } };
type Channel = { id?: string; contentDetails?: { relatedPlaylists?: { uploads?: string } } };

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "YouTube did not respond";
  return Response.json({ error: message }, { status: message.includes("Sign in") ? 401 : 502 });
}

export async function GET(req: NextRequest, ctx: RouteContext<"/api/youtube/[action]">) {
  const { action } = await ctx.params;
  const q = req.nextUrl.searchParams.get("q")?.trim().slice(0, 120) ?? "";
  const id = req.nextUrl.searchParams.get("id") ?? "";
  try {
    if (action === "feed") return Response.json({ videos: await trending() });
    if (action === "search") return Response.json({ videos: q ? await searchVideos(q) : [] });
    if (action === "related") return Response.json({ videos: /^[\w-]{11}$/.test(id) ? await relatedVideos(id) : [] });

    const session = await readSession();
    if (!session) return Response.json({ error: "Sign in with Google first" }, { status: 401 });

    if (action === "subscriptions") {
      const data = await googleGet<List<Subscription>>("subscriptions", { part: "snippet", mine: "true", maxResults: "50", order: "alphabetical" });
      const channels = (data.items ?? []).map((item) => ({
        id: item.snippet?.resourceId?.channelId ?? "",
        title: item.snippet?.title ?? "Channel",
        thumb: item.snippet?.thumbnails?.high?.url ?? item.snippet?.thumbnails?.default?.url ?? ""
      })).filter((item) => item.id);
      return Response.json({ channels });
    }

    if (action === "playlists") {
      const data = await googleGet<List<Playlist>>("playlists", { part: "snippet,contentDetails", mine: "true", maxResults: "50" });
      return Response.json({ playlists: (data.items ?? []).map((item) => ({
        id: item.id,
        title: item.snippet?.title ?? "Untitled playlist",
        thumb: item.snippet?.thumbnails?.high?.url ?? item.snippet?.thumbnails?.medium?.url ?? "",
        count: item.contentDetails?.itemCount ?? 0
      })) });
    }

    if (action === "liked") {
      const data = await googleGet<List<Record<string, unknown>>>("videos", { part: "snippet,contentDetails,statistics", myRating: "like", maxResults: "50" });
      return Response.json({ videos: (data.items ?? []).map((item) => googleVideo(item)).filter(Boolean) });
    }

    if (action === "personal") {
      const subs = await googleGet<List<Subscription>>("subscriptions", { part: "snippet", mine: "true", maxResults: "12", order: "relevance" });
      const channelIds = (subs.items ?? []).map((item) => item.snippet?.resourceId?.channelId).filter((value): value is string => Boolean(value));
      if (!channelIds.length) return Response.json({ videos: [] });
      const channels = await googleGet<List<Channel>>("channels", { part: "contentDetails", id: channelIds.join(","), maxResults: "50" });
      const uploads = (channels.items ?? []).map((item) => item.contentDetails?.relatedPlaylists?.uploads).filter((value): value is string => Boolean(value)).slice(0, 10);
      const lists = await Promise.all(uploads.map((playlistId) => googleGet<List<Record<string, unknown>>>("playlistItems", {
        part: "snippet,contentDetails", playlistId, maxResults: "4"
      }).catch(() => ({ items: [] }))));
      const videos = lists.flatMap((list) => (list.items ?? []).map((item) => googleVideo(item)).filter((video): video is Video => Boolean(video)));
      videos.sort((a, b) => String(b.published).localeCompare(String(a.published)));
      return Response.json({ videos });
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    return safeError(error);
  }
}
