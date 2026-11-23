import Image from "next/image";
import {Albert_Sans} from "next/font/google";
import {CountUp} from "./ProductStory";
import "./scraping-mock.css";

const font=Albert_Sans({subsets:["latin"],weight:["400","500","600","700"],variable:"--mock-cs-font",display:"swap"});
const nav=["Riset","Prospek","Pantau","Kampanye","Peringkat","Asisten","Lanjutan"];
const stages=["Cari di Google Maps","Ambil telepon dan website","Cari akun IG","Susun laporan","Simpan"];
const progress=[10,30,50,70,90];
const countdown=[52,34,25,19,12];
const prospects=[
  {column:"Belum dihubungi",name:"Kedai Sela Fiksi",score:86,color:"#F28C28"},
  {column:"Dihubungi",name:"Kopi Reka Fiksi",score:72,color:"#B388FF"},
  {column:"Tertarik",name:"Ruang Seduh Fiksi",score:77,color:"#B388FF"},
  {column:"Deal"},
  {column:"Tidak jadi"},
];

function ProspectBoard(){
  return <div className="pros">
    <div className="head">
      <div><div className="page-title">Prospek</div><p className="lead">Bisnis yang paling mungkin butuh jasamu, diambil dari semua riset. Geser kartu atau pakai menu Pindah ke untuk ubah status, klik untuk detail.</p></div>
      <div className="board-actions"><button type="button" className="btn">Buat kampanye</button><button type="button" className="btn ghost">Ekspor CSV</button></div>
    </div>
    <div className="strip">
      <div><small>Total prospek</small><b>3</b></div>
      <div><small>Follow up hari ini</small><b>0</b></div>
      <div><small>Sedang berjalan</small><b>2</b></div>
      <div><small>Deal</small><b>0</b></div>
    </div>
    <div className="bar">
      <input type="search" readOnly placeholder="Cari nama, wilayah, catatan"/>
      <select defaultValue=""><option value="">Semua riset</option><option>coffee shop · Kemang Jakarta</option></select>
      <label><input type="checkbox" readOnly/> Hanya yang jatuh tempo</label>
    </div>
    <label className="offer">
      Jasa yang kamu tawarkan (dipakai di draf pesan):
      <input readOnly placeholder="mis. bikin website dan katalog online"/>
    </label>
    <div className="board">
      {prospects.map(({column,name,score,color},i)=><section className="col" key={column}>
        <div className="col-h">{column}<b>{name?1:0}</b></div>
        <div className="col-b">
          {name?<article className="card">
            <div className="t">
              <button type="button" className="n nm-btn withlogo"><span className="bavatar ini" style={{background:color}}>{name.split(" ").slice(0,2).map(word=>word[0]).join("")}</span>{name}</button>
              <span className="sc hi">{score}</span>
              <button type="button" className="help-btn">?</button>
            </div>
            <div className="m">coffee shop · Kemang Jakarta</div>
            <div className="r">Bisa WhatsApp, tanpa website</div>
            <div className="a">
              <button type="button" className="wa">WhatsApp</button>
              <label className="mv"><select defaultValue={column}><option value={column}>{i===0?"Baru":column}</option></select></label>
              <button type="button" className="next">{prospects[i+1].column} →</button>
            </div>
          </article>:<div className="col-hint">Kosong</div>}
        </div>
      </section>)}
    </div>
  </div>;
}


function MockField({text,placeholder,typing}:{text:string;placeholder:string;typing:boolean}){
  return <div className={"search-input"+(text?"":" placeholder")}>
    <span className={typing?"typing":undefined} style={typing?{animationTimingFunction:`steps(${text.length}, end)`}:undefined}>{text||placeholder}</span>
  </div>;
}

function MockProgress({phase}:{phase:number}){
  return <div className="prog live">
    <div className="prog-h">
      <b>Riset sedang berjalan{phase===0&&<em className="go"> · Worker mulai!</em>}</b>
      <span className="mono eta-n">± 0:<CountUp key={phase} from={countdown[phase]} to={countdown[phase]-1} run duration={850}/> lagi</span>
      <button type="button" className="btn ghost">Hentikan</button>
    </div>
    <div className="prog-bar"><i style={{width:`${progress[phase]}%`}}/></div>
    <ol>{stages.map((stage,i)=><li className={i<phase?"done":i===phase?"now":undefined} key={stage}>{stage}</li>)}</ol>
    <div className="eta">Perkiraan saja, biasanya 2 sampai 4 menit per wilayah. Boleh pindah tab atau halaman, kamu akan diberi tahu saat selesai.</div>
  </div>;
}

export default function ScrapingMock({step,mobile=false}:{step:number;mobile?:boolean}){
  const running=step>=5&&step<=9;
  const finished=step>=10;
  const pressing=step===4;
  return <div className={`mock-cs ${font.variable}${mobile?" mobile":""}`}>
    <div className="top">
      <div className="brand"><Image className="mark" src="/brand-transparent.svg" alt="" width={32} height={32}/><span className="word">raqio</span></div>
      <nav>{nav.map((label,i)=><span key={label} className={(label===(finished?"Prospek":"Riset")?"on ":"")+(i===5?"hide-m":i===6?"more":"")}>{label}</span>)}</nav>
    </div>
    <div className="wrap">
      {finished?<ProspectBoard/>:<>
        <div className="page-title">Peta pasar industri apa pun.</div>
        <p className="lead">Scraping langsung dari Google Maps dan website bisnis. Data dibersihkan, tanpa duplikat.</p>
        <div className="mode"><button type="button" className="on">Satu wilayah</button><button type="button">Bandingkan wilayah</button></div>
        <div className="goal">
          <label className="on"><input type="radio" checked readOnly name={mobile?"goal-mobile":"goal-desktop"}/><div><b>Cari calon klien</b><span>Isi industri bisnis yang mau kamu tawari. Contoh: kamu agency, isi &quot;coffee shop&quot; atau &quot;klinik gigi&quot;.</span></div></label>
          <label><input type="radio" readOnly name={mobile?"goal-mobile":"goal-desktop"}/><div><b>Pelajari pesaing</b><span>Isi industri bisnismu sendiri. Contoh: kamu agency, isi &quot;digital agency&quot;. Hasilnya pesaing, bukan klien.</span></div></label>
        </div>
        <div className="search">
          <MockField text={step>=1?"coffee shop":""} placeholder="Industri, mis. coffee shop, salon, digital agency" typing={step===1}/>
          <span className="sep"/>
          <MockField text={step>=2?"Kemang Jakarta":""} placeholder="Wilayah, mis. Kemang Jakarta" typing={step===2}/>
          <button type="button" className="mapbtn">Pilih di peta</button>
          <button type="button" className={"btn run-button"+(pressing?" story-press":"")} disabled={running}>Riset
            <i className={"story-cursor"+(step===3||pressing?" at":"")+(pressing?" click":"")}/>
          </button>
        </div>
        {running?<MockProgress phase={step-5}/>:<div className="empty">Belum ada riset. Isi industri dan wilayah di atas.</div>}
      </>}
    </div>
  </div>;
}
