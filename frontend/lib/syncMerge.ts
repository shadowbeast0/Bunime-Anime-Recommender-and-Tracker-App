import type { Anime, UserInteraction, UserProfile } from "./types";

export type SyncDoc = {
  version: 1;
  username: string;
  profile: UserProfile;
  profile_updated_at: string;
  interactions: Record<string, UserInteraction>;
  tombstones: Record<string, string>;
  anime_cache: Record<string, Anime>;
};

export const EPOCH = "1970-01-01T00:00:00.000Z";

export const emptyDoc = (username = ""): SyncDoc => ({
  version: 1,
  username,
  profile: { preferred_genres: [], favorite_anime_ids: [], github_url: null },
  profile_updated_at: EPOCH,
  interactions: {},
  tombstones: {},
  anime_cache: {},
});

const later = (a?: string, b?: string) => ((a ?? EPOCH) >= (b ?? EPOCH) ? a ?? EPOCH : b ?? EPOCH);

export function mergeDocs(local: SyncDoc, remote: SyncDoc): SyncDoc {
  const interactions: Record<string, UserInteraction> = {};
  const tombstones: Record<string, string> = {};
  const ids = new Set([
    ...Object.keys(local.interactions), ...Object.keys(remote.interactions),
    ...Object.keys(local.tombstones), ...Object.keys(remote.tombstones),
  ]);

  for (const id of ids) {
    const a = local.interactions[id];
    const b = remote.interactions[id];
    const newest = !a ? b : !b ? a : (a.last_updated ?? EPOCH) >= (b.last_updated ?? EPOCH) ? a : b;
    const removedAt = [local.tombstones[id], remote.tombstones[id]].filter(Boolean).sort().pop();
    if (removedAt && (!newest || removedAt >= (newest.last_updated ?? EPOCH))) tombstones[id] = removedAt;
    else if (newest) interactions[id] = newest;
  }

  const profileFromRemote = (remote.profile_updated_at ?? EPOCH) > (local.profile_updated_at ?? EPOCH);
  const profile = profileFromRemote ? remote.profile : local.profile;
  const keep = new Set([...Object.keys(interactions), ...(profile.favorite_anime_ids ?? []).map(String)]);
  const anime_cache: Record<string, Anime> = {};
  for (const [id, anime] of Object.entries({ ...remote.anime_cache, ...local.anime_cache })) {
    if (keep.has(id)) anime_cache[id] = anime;
  }

  return {
    version: 1,
    username: local.username || remote.username,
    profile,
    profile_updated_at: later(local.profile_updated_at, remote.profile_updated_at),
    interactions,
    tombstones,
    anime_cache,
  };
}

export function sameDoc(a: SyncDoc, b: SyncDoc) {
  const canonical = (doc: SyncDoc) => JSON.stringify({
    p: doc.profile, pu: doc.profile_updated_at,
    i: Object.keys(doc.interactions).sort().map((id) => [id, doc.interactions[id].last_updated, doc.interactions[id].watch_status, doc.interactions[id].rating, doc.interactions[id].episodes_watched]),
    t: Object.keys(doc.tombstones).sort().map((id) => [id, doc.tombstones[id]]),
  });
  return canonical(a) === canonical(b);
}
