"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

export default function AnimeGroupPage() {
  const { key } = useParams<{ key: string }>();
  const [group, setGroup] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get(`/anime/group/${encodeURIComponent(key)}`).then(setGroup).catch((requestError) => setError(requestError.message));
  }, [key]);

  if (error) return <div className="detail-state">{error}</div>;
  if (!group) return <div className="detail-state"><Loader2 className="detail-spinner" /> Loading franchise...</div>;

  return <section className="group-page">
    <Link href="/dashboard" className="detail-back"><ArrowLeft className="size-4" /> Back to browse</Link>
    <div><p className="hero-kicker">Franchise</p><h1>{group.title}</h1><p className="group-page-copy">Choose a season, special, or film to see its details and set your own rating or watch status.</p></div>
    <div className="group-title-list">{group.titles.map((anime: any) => <Link key={anime.anime_id} href={`/anime/${anime.anime_id}`}><img src={anime.image_url || "/default-cover.png"} alt="" /><span><strong>{anime.english_title || anime.title}</strong>{anime.english_title && anime.english_title !== anime.title && <small>{anime.title}</small>}<small>{anime.media_type === "TV" ? "Series" : anime.media_type} · {anime.total_episodes ?? "?"} episodes</small></span></Link>)}</div>
  </section>;
}
