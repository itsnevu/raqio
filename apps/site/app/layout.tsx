import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { SmoothScroll } from "@/components/layout/SmoothScroll";
import { cookies } from "next/headers";
import { LangProvider, LangKeyed } from "@/content/i18n";
import { LANG_COOKIE, type Lang } from "@/content/lang";
import "./globals.css";

// Figtree: closest free match to Aeonik (width err 1.5%, x-height err 1.7%; research/TOKENS.measured.md).
// Font files live in app/fonts (Google Fonts latin subset, OFL): the build never fetches from Google, which
// failed from the VPS and adds a third-party dependency to every production build.
const sans = localFont({ src: "./fonts/figtree-latin.woff2", weight: "300 900", variable: "--font-figtree", display: "swap" });
const mono = localFont({ src: "./fonts/geist-mono-latin.woff2", weight: "400", variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Raqio: Know your market. Reach your customers.",
  description: "Market research by industry and region, plus a shared WhatsApp inbox for your team.",
};
export const viewport: Viewport = { themeColor: "#0a0a0f" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang: Lang = (await cookies()).get(LANG_COOKIE)?.value === "id" ? "id" : "en";
  return (
    <html lang={lang} className={`${sans.variable} ${mono.variable}`} data-nav-theme="light">
      <body>
        <LangProvider initial={lang}>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-ink focus:px-4 focus:py-2 focus:text-fg">{lang === "id" ? "Lewati ke konten" : "Skip to content"}</a>
        <SmoothScroll />
        <Header />
        <LangKeyed>
          <main id="main" className="relative overflow-x-clip">{children}</main>
          <Footer />
        </LangKeyed>
        </LangProvider>
      </body>
    </html>
  );
}
