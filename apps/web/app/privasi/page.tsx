import Link from "next/link";
import SitePage from "../../components/SitePage";
import {products} from "../../content";
export const metadata={title:"Privasi"};
export default function Privacy(){const url=products["competitor-scraping"].url;return <SitePage title="Privasi." intro="Informasi tentang situs profil RAQIO dan akses ke aplikasi produk."><article className="shell section prose">
<h2>Formulir kontak</h2><p>Formulir menyiapkan draf di aplikasi email Anda. Situs profil tidak menyimpan isi formulir atau mengirim email secara otomatis.</p>
<h2>Privasi produk</h2><p>Competitor Scraping dan WA-Suite memiliki alur masuk terpisah. Baca kebijakan yang tersedia di aplikasi sebelum memakai layanan.</p>
{url?<a className="text-link" href={new URL("/privacy",url).href}>Privasi Competitor Scraping</a>:null}
<h2>Pertanyaan</h2><p><Link href="/kontak">Hubungi RAQIO</Link> untuk pertanyaan mengenai situs ini.</p>
</article></SitePage>;}
