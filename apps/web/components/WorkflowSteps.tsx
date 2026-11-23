"use client";
import {useEffect,useRef,useState} from "react";

const steps=[
  {title:"Riset pasar",text:"Temukan pemain di wilayah yang Anda incar.",image:"/media/flow-riset.webp",label:"Kedai kopi · Jakarta Selatan",value:"99 bisnis"},
  {title:"Susun prospek",text:"Pilih yang paling layak untuk dihubungi.",image:"/media/flow-prospek-v2.webp",label:"Prospek siap dihubungi",value:"24 prospek"},
  {title:"Layani pelanggan",text:"Balas dan tindak lanjuti dari satu inbox.",image:"/media/flow-layani.webp",label:"Percakapan selesai hari ini",value:"38 chat"},
];

// The section pins to the viewport and scrolling advances the step; after the last
// step the page continues. On narrow screens (stacked layout) it falls back to tap.
export default function WorkflowSteps(){
  const [active,setActive]=useState(0);
  const pin=useRef<HTMLElement>(null);
  const stage=useRef<HTMLDivElement>(null);
  const pinned=()=>!!stage.current&&getComputedStyle(stage.current).position==="sticky";
  useEffect(()=>{
    const outer=pin.current,inner=stage.current;
    if(!outer||!inner)return;
    let raf=0;
    const update=()=>{
      raf=0;
      if(getComputedStyle(inner).position!=="sticky")return;
      const top=Number.parseFloat(getComputedStyle(inner).top)||0;
      const travel=Math.max(1,outer.offsetHeight-inner.offsetHeight);
      const p=Math.min(1,Math.max(0,(top-outer.getBoundingClientRect().top)/travel));
      inner.style.setProperty("--flow-progress",String(p));
      setActive(Math.min(steps.length-1,Math.floor(p*steps.length)));
    };
    const queue=()=>{if(!raf)raf=requestAnimationFrame(update);};
    update();
    addEventListener("scroll",queue,{passive:true});addEventListener("resize",queue);
    return ()=>{cancelAnimationFrame(raf);removeEventListener("scroll",queue);removeEventListener("resize",queue);};
  },[]);
  // Clicking a step scrolls to that step's slice when pinned.
  const go=(i:number)=>{
    const outer=pin.current,inner=stage.current;
    if(!outer||!inner||!pinned()){setActive(i);return;}
    const top=Number.parseFloat(getComputedStyle(inner).top)||0;
    const travel=outer.offsetHeight-inner.offsetHeight;
    scrollTo({top:outer.getBoundingClientRect().top+scrollY-top+travel*((i+.5)/steps.length),behavior:"smooth"});
  };
  const step=steps[active];
  return <section id="alur" ref={pin} className="flow-pin">
    <div ref={stage} className="flow-split flow-sticky">
      <div className="workflow-media">
        {steps.map((s,i)=>
          // eslint-disable-next-line @next/next/no-img-element -- static local art, swapped per step
          <img key={s.image} src={s.image} alt="" aria-hidden="true" loading="lazy" data-on={i===active||undefined}/>)}
        <div className="workflow-card" aria-live="polite"><small>{step.label}</small><strong key={step.value}>{step.value}</strong></div>
      </div>
      <div className="workflow-copy">
        <h2>Dari riset ke tindak lanjut.</h2>
        <ol className="workflow-steps">
          {steps.map((s,i)=><li key={s.title}>
            <button type="button" aria-current={i===active?"step":undefined} onClick={()=>go(i)}>
              <span>{s.title}</span><small>{s.text}</small>
            </button>
          </li>)}
        </ol>
      </div>
    </div>
  </section>;
}
