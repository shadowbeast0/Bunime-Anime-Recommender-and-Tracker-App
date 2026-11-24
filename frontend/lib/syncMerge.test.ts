import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyDoc, mergeDocs, sameDoc } from "./syncMerge.ts";

const t = (minute: number) => new Date(Date.UTC(2026, 10, 24, 10, minute)).toISOString();
const entry = (id: number, minute: number, rating: number | null = null, status = "Watching") => ({ anime_id: id, watch_status: status, rating, episodes_watched: 0, watched_episodes: [], last_updated: t(minute) });

test("titles saved on different devices are combined", () => {
  const phone = { ...emptyDoc("a"), interactions: { "1": entry(1, 1) } };
  const laptop = { ...emptyDoc("a"), interactions: { "2": entry(2, 2) } };
  assert.deepEqual(Object.keys(mergeDocs(phone, laptop).interactions).sort(), ["1", "2"]);
});

test("the newest edit of the same title wins, whichever side it is on", () => {
  const older = { ...emptyDoc("a"), interactions: { "1": entry(1, 1, 3) } };
  const newer = { ...emptyDoc("a"), interactions: { "1": entry(1, 5, 5, "Completed") } };
  assert.equal(mergeDocs(older, newer).interactions["1"].rating, 5);
  assert.equal(mergeDocs(newer, older).interactions["1"].rating, 5);
});

test("a removal beats edits made before it but not edits made after", () => {
  const removed = { ...emptyDoc("a"), tombstones: { "1": t(4) } };
  const editedBefore = { ...emptyDoc("a"), interactions: { "1": entry(1, 2) } };
  const editedAfter = { ...emptyDoc("a"), interactions: { "1": entry(1, 6) } };
  const first = mergeDocs(editedBefore, removed);
  assert.equal(first.interactions["1"], undefined);
  assert.equal(first.tombstones["1"], t(4));
  const second = mergeDocs(removed, editedAfter);
  assert.equal(second.interactions["1"].last_updated, t(6));
  assert.equal(second.tombstones["1"], undefined);
});

test("the newer profile wins and merging is idempotent", () => {
  const a = { ...emptyDoc("a"), profile: { preferred_genres: ["Action"], favorite_anime_ids: [1] }, profile_updated_at: t(1), interactions: { "1": entry(1, 1) } };
  const b = { ...emptyDoc("a"), profile: { preferred_genres: ["Drama"], favorite_anime_ids: [] }, profile_updated_at: t(9) };
  const merged = mergeDocs(a, b);
  assert.deepEqual(merged.profile.preferred_genres, ["Drama"]);
  assert.ok(sameDoc(merged, mergeDocs(merged, b)));
  assert.ok(sameDoc(mergeDocs(a, b), mergeDocs(b, a)));
});
