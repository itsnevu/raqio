import Link from "next/link";
import IndonesiaMap from "../../components/IndonesiaMap";
import PrincipleIllustration from "../../components/PrincipleIllustration";
import {getI18n} from "../../i18n/server";
import SitePage from "../../components/SitePage";
export async function generateMetadata(){const {t}=await getI18n();return {title:t("Tentang RAQIO")};}

const principles=[
  ["Data publik, dipakai dengan jujur","Competitor Scraping memakai sumber publik seperti listing bisnis dan situs web. Cakupannya bergantung pada wilayah dan ketersediaan sumber, jadi temuan kami adalah titik awal untuk diperiksa, bukan keputusan akhir."],
  ["Dibuat untuk kerja tim","Dari riset sampai percakapan pelanggan, setiap langkah punya pemilik yang jelas. Tim tahu siapa mengerjakan apa, dan tidak ada prospek yang terlewat."],
  ["Lokal lebih dulu","Pasar di Kemang berbeda dengan Tebet. Kami memetakan per wilayah supaya keputusan dibuat dengan konteks yang tepat."],
] as const;
const principleScenes=["research","team","local"] as const;

export default async function About(){const {t,href,lang}=await getI18n();return <SitePage title={t("Tentang RAQIO.")} image="/media/raqio-local-market-smooth-4k.webp"
  intro={t("RAQIO membantu bisnis memahami pasar lokal dan mengelola percakapan pelanggan. Kami mengembangkan AI dan otomasi untuk meringankan pekerjaan rutin tim.")}>
  <section className="shell section about-story">
    <IndonesiaMap>
      <h2>{t("Kami ingin bisnis Indonesia ")}<mark>{lang==="id"?"tumbuh":"grow"}</mark>{t(" dengan memahami pasar dan pelanggannya.")}</h2>
      <div className="about-direction">
        <div>
          <h3>{t("Visi kami")}</h3>
          <p>{t("Membantu bisnis Indonesia tumbuh lewat ")}<strong className="about-vision-emphasis">{t("pemasaran berbasis AI dan otomasi")}</strong>{t(" yang berdampak langsung bagi pemilik bisnis. Kami ingin memudahkan tim memahami pasar lokal, ")}<strong className="about-vision-emphasis">{t("menjangkau pelanggan yang tepat")}</strong>{t(", serta membalas pesan dan menindaklanjuti calon pelanggan tepat waktu.")}</p>
        </div>
        <div className="about-mission">
        <h3>{t("Misi kami")}</h3>
        <ul>
          <li>{t("Memetakan pasar lokal.")}</li>
          <li>{t("Mempermudah perbandingan wilayah.")}</li>
          <li>{t("Membantu tim menemukan prospek.")}</li>
          <li>{t("Menyatukan percakapan pelanggan.")}</li>
          <li>{t("Mengembangkan AI dan otomasi untuk pekerjaan rutin.")}</li>
        </ul>
        </div>
      </div>
    </IndonesiaMap>
  </section>
  <section className="shell section principles">
    <h2>{t("Cara kami bekerja.")}</h2>
    <div className="principle-grid">{principles.map(([title,body],index)=><article key={title}>
      <PrincipleIllustration scene={principleScenes[index]}/>
      <h3>{t(title)}</h3><p>{t(body)}</p>
    </article>)}</div>
  </section>
  <section className="shell section about-cta">
    <div><h2>{t("Karier dan kolaborasi.")}</h2><p>{t("Ingin memperkenalkan diri atau membicarakan kolaborasi? Kami senang mendengarnya.")}</p></div>
    <Link className="button button-amber" href={href("/kontak")}>{t("Hubungi RAQIO")} <span aria-hidden="true">&#8594;</span></Link>
  </section>
</SitePage>;}
