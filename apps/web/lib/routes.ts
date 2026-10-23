// Satu sumber kebenaran untuk path yang boleh diakses tanpa sesi. Dipakai middleware (edge) dan Shell (client).
// Jangan masukkan /metrics, /docs, /openapi.yaml: endpoint itu dilayani Go langsung, bukan lewat Next.
export const PUBLIC_PAGES = ["/login", "/register", "/forgot", "/reset", "/privacy", "/metodologi", "/terms"] as const;

export const PUBLIC_PATHS: readonly string[] = [
  ...PUBLIC_PAGES,
  "/", // landing page; halaman Asisten pindah ke /chat
  "/auth/login",
  "/auth/guest",
  "/auth/register",
  "/auth/forgot",
  "/auth/reset",
  "/auth/verify",
  "/auth/invite",
  "/billing/plans",
  "/billing/webhook/xendit",
  "/logo.svg",
  "/stats", // angka total data terkumpul, dipakai strip di halaman Riset (tamu juga melihat)
];

// awalan publik: audit personal prospek (/p/<token>, data /audit/<token>), berhenti berlangganan, logo bisnis
export const PUBLIC_PREFIXES = ["/p/", "/audit/", "/u/", "/logo/", "/top", "/rank", "/badge/"] as const;
export const isPublicPath = (pathname: string) => PUBLIC_PATHS.includes(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
export const isAuthPage = (pathname: string) => (PUBLIC_PAGES as readonly string[]).includes(pathname);

/** Halaman tanpa navigasi dan tombol asisten: laporan siap cetak (butuh sesi) dan landing (publik, header sendiri). */
export const BARE_PAGES = ["/market/print", "/"] as const;
export const isBarePage = (pathname: string) => (BARE_PAGES as readonly string[]).includes(pathname) || pathname.startsWith("/p/");
