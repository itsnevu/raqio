"use client";
// Error boundary per segmen (market, prospects, watch, settings). Pesan teknis hanya di console, bukan ke pengguna.
import { useEffect } from "react";

export default function SegmentError({ error, reset, title = "Halaman gagal dimuat" }: { error: Error & { digest?: string }; reset: () => void; title?: string }) {
  useEffect(() => {
    console.error("[raqio] segment error:", error);
  }, [error]);
  const stale = /ChunkLoadError|Loading chunk|reading 'call'|__webpack_modules__/.test(String(error?.message));
  return (
    <div className="wrap">
      <div className="load-err" role="alert">
        <b>{title}</b>
        <p>
          {stale
            ? "Browser masih memegang file JavaScript dari versi sebelumnya. Muat ulang penuh (Ctrl+Shift+R) biasanya cukup."
            : "Terjadi kesalahan di sisi browser. Coba lagi; kalau terus terjadi, muat ulang halaman."}
        </p>
        {error?.digest && <p className="muted-note">Kode: {error.digest}</p>}
        <div className="acts-row" style={{ marginTop: 12 }}>
          <button type="button" className="btn" onClick={reset}>Coba lagi</button>
          <button type="button" className="btn ghost" onClick={() => location.reload()}>Muat ulang</button>
        </div>
      </div>
    </div>
  );
}
