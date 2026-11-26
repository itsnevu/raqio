import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import "./tour.css";
import { ShellProvider } from "@/components/Shell";


const BASE = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3002").replace(/\/+$/, "");

export const metadata: Metadata = {
  metadataBase: new URL(BASE),
  title: "Raqio",
  description: "Peta pasar industri apa pun. Scraping langsung dari Google Maps dan website bisnis.",
  icons: { icon: "/logo.png", apple: "/apple-touch-icon.png" },
  // kartu share: gambar diambil dari app/opengraph-image.tsx (otomatis oleh Next)
  openGraph: { siteName: "Raqio", type: "website", locale: "id_ID" },
  twitter: { card: "summary_large_image" },
};

// versi lama pernah mendaftarkan service worker (sw.js); lepaskan supaya chunk JS basi tidak disajikan dari cache
const SW_CLEANUP =
  "if('serviceWorker'in navigator){navigator.serviceWorker.getRegistrations().then(function(rs){if(!rs.length)return;Promise.all(rs.map(function(r){return r.unregister()})).then(function(){if(window.caches){caches.keys().then(function(ks){return Promise.all(ks.map(function(k){return caches.delete(k)}))}).then(function(){location.reload()})}else{location.reload()}})})}";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // nonce dibuat middleware.ts per request; dipakai skrip inline di bawah dan oleh Next untuk skripnya sendiri
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="id">
      <body>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: SW_CLEANUP }} />
        <ShellProvider>{children}</ShellProvider>
      </body>
    </html>
  );
}
