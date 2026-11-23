import Link from "next/link";
import SitePage from "../../components/SitePage";
import {AppLink} from "../../components/Marketing";
import {products,productPath,type ProductKey} from "../../content";

const comparison=[
  {key:"competitor-scraping",audience:"Pemilik UMKM, tim penjualan, dan agensi riset.",work:"Petakan bisnis lokal dari sumber publik dan bandingkan beberapa wilayah.",output:"Laporan pasar dan daftar prospek."},
  {key:"wa-suite",audience:"Tim layanan pelanggan, penjualan, dan bisnis dengan beberapa nomor.",work:"Kelola inbox WhatsApp Business, penugasan agen, dan template balasan.",output:"Antrean percakapan dan status tindak lanjut."},
] satisfies {key:ProductKey;audience:string;work:string;output:string}[];
export const metadata={title:"Bandingkan produk"};
export default function Compare(){return <SitePage image="/media/raqio-mountain-valley.webp" title="Bandingkan produk RAQIO." intro="Satu untuk memahami pasar. Satu untuk menangani percakapan pelanggan.">
  <section className="shell section compare-grid" aria-label="Perbandingan produk">{comparison.map(item=><article className="compare-card" key={item.key}><h2>{products[item.key].name}</h2>
    <dl><dt>Untuk siapa</dt><dd>{item.audience}</dd><dt>Cara kerja</dt><dd>{item.work}</dd><dt>Hasil</dt><dd>{item.output}</dd><dt>Akses</dt><dd><Link href={productPath(item.key)}>Lihat detail produk</Link></dd></dl><AppLink product={item.key}/></article>)}</section>
</SitePage>;}
