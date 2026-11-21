"use client";
import { LazyMotion, domAnimation, m, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

export function Reveal({children,className}:{children:ReactNode;className?:string}) {
  const reduced = useReducedMotion();
  return <LazyMotion features={domAnimation}><m.div className={className} initial={false}
    whileInView={reduced ? undefined : {y:[10,0]}}
    viewport={{once:true,amount:0.2}} transition={{duration:0.55,ease:"easeOut"}}>{children}</m.div></LazyMotion>;
}

export function LoopFilm({name,priority=false}:{name:string;priority?:boolean}) {
  const [playing,setPlaying]=useState(false);
  const [paused,setPaused]=useState(false);
  const manuallyPaused=useRef(false);
  const video = useRef<HTMLVideoElement>(null);
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node=video.current, container=host.current;
    if(!node || !container || typeof IntersectionObserver==="undefined") return;
    const preference=window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer: ReturnType<typeof setTimeout>;
    const observer=new IntersectionObserver(([entry])=>{
      clearTimeout(timer);
      if(!entry.isIntersecting || preference.matches || (priority && window.matchMedia("(max-width: 720px)").matches) || (navigator as Navigator & {connection?:{saveData?:boolean}}).connection?.saveData) {node.pause(); return;}
      timer=setTimeout(()=>{
      if(!node.hasChildNodes()) {
        for(const format of ["webm","mp4"]) {
          const source=document.createElement("source");
          source.src="/media/"+name+"."+format;
          source.type="video/"+format;
          node.append(source);
        }
        node.load();
      }
      if(!manuallyPaused.current) void node.play().catch(()=>{});
      },priority ? 1400 : 250);
    },{threshold:0.2});
    observer.observe(container);
    const pause=()=>{if(preference.matches) { clearTimeout(timer);node.pause(); }};
    preference.addEventListener("change",pause);
    return ()=>{clearTimeout(timer);observer.disconnect();preference.removeEventListener("change",pause);};
  },[name,priority]);
  function toggle() {
    const node=video.current;
    if(!node) return;
    manuallyPaused.current=!manuallyPaused.current;
    setPaused(manuallyPaused.current);
    if(manuallyPaused.current) node.pause();
    else void node.play().catch(()=>{});
  }
  return <div className={"film"+(priority ? " film-hero" : "")} ref={host}>
    <video aria-hidden="true" ref={video} muted loop playsInline preload="none"
      onPlaying={()=>setPlaying(true)} className={playing ? "is-playing" : undefined}/>
    {playing && <button className="film-toggle" type="button" onClick={toggle}>
      {paused ? "Putar video" : "Jeda video"}
    </button>}
  </div>;
}
