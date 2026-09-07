"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import AnimeCard from "@/components/ui/AnimeCard";
import AnimeSearchCard from "@/components/ui/AnimeSearchCard";
import { WATCH_STATUSES, type UserInteraction } from "@/components/features/InteractionControls";
import { Loader2, RefreshCw, Search, X } from "lucide-react";
import { api } from "@/lib/api";

const statusTabs = ["All", ...WATCH_STATUSES];
const ratingFilters = ["All", 1, 2, 3, 4, 5] as const;
const mediaFilters = ["All", "Series", "Movies"] as const;
const demographicFilters = ["All", "Shounen", "Seinen", "Shoujo", "Josei"] as const;
const themeFilters = ["All", "Isekai", "School", "Military", "Psychological"] as const;
const genreFilters = ["All", "Action", "Adventure", "Comedy", "Drama", "Fantasy", "Romance", "Sci-Fi", "Slice of Life", "Thriller"];
const CATALOG_PAGE_SIZE = 60;

type Anime = {
  id: string;
  anime_id: number;
  title: string;
  english_title?: string | null;
  synopsis?: string;
  image_url: string;
  genres: string[];
  total_episodes: number | null;
  status: string;
  media_type?: string | null;
  demographics?: string[];
  themes?: string[];
  score?: number | null;
  userInteraction?: UserInteraction;
};

const displayTitle = (anime: Anime) => anime.english_title || anime.title;
const matchesMedia = (anime: Anime, filter: string) => filter === "All"
  || (filter === "Movies" ? anime.media_type === "MOVIE" : anime.media_type !== "MOVIE");
const matchesDemographic = (anime: Anime, filter: string) => filter === "All" || (anime.demographics || []).includes(filter);
const matchesTheme = (anime: Anime, filter: string) => filter === "All" || (anime.themes || []).includes(filter);

export default function DashboardPage() {
  return <Suspense fallback={<div className="empty-state"><Loader2 className="w-8 h-8 animate-spin" /> Loading your anime...</div>}><Dashboard /></Suspense>;
}

function Dashboard() {
  const searchParams = useSearchParams();
  const view = searchParams.get("view") || "dashboard";
  const [activeStatus, setActiveStatus] = useState("All");
  const [ratingFilter, setRatingFilter] = useState<(typeof ratingFilters)[number]>("All");
  const [mediaFilter, setMediaFilter] = useState<(typeof mediaFilters)[number]>("All");
  const [demographicFilter, setDemographicFilter] = useState<(typeof demographicFilters)[number]>("All");
  const [themeFilter, setThemeFilter] = useState<(typeof themeFilters)[number]>("All");
  const [recommendationMedia, setRecommendationMedia] = useState<(typeof mediaFilters)[number]>("All");
  const [recommendationDemographic, setRecommendationDemographic] = useState<(typeof demographicFilters)[number]>("All");
  const [recommendationTheme, setRecommendationTheme] = useState<(typeof themeFilters)[number]>("All");
  const [recommendationGenre, setRecommendationGenre] = useState("All");
  const [seedQuery, setSeedQuery] = useState("");
  const [seedResults, setSeedResults] = useState<Anime[]>([]);
  const [selectedSeeds, setSelectedSeeds] = useState<Anime[]>([]);
  const [dismissedRecommendationIds, setDismissedRecommendationIds] = useState<number[]>([]);
  const [dismissedBrowseIds, setDismissedBrowseIds] = useState<number[]>([]);
  const [recommendationSearchKey, setRecommendationSearchKey] = useState("");
  const [recommendationOffset, setRecommendationOffset] = useState(0);
  const [recommendations, setRecommendations] = useState<Anime[]>([]);
  const [catalog, setCatalog] = useState<Anime[]>([]);
  const [watchlist, setWatchlist] = useState<Anime[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreCatalog, setHasMoreCatalog] = useState(true);
  const [error, setError] = useState("");

  const fetchData = useCallback(async (refresh = false) => {
    if (refresh) setIsRefreshing(true);
    setError("");
    try {
      const [recs, catalogAnime, savedAnime] = await Promise.all([
        api.get("/recommendations/profile?limit=10"),
        api.get(`/anime/?limit=${CATALOG_PAGE_SIZE}`),
        api.get("/users/me/watchlist"),
      ]);
      setRecommendations(recs);
      setRecommendationSearchKey("limit=10");
      setCatalog(catalogAnime);
      setWatchlist(savedAnime);
      setHasMoreCatalog(catalogAnime.length === CATALOG_PAGE_SIZE);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load dashboard data. Please try again.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => { void fetchData(); }, [fetchData]);
  useEffect(() => { setDismissedBrowseIds([]); }, [mediaFilter, demographicFilter, themeFilter]);

  const interactionByAnime = useMemo(
    () => new Map(watchlist.filter((anime) => anime.userInteraction).map((anime) => [anime.anime_id, anime.userInteraction!])),
    [watchlist],
  );

  const addInteraction = useCallback((animeId: number, interaction: UserInteraction) => {
    setWatchlist((current) => {
      const existing = current.find((anime) => anime.anime_id === animeId);
      if (existing) return current.map((anime) => anime.anime_id === animeId ? { ...anime, userInteraction: interaction } : anime);
      const source = [...recommendations, ...catalog, ...selectedSeeds].find((anime) => anime.anime_id === animeId);
      return source && source.anime_id === animeId ? [{ ...source, userInteraction: interaction }, ...current] : current;
    });
  }, [catalog, recommendations, selectedSeeds]);

  const clearInteraction = useCallback((animeId: number) => {
    setWatchlist((current) => current.filter((anime) => anime.anime_id !== animeId));
  }, []);

  const attachInteraction = useCallback((anime: Anime): Anime => ({ ...anime, userInteraction: interactionByAnime.get(anime.anime_id) }), [interactionByAnime]);

  const filteredWatchlist = useMemo(() => watchlist.filter((anime) =>
    (activeStatus === "All" || anime.userInteraction?.watch_status === activeStatus)
    && (ratingFilter === "All" || anime.userInteraction?.rating === ratingFilter)
    && matchesMedia(anime, mediaFilter) && matchesDemographic(anime, demographicFilter) && matchesTheme(anime, themeFilter),
  ), [activeStatus, demographicFilter, mediaFilter, ratingFilter, themeFilter, watchlist]);
  const visibleCatalog = useMemo(() => catalog.filter((anime) => matchesMedia(anime, mediaFilter) && matchesDemographic(anime, demographicFilter) && matchesTheme(anime, themeFilter)), [catalog, demographicFilter, mediaFilter, themeFilter]);
  const visibleRecommendations = useMemo(() => recommendations.filter((anime) =>
    matchesMedia(anime, recommendationMedia)
    && matchesDemographic(anime, recommendationDemographic)
    && matchesTheme(anime, recommendationTheme)
    && !dismissedRecommendationIds.includes(anime.anime_id),
  ), [dismissedRecommendationIds, recommendations, recommendationDemographic, recommendationMedia, recommendationTheme]);
  const discoveryCatalog = useMemo(() => visibleCatalog.filter((anime) => {
    const interaction = interactionByAnime.get(anime.anime_id);
    return (!interaction || interaction.rating == null) && !dismissedBrowseIds.includes(anime.anime_id);
  }), [dismissedBrowseIds, interactionByAnime, visibleCatalog]);

  const loadRecommendations = async () => {
    setIsRefreshing(true);
    try {
      const params = new URLSearchParams({ limit: "10" });
      if (recommendationGenre !== "All") params.set("genre", recommendationGenre === "Thriller" ? "Suspense" : recommendationGenre);
      if (recommendationMedia === "Movies") params.set("media_type", "MOVIE");
      if (recommendationMedia === "Series") params.set("media_type", "TV");
      if (recommendationDemographic !== "All") params.set("demographic", recommendationDemographic);
      if (recommendationTheme !== "All") params.set("theme", recommendationTheme);
      if (selectedSeeds.length) params.set("seed_ids", selectedSeeds.map((anime) => anime.anime_id).join(","));
      const baseSearchKey = params.toString();
      const isNewSearch = baseSearchKey !== recommendationSearchKey;
      const nextOffset = isNewSearch ? 0 : recommendationOffset + 10;
      if (isNewSearch) {
        setDismissedRecommendationIds([]);
      }
      setRecommendationSearchKey(baseSearchKey);
      setRecommendationOffset(nextOffset);
      if (nextOffset) params.set("skip", String(nextOffset));
      if (dismissedRecommendationIds.length && !isNewSearch) params.set("exclude_ids", dismissedRecommendationIds.join(","));
      setRecommendations(await api.get(`/recommendations/profile?${params.toString()}`));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not update recommendations.");
    } finally {
      setIsRefreshing(false);
    }
  };

  const searchSeeds = async (query: string) => {
    setSeedQuery(query);
    if (query.trim().length < 2) return setSeedResults([]);
    try {
      setSeedResults(await api.get(`/anime/?q=${encodeURIComponent(query.trim())}&limit=6`));
    } catch { setSeedResults([]); }
  };

  const loadMoreCatalog = async () => {
    setIsLoadingMore(true);
    try {
      const nextPage: Anime[] = await api.get(`/anime/?limit=${CATALOG_PAGE_SIZE}&skip=${catalog.length}`);
      setCatalog((current) => [...current, ...nextPage.filter((anime) => !current.some((known) => known.anime_id === anime.anime_id))]);
      setHasMoreCatalog(nextPage.length === CATALOG_PAGE_SIZE);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load more anime.");
    } finally { setIsLoadingMore(false); }
  };

  if (isLoading) return <div className="empty-state"><Loader2 className="w-8 h-8 animate-spin" /> Loading your anime...</div>;
  if (error && !catalog.length) return <div className="empty-state"><div className="auth-error">{error}</div><button className="quiet-button" onClick={() => void fetchData()}>Try again</button></div>;

  const isListView = view === "list";
  const isRecommendationsView = view === "recommendations";
  const mediaTabs = (value: string, onChange: (filter: (typeof mediaFilters)[number]) => void) => (
    <div className="filter-row media-filter-row" role="tablist" aria-label="Filter by anime type">
      {mediaFilters.map((filter) => <button key={filter} role="tab" aria-selected={value === filter} className={`filter-button ${value === filter ? "active" : ""}`} onClick={() => onChange(filter)}>{filter}</button>)}
    </div>
  );
  const demographicTabs = (value: string, onChange: (filter: (typeof demographicFilters)[number]) => void) => (
    <div className="filter-row media-filter-row" role="tablist" aria-label="Filter by audience demographic">
      {demographicFilters.map((filter) => <button key={filter} role="tab" aria-selected={value === filter} className={`filter-button ${value === filter ? "active" : ""}`} onClick={() => onChange(filter)}>{filter}</button>)}
    </div>
  );
  const themeTabs = (value: string, onChange: (filter: (typeof themeFilters)[number]) => void) => (
    <div className="filter-row media-filter-row" role="tablist" aria-label="Filter by anime theme">
      {themeFilters.map((filter) => <button key={filter} role="tab" aria-selected={value === filter} className={`filter-button ${value === filter ? "active" : ""}`} onClick={() => onChange(filter)}>{filter}</button>)}
    </div>
  );

  return (
    <div className="dash-stack">
      {error && <p className="page-error" role="alert">{error}</p>}
      {isRecommendationsView && <section>
        <div className="section-heading"><div><h2>Recommendations</h2><span>Only unseen titles, tailored to your ratings and discovery filters</span></div><button className="quiet-button" onClick={() => void loadRecommendations()} disabled={isRefreshing}><RefreshCw size={14} className={isRefreshing ? "animate-spin" : ""} /> Refresh</button></div>
        <div className="recommendation-controls">
          <div><span className="interaction-label">Genre</span><div className="filter-row">{genreFilters.map((genre) => <button key={genre} className={`filter-button ${recommendationGenre === genre ? "active" : ""}`} onClick={() => setRecommendationGenre(genre)}>{genre}</button>)}</div></div>
          {mediaTabs(recommendationMedia, setRecommendationMedia)}
          {demographicTabs(recommendationDemographic, setRecommendationDemographic)}
          {themeTabs(recommendationTheme, setRecommendationTheme)}
          <div className="seed-search"><span className="interaction-label">Base recommendations on these titles</span><div className="seed-search-box"><Search size={15} /><input value={seedQuery} placeholder="Search and add anime..." onChange={(event) => void searchSeeds(event.target.value)} /></div>{seedResults.length > 0 && <div className="search-card-results">{seedResults.map((anime) => <AnimeSearchCard key={anime.anime_id} anime={anime} onSelect={() => { if (!selectedSeeds.some((seed) => seed.anime_id === anime.anime_id)) setSelectedSeeds((current) => [...current, anime]); setSeedQuery(""); setSeedResults([]); }} />)}</div>}</div>
          {selectedSeeds.length > 0 && <div className="selected-anime-cards">{selectedSeeds.map((anime) => <AnimeSearchCard key={anime.anime_id} anime={anime} actionLabel="Remove" onSelect={() => setSelectedSeeds((current) => current.filter((seed) => seed.anime_id !== anime.anime_id))} />)}</div>}
          <button className="solid-button" onClick={() => void loadRecommendations()}>Find recommendations</button>
        </div>
        <p className="recommendation-hint">Tip: double-right-click a title to hide it for this recommendation search. This does not affect your watchlist or rating.</p>
        <div className="anime-grid">{visibleRecommendations.length ? visibleRecommendations.map((anime) => <AnimeCard key={anime.anime_id} anime={attachInteraction(anime)} onInteractionSaved={addInteraction} onInteractionCleared={clearInteraction} onDoubleRightClick={(animeId) => setDismissedRecommendationIds((current) => [...current, animeId])} />) : <div className="empty-state">Choose a genre or add a title to discover unseen anime.</div>}</div>
      </section>}

      {isListView && <section>
        <div className="section-heading"><div><h2>My Watchlist</h2><span>Your saved titles, organised by status</span></div></div>
        <div className="filter-row">{statusTabs.map((tab) => <button key={tab} className={`filter-button ${activeStatus === tab ? "active" : ""}`} onClick={() => setActiveStatus(tab)}>{tab}{tab === "All" ? ` (${watchlist.length})` : ""}</button>)}</div>
        <div className="filter-row media-filter-row" role="tablist" aria-label="Filter by your star rating">{ratingFilters.map((rating) => <button key={rating} role="tab" aria-selected={ratingFilter === rating} className={`filter-button ${ratingFilter === rating ? "active" : ""}`} onClick={() => setRatingFilter(rating)}>{rating === "All" ? "All ratings" : `${"★".repeat(rating)} ${rating}`}</button>)}</div>
        {mediaTabs(mediaFilter, setMediaFilter)}
        {demographicTabs(demographicFilter, setDemographicFilter)}
        {themeTabs(themeFilter, setThemeFilter)}
        <div className="anime-grid">{filteredWatchlist.length ? filteredWatchlist.map((anime) => <AnimeCard key={anime.anime_id} anime={anime} onInteractionSaved={addInteraction} onInteractionCleared={clearInteraction} />) : <div className="empty-state"><p>No saved anime in this category yet.</p><Link className="quiet-button" href="/dashboard">Browse anime</Link></div>}</div>
      </section>}

      {!isListView && !isRecommendationsView && <section>
        <div className="section-heading"><div><h2>Browse Anime</h2><span>Explore the catalog and add any title to your list</span></div></div>
        {mediaTabs(mediaFilter, setMediaFilter)}
        {demographicTabs(demographicFilter, setDemographicFilter)}
        {themeTabs(themeFilter, setThemeFilter)}
        <div className="section-heading discovery-heading"><div><h3>Unrated discoveries</h3><span>Titles you have not rated yet—mark the ones you have seen.</span></div></div>
        <p className="recommendation-hint">Tip: double-right-click a title to hide it from this browse filter. It will not change your watchlist or rating.</p>
        <div className="anime-grid">{discoveryCatalog.map((anime) => <AnimeCard key={anime.anime_id} anime={attachInteraction(anime)} onInteractionSaved={addInteraction} onInteractionCleared={clearInteraction} onDoubleRightClick={(animeId) => setDismissedBrowseIds((current) => current.includes(animeId) ? current : [...current, animeId])} />)}</div>
        {hasMoreCatalog && <div className="load-more-row"><button className="quiet-button" onClick={() => void loadMoreCatalog()} disabled={isLoadingMore}>{isLoadingMore ? <><Loader2 size={14} className="animate-spin" /> Loading...</> : "Load more anime"}</button></div>}
      </section>}
    </div>
  );
}
