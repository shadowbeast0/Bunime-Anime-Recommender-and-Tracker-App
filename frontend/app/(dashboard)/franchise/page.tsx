"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ArrowLeft, Check, Loader2, Star } from "lucide-react";
import { api } from "@/lib/api";
import { coverFallback, DEFAULT_COVER } from "@/lib/basePath";
import { displayTitle, type Anime, type UserInteraction } from "@/lib/types";
import FranchiseControls from "@/components/features/FranchiseControls";

type Group = { group_key: string; title: string; titles: Anime[] };
const formatLabel = (type?: string | null) => (type === "TV" ? "Series" : type === "MOVIE" ? "Movie" : type || "Anime");

export default function FranchisePage() {
  return <Suspense fallback={<div className="center-state"><Loader2 size={30} className="spin" /></div>}><Franchise /></Suspense>;
}

function Franchise() {
  const router = useRouter();
  const key = useSearchParams().get("key") || "";
  const [group, setGroup] = useState<Group | null>(null);
  const [saved, setSaved] = useState<Map<number, UserInteraction>>(new Map());
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api.get(`/anime/group/${encodeURIComponent(key)}`), api.get("/users/me/interactions")])
      .then(([data, interactions]: [Group, UserInteraction[]]) => { setGroup(data); setSaved(new Map(interactions.map((item) => [item.anime_id, item]))); })
      .catch((requestError) => setError(requestError instanceof Error ? requestError.message : "Could not load this franchise."));
  }, [key]);

  if (error) return <div className="center-state"><p>{error}</p><Link className="btn btn-ghost" href="/dashboard/?view=browse&group=1">All franchises</Link></div>;
  if (!group) return <div className="center-state"><Loader2 size={30} className="spin" /> Loading</div>;

  const lead = [...group.titles].sort((a, b) => (b.members ?? 0) - (a.members ?? 0))[0];
  const tracked = group.titles.filter((anime) => saved.has(anime.anime_id)).length;
  const sections = ["TV", "MOVIE", "ONA", "OVA", "SPECIAL", "TV_SPECIAL"].map((type) => [type, group.titles.filter((anime) => anime.media_type === type)] as const).filter(([, titles]) => titles.length);
  const other = group.titles.filter((anime) => !sections.some(([, titles]) => titles.includes(anime)));

  return (
    <div className="stack">
      <section className="detail-hero">
        <div className="detail-hero-bg" style={{ backgroundImage: `url("${lead.image_url}")` }} />
        <div className="detail-grid">
          <div className="detail-poster"><img src={lead.image_url || DEFAULT_COVER} alt="" onError={coverFallback} /></div>
          <div className="detail-info">
            <button type="button" className="back-link" style={{ background: "none", border: 0, padding: 0 }} onClick={() => router.back()}><ArrowLeft size={16} /> Back</button>
            <h1>{group.title}</h1>
            <div className="hero-meta">
              <span className="tag hot">{group.titles.length} entries</span>
              {sections.map(([type, titles]) => <span key={type} className="tag">{titles.length} {formatLabel(type)}{titles.length > 1 && type !== "TV" ? "s" : ""}</span>)}
              {tracked > 0 && <span className="tag cyan"><Check size={12} /> {tracked} on your list</span>}
            </div>
            <div className="franchise-panel">
              <FranchiseControls
                groupKey={group.group_key}
                count={group.titles.length}
                saved={group.titles.map((anime) => saved.get(anime.anime_id)).filter((item): item is UserInteraction => Boolean(item))}
                onSaved={(rows) => setSaved((current) => { const next = new Map(current); rows.forEach((row) => row.userInteraction && next.set(row.anime_id, row.userInteraction)); return next; })}
                onCleared={(ids) => setSaved((current) => { const next = new Map(current); ids.forEach((id) => next.delete(id)); return next; })}
              />
              <p className="help">Or open any entry below to rate it on its own.</p>
            </div>
            <p className="detail-synopsis">{lead.synopsis}</p>
          </div>
        </div>
      </section>
      {[...sections, ...(other.length ? [["OTHER", other] as const] : [])].map(([type, titles]) => (
        <section key={type}>
          <div className="section-head"><h2>{type === "OTHER" ? "Other" : `${formatLabel(type)}${type === "TV" ? " seasons" : "s"}`}</h2></div>
          <div className="timeline">
            {titles.map((anime) => {
              const interaction = saved.get(anime.anime_id);
              return (
                <Link key={anime.anime_id} href={`/anime/?id=${anime.anime_id}`} className="timeline-item">
                  <img src={anime.image_url || DEFAULT_COVER} alt="" loading="lazy" onError={coverFallback} />
                  <span>
                    <strong>{displayTitle(anime)}</strong>
                    {anime.english_title && anime.english_title !== anime.title && <small>{anime.title}</small>}
                    <small>{formatLabel(anime.media_type)}, {anime.total_episodes ?? "?"} episodes{anime.score ? <>, <Star size={11} fill="currentColor" style={{ verticalAlign: "-1px" }} /> {anime.score.toFixed(2)}</> : null}</small>
                    {interaction && <small className="tracked">{interaction.watch_status}{interaction.rating ? `, ${"★".repeat(interaction.rating)}` : ""}</small>}
                  </span>
                  <span className="timeline-year">{anime.year ?? ""}</span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
