import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import type { GoogleUser, Video } from "./types";

export const SESSION_COOKIE = "nyxvids_session";

type Session = GoogleUser & {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
};

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is not configured");
  return new TextEncoder().encode(value);
}

export function googleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.AUTH_SECRET);
}

export async function encodeSession(session: Session) {
  return new SignJWT(session as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
}

export async function readSession(): Promise<Session | null> {
  if (!googleConfigured()) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return payload as unknown as Session;
  } catch {
    return null;
  }
}

export async function accessToken() {
  const session = await readSession();
  if (!session) return null;
  if (session.expiresAt > Date.now() + 60_000) return session.accessToken;
  if (!session.refreshToken) return null;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: session.refreshToken,
      grant_type: "refresh_token"
    })
  });
  if (!response.ok) return null;
  const tokens = (await response.json()) as { access_token: string; expires_in: number };
  return tokens.access_token;
}

export async function googleGet<T>(path: string, params: Record<string, string>) {
  const token = await accessToken();
  if (!token) throw new Error("Sign in with Google first");
  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`YouTube returned ${response.status}: ${detail.slice(0, 180)}`);
  }
  return response.json() as Promise<T>;
}

export function googleVideo(item: {
  id?: string;
  snippet?: { title?: string; channelTitle?: string; channelId?: string; publishedAt?: string; description?: string; thumbnails?: Record<string, { url?: string }> };
  contentDetails?: { videoId?: string };
  statistics?: { viewCount?: string };
}): Video | null {
  const id = item.contentDetails?.videoId ?? item.id ?? "";
  if (!/^[\w-]{11}$/.test(id)) return null;
  const images = item.snippet?.thumbnails ?? {};
  const thumb = images.maxres?.url ?? images.standard?.url ?? images.high?.url ?? images.medium?.url ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  return {
    id,
    title: item.snippet?.title ?? "Untitled video",
    channel: item.snippet?.channelTitle ?? "YouTube",
    channelId: item.snippet?.channelId,
    thumb,
    published: item.snippet?.publishedAt,
    views: item.statistics?.viewCount,
    description: item.snippet?.description
  };
}
