"use client";

import { withBase } from "@/lib/basePath";
import type { Anime } from "@/lib/types";


type CatalogData = {
  list: Anime[];
  byId: Map<number, Anime>;
  byGroup: Map<string, Anime[]>;
  similar: Record<string, number[]>;
  searchIndex: { anime: Anime; haystack: string; words: string[] }[];
};

const JIKAN = "https://api.jikan.moe/v4";
const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID || "dev";
let catalogPromise: Promise<CatalogData> | null = null;

export const normalizeText = (value: string) =>
  value.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

export function loadCatalog(): Promise<CatalogData> {
  if (!catalogPromise) {
    catalogPromise = (async () => {
      const [listResponse, similarResponse] = await Promise.all([
        fetch(withBase(`/data/catalog.json?v=${BUILD_ID}`)),
        fetch(withBase(`/data/similar.json?v=${BUILD_ID}`)),
      ]);
      if (!listResponse.ok) throw new Error("Could not load the anime catalog.");
      const list: Anime[] = (await listResponse.json()).map((anime: Anime) => ({ ...anime, id: String(anime.anime_id) }));
      const similar = similarResponse.ok ? await similarResponse.json() : {};
      const byId = new Map(list.map((anime) => [anime.anime_id, anime]));
      const byGroup = new Map<string, Anime[]>();
      for (const anime of list) {
        if (!anime.group_key) continue;
        const group = byGroup.get(anime.group_key) ?? [];
        group.push(anime);
        byGroup.set(anime.group_key, group);
      }
      const searchIndex = list.map((anime) => {
        const haystack = normalizeText(`${anime.english_title ?? ""} ${anime.title} ${(anime.synonyms ?? []).join(" ")}`);
        return { anime, haystack, words: haystack.split(" ") };
      });
      return { list, byId, byGroup, similar, searchIndex };
    })().catch((error) => {
      catalogPromise = null;
      throw error;
    });
  }
  return catalogPromise;
}

export async function searchCatalog(query: string, limit = 20): Promise<Anime[]> {
  const { searchIndex } = await loadCatalog();
  const needle = normalizeText(query);
  if (!needle) return [];
  const terms = needle.split(" ");
  const scored: { anime: Anime; score: number }[] = [];
  for (const entry of searchIndex) {
    let score = 0;
    if (entry.haystack === needle) score = 100;
    else if (entry.haystack.startsWith(needle)) score = 80;
    else if (entry.haystack.includes(` ${needle}`)) score = 65;
    else if (entry.haystack.includes(needle)) score = 50;
    else if (terms.every((term) => entry.words.some((word) => word.startsWith(term)))) score = 35;
    if (!score) continue;
    score += Math.log10((entry.anime.members ?? 1) + 1) * 3;
    scored.push({ anime: entry.anime, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((item) => item.anime);
}


let lastJikanCall = 0;
async function jikan<T>(path: string): Promise<T | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const wait = Math.max(0, lastJikanCall + 400 - Date.now());
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    lastJikanCall = Date.now();
    try {
      const response = await fetch(`${JIKAN}${path}`, { signal: AbortSignal.timeout(8000) });
      if (response.status === 429) { await new Promise((resolve) => setTimeout(resolve, 1200)); continue; }
      if (!response.ok) return null;
      return (await response.json()) as T;
    } catch {
      return null;
    }
  }
  return null;
}

type JikanAnime = {
  mal_id: number;
  title: string;
  title_english?: string | null;
  synopsis?: string | null;
  genres?: { name: string }[];
  themes?: { name: string }[];
  demographics?: { name: string }[];
  studios?: { name: string }[];
  images?: { jpg?: { large_image_url?: string; image_url?: string }; webp?: { large_image_url?: string } };
  episodes?: number | null;
  status?: string | null;
  type?: string | null;
  score?: number | null;
  members?: number | null;
  year?: number | null;
  season?: string | null;
  trailer?: { url?: string | null; youtube_id?: string | null; embed_url?: string | null } | null;
  rating?: string | null;
};

export function fromJikan(item: JikanAnime): Anime {
  return {
    id: String(item.mal_id),
    anime_id: item.mal_id,
    title: item.title || item.title_english || "Untitled",
    english_title: item.title_english || null,
    synopsis: (item.synopsis || "").replace(/\[Written by MAL Rewrite\]/g, "").trim(),
    genres: (item.genres || []).map((genre) => genre.name),
    themes: (item.themes || []).map((theme) => theme.name),
    demographics: (item.demographics || []).map((demographic) => demographic.name),
    studios: (item.studios || []).map((studio) => studio.name).slice(0, 2),
    image_url: item.images?.webp?.large_image_url || item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || "",
    total_episodes: item.episodes ?? null,
    status: item.status || "Unknown",
    media_type: (item.type || "Unknown").toUpperCase(),
    score: item.score ?? null,
    members: item.members ?? null,
    year: item.year ?? null,
    season: item.season ?? null,
    trailer_url: item.trailer?.youtube_id ? `https://www.youtube.com/watch?v=${item.trailer.youtube_id}` : item.trailer?.url ?? null,
  };
}

const isSafe = (item: JikanAnime) => !(item.genres || []).some((genre) => genre.name === "Hentai") && !(item.rating || "").startsWith("Rx");

export async function searchJikan(query: string, limit = 10): Promise<Anime[]> {
  const payload = await jikan<{ data: JikanAnime[] }>(`/anime?q=${encodeURIComponent(query)}&limit=${Math.min(limit, 20)}&sfw=true&order_by=members&sort=desc`);
  return (payload?.data || []).filter(isSafe).map(fromJikan);
}

const detailCache = new Map<number, Promise<Anime | null>>();
export function fetchJikanDetail(animeId: number): Promise<Anime | null> {
  if (!detailCache.has(animeId)) {
    detailCache.set(animeId, jikan<{ data: JikanAnime }>(`/anime/${animeId}/full`).then((payload) =>
      payload?.data && isSafe(payload.data) ? fromJikan(payload.data) : null));
  }
  return detailCache.get(animeId)!;
}


const ANILIST = "https://graphql.anilist.co";
const ANILIST_FIELDS = `id idMal title { romaji english } synonyms description(asHtml: false) genres tags { name rank isAdult }
  coverImage { extraLarge large } episodes status format averageScore popularity seasonYear season isAdult
  trailer { id site } studios(isMain: true) { nodes { name } }`;

type AniListMedia = {
  id: number;
  idMal?: number | null;
  title: { romaji?: string | null; english?: string | null };
  synonyms?: string[];
  description?: string | null;
  genres?: string[];
  tags?: { name: string; rank: number; isAdult: boolean }[];
  coverImage?: { extraLarge?: string | null; large?: string | null };
  episodes?: number | null;
  status?: string | null;
  format?: string | null;
  averageScore?: number | null;
  popularity?: number | null;
  seasonYear?: number | null;
  season?: string | null;
  isAdult?: boolean;
  trailer?: { id?: string | null; site?: string | null } | null;
  studios?: { nodes: { name: string }[] };
};

const ANILIST_STATUS: Record<string, string> = { FINISHED: "Finished Airing", RELEASING: "Currently Airing", NOT_YET_RELEASED: "Not Yet Aired", CANCELLED: "Cancelled", HIATUS: "On Hiatus" };
const ANILIST_FORMAT: Record<string, string> = { TV: "TV", TV_SHORT: "TV", MOVIE: "MOVIE", OVA: "OVA", ONA: "ONA", SPECIAL: "SPECIAL", MUSIC: "MUSIC" };

export function fromAniList(media: AniListMedia): Anime {
  const animeId = media.idMal || 800000 + media.id;
  return {
    id: String(animeId),
    anime_id: animeId,
    title: media.title.romaji || media.title.english || "Untitled",
    english_title: media.title.english || null,
    synonyms: (media.synonyms ?? []).slice(0, 3),
    synopsis: (media.description || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n").trim(),
    genres: media.genres ?? [],
    themes: (media.tags ?? []).filter((tag) => !tag.isAdult && tag.rank >= 60).map((tag) => tag.name).slice(0, 5),
    demographics: [],
    studios: (media.studios?.nodes ?? []).map((studio) => studio.name).slice(0, 2),
    image_url: media.coverImage?.extraLarge || media.coverImage?.large || "",
    total_episodes: media.episodes ?? null,
    status: ANILIST_STATUS[media.status ?? ""] ?? "Unknown",
    media_type: ANILIST_FORMAT[media.format ?? ""] ?? (media.format || "Unknown"),
    score: media.averageScore ? media.averageScore / 10 : null,
    members: media.popularity ?? null,
    year: media.seasonYear ?? null,
    season: media.season ? media.season.toLowerCase() : null,
    trailer_url: media.trailer?.site === "youtube" && media.trailer.id ? `https://www.youtube.com/watch?v=${media.trailer.id}` : null,
  };
}

async function anilist<T>(query: string, variables: Record<string, unknown>): Promise<T | null> {
  try {
    const response = await fetch(ANILIST, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    return ((await response.json()) as { data: T }).data ?? null;
  } catch {
    return null;
  }
}

export async function searchAniList(query: string, limit = 10): Promise<Anime[]> {
  const data = await anilist<{ Page: { media: AniListMedia[] } }>(
    `query ($search: String, $perPage: Int) { Page(perPage: $perPage) { media(search: $search, type: ANIME, isAdult: false, sort: SEARCH_MATCH) { ${ANILIST_FIELDS} } } }`,
    { search: query, perPage: Math.min(limit, 20) },
  );
  return (data?.Page.media ?? []).filter((media) => !media.isAdult && !(media.genres ?? []).includes("Hentai")).map(fromAniList);
}

async function fetchAniListDetail(animeId: number): Promise<Anime | null> {
  const byAniListId = animeId >= 800000;
  const data = await anilist<{ Media: AniListMedia | null }>(
    `query ($id: Int) { Media(${byAniListId ? "id" : "idMal"}: $id, type: ANIME) { ${ANILIST_FIELDS} } }`,
    { id: byAniListId ? animeId - 800000 : animeId },
  );
  return data?.Media && !data.Media.isAdult ? fromAniList(data.Media) : null;
}

function firstResult<T>(sources: Promise<T>[], isEmpty: (value: T) => boolean, fallback: T): Promise<T> {
  return Promise.any(sources.map((source) => source.then((value) => (isEmpty(value) ? Promise.reject() : value)))).catch(() => fallback);
}

export function searchLive(query: string, limit = 10): Promise<Anime[]> {
  return firstResult([searchJikan(query, limit), searchAniList(query, limit)], (list) => list.length === 0, []);
}

const liveDetailCache = new Map<number, Promise<Anime | null>>();
export function fetchLiveDetail(animeId: number): Promise<Anime | null> {
  if (!liveDetailCache.has(animeId)) {
    const sources = animeId >= 800000 ? [fetchAniListDetail(animeId)] : [fetchJikanDetail(animeId), fetchAniListDetail(animeId)];
    liveDetailCache.set(animeId, firstResult(sources, (value) => value === null, null));
  }
  return liveDetailCache.get(animeId)!;
}

export async function fetchSeasonNow(limit = 18): Promise<Anime[]> {
  const payload = await jikan<{ data: JikanAnime[] }>(`/seasons/now?sfw=true&limit=${limit}`);
  return (payload?.data || []).filter(isSafe).map(fromJikan);
}
