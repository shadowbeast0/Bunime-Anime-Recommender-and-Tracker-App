"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import Navbar from "@/components/ui/Navbar";
import { api } from "@/lib/api";
import { startAutoSync } from "@/lib/syncEngine";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api.get("/users/me").then(() => { setReady(true); startAutoSync(); }).catch(() => router.replace("/login/"));
  }, [router]);

  if (!ready) return <div className="center-state"><Loader2 size={30} className="spin" /> Loading</div>;

  return (
    <>
      <Suspense fallback={null}><Navbar /></Suspense>
      <main className="shell-main">{children}</main>
      <footer className="site-footer">Anime data comes from MyAnimeList through <a href="https://jikan.moe" target="_blank" rel="noreferrer">Jikan</a>. Your list is saved in this browser and, if you turn on sync, in your sync account.</footer>
    </>
  );
}
