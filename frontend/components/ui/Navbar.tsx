"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Compass, Dices, Home, Library, Loader2, Search, Sparkles, User, X } from "lucide-react";
import { api } from "@/lib/api";
import { coverFallback, DEFAULT_COVER } from "@/lib/basePath";
import { displayTitle, type Anime, type User as UserType } from "@/lib/types";

export function githubAvatar(url?: string | null, size = 96) {
  if (!url) return "";
  try {
    const parsed = new URL(url.includes("://") ? url : `https://${url}`);
    if (parsed.hostname.replace(/^www\./, "") !== "github.com") return "";
    const handle = parsed.pathname.split("/").filter(Boolean)[0];
    return handle ? `https://github.com/${encodeURIComponent(handle)}.png?size=${size}` : "";
  } catch {
    return "";
  }
}

function useAnimeSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Anime[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) { setResults([]); setIsSearching(false); return; }
    const id = ++requestId.current;
    setIsSearching(true);
    setResults([]);
    const timer = setTimeout(() => {
      const base = `/anime/?q=${encodeURIComponent(term)}&limit=8&group=1`;
      api.get(`${base}&live=0`).then((data) => { if (id === requestId.current) setResults(data); }).catch(() => undefined);
      api.get(`${base}&live=1`)
        .then((data) => { if (id === requestId.current && data.length) setResults(data); })
        .catch(() => undefined)
        .finally(() => { if (id === requestId.current) setIsSearching(false); });
    }, 220);
    return () => clearTimeout(timer);
  }, [query]);

  return { query, setQuery, results, isSearching, reset: () => { setQuery(""); setResults([]); } };
}

function SearchResults({ results, isSearching, query, focused, onPick }: { results: Anime[]; isSearching: boolean; query: string; focused: number; onPick: () => void }) {
  if (query.trim().length < 2) return null;
  return (
    <div className="search-pop" role="listbox">
      {isSearching && <div className="search-note"><Loader2 size={14} className="spin" /> {results.length ? "Checking MyAnimeList and AniList for more" : "Searching"}</div>}
      {!isSearching && !results.length && <div className="search-note">No anime found for “{query}”.</div>}
      {results.map((anime, index) => (
        <Link key={anime.anime_id} href={`/anime/?id=${anime.anime_id}`} className={`search-hit ${index === focused ? "focused" : ""}`} onClick={onPick} role="option" aria-selected={index === focused}>
          <img src={anime.image_url || DEFAULT_COVER} alt="" onError={coverFallback} />
          <span>
            <strong>{displayTitle(anime)}</strong>
            {(anime.franchise_count ?? 0) > 1 && <small className="search-franchise">Part of {anime.group_title}, {anime.franchise_count} entries</small>}
            <small>{anime.media_type === "TV" ? "Series" : anime.media_type}{anime.year ? `, ${anime.year}` : ""}{anime.score ? `  ★ ${anime.score.toFixed(1)}` : ""}</small>
          </span>
        </Link>
      ))}
    </div>
  );
}

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = pathname.startsWith("/dashboard") ? searchParams.get("view") || "home" : "";
  const [profile, setProfile] = useState<UserType | null>(null);
  const [mobileSearch, setMobileSearch] = useState(false);
  const [focused, setFocused] = useState(-1);
  const [surprising, setSurprising] = useState(false);
  const desktop = useAnimeSearch();
  const mobile = useAnimeSearch();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => { api.get("/users/me").then(setProfile).catch(() => setProfile(null)); }, [pathname]);
  useEffect(() => { setFocused(-1); }, [desktop.results]);
  useEffect(() => {
    const close = (event: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) desktop.reset(); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { document.body.style.overflow = mobileSearch ? "hidden" : ""; }, [mobileSearch]);

  const surprise = async () => {
    setSurprising(true);
    try {
      const picks: Anime[] = await api.get("/anime/?limit=400&sort=popular");
      const pick = picks[Math.floor(Math.random() * picks.length)];
      if (pick) router.push(`/anime/?id=${pick.anime_id}`);
    } finally { setSurprising(false); }
  };

  const avatar = githubAvatar(profile?.profile?.github_url);
  const links = [
    { key: "home", href: "/dashboard/", label: "Home" },
    { key: "browse", href: "/dashboard/?view=browse", label: "Browse" },
    { key: "list", href: "/dashboard/?view=list", label: "My List" },
    { key: "recommendations", href: "/dashboard/?view=recommendations", label: "For You" },
  ];

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/dashboard/" className="brand" aria-label="Bunime home"><span className="brand-badge">B</span><span className="brand-word">BUN<span>IME</span></span><span className="brand-kana" aria-hidden="true">ブニメ</span></Link>
          <nav className="nav-links" aria-label="Main">
            {links.map((link) => <Link key={link.key} href={link.href} className={view === link.key ? "active" : ""}>{link.label}</Link>)}
          </nav>
          <div className="nav-spacer" />
          <div className="nav-search" ref={wrapRef}>
            <div className="input-wrap">
              <Search size={17} />
              <input
                type="search"
                placeholder="Search anime"
                aria-label="Search anime"
                value={desktop.query}
                onChange={(event) => desktop.setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") { event.preventDefault(); setFocused((index) => Math.min(index + 1, desktop.results.length - 1)); }
                  if (event.key === "ArrowUp") { event.preventDefault(); setFocused((index) => Math.max(index - 1, 0)); }
                  if (event.key === "Escape") desktop.reset();
                  if (event.key === "Enter") {
                    const pick = desktop.results[focused >= 0 ? focused : 0];
                    if (pick) { router.push(`/anime/?id=${pick.anime_id}`); desktop.reset(); }
                  }
                }}
              />
            </div>
            <SearchResults {...desktop} focused={focused} onPick={desktop.reset} />
          </div>
          <button type="button" className="icon-btn" onClick={() => void surprise()} aria-label="Surprise me with a random anime" title="Surprise me">
            {surprising ? <Loader2 size={18} className="spin" /> : <Dices size={18} />}
          </button>
          <Link href="/profile/" className="icon-btn avatar" aria-label="Your profile">
            {avatar ? <img src={avatar} alt="" /> : profile?.username ? <b>{profile.username.slice(0, 2).toUpperCase()}</b> : <User size={18} />}
          </Link>
        </div>
      </header>

      <nav className="tabbar" aria-label="Main mobile">
        <Link href="/dashboard/" className={view === "home" ? "active" : ""}><Home size={20} />Home</Link>
        <Link href="/dashboard/?view=browse" className={view === "browse" ? "active" : ""}><Compass size={20} />Browse</Link>
        <button type="button" onClick={() => setMobileSearch(true)}><Search size={20} />Search</button>
        <Link href="/dashboard/?view=list" className={view === "list" ? "active" : ""}><Library size={20} />My List</Link>
        <Link href="/dashboard/?view=recommendations" className={view === "recommendations" ? "active" : ""}><Sparkles size={20} />For You</Link>
      </nav>

      {mobileSearch && (
        <div className="mobile-search" role="dialog" aria-modal="true" aria-label="Search anime">
          <div className="mobile-search-head">
            <div className="input-wrap">
              <Search size={18} />
              <input autoFocus type="search" placeholder="Search anime…" value={mobile.query} onChange={(event) => mobile.setQuery(event.target.value)} />
            </div>
            <button type="button" className="icon-btn" aria-label="Close search" onClick={() => { setMobileSearch(false); mobile.reset(); }}><X size={18} /></button>
          </div>
          <SearchResults {...mobile} focused={-1} onPick={() => { setMobileSearch(false); mobile.reset(); }} />
        </div>
      )}
    </>
  );
}
