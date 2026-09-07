"use client";

interface AnimeSearchCardProps {
  anime: {
    anime_id: number;
    title: string;
    english_title?: string | null;
    image_url?: string;
    genres?: string[];
    score?: number | null;
  };
  actionLabel?: string;
  onSelect: () => void;
}

export default function AnimeSearchCard({ anime, actionLabel = "Add", onSelect }: AnimeSearchCardProps) {
  return (
    <button type="button" className="anime-search-card" onClick={onSelect}>
      <img src={anime.image_url || "/default-cover.png"} alt={anime.english_title || anime.title} onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = "/default-cover.png"; }} />
      <span className="anime-search-card-copy">
        <strong>{anime.english_title || anime.title}</strong>
        {anime.english_title && anime.english_title !== anime.title && <small>{anime.title}</small>}
        <small>{(anime.genres || []).slice(0, 2).join(" · ") || "Anime"}{anime.score != null ? ` · ${anime.score.toFixed(1)}` : ""}</small>
      </span>
      <span className="anime-search-card-action">{actionLabel}</span>
    </button>
  );
}
