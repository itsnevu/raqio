// Satu sumber kebenaran untuk path yang boleh diakses tanpa sesi. Dipakai middleware (edge) dan Shell (client).
// Jangan masukkan /metrics, /docs, /openapi.yaml: endpoint itu dilayani Go langsung, bukan lewat Next.
export const PUBLIC_PAGES = ["/login", "/register", "/forgot", "/reset", "/undangan", "/privacy", "/metodologi", "/terms"] as const;

export const PUBLIC_PATHS: readonly string[] = [
  ...PUBLIC_PAGES,
  "/", // pengalihan ke ruang riset yang dilindungi sesi
  "/auth/login",
  "/auth/guest",
  "/auth/register",
  "/auth/forgot",
  "/auth/reset",
  "/auth/verify",
  "/auth/invite",
  "/auth/access", // kebijakan akses (INVITE_ONLY) untuk halaman login
  "/auth/invite-code", // cek kode undangan
  "/billing/plans",
  "/billing/webhook/xendit",
  "/logo.svg",
  "/logo.png",
  "/brand-transparent.svg",
  "/raqio-mark.svg",
  "/icon-192.png",
  "/apple-touch-icon.png",
  "/login-data-grid.webp",
  "/opengraph-image",
  "/stats", // angka total data terkumpul, dipakai strip di halaman Riset (tamu juga melihat)
];

// awalan publik: audit personal prospek (/p/<token>, data /audit/<token>), berhenti berlangganan, logo bisnis
export const PUBLIC_PREFIXES = ["/p/", "/audit/", "/u/", "/logo/", "/top", "/rank", "/badge/"] as const;
export const isPublicPath = (pathname: string) => PUBLIC_PATHS.includes(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
export const isAuthPage = (pathname: string) => (PUBLIC_PAGES as readonly string[]).includes(pathname);

/** Halaman tanpa navigasi dan tombol asisten. */
export const BARE_PAGES = ["/market/print", "/pilih-produk", "/"] as const;
export const isBarePage = (pathname: string) => (BARE_PAGES as readonly string[]).includes(pathname) || pathname.startsWith("/p/");
