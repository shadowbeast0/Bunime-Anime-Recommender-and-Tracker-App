"use client";

import { coverFallback, DEFAULT_COVER } from "@/lib/basePath";
import { displayTitle, type Anime } from "@/lib/types";

interface AnimeSearchCardProps {
  anime: Pick<Anime, "anime_id" | "title" | "english_title" | "image_url" | "genres" | "score">;
  actionLabel?: string;
  onSelect: () => void;
}

export default function AnimeSearchCard({ anime, actionLabel = "Add", onSelect }: AnimeSearchCardProps) {
  return (
    <button type="button" className="mini-card" onClick={onSelect}>
      <img src={anime.image_url || DEFAULT_COVER} alt="" loading="lazy" onError={coverFallback} />
      <span>
        <strong>{displayTitle(anime)}</strong>
        <small>{(anime.genres || []).slice(0, 2).join(", ") || "Anime"}{anime.score != null ? `  ★ ${anime.score.toFixed(1)}` : ""}</small>
      </span>
      <em>{actionLabel}</em>
    </button>
  );
}
