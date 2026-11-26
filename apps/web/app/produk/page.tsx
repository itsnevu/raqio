import Link from "next/link";
import SitePage from "../../components/SitePage";
import {AppLink} from "../../components/Marketing";
import {getI18n} from "../../i18n/server";
import {products,productPath,type ProductKey} from "../../content";

const comparison=[
  {key:"competitor-scraping",audience:"Pemilik UMKM, tim penjualan, dan agensi riset.",work:"Petakan bisnis lokal dari sumber publik dan bandingkan beberapa wilayah.",output:"Laporan pasar dan daftar prospek."},
  {key:"wa-suite",audience:"Tim layanan pelanggan, penjualan, dan bisnis dengan beberapa nomor.",work:"Kelola inbox WhatsApp Business, penugasan agen, dan template balasan.",output:"Antrean percakapan dan status tindak lanjut."},
] satisfies {key:ProductKey;audience:string;work:string;output:string}[];
export async function generateMetadata(){const {t}=await getI18n();return {title:t("Bandingkan produk")};}
export default async function Compare(){const {t,href}=await getI18n();return <SitePage image="/media/raqio-product-comparison-4k.webp" title={t("Bandingkan produk RAQIO.")} intro={t("Satu untuk memahami pasar. Satu untuk menangani percakapan pelanggan.")}>
  <section className="shell section compare-grid" aria-label={t("Perbandingan produk")}>{comparison.map(item=><article className="compare-card" key={item.key}><h2>{products[item.key].name}</h2>
    <dl><dt>{t("Untuk siapa")}</dt><dd>{t(item.audience)}</dd><dt>{t("Cara kerja")}</dt><dd>{t(item.work)}</dd><dt>{t("Hasil")}</dt><dd>{t(item.output)}</dd><dt>{t("Akses")}</dt><dd><Link href={href(productPath(item.key))}>{t("Lihat detail produk")}</Link></dd></dl><AppLink product={item.key}/></article>)}</section>
</SitePage>;}
