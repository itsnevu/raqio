/**
 * Origin publik untuk redirect absolut. `next start -H 127.0.0.1` di VPS membuat req.nextUrl / req.url berisi
 * localhost:3121, sehingga redirect ke /login keluar sebagai https://localhost:3121/... Caddy meneruskan Host dan
 * X-Forwarded-Proto asli (app.raqio.id, https); pakai itu, dan jatuh ke origin request bila tidak ada (dev).
 */
export function publicOrigin(req: { headers: Headers; url: string }): string {
  const own = new URL(req.url);
  const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || req.headers.get("host") || own.host;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || own.protocol.replace(":", "");
  return `${proto}://${host}`;
}
