import Link from "next/link";
import {Button,Navbar,Footer as SharedFooter,MockCard} from "../../../packages/ui/components";
import {getI18n} from "../i18n/server";
import {localPath,type Lang} from "../i18n/core";
import {contactEmail,copy,loginPath,products,productPath,type ProductKey} from "../content";

function LangSwitch({lang,path,label}:{lang:Lang;path:string;label:string}) {
  // Full page load on purpose: the language lives in the root layout.
  return <div className="lang-switch" role="group" aria-label={label}>{(["en","id"] as const).map(l=>
    <a key={l} href={localPath(l,path)} hrefLang={l} lang={l} aria-current={l===lang?"true":undefined}>{l.toUpperCase()}</a>)}</div>;
}
export async function Header() {
  const {t,href,lang,path}=await getI18n();
  return <Navbar home={href("/")} homeLabel={t("RAQIO, beranda")} skip={t("Lewati ke konten")}><nav aria-label={t("Navigasi utama")}><details className="product-menu"><summary>{t("Produk")} <span aria-hidden="true" className="chevron"/></summary>
    <div><Link className="mobile-about" href={href("/tentang")}>{t("Tentang RAQIO")}</Link><Link href={href("/produk")}>{t("Bandingkan produk")}</Link>{(Object.keys(products) as ProductKey[]).map(key=><Link key={key} href={href(productPath(key))}>{products[key].name}</Link>)}</div>
    </details><Link className="nav-about" href={href("/tentang")}>{t("Tentang")}</Link><Link className="nav-about" href={href("/#faq")}>FAQ</Link></nav>
    <div className="nav-end"><LangSwitch lang={lang} path={path} label={t("Bahasa")}/><a href={loginPath} className="button nav-contact">{t("Masuk")}</a></div></Navbar>;
}
export async function Footer() {
  const {t,href}=await getI18n();
  return <SharedFooter home={href("/")} homeLabel={t("RAQIO, beranda")} tagline={t("Riset pasar dan percakapan pelanggan.")}><div><h2>{t("Produk")}</h2><Link href={href(productPath("competitor-scraping"))}>Competitor Scraping</Link><Link href={href(productPath("wa-suite"))}>WA-Suite</Link><Link href={href("/produk")}>{t("Bandingkan")}</Link></div>
    <div><h2>RAQIO</h2><Link href={href("/tentang")}>{t("Tentang")}</Link><Link href={href("/kontak")}>{t("Kontak")}</Link><a href={loginPath}>{t("Masuk")}</a><Link href={href("/privasi")}>{t("Privasi")}</Link><Link href={href("/syarat")}>{t("Syarat")}</Link></div></SharedFooter>;
}
export async function AppLink({product}:{product:ProductKey}) {
  const {t,href}=await getI18n();
  return <Button href={products[product].url ?? href("/kontak")}>{t(products[product].url ? "Coba sekarang" : "Tanya tentang produk")} <span aria-hidden="true">&#8594;</span></Button>;
}

export async function ProductDemo({product}:{product:ProductKey}) {
  const {t}=await getI18n();
  if(product==="competitor-scraping") return <MockCard className="demo-market">
    <div className="demo-top"><span><i/> {t("Riset pasar")}</span><small>{t("Contoh")}</small></div>
    <strong>{t("Kedai kopi di Jakarta")}</strong>
    <div className="market-row"><span>{t("Wilayah")}</span><span>{t("Bisnis ditemukan")}</span></div>
    {[["Kemang",42],["Cipete",31],["Tebet",26]].map(([name,value])=><div className="market-row" key={name}><span>{name}</span><span>{value}</span></div>)}
  </MockCard>;
  return <MockCard className="demo-chat">
    <div className="demo-top"><span><i/> {t("Inbox tim")}</span><small>{t("Contoh")}</small></div>
    {[["N","Nadia","Halo, masih bisa pesan hari ini?","Baru"],["R","Rizky","Terima kasih, sudah diterima.","Selesai"]].map(([letter,name,message,state])=>
      <div className="chat-row" key={name}><b aria-hidden="true">{letter}</b><span><strong>{name}</strong><small>{t(message)}</small></span><em>{t(state)}</em></div>)}
  <div className="mock-action">{t("Ambil chat")}</div></MockCard>;
}

export async function ProductTile({product}:{product:ProductKey}) {
  const {t,href}=await getI18n();
  const info=products[product];
  return <article className="product-tile">
    <div className={"product-art product-stage "+(product==="wa-suite"?"stage-chat":"stage-market")}><ProductDemo product={product}/></div>
    <div className="product-copy"><h3>{info.name}</h3><p><strong>{t(product==="wa-suite" ? "Untuk tim yang melayani pelanggan lewat WhatsApp." : "Untuk tim yang ingin memahami pasar.")}</strong> {t(info.description)}</p>
      <Link className="text-link" href={href(productPath(product))}>{t("Selengkapnya")} <span aria-hidden="true">&#8594;</span></Link>
    </div>
  </article>;
}

export async function Contact() {
  const {t,href}=await getI18n();
  return <section id="kontak" className="contact">
    <div className="shell contact-inner"><h2>{t("Mulai bersama RAQIO.")}</h2><p>{t("Pilih produk yang sesuai dengan pekerjaan tim Anda.")}</p>
      <div className="actions">{contactEmail ? <a href={"mailto:"+contactEmail} className="button button-light">{t("Kirim email")}</a> : null}
        <Link className="button button-amber" href={href("/kontak")}>{t("Tanya tentang produk")}</Link>
        <Link className="button button-outline" href={href("/produk")}>{t("Bandingkan produk")}</Link>
      </div>
    </div>
  </section>;
}
export async function FAQ() {
  const {t,href}=await getI18n();
  return <section id="faq" className="shell faq section"><div><h2>{t("Pertanyaan umum.")}</h2><p className="partner"><Link href={href("/kontak")}>{t("Bermitra dengan kami")}</Link></p></div><div>
    {copy.faq.map(([question,answer])=><details key={question}><summary>{t(question)}</summary><p>{t(answer)}</p></details>)}
  </div></section>;
}
