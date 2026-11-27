import type { Dict } from "./en";

// Bahasa Indonesia. Struktur dan href sama dengan en.ts. Ditulis sebagai bahasa bisnis yang lazim di Indonesia,
// bukan terjemahan kata per kata: istilah yang memang dipakai sehari-hari (dashboard, chat, deal, closing, follow up)
// tetap dalam bahasa Inggris. Nama produk (Research Agent, dst.) tidak diterjemahkan; kata umumnya "agen AI".
// Setiap angka bersumber dari docs/SKOR.md atau kode produk, tidak dikarang.
export const id: Dict = {
  nav: [
    { label: "Agen AI", media: { label: "Research Agent", tone: "a4", image: "/media/menu-agents.jpg" }, columns: [
      [{ heading: "Kenali pasar", links: [{ label: "Research Agent", href: "/agents/research" }, { label: "SEO Agent", href: "/agents/seo" }] }],
      [{ heading: "Jangkau pelanggan", links: [{ label: "Marketing Agent", href: "/agents/marketing" }, { label: "Customer Service Agent", href: "/agents/customer-service" }] },
       { heading: "Perbandingan", links: [{ label: "Bandingkan agen", href: "/compare" }] }],
    ] },
    { label: "Solusi", media: { label: "Klinik", tone: "a3", image: "/media/menu-solutions.jpg" }, columns: [
      [{ heading: "Berdasarkan industri", links: [{ label: "Klinik", href: "/solutions/clinics" }, { label: "Kuliner", href: "/solutions/fnb" }, { label: "Properti", href: "/solutions/property" }, { label: "Pendidikan", href: "/solutions/education" }, { label: "Ritel", href: "/solutions/retail" }] }],
      [{ heading: "Berdasarkan tim", links: [{ label: "Tim penjualan", href: "/solutions/sales" }, { label: "Layanan pelanggan", href: "/solutions/customer-service" }, { label: "Pemilik usaha", href: "/solutions/owners" }] }],
    ] },
    { label: "Riset", media: { label: "Cara kami menghitung skor", tone: "a2", image: "/media/menu-research.jpg" }, columns: [
      [{ heading: "Metode", links: [{ label: "Cara kami menghitung skor", href: "/research/scoring" }, { label: "Sumber data", href: "/research/sources" }, { label: "Skor peringkat publik", href: "/research/benchmarks" }] }],
      [{ heading: "Transparansi", links: [{ label: "Contoh laporan", href: "/research/samples" }, { label: "Batasan data kami", href: "/research/accuracy" }] }],
    ] },
    { label: "Wawasan", media: { cards: [{ title: "Cara membaca peta kompetitor dalam 10 menit", href: "/guides/competitor-map", tag: "Panduan", image: "/media/menu-guide.jpg" }, { title: "Mengelola chat WhatsApp tim tanpa ada deal yang terlewat", href: "/blog/team-inbox", tag: "Blog", image: "/media/menu-blog.jpg" }] }, columns: [
      [{ heading: "Artikel", links: [{ label: "Blog", href: "/blog" }, { label: "Panduan", href: "/guides" }, { label: "Perbandingan agen", href: "/compare" }] }],
      [{ heading: "Perusahaan", links: [{ label: "Tentang Raqio", href: "/about" }, { label: "Keamanan", href: "/security" }, { label: "Jadwalkan demo", href: "/demo" }] }],
    ] },
  ],
  hero: {
    headline: "Kenali pasar Anda. Jangkau pelanggan Anda.",
    tags: ["Klinik", "Kafe", "Toko Kelontong", "Apotek", "Barbershop", "Toko Roti"],
    focus: "Kompetitor · 4,6★",
    sourcesLabel: "Sumber data yang kami periksa",
    waLabel: "Satu dashboard, seluruh tim",
    detect: { status: "Memindai", area: "Jakarta Selatan", found: "Usaha ditemukan", sample: "Ilustrasi",
      records: [{ name: "Klinik Sehat Sentosa", meta: "★ 4,8 · 1.284 ulasan · 08.00–21.00" }, { name: "Kopi Tepi Jalan", meta: "★ 4,6 · 712 ulasan · 07.00–23.00" }, { name: "Apotek Sinar", meta: "★ 4,4 · 389 ulasan · 24 jam" }],
      leads: ["Skor prospek 91", "Skor prospek 87"], chats: [{ from: "Chat baru · Dental Care Plus", text: "Besok jam 10 masih ada slot?" }, { from: "Raqio · ditangani Rina", text: "Masih ada, sudah kami booking. Pengingat DP terkirim ✓" }] },
    trackLabels: { car: "Mobil", truck: "Truk", bus: "Bus", motorcycle: "Motor", person: "Orang", boat: "Kapal", bottle: "Botol", cup: "Gelas", bowl: "Mangkuk" },
    report: { area: "Klinik · Jakarta Selatan", business: "Usaha", reviews: "Ulasan", score: "Skor kekuatan", tabs: ["Kekuatan", "Ulasan", "5 km"] },
    stages: [
      { eyebrow: "", title: "Keputusan bisnis yang tepat dimulai dari data seluruh pasar.", body: "Raqio memetakan setiap usaha di industri dan wilayah Anda dari data publik Google Maps, lalu menilai semuanya dengan rumus yang sama. Hasilnya, rating 5,0 dari 6 ulasan tidak lagi mengungguli rating 4,7 dari 1.200 ulasan.", cta: null },
      { eyebrow: "Research Agent", title: "Ketahui posisi setiap kompetitor, lengkap dengan skornya.", body: "Pilih industri dan wilayah. Setiap usaha mendapat skor prospek 0–100: punya nomor WhatsApp +25, belum punya website +20, rating 4,5 ke atas +15. Usaha dengan skor 40 ke atas masuk daftar prospek.", cta: { label: "Pelajari Research Agent", href: "/agents/research" } },
      { eyebrow: "Customer Service Agent", title: "Semua chat WhatsApp tim dalam satu dashboard.", body: "Setiap chat tercatat sampai deal closing. Chat yang belum dibalas selama 4 jam operasional dihitung tidak terjawab, dan pengingat DP terkirim tepat waktu.", cta: { label: "Pelajari Customer Service Agent", href: "/agents/customer-service" } },
    ],
  },
  quote: {
    text: "Raqio mengganti tebakan dengan angka. Setiap usaha di pasar Anda punya skor prospek 0–100 dan skor kekuatan yang memperhitungkan jumlah ulasan, dan setiap chat pelanggan tercatat sampai deal closing.",
    attribution: "Alasan Raqio dibuat",
  },
  applications: {
    title: "Analisis Pasar",
    prefix: "Untuk",
    rotator: ["Klinik", "Kuliner", "Properti", "Pendidikan", "Ritel", "Otomotif", "Kecantikan", "Logistik"],
    cta: { label: "Lihat semua industri", href: "/solutions/clinics" },
  },
  carousel: {
    title: "Dirancang sesuai cara usaha lokal berjualan.",
    cards: [
      { tag: "Klinik", title: "Temukan semua klinik dalam radius 5 km dan lihat mana yang aktif membalas ulasan.", icon: "map" },
      { tag: "Kuliner", title: "Bandingkan outlet berdasarkan rating, jumlah ulasan, dan harga sebelum menentukan lokasi.", icon: "chart" },
      { tag: "Properti", title: "Teruskan setiap pertanyaan listing di WhatsApp ke agen properti yang tepat.", icon: "chat" },
      { tag: "Pendidikan", title: "Kirim pengingat DP ke orang tua murid sebelum pendaftaran ditutup.", icon: "bell" },
      { tag: "Ritel", title: "Pantau kompetitor yang baru buka, tutup, atau mengubah harga di area Anda.", icon: "pin" },
      { tag: "Pemilik Usaha", title: "Pantau pipeline, chat yang lebih dari 4 jam operasional belum dibalas, dan kas masuk setiap pagi.", icon: "chart" },
    ],
  },
  cardGrid: {
    title: "Empat agen AI. Satu pasar, digarap dari riset sampai closing.",
    cards: [
      { icon: "research", title: "Research Agent", body: "Memetakan setiap usaha di industri dan wilayah Anda, lalu memberi skor prospek 0–100. Usaha dengan skor 40 ke atas layak dihubungi.", cta: { label: "Research Agent", href: "/agents/research" }, fill: "a2" },
      { icon: "prospects", title: "SEO Agent", body: "Menghitung skor peringkat 0–100 per industri dan wilayah: 60% kualitas ulasan, 25% skala usaha, 15% jangkauan.", cta: { label: "SEO Agent", href: "/agents/seo" }, fill: "a3" },
      { icon: "reach", title: "Marketing Agent", body: "Menyusun dan mengirim pesan personal lewat WhatsApp, Instagram, dan email ke prospek yang dipilih berdasarkan skornya.", cta: { label: "Marketing Agent", href: "/agents/marketing" }, fill: "a4" },
      { icon: "inbox", title: "Customer Service Agent", body: "Mengelola dashboard WhatsApp tim, deal, dan pengingat DP. Chat yang belum dibalas 4 jam operasional dihitung tidak terjawab.", cta: { label: "Customer Service Agent", href: "/agents/customer-service" }, fill: "a2" },
    ],
  },
  blog: {
    title: "Wawasan dari lapangan.",
    posts: [
      { tag: "Panduan", title: "Cara membaca peta kompetitor dalam 10 menit", href: "/guides/competitor-map", hero: true },
      { tag: "Produk", title: "Cara Raqio menghitung skor kekuatan usaha", href: "/research/scoring" },
      { tag: "Blog", title: "Mengelola chat WhatsApp tim tanpa ada deal yang terlewat", href: "/blog/team-inbox" },
      { tag: "Panduan", title: "Memilih lokasi usaha dengan data ulasan", href: "/guides/location" },
      { tag: "Produk", title: "Pengingat DP yang tidak diabaikan pelanggan", href: "/blog/dp-reminders" },
      { tag: "Blog", title: "Menghitung chat tak terjawab dengan adil", href: "/blog/unanswered" },
    ],
  },
  videoCta: { title: "Kenali pasarnya. Lalu menangkan.", body: "Jadwalkan demo singkat dan lihat laporan untuk industri serta wilayah Anda secara langsung.", cta: { label: "Jadwalkan demo", href: "/demo" } },
  footer: {
    columns: [
      { heading: "Agen AI", links: [{ label: "Research Agent", href: "/agents/research" }, { label: "SEO Agent", href: "/agents/seo" }, { label: "Marketing Agent", href: "/agents/marketing" }, { label: "Customer Service Agent", href: "/agents/customer-service" }] },
      { heading: "Solusi", links: [{ label: "Klinik", href: "/solutions/clinics" }, { label: "Kuliner", href: "/solutions/fnb" }, { label: "Properti", href: "/solutions/property" }, { label: "Pendidikan", href: "/solutions/education" }] },
      { heading: "Riset", links: [{ label: "Cara kami menghitung skor", href: "/research/scoring" }, { label: "Sumber data", href: "/research/sources" }] },
      { heading: "Wawasan", links: [{ label: "Blog", href: "/blog" }, { label: "Panduan", href: "/guides" }, { label: "Perbandingan agen", href: "/compare" }] },
      { heading: "Perusahaan", links: [{ label: "Tentang Raqio", href: "/about" }, { label: "Keamanan", href: "/security" }, { label: "Jadwalkan demo", href: "/demo" }, { label: "Riset", href: "/research" }] },
    ],
    wordmark: "Kenali pasar Anda. Jangkau pelanggan Anda.",
  },
  ui: {
    home: "Beranda Raqio", main: "Utama", menu: "Menu", menuSuffix: "menu", openMenu: "Buka menu", closeMenu: "Tutup menu",
    login: "Masuk", getStarted: "Mulai", scroll: "Scroll untuk lanjut", skip: "Langsung ke konten",
    prev: "Sebelumnya", next: "Berikutnya", language: "Bahasa", pauseVideo: "Jeda video", playVideo: "Putar video",
    sections: { intro: "Pengantar", why: "Mengapa Raqio", industries: "Industri", useCases: "Contoh pemakaian", products: "Produk", latest: "Terbaru", demo: "Jadwalkan demo" },
    report: { label: "Pratinjau contoh laporan", scope: "Klinik · Jakarta Selatan", sample: "Contoh" },
    legal: "Privasi · Ketentuan",
  },
};
