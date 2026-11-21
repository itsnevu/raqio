import Image from "next/image";
import Link from "next/link";
import {contactEmail,copy,products,productPath,type ProductKey} from "../content";

export function Brand() {
  return <Link href="/" className="wordmark" aria-label="RAQIO, beranda">
    <Image src="/mark.webp" alt="" width={33} height={33} unoptimized/><span>raqio</span>
  </Link>;
}
export function Header() {
  return <header className="header">
    <a className="skip" href="#konten">Lewati ke konten</a>
    <div className="nav shell"><Brand/>
      <nav aria-label="Navigasi utama">
        <details className="product-menu"><summary>Produk <span aria-hidden="true" className="chevron"/></summary>
          <div>{(Object.keys(products) as ProductKey[]).map(key=><Link key={key} prefetch={false} href={productPath(key)}>{products[key].name}</Link>)}</div>
        </details>
        <Link className="nav-about" href="/#tentang">Tentang</Link>
        <Link className="nav-about" href="/#faq">FAQ</Link>
      </nav>
      <Link href="/#kontak" className="button nav-contact">Hubungi Kami</Link>
    </div>
  </header>;
}
export function Footer() {
  return <footer className="footer"><div className="shell footer-grid">
    <div><Brand/><p>Untuk bisnis yang ingin memahami pasarnya dan lebih dekat dengan pelanggannya.</p></div>
    <div><h2>Produk</h2><Link href={productPath("competitor-scraping")}>Competitor Scraping</Link><Link href={productPath("wa-suite")}>WA-Suite</Link></div>
    <div><h2>RAQIO</h2><Link href="/#tentang">Tentang</Link><Link href="/#faq">FAQ</Link><Link href="/#kontak">Kontak</Link></div>
  </div><div className="shell footer-bottom"><span>RAQIO</span><span>Indonesia</span></div></footer>;
}

export function AppLink({product}:{product:ProductKey}) {
  const info=products[product];
  return info.url ? <a href={info.url} className="button button-dark">Buka {info.name}</a> :
    <Link href="/#kontak" className="button button-dark">Tanya tentang {info.name}</Link>;
}

export function ProductDemo({product}:{product:ProductKey}) {
  if(product==="competitor-scraping") return <div className="demo demo-market" aria-label="Contoh tampilan ringkasan riset">
    <div className="demo-top"><span><i/> Riset pasar</span><small>Contoh</small></div>
    <strong>Kedai kopi di Jakarta</strong>
    <div className="market-row"><span>Wilayah</span><span>Bisnis ditemukan</span></div>
    {[["Kemang",42],["Cipete",31],["Tebet",26]].map(([name,value])=><div className="market-row" key={name}><span>{name}</span><span>{value}</span></div>)}
  </div>;
  return <div className="demo demo-chat" aria-label="Contoh tampilan antrean percakapan">
    <div className="demo-top"><span><i/> Inbox tim</span><small>Contoh</small></div>
    {[["N","Nadia","Halo, masih bisa pesan hari ini?","Baru"],["R","Rizky","Terima kasih, sudah diterima.","Selesai"]].map(([letter,name,message,state])=>
      <div className="chat-row" key={name}><b aria-hidden="true">{letter}</b><span><strong>{name}</strong><small>{message}</small></span><em>{state}</em></div>)}
  </div>;
}

export function ProductTile({product}:{product:ProductKey}) {
  const info=products[product];
  return <article className="product-tile">
    <div className="product-art"><Image fill src={info.image} alt={info.alt} sizes="(max-width: 800px) 100vw, 45vw"/><ProductDemo product={product}/></div>
    <div className="product-copy"><p className="eyebrow">{info.name}</p><h3>{info.title}</h3><p>{info.description}</p>
      <Link className="text-link" href={productPath(product)}>Pelajari {info.name}</Link>
    </div>
  </article>;
}

export function Contact() {
  return <section id="kontak" className="contact">
    <Image src="/media/cta.webp" alt="" fill sizes="100vw"/>
    <div className="shell contact-inner"><h2>Mulai bersama RAQIO.</h2><p>Pilih produk yang sesuai dengan pekerjaan tim Anda.</p>
      <div className="actions">{contactEmail ? <a href={"mailto:"+contactEmail} className="button button-light">Kirim email</a> : null}
        <Link className="button button-outline" href={productPath("competitor-scraping")}>Competitor Scraping</Link>
        <Link className="button button-outline" href={productPath("wa-suite")}>WA-Suite</Link>
      </div>
    </div>
  </section>;
}
export function FAQ() {
  return <section id="faq" className="shell faq section"><h2>Pertanyaan umum.</h2><div>
    {copy.faq.map(([question,answer])=><details key={question}><summary>{question}</summary><p>{answer}</p></details>)}
  </div></section>;
}
