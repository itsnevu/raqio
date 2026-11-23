import SitePage from "../../components/SitePage";
import ContactForm from "../../components/ContactForm";
import {contactEmail} from "../../content";
export const metadata={title:"Kontak dan demo"};

const next=[
  ["Ceritakan kebutuhan","Isi form singkat ini. Cukup gambaran umum, tidak perlu detail teknis."],
  ["Kami pelajari","Tim RAQIO membaca kebutuhan Anda dan menyiapkan contoh yang relevan."],
  ["Diskusi dan demo","Kita bahas produk yang paling cocok, dengan contoh dari wilayah dan industri Anda."],
];

export default function ContactPage(){return <SitePage title="Mulai bersama RAQIO." image="/media/cta.webp"
  intro="Ceritakan kebutuhan tim Anda untuk membahas produk atau demo.">
  <section className="shell section contact-split">
    <div className="contact-card"><h2>Kirim pesan</h2><ContactForm email={contactEmail}/></div>
    <aside className="contact-next"><h2>Setelah Anda mengirim</h2>
      <ol>{next.map(([title,body])=><li key={title}><strong>{title}</strong><span>{body}</span></li>)}</ol>
    </aside>
  </section>
</SitePage>;}
