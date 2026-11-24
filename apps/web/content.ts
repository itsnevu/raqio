const httpUrl = (value?: string) => {
  if (!value) return undefined;
  try { const url = new URL(value); return ["http:","https:"].includes(url.protocol) ? url.href : undefined; }
  catch { return undefined; }
};

export const copy = {
  locale: "id",
  headline: ["Kenali pasar.", "Dekati pelanggan."],
  introduction: "Riset pasar lokal dan kelola percakapan WhatsApp pelanggan dalam dua produk yang mengisi kebutuhan berbeda.",
  problems: [
    ["Pasar berubah.", "Pemain baru bermunculan. Butuh waktu untuk membandingkan wilayah dan memahami persaingan."],
    ["Prospek tercecer.", "Kontak, catatan, dan rencana tindak lanjut tersebar di berbagai tempat."],
    ["Pesan menumpuk.", "Saat banyak pelanggan masuk bersamaan, tim perlu tahu percakapan mana yang harus ditangani."],
  ],
  faq: [
    ["Apa itu RAQIO?", "RAQIO menyediakan Competitor Scraping untuk riset pasar lokal dan WA-Suite untuk mengelola percakapan pelanggan."],
    ["Dari mana data riset berasal?", "Riset menggunakan sumber publik, termasuk listing Google Maps dan situs bisnis. Cakupan bergantung pada wilayah dan ketersediaan sumber."],
    ["Bagaimana WhatsApp Business dipakai?", "WA-Suite menautkan nomor WhatsApp Business sebagai perangkat tertaut. Dashboard ini berjalan terpisah dari aplikasi WhatsApp."],
    ["Berapa biayanya?", "Periksa pilihan yang tersedia di aplikasi, atau hubungi RAQIO untuk membahas kebutuhan tim Anda."],
    ["Bisakah saya meminta demo?", "Gunakan halaman Kontak untuk menyiapkan permintaan demo dan memilih produk yang ingin dibahas."],
  ],
} as const;

export const products = {
  "competitor-scraping": {
    name:"Competitor Scraping",
    title:"Lihat peta pasar dengan lebih jelas.",
    description:"Cari pemain di industri dan wilayah tertentu, bandingkan hasil riset, lalu susun daftar prospek yang layak ditindaklanjuti.",
    features:[
      ["Riset wilayah", "Pilih industri dan wilayah untuk melihat pemain serta profil bisnis dari sumber publik."],
      ["Bandingkan pasar", "Tinjau beberapa wilayah dan bandingkan hasil riset sebelum menentukan fokus."],
      ["Kelola prospek", "Simpan bisnis yang menarik, cek kontak, dan lacak tindak lanjut di papan prospek."],
      ["Pantau perubahan", "Riset ulang wilayah pilihan secara berkala untuk melihat pemain baru."],
    ],
    url:httpUrl(process.env.NEXT_PUBLIC_SCRAPING_APP_URL ?? process.env.NEXT_PUBLIC_SCRAPING_URL),
  },
  "wa-suite": {
    name:"WA-Suite",
    title:"Percakapan pelanggan yang lebih tertata.",
    description:"Kelola beberapa nomor WhatsApp Business, berikan penugasan kepada agen, dan gunakan template untuk menjawab pertanyaan berulang.",
    features:[
      ["Inbox beberapa nomor", "Tautkan nomor WhatsApp Business sebagai sesi terpisah dan pantau percakapannya dari dashboard."],
      ["Penugasan agen", "Atur siapa yang bertanggung jawab menangani percakapan pelanggan."],
      ["Template dan label", "Simpan jawaban umum dan tandai percakapan agar lebih mudah ditindaklanjuti."],
      ["Aturan balasan", "Tentukan pola pesan dan respons untuk kebutuhan yang berulang."],
    ],
    url:httpUrl(process.env.NEXT_PUBLIC_WASUITE_APP_URL ?? process.env.NEXT_PUBLIC_WASUITE_URL),
  },
} as const;
export type ProductKey = keyof typeof products;
export const productPath = (key:ProductKey) => "/produk/"+key;
const scrapingOrigin=products["competitor-scraping"].url ??
  (process.env.NODE_ENV==="development"?"http://localhost:3002":undefined);
export const loginPath=scrapingOrigin
  ? new URL("/login?next=%2Fpilih-produk",scrapingOrigin).href
  : "/kontak";
export const contactEmail = /^[\w.!#$%&'*+/=?^`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(process.env.NEXT_PUBLIC_RAQIO_CONTACT_EMAIL ?? "") ?
  process.env.NEXT_PUBLIC_RAQIO_CONTACT_EMAIL : undefined;
