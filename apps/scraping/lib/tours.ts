// Isi panduan tiap halaman. Selector menunjuk elemen yang sudah ada; langkah yang elemennya belum ada dilewati.
import type { TourStep } from "./tour";

export const MARKET_TOUR: TourStep[] = [
  { popover: { title: "Selamat datang di Raqio", description: "Dalam satu menit kamu tahu cara riset satu pasar, membaca hasilnya, dan menghubungi prospek. Tekan Lanjut." } },
  { element: ".mode", popover: { title: "Satu wilayah atau bandingkan", description: "Riset satu wilayah untuk detail lengkap, atau bandingkan beberapa wilayah untuk memilih yang paling berpeluang." } },
  { element: ".goal", popover: { title: "Tujuan riset", description: "Cari calon klien: isi industri bisnis yang mau kamu tawari. Pelajari pesaing: isi industri bisnismu sendiri. Ini mengubah cara laporan dibaca." } },
  { element: "form.search", popover: { title: "Industri dan wilayah", description: "Contoh: \"coffee shop\" dan \"Kemang Jakarta\". Riset memakan 2 sampai 4 menit, kamu boleh pindah halaman sambil menunggu." } },
  { element: ".recent", popover: { title: "Riset sebelumnya", description: "Semua laporan tim kamu ada di sini. Klik untuk membuka lagi tanpa riset ulang." } },
  { element: ".rh .acts", popover: { title: "Pantau, ekspor, cetak", description: "Pantau mingguan meriset ulang otomatis dan menunjukkan apa yang berubah. Ekspor CSV untuk spreadsheet, Cetak laporan untuk PDF rapi yang bisa dikirim ke klien." } },
  { element: ".rtabs", popover: { title: "Tiga tab laporan", description: "Ringkasan: kesimpulan bahasa awam. Semua pemain: grafik dan tabel lengkap. Prospek: daftar yang layak dihubungi, satu per satu." } },
  { element: ".verdict", popover: { title: "Kesimpulan", description: "Seberapa padat pasarnya, di mana celah terbesar, dan langkah berikutnya. Angka lengkap ada di bawahnya kalau mau dicek." } },
  { element: ".tools .filters", popover: { title: "Filter cepat", description: "Prospek, bisa WhatsApp, tanpa website, hidden gem, rating rendah tapi ramai. Klik kolom tabel untuk mengurutkan." } },
  { element: ".chk", popover: { title: "Cek kontak", description: "Telepon, website, dan Instagram diambil saat diminta supaya hemat. Klik Cek pada bisnis yang menarik. Tiap cek memakai kuota." } },
  { element: ".nm-btn", popover: { title: "Detail bisnis", description: "Klik nama bisnis untuk panel detail: kontak, draf pesan WhatsApp, status follow up, dan analisis Instagram." } },
  { element: ".fab", popover: { title: "Tanya asisten", description: "Pertanyaan bebas soal pasar atau pesaing, dijawab dari data risetmu." } },
  { element: "nav details.more", popover: { title: "Pengaturan dan panduan", description: "Kuota, anggota tim, paket, dan tombol Panduan untuk memutar ulang tur ini kapan saja." } },
];

export const PROSPECTS_TOUR: TourStep[] = [
  { popover: { title: "Papan prospek", description: "Semua bisnis yang layak dihubungi dari seluruh riset, dikelola seperti papan kanban." } },
  { element: ".strip", popover: { title: "Ringkasan", description: "Total prospek, yang jatuh tempo follow up hari ini, yang sedang berjalan, dan deal." } },
  { element: ".bar", popover: { title: "Cari dan saring", description: "Cari nama atau catatan, batasi ke satu riset, atau tampilkan hanya yang jatuh tempo." } },
  { element: ".offer", popover: { title: "Jasa yang kamu tawarkan", description: "Satu kalimat ini dipakai otomatis di semua draf pesan WhatsApp. Tersimpan untuk seluruh tim." } },
  { element: ".col[data-col=baru], .col", popover: { title: "Geser kartu", description: "Seret kartu antar kolom untuk mengubah status, atau klik tombol panah di kartu. Klik WhatsApp langsung menandai Dihubungi." } },
  { element: ".card", popover: { title: "Kartu prospek", description: "Skor 0 sampai 100 menunjukkan seberapa cocok. Klik kartu untuk detail, catatan, dan tanggal pengingat." } },
];

export const WATCH_TOUR: TourStep[] = [
  { popover: { title: "Pantau", description: "Wilayah yang dipantau diriset ulang otomatis tiap minggu. Di sini terlihat apa yang berubah." } },
  { element: ".item", popover: { title: "Satu wilayah", description: "Pesaing baru, rating naik atau turun, bisnis yang makin ramai, dan yang hilang dari Maps." } },
  { element: ".item .acts", popover: { title: "Aksi", description: "Buka laporan terbaru, riset ulang sekarang, atau nyalakan dan matikan pantauan. Jumlah wilayah pantau dibatasi paket." } },
];

export const CHAT_TOUR: TourStep[] = [
  { popover: { title: "Asisten", description: "Tanya bebas dalam bahasa Indonesia. Asisten membaca data riset tim kamu, bisa mencari data baru, dan bisa mengubah status prospek atau pantauan atas permintaanmu." } },
  { element: ".chips", popover: { title: "Saran pertanyaan", description: "Saran mengikuti halaman yang sedang kamu buka. Klik salah satu untuk mencoba." } },
  { element: ".chatp form", popover: { title: "Kirim", description: "Enter untuk kirim, Shift+Enter untuk baris baru. Tekan Stop kalau jawabannya kelamaan. Sisa kuota chat bulan ini tertulis di bawahnya." } },
  { element: ".chatbar", popover: { title: "Riwayat dan chat baru", description: "Percakapan tersimpan per tim. Buka Riwayat untuk melanjutkan yang lama, atau mulai Chat baru. Percakapan yang sama juga ada di tombol Tanya asisten di halaman lain." } },
];

export const SETTINGS_TOUR: TourStep[] = [
  { element: ".key3", popover: { title: "Kuota bulan ini", description: "Riset dan cek kontak dihitung per bulan, direset tiap tanggal 1. Wilayah pantau dibatasi per paket." } },
  { element: ".bz-sec", popover: { title: "Paket", description: "Upgrade untuk kuota lebih besar dan anggota tim lebih banyak. Tagihan tercatat di bawahnya." } },
  { element: ".bz-sec:nth-of-type(2)", popover: { title: "Anggota tim", description: "Undang lewat email. Semua anggota berbagi laporan, prospek, dan kuota yang sama." } },
];
