import type {Metadata} from "next";
import {cookies} from "next/headers";
import Link from "next/link";
import {redirect} from "next/navigation";
import Brand from "@/components/Brand";
import {AGENTS, AgentGlyph, ArrowBox, type Agent} from "@/components/agents";
import {COOKIE} from "@/lib/auth";
import LogoutButton from "./LogoutButton";
import "./products.css";

export const metadata:Metadata={title:"Pilih agen | Raqio"};

const login="/login?next=%2Fpilih-produk";

type Product="scraping"|"wasuite";
type Profile={guest?:boolean;email?:string;org_id?:string;orgs?:{ID:string;Name:string}[];products?:Product[]};

// Satu akun Raqio, produk per org: Research/SEO/Marketing ada di Competitor Scraping, Customer Service di WA-Suite.
const productOf=(a:Agent):Product=>a.key==="cs"?"wasuite":"scraping";

// pesan dari /go/<produk> (apps/api/sso.go) saat produk tidak bisa dibuka
const ERRORS:Record<string,string>={
  verify_required:"Verifikasi email akun Raqio dulu untuk membuka WA-Suite. Cek kotak masuk email Anda, atau kirim ulang dari banner di aplikasi.",
  product_required:"Akun ini belum memiliki produk tersebut. Minta akses ke tim Raqio.",
  account_required:"Masuk dengan akun Raqio (bukan sesi tamu) untuk membuka WA-Suite.",
  unavailable:"WA-Suite sedang tidak bisa dihubungi. Coba lagi sebentar lagi.",
};

export default async function ProductChooser({searchParams}:{searchParams:Promise<{error?:string}>}){
  const session=(await cookies()).get(COOKIE);
  if(!session)redirect(login);

  const api=process.env.API_URL||"http://127.0.0.1:8080";
  const response=await fetch(new URL("/auth/me",api),{
    cache:"no-store",
    headers:{Cookie:`${COOKIE}=${session.value}`},
  });
  if(response.status===401||response.status===403)redirect(login);
  if(!response.ok)throw new Error("Sesi RAQIO tidak dapat diperiksa.");
  const profile:Profile=await response.json();
  if(profile.guest)redirect("/market"); // sesi tamu hanya untuk mencoba riset; WA-Suite butuh akun terverifikasi

  const owned=new Set(profile.products??[]);
  const org=profile.orgs?.find(o=>o.ID===profile.org_id)?.Name;
  const {error}=await searchParams;
  const notice=error?ERRORS[error]??ERRORS.unavailable:"";

  const card=(a:Agent)=>{
    const product=productOf(a);
    const top=<span className="agent-card-top"><AgentGlyph agent={a}/><span className="agent-card-product">{a.product}</span></span>;
    if(!owned.has(product))return <div className="agent-card agent-card--locked" aria-disabled="true">
      {top}
      <h2>{a.name}</h2>
      <span className="agent-card-body">{a.body}</span>
      <span className="agent-card-lock">Belum aktif untuk akun ini</span>
    </div>;
    const inner=<>
      <span className="agent-card-fill" aria-hidden="true"/>
      {top}
      <h2>{a.name}</h2>
      <span className="agent-card-body">{a.body}</span>
      <span className="agent-card-cta">Buka<ArrowBox/></span>
    </>;
    // produk di host lain dibuka lewat tiket SSO sekali pakai (app/go/[product]/route.ts). Sengaja <a>, bukan
    // <Link>: prefetch Link akan menerbitkan tiket tanpa diklik.
    // eslint-disable-next-line @next/next/no-html-link-for-pages
    if(product==="wasuite")return <a className="agent-card" href="/go/wasuite">{inner}</a>;
    return <Link className="agent-card" href={a.path??"/market"}>{inner}</Link>;
  };

  return <main className="product-chooser">
    <header className="chooser-top">
      <Brand/>
      <div className="chooser-account">
        <span>Masuk sebagai <b>{profile.email}</b>{org&&<> · {org}</>}</span>
        <LogoutButton/>
      </div>
    </header>
    <section className="chooser-inner" aria-labelledby="chooser-title">
      <p className="chooser-eyebrow">Satu akun Raqio</p>
      <h1 id="chooser-title">Pilih agen yang ingin Anda pakai.</h1>
      <p className="chooser-lead">Satu akun Raqio untuk semua produk yang dimiliki organisasi Anda. Pindah kapan saja tanpa login ulang.</p>
      {notice&&<p className="chooser-notice" role="alert">{notice}</p>}
      <ul className="agent-grid">
        {AGENTS.map(a=><li key={a.key}>{card(a)}</li>)}
      </ul>
    </section>
  </main>;
}
