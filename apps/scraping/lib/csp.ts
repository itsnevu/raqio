// Content-Security-Policy dengan nonce per request. Dipakai middleware (edge). Tidak ada cdnjs atau Google Fonts:
// font di-self-host lewat next/font, Swagger UI tidak dilayani Next.
export function buildCsp(nonce: string, dev: boolean): string {
  const script = dev
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'` // runtime dev Next (HMR, react-refresh) butuh eval
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`;
  return [
    "default-src 'self'",
    script,
    "style-src 'self' 'unsafe-inline'", // atribut style inline React
    "font-src 'self' data:",
    "img-src 'self' data: blob: https://*.basemaps.cartocdn.com https://www.google.com", // tile peta CARTO (AreaPicker; tile OSM memblokir aplikasi anonim) dan favicon bisnis (BizAvatar)
    "connect-src 'self' https://nominatim.openstreetmap.org", // reverse geocoding klik peta jadi nama wilayah
    "frame-src 'self'",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
  ].join("; ");
}

export function makeNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
}
