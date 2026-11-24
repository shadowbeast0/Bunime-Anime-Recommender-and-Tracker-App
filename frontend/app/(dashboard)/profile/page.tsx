"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, HardDrive, LogOut, Save, Search, Upload, UserRound } from "lucide-react";
import { api, isLocalMode } from "@/lib/api";
import { storageInfo } from "@/lib/store";
import AnimeSearchCard from "@/components/ui/AnimeSearchCard";
import { CloudSyncPanel } from "@/components/features/CloudSync";
import { githubAvatar } from "@/components/ui/Navbar";
import type { Anime, User } from "@/lib/types";

const GENRES = ["Action", "Adventure", "Comedy", "Drama", "Fantasy", "Romance", "Sci-Fi", "Slice of Life", "Mystery", "Thriller", "Sports", "Supernatural", "Horror"];

export default function ProfilePage() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<User | null>(null);
  const [githubUrl, setGithubUrl] = useState("");
  const [genres, setGenres] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<Anime[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Anime[]>([]);
  const [storage, setStorage] = useState<{ isPersistent: boolean; usage: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    api.get("/users/me").then(async (user: User) => {
      setProfile(user);
      setGithubUrl(user.profile.github_url || "");
      setGenres(user.profile.preferred_genres || []);
      const loaded = await Promise.all((user.profile.favorite_anime_ids || []).map((id) => api.get(`/anime/${id}`).catch(() => null)));
      setFavorites(loaded.filter(Boolean));
    }).catch((error) => setMessage({ text: error.message, ok: false }));
    if (isLocalMode) void storageInfo().then(setStorage);
  }, []);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) { setResults([]); return; }
    const timer = setTimeout(() => { api.get(`/anime/?q=${encodeURIComponent(term)}&limit=6`).then(setResults).catch(() => setResults([])); }, 220);
    return () => clearTimeout(timer);
  }, [query]);

  const persist = async (nextFavorites = favorites, note = "Profile saved.") => {
    setBusy(true);
    try {
      setProfile(await api.put("/users/me/profile", { github_url: githubUrl.trim() || null, preferred_genres: genres, favorite_anime_ids: nextFavorites.map((anime) => anime.anime_id) }));
      setMessage({ text: note, ok: true });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Could not save your profile.", ok: false });
    } finally { setBusy(false); }
  };

  const exportData = async () => {
    const { blob, filename } = await api.download("/users/me/export");
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const importData = async (file?: File) => {
    if (!file) return;
    try {
      const count = await api.importBackup(file);
      setMessage({ text: `Imported ${count} titles from your backup.`, ok: true });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "That backup file could not be read.", ok: false });
    } finally { if (fileInput.current) fileInput.current.value = ""; }
  };

  const signOut = async () => { await api.logout(); router.replace("/login/"); };

  if (!profile) return <div className="center-state">{message?.text || "Loading profile…"}</div>;
  const avatar = githubAvatar(githubUrl, 256);

  return (
    <section>
      <div className="section-head">
        <div><h2>Profile</h2><p>Tune your recommendations and back up your list.</p></div>
        <button type="button" className="btn btn-ghost" onClick={() => void signOut()}><LogOut size={16} /> Sign out</button>
      </div>
      {message && <p className={`notice ${message.ok ? "ok" : ""}`} role="status" style={{ marginBottom: "1rem" }}>{message.text}</p>}
      <div className="profile-grid">
        <div className="profile-card">
          <div className="panel profile-card">
            <div className="profile-id">
              <div className="big-avatar">{avatar ? <img src={avatar} alt="" /> : profile.username.slice(0, 2).toUpperCase()}</div>
              <div><h2>{profile.username}</h2><p>{profile.email || "Guest profile"}</p></div>
            </div>
            <div className="input-wrap"><UserRound size={16} /><input value={githubUrl} placeholder="https://github.com/your-username" aria-label="GitHub profile URL" onChange={(event) => setGithubUrl(event.target.value)} /></div>
            <p className="help">Add your GitHub profile URL to use its avatar.</p>
          </div>
          {isLocalMode && <CloudSyncPanel />}
          {isLocalMode && <div className="panel profile-card">
            <div><h3><HardDrive size={16} style={{ verticalAlign: "-3px" }} /> Your data</h3><p className="help">Your list is saved in this browser’s database (IndexedDB, with a localStorage backup). Download a backup to move it to another device or browser.</p></div>
            {storage && <div className="storage-meter"><span className={`dot ${storage.isPersistent ? "ok" : ""}`} />{storage.isPersistent ? "Persistent storage granted — the browser won’t clear it automatically." : "Saved locally. Your browser hasn’t granted persistent storage yet, so keep a backup."}</div>}
            <div className="toolbar">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void exportData()}><Download size={15} /> Download backup</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileInput.current?.click()}><Upload size={15} /> Restore backup</button>
              <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(event) => void importData(event.target.files?.[0])} />
            </div>
          </div>}
        </div>
        <div className="panel profile-card">
          <div><h3>Favourite genres</h3><p className="help">Boosts matching titles in your recommendations.</p></div>
          <div className="chip-row" style={{ flexWrap: "wrap" }}>{GENRES.map((genre) => <button key={genre} type="button" className={`chip ${genres.includes(genre) ? "active" : ""}`} aria-pressed={genres.includes(genre)} onClick={() => setGenres((current) => current.includes(genre) ? current.filter((item) => item !== genre) : [...current, genre])}>{genre}</button>)}</div>
          <div><h3>All-time favourites</h3><p className="help">These carry the most weight in your recommendations.</p></div>
          <div className="search-drop">
            <div className="input-wrap"><Search size={16} /><input type="search" value={query} placeholder="Search anime to add…" onChange={(event) => setQuery(event.target.value)} /></div>
            {results.length > 0 && <div className="mini-list">{results.map((anime) => <AnimeSearchCard key={anime.anime_id} anime={anime} onSelect={() => {
              setQuery("");
              if (favorites.some((item) => item.anime_id === anime.anime_id)) return;
              const next = [...favorites, anime];
              setFavorites(next);
              void persist(next, "Favourite added.");
            }} />)}</div>}
          </div>
          <div className="mini-list">
            {favorites.length ? favorites.map((anime) => <AnimeSearchCard key={anime.anime_id} anime={anime} actionLabel="Remove" onSelect={() => { const next = favorites.filter((item) => item.anime_id !== anime.anime_id); setFavorites(next); void persist(next, "Favourite removed."); }} />) : <p className="help">No favourites yet.</p>}
          </div>
          <div className="toolbar"><button type="button" className="btn btn-hot" disabled={busy} onClick={() => void persist()}><Save size={16} /> {busy ? "Saving…" : "Save preferences"}</button></div>
        </div>
      </div>
    </section>
  );
}
