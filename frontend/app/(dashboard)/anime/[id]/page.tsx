"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import InteractionControls, { type UserInteraction } from "@/components/features/InteractionControls";

export default function AnimeDetailPage() {
	const params = useParams<{ id: string }>();
	const [anime, setAnime] = useState<any>(null);
	const [interaction, setInteraction] = useState<UserInteraction | undefined>();
	const [error, setError] = useState("");
	const [isSavingEpisodes, setIsSavingEpisodes] = useState(false);

	const toggleEpisode = async (episode: number) => {
		if (!interaction || !anime?.total_episodes || isSavingEpisodes || interaction.watch_status === "Completed") return;
		const next = new Set(interaction.watched_episodes || []);
		const key = `1:${episode}`;
		if (next.has(key)) {
			for (let current = episode; current <= anime.total_episodes; current += 1) next.delete(`1:${current}`);
		} else {
			for (let current = 1; current <= episode; current += 1) next.add(`1:${current}`);
		}
		setIsSavingEpisodes(true);
		try {
			const saved = await api.put(`/users/me/interactions/${anime.anime_id}`, { anime_id: anime.anime_id, watch_status: interaction.watch_status, episodes_watched: next.size, watched_episodes: [...next], rating: interaction.rating || null });
			setInteraction(saved);
		} catch (requestError) {
			setError(requestError instanceof Error ? requestError.message : "Could not save episode progress.");
		} finally { setIsSavingEpisodes(false); }
	};

	useEffect(() => {
		Promise.all([api.get(`/anime/${params.id}`), api.get("/users/me/interactions")])
			.then(([animeData, interactions]) => {
				setAnime(animeData);
				setInteraction(interactions.find((item: UserInteraction) => item.anime_id === animeData.anime_id));
			})
			.catch((requestError) => setError(requestError instanceof Error ? requestError.message : "Could not load this anime."));
	}, [params.id]);

	if (error) return <div className="detail-state">{error}</div>;
	if (!anime) return <div className="detail-state"><Loader2 className="detail-spinner" /> Loading anime...</div>;

	return (
		<article className="detail-page">
			<img className="detail-cover" src={anime.image_url || "/default-cover.png"} alt={anime.english_title || anime.title} />
			<div className="detail-copy">
				<Link href="/dashboard" className="detail-back">
					<ArrowLeft className="size-4" /> Back to dashboard
				</Link>
				<div>
					{anime.status !== "Finished Airing" && <p className="detail-status">{anime.status}</p>}
					<h1>{anime.english_title || anime.title}</h1>
					{anime.english_title && anime.english_title !== anime.title && <p className="original-detail-title">{anime.title}</p>}
				</div>
				<p className="detail-synopsis">{anime.synopsis || "No synopsis available."}</p>
				<div className="detail-meta">
					<span>{anime.total_episodes ?? "Unknown"} episodes</span>
					<span>Score: {anime.score ?? "Not rated"}</span>
					  {(anime.genres || []).map((genre: string) => <span key={genre}>{genre}</span>)}
				</div>
				<InteractionControls
					animeId={anime.anime_id}
					initialInteraction={interaction}
					onSaved={setInteraction}
					onCleared={() => setInteraction(undefined)}
					className="detail-interaction-controls"
				/>
				{(anime.total_episodes || 0) > 0 && <div className="episode-ticket detail-episode-tracker"><div className="episode-tracker-heading"><span>Episode booking</span><small>Season 1 · {anime.total_episodes} episodes</small></div><p className="episode-ticket-note">Mark an episode to book everything up to it as seen.</p><div className="episode-list">{Array.from({ length: anime.total_episodes }, (_, index) => index + 1).map((episode) => { const watchedCount = interaction?.episodes_watched || 0; const checked = interaction?.watch_status === "Completed" || interaction?.watched_episodes?.includes(`1:${episode}`) || episode <= watchedCount; return <label key={episode} className={checked ? "watched" : ""}><input type="checkbox" checked={checked} disabled={!interaction || interaction.watch_status === "Completed" || isSavingEpisodes} onChange={() => void toggleEpisode(episode)} /><span>{episode}</span></label>; })}</div></div>}
			</div>
		</article>
	);
}
