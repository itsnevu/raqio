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
    ["Apa perbedaan kedua produk RAQIO?", "Competitor Scraping membantu Anda meneliti pasar dan menyusun prospek. WA-Suite membantu tim menangani percakapan WhatsApp pelanggan."],
    ["Dari mana data riset pasar berasal?", "Riset menggunakan sumber publik, termasuk listing bisnis di Google Maps dan situs bisnis. Cakupan sumber bergantung pada wilayah dan ketersediaan data."],
    ["Bisakah tim menangani lebih dari satu nomor WhatsApp?", "Ya. Di WA-Suite, tiap nomor yang ditautkan memiliki sesi sendiri dan dapat diakses melalui dashboard sesuai akses pengguna."],
    ["Apakah kedua produk bisa dipakai terpisah?", "Ya. Masing-masing produk memiliki aplikasi dan alur masuk sendiri."],
  ],
} as const;

export const products = {
  "competitor-scraping": {
    name:"Competitor Scraping",
    title:"Lihat peta pasar dengan lebih jelas.",
    description:"Cari pemain di industri dan wilayah tertentu, bandingkan hasil riset, lalu susun daftar prospek yang layak ditindaklanjuti.",
    image:"/media/scraping.webp",
    alt:"Analis pasar Indonesia sedang bekerja dengan laptop di kantor.",
    features:[
      ["Riset wilayah", "Pilih industri dan wilayah untuk melihat pemain serta profil bisnis dari sumber publik."],
      ["Bandingkan pasar", "Tinjau beberapa wilayah dan bandingkan hasil riset sebelum menentukan fokus."],
      ["Kelola prospek", "Simpan bisnis yang menarik, cek kontak, dan lacak tindak lanjut di papan prospek."],
      ["Pantau perubahan", "Riset ulang wilayah pilihan secara berkala untuk melihat pemain baru."],
    ],
    url:httpUrl(process.env.NEXT_PUBLIC_SCRAPING_URL),
  },
  "wa-suite": {
    name:"WA-Suite",
    title:"Percakapan pelanggan yang lebih tertata.",
    description:"Kelola beberapa nomor WhatsApp Business, berikan penugasan kepada agen, dan gunakan template untuk menjawab pertanyaan berulang.",
    image:"/media/wasuite.webp",
    alt:"Pemilik kedai di Indonesia sedang membaca pesan pelanggan pada ponsel.",
    features:[
      ["Inbox beberapa nomor", "Tautkan nomor WhatsApp Business sebagai sesi terpisah dan pantau percakapannya dari dashboard."],
      ["Penugasan agen", "Atur siapa yang bertanggung jawab menangani percakapan pelanggan."],
      ["Template dan label", "Simpan jawaban umum dan tandai percakapan agar lebih mudah ditindaklanjuti."],
      ["Aturan balasan", "Tentukan pola pesan dan respons untuk kebutuhan yang berulang."],
    ],
    url:httpUrl(process.env.NEXT_PUBLIC_WASUITE_URL),
  },
} as const;
export type ProductKey = keyof typeof products;
export const productPath = (key:ProductKey) => "/produk/"+key;
export const contactEmail = /^[\w.!#$%&'*+/=?^`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(process.env.NEXT_PUBLIC_RAQIO_CONTACT_EMAIL ?? "") ?
  process.env.NEXT_PUBLIC_RAQIO_CONTACT_EMAIL : undefined;
