"use client";
import {useEffect,useRef,useState} from "react";
import {useI18n} from "../i18n/client";
import {loginPath} from "../content";
import "./workflow-steps.css";

const steps=[
  {title:"Cara manual",text:"Tab Maps, catatan, dan nomor tersebar di mana-mana."},
  {title:"Riset pasar",text:"Satu pencarian, semua pemain di wilayah itu terkumpul."},
  {title:"Susun prospek",text:"Yang paling layak dihubungi naik ke atas, lengkap dengan alasannya."},
  {title:"Layani pelanggan",text:"Kirim pesan, lalu lanjutkan percakapan dari satu inbox."},
];
// Fictional businesses: labelled "Data contoh" in the stage.
const samples=[
  {key:"Salon",area:"Kemang",total:95,hot:16,name:"Salon Kirana",rating:"4,8",reviews:126,gap:"Belum punya website",offer:"katalog online"},
  {key:"Kedai kopi",area:"Tebet",total:84,hot:21,name:"Kedai Serambi",rating:"4,7",reviews:88,gap:"Instagram tidak ditemukan",offer:"kelola Instagram"},
  {key:"Klinik",area:"Depok",total:41,hot:9,name:"Klinik Asri",rating:"4,6",reviews:64,gap:"Ulasan masih sedikit",offer:"kumpulkan ulasan"},
];
const last=steps.length-1;
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
const ease=(n:number)=>n*n*(3-2*n);
const noise=(n:number)=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
type Point={x:number;y:number};
const COUNT=560;

/** Spread dots evenly over the outlines of every [data-dots] box in a scene. */
function outline(scene:Element,origin:DOMRect):Point[]{
  const boxes=[...scene.querySelectorAll("[data-dots]")].map(e=>e.getBoundingClientRect()).filter(r=>r.width>0);
  const total=boxes.reduce((sum,r)=>sum+2*(r.width+r.height),0);
  if(!total)return [];
  return Array.from({length:COUNT},(_,i)=>{
    let d=(i+.5)/COUNT*total;
    for(const r of boxes){
      const len=2*(r.width+r.height);
      if(d>len){d-=len;continue;}
      const x=r.left-origin.left,y=r.top-origin.top;
      if(d<r.width)return {x:x+d,y};
      d-=r.width;
      if(d<r.height)return {x:x+r.width,y:y+d};
      d-=r.height;
      if(d<r.width)return {x:x+r.width-d,y:y+r.height};
      return {x,y:y+r.height-(d-r.width)};
    }
    return {x:origin.width/2,y:origin.height/2};
  });
}
/** Businesses on the map: loose clusters, a few stragglers. */
function scatter(w:number,h:number):Point[]{
  const centers=[[.3,.34],[.62,.28],[.5,.58],[.78,.6],[.2,.68]];
  return Array.from({length:COUNT},(_,i)=>{
    const c=centers[Math.floor(noise(i+.3)*centers.length)],a=noise(i)*Math.PI*2,r=Math.pow(noise(i+.6),.8);
    const wide=noise(i+.9)>.82?.42:.17;
    return {x:w*Math.max(.05,Math.min(.95,c[0]+Math.cos(a)*r*wide)),y:h*Math.max(.14,Math.min(.84,c[1]+Math.sin(a)*r*wide))};
  });
}

// Wide screens pin the section and scrolling moves the story; narrow screens tap through it.
export default function WorkflowSteps(){
  const {t:tr,lang}=useI18n();
  const fill=(text:string)=>tr(text).replace("{name}",s.name).replace("{rating}",rating).replace("{offer}",tr(s.offer));
  const [active,setActive]=useState(0);
  const [pick,setPick]=useState(0);
  const s=samples[pick],rating=lang==="id"?s.rating:s.rating.replace(",","."),kind=tr(s.key);
  const pin=useRef<HTMLElement>(null);
  const stage=useRef<HTMLDivElement>(null);
  const visual=useRef<HTMLDivElement>(null);
  const canvas=useRef<HTMLCanvasElement>(null);
  const goal=useRef(0);
  const wake=useRef<()=>void>(()=>{});

  useEffect(()=>{
    const outer=pin.current,inner=stage.current,frame=visual.current,target=canvas.current,ctx=target?.getContext("2d");
    if(!outer||!inner||!frame||!target||!ctx)return;
    const still=matchMedia("(prefers-reduced-motion: reduce)");
    let raf=0,at=goal.current,w=0,h=0,layouts:Point[][]=[];
    const scenes=[...frame.querySelectorAll<HTMLElement>(".fs-scene")];
    const measure=()=>{
      const box=frame.getBoundingClientRect();
      w=box.width;h=box.height;
      if(!w||!h)return;
      const ratio=Math.min(devicePixelRatio,2);
      target.width=Math.round(w*ratio);target.height=Math.round(h*ratio);
      ctx.setTransform(ratio,0,0,ratio,0,0);
      layouts=scenes.map((s,i)=>i===1?scatter(w,h):outline(s,box));
      paint();
    };
    const paint=()=>{
      scenes.forEach((s,i)=>{
        const o=clamp(1-Math.abs(at-i)*2.4);
        s.style.opacity=String(o);
        s.style.visibility=o>0?"visible":"hidden";
      });
      ctx.clearRect(0,0,w,h);
      const i=Math.min(last-1,Math.floor(at)),t=at-i,a=layouts[i],b=layouts[i+1];
      if(!a?.length||!b?.length)return;
      const map=clamp(1-Math.abs(at-1)*1.6),alpha=Math.max(Math.sin(Math.PI*t),map*.9);
      if(alpha<.01)return;
      const spread=Math.sin(Math.PI*t);
      for(let pass=0;pass<2;pass++){
        ctx.fillStyle=pass?"#ffb020":"#d9d4cb";
        ctx.globalAlpha=pass?alpha:alpha*.75;
        ctx.beginPath();
        for(let n=0;n<COUNT;n++){
          if(Number(n%6===0)!==pass)continue;
          const p=a[n],q=b[n],local=ease(clamp((t-noise(n+.4)*.25)/.75)),angle=noise(n+.2)*Math.PI*2,far=spread*noise(n+.7);
          const x=p.x+(q.x-p.x)*local+Math.cos(angle)*far*w*.14,y=p.y+(q.y-p.y)*local+Math.sin(angle)*far*h*.14,r=pass?1.7:1.2;
          ctx.moveTo(x+r,y);ctx.arc(x,y,r,0,Math.PI*2);
        }
        ctx.fill();
      }
      ctx.globalAlpha=1;
    };
    const tick=()=>{
      raf=0;
      if(getComputedStyle(inner).position==="sticky"){
        const top=Number.parseFloat(getComputedStyle(inner).top)||0;
        const travel=Math.max(1,outer.offsetHeight-inner.offsetHeight);
        const p=clamp((top-outer.getBoundingClientRect().top)/travel);
        inner.style.setProperty("--flow-progress",String(p));
        const x=p*last,i=Math.min(last-1,Math.floor(x));
        goal.current=i+ease(clamp((x-i-.3)/.5)); // rest, travel, rest
      }
      const gap=goal.current-at;
      at=still.matches?Math.round(goal.current):Math.abs(gap)<.002?goal.current:at+gap*.14;
      paint();
      setActive(Math.round(at));
      if(!still.matches&&Math.abs(goal.current-at)>.002)raf=requestAnimationFrame(tick);
    };
    const queue=()=>{if(!raf)raf=requestAnimationFrame(tick);};
    wake.current=queue;
    const size=new ResizeObserver(()=>{measure();queue();});
    size.observe(frame);
    measure();queue();
    addEventListener("scroll",queue,{passive:true});
    return ()=>{cancelAnimationFrame(raf);size.disconnect();removeEventListener("scroll",queue);};
  },[]);

  const go=(i:number)=>{
    const outer=pin.current,inner=stage.current;
    if(!outer||!inner)return;
    if(getComputedStyle(inner).position!=="sticky"){goal.current=i;wake.current();return;}
    const top=Number.parseFloat(getComputedStyle(inner).top)||0;
    scrollTo({top:outer.getBoundingClientRect().top+scrollY-top+(outer.offsetHeight-inner.offsetHeight)*(i/last),behavior:"smooth"});
  };
  return <section id="alur" ref={pin} className="flow-pin fs-pin">
    <div ref={stage} className="flow-split flow-sticky">
      <div className="fs-left">
        <div className="fs-tabs" role="group" aria-label={tr("Contoh industri")}>
          {samples.map((x,i)=><button type="button" key={x.key} aria-pressed={i===pick} onClick={()=>setPick(i)}>{tr(x.key)}</button>)}
          <small>{tr("Data contoh")}</small>
        </div>
        <div ref={visual} className="fs-stage" aria-hidden="true">
          <div className="fs-scene fs-manual">
            <div className="fs-sheet" data-dots>
              <b>{tr("daftar ")}{kind.toLowerCase()} FINAL (2).xlsx</b>
              {[["Nama","Nomor","Catatan"].map(tr).join("|"),`${s.name}|0812...|${tr("sudah dichat?")}`,`??|${tr("nomor salah")}|`,`${tr("(lupa dari mana)")}|0857...|${tr("follow up KAPAN")}`].map(r=><p key={r}>{r.split("|").map((c,i)=><span key={i}>{c}</span>)}</p>)}
            </div>
            <div className="fs-browser" data-dots><b>{tr("Maps · 14 tab terbuka")}</b><p>{kind} {s.area}</p><p>{kind} {tr("dekat sini")}</p><p>{kind} {s.area} {tr("murah")}</p></div>
            <div className="fs-note" data-dots>{tr("Besok chat yang kemarin. Yang mana ya?")}</div>
            <div className="fs-note two" data-dots>{tr("Nomor WA ada di HP satunya")}</div>
          </div>
          <div className="fs-scene fs-map">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M0 30 C25 26 40 44 60 38 S90 22 100 26M8 100C14 74 34 66 40 44S46 12 44 0M100 72C78 70 66 80 46 74S14 66 0 74M72 0C70 24 80 48 76 70S84 92 88 100"/></svg>
            <div className="fs-count"><small>{kind} · {s.area}</small><strong>{s.total} {tr("bisnis")}</strong></div>
          </div>
          <div className="fs-scene fs-prospect">
            <div className="fs-count"><small>{tr("Layak dihubungi")}</small><strong>{s.hot} {tr("prospek")}</strong></div>
            <div className="fs-card lead" data-dots>
              <header><i>{s.name.split(" ").map(x=>x[0]).join("")}</i><div><b>{s.name}</b><small>★ {rating} · {s.reviews} {tr("ulasan")}</small></div><em>90</em></header>
              <p>{tr(s.gap)}</p>
              <blockquote>{fill("Halo kak, saya lihat {name} punya rating {rating}. Boleh saya kirim contoh {offer}?")}</blockquote>
            </div>
            <div className="fs-card" data-dots><header><i>CB</i><div><b>{tr("Contoh B")}</b><small>★ {lang==="id"?"4,5":"4.5"} · 73 {tr("ulasan")}</small></div><em>78</em></header></div>
            <div className="fs-card" data-dots><header><i>CC</i><div><b>{tr("Contoh C")}</b><small>★ {lang==="id"?"4,4":"4.4"} · 51 {tr("ulasan")}</small></div><em>71</em></header></div>
          </div>
          <div className="fs-scene fs-chat">
            <div className="fs-window" data-dots>
              <header><i>{s.name.split(" ").map(x=>x[0]).join("")}</i><div><b>{s.name}</b><small>{tr("Ditangani Dimas")}</small></div><em>{tr("Tertarik")}</em></header>
              <div className="fs-msgs">
                <p className="me" data-dots>{fill("Halo kak, boleh saya kirim contoh {offer}?")}</p>
                <p data-dots>{tr("Boleh, kak. Kirim ke sini saja ya.")}</p>
                <p className="me" data-dots>{fill("Siap, saya siapkan untuk {name}.")}</p>
              </div>
            </div>
          </div>
          <canvas ref={canvas}/>
        </div>
      </div>
      <div className="workflow-copy">
        <h2>{tr("Dari riset ke tindak lanjut.")}</h2>
        <ol className="workflow-steps">
          {steps.map((x,i)=><li key={x.title}>
            <button type="button" aria-current={i===active?"step":undefined} onClick={()=>go(i)}><span>{tr(x.title)}</span><small>{tr(x.text)}</small></button>
          </li>)}
        </ol>
        <a className="button button-amber fs-cta" href={loginPath}>{tr("Coba gratis")} <span aria-hidden="true">&#8594;</span></a>
      </div>
    </div>
  </section>;
}
