"use client";

import { withBase } from "@/lib/basePath";
import { ApiError, importData, localRequest } from "@/lib/localApi";

const REMOTE_API = process.env.NEXT_PUBLIC_API_URL || "";
export const isLocalMode = !REMOTE_API;
const AUTH_PAGES = ["/login", "/register", "/"];

function redirectToLogin() {
  if (typeof window === "undefined") return;
  const path = window.location.pathname.replace(process.env.NEXT_PUBLIC_BASE_PATH || "", "").replace(/\/$/, "") || "/";
  if (!AUTH_PAGES.includes(path)) window.location.href = withBase("/login/");
}

async function remote(method: string, endpoint: string, body?: unknown, form = false) {
  const token = localStorage.getItem("token");
  const response = await fetch(`${REMOTE_API}${endpoint}`, {
    method,
    headers: {
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : form ? (body as URLSearchParams) : JSON.stringify(body),
  });
  if (response.status === 401) { localStorage.removeItem("token"); redirectToLogin(); }
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(typeof payload?.detail === "string" ? payload.detail : "API request failed", response.status);
  return payload;
}

async function request(method: string, endpoint: string, body?: unknown) {
  if (!isLocalMode) return remote(method, endpoint, body);
  try {
    return await localRequest(method, endpoint, body);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirectToLogin();
    throw error;
  }
}

export const api = {
  get: (endpoint: string): Promise<any> => request("GET", endpoint),
  post: (endpoint: string, data: unknown): Promise<any> => request("POST", endpoint, data),
  put: (endpoint: string, data: unknown): Promise<any> => request("PUT", endpoint, data),
  delete: (endpoint: string): Promise<any> => request("DELETE", endpoint),

  async download(endpoint: string) {
    const payload = await request("GET", endpoint);
    return {
      blob: new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
      filename: `bunime-backup-${new Date().toISOString().slice(0, 10)}.json`,
    };
  },

  async importBackup(file: File): Promise<number> {
    const payload = JSON.parse(await file.text());
    if (!isLocalMode) throw new ApiError("Import is only available in the browser build.");
    return importData(payload);
  },

  async login(username: string, password: string) {
    if (isLocalMode) return localRequest("POST", "/auth/login", { username, password }) as Promise<{ access_token: string }>;
    const data = await remote("POST", "/auth/login", new URLSearchParams({ username, password }), true);
    localStorage.setItem("token", data.access_token);
    return data;
  },

  async register(userData: { username: string; email: string; password: string }) {
    return isLocalMode ? localRequest("POST", "/auth/register", userData) : remote("POST", "/auth/register", userData);
  },

  async logout() {
    if (isLocalMode) await localRequest("POST", "/auth/logout");
    else localStorage.removeItem("token");
  },
};
