import Link from "next/link";
import SitePage from "../../components/SitePage";
export const metadata={title:"Tentang RAQIO"};

const principles=[
  ["Data publik, dipakai dengan jujur","Competitor Scraping memakai sumber publik seperti listing bisnis dan situs web. Cakupannya bergantung pada wilayah dan ketersediaan sumber, jadi temuan kami adalah titik awal untuk diperiksa, bukan keputusan akhir."],
  ["Dibuat untuk kerja tim","Dari riset sampai percakapan pelanggan, setiap langkah punya pemilik yang jelas. Tim tahu siapa mengerjakan apa, dan tidak ada prospek yang terlewat."],
  ["Lokal lebih dulu","Pasar di Kemang berbeda dengan Tebet. Kami memetakan per wilayah supaya keputusan dibuat dengan konteks yang tepat."],
];

export default function About(){return <SitePage title="Tentang RAQIO." image="/media/raqio-night-desk.webp"
  intro="Kami membangun alat untuk memahami pasar lokal dan membantu tim menindaklanjuti percakapan pelanggan.">
  <section className="shell section about-story">
    <div className="about-photo">
      {/* eslint-disable-next-line @next/next/no-img-element -- local art with parallax */}
      <img src="/media/raqio-jakarta-skyline.webp" alt="Gedung-gedung Jakarta saat senja" loading="lazy"/>
    </div>
    <div className="about-copy">
      <h2>Informasi bisnis lokal masih tersebar di banyak tempat.</h2>
      <p>Membuka cabang atau mencari prospek sering berarti mengumpulkan data dari banyak tab. Saat pelanggan mulai menghubungi bisnis, tim juga perlu berbagi tanggung jawab dengan jelas.</p>
      <p>RAQIO menyatukan dua pekerjaan itu: memahami pasar, lalu melayani pelanggan yang datang dari pasar tersebut.</p>
    </div>
  </section>
  <section className="shell section principles">
    <h2>Cara kami bekerja.</h2>
    <div className="principle-grid">{principles.map(([title,body])=><article key={title}><h3>{title}</h3><p>{body}</p></article>)}</div>
  </section>
  <section className="shell section about-cta">
    <div><h2>Karier dan kolaborasi.</h2><p>Ingin memperkenalkan diri atau membicarakan kolaborasi? Kami senang mendengarnya.</p></div>
    <Link className="button button-amber" href="/kontak">Hubungi RAQIO <span aria-hidden="true">&#8594;</span></Link>
  </section>
</SitePage>;}
