import type {Metadata} from "next";
import {cookies} from "next/headers";
import Link from "next/link";
import {redirect} from "next/navigation";
import Brand from "@/components/Brand";
import {COOKIE} from "@/lib/auth";
import {safeHttpUrl} from "@/lib/safe";
import "./products.css";

export const metadata:Metadata={title:"Pilih produk | RAQIO"};

const login="/login?next=%2Fpilih-produk";

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
  const profile:{guest?:boolean}=await response.json();
  if(profile.guest)redirect(login);

  const waSuite=safeHttpUrl(process.env.WASUITE_APP_URL??process.env.NEXT_PUBLIC_WASUITE_APP_URL??
    (process.env.NODE_ENV==="development"?"http://localhost:3001":undefined));

  return <main className="product-chooser">
    <div className="product-chooser-inner">
      <Brand/>
      <h1>Pilih produk RAQIO.</h1>
      <p>Pilih produk yang ingin Anda buka.</p>
      <div className="product-chooser-grid">
        <article>
          <h2>Competitor Scraping</h2>
          <p>Riset pasar, kelola prospek, dan pantau wilayah.</p>
          <Link href="/market">Buka Competitor Scraping</Link>
        </article>
        <article>
          <h2>WA-Suite</h2>
          <p>Buka inbox WhatsApp tim dan lanjutkan percakapan pelanggan.</p>
          {waSuite?<a href={waSuite}>Buka WA-Suite</a>:<p>Hubungi admin untuk akses WA-Suite.</p>}
        </article>
      </div>
    </div>
  </main>;
}
