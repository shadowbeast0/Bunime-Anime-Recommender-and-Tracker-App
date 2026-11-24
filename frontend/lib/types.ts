export type UserInteraction = {
  anime_id: number;
  watch_status: string;
  episodes_watched?: number;
  watched_episodes?: string[];
  rating?: number | null;
  last_updated?: string;
  id?: string;
  user_id?: string;
};

export type Anime = {
  id?: string;
  anime_id: number;
  title: string;
  english_title?: string | null;
  synonyms?: string[];
  group_key?: string;
  group_title?: string;
  synopsis?: string;
  genres: string[];
  themes?: string[];
  demographics?: string[];
  studios?: string[];
  image_url: string;
  total_episodes: number | null;
  status: string;
  media_type?: string | null;
  score?: number | null;
  members?: number | null;
  year?: number | null;
  season?: string | null;
  trailer_url?: string | null;
  franchise_count?: number;
  franchise_ids?: number[];
  userInteraction?: UserInteraction;
};

export type UserProfile = {
  preferred_genres: string[];
  favorite_anime_ids: number[];
  github_url?: string | null;
};

export type User = {
  id: string;
  username: string;
  email: string;
  profile: UserProfile;
};

export const displayTitle = (anime: Pick<Anime, "title" | "english_title">) => anime.english_title || anime.title;
