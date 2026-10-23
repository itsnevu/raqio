// Metodologi publik Raqio: standar penyaringan data, rumus semua skor, ambang kelayakan peringkat, dan
// riwayat perubahan standar. Halaman ini publik (routes.ts PUBLIC_PAGES) dan menjadi rujukan tetap dari
// /top dan laporan. Angka di sini harus sinkron dengan STANDARDS di services/scraper/market.py dan
// konstanta rankMin* di apps/api/rank.go; naikkan versi + tambah changelog setiap aturan berubah.
import type { Metadata } from "next";
import Link from "next/link";
import "./metodologi.css";

export const metadata: Metadata = {
  title: "Metodologi | Raqio",
  description: "Standar data dan rumus skor Raqio: penyaringan, peringkat tertimbang, ambang kelayakan, dan riwayat perubahan standar.",
};

export default function MetodologiPage() {
  return (
    <div className="wrap metod">
      <h1>Metodologi</h1>
      <p className="lead">
        Semua angka Raqio berasal dari data publik Google Maps dan website bisnis, disaring dengan aturan
        yang dipublikasikan di halaman ini. Posisi peringkat tidak bisa dibeli. Standar berlaku saat ini:
        <b> versi 2</b>, sejak 23 Oktober 2026.
      </p>

      <h2>Sumber dan penyaringan data</h2>
      <ul>
        <li>Sumber: pindaian langsung Google Maps dan website tiap bisnis saat riset dijalankan, bukan database pihak ketiga. Tanggal pindaian tercantum di setiap halaman.</li>
        <li>Dibuang sebelum dihitung: bisnis tutup permanen atau tutup sementara, nama di bawah 2 karakter, lokasi di luar 2,5× jarak median wilayah (batas 3 sampai 15 km), dan kategori yang tidak relevan dengan industri yang dicari.</li>
        <li>Duplikat digabung bila: place_id sama; atau nomor HP sama dengan kemiripan nama ≥ 70; atau website sama dan lokasi berdekatan; atau jarak ≤ 150 m dengan kemiripan nama ≥ 88.</li>
        <li>Cabang satu brand (akun IG/website sama, atau nama inti sama) dikelompokkan dan di peringkat publik ditampilkan sekali.</li>
        <li>Pengaman: bila penyaring relevansi membuang lebih dari 75% hasil, penyaring dianggap salah dan tidak diterapkan, lalu ditandai di laporan.</li>
      </ul>

      <h2>Skor peringkat publik (0 sampai 100)</h2>
      <pre>Skor = 60 × kualitas + 25 × skala + 15 × jangkauan{"\n"}kualitas  = (rating Bayesian − 1) / 4{"\n"}skala     = log(1+ulasan) / log(1+ulasan terbanyak di wilayah){"\n"}jangkauan = punya website, Instagram, WhatsApp (masing-masing 1/3)</pre>
      <p>
        Rating Bayesian menarik rating ke rata-rata wilayah sampai jumlah ulasannya meyakinkan
        (<code>v/(v+m) × R + m/(v+m) × C</code>, dengan m = median ulasan wilayah, minimal 10) — rating 5,0 dari
        6 ulasan tidak mengalahkan 4,7 dari 1.200 ulasan. Skala logaritmik membuat 5.000 ulasan tidak dihargai
        10 kali lipat dari 500. Jumlah ulasan mentah tidak pernah dipakai sebagai peringkat. Setiap baris di
        halaman peringkat menampilkan turunan angkanya lengkap, dan setiap bisnis bisa dicek sendiri di Google Maps.
      </p>

      <h2>Ambang kelayakan peringkat</h2>
      <ul>
        <li>Halaman peringkat tayang hanya jika minimal <b>10</b> bisnis ber-rating di pasangan industri + wilayah itu.</li>
        <li>Bisnis dengan kurang dari <b>5</b> ulasan tampil di daftar tanpa nomor peringkat (&quot;belum cukup ulasan&quot;).</li>
        <li>Data lebih tua dari <b>30</b> hari tidak dipakai; halaman yang ramai dilihat dipindai ulang berkala.</li>
        <li>Anti-manipulasi: lonjakan ulasan lebih dari <b>50%</b> pada bisnis dengan ≥ 100 ulasan ditandai, dikeluarkan dari peringkat, dan diberi label &quot;perlu dicek&quot;.</li>
      </ul>

      <h2>Skor di dalam laporan riset</h2>
      <ul>
        <li><b>Skor kekuatan</b>: rating Bayesian yang sama dengan komponen kualitas di atas; dihitung worker dan tersimpan di tiap laporan.</li>
        <li><b>Skor prospek (0 sampai 100)</b>: kelayakan dihubungi untuk ditawari jasa, bukan kualitas bisnis. Bobotnya terbuka: bisa WhatsApp +25, telepon +10, email +5, tanpa website +20, IG tidak ditemukan +15, rating ≥ 4,5 +15 (≥ 4,0 +8), ulasan 30–800 +15 (&lt; 30 +5), sedang tumbuh +5, jaringan bercabang −25, ulasan &gt; 800 −40, tanpa kontak maksimal 20.</li>
        <li><b>Pangsa pasar</b> memakai jumlah ulasan sebagai proxy volume pelanggan; konsentrasi memakai HHI dengan ambang baku (&gt; 2500 terkonsentrasi, &gt; 1500 cukup terkonsentrasi).</li>
      </ul>

      <h2>Koreksi dan klaim</h2>
      <p>
        Setiap halaman peringkat punya tombol <i>Laporkan data keliru</i> (anonim, ditinjau operator) dan tautan
        <i> Cek sendiri di Google Maps</i> per bisnis. Pemilik bisnis dapat mengklaim halamannya gratis. Data bisnis
        yang terbukti keliru diperbaiki atau dikeluarkan pada pindaian berikutnya.
      </p>

      <h2>Riwayat perubahan standar</h2>
      <ul className="log">
        <li><b>v2 — 23 Oktober 2026.</b> Peringkat resmi pindah dari jumlah ulasan mentah ke rata-rata tertimbang Bayesian; ambang kelayakan halaman (≥ 10 bisnis ber-rating) dan ambang peringkat per bisnis (≥ 5 ulasan) diberlakukan; standar lengkap mulai disimpan di dalam setiap laporan.</li>
        <li><b>v1 — Oktober 2026.</b> Rilis awal: penyaringan tutup/duplikat/luar wilayah, skor prospek, skor 60/25/15 untuk peringkat publik, penanda lonjakan ulasan.</li>
      </ul>

      <p className="muted foot">
        Pertanyaan soal metodologi atau keberatan atas suatu halaman: gunakan tombol laporan di halaman terkait.
        Lihat juga <Link href="/top">semua peringkat</Link>.
      </p>
    </div>
  );
}
