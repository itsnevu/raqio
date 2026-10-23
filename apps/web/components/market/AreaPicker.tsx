"use client";
// Pilih wilayah dengan mengeklik titik di peta (Leaflet + tile OpenStreetMap). Titik diterjemahkan jadi
// nama wilayah lewat reverse geocoding Nominatim lalu dikirim ke onPick; scraper tetap menerima teks nama.
// Leaflet menyentuh window, jadi dimuat dinamis di useEffect (komponen ini tetap aman di-render server).
import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { CircleMarker, Map as LeafletMap } from "leaflet";
import { areaName, nominatimUrl } from "@/lib/market/geo";

type Pick = { kind: "idle" | "busy" | "ok" | "err"; text: string };

export default function AreaPicker({ onPick }: { onPick: (name: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const [state, setState] = useState<Pick>({ kind: "idle", text: "" });

  useEffect(() => {
    let dead = false;
    let seq = 0;
    (async () => {
      const L = (await import("leaflet")).default;
      if (dead || !box.current || map.current) return;
      const m = L.map(box.current).setView([-2.6, 118], 5); // seluruh Indonesia
      // tile CARTO (boleh dipakai langsung dengan atribusi), bukan tile.openstreetmap.org yang memblokir
      // aplikasi anonim (403 "Access blocked"). Varian mengikuti tema: dark_all / light_all.
      const light = document.documentElement.dataset.theme === "light";
      L.tileLayer(`https://{s}.basemaps.cartocdn.com/${light ? "light_all" : "dark_all"}/{z}/{x}/{y}{r}.png`, {
        subdomains: "abcd",
        maxZoom: 20,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>',
      }).addTo(m);
      let dot: CircleMarker | null = null;
      m.on("click", async (e) => {
        dot?.remove();
        // warna tetap (atribut SVG Leaflet tidak membaca var() CSS); kontras cukup di tema gelap dan terang
        dot = L.circleMarker(e.latlng, { radius: 7, weight: 2, color: "#ffffff", fillColor: "#2563eb", fillOpacity: 1 }).addTo(m);
        const mine = ++seq; // klik lama yang masih di jalan tidak menimpa hasil klik terbaru
        setState({ kind: "busy", text: "Mencari nama wilayah…" });
        try {
          const r = await fetch(nominatimUrl(e.latlng.lat, e.latlng.lng, m.getZoom()));
          const j = (await r.json()) as { address?: Record<string, string> };
          const name = areaName(j.address || {});
          if (dead || mine !== seq) return;
          if (!name) throw new Error("kosong");
          setState({ kind: "ok", text: name });
          pickRef.current(name);
        } catch {
          if (!dead && mine === seq) setState({ kind: "err", text: "Nama wilayah tidak ditemukan, coba klik titik lain." });
        }
      });
      map.current = m;
    })();
    return () => {
      dead = true;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  return (
    <div className="mappick">
      <div ref={box} className="cv" aria-label="Peta pemilih wilayah" />
      <div className="mp-f" aria-live="polite">
        {state.kind === "idle" && <span>Perbesar peta, lalu klik titik untuk mengisi wilayah.</span>}
        {state.kind === "busy" && <span>{state.text}</span>}
        {state.kind === "ok" && <span>Terpilih: <b>{state.text}</b>. Nama bisa kamu rapikan di kolom wilayah.</span>}
        {state.kind === "err" && <span className="err">{state.text}</span>}
      </div>
    </div>
  );
}
