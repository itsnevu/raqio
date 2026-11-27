// Shared by server (layout.tsx reads the cookie) and client (i18n.tsx writes it). Must NOT be a "use client" module.
export type Lang = "en" | "id";
export const LANG_COOKIE = "raqio_lang";
