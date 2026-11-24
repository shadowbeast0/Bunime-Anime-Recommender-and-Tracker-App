"use client";

import type { Anime, UserInteraction, UserProfile } from "@/lib/types";


export type StoredUser = {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  salt: string;
  created_at: string;
  profile: UserProfile;
  profile_updated_at?: string;
  cloud?: { user_id: string; email: string; last_synced?: string | null };
};

export type DbState = {
  version: 1;
  users: Record<string, StoredUser>;
  session: string | null;
  interactions: Record<string, Record<string, UserInteraction>>;
  tombstones: Record<string, Record<string, string>>;
  anime_cache: Record<string, Anime>;
};

const DB_NAME = "bunime";
const STORE = "kv";
const KEY = "state";
const MIRROR_KEY = "bunime:state";

const emptyState = (): DbState => ({ version: 1, users: {}, session: null, interactions: {}, tombstones: {}, anime_cache: {} });

let state: DbState | null = null;
let loading: Promise<DbState> | null = null;
let persisted: boolean | null = null;
const listeners = new Set<() => void>();

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbGet(): Promise<DbState | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
      request.onsuccess = () => resolve((request.result as DbState) ?? null);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbPut(value: DbState): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).put(value, KEY);
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

function mirrorGet(): DbState | null {
  try {
    const raw = localStorage.getItem(MIRROR_KEY);
    return raw ? (JSON.parse(raw) as DbState) : null;
  } catch {
    return null;
  }
}

function mirrorPut(value: DbState) {
  try {
    localStorage.setItem(MIRROR_KEY, JSON.stringify(value));
  } catch {
    // Quota or privacy mode: IndexedDB remains the source of truth.
  }
}

function normalize(value: DbState | null): DbState {
  if (!value || typeof value !== "object") return emptyState();
  return { ...emptyState(), ...value, version: 1 };
}

export async function requestPersistence(): Promise<boolean> {
  if (persisted !== null) return persisted;
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return (persisted = true);
    persisted = navigator.storage?.persist ? await navigator.storage.persist() : false;
  } catch {
    persisted = false;
  }
  return persisted;
}

export function loadDb(): Promise<DbState> {
  if (state) return Promise.resolve(state);
  if (!loading) {
    loading = (async () => {
      const [fromIdb, fromMirror] = [await idbGet(), mirrorGet()];
      state = normalize(fromIdb ?? fromMirror);
      if (!fromIdb && fromMirror) void idbPut(state);
      void requestPersistence();
      if (typeof window !== "undefined") {
        window.addEventListener("storage", (event) => {
          if (event.key !== MIRROR_KEY || !event.newValue) return;
          try {
            state = normalize(JSON.parse(event.newValue));
            listeners.forEach((listener) => listener());
          } catch { /* ignore malformed cross-tab payloads */ }
        });
      }
      return state;
    })();
  }
  return loading;
}

export async function updateDb(mutate: (draft: DbState) => void): Promise<DbState> {
  const current = await loadDb();
  const draft: DbState = structuredClone(current);
  mutate(draft);
  state = draft;
  mirrorPut(draft);
  await idbPut(draft);
  listeners.forEach((listener) => listener());
  return draft;
}

export function subscribeDb(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function storageInfo() {
  const isPersistent = await requestPersistence();
  let usage = 0;
  try { usage = (await navigator.storage?.estimate?.())?.usage ?? 0; } catch { /* unsupported */ }
  return { isPersistent, usage };
}
