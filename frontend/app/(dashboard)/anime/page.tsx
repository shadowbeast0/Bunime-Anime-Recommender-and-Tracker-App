"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, Layers, Loader2, Play, Star } from "lucide-react";
import { api } from "@/lib/api";
import { fetchLiveDetail } from "@/lib/catalog";
import { coverFallback, DEFAULT_COVER } from "@/lib/basePath";
import InteractionControls from "@/components/features/InteractionControls";
import EpisodeTracker from "@/components/features/EpisodeTracker";
import AnimeCard from "@/components/ui/AnimeCard";
import { displayTitle, type Anime, type UserInteraction } from "@/lib/types";

export default function AnimeDetailPage() {
  return <Suspense fallback={<div className="center-state"><Loader2 size={30} className="spin" /></div>}><AnimeDetail /></Suspense>;
}

function AnimeDetail() {
  const router = useRouter();
  const id = Number(useSearchParams().get("id"));
  const [anime, setAnime] = useState<Anime | null>(null);
  const [interaction, setInteraction] = useState<UserInteraction | undefined>();
  const [similar, setSimilar] = useState<Anime[]>([]);
  const [interactions, setInteractions] = useState<Map<number, UserInteraction>>(new Map());
  const [franchiseSize, setFranchiseSize] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) { setError("No anime selected."); return; }
    setAnime(null);
    setError("");
    window.scrollTo({ top: 0 });
    Promise.all([api.get(`/anime/${id}`), api.get("/users/me/interactions")])
      .then(([data, saved]: [Anime, UserInteraction[]]) => {
        setAnime(data);
        setInteractions(new Map(saved.map((item) => [item.anime_id, item])));
        setInteraction(saved.find((item) => item.anime_id === data.anime_id));
        if (data.group_key) api.get(`/anime/group/${encodeURIComponent(data.group_key)}`).then((group) => setFranchiseSize(group.titles.length)).catch(() => setFranchiseSize(0));
        void fetchLiveDetail(data.anime_id).then((live) => live && setAnime((current) => current && current.anime_id === live.anime_id
          ? { ...current, english_title: live.english_title || current.english_title, media_type: live.media_type && live.media_type !== "Unknown" ? live.media_type : current.media_type, season: live.season ?? current.season, image_url: live.image_url || current.image_url, year: live.year ?? current.year, synopsis: live.synopsis || current.synopsis, trailer_url: live.trailer_url, score: live.score ?? current.score, status: live.status || current.status, total_episodes: live.total_episodes ?? current.total_episodes, studios: live.studios?.length ? live.studios : current.studios }
          : current));
      })
      .catch((requestError) => setError(requestError instanceof Error ? requestError.message : "Could not load this anime."));
    api.get(`/recommendations/anime/${id}?limit=12`).then(setSimilar).catch(() => setSimilar([]));
  }, [id]);

  if (error) return <div className="center-state"><p>{error}</p><button type="button" className="btn btn-ghost" onClick={() => router.back()}>Go back</button></div>;
  if (!anime) return <div className="center-state"><Loader2 size={30} className="spin" /> Loading</div>;

  const total = anime.total_episodes || 0;
  const facts = [
    ["Format", anime.media_type === "TV" ? "Series" : anime.media_type],
    ["Episodes", total || "?"],
    ["Status", anime.status],
    ["Aired", [anime.season ? anime.season[0].toUpperCase() + anime.season.slice(1) : null, anime.year].filter(Boolean).join(" ") || "—"],
    ["Studio", anime.studios?.join(", ") || "—"],
    ["Members", anime.members ? anime.members.toLocaleString() : "—"],
  ];

  return (
    <div className="stack">
      <section className="detail-hero">
        <div className="detail-hero-bg" style={{ backgroundImage: `url("${anime.image_url}")` }} />
        <div className="detail-grid">
          <div className="detail-poster"><img src={anime.image_url || DEFAULT_COVER} alt={displayTitle(anime)} onError={coverFallback} /></div>
          <div className="detail-info">
            <button type="button" className="back-link" style={{ background: "none", border: 0, padding: 0 }} onClick={() => router.back()}><ArrowLeft size={16} /> Back</button>
            <h1>{displayTitle(anime)}</h1>
            {anime.english_title && anime.english_title !== anime.title && <p className="detail-alt">{anime.title}</p>}
            <div className="hero-meta">
              {anime.score != null && <span className="tag hot"><Star size={12} fill="currentColor" /> {anime.score.toFixed(2)} on MAL</span>}
              {anime.genres.map((genre) => <span key={genre} className="tag cyan">{genre}</span>)}
              {[...(anime.themes || []), ...(anime.demographics || [])].slice(0, 4).map((tag) => <span key={tag} className="tag">{tag}</span>)}
            </div>
            <p className="detail-synopsis">{anime.synopsis || "No synopsis available yet."}</p>
            <div className="hero-actions">
              {anime.trailer_url && <a className="btn btn-hot" href={anime.trailer_url} target="_blank" rel="noreferrer"><Play size={16} fill="currentColor" /> Watch trailer</a>}
              <a className="btn btn-ghost" href={`https://myanimelist.net/anime/${anime.anime_id}`} target="_blank" rel="noreferrer"><ExternalLink size={16} /> MyAnimeList</a>
            </div>
            {anime.group_key && franchiseSize > 1 && (
              <Link className="franchise-banner" href={`/franchise/?key=${encodeURIComponent(anime.group_key)}`}>
                <span><strong><Layers size={15} style={{ verticalAlign: "-2px" }} /> {anime.group_title} franchise</strong><small>{franchiseSize} seasons, films and specials, in release order</small></span>
                <span className="link-btn">See them all</span>
              </Link>
            )}
          </div>
        </div>
      </section>

      <div className="detail-panels">
        <div className="panel">
          <h3>Your tracking</h3>
          <p className="help" style={{ marginBottom: "0.6rem" }}>Rate it, set a status, and tick off episodes.</p>
          <InteractionControls animeId={anime.anime_id} totalEpisodes={anime.total_episodes} initialInteraction={interaction} onSaved={setInteraction} onCleared={() => setInteraction(undefined)} />
        </div>
        <div className="panel"><h3>Details</h3><div className="fact-grid" style={{ marginTop: "0.6rem" }}>{facts.map(([label, value]) => <div key={label} className="fact"><span>{label}</span><b>{value}</b></div>)}</div></div>
        {total > 1 && <div className="panel">{interaction ? <EpisodeTracker animeId={anime.anime_id} totalEpisodes={total} interaction={interaction} onSaved={setInteraction} /> : <><h3>Episode tracker</h3><p>Add this title to your list to start ticking off its {total} episodes.</p></>}</div>}
      </div>

      {similar.length > 0 && <section>
        <div className="section-head"><div><h2>If you liked this</h2><p>Matched on genre, themes and story.</p></div></div>
        <div className="grid">{similar.map((item) => <AnimeCard key={item.anime_id} anime={{ ...item, userInteraction: interactions.get(item.anime_id) }} onInteractionSaved={(animeId, saved) => setInteractions((current) => new Map(current).set(animeId, saved))} onInteractionCleared={(animeId) => setInteractions((current) => { const next = new Map(current); next.delete(animeId); return next; })} />)}</div>
      </section>}
    </div>
  );
}
