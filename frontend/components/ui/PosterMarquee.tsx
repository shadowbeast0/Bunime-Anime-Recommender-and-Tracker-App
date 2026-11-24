import Link from "next/link";
import { coverFallback, DEFAULT_COVER } from "@/lib/basePath";
import { displayTitle, type Anime } from "@/lib/types";

export default function PosterMarquee({ items, ranked = false }: { items: Anime[]; ranked?: boolean }) {
  if (!items.length) return null;
  const loop = [...items, ...items];
  return (
    <div className="marquee">
      <div className="marquee-track">
        {loop.map((anime, index) => (
          <Link key={`${anime.anime_id}-${index}`} className="marquee-item" href={`/anime/?id=${anime.anime_id}`} aria-hidden={index >= items.length} tabIndex={index >= items.length ? -1 : undefined}>
            {ranked && <b className="marquee-rank">{(index % items.length) + 1}</b>}
            <img src={anime.image_url || DEFAULT_COVER} alt="" loading="lazy" onError={coverFallback} />
            <span>{displayTitle(anime)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
