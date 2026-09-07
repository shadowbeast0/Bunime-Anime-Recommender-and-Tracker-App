"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import InteractionControls, { type UserInteraction } from "@/components/features/InteractionControls";
import { api } from "@/lib/api";

interface AnimeCardProps {
  anime: {
    id: string;
    anime_id: number;
    title: string;
    english_title?: string | null;
    synopsis?: string;
    image_url: string;
    genres: string[];
    total_episodes: number | null;
    status: string;
    score?: number | null;
    userInteraction?: UserInteraction;
  };
  onInteractionSaved?: (animeId: number, interaction: UserInteraction) => void;
  onInteractionCleared?: (animeId: number) => void;
  onDoubleRightClick?: (animeId: number) => void;
}

export default function AnimeCard({ anime, onInteractionSaved, onInteractionCleared, onDoubleRightClick }: AnimeCardProps) {
  const lastRightClickAt = useRef(0);
  const [showEpisodes, setShowEpisodes] = useState(false);
  const [isSavingEpisodes, setIsSavingEpisodes] = useState(false);
  const episodeCount = anime.total_episodes || 0;
  const watchedEpisodes = new Set(anime.userInteraction?.watched_episodes || []);
  const isCompleted = anime.userInteraction?.watch_status === "Completed";
  const watchedCount = isCompleted ? episodeCount : Math.max(watchedEpisodes.size, anime.userInteraction?.episodes_watched || 0);
  const progressPercent = episodeCount ? Math.min(100, (watchedCount / episodeCount) * 100) : 0;

  const toggleEpisode = async (season: number, episode: number) => {
    if (!anime.userInteraction || !episodeCount || isSavingEpisodes) return;
    const key = `${season}:${episode}`;
    const next = new Set(watchedEpisodes);
    if (next.has(key)) {
      for (let current = episode; current <= episodeCount; current += 1) next.delete(`${season}:${current}`);
    } else {
      for (let current = 1; current <= episode; current += 1) next.add(`${season}:${current}`);
    }
    setIsSavingEpisodes(true);
    try {
      const saved = await api.put(`/users/me/interactions/${anime.anime_id}`, {
        anime_id: anime.anime_id,
        watch_status: anime.userInteraction.watch_status,
        episodes_watched: next.size,
        watched_episodes: [...next],
        rating: anime.userInteraction.rating || null,
      });
      onInteractionSaved?.(anime.anime_id, saved);
    } finally {
      setIsSavingEpisodes(false);
    }
  };

  return (
    <motion.article
      className="anime-card"
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
      onDoubleClick={(event) => {
        if ((event.target as HTMLElement).closest("button, select, input, label")) return;
        setShowEpisodes((current) => !current);
      }}
      onContextMenu={(event) => {
        if (!onDoubleRightClick) return;
        event.preventDefault();
        const now = Date.now();
        if (now - lastRightClickAt.current < 450) {
          lastRightClickAt.current = 0;
          onDoubleRightClick(anime.anime_id);
        } else {
          lastRightClickAt.current = now;
        }
      }}
    >
      <div className="anime-card-cover">
        <img src={anime.image_url || "/default-cover.png"} alt={anime.english_title || anime.title} />
        {anime.status !== "Finished Airing" && <div className="anime-badge">{anime.status}</div>}
      </div>
      <div className="anime-card-content">
        <Link className="anime-card-title" href={`/anime/${anime.anime_id}`} title={anime.english_title || anime.title} onDoubleClick={(event) => { event.preventDefault(); setShowEpisodes((current) => !current); }}>{anime.english_title || anime.title}</Link>
        {anime.english_title && anime.english_title !== anime.title && <span className="original-anime-title">{anime.title}</span>}
        <p>{anime.synopsis || "No description available for this title yet."}</p>
        <div className="genre-row">
          {anime.genres.slice(0, 3).map((genre) => <span key={genre}>{genre}</span>)}
        </div>
        {anime.score != null && <span className="community-score">MAL {anime.score.toFixed(1)}</span>}
        <InteractionControls
          animeId={anime.anime_id}
          initialInteraction={anime.userInteraction}
          onSaved={(interaction) => onInteractionSaved?.(anime.anime_id, interaction)}
          onCleared={() => onInteractionCleared?.(anime.anime_id)}
        />
        {watchedCount > 0 && !isCompleted && <div className="episode-progress" aria-label={`${watchedCount} of ${episodeCount || "some"} episodes watched`}><span style={{ width: `${progressPercent}%` }} /></div>}
        {showEpisodes && <div className="episode-tracker" onDoubleClick={(event) => event.stopPropagation()}>
          <div className="episode-tracker-heading"><span>Episodes</span><small>{isCompleted ? "All episodes complete" : "Select your progress"}</small></div>
          {episodeCount > 0 ? <div className="episode-season"><strong>Season 1</strong><div className="episode-list">{Array.from({ length: episodeCount }, (_, index) => index + 1).map((episode) => {
            const checked = isCompleted || watchedEpisodes.has(`1:${episode}`);
            return <label key={episode} className={checked ? "watched" : ""}><input type="checkbox" checked={checked} disabled={!anime.userInteraction || isCompleted || isSavingEpisodes} onChange={() => void toggleEpisode(1, episode)} /><span>{episode}</span></label>;
          })}</div></div> : <small className="episode-empty">Episode count unavailable.</small>}
        </div>}
      </div>
    </motion.article>
  );
}
