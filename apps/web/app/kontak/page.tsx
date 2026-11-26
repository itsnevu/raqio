import SitePage from "../../components/SitePage";
import ContactForm from "../../components/ContactForm";
import {getI18n} from "../../i18n/server";
import {contactEmail} from "../../content";
export async function generateMetadata(){const {t}=await getI18n();return {title:t("Kontak dan demo")};}

const next=[
  ["Ceritakan kebutuhan","Isi form singkat ini. Cukup gambaran umum, tidak perlu detail teknis."],
  ["Kami pelajari","Tim RAQIO membaca kebutuhan Anda dan menyiapkan contoh yang relevan."],
  ["Diskusi dan demo","Kita bahas produk yang paling cocok, dengan contoh dari wilayah dan industri Anda."],
];

export default async function ContactPage(){const {t}=await getI18n();return <SitePage title={t("Mulai bersama RAQIO.")} image="/media/cta.webp"
  intro={t("Ceritakan kebutuhan tim Anda untuk membahas produk atau demo.")}>
  <section className="shell section contact-split">
    <div className="contact-card"><h2>{t("Kirim pesan")}</h2><ContactForm email={contactEmail}/></div>
    <aside className="contact-next"><h2>{t("Setelah Anda mengirim")}</h2>
      <ol>{next.map(([title,body])=><li key={title}><strong>{t(title)}</strong><span>{t(body)}</span></li>)}</ol>
    </aside>
  </section>
</SitePage>;}
