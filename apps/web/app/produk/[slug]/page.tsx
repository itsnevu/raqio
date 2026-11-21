import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {notFound} from "next/navigation";
import {AppLink,Contact,Footer,Header,ProductDemo} from "../../../components/Marketing";
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
  return <><Header/><main id="konten">
    <section className="detail-hero"><div className="shell detail-grid">
      <div className="detail-copy"><Link href="/#produk" className="text-link">Semua produk</Link><p className="eyebrow">{info.name}</p>
        <h1>{info.title}</h1><p className="intro">{info.description}</p><AppLink product={slug}/>
      </div>
      <div className="product-art detail-art"><Image src={info.image} fill alt={info.alt} sizes="(max-width: 800px) 100vw, 50vw" priority/><ProductDemo product={slug}/></div>
    </div></section>
    <section className="shell section features"><h2>Yang bisa Anda lakukan.</h2><div>{info.features.map(([title,body])=><article key={title}><h3>{title}</h3><p>{body}</p></article>)}</div></section>
    <section className="shell also"><Link className="text-link" href={productPath(other)}>Kenali juga {products[other].name}</Link></section>
    <Contact/>
  </main><Footer/></>;
}
