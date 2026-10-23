// Landing page publik di "/" (halaman Asisten pindah ke /chat). Komponen server: sesi dicek dari cookie
// hanya untuk mengganti CTA; intro 3D dirender klien (components/landing/Hero3D) sebagai "product shot".
// Komposisi mengikuti homepage linear.app (nav ramping, hero kiri + badge, product shot dominan, pernyataan
// dua warna, kolom Fig berilustrasi, header seksi judul-kiri/deskripsi-kanan, CTA penutup terpusat, footer
// kolom) — tapi font dan sudut mengikuti aplikasi Raqio: Albert Sans, sudut tajam, token tema globals.css.
// Tanpa harga di homepage (keputusan produk).
import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import "./landing.css";
import Brand from "@/components/Brand";
import Reveal from "@/components/landing/Reveal";
import { COOKIE, verifyToken } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Home | Raqio",
  description: "Riset pasar lokal dari Google Maps dan website bisnis. Laporan per wilayah, prospek siap dihubungi, dan pantauan perubahan pasar.",
};

const STEPS = ["Cari di Google Maps", "Ambil telepon & website", "Cari akun IG", "Susun laporan", "Simpan"];

// ilustrasi garis isometrik kecil di atas tiap kolom Fig, meniru figur wireframe Linear
const FIG_ART = [
  <svg key="a" viewBox="0 0 120 64" aria-hidden="true"><g fill="none" stroke="currentColor"><path d="M28 24v12l32 16 32-16V24" /><path d="M60 40v12" /></g><path d="M60 8 92 24 60 40 28 24Z" fill="none" stroke="var(--good)" /></svg>,
  <svg key="b" viewBox="0 0 120 64" aria-hidden="true"><g fill="none" stroke="currentColor"><path d="M38 18l12-7 12 7v14l-12 7-12-7Z" /><path d="M26 38l12-7 12 7v14l-12 7-12-7Z" /></g><path d="M62 32l12-7 12 7v14l-12 7-12-7Z" fill="none" stroke="var(--good)" /></svg>,
  <svg key="c" viewBox="0 0 120 64" aria-hidden="true"><g fill="none" stroke="currentColor"><path d="M24 50h16v-9H24Zm24 0h16V32H48Zm24 0h16V18H72Z" /></g><path d="M28 28l20-8 20-8 24-4" fill="none" stroke="var(--good)" strokeDasharray="3 4" /></svg>,
];

const FIGS: [string, string, string][] = [
  ["Fig 0.1", "Langsung dari lapangan", "Data diambil saat kamu mencari, dari Google Maps dan website tiap bisnis. Bukan database usang."],
  ["Fig 0.2", "Bersih sebelum sampai", "Cabang digabung, bisnis tutup dibuang, duplikat dihapus. Yang kamu baca hanya pemain yang nyata."],
  ["Fig 0.3", "Siap ditindaklanjuti", "Setiap bisnis diberi skor lead, lalu masuk papan prospek dengan draf pesan WhatsApp yang tinggal dikirim."],
];

const MODULES: [string, string][] = [
  ["Riset", "Ketik industri dan wilayah, misal \"coffee shop\" di \"Kemang Jakarta\". Laporan lengkap dalam 2 sampai 4 menit."],
  ["Bandingkan", "Beberapa wilayah sekaligus, satu skor peluang per wilayah. Terlihat di mana pemain masih sedikit."],
  ["Prospek", "Skor lead, status follow up, pengingat, dan draf pesan WhatsApp di satu papan."],
  ["Cek kontak", "Telepon, website, dan Instagram satu bisnis diambil ulang saat kamu mau menghubunginya."],
  ["Pantau", "Wilayah penting diriset ulang berkala. Pemain baru dikirim ke email, Telegram, atau webhook."],
  ["Asisten", "Tanya laporanmu dalam bahasa biasa. Jawabannya dari data risetmu, bukan tebakan."],
];

export default async function LandingPage() {
  const loggedIn = await verifyToken((await cookies()).get(COOKIE)?.value);
  const cta = loggedIn ? "/market" : "/register";
  return (
    <div className="landing">
      {/* header memakai kelas .top milik aplikasi supaya identik dengan /market (sticky, border, nav kapital) */}
      <header className="top">
        <Brand href={loggedIn ? "/market" : undefined} />
        <nav aria-label="Navigasi landing">
          <a href="#modul" className="hide-m">Modul</a>
          <a href="#alur" className="hide-m">Alur</a>
          <a href="#angka" className="hide-m">Angka</a>
          {loggedIn ? (
            <Link className="lbtn pri" href="/market">Buka aplikasi</Link>
          ) : (
            <>
              <Link className="lbtn sec" href="/login">Masuk</Link>
              <Link className="lbtn pri" href="/register">Daftar</Link>
            </>
          )}
        </nav>
      </header>

      <main className="ln-wrap">
        <section className="ln-hero">
          <Link className="ln-badge" href={cta}>
            <span>Baru</span> Pilih wilayah lewat klik di peta <i aria-hidden="true">→</i>
          </Link>
          <h1 aria-label="Peta pasar industri apa pun, wilayah mana pun.">
            <span className="l1" aria-hidden="true">
              {["Peta", "pasar", "industri", "apa", "pun,"].map((w, i) => (
                <span className="w" key={w + i} style={{ "--i": i } as CSSProperties}>{w}</span>
              ))}
            </span>
            <span className="l2" aria-hidden="true">
              <span className="u">
                {["wilayah", "mana", "pun."].map((w, i) => (
                  <span className="w" key={w + i} style={{ "--i": i + 5 } as CSSProperties}>{w}</span>
                ))}
              </span>
            </span>
          </h1>
          <p className="ln-sub">
            Riset pasar lokal langsung dari Google Maps dan website bisnis.
            Dibuat untuk agency, UMKM, dan tim penjualan.
          </p>
          <div className="ln-cta">
            {loggedIn ? (
              <Link className="lbtn pri big" href="/market">Buka aplikasi</Link>
            ) : (
              <>
                <Link className="lbtn pri big" href="/register">Daftar gratis</Link>
                <Link className="lbtn sec big" href="/login?auto=1" title="Org sementara dengan kuota uji coba, bisa disimpan jadi akun kapan saja.">
                  Coba tanpa daftar
                </Link>
              </>
            )}
          </div>
          <p className="ln-proof" aria-hidden="true">
            <span>2–4 menit per riset</span><i>·</i><span>5 riset gratis / bulan</span><i>·</i><span>tanpa kartu kredit</span>
          </p>
        </section>

        {/* product shot: mock laporan riset (UI asli aplikasi, disederhanakan) */}
        <div className="ln-frame" aria-hidden="true">
          <span className="ln-live"><i />contoh laporan · data publik Google Maps</span>
          <div className="mk">
            <div className="mk-top">
              <span className="mk-logo">raqio</span>
              <span className="mk-nav"><b>Riset</b><span>Prospek</span><span>Pantau</span><span>Asisten</span></span>
              <span className="mk-chip">coffee shop · Gading Serpong</span>
            </div>
            <div className="mk-body">
              <div className="mk-h">
                <div>
                  <div className="mk-title">coffee shop · Gading Serpong</div>
                  <div className="mk-sub">Discrape 22 Okt 2026 dari Google Maps · dilihat sebagai <em>pesaing</em></div>
                </div>
                <div className="mk-acts"><span>+ Pantau mingguan</span><span>Ekspor CSV</span><span className="on">Cetak laporan</span></div>
              </div>
              <div className="mk-verdict">
                <div className="mk-k">Kesimpulan: posisi kamu di antara pesaing</div>
                <p>Kamu punya <em>43 pesaing</em> coffee shop di Gading Serpong. Pasar ini punya beberapa <em>pesaing kuat</em>, tapi belum ada yang menguasai.</p>
              </div>
              <div className="mk-stats">
                <div><b>43</b><span>pesaing</span><p><em>3 teratas</em> cuma pegang 31% ulasan, posisi teratas masih terbuka</p></div>
                <div><b>4,72</b><span>rating pesaing</span><p>standar tinggi, kamu harus minimal <em>4,5</em> untuk dilirik</p></div>
                <div><b>2</b><span>pesaing rapuh</span><p><em>ramai</em> tapi rating rendah, pelanggannya bisa direbut</p></div>
              </div>
              <div className="mk-rows">
                <div className="mk-row head"><span>Bisnis</span><span>Rating</span><span>Ulasan</span><span>Digital</span><span>Skor lead</span></div>
                <div className="mk-row"><span>December Coffee</span><span>★ 4,9</span><span>2.184</span><span>IG · Web</span><span><i className="hi">86</i></span></div>
                <div className="mk-row"><span>Fore Coffee – Summarecon Mall</span><span>★ 4,3</span><span>5.027</span><span>IG · Web · WA</span><span><i>41</i></span></div>
                <div className="mk-row"><span>Muyen Coffee Gading Serpong</span><span>★ 4,8</span><span>893</span><span>IG</span><span><i className="hi">74</i></span></div>
                <div className="mk-row"><span>Gabriel&rsquo;s Pastry Coffee &amp; Eatery</span><span>★ 4,7</span><span>1.206</span><span>IG · Web</span><span><i>63</i></span></div>
              </div>
            </div>
          </div>
        </div>

        <section className="ln-statement" data-reveal>
          <p>
            <b>Satu pencarian menjawab apa yang biasanya butuh berhari-hari riset manual.</b>{" "}
            Siapa saja pemainnya, seberapa padat persaingannya, siapa yang belum punya website,
            dan siapa yang layak kamu hubungi duluan.
          </p>
          <div className="ln-figs">
            {FIGS.map(([fig, t, d], i) => (
              <div key={fig}>
                <div className="art">{FIG_ART[i]}</div>
                <span className="fig">{fig}</span>
                <h3>{t}</h3>
                <p>{d}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="ln-mods" id="modul" data-reveal aria-label="Modul Raqio">
          <div className="ln-h2">
            <h2>Enam modul</h2>
            <p>Dari riset pertama sampai follow up terakhir, semuanya ada di paket gratis. Tidak perlu kartu kredit.</p>
          </div>
          <div className="ln-grid">
            {MODULES.map(([name, desc], i) => (
              <Link className={"ln-card" + (i === 0 ? " big" : "") + (name === "Asisten" ? " wide" : "")} key={name} href={cta}>
                <h3>{name}</h3>
                <p>{desc}</p>
                {i === 0 && (
                  <span className="mini-search" aria-hidden="true">
                    <span>coffee shop</span><i /><span>Gading Serpong</span><b>Riset</b>
                  </span>
                )}
                {name === "Asisten" && (
                  <span className="mini-chat" aria-hidden="true">
                    <span className="q">siapa saja yang belum punya website?</span>
                    <span className="a">Ada 19 dari 43 pesaing. Tiga teratas menurut skor lead: December Coffee (86), Muyen Coffee (74), Kopi Praja (68).</span>
                  </span>
                )}
              </Link>
            ))}
          </div>
        </section>

        <section className="ln-flow" id="alur" data-reveal aria-label="Tahapan riset">
          <div className="ln-h2">
            <h2>Satu perintah, lima tahap</h2>
            <p>Worker mengerjakan semuanya berurutan. Kamu boleh meninggalkan halaman dan kembali saat laporan jadi.</p>
          </div>
          <ol className="ln-steps">
            {STEPS.map((s, i) => (
              <li key={s}>
                <span className="no">{String(i + 1).padStart(2, "0")}</span>
                {s}
              </li>
            ))}
          </ol>
        </section>

        <section className="ln-nums" id="angka" data-reveal aria-label="Angka Raqio">
          <div><b>2–4</b><span>menit per wilayah, dari pencarian sampai laporan jadi</span></div>
          <div><b>3</b><span>riset bisa antre sekaligus, dikerjakan berurutan</span></div>
          <div><b>5</b><span>riset gratis tiap bulan, tanpa kartu kredit</span></div>
          <div><b>0</b><span>duplikat. Cabang digabung, bisnis tutup dibuang</span></div>
        </section>

        <section className="ln-end" data-reveal>
          <h2>Pasarmu sudah terpetakan.<br />Tinggal dibuka.</h2>
          <div className="ln-cta center">
            {loggedIn ? (
              <Link className="lbtn pri big" href="/market">Buka aplikasi</Link>
            ) : (
              <>
                <Link className="lbtn pri big" href="/register">Daftar gratis</Link>
                <Link className="lbtn sec big" href="/login?auto=1">Coba tanpa daftar</Link>
              </>
            )}
          </div>
        </section>
      </main>

      <footer className="ln-foot">
        <div className="ln-cols">
          <div className="ln-col brandcol">
            <Brand />
            <p>Riset pasar lokal dari Google Maps dan website bisnis.</p>
          </div>
          <div className="ln-col">
            <h4>Produk</h4>
            <a href="#modul">Modul</a>
            <a href="#alur">Alur</a>
            <a href="#angka">Angka</a>
          </div>
          <div className="ln-col">
            <h4>Akun</h4>
            <Link href="/login">Masuk</Link>
            <Link href="/register">Daftar</Link>
            <Link href="/login?auto=1">Coba tanpa daftar</Link>
          </div>
          <div className="ln-col">
            <h4>Legal</h4>
            <Link href="/privacy">Privasi</Link>
            <Link href="/terms">Syarat Layanan</Link>
            <Link href="/metodologi">Metodologi</Link>
          </div>
        </div>
        <div className="ln-base">© {new Date().getFullYear()} Raqio</div>
      </footer>
      <Reveal />
    </div>
  );
}
