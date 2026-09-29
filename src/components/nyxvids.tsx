"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Clock3,
  Compass,
  Heart,
  Home,
  Library,
  ListVideo,
  Menu,
  Play,
  Search,
  Sparkles,
  RadioTower,
  X
} from "lucide-react";
import type { GoogleUser, Video } from "@/lib/types";

type Tab = "home" | "explore" | "subscriptions" | "library";
type Channel = { id: string; title: string; thumb: string };
type Playlist = { id: string; title: string; thumb: string; count: number };

const TOPICS = ["All", "Music", "Gaming", "Live", "Technology", "Documentaries", "Sports", "Design"];

function compact(value?: string) {
  if (!value) return "";
  const number = Number(value.replace(/[^0-9]/g, ""));
  if (!Number.isFinite(number) || number < 1000) return value;
  return `${Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(number)} views`;
}

function relative(value?: string) {
  if (!value) return "";
  if (!value.includes("T")) return value;
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);
  if (days < 1) return "Today";
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  if (days < 31) return `${Math.floor(days / 7)} week${days < 14 ? "" : "s"} ago`;
  if (days < 365) return `${Math.floor(days / 30)} month${days < 60 ? "" : "s"} ago`;
  return `${Math.floor(days / 365)} year${days < 730 ? "" : "s"} ago`;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Something went wrong");
  return data;
}

function Logo() {
  return (
    <div className="brand" aria-label="Nyxvids">
      <span className="brand-mark"><Play fill="currentColor" /></span>
      <span>nyx<span>vids</span></span>
    </div>
  );
}

function VideoCard({ video, onPlay }: { video: Video; onPlay: (video: Video) => void }) {
  return (
    <article className="video-card">
      <button className="thumbnail" onClick={() => onPlay(video)} aria-label={`Play ${video.title}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={video.thumb} alt="" loading="lazy" />
        <span className="play-badge"><Play fill="currentColor" /></span>
        {video.duration && <span className="duration">{video.duration}</span>}
      </button>
      <div className="video-copy">
        <h3><button onClick={() => onPlay(video)}>{video.title}</button></h3>
        <p>{video.channel}</p>
        <p className="meta">{[compact(video.views), relative(video.published)].filter(Boolean).join(" · ")}</p>
      </div>
    </article>
  );
}

function VideoGrid({ videos, onPlay }: { videos: Video[]; onPlay: (video: Video) => void }) {
  return <div className="video-grid">{videos.map((video) => <VideoCard key={video.id} video={video} onPlay={onPlay} />)}</div>;
}

function Skeletons() {
  return <div className="video-grid">{Array.from({ length: 8 }, (_, i) => <div className="skeleton" key={i}><i /><b /><span /></div>)}</div>;
}

export function Nyxvids() {
  const [tab, setTab] = useState<Tab>("home");
  const [menu, setMenu] = useState(false);
  const [videos, setVideos] = useState<Video[]>([]);
  const [history, setHistory] = useState<Video[]>([]);
  const [liked, setLiked] = useState<Video[]>([]);
  const [playing, setPlaying] = useState<Video | null>(null);
  const [related, setRelated] = useState<Video[]>([]);
  const [query, setQuery] = useState("");
  const [headline, setHeadline] = useState("Worth watching");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [configured, setConfigured] = useState(false);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);

  useEffect(() => {
    try {
      setHistory(JSON.parse(localStorage.getItem("nyxvids:history") ?? "[]"));
      setLiked(JSON.parse(localStorage.getItem("nyxvids:liked") ?? "[]"));
    } catch { /* ignore corrupt local state */ }
    getJson<{ user: GoogleUser | null; configured: boolean }>("/api/auth/me")
      .then((data) => { setUser(data.user); setConfigured(data.configured); })
      .catch(() => undefined);
  }, []);

  const load = useCallback(async (url: string, title: string) => {
    setLoading(true);
    setError("");
    setHeadline(title);
    try {
      const data = await getJson<{ videos: Video[] }>(url);
      setVideos(data.videos);
      if (!data.videos.length) setError("Nothing showed up here yet.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "YouTube did not respond.");
      setVideos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load("/api/youtube/feed", "Worth watching"); }, [load]);

  const openVideo = useCallback((video: Video) => {
    setPlaying(video);
    const next = [video, ...history.filter((item) => item.id !== video.id)].slice(0, 60);
    setHistory(next);
    localStorage.setItem("nyxvids:history", JSON.stringify(next));
    getJson<{ videos: Video[] }>(`/api/youtube/related?id=${video.id}`).then((data) => setRelated(data.videos)).catch(() => setRelated([]));
  }, [history]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const clean = query.trim();
    if (!clean) return;
    setTab("explore");
    void load(`/api/youtube/search?q=${encodeURIComponent(clean)}`, `Results for “${clean}”`);
  }

  function chooseTopic(topic: string) {
    if (topic === "All") void load("/api/youtube/feed", "Trending now");
    else void load(`/api/youtube/search?q=${encodeURIComponent(topic)}`, topic);
  }

  async function selectTab(next: Tab) {
    setTab(next);
    setMenu(false);
    if (next === "home") {
      if (user) void load("/api/youtube/personal", "From your subscriptions");
      else void load("/api/youtube/feed", "Worth watching");
    }
    if (next === "explore") void load("/api/youtube/feed", "Trending now");
    if (next === "subscriptions" && user) {
      setLoading(true);
      setError("");
      try {
        const [channelData, feedData] = await Promise.all([
          getJson<{ channels: Channel[] }>("/api/youtube/subscriptions"),
          getJson<{ videos: Video[] }>("/api/youtube/personal")
        ]);
        setChannels(channelData.channels);
        setVideos(feedData.videos);
        setHeadline("Latest from your channels");
      } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load subscriptions"); }
      finally { setLoading(false); }
    }
    if (next === "library" && user) {
      getJson<{ playlists: Playlist[] }>("/api/youtube/playlists").then((data) => setPlaylists(data.playlists)).catch(() => setPlaylists([]));
      getJson<{ videos: Video[] }>("/api/youtube/liked").then((data) => setLiked(data.videos)).catch(() => undefined);
      setHeadline("Your library");
    }
  }

  const likedNow = useMemo(() => playing ? liked.some((item) => item.id === playing.id) : false, [liked, playing]);

  function toggleLike() {
    if (!playing) return;
    const next = likedNow ? liked.filter((item) => item.id !== playing.id) : [playing, ...liked];
    setLiked(next);
    localStorage.setItem("nyxvids:liked", JSON.stringify(next));
  }

  const needsSignIn = (tab === "subscriptions" || tab === "library") && !user;

  return (
    <div className="app-shell">
      <aside className={menu ? "sidebar open" : "sidebar"}>
        <div className="side-top"><Logo /><button className="icon-button side-close" onClick={() => setMenu(false)}><X /></button></div>
        <nav>
          <button className={tab === "home" ? "active" : ""} onClick={() => selectTab("home")}><Home />Home</button>
          <button className={tab === "explore" ? "active" : ""} onClick={() => selectTab("explore")}><Compass />Explore</button>
          <button className={tab === "subscriptions" ? "active" : ""} onClick={() => selectTab("subscriptions")}><RadioTower />Subscriptions</button>
          <button className={tab === "library" ? "active" : ""} onClick={() => selectTab("library")}><Library />Library</button>
        </nav>
        <div className="side-section">
          <p>You</p>
          <button onClick={() => { setTab("library"); setHeadline("Watch history"); setVideos(history); }}><Clock3 />History</button>
          <button onClick={() => { setTab("library"); setHeadline("Liked videos"); setVideos(liked); }}><Heart />Liked videos</button>
        </div>
        <div className="account-card">
          {user ? <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {user.picture ? <img src={user.picture} alt="" /> : <span>{user.name[0]}</span>}
            <div><strong>{user.name}</strong><small>{user.email}</small></div>
            <a href="/api/auth/logout">Sign out</a>
          </> : <>
            <Sparkles />
            <strong>Your YouTube, your way</strong>
            <small>Connect Google for subscriptions, playlists and liked videos.</small>
            <a className={configured ? "sign-in" : "sign-in disabled"} href={configured ? "/api/auth/login" : "#setup"}>Continue with Google</a>
          </>}
        </div>
      </aside>

      <main>
        <header>
          <button className="icon-button menu-button" onClick={() => setMenu(true)} aria-label="Open navigation"><Menu /></button>
          <div className="mobile-logo"><Logo /></div>
          <form className="search" onSubmit={submit}>
            <Search />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search videos, channels, and topics" aria-label="Search YouTube" />
            {query && <button type="button" onClick={() => setQuery("")}><X /></button>}
          </form>
          {!user && <a className="header-sign-in" href={configured ? "/api/auth/login" : "#setup"}>Sign in</a>}
          {user?.picture && <img className="avatar" src={user.picture} alt={user.name} />}
        </header>

        <div className="content">
          {tab === "explore" && <div className="topics">{TOPICS.map((topic) => <button key={topic} onClick={() => chooseTopic(topic)}>{topic}</button>)}</div>}

          {needsSignIn ? <section className="signin-stage">
            <span><RadioTower /></span>
            <h1>Bring your YouTube with you</h1>
            <p>Sign in to see your subscriptions, liked videos, and playlists inside Nyxvids.</p>
            {configured ? <a href="/api/auth/login">Continue with Google</a> : <div id="setup" className="setup-note">Google sign-in is ready in the app and needs its Vercel credentials to be switched on.</div>}
          </section> : <>
            {tab === "subscriptions" && channels.length > 0 && <section className="channel-strip">
              {channels.map((channel) => <button key={channel.id} onClick={() => { setQuery(channel.title); void load(`/api/youtube/search?q=${encodeURIComponent(channel.title)}`, channel.title); }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={channel.thumb} alt="" /><span>{channel.title}</span>
              </button>)}
            </section>}

            {tab === "library" && playlists.length > 0 && <section className="playlists">
              <div className="section-heading"><div><span>PLAYLISTS</span><h2>Saved for later</h2></div></div>
              <div className="playlist-row">{playlists.map((playlist) => <div className="playlist-card" key={playlist.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={playlist.thumb} alt="" /><strong>{playlist.title}</strong><small>{playlist.count} videos</small>
              </div>)}</div>
            </section>}

            <section className="feed">
              <div className="section-heading"><div><span>{tab === "home" ? "FOR YOU" : tab.toUpperCase()}</span><h1>{headline}</h1></div><small>{videos.length ? `${videos.length} videos` : ""}</small></div>
              {loading ? <Skeletons /> : error ? <div className="empty"><ListVideo /><h2>{error}</h2><p>Try another search or come back in a moment.</p></div> : <VideoGrid videos={videos} onPlay={openVideo} />}
            </section>
          </>}
        </div>
      </main>

      {playing && <div className="player-overlay" role="dialog" aria-modal="true" aria-label={playing.title}>
        <div className="player-panel">
          <button className="player-close" onClick={() => setPlaying(null)} aria-label="Close video"><X /></button>
          <div className="player-frame"><iframe src={`https://www.youtube-nocookie.com/embed/${playing.id}?autoplay=1&rel=0`} title={playing.title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen /></div>
          <div className="player-info">
            <div><h2>{playing.title}</h2><p>{playing.channel}</p></div>
            <button className={likedNow ? "liked" : ""} onClick={toggleLike}><Heart fill={likedNow ? "currentColor" : "none"} />{likedNow ? "Liked" : "Like"}</button>
          </div>
          {related.length > 0 && <div className="up-next"><h3>Up next</h3><VideoGrid videos={related.slice(0, 8)} onPlay={openVideo} /></div>}
        </div>
      </div>}
      {menu && <button className="scrim" aria-label="Close navigation" onClick={() => setMenu(false)} />}
    </div>
  );
}
