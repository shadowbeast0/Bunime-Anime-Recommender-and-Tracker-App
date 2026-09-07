"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Bell, User } from "lucide-react";
import { motion } from "framer-motion";
import { api } from "@/lib/api";

export default function Navbar() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    void api.get("/users/me").then(setProfile).catch(() => setProfile(null));
  }, []);

  const avatarUrl = profile?.profile?.github_url ? (() => {
    try {
      const parsed = new URL(profile.profile.github_url.includes("://") ? profile.profile.github_url : `https://${profile.profile.github_url}`);
      const handle = parsed.hostname.replace("www.", "") === "github.com" ? parsed.pathname.split("/").filter(Boolean)[0] : "";
      return handle ? `https://github.com/${encodeURIComponent(handle)}.png?size=96` : "";
    } catch { return ""; }
  })() : "";

  const searchAnime = async (value: string) => {
    setQuery(value);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    setIsSearching(true);
    try {
      setResults(await api.get(`/anime/?q=${encodeURIComponent(value.trim())}&limit=6`));
    } catch {
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="topbar-actions">
          <Link href="/dashboard" className="topbar-brand">
            B<span>UNIME</span>
          </Link>
          <nav className="topbar-nav">
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/dashboard?view=list">My List</Link>
            <Link href="/dashboard?view=recommendations">Recommendations</Link>
          </nav>
        </div>

        <div className="topbar-actions">
          <div className="search-wrap">
          <div className="search-box">
            <Search size={16} />
            <input 
              type="text" 
              placeholder="Search anime..." 
              value={query}
              onChange={(event) => void searchAnime(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && results[0]) router.push(`/anime/${results[0].anime_id}`);
              }}
            />
          </div>
          {(results.length > 0 || isSearching) && (
            <div className="search-results">
              {isSearching && <div className="search-result-muted">Searching...</div>}
              {results.map((anime) => (
                <Link key={anime.anime_id} className="search-result" href={`/anime/${anime.anime_id}`} onClick={() => setResults([])}>
                  <img src={anime.image_url} alt="" />
                  <span><strong>{anime.english_title || anime.title}</strong>{anime.english_title && anime.english_title !== anime.title && <small>{anime.title}</small>}<small>{anime.status}</small></span>
                </Link>
              ))}
            </div>
          )}
          </div>
          
          <motion.button aria-label="Notifications" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="icon-button">
            <Bell size={17} />
          </motion.button>
          
          <Link href="/profile" aria-label="Open profile">
            <motion.span whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="icon-button profile-nav-avatar">
              {avatarUrl ? <img src={avatarUrl} alt="Your profile" /> : profile?.username ? <span>{profile.username.slice(0, 2).toUpperCase()}</span> : <User size={17} />}
            </motion.span>
          </Link>
        </div>
      </div>
    </header>
  );
}
