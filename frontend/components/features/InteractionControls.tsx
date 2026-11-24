"use client";

import { useEffect, useState } from "react";
import { Loader2, Star, X } from "lucide-react";
import { api } from "@/lib/api";
import type { UserInteraction } from "@/lib/types";

export type { UserInteraction };

export const WATCH_STATUSES = ["Plan to Watch", "Watching", "Completed", "On Hold", "Dropped"] as const;

interface InteractionControlsProps {
  animeId: number;
  totalEpisodes?: number | null;
  initialInteraction?: UserInteraction;
  onSaved?: (interaction: UserInteraction) => void;
  onCleared?: () => void;
  className?: string;
}

export default function InteractionControls({ animeId, totalEpisodes, initialInteraction, onSaved, onCleared, className = "" }: InteractionControlsProps) {
  const [rating, setRating] = useState(initialInteraction?.rating ?? 0);
  const [watchStatus, setWatchStatus] = useState(initialInteraction?.watch_status ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setRating(initialInteraction?.rating ?? 0);
    setWatchStatus(initialInteraction?.watch_status ?? "");
  }, [initialInteraction?.rating, initialInteraction?.watch_status]);

  const save = async (nextRating: number, nextStatus: string) => {
    const previous = { rating, watchStatus };
    const status = nextStatus || (nextRating ? "Completed" : "Plan to Watch");
    setRating(nextRating);
    setWatchStatus(status);
    setError("");
    setIsSaving(true);
    try {
      const episodes = status === "Completed" && totalEpisodes ? totalEpisodes : initialInteraction?.episodes_watched ?? 0;
      const watched = status === "Completed" && totalEpisodes
        ? Array.from({ length: totalEpisodes }, (_, index) => `1:${index + 1}`)
        : initialInteraction?.watched_episodes ?? [];
      const saved = await api.put(`/users/me/interactions/${animeId}`, {
        anime_id: animeId, watch_status: status, episodes_watched: episodes, watched_episodes: watched, rating: nextRating || null,
      });
      onSaved?.(saved);
    } catch (requestError) {
      setRating(previous.rating);
      setWatchStatus(previous.watchStatus);
      setError(requestError instanceof Error ? requestError.message : "Could not save your selection.");
    } finally {
      setIsSaving(false);
    }
  };

  const clear = async () => {
    setError("");
    setIsSaving(true);
    try {
      await api.delete(`/users/me/interactions/${animeId}`);
      setRating(0);
      setWatchStatus("");
      onCleared?.();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not remove this title.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={`controls ${className}`}>
      <div className="controls-row">
        <div className="stars" role="group" aria-label="Your rating">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              aria-label={star === rating ? `Remove ${star}-star rating` : `Rate ${star} out of 5`}
              aria-pressed={star <= rating}
              className={star <= rating ? "on" : ""}
              disabled={isSaving}
              onClick={() => void save(star === rating ? 0 : star, watchStatus)}
            >
              <Star size={17} fill="currentColor" strokeWidth={1.5} />
            </button>
          ))}
        </div>
        {isSaving ? <span className="saving"><Loader2 size={14} className="spin" /></span>
          : initialInteraction && <button type="button" className="clear-btn" aria-label="Remove from my list" title="Remove from my list" onClick={() => void clear()}><X size={14} /></button>}
      </div>
      <label className={`status-select ${watchStatus ? "has-val" : "empty-val"}`}>
        <span className="sr-only">Watch status</span>
        <select value={watchStatus} disabled={isSaving} onChange={(event) => void save(rating, event.target.value)}>
          <option value="" disabled>+ Add to list</option>
          {WATCH_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
      </label>
      {error && <p className="error-text" role="alert">{error}</p>}
    </div>
  );
}
