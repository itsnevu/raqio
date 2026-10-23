# Cara Raqio menghitung angka

Semua angka di Raqio berasal dari data publik Google Maps (nama, kategori, rating, jumlah ulasan, alamat) ditambah hasil
"Cek kontak" (telepon, website, Instagram, email). Tidak ada angka yang dikarang: setiap skor adalah rumus tetap di kode,
dan komponennya bisa dicek satu per satu. Halaman ini menjelaskan rumus persisnya, contoh hitungnya, dan batasannya.

Sumber kode: `services/scraper/market.py` (skor prospek, bagian laporan), `apps/web/lib/market/power.ts` (skor
kekuatan), `apps/api/rank.go` (Skor peringkat publik).

## 1. Skor prospek (0 sampai 100)

Dipakai di papan Prospek (angka kuning di kartu), tab Prospek laporan, dan pemilihan penerima kampanye. Mengukur
**seberapa layak sebuah bisnis dihubungi untuk ditawari jasa digital**, bukan seberapa bagus bisnisnya.

Hanya dihitung setelah "Cek kontak" (sebelum itu kosong). Poin dijumlahkan lalu dipotong ke rentang 0 sampai 100:

| Kondisi | Poin | Alasan yang ditampilkan |
|---|---|---|
| Punya nomor yang bisa WhatsApp | +25 | bisa WhatsApp |
| Punya telepon tapi bukan nomor HP | +10 | ada telepon |
| Punya email | +5 | ada email |
| Tidak punya website | +20 | tanpa website |
| Instagram tidak ditemukan, atau akun dipakai bersama banyak cabang | +15 | IG tidak ditemukan |
| Rating 4,5 atau lebih | +15 | rating 4,x |
| Rating 4,0 sampai 4,4 | +8 | |
| Ulasan 30 sampai 800 | +15 | N ulasan, aktif |
| Ulasan di bawah 30 | +5 | |
| Ulasan bertambah (laju per bulan > 0) | +5 | sedang tumbuh |
| Punya lebih dari satu cabang di wilayah ini | -25 | jaringan bercabang |
| Ulasan di atas 800 (pemain besar) | -40 | pemain besar |
| Tidak ada kontak sama sekali | skor maksimal 20 | tidak ada kontak |

Contoh: kafe rating 4,6 dengan 120 ulasan, bisa WhatsApp, tanpa website, IG tidak ditemukan, satu cabang:
25 + 20 + 15 + 15 + 15 = **90**. Pemain besar 900 ulasan dengan website dan IG lengkap: 25 + 15 (rating) - 40 = **0**
setelah dipotong, karena bukan target jasa digital.

Logikanya: bisnis yang sehat (rating bagus, ulasan aktif) tetapi punya celah digital dan bisa dihubungi adalah
calon klien terbaik. Ambang "prospek" di papan: skor 40 ke atas.

## 2. Skor kekuatan (rata-rata Bayesian)

Dipakai di laporan: urutan "pemimpin pasar", peta posisi, dan sorotan. Menjawab **siapa yang paling kuat di pasar ini**
tanpa tertipu rating 5,0 dari 6 ulasan.

```
skor = (v / (v + m)) * R  +  (m / (v + m)) * C
R = rating bisnis, v = jumlah ulasannya
C = rata-rata rating semua bisnis berating di laporan (rata-rata pasar)
m = median jumlah ulasan di laporan, minimal 10
```

Semakin sedikit ulasan, semakin kuat skor ditarik ke rata-rata pasar C. Contoh pasar dengan C = 4,5 dan m = 80:
rating 5,0 dengan 6 ulasan menjadi 4,53; rating 4,7 dengan 1.200 ulasan menjadi 4,69. Pemain kedua benar-benar lebih
kuat, dan rumus ini menunjukkannya. Ini rumus yang sama dengan peringkat film IMDb.

## 3. Angka ringkasan laporan

- **Jumlah bisnis**: hasil Google Maps setelah dibersihkan (duplikat digabung, tutup permanen dibuang, di luar wilayah
  dibuang, kategori tidak relevan dibuang). Angka mentahnya ada di "Kualitas data".
- **Rating rata-rata**: rata-rata sederhana rating semua bisnis yang punya rating.
- **Median ulasan**: nilai tengah jumlah ulasan, lebih jujur daripada rata-rata karena pemain besar tidak menyeret.
- **Total ulasan**: jumlah seluruh ulasan, tanda seberapa ramai pasar.
- **Porsi 3 teratas**: persen ulasan yang dipegang 3 bisnis dengan ulasan terbanyak. 50% ke atas = dikuasai pemain
  besar, 30 sampai 49% = ada beberapa pemain kuat, di bawah 30% = persaingan merata.
- **Kematangan digital**: persen bisnis yang punya website, Instagram, dan WhatsApp, dihitung dari sampel yang sudah
  "Cek kontak" (ditampilkan "dari N dicek").
- **Hidden gem**: rating 4,7 atau lebih dengan 15 sampai 299 ulasan (disukai pelanggan tapi belum besar).
- **Pemain rapuh**: rating di bawah 4,3 dengan 150 ulasan atau lebih (ramai tapi pelanggannya kecewa).
- **Sedang tumbuh**: ulasan bertambah antara dua pemindaian (butuh riset ulang atau pantauan).

## 4. Skor peringkat publik (0 sampai 100)

Dipakai di halaman peringkat publik (`/top/<industri>/<wilayah>`) dan lencana. Menjawab **siapa yang terbaik menurut
pelanggan, secara adil**, bukan siapa yang paling lama atau paling besar.

```
Skor = 60 * kualitas + 25 * skala + 15 * jangkauan

kualitas  = (skor kekuatan Bayesian - 1) / 4          -> rating terkoreksi, 0..1
skala     = log10(1 + ulasan) / log10(1 + ulasan terbanyak di wilayah)   -> 0..1, logaritmik
jangkauan = (website ? 1 : 0) + (Instagram ? 1 : 0) + (WhatsApp ? 1 : 0), dibagi 3   -> 0..1
```

Kenapa begini:
- **Kualitas 60%**: yang paling menentukan adalah penilaian pelanggan, tetapi lewat rata-rata Bayesian supaya bisnis
  baru dengan sedikit ulasan tidak langsung ke puncak dan tidak langsung tenggelam.
- **Skala 25% logaritmik**: 5.000 ulasan tidak boleh 10 kali lebih berharga dari 500 ulasan; keduanya sama-sama
  "terbukti ramai". Logaritma menahan dominasi pemain raksasa.
- **Jangkauan 15%**: bisnis yang bisa ditemukan dan dihubungi lebih bermanfaat untuk pelanggan. Bobot kecil supaya
  bukan penentu. Kalau sampel kontak belum dicek, komponen ini dihitung dari data yang ada (Maps kadang memuat website).

Contoh wilayah dengan ulasan terbanyak 2.000 dan rata-rata pasar 4,5:

| Bisnis | Rating | Ulasan | Website/IG/WA | kualitas | skala | jangkauan | Skor |
|---|---|---|---|---|---|---|---|
| A | 4,8 | 1.200 | ya/ya/ya | 0,949 | 0,933 | 1,00 | **95** |
| B | 4,9 | 40 | tidak/ya/ya | 0,906 | 0,488 | 0,67 | **77** |
| C | 4,2 | 2.000 | ya/ya/ya | 0,800 | 1,000 | 1,00 | **88** |

C ramai tetapi rating turun, jadi di bawah A. B sangat disukai tetapi masih kecil, jadi di tengah dan masuk "hidden gem".

Aturan tambahan di halaman peringkat:
- Peringkat selalu **per industri dan per wilayah**, tidak ada peringkat nasional.
- Cabang satu brand di wilayah yang sama ditampilkan sekali (yang terbesar).
- Lonjakan ulasan tidak wajar (ulasan bertambah lebih dari 50% dalam seminggu pada bisnis dengan 100 ulasan lebih)
  ditandai "perlu dicek" dan tidak ikut peringkat sampai pemindaian berikutnya.
- Komponen skor ditampilkan di tiap baris supaya bisa diverifikasi, lengkap dengan turunannya: nilai C (rata-rata
  rating wilayah), m (median ulasan wilayah, minimal 10), ulasan terbanyak di wilayah, bobot v/(v+m) dan m/(v+m), hasil
  tiap komponen dikali bobotnya, dan penjumlahannya. `GET /rank` mengirim bahan ini di field `market`.
- Lencana (`/badge/<industri>/<wilayah>/<key>.svg`, opsional `?theme=light`) memuat peringkat, Skor Raqio, dan jumlah
  ulasan; selalu dihitung dari laporan terbaru saat diminta, jadi tidak bisa dipalsukan dengan menyimpan gambar lama.

## 4b. Sumber data dan aturan validitas (standar versi 3)

Daftar bisnis, rating, dan jumlah ulasan selalu dari Google Maps (scraping tanpa login, atau Places API resmi bila
kuncinya diisi). Sumber lain (Overture Maps = data Meta/Microsoft/Foursquare, OpenStreetMap, TomTom) dipakai dengan dua
cara, keduanya tercatat per bisnis:

1. **Melengkapi**: bisnis Maps yang cocok dengan record sumber lain (telepon HP sama, website sama, IG sama, atau
   jarak <= 400 m dan nama mirip) mendapat kontak yang kosong; `src_fields` menyebut asal tiap kontak.
2. **Menambah**: bisnis yang tidak ada di Maps dihitung hanya kalau kategori relevan, tidak tutup, keyakinan >= 0,5,
   punya kontak, dan website-nya hidup saat dicek. Tanpa rating, tidak ikut peringkat, `on_maps=false`, masuk prospek
   dengan celah "tidak muncul di hasil Maps" (belum punya profil, atau di luar hasil teratas pencarian Maps).

Pie "Sumber data" di laporan: asal daftar bisnis (Maps saja / Maps + sumber lain / hanya sumber lain), status tiap
sumber (`providers`), dan hasil cek website (`verify`).

## 5. Batasan yang jujur

- Data berasal dari Google Maps pada saat dipindai; pemindaian ulang bisa mengubah angka.
- Jumlah ulasan dan rating adalah angka Google, bukan Raqio. Raqio tidak bisa mendeteksi ulasan palsu, hanya menandai
  lonjakan tidak wajar.
- "Kematangan digital" hanya seakurat sampel yang dicek: makin banyak "Cek kontak", makin akurat.
- Skor prospek adalah pendapat untuk kebutuhan penjualan jasa digital, bukan penilaian kualitas bisnis.
