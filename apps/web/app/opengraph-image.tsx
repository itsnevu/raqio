// Gambar Open Graph default (1200x630) untuk share link: logo + tagline di atas latar hitam dengan
// aksen kuning brand. Dirender next/og saat diminta; tanpa aset eksternal supaya aman CSP dan offline.
import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Raqio — peta pasar industri apa pun";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#000", color: "#F2F2F0", padding: 72, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 56, height: 56, background: "#FFB020", color: "#000", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, fontWeight: 700 }}>R</div>
          <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: -1 }}>raqio</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05 }}>Peta pasar industri apa pun,</div>
          <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05, color: "#8A8F98", display: "flex" }}>
            wilayah mana pun.<span style={{ width: 220, height: 8, background: "#FFB020", alignSelf: "flex-end", marginLeft: 18, marginBottom: 14 }} />
          </div>
        </div>
        <div style={{ fontSize: 26, color: "#8A8F98" }}>Riset pasar lokal dari Google Maps dan website bisnis</div>
      </div>
    ),
    size,
  );
}
