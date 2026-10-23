"use client";
// Penjelasan rumus angka di Raqio, dibuka dari ikon "?" di samping skor. Versi ringkas dari docs/SKOR.md.
import { useShell } from "@/components/Shell";

export type ScoreKind = "prospek" | "kekuatan" | "ringkasan" | "raqio";

const TITLE: Record<ScoreKind, string> = {
  prospek: "Skor prospek (0 sampai 100)",
  kekuatan: "Skor kekuatan (rata-rata Bayesian)",
  ringkasan: "Angka ringkasan laporan",
  raqio: "Skor peringkat publik (0 sampai 100)",
};

function Body({ kind }: { kind: ScoreKind }) {
  if (kind === "prospek")
    return (
      <>
        <p>Mengukur seberapa layak bisnis ini <b>dihubungi untuk ditawari jasa digital</b>, bukan seberapa bagus bisnisnya. Hanya dihitung setelah Cek kontak. Poin dijumlahkan lalu dipotong ke 0 sampai 100.</p>
        <table className="help-t">
          <tbody>
            <tr><td>Bisa WhatsApp</td><td>+25</td></tr>
            <tr><td>Ada telepon (bukan HP)</td><td>+10</td></tr>
            <tr><td>Ada email</td><td>+5</td></tr>
            <tr><td>Tanpa website</td><td>+20</td></tr>
            <tr><td>IG tidak ditemukan</td><td>+15</td></tr>
            <tr><td>Rating 4,5 ke atas (4,0 sampai 4,4)</td><td>+15 (+8)</td></tr>
            <tr><td>Ulasan 30 sampai 800 (di bawah 30)</td><td>+15 (+5)</td></tr>
            <tr><td>Ulasan sedang bertambah</td><td>+5</td></tr>
            <tr><td>Lebih dari satu cabang di wilayah</td><td>-25</td></tr>
            <tr><td>Ulasan di atas 800 (pemain besar)</td><td>-40</td></tr>
            <tr><td>Tidak ada kontak sama sekali</td><td>maks 20</td></tr>
          </tbody>
        </table>
        <p className="muted">Contoh: rating 4,6, 120 ulasan, bisa WhatsApp, tanpa website, IG tidak ditemukan = 25 + 20 + 15 + 15 + 15 = 90.</p>
      </>
    );
  if (kind === "kekuatan")
    return (
      <>
        <p>Rating ditarik ke rata-rata pasar sampai ulasannya cukup banyak, supaya rating 5,0 dari 6 ulasan tidak mengalahkan 4,7 dari 1.200 ulasan. Rumus yang sama dengan peringkat film IMDb.</p>
        <pre className="help-f">skor = v/(v+m) × R + m/(v+m) × C{"\n"}R = rating, v = ulasan, C = rata-rata pasar, m = median ulasan (min. 10)</pre>
        <p className="muted">Contoh pasar C = 4,5 dan m = 80: 5,0 dari 6 ulasan menjadi 4,53; 4,7 dari 1.200 ulasan menjadi 4,69.</p>
      </>
    );
  if (kind === "raqio")
    return (
      <>
        <p>Peringkat publik yang adil: bukan yang paling lama atau paling besar, tetapi yang paling disukai pelanggan secara terbukti.</p>
        <pre className="help-f">Skor = 60 × kualitas + 25 × skala + 15 × jangkauan{"\n"}kualitas  = (skor kekuatan − 1) / 4{"\n"}skala     = log(1+ulasan) / log(1+ulasan terbanyak di wilayah){"\n"}jangkauan = punya website, Instagram, WhatsApp (masing-masing 1/3)</pre>
        <p className="muted">60, 25, 15 adalah bobot (jumlahnya 100): penilaian pelanggan paling menentukan, ukuran dihitung logaritmik supaya 5.000 ulasan tidak 10 kali lebih berharga dari 500, jangkauan hanya pelengkap. Tiap baris peringkat memuat turunan angkanya lengkap. Cabang satu brand ditampilkan sekali. Lonjakan ulasan tidak wajar ditandai dan tidak ikut peringkat.</p>
        <p className="muted">Ambang kelayakan: halaman tayang hanya jika minimal 10 bisnis ber-rating, bisnis di bawah 5 ulasan tampil tanpa nomor peringkat, dan data lebih tua dari 30 hari tidak dipakai. Selengkapnya di <a href="/metodologi">/metodologi</a>.</p>
      </>
    );
  return (
    <>
      <ul className="help-l">
        <li><b>Jumlah bisnis</b>: hasil Maps setelah duplikat digabung, yang tutup dan di luar wilayah dibuang.</li>
        <li><b>Rating rata-rata</b>: rata-rata sederhana semua bisnis berating.</li>
        <li><b>Median ulasan</b>: nilai tengah, tidak diseret pemain besar.</li>
        <li><b>Porsi 3 teratas</b>: persen ulasan yang dipegang 3 bisnis terbesar. 50%+ dikuasai, 30 sampai 49% beberapa pemain kuat, di bawah 30% merata.</li>
        <li><b>Kematangan digital</b>: persen punya website, IG, WhatsApp dari sampel yang sudah Cek kontak.</li>
        <li><b>Hidden gem</b>: rating 4,7+ dengan 15 sampai 299 ulasan. <b>Pemain rapuh</b>: rating di bawah 4,3 dengan 150+ ulasan.</li>
      </ul>
    </>
  );
}

export default function ScoreHelp({ kind, label = "?" }: { kind: ScoreKind; label?: string }) {
  const { openDrawer } = useShell();
  return (
    <button type="button" className="help-btn" aria-label={"Cara hitung " + TITLE[kind]} title="Cara menghitung angka ini"
      onClick={(e) => { e.stopPropagation(); openDrawer(TITLE[kind], <div className="help-body"><Body kind={kind} /><p className="muted">Rumus lengkap dan contohnya: docs/SKOR.md di repositori.</p></div>); }}>
      {label}
    </button>
  );
}
