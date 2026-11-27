import type {Metadata} from "next";
import {cookies} from "next/headers";
import Link from "next/link";
import {redirect} from "next/navigation";
import Brand from "@/components/Brand";
import {AGENTS, AgentGlyph, ArrowBox, type Agent} from "@/components/agents";
import {COOKIE} from "@/lib/auth";
import {safeHttpUrl} from "@/lib/safe";
import LogoutButton from "./LogoutButton";
import "./products.css";

export const metadata:Metadata={title:"Pilih agen | Raqio"};

const login="/login?next=%2Fpilih-produk";

type Profile={guest?:boolean;email?:string;org_id?:string;orgs?:{ID:string;Name:string}[]};

export default async function ProductChooser(){
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

  const waSuite=safeHttpUrl(process.env.WASUITE_APP_URL??process.env.NEXT_PUBLIC_WASUITE_APP_URL??
    (process.env.NODE_ENV==="development"?"http://localhost:3001":undefined));
  const org=profile.orgs?.find(o=>o.ID===profile.org_id)?.Name;

  const card=(a:Agent)=>{
    const top=<span className="agent-card-top"><AgentGlyph agent={a}/><span className="agent-card-product">{a.product}</span></span>;
    const inner=<>
      <span className="agent-card-fill" aria-hidden="true"/>
      {top}
      <h2>{a.name}</h2>
      <span className="agent-card-body">{a.body}</span>
      <span className="agent-card-cta">Buka<ArrowBox/></span>
    </>;
    if(a.path)return <Link className="agent-card" href={a.path}>{inner}</Link>;
    if(waSuite)return <a className="agent-card" href={waSuite}>{inner}</a>;
    return <div className="agent-card agent-card--off">
      {top}
      <h2>{a.name}</h2>
      <span className="agent-card-body">Hubungi admin untuk akses WA-Suite.</span>
    </div>;
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
      <p className="chooser-lead">Keempat agen AI memakai satu akun yang sama. Pindah kapan saja tanpa login ulang.</p>
      <ul className="agent-grid">
        {AGENTS.map(a=><li key={a.key}>{card(a)}</li>)}
      </ul>
    </section>
  </main>;
}
