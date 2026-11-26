import {getI18n} from "../i18n/server";
import {salesWhatsapp} from "../content";
import "./saas-sections.css";

// Placeholder-free sections for review: remove <UseCases/> or <Sales/> from app/page.tsx to drop one.
const cases=[
  {title:"Agensi",text:"Cari klien yang punya celah sesuai jasa Anda, lalu bagi ke anggota tim.",rows:[["Belum punya website","24"],["Instagram tidak ditemukan","18"],["Ulasan masih sedikit","31"]]},
  {title:"Tim penjualan",text:"Susun daftar per wilayah dan pantau mana yang sudah dihubungi.",rows:[["Belum dihubungi","16"],["Dihubungi","9"],["Tertarik","4"]]},
  {title:"Freelancer",text:"Tulis satu profil jasa, dapatkan draf pesan yang siap diedit.",rows:[["Profil jasa","Siap"],["Draf pesan","12"],["Dikirim hari ini","5"]]},
];
export async function UseCases(){
  const {t}=await getI18n();
  return <section className="ss-band"><div className="shell section">
    <div className="block-head"><h2>{t("Dipakai untuk pekerjaan Anda.")}</h2></div>
    <div className="ss-cases">{cases.map(c=><article key={c.title}>
      <div className="ss-mini" aria-hidden="true">{c.rows.map(([k,v])=><p key={k}><span>{t(k)}</span><b>{t(v)}</b></p>)}</div>
      <h3>{t(c.title)}</h3><p>{t(c.text)}</p>
    </article>)}</div>
    <p className="ss-note">{t("Angka di atas adalah contoh tampilan.")}</p>
  </div></section>;
}

// No prices yet on purpose: plans are agreed with sales until billing is final.
const plans=[
  {name:"Riset",hint:"Temukan dan pilih calon pelanggan.",items:["Riset per industri dan wilayah","Skor dan daftar prospek","Pantau perubahan pasar","Draf pesan dan kampanye"]},
  {name:"Lengkap",hint:"Dari mencari prospek sampai melayani.",items:["Semua fitur Riset","Semua fitur Chat"],best:true},
  {name:"Chat",hint:"Layani percakapan bersama tim.",items:["Beberapa nomor dalam satu inbox","Penugasan agen","Template dan label","Aturan balasan"]},
];
export async function Sales(){
  const {t,href}=await getI18n();
  const link=(plan:string)=>salesWhatsapp?`https://wa.me/${salesWhatsapp}?text=${encodeURIComponent(t("Halo RAQIO, saya tertarik dengan paket ")+t(plan)+".")}`:href("/kontak");
  return <section className="ss-pricing" id="paket"><div className="shell section">
    <div className="block-head"><h2>{t("Pilih yang Anda butuhkan.")}</h2><p className="ss-lead">{t("Pakai satu produk atau keduanya. Tim kami bantu pilih yang sesuai.")}</p></div>
    <div className="ss-plans">{plans.map(p=><article key={p.name} className={p.best?"best":undefined}>
      <h3>{t(p.name)}</h3>
      <p className="ss-hint">{t(p.hint)}</p>
      <ul>{p.items.map(x=><li key={x}>{t(x)}</li>)}</ul>
      <a className={"button "+(p.best?"button-amber":"button-ghost")} href={link(p.name)}>{t("Chat sales")}</a>
    </article>)}</div>
  </div></section>;
}
