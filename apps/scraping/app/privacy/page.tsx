import "../login/login.css";

// Draf kebijakan privasi dan aturan pakai. Wajib ditinjau penasihat hukum sebelum ada pelanggan berbayar.
export default function PrivacyPage() {
  return (
    <div className="wrap" style={{ maxWidth: 760 }}>
      <h1>Privasi dan aturan pakai</h1>
      <p className="lead">Draf. Berlaku untuk layanan Raqio.</p>

      <h3>Data yang kami simpan</h3>
      <ul>
        <li>Akun: email, nama, dan password yang disimpan dalam bentuk hash.</li>
        <li>Data riset: daftar bisnis dari sumber publik (Google Maps, website bisnis), termasuk nama, alamat, telepon, website, dan akun media sosial yang dipublikasikan bisnis tersebut.</li>
        <li>Catatan follow up yang kamu tulis sendiri di papan prospek.</li>
      </ul>

      <h3>Dasar dan tujuan pemrosesan</h3>
      <p>Data bisnis dikumpulkan dari informasi yang bisnis itu publikasikan sendiri, untuk kepentingan riset pasar dan penawaran bisnis ke bisnis (B2B). Kami tidak mengumpulkan data pribadi konsumen.</p>

      <h3>Retensi</h3>
      <p>Laporan riset dihapus otomatis setelah 90 hari. Riwayat job dihapus setelah 30 hari. Akun dan seluruh datanya dihapus saat kamu memilih hapus akun di pengaturan.</p>

      <h3>Aturan pakai</h3>
      <ul>
        <li>Hubungi bisnis secukupnya: satu pesan perkenalan, bukan pesan massal. Pelanggaran dapat berakibat akun ditutup.</li>
        <li>Dilarang menjual ulang atau mempublikasikan data kontak yang diperoleh dari layanan ini.</li>
        <li>Kamu bertanggung jawab atas isi pesan yang kamu kirim ke bisnis lain.</li>
      </ul>

      <h3>Hak kamu</h3>
      <p>Kamu bisa meminta salinan, perbaikan, atau penghapusan data akunmu kapan saja lewat pengaturan atau email ke pengelola layanan.</p>
    </div>
  );
}
