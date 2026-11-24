import type { Metadata, Viewport } from "next";
import { Dela_Gothic_One, Zen_Kaku_Gothic_New } from "next/font/google";
import "./globals.css";

const display = Dela_Gothic_One({ subsets: ["latin"], weight: "400", variable: "--font-display-src", display: "swap" });
const body = Zen_Kaku_Gothic_New({ subsets: ["latin"], weight: ["400", "500", "700", "900"], variable: "--font-body-src", display: "swap" });
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const metadata: Metadata = {
  title: "Bunime — Anime Tracker & Recommender",
  description: "Track every season, rate what you watch, and discover your next anime obsession with a built-in recommendation engine.",
  icons: { icon: `${basePath}/icon.svg` },
  openGraph: { title: "Bunime", description: "Track, rate and discover anime.", type: "website" },
};

export const viewport: Viewport = { themeColor: "#e8e7e1", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <div className="paper-texture" aria-hidden="true" />
        <div className="page-root">{children}</div>
      </body>
    </html>
  );
}
