const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    if (typeof window !== "undefined" && window.location.pathname !== "/login" && window.location.pathname !== "/register") {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
  }

  return response;
}

async function parseResponse(response: Response) {
  if (response.ok) return response.json();

  const body = await response.json().catch(() => null);
  throw new Error(body?.detail || "API request failed");
}

export const api = {
  async get(endpoint: string) {
    const res = await fetchWithAuth(endpoint);
    return parseResponse(res);
  },

  async post(endpoint: string, data: any) {
    const res = await fetchWithAuth(endpoint, {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseResponse(res);
  },

  async put(endpoint: string, data: any) {
    const res = await fetchWithAuth(endpoint, {
      method: "PUT",
      body: JSON.stringify(data),
    });
    return parseResponse(res);
  },

  async delete(endpoint: string) {
    const res = await fetchWithAuth(endpoint, { method: "DELETE" });
    if (res.status === 204) return null;
    return parseResponse(res);
  },

  async download(endpoint: string) {
    const res = await fetchWithAuth(endpoint);
    if (!res.ok) await parseResponse(res);
    return {
      blob: await res.blob(),
      filename: res.headers.get("Content-Disposition")?.match(/filename="?([^";]+)"?/)?.[1] || "bunime-export.json",
    };
  },

  async login(formData: URLSearchParams) {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData,
    });
    if (!res.ok) throw new Error("Invalid credentials");
    return res.json();
  },

  async register(userData: any) {
    const res = await fetch(`${API_BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userData),
    });
    if (!res.ok) throw new Error("Registration failed");
    return res.json();
  }
};
