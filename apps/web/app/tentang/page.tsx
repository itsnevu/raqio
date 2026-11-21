import Link from "next/link";
import SitePage from "../../components/SitePage";
export const metadata={title:"Tentang RAQIO"};
export default function About(){return <SitePage title="Tentang RAQIO." intro="Kami membangun alat untuk memahami pasar lokal dan membantu tim menindaklanjuti percakapan pelanggan.">
  <section className="shell section workflow"><div className="workflow-image design-grid" aria-hidden="true"><i/><i/><i/></div>
  <div className="prose"><h2>Kenapa kami membangunnya</h2><p>Membuka cabang atau mencari prospek sering berarti mengumpulkan data dari banyak tab. Saat pelanggan mulai menghubungi bisnis, tim juga perlu berbagi tanggung jawab dengan jelas.</p>
  <h2>Cara kami bekerja dengan data publik</h2><p>Competitor Scraping memakai sumber publik seperti listing bisnis dan situs web. Cakupannya bergantung pada wilayah dan ketersediaan sumber. Gunakan temuan sebagai titik awal dan periksa kembali informasi sebelum mengambil keputusan.</p>
  <h2>Karier dan kolaborasi</h2><p>Untuk memperkenalkan diri atau membicarakan kolaborasi, <Link href="/kontak">hubungi RAQIO</Link>.</p></div></section>
</SitePage>;}
