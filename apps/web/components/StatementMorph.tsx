"use client";
import {useEffect,useRef} from "react";

const lines=["Pasar berubah.","Pemain baru bermunculan.","Prospek terlewat.","Pesan menumpuk.","Tim kewalahan."];
const logo="/brand-transparent.svg";
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
const ease=(n:number)=>n*n*(3-2*n);
type Dot={x:number;y:number;amber:boolean};
function sample(ctx:CanvasRenderingContext2D,width:number,height:number,spacing:number):Dot[]{
  const {data}=ctx.getImageData(0,0,width,height);
  const dots:Dot[]=[];
  for(let y=1;y<height;y+=spacing)for(let x=1;x<width;x+=spacing){
    const i=(y*width+x)*4;
    if(data[i+3]>105)dots.push({x,y,amber:data[i]>120 && data[i+2]<data[i+1]*0.72});
  }
  return dots;
}

export default function StatementMorph(){
  const section=useRef<HTMLElement>(null);
  const stage=useRef<HTMLDivElement>(null);
  const canvas=useRef<HTMLCanvasElement>(null);
  const list=useRef<HTMLUListElement>(null);
  const mark=useRef<HTMLImageElement>(null);
  useEffect(()=>{
    const outer=section.current,frame=stage.current,target=canvas.current,words=list.current,image=mark.current;
    if(!outer||!frame||!target||!words||!image)return;
    const ctx=target.getContext("2d");
    const buffer=document.createElement("canvas");
    const src=buffer.getContext("2d",{willReadFrequently:true});
    if(!ctx||!src)return;
    const preference=matchMedia("(prefers-reduced-motion: reduce)");
    let disposed=false,raf=0,width=0,height=0,from:Dot[]=[],to:Dot[]=[],visible=false;
    // Typing: per line, the right edge (px from the span start) after each character.
    let typed:{el:HTMLElement;edges:number[]}[]=[],totalChars=0;
    const clearTyping=()=>{for(const {el} of typed){el.style.removeProperty("clip-path");el.parentElement?.style.removeProperty("--caret-x");el.parentElement?.classList.remove("is-typing");}typed=[];totalChars=0;};
    const reset=()=>{
      outer.classList.remove("morph-ready");
      frame.style.removeProperty("--statement-entry");frame.style.removeProperty("--statement-opacity");frame.style.removeProperty("--particle-opacity");frame.style.removeProperty("--mark-opacity");
      from=[];to=[];clearTyping();
    };
    const draw=()=>{
      raf=0;
      if(!visible||!from.length||!to.length)return;
      const y=outer.getBoundingClientRect().top;
      const top=Number.parseFloat(getComputedStyle(frame).top)||0;
      const entrance=innerHeight*.78;
      frame.style.setProperty("--statement-entry",String(clamp((entrance-y)/Math.max(1,entrance-top))));
      const pinDistance=outer.offsetHeight-frame.offsetHeight;
      // Keep the completed mark pinned for the final portion of the scroll.
      const morphDistance=pinDistance*.74;
      const p=clamp((top-y)/Math.max(1,morphDistance));
      // Phases: 0-.34 type the lines, .34-.44 hold so it can be read, then dissolve -> gather -> logo.
      const typing=clamp(p/.34);
      let budget=Math.floor(typing*totalChars+.0001);
      for(const {el,edges} of typed){
        const n=Math.max(0,Math.min(edges.length,budget));budget-=edges.length;
        const w=n?edges[n-1]:0,full=el.offsetWidth;
        el.style.clipPath=n>=edges.length?"none":`inset(-20% ${Math.max(0,full-w)}px -20% 0)`;
        const li=el.parentElement;
        li?.style.setProperty("--caret-x",(el.offsetLeft+w)+"px");
        li?.classList.toggle("is-typing",n<edges.length&&(n>0||budget+edges.length===0));
      }
      const gather=ease(clamp((p-.5)/.34));
      frame.style.setProperty("--statement-opacity",String(1-ease(clamp((p-.44)/.12))));
      frame.style.setProperty("--particle-opacity",String(ease(clamp((p-.44)/.1))*(1-ease(clamp((p-.86)/.1)))));
      frame.style.setProperty("--mark-opacity",String(ease(clamp((p-.82)/.14))));
      if(p<.44||p>.96)return;
      ctx.clearRect(0,0,width,height);
      const scatter=Math.sin(gather*Math.PI);
      const step=width<600?1.55:1.85;
      for(let pass=0;pass<2;pass++){
        ctx.fillStyle=pass?"#ffb020":"#eeeae1";
        ctx.beginPath();
        for(let i=0;i<from.length;i++){
          const a=from[i],b=to[Math.floor(i*to.length/from.length)];
          if(Number(b.amber)!==pass)continue;
          const phase=i*2.39996;
          const x=a.x+(b.x-a.x)*gather+Math.sin(phase)*scatter*width*.045;
          const yy=a.y+(b.y-a.y)*gather+Math.cos(phase)*scatter*height*.06;
          ctx.rect(x,yy,step,step);
        }
        ctx.fill();
      }
    };
    const queue=()=>{if(!raf)raf=requestAnimationFrame(draw);};
    const measure=()=>{
      if(disposed||preference.matches||!visible||!image.naturalWidth)return;
      reset();
      const header=document.querySelector(".header")?.getBoundingClientRect().height??72;
      outer.classList.add("morph-ready");
      const bounds=frame.getBoundingClientRect();
      if(bounds.height>innerHeight-header+2){reset();return;}
      width=Math.floor(bounds.width);height=Math.floor(bounds.height);
      if(width<1||height<1){reset();return;}
      buffer.width=width;buffer.height=height;
      const ratio=Math.min(devicePixelRatio,2);
      target.width=Math.round(width*ratio);target.height=Math.round(height*ratio);
      ctx.setTransform(ratio,0,0,ratio,0,0);
      src.font="16px sans-serif";src.textBaseline="middle";src.fillStyle="#fff";
      for(const span of words.querySelectorAll<HTMLElement>("li > span")){
        const line=span;
        const text=span.firstChild;
        if(!text||text.nodeType!==Node.TEXT_NODE)continue;
        const style=getComputedStyle(line);
        src.font=`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        for(const token of (text.textContent??"").matchAll(/\S+/g)){
          const range=document.createRange();
          range.setStart(text,token.index);range.setEnd(text,token.index+token[0].length);
          const r=range.getBoundingClientRect();
          src.fillText(token[0],r.left-bounds.left,r.top-bounds.top+r.height/2,r.width);
        }
      }
      for(const span of words.querySelectorAll<HTMLElement>("li > span")){
        const text=span.firstChild;if(!text||text.nodeType!==Node.TEXT_NODE)continue;
        const left=span.getBoundingClientRect().left,len=(text.textContent??"").length,edges:number[]=[];
        for(let i=0;i<len;i++){const range=document.createRange();range.setStart(text,i);range.setEnd(text,i+1);edges.push(range.getBoundingClientRect().right-left);}
        typed.push({el:span,edges});totalChars+=len;
      }
      const spacing=width>1150?5:width>700?4:3;
      from=sample(src,width,height,spacing);
      src.clearRect(0,0,width,height);
      const r=image.getBoundingClientRect();
      try{
        src.drawImage(image,r.left-bounds.left,r.top-bounds.top,r.width,r.height);
        to=sample(src,width,height,Math.max(2,spacing-1));
      }catch{reset();return;}
      const sweep=(dot:Dot)=>dot.x+dot.y*.72;
      from.sort((a,b)=>sweep(a)-sweep(b));to.sort((a,b)=>sweep(a)-sweep(b));
      if(!from.length||!to.length){reset();return;}
      queue();
    };
    const observer=new IntersectionObserver(([entry])=>{
      visible=entry.isIntersecting;
      if(visible){if(!from.length)measure();queue();}
    },{rootMargin:"120px"});
    observer.observe(outer);
    const onPreference=()=>{if(preference.matches)reset();else measure();};
    window.addEventListener("scroll",queue,{passive:true});window.addEventListener("resize",measure);
    preference.addEventListener("change",onPreference);image.addEventListener("load",measure);
    void document.fonts.ready.then(()=>{if(!disposed)measure();});
    return ()=>{disposed=true;observer.disconnect();cancelAnimationFrame(raf);window.removeEventListener("scroll",queue);
      window.removeEventListener("resize",measure);preference.removeEventListener("change",onPreference);image.removeEventListener("load",measure);reset();};
  },[]);
  return <section ref={section} className="statement statement-morph">
    <div ref={stage} className="statement-stage">
      <div className="shell section statement-inner"><h2>Bisnis <mark>tumbuh</mark>, tapi datanya masih terpisah.</h2>
        <ul ref={list}>{lines.map(line=><li key={line}><span>{line}</span></li>)}</ul>
      </div>
      <canvas ref={canvas} className="statement-particles" aria-hidden="true"/>
      {/* eslint-disable-next-line @next/next/no-img-element -- the morph samples the local original SVG */}
      <img ref={mark} className="statement-logo" src={logo} alt="RAQIO" width={512} height={512} loading="lazy"/>
    </div>
  </section>;
}
