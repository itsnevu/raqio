import Image from "next/image";
import {CountUp} from "./ProductStory";
import {WaMockIcon,type WaMockIconName} from "./WaMockIcons";
import "./wa-suite-mock.css";


const menu: [WaMockIconName,string][]=[
  ["railDashboard","Ringkasan"],["railChat","Chat"],["railNumbers","Nomor"],
  ["btnRules","Rules"],["railTemplates","Template"],["railAi","Otomasi AI"],
  ["railLabels","Label"],["btnUsers","Agen"],["railBackups","Backup"],
  ["railDeals","Verifikasi deal"],["railAnalytics","Analytics closing"],
  ["railNotifications","Notifikasi"],["railSearch","Cari pesan"],["railMonitor","Monitor"],
  ["railAccount","Akun"],["btnOut","Keluar"],
];
const bottomMenu: [WaMockIconName,string][]=[
  ["railChat","Chat"],["railNumbers","Nomor"],["railNotifications","Notifikasi"],
  ["railSearch","Cari"],["menu","Lainnya"],
];
const previousChats=[
  {name:"Rizky Pratama",time:"10.41",preview:"Baik, saya ambil sore ini.",status:"Diproses",agent:"Ayu"},
  {name:"Bagas Ramadhan",time:"10.32",preview:"Terima kasih, Kak.",status:"Selesai",agent:"Dimas"},
  {name:"Aulia Maharani",time:"10.20",preview:"Ada pilihan tanpa gula?",status:"Baru",agent:"Belum ditugaskan"},
  {name:"Fajar Nugraha",time:"09.58",preview:"Pesanan sudah diterima.",status:"Selesai",agent:"Ayu"},
  {name:"Salsa Amelia",time:"09.31",preview:"Boleh minta daftar menunya?",status:"Diproses",agent:"Dimas"},
];
const incoming="Halo kak, masih bisa pesan hari ini?";
const followup="Kalau bisa, saya mau pesan dua kopi susu.";
const reply="Bisa, Kak Nadia. Dua kopi susu kami siapkan ya!";

function SelectMock({children}:{children:string}){
  return <button type="button" className="select-trigger"><span>{children}</span><WaMockIcon name="select"/></button>;
}

function Rail({mobile,unread}:{mobile:boolean;unread:boolean}){
  return <nav className="rail">
    {!mobile&&<div className="logo"><Image src="/brand-transparent.svg" alt="" width={32} height={32}/><span>raqio</span></div>}
    {(mobile?bottomMenu:menu).map(([icon,label])=>
      <button type="button" key={icon} className={icon==="railChat"?"active":undefined} title={label}>
        <WaMockIcon name={icon}/><span>{label}</span>
        {icon==="railNotifications"&&unread&&<b className="notification-badge"><CountUp from={1} to={2} run duration={500}/></b>}
      </button>,
    )}
  </nav>;
}

function Inbox({arrival,taken,typing,sent}:{arrival:boolean;taken:boolean;typing:boolean;sent:boolean}){
  const chats=arrival?[{
    name:"Nadia Putri",time:sent?"10.44":"10.43",preview:sent?"Anda: "+reply:typing?followup:incoming,
    status:taken?"Diproses":"Baru",agent:taken?"Dimas":"Belum ditugaskan",
  },...previousChats]:previousChats;
  return <aside className="number-panel">
    <div className="section-head"><strong>Nomor</strong><button type="button" className="ghost guide"><WaMockIcon name="help"/>Panduan</button></div>
    <div className="number-controls"><SelectMock>Kopi Senja</SelectMock><button type="button" className="add-number" title="Hubungkan nomor"><WaMockIcon name="plus"/></button></div>
    <div className="number-manager"><WaMockIcon name="select"/>Kelola nomor</div>
    <div className="search-head">
      <div className="inbox-search"><WaMockIcon name="railSearch"/>Cari chat atau nomor</div>
      <div className="inbox-filters">{["Semua","Belum dibaca"].map((label,i)=><button type="button" key={label} aria-pressed={i===0}>{label}</button>)}<button type="button" aria-pressed={false} className="filter-more"><WaMockIcon name="select"/></button></div>
      <div className="inbox-status-filter"><label>Status</label><SelectMock>Semua status</SelectMock></div>
    </div>
    {chats.map(({name,time,preview,status,agent},i)=>{
      const active=i===0;
      return <div key={name} className={"chat"+(active?" active":"")+(active&&arrival?" arriving":"")}>
        <span className="chat-avatar">{name.split(" ").map(word=>word[0]).join("")}</span>
        <div className="chat-info">
          <div className="chat-topline"><strong>{name}</strong><time>{time}</time></div>
          <div className="chat-preview">{preview}</div>
          <div className="chat-bottomline"><span className="conversation-tag">{status}</span><small>{agent}</small>
            {active&&arrival&&!taken&&<span className="unread-count">{typing?2:1}</span>}
          </div>
        </div>
      </div>;
    })}
  </aside>;
}

function Bubble({out=false,time,children}:{out?:boolean;time:string;children:string}){
  return <div className={out?"b me":"b"}>{children}<div className="message-time">{time}</div></div>;
}

export default function WaSuiteMock({step,mobile=false}:{step:number;mobile?:boolean}){
  const arrival=step>=1;
  const typing=step>=2;
  const taken=step>=5;
  const sent=step>=6;
  const cursor=step===3||step===4;
  const press=step===4;
  const name=arrival?"Nadia Putri":"Rizky Pratama";
  const cursorMark=<i className={"story-cursor"+(cursor?" at":"")+(press?" click":"")}/>;
  return <div className={"mock-wa"+(mobile?" mobile":"")}>
    <Rail mobile={mobile} unread={arrival&&!taken}/>
    {!mobile&&<Inbox arrival={arrival} taken={taken} typing={step>=3} sent={sent}/>}
    <div className="thread">
      <div className="head card">
        {mobile&&<button type="button" className="ghost"><WaMockIcon name="back"/></button>}
        <span className="chat-avatar">{name.split(" ").map(word=>word[0]).join("")}</span>
        <div className="contact-heading"><strong>{name}</strong><small>+62 812-0000-10{arrival?"01":"02"}</small></div>
        {mobile?<button type="button" className="ghost"><WaMockIcon name="more"/></button>:<>
          <SelectMock>{taken||!arrival?"Diproses":"Baru"}</SelectMock>
          <button type="button" title="Ambil chat" className={"ghost take"+(press?" story-press":"")}><WaMockIcon name="takeChat"/>{cursorMark}</button>
          {taken&&<button type="button" className="ghost" title="Lepas penugasan"><WaMockIcon name="release"/></button>}
          {(["exportChat","labelPick","headDelete"] as const).map(icon=><button key={icon} type="button" className="ghost"><WaMockIcon name={icon}/></button>)}
        </>}
      </div>
      <div className="msgs card">
        <div className="message-date"><span>Hari ini</span></div>
        {arrival?<>
          {!taken&&<div className="unread-divider">belum dibaca</div>}
          <Bubble time="10.43">{incoming}</Bubble>
          {step>=3&&<Bubble time="10.43">{followup}</Bubble>}
          {typing&&step===2&&<div className="b typing">Nadia sedang mengetik<span>…</span></div>}
          {sent&&<Bubble time="10.44" out>{reply}</Bubble>}
        </>:<>
          <Bubble time="10.39">Kak, pesan kopi literan untuk sore bisa?</Bubble>
          <Bubble time="10.40" out>Bisa, Kak Rizky. Mau diambil jam berapa?</Bubble>
          <Bubble time="10.41">Baik, saya ambil sore ini.</Bubble>
        </>}
      </div>
      <div className="composer-card card">
        {mobile&&arrival&&!taken&&<button type="button" className={"take primary"+(press?" story-press":"")}><WaMockIcon name="takeChat"/>Ambil chat{cursorMark}</button>}
        <div className="composer">
          <button type="button" className="ghost"><WaMockIcon name="tplPick"/></button>
          <button type="button" className="ghost"><WaMockIcon name="btnFile"/></button>
          <textarea readOnly rows={1} placeholder="tulis pesan"/>
          <button type="button" className="primary send"><WaMockIcon name="send"/></button>
        </div>
      </div>
    </div>
  </div>;
}
