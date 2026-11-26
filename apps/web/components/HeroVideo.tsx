"use client";
import {useEffect,useRef,useState} from "react";
import {useI18n} from "../i18n/client";

type Connection = {saveData?:boolean;effectiveType?:string};

function playHero(video:HTMLVideoElement,src:string,lightSrc?:string,mobileSrc?:string) {
  if(!video.hasAttribute("src")) {
    const mobile=window.matchMedia("(max-width: 720px)").matches;
    const connection=(navigator as Navigator & {connection?:Connection}).connection;
    // downlink is unreliable (about 1 Mbps on localhost), so only trust explicit slow signals.
    const light=connection?.saveData || (connection?.effectiveType ?? "4g")!=="4g";
    video.src=mobile && mobileSrc ? mobileSrc : light && lightSrc ? lightSrc : src;
  }
  void video.play().catch(()=>{});
}

export default function HeroVideo({src,lightSrc,mobileSrc,poster}:{src:string;lightSrc?:string;mobileSrc?:string;poster?:string}) {
  const {t}=useI18n();
  const ref=useRef<HTMLVideoElement>(null);
  const [paused,setPaused]=useState(true);

  useEffect(()=>{
    const video=ref.current;
    if(!video) return;
    const motion=window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection=(navigator as Navigator & {connection?:Connection}).connection;
    const autoplay=()=>{
      const slow=connection?.effectiveType;
      if(motion.matches || connection?.saveData || slow==="slow-2g" || slow==="2g" || slow==="3g") return;
      if(!video.hasAttribute("src")) playHero(video,src,lightSrc,mobileSrc);
    };
    const respect=()=>{if(motion.matches) video.pause();};
    if(document.readyState==="complete") autoplay();
    else window.addEventListener("load",autoplay,{once:true});
    motion.addEventListener("change",respect);
    return ()=>{
      window.removeEventListener("load",autoplay);
      motion.removeEventListener("change",respect);
    };
  },[src,lightSrc,mobileSrc]);

  return <>
    <div className="hero-art hero-film-stage">
      <div className="hero-video">
        <video ref={ref} poster={poster} loop muted playsInline preload="none" aria-hidden="true"
          onPlay={()=>setPaused(false)} onPause={()=>setPaused(true)}/>
      </div>
    </div>
    <button className="film-toggle" type="button" onClick={()=>{
      const video=ref.current;
      if(video?.paused) playHero(video,src,lightSrc,mobileSrc);
      else video?.pause();
    }}>
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d={paused ? "M8 5v14l11-7z" : "M7 5h4v14H7zm6 0h4v14h-4z"}/>
      </svg>
      {t(paused?"Putar video":"Jeda video")}
    </button>
  </>;
}
