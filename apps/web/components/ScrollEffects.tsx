"use client";
import {useEffect} from "react";
import Lenis from "lenis";

// Elements that fade/slide in as they enter the viewport. Siblings inside the
// same parent get a small stagger so lists feel sequenced rather than popping.
const REVEAL=[
  "main section:not(.statement-morph) h2",
  "main section:not(.statement-morph):not(.hero):not(.wa-hero) p:not(.eyebrow)",
  ".wa-hero-copy > *",
  ".hero-copy > *",
  ".product-tile",
  ".workflow-steps li",
  ".workflow-card",
  ".faq details",
  ".principle-grid article",
  ".feature-grid article",
  ".stepper li",
  ".person-grid article",
  ".audience-card",
  ".about-photo",
  ".contact-card",
  ".contact-next li",
  ".compare-card",
  ".contact-inner form",
  ".footer > *",
].join(",");

// Parallax targets and their speed (fraction of scroll distance; negative = moves against scroll).
const PARALLAX:[string,number][]=[
  [".hero-video",0.28],
  [".hero-copy",-0.12],
  [".region-photo img",0.12],
  [".product-stage .demo",-0.06],
  [".photo-hero-art",0.3],
  [".about-photo img",0.1],
];

export default function ScrollEffects(){
  useEffect(()=>{
    if(matchMedia("(prefers-reduced-motion: reduce)").matches)return;
    const root=document.documentElement;
    root.classList.add("fx");

    const lenis=new Lenis({duration:1.15,easing:t=>1-Math.pow(1-t,4),smoothWheel:true,anchors:{offset:-72}});
    let frame=0;
    const loop=(time:number)=>{lenis.raf(time);frame=requestAnimationFrame(loop);};
    frame=requestAnimationFrame(loop);

    const revealed=new WeakSet<Element>();
    const io=new IntersectionObserver(entries=>{
      for(const entry of entries){
        if(!entry.isIntersecting)continue;
        entry.target.classList.add("rv-in");
        io.unobserve(entry.target);
      }
    },{rootMargin:"0px 0px -8% 0px",threshold:0.12});
    const scan=()=>{
      for(const el of document.querySelectorAll<HTMLElement>(REVEAL)){
        if(revealed.has(el))continue;
        revealed.add(el);
        const index=el.parentElement?[...el.parentElement.children].indexOf(el):0;
        el.style.setProperty("--rv-delay",`${Math.min(index,6)*70}ms`);
        el.classList.add("rv");
        io.observe(el);
      }
    };
    scan();

    const targets=PARALLAX.flatMap(([selector,speed])=>[...document.querySelectorAll<HTMLElement>(selector)].map(el=>({el,speed})));
    const parallax=()=>{
      const vh=innerHeight;
      for(const {el,speed} of targets){
        const box=(el.parentElement??el).getBoundingClientRect();
        if(box.bottom<-200||box.top>vh+200)continue;
        const offset=(box.top+box.height/2-vh/2)*-speed;
        el.style.translate=`0 ${offset.toFixed(1)}px`;
      }
    };
    lenis.on("scroll",parallax);
    parallax();

    return ()=>{
      cancelAnimationFrame(frame);lenis.destroy();io.disconnect();root.classList.remove("fx");
      for(const {el} of targets)el.style.removeProperty("translate");
    };
  },[]);
  return null;
}
