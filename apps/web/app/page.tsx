import Image from "next/image";
import Link from "next/link";
import {Contact,FAQ,Footer,Header,ProductTile} from "../components/Marketing";
import {LoopFilm,Reveal} from "../components/Motion";
import {copy} from "../content";

export default function Home() {
  return <>
    <Header/>
    <main id="konten">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow"><i aria-hidden="true"/> Data pasar &amp; percakapan</p>
          <h1>{copy.headline[0]}<br/><em>{copy.headline[1]}</em></h1>
          <p className="hero-intro">{copy.introduction}</p>
          <div className="actions"><a className="button button-dark" href="#produk">Jelajahi produk</a><a className="text-link" href="#alur">Lihat cara kerja</a></div>
        </div>
        <div className="hero-art">
          <picture><source media="(max-width: 720px)" srcSet="/media/hero-mobile.webp"/>
            <img src="/media/hero.webp" width="1100" height="1000" alt="Ilustrasi Jakarta menjelang senja." fetchPriority="high"/>
          </picture>
          <LoopFilm name="hero" priority/>
          <div className="hero-caption"><span>Jakarta, Indonesia</span></div>
        </div>
      </section>
      <div className="product-index"><div className="shell"><Link prefetch={false} href="/produk/competitor-scraping"><span className="index-icon" aria-hidden="true">+</span> Competitor Scraping</Link><Link prefetch={false} href="/produk/wa-suite"><span className="index-icon chat-icon" aria-hidden="true"/> WA-Suite</Link></div></div>
      <section id="tentang" className="shell section problems">
        <Reveal><p className="eyebrow">Kenapa RAQIO</p><h2>Keputusan dimulai dari informasi yang jelas.</h2></Reveal>
        <div className="problem-list">{copy.problems.map(([title,body])=><article key={title}><h3>{title}</h3><p>{body}</p></article>)}</div>
      </section>
      <section id="produk" className="products-section"><div className="shell section">
        <Reveal className="section-head"><h2>Dua produk.<br/>Satu arah.</h2><p>Pahami pasar yang Anda tuju, lalu kelola hubungan dengan pelanggan yang datang.</p></Reveal>
        <div className="product-grid"><ProductTile product="competitor-scraping"/><ProductTile product="wa-suite"/></div>
      </div></section>
      <section id="alur" className="shell section workflow">
        <div className="workflow-image"><Image src="/media/how.webp" fill alt="Tim kecil berdiskusi di ruang kerja." sizes="(max-width: 800px) 100vw, 48vw"/></div>
        <div><p className="eyebrow">Cara kerja</p><h2>Dari riset ke tindak lanjut.</h2>
          <ol><li><strong>Tentukan pasar</strong><p>Pilih industri dan wilayah untuk mulai melihat siapa saja pemainnya.</p></li>
            <li><strong>Pilih prospek</strong><p>Tinjau profil bisnis dan simpan prospek yang relevan bagi tim Anda.</p></li>
            <li><strong>Tangani pesan masuk</strong><p>Gunakan WA-Suite untuk menugaskan dan menindaklanjuti percakapan pelanggan.</p></li></ol>
        </div>
      </section>
      <section className="story">
        <Image src="/media/story.webp" alt="" fill sizes="100vw"/>
        <div className="shell story-inner"><Reveal><h2>Sinyal dari pasar.<br/>Respons dari tim.</h2></Reveal>
          <div className="story-chat" aria-label="Contoh percakapan bisnis">
            <p className="bubble">Wilayah mana yang mau kita teliti dulu?</p>
            <p className="bubble bubble-reply">Mulai dari Jakarta Selatan. Simpan prospek yang sesuai.</p>
            <p className="bubble">Kalau pelanggan masuk lewat WhatsApp?</p>
            <p className="bubble bubble-reply">Bagi percakapannya ke agen yang bertugas di WA-Suite.</p>
          </div>
        </div>
      </section>
      <section className="shell region section">
        <div><p className="eyebrow">Riset wilayah</p><h2>Pasar lokal punya ceritanya sendiri.</h2><p>Teliti wilayah yang relevan untuk bisnis Anda. Bandingkan temuan dari satu area ke area lain.</p></div>
        <div className="region-art"><Image src="/media/region.webp" alt="Ilustrasi suasana perkotaan di Indonesia." fill sizes="(max-width: 800px) 100vw, 50vw"/><LoopFilm name="region"/></div>
      </section>
      <FAQ/>
      <Contact/>
    </main>
    <Footer/>
  </>;
}
