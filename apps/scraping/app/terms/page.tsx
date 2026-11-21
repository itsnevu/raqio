// Syarat Layanan Raqio. Halaman publik (routes.ts PUBLIC_PAGES), ditautkan dari pendaftaran dan footer.
// Memakai gaya dokumen yang sama dengan /metodologi.
import type { Metadata } from "next";
import Link from "next/link";
import "../metodologi/metodologi.css";

export const metadata: Metadata = {
  title: "Syarat Layanan | Raqio",
  description: "Syarat penggunaan layanan Raqio: akun, kuota, pembayaran, sumber data, dan batasan tanggung jawab.",
};

export default function TermsPage() {
  return (
    <div className="wrap metod">
      <h1>Syarat Layanan</h1>
      <p className="lead">Berlaku sejak 23 Oktober 2026. Dengan membuat akun atau memakai Raqio, kamu menyetujui syarat di bawah ini.</p>

      <h2>1. Layanan</h2>
      <p>
        Raqio adalah alat riset pasar lokal: memetakan bisnis dari data publik Google Maps dan website bisnis,
        menyusun laporan, papan prospek, pantauan berkala, dan peringkat publik. Raqio bukan afiliasi Google.
      </p>

      <h2>2. Akun dan tim</h2>
      <ul>
        <li>Kamu bertanggung jawab atas keamanan akun dan semua aktivitas di dalamnya. Password bisa diganti di Pengaturan; sesi lain dicabut otomatis saat password berganti.</li>
        <li>Mode tamu bersifat sementara: org tamu dan datanya dihapus otomatis setelah masa uji berakhir, kecuali disimpan jadi akun.</li>
        <li>Satu org dipakai bersama anggota timnya; pemilik akun (owner) bertanggung jawab atas anggota yang diundangnya.</li>
      </ul>

      <h2>3. Kuota dan paket</h2>
      <ul>
        <li>Setiap paket punya kuota bulanan (riset, cek kontak, pantauan, pesan asisten) yang tercantum di Pengaturan. Kuota riset yang gagal dikembalikan otomatis.</li>
        <li>Paket berbayar berlaku 30 hari sejak pembayaran. Kami mengirim peringatan sebelum masa paket berakhir; setelah berakhir akun kembali ke paket Free tanpa menghapus data.</li>
        <li>Pembayaran diproses penyedia pihak ketiga (Xendit). Harga dapat berubah dengan pemberitahuan di muka; perubahan tidak berlaku surut untuk masa paket yang sudah dibayar.</li>
      </ul>

      <h2>4. Sumber data dan batasannya</h2>
      <ul>
        <li>Data bisnis berasal dari sumber publik (Google Maps dan website bisnis) pada tanggal pemindaian, lalu disaring dengan standar yang dipublikasikan di <Link href="/metodologi">/metodologi</Link>.</li>
        <li>Angka di laporan adalah estimasi batas bawah dari data publik — bukan audit resmi dan bisa berbeda dari keadaan terbaru. Keputusan bisnis atas dasar laporan sepenuhnya tanggung jawab pengguna.</li>
        <li>Pemilik bisnis yang keberatan datanya tampil di peringkat publik dapat memakai tombol "Laporkan data keliru" atau mengklaim halamannya; koreksi diterapkan pada pemindaian berikutnya.</li>
      </ul>

      <h2>5. Penggunaan yang dilarang</h2>
      <ul>
        <li>Menjual ulang akses, membagikan akun ke luar tim, atau mengakali kuota dan batas laju.</li>
        <li>Memakai data kontak untuk spam yang melanggar hukum yang berlaku (termasuk ketentuan anti-spam platform pesan).</li>
        <li>Mengganggu layanan, mencoba mengakses data org lain, atau merekayasa balik sistem untuk tujuan merugikan.</li>
      </ul>

      <h2>6. Data dan privasi</h2>
      <p>
        Pemrosesan data pribadi diatur di <Link href="/privacy">Kebijakan Privasi</Link>. Kamu bisa mengunduh seluruh
        data org (Pengaturan → Keamanan &amp; data) dan menghapus akun kapan saja; penghapusan bersifat permanen.
      </p>

      <h2>7. Penghentian</h2>
      <p>
        Kami dapat menangguhkan akun yang melanggar syarat ini setelah pemberitahuan yang wajar, kecuali pelanggaran
        berat yang membutuhkan tindakan segera. Kamu dapat berhenti kapan saja; sisa masa paket berbayar yang belum
        terpakai tidak dikembalikan kecuali diwajibkan hukum.
      </p>

      <h2>8. Batasan tanggung jawab</h2>
      <p>
        Layanan diberikan sebagaimana adanya. Sepanjang diizinkan hukum, tanggung jawab Raqio atas kerugian yang
        timbul dari penggunaan layanan dibatasi sebesar jumlah yang kamu bayarkan dalam 3 bulan terakhir.
      </p>

      <h2>9. Perubahan syarat</h2>
      <p>
        Perubahan material diumumkan di aplikasi sebelum berlaku. Terus memakai layanan setelah tanggal berlaku
        berarti menyetujui syarat yang baru.
      </p>

      <p className="muted foot">
        Pertanyaan tentang syarat ini: hubungi pengelola lewat alamat di halaman <Link href="/privacy">Privasi</Link>.
        Lihat juga <Link href="/metodologi">Metodologi</Link>.
      </p>
    </div>
  );
}
