"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Layers, ListChecks, Loader2, Sparkles, Tv } from "lucide-react";
import { api } from "@/lib/api";
import { coverFallback } from "@/lib/basePath";
import { usePosters, useGuestStart } from "@/components/features/AuthShell";

export default function LandingPage() {
  const posters = usePosters(4);
  const guest = useGuestStart();
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => { api.get("/users/me").then(() => setSignedIn(true)).catch(() => setSignedIn(false)); }, []);

  return (
    <div className="landing">
      <header className="landing-nav">
        <Link href="/" className="brand"><span className="brand-badge">B</span><span className="brand-word">BUN<span>IME</span></span><span className="brand-kana" aria-hidden="true">ブニメ</span></Link>
        <div className="toolbar">
          {signedIn ? <Link className="btn btn-hot btn-sm" href="/dashboard/">Open my list</Link> : <>
            <Link className="btn btn-ghost btn-sm" href="/login/">Sign in</Link>
            <Link className="btn btn-hot btn-sm" href="/register/">Create account</Link>
          </>}
        </div>
      </header>
      <section className="landing-hero">
        <div>
          <h1>Keep every season you’ve watched in one place.</h1>
          <p>Rate what you’ve seen, tick off episodes as you go, and get recommendations built from the shows you actually rated highly. 6,000 titles, with every season and film of a franchise grouped together.</p>
          <div className="hero-actions">
            {signedIn ? <Link className="btn btn-hot" href="/dashboard/"><Tv size={18} /> Continue watching</Link> : <>
              <button type="button" className="btn btn-hot" disabled={guest.loading} onClick={() => void guest.start()}>{guest.loading ? <Loader2 size={18} className="spin" /> : <Tv size={18} />} Start without an account</button>
              <Link className="btn btn-ghost" href="/register/">Create an account</Link>
            </>}
          </div>
        </div>
        <div style={{ position: "relative" }}>
          <div className="page-spread" aria-hidden="true">
            {posters.map((src) => <div key={src}><img src={src} alt="" onError={coverFallback} /></div>)}
          </div>
          <span className="speech">So… what do I watch next?</span>
        </div>
      </section>
      <section className="features">
        <div className="feature"><div className="feature-icon"><Sparkles size={22} /></div><h3>Picks from your own ratings</h3><p>Five-star a show and its closest matches by genre, theme and story move to the top. Add any title to steer the results.</p></div>
        <div className="feature"><div className="feature-icon"><Layers size={22} /></div><h3>Franchises in release order</h3><p>One Piece’s 40-odd films and specials, or every Re:Zero season and OVA, collected on a single page.</p></div>
        <div className="feature"><div className="feature-icon"><ListChecks size={22} /></div><h3>Episode-by-episode progress</h3><p>Tap the episode you reached and everything before it is marked. Your list shows hours watched and your average rating.</p></div>
      </section>
      <footer className="site-footer">Anime data comes from MyAnimeList through <a href="https://jikan.moe" target="_blank" rel="noreferrer">Jikan</a>.</footer>
    </div>
  );
}
