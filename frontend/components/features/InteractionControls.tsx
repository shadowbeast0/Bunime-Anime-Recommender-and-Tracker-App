"use client";

import { useEffect, useState } from "react";
import { Loader2, Star, X } from "lucide-react";
import { api } from "@/lib/api";

export const WATCH_STATUSES = [
  "Plan to Watch",
  "Watching",
  "Completed",
  "On Hold",
  "Dropped",
  "New Release",
] as const;

export type UserInteraction = {
  anime_id: number;
  watch_status: string;
  episodes_watched?: number;
  watched_episodes?: string[];
  rating?: number | null;
};

interface InteractionControlsProps {
  animeId: number;
  initialInteraction?: UserInteraction;
  onSaved?: (interaction: UserInteraction) => void;
  onCleared?: () => void;
  className?: string;
}

export default function InteractionControls({
  animeId,
  initialInteraction,
  onSaved,
  onCleared,
  className = "",
}: InteractionControlsProps) {
  const [rating, setRating] = useState(initialInteraction?.rating ?? 0);
  const [watchStatus, setWatchStatus] = useState(initialInteraction?.watch_status ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setRating(initialInteraction?.rating ?? 0);
    setWatchStatus(initialInteraction?.watch_status ?? "");
  }, [initialInteraction?.rating, initialInteraction?.watch_status]);

  const saveInteraction = async (nextRating: number, nextStatus: string) => {
    const previousRating = rating;
    const previousStatus = watchStatus;
    setRating(nextRating);
    setWatchStatus(nextStatus);
    setError("");
    setIsSaving(true);

    try {
      const saved = await api.put(`/users/me/interactions/${animeId}`, {
        anime_id: animeId,
        watch_status: nextStatus,
        episodes_watched: initialInteraction?.episodes_watched ?? 0,
        watched_episodes: initialInteraction?.watched_episodes ?? [],
        rating: nextRating || null,
      });
      onSaved?.(saved);
    } catch (requestError) {
      setRating(previousRating);
      setWatchStatus(previousStatus);
      setError(requestError instanceof Error ? requestError.message : "Could not save your selection.");
    } finally {
      setIsSaving(false);
    }
  };

  const clearInteraction = async () => {
    if (!initialInteraction) return;
    setError("");
    setIsSaving(true);
    try {
      await api.delete(`/users/me/interactions/${animeId}`);
      setRating(0);
      setWatchStatus("");
      onCleared?.();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not clear your selection.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={`interaction-controls ${className}`} aria-label="Your anime status and rating">
      <div className="rating-control">
        <span className="interaction-label">Your rating</span>
        <div className="star-row" role="group" aria-label="Rate this anime">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              aria-label={`Rate ${star} out of 5`}
              aria-pressed={star === rating}
              className={star <= rating ? "active" : ""}
              disabled={isSaving}
              onClick={() => void saveInteraction(star, watchStatus)}
            >
              <Star size={16} fill="currentColor" />
            </button>
          ))}
        </div>
      </div>

      <label className={`status-control ${watchStatus ? "" : "is-unselected"}`}>
        <span className="interaction-label">Watch status</span>
        <select
          value={watchStatus}
          disabled={isSaving}
          onChange={(event) => void saveInteraction(rating, event.target.value)}
        >
          <option value="" disabled>Choose status</option>
          {WATCH_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
      </label>

      {initialInteraction && <button type="button" className="clear-interaction" aria-label="Clear rating and status" title="Clear rating and status" disabled={isSaving} onClick={() => void clearInteraction()}><X size={14} /></button>}

      {isSaving && <span className="interaction-saving"><Loader2 size={13} className="animate-spin" /> Saving</span>}
      {error && <p className="interaction-error" role="alert">{error}</p>}
    </div>
  );
}
