import {getI18n} from "../../i18n/server";
import Link from "next/link";
import SitePage from "../../components/SitePage";
import {products} from "../../content";
export async function generateMetadata(){const {t}=await getI18n();return {title:t("Privasi")};}
export default async function Privacy(){const {t,href}=await getI18n();const url=products["competitor-scraping"].url;return <SitePage title={t("Privasi.")} intro={t("Informasi tentang situs profil RAQIO dan akses ke aplikasi produk.")}><article className="shell section prose">
<h2>{t("Formulir kontak")}</h2><p>{t("Formulir menyiapkan draf di aplikasi email Anda. Situs profil tidak menyimpan isi formulir atau mengirim email secara otomatis.")}</p>
<h2>{t("Privasi produk")}</h2><p>{t("Competitor Scraping dan WA-Suite memiliki alur masuk terpisah. Baca kebijakan yang tersedia di aplikasi sebelum memakai layanan.")}</p>
{url?<a className="text-link" href={new URL("/privacy",url).href}>{t("Privasi Competitor Scraping")}</a>:null}
<h2>{t("Pertanyaan")}</h2><p><Link href={href("/kontak")}>{t("Hubungi RAQIO")}</Link>{t(" untuk pertanyaan mengenai situs ini.")}</p>
</article></SitePage>;}
