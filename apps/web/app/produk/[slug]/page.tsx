import type { Metadata } from "next";
import Link from "next/link";
import {notFound} from "next/navigation";
import {AppLink,Contact,Footer,Header,ProductDemo} from "../../../components/Marketing";
import Tabs from "../../../components/Tabs";
import {products,productPath,type ProductKey} from "../../../content";

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
  const personas=chat
    ? [["CS","Kelola antrean pelanggan dan status percakapan."],["Penjualan","Pakai template untuk pertanyaan yang berulang."],["Multi-cabang","Kelola beberapa nomor dari dashboard yang sama."]]
    : [["Pemilik UMKM","Teliti pasar sebelum memilih lokasi."],["Tim sales","Susun prospek dan lihat status tindak lanjut."],["Agensi riset","Bandingkan pemain di beberapa wilayah."]];
  const steps=chat ? ["Chat pelanggan masuk","Agen mengambil percakapan","Agen membalas dengan template","Percakapan ditandai selesai"]
    : ["Pilih industri dan wilayah","Jalankan riset pasar","Bandingkan profil bisnis","Simpan prospek pilihan"];
  return <><Header/><main id="konten">
    <section className="detail-hero"><div className="shell detail-grid">
      <div className="detail-copy"><Link href="/produk" className="text-link">Bandingkan produk</Link><p className="eyebrow">{info.name}</p>
        <h1>{info.title}</h1><p className="intro">{info.description}</p><AppLink product={slug}/>
      </div>
      <div className={"product-art detail-art product-stage"+(chat?" detail-phone":"")}>
        <div className="mock-shell"><aside>{(chat?["Inbox","Nomor","Agen","Template"]:["Riset","Wilayah","Prospek","Ekspor"]).map(x=><span key={x}>{x}</span>)}</aside><ProductDemo product={slug}/></div>
      </div>
    </div></section>
    <section className="shell section features"><h2>Untuk siapa?</h2><div className="usecases"><Tabs label="Contoh penggunaan" items={personas.map(([title,body])=>({title,body:<p>{body}</p>}))}/></div>
    <h2>Yang bisa Anda lakukan.</h2><div className="feature-tabs"><Tabs label="Fitur produk" items={info.features.map(([title,body])=>({title,body:<p>{body}</p>}))}/></div>
    <h2 className="step-heading">Cara kerja</h2><ol className="stepper">{steps.map(x=><li key={x}>{x}</li>)}</ol>
    <div className="person-grid">{personas.map(([title,body])=><article key={title}><h3>{title}</h3><p>{body}</p></article>)}</div>
    <p className="detail-note">{chat?"Penautan nomor memerlukan akun WhatsApp Business dan akses ke perangkat pemilik nomor.":"Competitor Scraping menggunakan sumber data publik. Ketersediaan data bergantung pada industri dan wilayah."}</p>
    </section>
    <section className="shell also"><Link className="text-link" href={productPath(other)}>Kenali juga {products[other].name}</Link></section>
    <Contact/>
  </main><Footer/></>;
}
