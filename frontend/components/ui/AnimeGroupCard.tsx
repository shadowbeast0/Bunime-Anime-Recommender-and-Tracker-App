import Link from "next/link";
import { Layers } from "lucide-react";

type AnimeGroup = {
  group_key: string;
  title: string;
  count: number;
  media_types: string[];
  anime: { image_url: string; title: string; english_title?: string | null; synopsis?: string; genres: string[] };
};

export default function AnimeGroupCard({ group }: { group: AnimeGroup }) {
  const title = group.title || group.anime.english_title || group.anime.title;
  return <Link className="anime-group-card" href={`/anime/group/${encodeURIComponent(group.group_key)}`}>
    <img src={group.anime.image_url || "/default-cover.png"} alt="" />
    <div><span className="group-count"><Layers size={13} /> {group.count} title{group.count === 1 ? "" : "s"}</span><h3>{title}</h3><p>{group.anime.synopsis || "Open this group to explore its seasons and films."}</p><small>{group.media_types.map((type) => type === "TV" ? "Series" : type).join(" · ")}</small></div>
  </Link>;
}
