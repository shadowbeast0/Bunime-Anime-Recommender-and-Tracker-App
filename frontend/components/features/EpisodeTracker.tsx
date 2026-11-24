"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { UserInteraction } from "@/lib/types";

interface EpisodeTrackerProps {
  animeId: number;
  totalEpisodes: number;
  interaction?: UserInteraction;
  onSaved: (interaction: UserInteraction) => void;
}

export default function EpisodeTracker({ animeId, totalEpisodes, interaction, onSaved }: EpisodeTrackerProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const watched = interaction?.watch_status === "Completed" ? totalEpisodes : Math.max(interaction?.episodes_watched ?? 0, interaction?.watched_episodes?.length ?? 0);

  const select = async (episode: number) => {
    const nextCount = episode <= watched ? episode - 1 : episode;
    const status = nextCount >= totalEpisodes ? "Completed" : nextCount > 0 ? (interaction?.watch_status && interaction.watch_status !== "Completed" ? interaction.watch_status : "Watching") : interaction?.watch_status === "Completed" ? "Watching" : interaction?.watch_status || "Plan to Watch";
    setIsSaving(true);
    setError("");
    try {
      const saved = await api.put(`/users/me/interactions/${animeId}`, {
        anime_id: animeId,
        watch_status: status,
        episodes_watched: nextCount,
        watched_episodes: Array.from({ length: nextCount }, (_, index) => `1:${index + 1}`),
        rating: interaction?.rating ?? null,
      });
      onSaved(saved);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save episode progress.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="episodes">
      <div className="episodes-head"><strong>Episode tracker</strong><small>{watched} / {totalEpisodes} watched</small></div>
      <div className="progress"><span style={{ width: `${Math.min(100, (watched / totalEpisodes) * 100)}%` }} /></div>
      <div className="episode-grid">
        {Array.from({ length: totalEpisodes }, (_, index) => index + 1).map((episode) => (
          <button key={episode} type="button" className={episode <= watched ? "seen" : ""} disabled={isSaving} aria-pressed={episode <= watched} aria-label={`Episode ${episode}`} onClick={() => void select(episode)}>{episode}</button>
        ))}
      </div>
      {error && <p className="error-text" role="alert">{error}</p>}
    </div>
  );
}
