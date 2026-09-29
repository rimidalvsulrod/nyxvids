import type { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { encodeSession, googleConfigured, readSession, SESSION_COOKIE } from "@/lib/google";

function home(req: NextRequest, query = "") {
  return new URL(`/${query}`, req.url);
}

export async function GET(req: NextRequest, ctx: RouteContext<"/api/auth/[action]">) {
  const { action } = await ctx.params;

  if (action === "me") {
    const session = await readSession();
    return Response.json({
      configured: googleConfigured(),
      user: session ? { name: session.name, email: session.email, picture: session.picture } : null
    });
  }

  if (action === "logout") {
    const response = Response.redirect(home(req));
    response.headers.append("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
    return response;
  }

  if (!googleConfigured()) return Response.redirect(home(req, "?auth=setup"));

  if (action === "login") {
    const state = randomBytes(24).toString("hex");
    const callback = new URL("/api/auth/callback", req.url).toString();
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: callback,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      scope: "openid email profile https://www.googleapis.com/auth/youtube.readonly",
      state
    }).toString();
    const response = Response.redirect(url);
    response.headers.append("Set-Cookie", `nyxvids_oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
    return response;
  }

  if (action === "callback") {
    const code = req.nextUrl.searchParams.get("code");
    const state = req.nextUrl.searchParams.get("state");
    const savedState = req.cookies.get("nyxvids_oauth_state")?.value;
    if (!code || !state || state !== savedState) return Response.redirect(home(req, "?auth=failed"));
    const callback = new URL("/api/auth/callback", req.url).toString();
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: callback,
        grant_type: "authorization_code"
      })
    });
    if (!tokenResponse.ok) return Response.redirect(home(req, "?auth=failed"));
    const tokens = (await tokenResponse.json()) as { access_token: string; refresh_token?: string; expires_in: number };
    const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    const profile = (await profileResponse.json()) as { name: string; email: string; picture?: string };
    const session = await encodeSession({
      ...profile,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000
    });
    const response = Response.redirect(home(req));
    response.headers.append("Set-Cookie", `${SESSION_COOKIE}=${session}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`);
    response.headers.append("Set-Cookie", "nyxvids_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
    return response;
  }

  return Response.json({ error: "Not found" }, { status: 404 });
}
