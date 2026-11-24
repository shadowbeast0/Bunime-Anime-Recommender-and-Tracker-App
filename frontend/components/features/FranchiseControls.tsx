"use client";

import { useState } from "react";
import { Loader2, Star, X } from "lucide-react";
import { api } from "@/lib/api";
import { WATCH_STATUSES } from "@/components/features/InteractionControls";
import type { Anime, UserInteraction } from "@/lib/types";

interface FranchiseControlsProps {
  groupKey: string;
  count: number;
  saved: UserInteraction[];
  onSaved: (rows: Anime[]) => void;
  onCleared: (animeIds: number[]) => void;
  className?: string;
}

export default function FranchiseControls({ groupKey, count, saved, onSaved, onCleared, className = "" }: FranchiseControlsProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const statuses = new Set(saved.map((interaction) => interaction.watch_status));
  const allSaved = saved.length === count;
  const status = allSaved && statuses.size === 1 ? [...statuses][0] : "";
  const ratings = saved.map((interaction) => interaction.rating).filter((rating): rating is number => rating != null);
  const rating = ratings.length ? Math.round(ratings.reduce((sum, value) => sum + value, 0) / ratings.length) : 0;
  const completed = saved.filter((interaction) => interaction.watch_status === "Completed").length;
  const mixedLabel = saved.length ? `${completed} of ${count} completed` : `+ Add all ${count} to list`;

  const apply = async (update: { rating?: number | null; watch_status?: string }) => {
    setBusy(true);
    setError("");
    try {
      onSaved(await api.put(`/users/me/franchise/${encodeURIComponent(groupKey)}`, update));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not update this franchise.");
    } finally { setBusy(false); }
  };

  const clear = async () => {
    setBusy(true);
    setError("");
    try {
      onCleared(await api.delete(`/users/me/franchise/${encodeURIComponent(groupKey)}`));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not remove this franchise.");
    } finally { setBusy(false); }
  };

  return (
    <div className={`controls franchise-controls ${className}`}>
      <span className="franchise-controls-label">Whole franchise, {count} entries</span>
      <div className="controls-row">
        <div className="stars" role="group" aria-label="Rate the whole franchise">
          {[1, 2, 3, 4, 5].map((star) => (
            <button key={star} type="button" className={star <= rating ? "on" : ""} aria-pressed={star <= rating} disabled={busy}
              aria-label={star === rating ? "Remove franchise rating" : `Rate every entry ${star} out of 5`}
              onClick={() => void apply({ rating: star === rating ? null : star })}>
              <Star size={17} fill="currentColor" strokeWidth={1.5} />
            </button>
          ))}
        </div>
        {busy ? <span className="saving"><Loader2 size={14} className="spin" /></span>
          : saved.length > 0 && <button type="button" className="clear-btn" aria-label="Remove the whole franchise from my list" title="Remove the whole franchise from my list" onClick={() => void clear()}><X size={14} /></button>}
      </div>
      <label className={`status-select ${status ? "has-val" : "empty-val"}`}>
        <span className="sr-only">Status for every entry</span>
        <select value={status} disabled={busy} onChange={(event) => void apply({ watch_status: event.target.value })}>
          <option value="" disabled>{mixedLabel}</option>
          {WATCH_STATUSES.map((value) => <option key={value} value={value}>{value} (all {count})</option>)}
        </select>
      </label>
      {error && <p className="error-text" role="alert">{error}</p>}
    </div>
  );
}
