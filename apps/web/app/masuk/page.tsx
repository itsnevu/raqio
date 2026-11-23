import type {Metadata} from "next";
import Link from "next/link";
import {Footer,Header} from "../../components/Marketing";
import {products,productPath,type ProductKey} from "../../content";
import "./access.css";

export const metadata:Metadata={
  title:"Masuk",
  description:"Masuk ke Competitor Scraping atau WA-Suite.",
};

const options=[
  {key:"competitor-scraping",summary:"Riset pasar, kelola prospek, dan pantau wilayah.",icon:"M4 19h16M7 15v-4m5 4V5m5 10V8"},
  {key:"wa-suite",summary:"Buka inbox WhatsApp tim dan lanjutkan percakapan pelanggan.",icon:"M4 5h16v12H9l-5 4V5Zm4 5h8m-8 3h5"},
] as const satisfies readonly {key:ProductKey;summary:string;icon:string}[];

export default function AccessPage(){
  return <>
    <Header/>
    <main id="konten" className="access-page">
      <div className="shell access-inner">
        <h1>Masuk ke RAQIO.</h1>
        <p>Pilih produk yang ingin Anda buka.</p>
        <div className="access-options">
          {options.map(({key,summary,icon})=>{
            const {name,url}=products[key];
            const scraping=key==="competitor-scraping";
            const login=url?(scraping?new URL("/login?manual=1",url).href:url):undefined;
            return <article className="access-option" key={key}>
              <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={icon}/></svg>
              <h2>{name}</h2>
              <p>{summary}</p>
              <div className="access-option-actions">
                {login?<a className="button button-amber" href={login} aria-label={"Masuk ke "+name}>Masuk</a>:<Link className="button button-amber" href="/kontak">Minta akses</Link>}
                {scraping&&url?<a className="text-link" href={new URL("/register",url).href}>Buat akun</a>:<Link className="text-link" href={productPath(key)}>Lihat produk</Link>}
              </div>
            </article>;
          })}
        </div>
        <p className="access-help">Perlu bantuan untuk masuk? <Link className="text-link" href="/kontak">Hubungi kami</Link></p>
      </div>
    </main>
    <Footer/>
  </>;
}
