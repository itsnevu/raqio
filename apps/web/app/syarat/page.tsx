import {getI18n} from "../../i18n/server";
import Link from "next/link";
import SitePage from "../../components/SitePage";
import {products} from "../../content";
export async function generateMetadata(){const {t}=await getI18n();return {title:t("Syarat")};}
export default async function Terms(){const {t,href}=await getI18n();const url=products["competitor-scraping"].url;return <SitePage title={t("Syarat penggunaan.")} intro={t("Informasi penggunaan situs profil dan akses ke produk RAQIO.")}><article className="shell section prose">
<h2>{t("Informasi pada situs")}</h2><p>{t("Cuplikan antarmuka di situs ini bersifat ilustratif. Cakupan riset bergantung pada data publik yang tersedia saat pencarian.")}</p>
<h2>{t("Penggunaan aplikasi")}</h2><p>{t("Akun dan penggunaan masing-masing produk mengikuti ketentuan aplikasi terkait.")}</p>
{url?<a className="text-link" href={new URL("/terms",url).href}>{t("Syarat Competitor Scraping")}</a>:null}
<h2>{t("Pertanyaan")}</h2><p><Link href={href("/kontak")}>{t("Hubungi RAQIO")}</Link>{t(" jika Anda membutuhkan penjelasan.")}</p>
</article></SitePage>;}
