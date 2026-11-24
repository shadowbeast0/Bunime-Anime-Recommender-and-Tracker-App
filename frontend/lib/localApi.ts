"use client";

import { fetchLiveDetail, loadCatalog, normalizeText, searchCatalog, searchLive } from "@/lib/catalog";
import { loadDb, updateDb, type DbState, type StoredUser } from "@/lib/store";
import type { Anime, User, UserInteraction } from "@/lib/types";


export class ApiError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

const GENRE_ALIASES: Record<string, string> = { Thriller: "Suspense" };
const genreName = (genre: string) => GENRE_ALIASES[genre] ?? genre;

const toUser = (user: StoredUser): User => ({ id: user.id, username: user.username, email: user.email, profile: user.profile });

async function hashPassword(password: string, salt: string) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations: 120_000, hash: "SHA-256" }, material, 256);
  return Array.from(new Uint8Array(bits), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const randomId = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (byte) => byte.toString(16).padStart(2, "0")).join("");

async function currentUser(db?: DbState): Promise<StoredUser> {
  const state = db ?? (await loadDb());
  const user = Object.values(state.users).find((candidate) => candidate.id === state.session);
  if (!user) throw new ApiError("Please sign in to continue.", 401);
  return user;
}

async function findAnime(animeId: number): Promise<Anime | null> {
  const { byId } = await loadCatalog();
  const db = await loadDb();
  return byId.get(animeId) ?? db.anime_cache[String(animeId)] ?? null;
}

async function rememberAnime(animeId: number) {
  const { byId } = await loadCatalog();
  if (byId.has(animeId)) return;
  const db = await loadDb();
  if (db.anime_cache[String(animeId)]) return;
  const anime = await fetchLiveDetail(animeId);
  if (anime) await updateDb((draft) => { draft.anime_cache[String(animeId)] = { ...anime, synopsis: anime.synopsis?.slice(0, 600) }; });
}

const matchesFilters = (anime: Anime, params: URLSearchParams) => {
  const media = params.get("media_type");
  const demographic = params.get("demographic");
  const theme = params.get("theme");
  const genre = params.get("genre");
  if (media === "MOVIE" && anime.media_type !== "MOVIE") return false;
  if (media && media !== "MOVIE" && anime.media_type === "MOVIE") return false;
  if (demographic && !(anime.demographics || []).includes(demographic)) return false;
  if (theme && !(anime.themes || []).includes(theme)) return false;
  if (genre && !anime.genres.includes(genreName(genre))) return false;
  return true;
};

const byScore = (a: Anime, b: Anime) => (b.score ?? -1) - (a.score ?? -1) || (b.members ?? 0) - (a.members ?? 0);

type Groups = Map<string, Anime[]>;
const franchiseLead = (titles: Anime[]) => [...titles].sort((a, b) => (b.members ?? 0) - (a.members ?? 0))[0];

function withFranchise(anime: Anime, byGroup: Groups): Anime {
  const titles = anime.group_key ? byGroup.get(anime.group_key) : undefined;
  if (!titles || titles.length < 2) return anime;
  return { ...anime, franchise_count: titles.length, franchise_ids: titles.map((title) => title.anime_id) };
}

function collapseFranchises(items: Anime[], byGroup: Groups, useLead?: (lead: Anime) => boolean): Anime[] {
  const seen = new Set<string>();
  const out: Anime[] = [];
  for (const anime of items) {
    const key = anime.group_key || `id:${anime.anime_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const titles = anime.group_key ? byGroup.get(anime.group_key) : undefined;
    const lead = titles && titles.length > 1 ? franchiseLead(titles) : anime;
    out.push(withFranchise(useLead && lead !== anime && useLead(lead) ? lead : anime, byGroup));
  }
  return out;
}

async function recommend(user: StoredUser, params: URLSearchParams): Promise<Anime[]> {
  const { list, byId, byGroup, similar } = await loadCatalog();
  const db = await loadDb();
  const interactions = db.interactions[user.id] ?? {};
  const limit = Number(params.get("limit") ?? 20);
  const skip = Number(params.get("skip") ?? 0);
  const ids = (key: string) => (params.get(key) ?? "").split(",").map(Number).filter(Boolean);
  const seeds = ids("seed_ids");
  const excluded = new Set([...Object.keys(interactions).map(Number), ...seeds, ...ids("exclude_ids")]);

  const weights = new Map<number, number>();
  const vote = (sourceId: number, weight: number) => {
    (similar[String(sourceId)] ?? []).forEach((candidate, rank) => {
      weights.set(candidate, (weights.get(candidate) ?? 0) + weight / (1 + rank * 0.25));
    });
  };
  if (seeds.length) seeds.forEach((id) => vote(id, 3));
  else {
    user.profile.favorite_anime_ids.forEach((id) => vote(id, 2.5));
    Object.values(interactions).forEach((interaction) => {
      if ((interaction.rating ?? 0) >= 4) vote(interaction.anime_id, interaction.rating === 5 ? 2 : 1.4);
      else if (interaction.rating != null && interaction.rating <= 2) vote(interaction.anime_id, -0.8);
      else if (interaction.watch_status === "Completed" || interaction.watch_status === "Watching") vote(interaction.anime_id, 0.6);
    });
  }
  const preferred = new Set(user.profile.preferred_genres.map(genreName));
  const ranked = [...weights.entries()]
    .filter(([id, weight]) => weight > 0 && !excluded.has(id))
    .map(([id, weight]) => {
      const anime = byId.get(id)!;
      const genreBoost = anime.genres.some((genre) => preferred.has(genre)) ? 1.2 : 1;
      const quality = 0.6 + ((anime.score ?? 6.5) - 5) / 10;
      return { anime, weight: weight * genreBoost * quality };
    })
    .filter(({ anime }) => anime && matchesFilters(anime, params))
    .sort((a, b) => b.weight - a.weight)
    .map(({ anime }) => anime);

  const known = new Set(ranked.map((anime) => anime.anime_id));
  const fallback = list
    .filter((anime) => !excluded.has(anime.anime_id) && !known.has(anime.anime_id) && matchesFilters(anime, params) && (anime.members ?? 0) > 50_000)
    .sort((a, b) => Number(b.genres.some((genre) => preferred.has(genre))) - Number(a.genres.some((genre) => preferred.has(genre))) || byScore(a, b));
  const grouped = collapseFranchises([...ranked, ...fallback], byGroup, (lead) => !excluded.has(lead.anime_id) && matchesFilters(lead, params));
  return grouped.slice(skip, skip + limit);
}

async function exportData(user: StoredUser) {
  const db = await loadDb();
  const interactions = Object.values(db.interactions[user.id] ?? {}).sort((a, b) => (b.last_updated ?? "").localeCompare(a.last_updated ?? ""));
  const entries = [];
  for (const interaction of interactions) {
    const anime = await findAnime(interaction.anime_id);
    entries.push({
      anime_id: interaction.anime_id,
      anime_name: anime ? anime.english_title || anime.title : null,
      original_title: anime?.title ?? null,
      your_rating: interaction.rating ?? null,
      watch_status: interaction.watch_status || null,
      episodes_watched: interaction.episodes_watched ?? 0,
      genres: anime?.genres ?? [],
      mal_rating: anime?.score ?? null,
    });
  }
  return {
    app: "Bunime",
    format_version: 2,
    exported_at: new Date().toISOString(),
    profile: user.profile,
    interactions,
    anime: entries,
  };
}

export async function importData(payload: unknown): Promise<number> {
  const data = payload as { interactions?: UserInteraction[]; anime?: { anime_id?: number; your_rating?: number | null; watch_status?: string | null; episodes_watched?: number }[]; profile?: StoredUser["profile"] };
  const user = await currentUser();
  const incoming: UserInteraction[] = data.interactions?.length
    ? data.interactions
    : (data.anime ?? []).filter((entry) => entry.anime_id).map((entry) => ({
      anime_id: entry.anime_id!, watch_status: entry.watch_status || "Plan to Watch", rating: entry.your_rating ?? null, episodes_watched: entry.episodes_watched ?? 0, watched_episodes: [],
    }));
  if (!incoming.length && !data.profile) throw new ApiError("That file does not contain any Bunime data.");
  await updateDb((draft) => {
    const bucket = (draft.interactions[user.id] ??= {});
    for (const interaction of incoming) {
      if (!Number.isFinite(interaction.anime_id)) continue;
      bucket[String(interaction.anime_id)] = { ...interaction, user_id: user.id, id: `${user.id}:${interaction.anime_id}`, last_updated: interaction.last_updated ?? new Date().toISOString() };
    }
    if (data.profile) {
      const target = Object.values(draft.users).find((candidate) => candidate.id === user.id)!;
      target.profile = { ...target.profile, ...data.profile };
      target.profile_updated_at = new Date().toISOString();
    }
  });
  return incoming.length;
}


export async function localRequest(method: string, endpoint: string, body?: unknown): Promise<unknown> {
  const url = new URL(endpoint, "http://local");
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const params = url.searchParams;
  let match: RegExpMatchArray | null;

  if (method === "GET" && path === "/anime") {
    const limit = Number(params.get("limit") ?? 20);
    const skip = Number(params.get("skip") ?? 0);
    const query = params.get("q");
    if (query) {
      const { byGroup } = await loadCatalog();
      const matches = (await searchCatalog(query, 80)).filter((anime) => matchesFilters(anime, params));
      const local = params.get("group") === "1" ? collapseFranchises(matches, byGroup) : matches.map((anime) => withFranchise(anime, byGroup));
      const needle = normalizeText(query);
      const strongLocal = local.some((anime) => normalizeText(`${anime.english_title ?? ""} ${anime.title} ${(anime.synonyms ?? []).join(" ")}`).includes(needle));
      const live = params.get("live");
      if (live === "0" || (live !== "1" && strongLocal && local.length >= Math.min(limit, 3))) return local.slice(skip, skip + limit);
      const { byId } = await loadCatalog();
      const remote = (await searchLive(query, limit))
        .filter((anime) => !local.some((known) => known.anime_id === anime.anime_id))
        .map((anime) => {
          const bundled = byId.get(anime.anime_id);
          return bundled ? withFranchise({ ...bundled, english_title: anime.english_title ?? bundled.english_title, status: anime.status, score: anime.score ?? bundled.score, total_episodes: anime.total_episodes ?? bundled.total_episodes, image_url: anime.image_url || bundled.image_url, media_type: anime.media_type || bundled.media_type, year: anime.year ?? bundled.year }, byGroup) : anime;
        });
      return (strongLocal ? [...local, ...remote] : [...remote, ...local]).slice(skip, skip + limit);
    }
    const { list, byGroup } = await loadCatalog();
    const sort = params.get("sort");
    const filtered = list.filter((anime) => matchesFilters(anime, params) && (anime.members ?? 0) > 30_000);
    filtered.sort(sort === "popular" ? (a, b) => (b.members ?? 0) - (a.members ?? 0) : byScore);
    const rows = params.get("group") === "1" ? collapseFranchises(filtered, byGroup) : filtered.map((anime) => withFranchise(anime, byGroup));
    return rows.slice(skip, skip + limit);
  }

  if (method === "GET" && path === "/anime/groups") {
    const { byGroup } = await loadCatalog();
    const limit = Number(params.get("limit") ?? 30);
    const skip = Number(params.get("skip") ?? 0);
    const groups = [...byGroup.entries()]
      .map(([key, titles]) => {
        const matching = titles.filter((anime) => matchesFilters(anime, params));
        if (!matching.length) return null;
        const lead = [...titles].sort((a, b) => (b.members ?? 0) - (a.members ?? 0))[0];
        return { group_key: key, title: lead.group_title || lead.title, count: titles.length, media_types: [...new Set(titles.map((anime) => anime.media_type || ""))], anime: lead, members: titles.reduce((sum, anime) => sum + (anime.members ?? 0), 0) };
      })
      .filter((group): group is NonNullable<typeof group> => Boolean(group) && (params.get("min_count") ? group!.count >= Number(params.get("min_count")) : true))
      .sort((a, b) => b.members - a.members);
    return groups.slice(skip, skip + limit);
  }

  if (method === "GET" && (match = path.match(/^\/anime\/group\/(.+)$/))) {
    const { byGroup } = await loadCatalog();
    const key = decodeURIComponent(match[1]);
    const titles = [...(byGroup.get(key) ?? [])].sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999) || byScore(a, b));
    if (!titles.length) throw new ApiError("Anime group not found", 404);
    return { group_key: key, title: titles[0].group_title || titles[0].title, titles };
  }

  if (method === "GET" && (match = path.match(/^\/anime\/(\d+)$/))) {
    const animeId = Number(match[1]);
    const anime = (await findAnime(animeId)) ?? (await fetchLiveDetail(animeId));
    if (!anime) throw new ApiError("Anime not found", 404);
    return anime;
  }

  if (method === "GET" && (match = path.match(/^\/recommendations\/anime\/(\d+)$/))) {
    const { byId, similar } = await loadCatalog();
    const limit = Number(params.get("limit") ?? 12);
    return (similar[match[1]] ?? []).map((id) => byId.get(id)).filter(Boolean).slice(0, limit);
  }

  if (method === "POST" && path === "/auth/register") {
    const { username, email, password } = body as { username: string; email: string; password: string };
    const cleanName = (username || "").trim();
    if (cleanName.length < 3) throw new ApiError("Username must be at least 3 characters.");
    if ((password || "").length < 6) throw new ApiError("Password must be at least 6 characters.");
    const db = await loadDb();
    if (db.users[cleanName.toLowerCase()]) throw new ApiError("A user with this username already exists on this device.");
    if ((email || "").trim() && Object.values(db.users).some((user) => user.email.toLowerCase() === email.trim().toLowerCase())) throw new ApiError("A user with this email already exists on this device.");
    const salt = randomId();
    const user: StoredUser = {
      id: randomId(), username: cleanName, email: (email || "").trim(), salt, password_hash: await hashPassword(password, salt),
      created_at: new Date().toISOString(), profile: { preferred_genres: [], favorite_anime_ids: [], github_url: null },
    };
    await updateDb((draft) => { draft.users[cleanName.toLowerCase()] = user; });
    return toUser(user);
  }

  if (method === "POST" && path === "/auth/login") {
    const { username, password } = body as { username: string; password: string };
    const db = await loadDb();
    const user = db.users[(username || "").trim().toLowerCase()];
    if (!user || (await hashPassword(password || "", user.salt)) !== user.password_hash) throw new ApiError("Incorrect username or password");
    await updateDb((draft) => { draft.session = user.id; });
    return { access_token: user.id, token_type: "local" };
  }

  if (method === "POST" && path === "/auth/logout") {
    await updateDb((draft) => { draft.session = null; });
    return null;
  }

  const user = await currentUser();

  if (method === "GET" && path === "/users/me") return toUser(user);

  if (method === "PUT" && path === "/users/me/profile") {
    const profile = body as StoredUser["profile"];
    const updated = await updateDb((draft) => {
      const target = Object.values(draft.users).find((candidate) => candidate.id === user.id)!;
      target.profile = { ...target.profile, ...profile };
      target.profile_updated_at = new Date().toISOString();
    });
    return toUser(Object.values(updated.users).find((candidate) => candidate.id === user.id)!);
  }

  if (method === "GET" && path === "/users/me/interactions") {
    const db = await loadDb();
    return Object.values(db.interactions[user.id] ?? {}).sort((a, b) => (b.last_updated ?? "").localeCompare(a.last_updated ?? ""));
  }

  if (method === "GET" && path === "/users/me/watchlist") {
    const db = await loadDb();
    const { byGroup } = await loadCatalog();
    const interactions = Object.values(db.interactions[user.id] ?? {}).sort((a, b) => (b.last_updated ?? "").localeCompare(a.last_updated ?? ""));
    const rows: Anime[] = [];
    for (const interaction of interactions) {
      const anime = await findAnime(interaction.anime_id);
      const base: Anime = anime ? withFranchise(anime, byGroup) : { anime_id: interaction.anime_id, title: `Anime #${interaction.anime_id}`, genres: [], image_url: "", total_episodes: null, status: "Unknown" };
      rows.push({ ...base, userInteraction: interaction });
    }
    return rows;
  }

  if ((match = path.match(/^\/users\/me\/interactions\/(\d+)$/))) {
    const animeId = Number(match[1]);
    if (method === "PUT") {
      const input = body as UserInteraction;
      if (input.anime_id !== animeId) throw new ApiError("The anime ID in the URL must match the request body.");
      if (input.rating != null && (input.rating < 1 || input.rating > 5)) throw new ApiError("Rating must be between 1 and 5.");
      const saved: UserInteraction = {
        anime_id: animeId,
        watch_status: input.watch_status || "Plan to Watch",
        episodes_watched: Math.max(0, input.episodes_watched ?? 0),
        watched_episodes: input.watched_episodes ?? [],
        rating: input.rating ?? null,
        id: `${user.id}:${animeId}`,
        user_id: user.id,
        last_updated: new Date().toISOString(),
      };
      await updateDb((draft) => {
        (draft.interactions[user.id] ??= {})[String(animeId)] = saved;
        delete draft.tombstones[user.id]?.[String(animeId)];
      });
      void rememberAnime(animeId);
      return saved;
    }
    if (method === "DELETE") {
      const db = await loadDb();
      if (!db.interactions[user.id]?.[String(animeId)]) throw new ApiError("Interaction not found", 404);
      await updateDb((draft) => {
        delete draft.interactions[user.id][String(animeId)];
        (draft.tombstones[user.id] ??= {})[String(animeId)] = new Date().toISOString();
      });
      return null;
    }
  }

  if ((match = path.match(/^\/users\/me\/franchise\/(.+)$/))) {
    const { byGroup } = await loadCatalog();
    const key = decodeURIComponent(match[1]);
    const titles = byGroup.get(key) ?? [];
    if (!titles.length) throw new ApiError("Franchise not found", 404);
    if (method === "PUT") {
      const input = body as { watch_status?: string; rating?: number | null };
      if (input.rating != null && (input.rating < 1 || input.rating > 5)) throw new ApiError("Rating must be between 1 and 5.");
      const now = new Date().toISOString();
      const rows: Anime[] = [];
      await updateDb((draft) => {
        const bucket = (draft.interactions[user.id] ??= {});
        for (const anime of titles) {
          const id = String(anime.anime_id);
          const previous = bucket[id];
          const status = input.watch_status || previous?.watch_status || (input.rating ? "Completed" : "Plan to Watch");
          const total = anime.total_episodes ?? 0;
          const complete = status === "Completed" && total > 0;
          const saved: UserInteraction = {
            anime_id: anime.anime_id,
            watch_status: status,
            rating: input.rating === undefined ? previous?.rating ?? null : input.rating,
            episodes_watched: complete ? total : previous?.episodes_watched ?? 0,
            watched_episodes: complete ? Array.from({ length: total }, (_, index) => `1:${index + 1}`) : previous?.watched_episodes ?? [],
            id: `${user.id}:${anime.anime_id}`,
            user_id: user.id,
            last_updated: now,
          };
          bucket[id] = saved;
          delete draft.tombstones[user.id]?.[id];
          rows.push({ ...withFranchise(anime, byGroup), userInteraction: saved });
        }
      });
      return rows;
    }
    if (method === "DELETE") {
      const now = new Date().toISOString();
      await updateDb((draft) => {
        for (const anime of titles) {
          const id = String(anime.anime_id);
          if (!draft.interactions[user.id]?.[id]) continue;
          delete draft.interactions[user.id][id];
          (draft.tombstones[user.id] ??= {})[id] = now;
        }
      });
      return titles.map((anime) => anime.anime_id);
    }
  }

  if (method === "GET" && path === "/users/me/export") return exportData(user);

  if (method === "GET" && path === "/recommendations/profile") return recommend(user, params);

  throw new ApiError(`Unknown endpoint ${method} ${path}`, 404);
}
