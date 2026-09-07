"use client";

import { useEffect, useState } from "react";
import { Download, LogOut, Save, Search, UserRound, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import AnimeSearchCard from "@/components/ui/AnimeSearchCard";

const genreOptions = ["Action", "Adventure", "Comedy", "Drama", "Fantasy", "Romance", "Sci-Fi", "Slice of Life", "Thriller"];

function githubAvatarUrl(githubUrl: string) {
  try {
    const parsed = new URL(githubUrl.includes("://") ? githubUrl : `https://${githubUrl}`);
    if (parsed.hostname.replace("www.", "") !== "github.com") return "";
    const handle = parsed.pathname.split("/").filter(Boolean)[0];
    return handle ? `https://github.com/${encodeURIComponent(handle)}.png?size=256` : "";
  } catch { return ""; }
}

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [githubUrl, setGithubUrl] = useState("");
  const [genres, setGenres] = useState<string[]>([]);
  const [favoriteAnimes, setFavoriteAnimes] = useState<any[]>([]);
  const [favoriteQuery, setFavoriteQuery] = useState("");
  const [favoriteResults, setFavoriteResults] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    api.get("/users/me").then(async (user) => {
      setProfile(user);
      setGithubUrl(user.profile?.github_url || "");
      setGenres(user.profile?.preferred_genres || []);
      const favorites = await Promise.all((user.profile?.favorite_anime_ids || []).map((id: number) => api.get(`/anime/${id}`).catch(() => null)));
      setFavoriteAnimes(favorites.filter(Boolean));
    }).catch((error) => setMessage(error.message));
  }, []);

  const saveProfile = async () => {
    setIsSaving(true);
    setMessage("");
    try {
      const updated = await api.put("/users/me/profile", { github_url: githubUrl || null, preferred_genres: genres, favorite_anime_ids: favoriteAnimes.map((anime) => anime.anime_id) });
      setProfile(updated);
      setMessage("Profile saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save your profile.");
    } finally { setIsSaving(false); }
  };

  const persistFavoriteIds = async (nextFavorites: any[]) => {
    try {
      const updated = await api.put("/users/me/profile", {
        github_url: githubUrl || null,
        preferred_genres: genres,
        favorite_anime_ids: nextFavorites.map((anime) => anime.anime_id),
      });
      setProfile(updated);
      setMessage("Favourite saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save this favourite.");
    }
  };

  const addFavorite = (anime: any) => {
    if (favoriteAnimes.some((item) => item.anime_id === anime.anime_id)) return;
    const nextFavorites = [...favoriteAnimes, anime];
    setFavoriteAnimes(nextFavorites);
    void persistFavoriteIds(nextFavorites);
  };

  const removeFavorite = (animeId: number) => {
    const nextFavorites = favoriteAnimes.filter((anime) => anime.anime_id !== animeId);
    setFavoriteAnimes(nextFavorites);
    void persistFavoriteIds(nextFavorites);
  };

  const searchFavorites = async (query: string) => {
    setFavoriteQuery(query);
    if (query.trim().length < 2) return setFavoriteResults([]);
    try { setFavoriteResults(await api.get(`/anime/?q=${encodeURIComponent(query.trim())}&limit=6`)); } catch { setFavoriteResults([]); }
  };

  const exportWatchlist = async () => {
    setIsExporting(true);
    setMessage("");
    try {
      const { blob, filename } = await api.download("/users/me/export");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not export your anime data.");
    } finally { setIsExporting(false); }
  };

  const signOut = () => {
    localStorage.removeItem("token");
    router.replace("/login");
  };

  if (!profile) return <div className="detail-state">Loading profile...</div>;
  const initials = profile.username.slice(0, 2).toUpperCase();
  const avatarUrl = githubAvatarUrl(githubUrl);

  return <section className="profile-page">
    <div className="section-heading"><div><p className="hero-kicker">Account</p><h1>Profile settings</h1><span>Personalise recommendations and manage your session.</span></div><button className="quiet-button" onClick={signOut}><LogOut size={15} /> Sign out</button></div>
    <div className="profile-grid">
      <aside className="profile-card"><div className="profile-avatar">{avatarUrl ? <img src={avatarUrl} alt="Your GitHub profile" /> : <span>{initials}</span>}</div><h2>{profile.username}</h2><p>{profile.email}</p><div className="profile-avatar-url"><UserRound size={15} /><input value={githubUrl} placeholder="https://github.com/your-username" onChange={(event) => setGithubUrl(event.target.value)} /></div><p className="github-avatar-help">Add your GitHub profile URL to use its avatar.</p></aside>
      <div className="profile-card profile-preferences"><div><h2>Taste profile</h2><p>Choose genres you enjoy to improve new-user recommendations.</p></div><div className="genre-picker">{genreOptions.map((genre) => <button key={genre} className={genres.includes(genre) ? "active" : ""} onClick={() => setGenres((current) => current.includes(genre) ? current.filter((item) => item !== genre) : [...current, genre])}>{genre}</button>)}</div><div className="favorite-section"><div><h2>All-time favourites</h2><p>These titles carry extra weight in recommendations.</p></div><div className="seed-search"><div className="seed-search-box"><Search size={15} /><input value={favoriteQuery} placeholder="Search anime to add..." onChange={(event) => void searchFavorites(event.target.value)} /></div>{favoriteResults.length > 0 && <div className="search-card-results">{favoriteResults.map((anime) => <AnimeSearchCard key={anime.anime_id} anime={anime} onSelect={() => { addFavorite(anime); setFavoriteQuery(""); setFavoriteResults([]); }} />)}</div>}</div><div className="favorite-list">{favoriteAnimes.length ? favoriteAnimes.map((anime) => <AnimeSearchCard key={anime.anime_id} anime={anime} actionLabel="Remove" onSelect={() => removeFavorite(anime.anime_id)} />) : <p className="favorite-empty">No favourites added yet.</p>}</div></div>{message && <p className="profile-message">{message}</p>}<div className="profile-actions"><button className="solid-button" disabled={isSaving} onClick={() => void saveProfile()}><Save size={15} /> {isSaving ? "Saving..." : "Save preferences"}</button><button className="quiet-button" disabled={isExporting} onClick={() => void exportWatchlist()}><Download size={15} /> {isExporting ? "Preparing..." : "Download anime JSON"}</button></div></div>
    </div>
  </section>;
}
