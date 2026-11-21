import Link from "next/link";
import SitePage from "../../components/SitePage";
import {products} from "../../content";
export const metadata={title:"Syarat"};
export default function Terms(){const url=products["competitor-scraping"].url;return <SitePage title="Syarat penggunaan." intro="Informasi penggunaan situs profil dan akses ke produk RAQIO."><article className="shell section prose">
<h2>Informasi pada situs</h2><p>Cuplikan antarmuka di situs ini bersifat ilustratif. Cakupan riset bergantung pada data publik yang tersedia saat pencarian.</p>
<h2>Penggunaan aplikasi</h2><p>Akun dan penggunaan masing-masing produk mengikuti ketentuan aplikasi terkait.</p>
{url?<a className="text-link" href={new URL("/terms",url).href}>Syarat Competitor Scraping</a>:null}
<h2>Pertanyaan</h2><p><Link href="/kontak">Hubungi RAQIO</Link> jika Anda membutuhkan penjelasan.</p>
</article></SitePage>;}
