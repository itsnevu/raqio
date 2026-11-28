import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import localFont from "next/font/local";
import "./globals.css";
import "./tour.css";
import { ShellProvider } from "@/components/Shell";
import { AccessLangProvider } from "@/lib/access-lang";


// Tipografi yang sama dengan situs Raqio (apps/site): Figtree variable (latin, OFL) dari app/fonts, jadi build
// tidak mengunduh apa pun dari Google Fonts (gagal dari VPS, dan menambah ketergantungan pihak ketiga).
const figtree = localFont({ src: "./fonts/figtree-latin.woff2", weight: "300 900", variable: "--font-figtree", display: "swap" });

const BASE = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3002").replace(/\/+$/, "");

export const metadata: Metadata = {
  metadataBase: new URL(BASE),
  title: "Raqio",
  description: "Peta pasar industri apa pun. Scraping langsung dari Google Maps dan website bisnis.",
  icons: { icon: "/raqio-mark.svg", apple: "/apple-touch-icon.png" },
  // kartu share: gambar diambil dari app/opengraph-image.tsx (otomatis oleh Next)
  openGraph: { siteName: "Raqio", type: "website", locale: "id_ID" },
  twitter: { card: "summary_large_image" },
};

// versi lama pernah mendaftarkan service worker (sw.js); lepaskan supaya chunk JS basi tidak disajikan dari cache
const SW_CLEANUP =
  "if('serviceWorker'in navigator){navigator.serviceWorker.getRegistrations().then(function(rs){if(!rs.length)return;Promise.all(rs.map(function(r){return r.unregister()})).then(function(){if(window.caches){caches.keys().then(function(ks){return Promise.all(ks.map(function(k){return caches.delete(k)}))}).then(function(){location.reload()})}else{location.reload()}})})}";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // nonce dibuat middleware.ts per request; dipakai skrip inline di bawah dan oleh Next untuk skripnya sendiri
  const h = await headers();
  const nonce = h.get("x-nonce") ?? undefined;
  const lang = h.get("x-raqio-lang") === "en" ? "en" : "id";
  // tema: terang bawaan; gelap hanya bila dipilih lewat tombol (components/shell/ThemeToggle.tsx)
  const theme = (await cookies()).get("raqio_theme")?.value === "dark" ? "dark" : "light";
  return (
    <html lang={lang} className={figtree.variable} data-theme={theme}>
      <body>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: SW_CLEANUP }} />
        <AccessLangProvider initial={lang}><ShellProvider>{children}</ShellProvider></AccessLangProvider>
      </body>
    </html>
  );
}
