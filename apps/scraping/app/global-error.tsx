"use client";
// Dipakai hanya kalau layout root sendiri gagal: harus merender <html> dan <body> sendiri.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="id">
      <body style={{ margin: 0, background: "#000", color: "#E5E5E5", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ maxWidth: 640, margin: "80px auto", padding: "28px 24px", border: "1px solid #262626" }}>
          <h1 style={{ fontSize: 24, fontWeight: 400, margin: "0 0 8px" }}>Raqio tidak bisa dimuat</h1>
          <p style={{ color: "#A6A6A6" }}>Terjadi kesalahan di sisi browser. Coba lagi atau muat ulang halaman.</p>
          {error?.digest && <p style={{ color: "#767676", fontSize: 12 }}>Kode: {error.digest}</p>}
          <button type="button" onClick={reset} style={{ padding: "8px 14px", background: "#FFB020", color: "#000", border: 0, fontWeight: 700, marginRight: 8 }}>Coba lagi</button>
          <button type="button" onClick={() => location.reload()} style={{ padding: "8px 14px", background: "transparent", color: "#E5E5E5", border: "1px solid #262626" }}>Muat ulang</button>
        </div>
      </body>
    </html>
  );
}
