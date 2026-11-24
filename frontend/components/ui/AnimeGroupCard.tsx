import Link from "next/link";
import { Layers } from "lucide-react";
import { coverFallback, DEFAULT_COVER } from "@/lib/basePath";
import type { Anime } from "@/lib/types";

export type AnimeGroup = { group_key: string; title: string; count: number; media_types: string[]; anime: Anime };

export default function AnimeGroupCard({ group }: { group: AnimeGroup }) {
  const formats = [...new Set(group.media_types.map((type) => (type === "TV" ? "Series" : type === "MOVIE" ? "Movies" : type)))].slice(0, 3);
  return (
    <Link className="franchise-card" href={`/franchise/?key=${encodeURIComponent(group.group_key)}`}>
      <img src={group.anime.image_url || DEFAULT_COVER} alt="" loading="lazy" onError={coverFallback} />
      <span className="franchise-count"><Layers size={12} /> Franchise</span>
      <div>
        <h3>{group.title}</h3>
        <small>{group.count} entries: {formats.join(", ").toLowerCase()}</small>
      </div>
    </Link>
  );
}
