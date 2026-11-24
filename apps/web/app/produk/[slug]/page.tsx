import type { Metadata } from "next";
import Link from "next/link";
import {notFound} from "next/navigation";
import {Contact,Footer,Header} from "../../../components/Marketing";
import {products,productPath,type ProductKey} from "../../../content";
import WaSuiteHero from "../../../components/WaSuiteHero";
import ScrapingHero from "../../../components/ScrapingHero";

const featureIcons: Record<ProductKey,readonly string[]> = {
  "competitor-scraping":[
    "M20 10c0 5-8 10-8 10S4 15 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 0-6 0 3 3 0 0 0 6 0Z",
    "M4 20h16M6 16v-5h3v5M11 16V5h3v11M16 16V8h3v8",
    "M7 7V5h10v2m-4 6h5m-5 4h5M6 13h3m-3 4h3M4 7h16v13H4Z",
    "M3 12h4l3-6 4 12 3-6h4",
  ],
  "wa-suite":[
    "M4 6h13a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3H9l-5 4v-4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Zm3 5h8m-8 3h5",
    "M14 7a4 4 0 1 0-8 0 4 4 0 0 0 8 0ZM3 20v-2a6 6 0 0 1 6-6h2m3 5 2 2 5-5",
    "M3 4h10l8 8-9 9-9-9Zm5 4h.01",
    "M13 2 4 13h7l-1 9 10-12h-7Z",
  ],
};

const known=(slug:string):slug is ProductKey=>Object.hasOwn(products,slug);
export function generateStaticParams() { return Object.keys(products).map(slug=>({slug})); }
export const dynamicParams=false;
export async function generateMetadata({params}:{params:Promise<{slug:string}>}):Promise<Metadata> {
  const {slug}=await params;
  return known(slug) ? { title:products[slug].name,description:products[slug].description } : {};
}
export default async function Product({params}:{params:Promise<{slug:string}>}) {
  const {slug}=await params;
  if(!known(slug)) notFound();
  const info=products[slug];
  const other=slug==="wa-suite" ? "competitor-scraping" : "wa-suite";
  const chat=slug==="wa-suite";
  const audience: [title:string,image:string,example?:string][]=chat
    ? [["Layanan pelanggan","/media/audience-wa-support.webp"],["Tim penjualan","/media/audience-wa-sales.webp"],["Toko online","/media/audience-wa-store.webp"],["Bisnis multi-cabang","/media/audience-wa-branches.webp"]]
    : [
      ["Pemilik UMKM","/media/audience-cs-umkm.webp","Cek siapa saja yang menjual produk sejenis di sekitar toko Anda."],
      ["Tim penjualan","/media/audience-cs-sales.webp","Susun daftar bisnis di wilayah target untuk dihubungi tim."],
      ["Agensi riset","/media/audience-cs-research.webp","Bandingkan pemain di beberapa wilayah untuk riset klien."],
      ["Ekspansi cabang","/media/audience-cs-expansion-bandung.webp","Cek profil bisnis sejenis di sekitar calon lokasi cabang."],
    ];
  const steps=chat ? ["Chat pelanggan masuk","Agen mengambil percakapan","Agen membalas dengan template","Percakapan ditandai selesai"]
    : ["Pilih industri dan wilayah","Jalankan riset pasar","Bandingkan profil bisnis","Simpan prospek pilihan"];
  return <><Header/><main id="konten">
    {chat ? <WaSuiteHero description={info.description} appUrl={info.url}/> : <ScrapingHero description={info.description} appUrl={info.url}/>}
    {!chat&&<nav className="shell product-jump" aria-label="Bagian Competitor Scraping">
      <a href="#fitur">Fitur</a>
      <a href="#cara-kerja">Cara kerja</a>
      <a href="#audiens">Untuk siapa</a>
    </nav>}
    <section className="shell section features-v2" id="fitur">
      <div className="block-head"><h2>Yang bisa Anda lakukan.</h2></div>
      <div className="feature-grid">{info.features.map(([title,body],i)=><article key={title}>
        <svg className="feature-icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={featureIcons[slug][i]}/></svg>
        <h3>{title}</h3><p>{body}</p>
      </article>)}</div>
    </section>
    <section className="steps-band" id="cara-kerja"><div className="shell section">
      <div className="block-head"><h2>Empat langkah, dari awal sampai selesai.</h2></div>
      <ol className="stepper">{steps.map(x=><li key={x}>{x}</li>)}</ol>
    </div></section>
    <section className="shell section" id="audiens">
      <div className="block-head"><h2>Dibuat untuk siapa.</h2></div>
      <div className="audience-grid">{audience.map(([title,image,example])=><figure key={title} className={example?"audience-card audience-card-example":"audience-card"}>
        {/* eslint-disable-next-line @next/next/no-img-element -- local art */}
        <img src={image} alt="" loading="lazy"/><figcaption>{title}{example&&<span>{example}</span>}</figcaption></figure>)}</div>
      <p className="detail-note">{chat?"Penautan nomor memerlukan akun WhatsApp Business dan akses ke perangkat pemilik nomor.":"Competitor Scraping menggunakan sumber data publik. Ketersediaan data bergantung pada industri dan wilayah."}</p>
    </section>
    <section className="shell also"><Link className="text-link" href={productPath(other)}>Kenali juga {products[other].name}</Link></section>
    <Contact/>
  </main><Footer/></>;
}
