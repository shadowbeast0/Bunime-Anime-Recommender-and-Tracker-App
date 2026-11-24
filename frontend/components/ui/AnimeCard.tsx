"use client";

import { useState } from "react";
import Link from "next/link";
import { EyeOff, Layers, ListChecks, Star, X } from "lucide-react";
import InteractionControls from "@/components/features/InteractionControls";
import FranchiseControls from "@/components/features/FranchiseControls";
import EpisodeTracker from "@/components/features/EpisodeTracker";
import { coverFallback, DEFAULT_COVER } from "@/lib/basePath";
import { displayTitle, type Anime, type UserInteraction } from "@/lib/types";

export type FranchiseHandlers = {
  saved: UserInteraction[];
  onSaved: (rows: Anime[]) => void;
  onCleared: (animeIds: number[]) => void;
};

interface AnimeCardProps {
  anime: Anime;
  onInteractionSaved?: (animeId: number, interaction: UserInteraction) => void;
  onInteractionCleared?: (animeId: number) => void;
  onHide?: (animeId: number) => void;
  franchise?: FranchiseHandlers;
}

const formatLabel = (type?: string | null) => (type === "TV" ? "Series" : type === "MOVIE" ? "Movie" : type || "Anime");

export default function AnimeCard({ anime, onInteractionSaved, onInteractionCleared, onHide, franchise }: AnimeCardProps) {
  const [showEpisodes, setShowEpisodes] = useState(false);
  const asFranchise = Boolean(franchise && anime.group_key && (anime.franchise_count ?? 0) > 1);
  const interaction = anime.userInteraction;
  const total = anime.total_episodes || 0;
  const watched = interaction?.watch_status === "Completed" ? total : Math.max(interaction?.episodes_watched ?? 0, interaction?.watched_episodes?.length ?? 0);
  const href = asFranchise ? `/franchise/?key=${encodeURIComponent(anime.group_key!)}` : `/anime/?id=${anime.anime_id}`;
  const title = asFranchise ? anime.group_title || displayTitle(anime) : displayTitle(anime);
  const airing = anime.status && !/finished/i.test(anime.status) ? anime.status.replace("Currently Airing", "Airing") : null;
  const tracked = asFranchise ? (franchise!.saved.length > 0) : Boolean(interaction);

  return (
    <article className={`card ${tracked ? "is-tracked" : ""} ${asFranchise ? "is-franchise" : ""}`}>
      <Link href={href} className="card-cover" aria-label={title}>
        <img src={anime.image_url || DEFAULT_COVER} alt="" loading="lazy" onError={coverFallback} />
        {anime.score != null && <span className="score-burst"><Star size={11} fill="currentColor" /> {anime.score.toFixed(1)}</span>}
        {asFranchise ? <span className="franchise-flag"><Layers size={12} /> {anime.franchise_count} entries</span> : airing && <span className="status-pill">{airing}</span>}
      </Link>
      {onHide && <button type="button" className="card-hide" aria-label="Hide from this list" title="Hide from this list" onClick={() => onHide(anime.anime_id)}><EyeOff size={14} /></button>}
      <div className="card-body">
        <Link href={href} className="card-title" title={title}>{title}</Link>
        <span className="card-sub">
          {asFranchise
            ? <>Seasons, films and specials. <Link className="inline-link" href={`/anime/?id=${anime.anime_id}`}>{displayTitle(anime)}</Link></>
            : [formatLabel(anime.media_type), anime.year, total ? `${total} ep` : null].filter(Boolean).join(", ")}
        </span>
        {!asFranchise && interaction && total > 0 && watched > 0 && interaction.watch_status !== "Completed" && <div className="progress" title={`${watched}/${total} episodes`}><span style={{ width: `${(watched / total) * 100}%` }} /></div>}
        {asFranchise
          ? <FranchiseControls groupKey={anime.group_key!} count={anime.franchise_count!} saved={franchise!.saved} onSaved={franchise!.onSaved} onCleared={franchise!.onCleared} />
          : <InteractionControls
            animeId={anime.anime_id}
            totalEpisodes={anime.total_episodes}
            initialInteraction={interaction}
            onSaved={(saved) => onInteractionSaved?.(anime.anime_id, saved)}
            onCleared={() => onInteractionCleared?.(anime.anime_id)}
          />}
        {!asFranchise && interaction && total > 1 && <div className="card-actions"><button type="button" className="link-btn" onClick={() => setShowEpisodes(true)}><ListChecks size={14} /> Episodes {watched}/{total}</button></div>}
      </div>
      {showEpisodes && (
        <div className="episode-sheet" role="dialog" aria-modal="true" aria-label={`Episodes of ${displayTitle(anime)}`} onClick={() => setShowEpisodes(false)}>
          <div className="panel" onClick={(event) => event.stopPropagation()}>
            <div className="section-head" style={{ marginBottom: "0.75rem" }}>
              <h3 style={{ margin: 0 }}>{displayTitle(anime)}</h3>
              <button type="button" className="icon-btn" aria-label="Close" onClick={() => setShowEpisodes(false)}><X size={16} /></button>
            </div>
            <EpisodeTracker animeId={anime.anime_id} totalEpisodes={total} interaction={interaction} onSaved={(saved) => onInteractionSaved?.(anime.anime_id, saved)} />
          </div>
        </div>
      )}
    </article>
  );
}
