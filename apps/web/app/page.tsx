import Link from "next/link";
import {Button,ChatBubble,MockCard} from "../../../packages/ui/components";
import {FAQ,Footer,Header,ProductDemo,ProductTile} from "../components/Marketing";
import {ContactTeaser} from "../components/ContactForm";
import HeaderBehavior from "../components/HeaderBehavior";
import Tabs from "../components/Tabs";
import {Reveal} from "../components/Motion";
import {copy} from "../content";

const statements=["Pasar berubah.","Pemain baru bermunculan.","Prospek tercecer.","Pesan menumpuk.","Tim kewalahan."];
const conversation=[
  "Saya mau buka cabang di Jakarta Selatan. Mulai dari mana?",
  "Lihat peta pemain di Competitor Scraping.",
  "Lalu prospeknya?",
  "Simpan jadi daftar yang bisa ditindaklanjuti.",
  "Kalau pelanggan mulai chat?",
  "Tim Anda jawab bersama di WA-Suite.",
];
export default function Home() {
  return <><Header/><HeaderBehavior/><main id="konten">
    <section className="hero hero-full">
      <div className="hero-art design-grid" aria-hidden="true"><i/><i/><i/></div>
      <div className="shell hero-copy">
        <h1>{copy.headline[0]}<br/><em>{copy.headline[1]}</em></h1>
        <p className="hero-intro">Riset pasar lokal dan kelola percakapan WhatsApp pelanggan bersama tim.</p>
        <div className="actions"><Button variant="amber" href="/produk">Jelajahi produk <span aria-hidden="true">&#8594;</span></Button><a className="text-link" href="#alur">Lihat cara kerja</a></div>
      </div>
    </section>
    <section className="statement">
      <div className="shell section statement-inner"><h2>Bisnis tumbuh, tapi informasinya tercecer.</h2>
        <ul>{statements.map(line=><li key={line}><Reveal>{line}</Reveal></li>)}</ul>
      </div>
    </section>
    <section id="alur" className="shell section"><div className="section-head"><h2>Dari riset ke tindak lanjut.</h2><p>Lihat bagaimana dua produk RAQIO membantu pekerjaan tim Anda.</p></div>
      <Tabs label="Cara kerja RAQIO" items={[
        {title:"Riset pasar",body:<div className="workflow-demo"><ProductDemo product="competitor-scraping"/></div>},
        {title:"Susun prospek",body:<div className="workflow-demo"><MockCard><div className="demo-top">Daftar prospek <small>Contoh</small></div><div className="market-row"><span>Kedai Pagi</span><span>Perlu ditindaklanjuti</span></div><div className="market-row"><span>Kopi Taman</span><span>Sudah dihubungi</span></div></MockCard></div>},
        {title:"Layani pelanggan",body:<div className="workflow-demo"><ProductDemo product="wa-suite"/></div>},
      ]}/>
    </section>
    <section className="products-section" id="produk"><div className="shell section product-sequence"><ProductTile product="competitor-scraping"/><ProductTile product="wa-suite"/></div></section>
    <section className="shell section section-head"><h2>Pilih produk untuk tim Anda.</h2><div><p>Bandingkan cara kerja, hasil, dan akses kedua aplikasi.</p><Button href="/produk">Bandingkan produk <span aria-hidden="true">&#8594;</span></Button></div></section>
    <section className="story"><div className="shell story-inner"><h2>Dua produk.<br/>Satu arah.</h2>
      <div className="story-chat" aria-label="Contoh percakapan">{conversation.map((line,i)=><ChatBubble key={line} reply={i%2===1}>{line}</ChatBubble>)}</div></div>
    </section>
    <section className="shell section region"><div><h2>Setiap wilayah punya pasar yang berbeda.</h2><p>Mulai dari area yang Anda kenal, lalu bandingkan temuan dengan wilayah lain.</p><Link className="text-link" href="/tentang">Cara kami bekerja dengan data</Link></div>
      <div className="region-art design-grid" aria-hidden="true"><i/><i/><i/></div>
    </section>
    <section className="contact"><div className="shell contact-inner"><h2>Mulai bersama RAQIO.</h2><p>Ceritakan kebutuhan tim Anda.</p><ContactTeaser/></div></section>
    <FAQ/>
  </main><Footer/></>;
}
