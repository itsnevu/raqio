import Link from "next/link";
import IndonesiaMap from "../../components/IndonesiaMap";
import PrincipleIllustration from "../../components/PrincipleIllustration";
import SitePage from "../../components/SitePage";
export const metadata={title:"Tentang RAQIO"};

const principles=[
  ["Data publik, dipakai dengan jujur","Competitor Scraping memakai sumber publik seperti listing bisnis dan situs web. Cakupannya bergantung pada wilayah dan ketersediaan sumber, jadi temuan kami adalah titik awal untuk diperiksa, bukan keputusan akhir."],
  ["Dibuat untuk kerja tim","Dari riset sampai percakapan pelanggan, setiap langkah punya pemilik yang jelas. Tim tahu siapa mengerjakan apa, dan tidak ada prospek yang terlewat."],
  ["Lokal lebih dulu","Pasar di Kemang berbeda dengan Tebet. Kami memetakan per wilayah supaya keputusan dibuat dengan konteks yang tepat."],
] as const;
const principleScenes=["research","team","local"] as const;

export default function About(){return <SitePage title="Tentang RAQIO." image="/media/raqio-local-market-smooth-4k.webp"
  intro="RAQIO membantu bisnis memahami pasar lokal dan mengelola percakapan pelanggan. Kami mengembangkan AI dan otomasi untuk meringankan pekerjaan rutin tim.">
  <section className="shell section about-story">
    <IndonesiaMap>
      <h2>Kami ingin bisnis Indonesia <mark>tumbuh</mark> dengan memahami pasar dan pelanggannya.</h2>
      <div className="about-direction">
        <div>
          <h3>Visi kami</h3>
          <p>Membantu bisnis Indonesia tumbuh lewat <strong className="about-vision-emphasis">pemasaran berbasis AI dan otomasi</strong> yang berdampak langsung bagi pemilik bisnis. Kami ingin memudahkan tim memahami pasar lokal, <strong className="about-vision-emphasis">menjangkau pelanggan yang tepat</strong>, serta membalas pesan dan menindaklanjuti calon pelanggan tepat waktu.</p>
        </div>
        <div className="about-mission">
        <h3>Misi kami</h3>
        <ul>
          <li>Memetakan pasar lokal.</li>
          <li>Mempermudah perbandingan wilayah.</li>
          <li>Membantu tim menemukan prospek.</li>
          <li>Menyatukan percakapan pelanggan.</li>
          <li>Mengembangkan AI dan otomasi untuk pekerjaan rutin.</li>
        </ul>
        </div>
      </div>
    </IndonesiaMap>
  </section>
  <section className="shell section principles">
    <h2>Cara kami bekerja.</h2>
    <div className="principle-grid">{principles.map(([title,body],index)=><article key={title}>
      <PrincipleIllustration scene={principleScenes[index]}/>
      <h3>{title}</h3><p>{body}</p>
    </article>)}</div>
  </section>
  <section className="shell section about-cta">
    <div><h2>Karier dan kolaborasi.</h2><p>Ingin memperkenalkan diri atau membicarakan kolaborasi? Kami senang mendengarnya.</p></div>
    <Link className="button button-amber" href="/kontak">Hubungi RAQIO <span aria-hidden="true">&#8594;</span></Link>
  </section>
</SitePage>;}
