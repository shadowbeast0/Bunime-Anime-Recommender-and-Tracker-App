"use client";

import { createClient, type SupabaseClient, type User as CloudUser } from "@supabase/supabase-js";
import type { SyncDoc } from "@/lib/syncMerge";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
export const isCloudConfigured = Boolean(URL && ANON_KEY);

let client: SupabaseClient | null = null;
function supabase() {
  if (!isCloudConfigured) throw new Error("Sync isn't set up for this site yet.");
  client ??= createClient(URL, ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "bunime:sync-auth" } });
  return client;
}

export type { CloudUser };

const friendly = (message: string) => {
  if (/invalid login credentials/i.test(message)) return "That email and password don’t match a sync account.";
  if (/email not confirmed/i.test(message)) return "Confirm your email first: open the link we sent, then sign in.";
  if (/already registered|already exists/i.test(message)) return "There’s already a sync account for that email. Sign in instead.";
  if (/password/i.test(message) && /6|short|weak/i.test(message)) return "Use a password with at least 6 characters.";
  if (/fetch|network/i.test(message)) return "Can’t reach the sync server. Check your connection and try again.";
  return message;
};

export async function cloudSignUp(email: string, password: string): Promise<{ user: CloudUser | null; needsConfirmation: boolean }> {
  const { data, error } = await supabase().auth.signUp({ email, password, options: { emailRedirectTo: typeof window !== "undefined" ? window.location.href : undefined } });
  if (error) throw new Error(friendly(error.message));
  return { user: data.session ? data.user : null, needsConfirmation: !data.session };
}

export async function cloudSignIn(email: string, password: string): Promise<CloudUser> {
  const { data, error } = await supabase().auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error(friendly(error?.message ?? "Sign-in failed."));
  return data.user;
}

export async function cloudSignOut() {
  if (isCloudConfigured) await supabase().auth.signOut();
}

export async function cloudUser(): Promise<CloudUser | null> {
  if (!isCloudConfigured) return null;
  const { data } = await supabase().auth.getSession();
  return data.session?.user ?? null;
}

export async function fetchRemote(userId: string): Promise<SyncDoc | null> {
  const { data, error } = await supabase().from("bunime_sync").select("data").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(friendly(error.message));
  return (data?.data as SyncDoc | undefined) ?? null;
}

export async function pushRemote(userId: string, doc: SyncDoc) {
  const { error } = await supabase().from("bunime_sync").upsert({ user_id: userId, data: doc, updated_at: new Date().toISOString() });
  if (error) throw new Error(friendly(error.message));
}
