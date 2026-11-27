"use client";
import { useEffect, useState } from "react";

/**
 * Tombol tema terang/gelap di sidebar. Terang adalah bawaan; pilihan disimpan di cookie raqio_theme supaya server
 * langsung merender <html data-theme> yang benar (app/layout.tsx), tanpa kedip saat halaman dimuat.
 */
export default function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.dataset.theme === "dark"), []);

  const toggle = () => {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    document.cookie = `raqio_theme=${next}; path=/; max-age=31536000; samesite=lax`;
    setDark(!dark);
  };

  const label = dark ? "Tema terang" : "Tema gelap";
  return (
    <button type="button" className="theme-toggle" onClick={toggle} aria-pressed={dark} title={dark ? "Ganti ke tema terang" : "Ganti ke tema gelap"}>
      {dark ? (
        <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
      ) : (
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" /></svg>
      )}
      {label}
    </button>
  );
}
