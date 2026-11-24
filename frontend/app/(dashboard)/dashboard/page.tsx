"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Layers, LayoutGrid, Loader2, Play, RefreshCw, Search, Wand2 } from "lucide-react";
import AnimeCard from "@/components/ui/AnimeCard";
import AnimeSearchCard from "@/components/ui/AnimeSearchCard";
import AnimeGroupCard, { type AnimeGroup } from "@/components/ui/AnimeGroupCard";
import PosterMarquee from "@/components/ui/PosterMarquee";
import { WATCH_STATUSES } from "@/components/features/InteractionControls";
import { api } from "@/lib/api";
import { fetchSeasonNow } from "@/lib/catalog";
import { DEFAULT_COVER } from "@/lib/basePath";
import { displayTitle, type Anime, type UserInteraction } from "@/lib/types";

const MEDIA = ["All", "Series", "Movies"] as const;
const DEMOGRAPHICS = ["All", "Shounen", "Seinen", "Shoujo", "Josei"] as const;
const THEMES = ["All", "Isekai", "School", "Military", "Psychological", "Mecha", "Super Power", "Time Travel", "Gore"] as const;
const GENRES = ["All", "Action", "Adventure", "Comedy", "Drama", "Fantasy", "Romance", "Sci-Fi", "Slice of Life", "Mystery", "Thriller", "Sports", "Supernatural", "Horror"];
const PAGE = 36;

type Filters = { media: string; genre: string; demographic: string; theme: string };
const EMPTY_FILTERS: Filters = { media: "All", genre: "All", demographic: "All", theme: "All" };

function filterParams(filters: Filters) {
  const params = new URLSearchParams();
  if (filters.media === "Movies") params.set("media_type", "MOVIE");
  if (filters.media === "Series") params.set("media_type", "TV");
  if (filters.genre !== "All") params.set("genre", filters.genre);
  if (filters.demographic !== "All") params.set("demographic", filters.demographic);
  if (filters.theme !== "All") params.set("theme", filters.theme);
  return params;
}

function ChipGroup({ label, options, value, onChange }: { label: string; options: readonly string[]; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <span className="filter-label">{label}</span>
      <div className="chip-row" role="group" aria-label={label}>
        {options.map((option) => <button key={option} type="button" className={`chip ${value === option ? "active" : ""}`} aria-pressed={value === option} onClick={() => onChange(option)}>{option}</button>)}
      </div>
    </div>
  );
}

function FilterPanel({ filters, onChange, showGenre = true }: { filters: Filters; onChange: (filters: Filters) => void; showGenre?: boolean }) {
  return (
    <div className="filters panel">
      <ChipGroup label="Format" options={MEDIA} value={filters.media} onChange={(media) => onChange({ ...filters, media })} />
      {showGenre && <ChipGroup label="Genre" options={GENRES} value={filters.genre} onChange={(genre) => onChange({ ...filters, genre })} />}
      <ChipGroup label="Audience" options={DEMOGRAPHICS} value={filters.demographic} onChange={(demographic) => onChange({ ...filters, demographic })} />
      <ChipGroup label="Theme" options={THEMES} value={filters.theme} onChange={(theme) => onChange({ ...filters, theme })} />
    </div>
  );
}

export default function DashboardPage() {
  return <Suspense fallback={<div className="center-state"><Loader2 size={30} className="spin" /></div>}><Dashboard /></Suspense>;
}

function Dashboard() {
  const view = useSearchParams().get("view") || "home";
  const [watchlist, setWatchlist] = useState<Anime[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  const loadWatchlist = useCallback(async () => {
    try {
      setWatchlist(await api.get("/users/me/watchlist"));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load your list.");
    } finally { setLoaded(true); }
  }, []);
  useEffect(() => { void loadWatchlist(); }, [loadWatchlist]);

  const interactions = useMemo(() => new Map(watchlist.map((anime) => [anime.anime_id, anime.userInteraction!])), [watchlist]);
  const attach = useCallback((anime: Anime): Anime => ({ ...anime, userInteraction: interactions.get(anime.anime_id) }), [interactions]);

  const onSaved = useCallback((anime: Anime) => (animeId: number, interaction: UserInteraction) => {
    setWatchlist((current) => current.some((item) => item.anime_id === animeId)
      ? current.map((item) => item.anime_id === animeId ? { ...item, userInteraction: interaction } : item)
      : [{ ...anime, userInteraction: interaction }, ...current]);
  }, []);
  const onCleared = useCallback((animeId: number) => setWatchlist((current) => current.filter((item) => item.anime_id !== animeId)), []);
  const onFranchiseSaved = useCallback((rows: Anime[]) => setWatchlist((current) => {
    const updated = new Map(rows.map((row) => [row.anime_id, row]));
    const kept = current.map((item) => updated.has(item.anime_id) ? { ...item, userInteraction: updated.get(item.anime_id)!.userInteraction } : item);
    const added = rows.filter((row) => !current.some((item) => item.anime_id === row.anime_id));
    return [...added, ...kept];
  }), []);
  const onFranchiseCleared = useCallback((ids: number[]) => setWatchlist((current) => current.filter((item) => !ids.includes(item.anime_id))), []);
  const card = (anime: Anime, onHide?: (id: number) => void, asFranchise = true) => (
    <AnimeCard
      key={anime.group_key && asFranchise ? `g:${anime.group_key}` : anime.anime_id}
      anime={attach(anime)}
      onInteractionSaved={onSaved(anime)}
      onInteractionCleared={onCleared}
      onHide={onHide}
      franchise={asFranchise && anime.franchise_ids ? {
        saved: anime.franchise_ids.map((id) => interactions.get(id)).filter((item): item is UserInteraction => Boolean(item)),
        onSaved: onFranchiseSaved,
        onCleared: onFranchiseCleared,
      } : undefined}
    />
  );

  if (!loaded) return <div className="center-state"><Loader2 size={30} className="spin" /> Loading your list</div>;

  return (
    <div className="stack">
      {error && <p className="notice" role="alert">{error}</p>}
      {view === "home" && <HomeView watchlist={watchlist} card={card} />}
      {view === "browse" && <BrowseView card={card} />}
      {view === "list" && <ListView watchlist={watchlist} card={card} />}
      {view === "recommendations" && <RecommendationsView card={card} />}
    </div>
  );
}

type CardRenderer = (anime: Anime, onHide?: (id: number) => void, asFranchise?: boolean) => React.ReactNode;

function HomeView({ watchlist, card }: { watchlist: Anime[]; card: CardRenderer }) {
  const [spotlight, setSpotlight] = useState<Anime[]>([]);
  const [slide, setSlide] = useState(0);
  const [top, setTop] = useState<Anime[]>([]);
  const [picks, setPicks] = useState<Anime[]>([]);
  const [franchises, setFranchises] = useState<AnimeGroup[]>([]);

  useEffect(() => {
    void api.get("/anime/?limit=20&group=1").then(setTop).catch(() => setTop([]));
    void api.get("/recommendations/profile?limit=8").then(setPicks).catch(() => setPicks([]));
    void api.get("/anime/groups?limit=12&min_count=4").then(setFranchises).catch(() => setFranchises([]));
    let live = false;
    void api.get("/anime/?limit=6&sort=popular&group=1").then((popular) => { if (!live) setSpotlight(popular); }).catch(() => undefined);
    void fetchSeasonNow(12).then((season) => {
      const usable = season.filter((anime) => anime.synopsis && anime.image_url).slice(0, 6);
      if (usable.length) { live = true; setSlide(0); setSpotlight(usable); }
    }).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (spotlight.length < 2) return;
    const timer = setInterval(() => setSlide((index) => (index + 1) % spotlight.length), 7000);
    return () => clearInterval(timer);
  }, [spotlight.length]);

  const hero = spotlight[slide];
  const watching = watchlist.filter((anime) => anime.userInteraction?.watch_status === "Watching");

  return (
    <>
      <section className="hero" aria-label="Spotlight">
        <div className="hero-a">{hero && <img src={hero.image_url || DEFAULT_COVER} alt="" />}</div>
        <div className="hero-b">
          <small>{hero && /currently airing/i.test(hero.status) ? "Airing this season" : "A fan favourite"}</small>
          <h1>{hero ? displayTitle(hero) : "Loading the spotlight"}</h1>
          {spotlight.length > 1 && <div className="hero-dots">{spotlight.map((anime, index) => <button key={anime.anime_id} type="button" aria-label={`Show ${displayTitle(anime)}`} aria-pressed={index === slide} className={index === slide ? "active" : ""} onClick={() => setSlide(index)} />)}</div>}
        </div>
        <div className="hero-c">
          {hero && <div className="hero-meta">
            <span className="tag">{hero.media_type === "TV" ? "Series" : hero.media_type}</span>
            {hero.total_episodes && <span className="tag">{hero.total_episodes} episodes</span>}
            {hero.genres.slice(0, 3).map((genre) => <span key={genre} className="tag cyan">{genre}</span>)}
          </div>}
          <p className="hero-synopsis">{hero?.synopsis}</p>
          <div className="hero-actions">
            {hero && <Link className="btn btn-hot" href={`/anime/?id=${hero.anime_id}`}><Play size={16} fill="currentColor" /> Open {hero.media_type === "MOVIE" ? "film" : "series"}</Link>}
            <Link className="btn btn-ghost" href="/dashboard/?view=recommendations"><Wand2 size={16} /> Find something like it</Link>
          </div>
        </div>
        <div className="hero-d">
          {hero && <img src={hero.image_url || DEFAULT_COVER} alt="" />}
          {hero?.score && <span className="score-stamp">{hero.score.toFixed(2)}<small>MAL score</small></span>}
        </div>
      </section>

      {watching.length > 0 && <section>
        <div className="section-head"><div><h2>Continue watching</h2></div><Link className="btn btn-ghost btn-sm" href="/dashboard/?view=list">Open my list</Link></div>
        <div className="grid">{watching.slice(0, 6).map((anime) => card(anime, undefined, false))}</div>
      </section>}

      <section>
        <div className="section-head"><div><h2>Top 20 of all time</h2><p>Ranked by MyAnimeList score.</p></div><Link className="btn btn-ghost btn-sm" href="/dashboard/?view=browse">Browse everything</Link></div>
        <PosterMarquee items={top} ranked />
      </section>

      <section>
        <div className="section-head"><div><h2>Picked for you</h2><p>Rate a few titles and these get sharper.</p></div><Link className="btn btn-ghost btn-sm" href="/dashboard/?view=recommendations">See more picks</Link></div>
        <div className="grid">{picks.map((anime) => card(anime))}</div>
      </section>

      <section>
        <div className="section-head"><div><h2>Franchises</h2><p>Every season, film and OVA of a series, in one place.</p></div><Link className="btn btn-ghost btn-sm" href="/dashboard/?view=browse&group=1">All franchises</Link></div>
        <div className="grid">{franchises.map((group) => <AnimeGroupCard key={group.group_key} group={group} />)}</div>
      </section>
    </>
  );
}

function BrowseView({ card }: { card: CardRenderer }) {
  const startGrouped = useSearchParams().get("group") === "1";
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<"score" | "popular">("score");
  const [grouped, setGrouped] = useState(startGrouped);
  const [items, setItems] = useState<Anime[]>([]);
  const [groups, setGroups] = useState<AnimeGroup[]>([]);
  const [hidden, setHidden] = useState<number[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (reset: boolean) => {
    setLoading(true);
    const params = filterParams(filters);
    params.set("limit", String(PAGE));
    try {
      if (grouped) {
        params.set("skip", String(reset ? 0 : groups.length));
        const page: AnimeGroup[] = await api.get(`/anime/groups?${params}`);
        setGroups((current) => reset ? page : [...current, ...page]);
        setHasMore(page.length === PAGE);
      } else {
        params.set("skip", String(reset ? 0 : items.length));
        params.set("group", "1");
        if (sort === "popular") params.set("sort", "popular");
        const page: Anime[] = await api.get(`/anime/?${params}`);
        setItems((current) => reset ? page : [...current, ...page.filter((anime) => !current.some((known) => known.anime_id === anime.anime_id))]);
        setHasMore(page.length === PAGE);
      }
    } finally { setLoading(false); }
  }, [filters, grouped, groups.length, items.length, sort]);

  useEffect(() => { setHidden([]); void load(true); }, [filters, grouped, sort]);

  const visible = items.filter((anime) => !hidden.includes(anime.anime_id));
  return (
    <section>
      <div className="section-head">
        <div><h2>Browse anime</h2><p>The 6,000 most-watched titles, one card per franchise. Rate or mark a whole franchise at once, or open it to handle seasons one by one.</p></div>
        <div className="toolbar">
          <div className="chip-row" role="group" aria-label="View">
            <button type="button" className={`chip ${!grouped ? "active" : ""}`} onClick={() => setGrouped(false)}><LayoutGrid size={13} style={{ verticalAlign: "-2px" }} /> Titles</button>
            <button type="button" className={`chip ${grouped ? "active" : ""}`} onClick={() => setGrouped(true)}><Layers size={13} style={{ verticalAlign: "-2px" }} /> Franchises</button>
          </div>
          {!grouped && <div className="chip-row" role="group" aria-label="Sort">
            <button type="button" className={`chip ${sort === "score" ? "active" : ""}`} onClick={() => setSort("score")}>Top rated</button>
            <button type="button" className={`chip ${sort === "popular" ? "active" : ""}`} onClick={() => setSort("popular")}>Most popular</button>
          </div>}
        </div>
      </div>
      <FilterPanel filters={filters} onChange={setFilters} />
      <div className="grid">
        {grouped ? groups.map((group) => <AnimeGroupCard key={group.group_key} group={group} />) : visible.map((anime) => card(anime, (id) => setHidden((current) => [...current, id])))}
        {!loading && !(grouped ? groups.length : visible.length) && <div className="empty">Nothing matches these filters. Remove one to see more.</div>}
      </div>
      {hasMore && <div style={{ display: "flex", justifyContent: "center", marginTop: "1.5rem" }}><button type="button" className="btn btn-ghost" disabled={loading} onClick={() => void load(false)}>{loading ? <><Loader2 size={16} className="spin" /> Loading</> : "Show more"}</button></div>}
    </section>
  );
}

function ListView({ watchlist, card }: { watchlist: Anime[]; card: CardRenderer }) {
  const [grouped, setGrouped] = useState(true);
  const [status, setStatus] = useState("All");
  const [rating, setRating] = useState("All");
  const [media, setMedia] = useState("All");
  const [query, setQuery] = useState("");

  const stats = useMemo(() => {
    const rated = watchlist.filter((anime) => anime.userInteraction?.rating);
    const episodes = watchlist.reduce((sum, anime) => sum + (anime.userInteraction?.watch_status === "Completed" ? anime.total_episodes ?? anime.userInteraction?.episodes_watched ?? 0 : anime.userInteraction?.episodes_watched ?? 0), 0);
    return {
      total: watchlist.length,
      completed: watchlist.filter((anime) => anime.userInteraction?.watch_status === "Completed").length,
      episodes,
      hours: Math.round((episodes * 24) / 60),
      average: rated.length ? (rated.reduce((sum, anime) => sum + (anime.userInteraction!.rating ?? 0), 0) / rated.length).toFixed(1) : "–",
    };
  }, [watchlist]);

  const needle = query.trim().toLowerCase();
  const filtered = watchlist.filter((anime) =>
    (status === "All" || anime.userInteraction?.watch_status === status)
    && (rating === "All" || anime.userInteraction?.rating === Number(rating[0]))
    && (media === "All" || (media === "Movies" ? anime.media_type === "MOVIE" : anime.media_type !== "MOVIE"))
    && (!needle || `${anime.title} ${anime.english_title ?? ""}`.toLowerCase().includes(needle)));

  const visible = grouped
    ? filtered.filter((anime, index) => !anime.group_key || filtered.findIndex((other) => other.group_key === anime.group_key) === index)
    : filtered;

  const counts = (value: string) => value === "All" ? watchlist.length : watchlist.filter((anime) => anime.userInteraction?.watch_status === value).length;

  return (
    <section>
      <div className="section-head"><div><h2>My list</h2></div></div>
      <div className="stats" style={{ marginBottom: "1.25rem" }}>
        <div className="stat"><b>{stats.total}</b><span>Titles saved</span></div>
        <div className="stat"><b>{stats.completed}</b><span>Completed</span></div>
        <div className="stat"><b>{stats.episodes.toLocaleString()}</b><span>Episodes, about {stats.hours} hours</span></div>
        <div className="stat"><b>{stats.average}</b><span>Avg. your rating</span></div>
      </div>
      <div className="filters panel">
        <div className="input-wrap"><Search size={16} /><input type="search" placeholder="Search your list…" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        <div className="chip-row" role="group" aria-label="View">
          <button type="button" className={`chip ${grouped ? "active" : ""}`} onClick={() => setGrouped(true)}><Layers size={13} style={{ verticalAlign: "-2px" }} /> Franchises</button>
          <button type="button" className={`chip ${!grouped ? "active" : ""}`} onClick={() => setGrouped(false)}><LayoutGrid size={13} style={{ verticalAlign: "-2px" }} /> Every title</button>
        </div>
        <div className="chip-row" role="group" aria-label="Status">
          {["All", ...WATCH_STATUSES].map((value) => <button key={value} type="button" className={`chip ${status === value ? "active" : ""}`} onClick={() => setStatus(value)}>{value} ({counts(value)})</button>)}
        </div>
        <div className="chip-row" role="group" aria-label="Rating">
          {["All", "5★", "4★", "3★", "2★", "1★"].map((value) => <button key={value} type="button" className={`chip ${rating === value ? "active" : ""}`} onClick={() => setRating(value)}>{value === "All" ? "Any rating" : value}</button>)}
          {MEDIA.map((value) => <button key={value} type="button" className={`chip ${media === value ? "active" : ""}`} onClick={() => setMedia(value)}>{value === "All" ? "All formats" : value}</button>)}
        </div>
      </div>
      <div className="grid">
        {visible.map((anime) => card(anime, undefined, grouped))}
        {!visible.length && <div className="empty"><p style={{ margin: 0 }}>{watchlist.length ? "No saved anime match these filters." : "Your list is empty. Add titles from Browse or the search bar."}</p><Link className="btn btn-hot" href="/dashboard/?view=browse">Browse anime</Link></div>}
      </div>
    </section>
  );
}

function RecommendationsView({ card }: { card: CardRenderer }) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [seeds, setSeeds] = useState<Anime[]>([]);
  const [seedQuery, setSeedQuery] = useState("");
  const [seedResults, setSeedResults] = useState<Anime[]>([]);
  const [results, setResults] = useState<Anime[]>([]);
  const [hidden, setHidden] = useState<number[]>([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);

  const run = useCallback(async (nextOffset: number) => {
    setLoading(true);
    const params = filterParams(filters);
    params.set("limit", "12");
    params.set("skip", String(nextOffset));
    if (seeds.length) params.set("seed_ids", seeds.map((anime) => anime.anime_id).join(","));
    if (hidden.length) params.set("exclude_ids", hidden.join(","));
    try {
      setResults(await api.get(`/recommendations/profile?${params}`));
      setOffset(nextOffset);
    } finally { setLoading(false); }
  }, [filters, hidden, seeds]);

  useEffect(() => { void run(0); }, [filters, seeds]);

  useEffect(() => {
    const term = seedQuery.trim();
    if (term.length < 2) { setSeedResults([]); return; }
    const timer = setTimeout(() => { api.get(`/anime/?q=${encodeURIComponent(term)}&limit=6&group=1`).then(setSeedResults).catch(() => setSeedResults([])); }, 220);
    return () => clearTimeout(timer);
  }, [seedQuery]);

  return (
    <section>
      <div className="section-head">
        <div><h2>For you</h2><p>Titles you haven’t saved yet, ranked from your ratings, your favourites and any anime you add below.</p></div>
        <button type="button" className="btn btn-hot" disabled={loading} onClick={() => void run(offset + 12)}><RefreshCw size={16} className={loading ? "spin" : ""} /> Show the next 12</button>
      </div>
      <div className="filters panel">
        <div className="search-drop">
          <span className="filter-label">Base picks on specific anime</span>
          <div className="input-wrap" style={{ marginTop: "0.35rem" }}><Search size={16} /><input type="search" value={seedQuery} placeholder="Search for an anime you love" onChange={(event) => setSeedQuery(event.target.value)} /></div>
          {seedResults.length > 0 && <div className="mini-list">{seedResults.map((anime) => <AnimeSearchCard key={anime.anime_id} anime={anime} onSelect={() => { if (!seeds.some((seed) => seed.anime_id === anime.anime_id)) setSeeds((current) => [...current, anime]); setSeedQuery(""); }} />)}</div>}
          {seeds.length > 0 && <div className="mini-list">{seeds.map((anime) => <AnimeSearchCard key={anime.anime_id} anime={anime} actionLabel="Remove" onSelect={() => setSeeds((current) => current.filter((seed) => seed.anime_id !== anime.anime_id))} />)}</div>}
        </div>
      </div>
      <FilterPanel filters={filters} onChange={setFilters} />
      <div className="grid">
        {results.filter((anime) => !hidden.includes(anime.anime_id)).map((anime) => card(anime, (id) => setHidden((current) => [...current, id])))}
        {!loading && !results.length && <div className="empty">No new matches for these filters. Remove one to see more.</div>}
      </div>
    </section>
  );
}
