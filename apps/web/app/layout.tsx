import type { Metadata } from "next";
import { Albert_Sans } from "next/font/google";
import "./globals.css";
import { ShellProvider } from "@/components/Shell";

const sans = Albert_Sans({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Raqio",
  description: "Peta pasar industri apa pun. Scraping langsung dari Google Maps dan website bisnis.",
  icons: { icon: "/logo.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={sans.variable}>
      <body>
        <ShellProvider>{children}</ShellProvider>
      </body>
    </html>
  );
}
