"use client";

import { cloudSignOut, cloudUser, fetchRemote, isCloudConfigured, pushRemote, type CloudUser } from "@/lib/cloud";
import { loadDb, subscribeDb, updateDb, type DbState, type StoredUser } from "@/lib/store";
import { emptyDoc, EPOCH, mergeDocs, sameDoc, type SyncDoc } from "@/lib/syncMerge";

export type SyncStatus = { state: "off" | "idle" | "syncing" | "synced" | "error" | "offline"; lastSynced: string | null; message?: string; email?: string };

let status: SyncStatus = { state: isCloudConfigured ? "idle" : "off", lastSynced: null };
const statusListeners = new Set<(status: SyncStatus) => void>();
const setStatus = (next: Partial<SyncStatus>) => {
  status = { ...status, ...next };
  statusListeners.forEach((listener) => listener(status));
};
export const getSyncStatus = () => status;
export function onSyncStatus(listener: (status: SyncStatus) => void) {
  statusListeners.add(listener);
  listener(status);
  return () => { statusListeners.delete(listener); };
}

const sessionUser = (db: DbState) => Object.values(db.users).find((user) => user.id === db.session) ?? null;

function docFor(db: DbState, user: StoredUser): SyncDoc {
  const interactions = db.interactions[user.id] ?? {};
  const keep = new Set([...Object.keys(interactions), ...user.profile.favorite_anime_ids.map(String)]);
  return {
    ...emptyDoc(user.username),
    profile: user.profile,
    profile_updated_at: user.profile_updated_at ?? EPOCH,
    interactions,
    tombstones: db.tombstones?.[user.id] ?? {},
    anime_cache: Object.fromEntries(Object.entries(db.anime_cache).filter(([id]) => keep.has(id))),
  };
}

function applyDoc(draft: DbState, userId: string, doc: SyncDoc) {
  const target = Object.values(draft.users).find((user) => user.id === userId);
  if (!target) return;
  target.profile = doc.profile;
  target.profile_updated_at = doc.profile_updated_at;
  draft.interactions[userId] = doc.interactions;
  (draft.tombstones ??= {})[userId] = doc.tombstones;
  Object.assign(draft.anime_cache, doc.anime_cache);
}

let running: Promise<void> | null = null;
let rerun = false;
let applying = false;

export function syncNow(): Promise<void> {
  if (!isCloudConfigured) return Promise.resolve();
  if (running) { rerun = true; return running; }
  running = (async () => {
    do {
      rerun = false;
      await syncOnce();
    } while (rerun);
  })().finally(() => { running = null; });
  return running;
}

async function syncOnce() {
  const db = await loadDb();
  const user = sessionUser(db);
  if (!user?.cloud) { setStatus({ state: "idle", lastSynced: null, email: undefined, message: undefined }); return; }
  if (typeof navigator !== "undefined" && !navigator.onLine) { setStatus({ state: "offline", email: user.cloud.email }); return; }

  const account = await cloudUser().catch(() => null);
  if (!account || account.id !== user.cloud.user_id) {
    setStatus({ state: "error", email: user.cloud.email, message: "Your sync sign-in expired. Sign in again to keep syncing." });
    return;
  }

  setStatus({ state: "syncing", email: user.cloud.email, message: undefined });
  try {
    const local = docFor(db, user);
    const remote = await fetchRemote(account.id);
    const merged = mergeDocs(local, remote ?? emptyDoc(user.username));
    if (!sameDoc(merged, local)) {
      applying = true;
      try { await updateDb((draft) => applyDoc(draft, user.id, merged)); } finally { applying = false; }
    }
    if (!remote || !sameDoc(merged, remote)) await pushRemote(account.id, merged);
    const now = new Date().toISOString();
    applying = true;
    try {
      await updateDb((draft) => {
        const target = Object.values(draft.users).find((candidate) => candidate.id === user.id);
        if (target?.cloud) target.cloud.last_synced = now;
      });
    } finally { applying = false; }
    setStatus({ state: "synced", lastSynced: now });
  } catch (error) {
    setStatus({ state: navigator.onLine ? "error" : "offline", message: error instanceof Error ? error.message : "Sync failed." });
  }
}

export async function linkAccount(account: CloudUser) {
  await updateDb((draft) => {
    const user = sessionUser(draft);
    if (user) user.cloud = { user_id: account.id, email: account.email ?? "", last_synced: null };
  });
  await syncNow();
}

export async function openAccountOnThisDevice(account: CloudUser) {
  const remote = await fetchRemote(account.id).catch(() => null);
  const db = await loadDb();
  let local = Object.values(db.users).find((user) => user.cloud?.user_id === account.id);
  if (!local) {
    const base = (remote?.username || account.email?.split("@")[0] || "Reader").replace(/[^\w-]/g, "").slice(0, 24) || "Reader";
    let username = base;
    for (let index = 2; db.users[username.toLowerCase()]; index += 1) username = `${base}-${index}`;
    const randomHex = Array.from(crypto.getRandomValues(new Uint8Array(12)), (byte) => byte.toString(16).padStart(2, "0")).join("");
    local = {
      id: randomHex, username, email: account.email ?? "", salt: randomHex, password_hash: "sync-only",
      created_at: new Date().toISOString(), profile: { preferred_genres: [], favorite_anime_ids: [], github_url: null },
      cloud: { user_id: account.id, email: account.email ?? "", last_synced: null },
    };
  }
  const userToOpen = local;
  await updateDb((draft) => {
    draft.users[userToOpen.username.toLowerCase()] = userToOpen;
    draft.session = userToOpen.id;
  });
  await syncNow();
}

export async function unlinkAccount() {
  await updateDb((draft) => {
    const user = sessionUser(draft);
    if (user) delete user.cloud;
  });
  await cloudSignOut();
  setStatus({ state: "idle", lastSynced: null, email: undefined, message: undefined });
}

let started = false;
let timer: ReturnType<typeof setTimeout> | undefined;
export function startAutoSync() {
  if (started || !isCloudConfigured || typeof window === "undefined") return;
  started = true;
  subscribeDb(() => {
    if (applying) return;
    clearTimeout(timer);
    timer = setTimeout(() => void syncNow(), 1500);
  });
  window.addEventListener("online", () => void syncNow());
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void syncNow(); });
  void syncNow();
}
