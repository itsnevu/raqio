import Link from "next/link";
import {Button,Navbar,Footer as SharedFooter,MockCard} from "../../../packages/ui/components";
import {contactEmail,copy,products,productPath,type ProductKey} from "../content";

export function Header() {
  return <Navbar><nav aria-label="Navigasi utama"><details className="product-menu"><summary>Produk <span aria-hidden="true" className="chevron"/></summary>
    <div><Link className="mobile-about" href="/tentang">Tentang RAQIO</Link><Link href="/produk">Bandingkan produk</Link>{(Object.keys(products) as ProductKey[]).map(key=><Link key={key} href={productPath(key)}>{products[key].name}</Link>)}</div>
    </details><Link className="nav-about" href="/tentang">Tentang</Link><Link className="nav-about" href="/#faq">FAQ</Link></nav>
    <Link href="/kontak" className="button nav-contact">Hubungi Kami</Link></Navbar>;
}
export function Footer() {
  return <SharedFooter><div><h2>Produk</h2><Link href={productPath("competitor-scraping")}>Competitor Scraping</Link><Link href={productPath("wa-suite")}>WA-Suite</Link><Link href="/produk">Bandingkan</Link></div>
    <div><h2>RAQIO</h2><Link href="/tentang">Tentang</Link><Link href="/kontak">Kontak</Link><Link href="/privasi">Privasi</Link><Link href="/syarat">Syarat</Link></div></SharedFooter>;
}
export function AppLink({product}:{product:ProductKey}) {
  return <Button href={products[product].url ?? "/kontak"}>{products[product].url ? "Coba sekarang" : "Tanya tentang produk"} <span aria-hidden="true">&#8594;</span></Button>;
}

export function ProductDemo({product}:{product:ProductKey}) {
  if(product==="competitor-scraping") return <MockCard className="demo-market">
    <div className="demo-top"><span><i/> Riset pasar</span><small>Contoh</small></div>
    <strong>Kedai kopi di Jakarta</strong>
    <div className="market-row"><span>Wilayah</span><span>Bisnis ditemukan</span></div>
    {[["Kemang",42],["Cipete",31],["Tebet",26]].map(([name,value])=><div className="market-row" key={name}><span>{name}</span><span>{value}</span></div>)}
  </MockCard>;
  return <MockCard className="demo-chat">
    <div className="demo-top"><span><i/> Inbox tim</span><small>Contoh</small></div>
    {[["N","Nadia","Halo, masih bisa pesan hari ini?","Baru"],["R","Rizky","Terima kasih, sudah diterima.","Selesai"]].map(([letter,name,message,state])=>
      <div className="chat-row" key={name}><b aria-hidden="true">{letter}</b><span><strong>{name}</strong><small>{message}</small></span><em>{state}</em></div>)}
  <div className="mock-action">Ambil chat</div></MockCard>;
}

export function ProductTile({product}:{product:ProductKey}) {
  const info=products[product];
  return <article className="product-tile">
    <div className={"product-art product-stage "+(product==="wa-suite"?"stage-chat":"stage-market")}><ProductDemo product={product}/></div>
    <div className="product-copy"><p className="eyebrow">{info.name}</p><h3>{product==="wa-suite" ? "Untuk tim yang melayani pelanggan lewat WhatsApp." : "Untuk tim yang ingin memahami pasar."}</h3><p>{info.description}</p>
      <Link className="text-link" href={productPath(product)}>Selengkapnya <span aria-hidden="true">&#8594;</span></Link>
    </div>
  </article>;
}

export function Contact() {
  return <section id="kontak" className="contact">
    <div className="shell contact-inner"><h2>Mulai bersama RAQIO.</h2><p>Pilih produk yang sesuai dengan pekerjaan tim Anda.</p>
      <div className="actions">{contactEmail ? <a href={"mailto:"+contactEmail} className="button button-light">Kirim email</a> : null}
        <Link className="button button-amber" href="/kontak">Tanya tentang produk</Link>
        <Link className="button button-outline" href="/produk">Bandingkan produk</Link>
      </div>
    </div>
  </section>;
}
export function FAQ() {
  return <section id="faq" className="shell faq section"><div><h2>Pertanyaan umum.</h2><p className="partner"><Link href="/kontak">Bermitra dengan kami</Link></p></div><div>
    {copy.faq.map(([question,answer])=><details key={question}><summary>{question}</summary><p>{answer}</p></details>)}
  </div></section>;
}
