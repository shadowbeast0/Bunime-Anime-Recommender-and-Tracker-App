"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2, ShieldCheck, Zap } from "lucide-react";
import { api, isLocalMode } from "@/lib/api";
import { loadCatalog } from "@/lib/catalog";
import { coverFallback } from "@/lib/basePath";
import { CloudSignIn } from "@/components/features/CloudSync";
import { isCloudConfigured } from "@/lib/cloud";

export function usePosters(count: number) {
  const [posters, setPosters] = useState<string[]>([]);
  useEffect(() => {
    loadCatalog().then(({ list }) => {
      const popular = [...list].sort((a, b) => (b.members ?? 0) - (a.members ?? 0)).filter((anime) => anime.media_type === "TV").slice(0, 60);
      setPosters(popular.sort(() => Math.random() - 0.5).slice(0, count).map((anime) => anime.image_url));
    }).catch(() => setPosters([]));
  }, [count]);
  return posters;
}

export function useGuestStart() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const start = async () => {
    setLoading(true);
    try {
      const suffix = Math.random().toString(36).slice(2, 7);
      const password = crypto.getRandomValues(new Uint32Array(4)).join("-");
      await api.register({ username: `Guest-${suffix}`, email: "", password });
      await api.login(`Guest-${suffix}`, password);
      router.push("/dashboard/");
    } finally { setLoading(false); }
  };
  return { start, loading };
}

export default function AuthShell({ headline, children }: { headline: string; children: React.ReactNode }) {
  const posters = usePosters(16);
  const guest = useGuestStart();
  return (
    <div className="auth-page">
      <div className="auth-art">
        <div className="auth-mosaic" aria-hidden="true">{posters.map((src) => <img key={src} src={src} alt="" onError={coverFallback} />)}</div>
        <h1>{headline}</h1>
        <p>Track every season you watch, rate it, and get recommendations based on what you actually liked.</p>
      </div>
      <div className="auth-side">
        <div className="auth-card">
          <Link href="/" className="brand"><span className="brand-badge">B</span><span className="brand-word">BUN<span>IME</span></span></Link>
          {children}
          {isLocalMode && <>
            <div className="divider">or</div>
            <CloudSignIn />
            <button type="button" className="btn btn-ghost" disabled={guest.loading} onClick={() => void guest.start()}>{guest.loading ? <Loader2 size={16} className="spin" /> : <Zap size={16} />} Continue as a guest</button>
            <p className="local-note"><ShieldCheck size={16} /> {isCloudConfigured ? "Lists are saved in this browser. Turn on sync from your profile to keep them the same on every device." : "Accounts and lists stay in this browser; nothing is sent to a server. To move your list to another device, download a backup from your profile."}</p>
          </>}
        </div>
      </div>
    </div>
  );
}
