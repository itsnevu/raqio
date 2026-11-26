"use client";
import {useEffect,useRef} from "react";
import {useI18n} from "../i18n/client";

const lines=["Pasar berubah.","Pemain baru bermunculan.","Prospek terlewat.","Pesan menumpuk.","Tim kewalahan."];
const logo="/brand-transparent.svg";
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
const ease=(n:number)=>n*n*(3-2*n);
// col/row: cell position in device pixels.
type Dot={x:number;y:number;col:number;row:number;size:number;amber:boolean};
type Particle={a:Dot;b:Dot;first:boolean;delay:number;dx:number;dy:number};
/** Split whatever is drawn in the buffer into grid cells; each dot sits at the ink centre, sized by coverage. */
function sample(ctx:CanvasRenderingContext2D,w:number,h:number,cell:number,scale:number,minCover:number):Dot[]{
  const {data}=ctx.getImageData(0,0,w,h);
  const dots:Dot[]=[];
  for(let y=0;y+cell<=h;y+=cell)for(let x=0;x+cell<=w;x+=cell){
    let alpha=0,r=0,g=0,b=0,cx=0,cy=0;
    for(let yy=y;yy<y+cell;yy++)for(let xx=x;xx<x+cell;xx++){
      const i=(yy*w+xx)*4,v=data[i+3];
      alpha+=v;cx+=(xx+.5)*v;cy+=(yy+.5)*v;r+=data[i]*v;g+=data[i+1]*v;b+=data[i+2]*v;
    }
    const cover=alpha/(cell*cell*255);
    if(cover<minCover)continue;
    dots.push({x:cx/alpha/scale,y:cy/alpha/scale,col:x,row:y,size:cell/scale*Math.sqrt(cover),amber:r/alpha>120&&b<g*.72});
  }
  return dots;
}
// Stable pseudo-random value in 0..1, so scrolling back rebuilds the same text.
const noise=(n:number)=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};

export default function StatementMorph(){
  const {t}=useI18n();
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
    // Crisp text layer; every intact fragment is an exact tile of it.
    const glyphs=document.createElement("canvas");
    const ink=glyphs.getContext("2d");
    if(!ctx||!src||!ink)return;
    const preference=matchMedia("(prefers-reduced-motion: reduce)");
    let disposed=false,raf=0,width=0,height=0,particles:Particle[]=[],visible=false,ratio=1,cell=2;
    // Typing: per line, the right edge (px from the span start) after each character.
    let typed:{el:HTMLElement;edges:number[]}[]=[],totalChars=0;
    const clearTyping=()=>{for(const {el} of typed){el.style.removeProperty("clip-path");el.parentElement?.style.removeProperty("--caret-x");el.parentElement?.classList.remove("is-typing");}typed=[];totalChars=0;};
    const reset=()=>{
      outer.classList.remove("morph-ready","is-burst");
      frame.style.removeProperty("--statement-entry");frame.style.removeProperty("--statement-opacity");frame.style.removeProperty("--particle-opacity");frame.style.removeProperty("--mark-opacity");
      particles=[];clearTyping();
    };
    const draw=()=>{
      raf=0;
      if(!visible||!particles.length)return;
      const y=outer.getBoundingClientRect().top;
      const top=Number.parseFloat(getComputedStyle(frame).top)||0;
      const entrance=innerHeight*.78;
      frame.style.setProperty("--statement-entry",String(clamp((entrance-y)/Math.max(1,entrance-top))));
      const pinDistance=outer.offsetHeight-frame.offsetHeight;
      // Keep the completed mark pinned for the final portion of the scroll.
      const morphDistance=pinDistance*.74;
      const p=clamp((top-y)/Math.max(1,morphDistance));
      // Phases: 0-.34 type the lines, .34-.44 hold so it can be read, then the same dots break apart -> gather -> logo.
      const typing=clamp(p/.34);
      let budget=Math.floor(typing*totalChars+.0001);
      for(const {el,edges} of typed){
        const n=Math.max(0,Math.min(edges.length,budget));budget-=edges.length;
        const w=n?edges[n-1]:0;
        // Until it breaks this is plain HTML text, revealed character by character.
        el.style.clipPath=n>=edges.length?"none":`inset(-20% ${Math.max(0,el.offsetWidth-w)}px -20% 0)`;
        const li=el.parentElement;
        li?.style.setProperty("--caret-x",(el.offsetLeft+w)+"px");
        li?.classList.toggle("is-typing",n<edges.length&&(n>0||budget+edges.length===0));
      }
      const burst=clamp((p-.44)/.44);
      frame.style.setProperty("--statement-opacity",String(1-ease(clamp((p-.44)/.14))));
      // The dots are the text: fully opaque until the real logo covers them.
      frame.style.setProperty("--particle-opacity",String(1-ease(clamp((p-.95)/.05))));
      frame.style.setProperty("--mark-opacity",String(ease(clamp((p-.88)/.08))));
      outer.classList.toggle("is-burst",burst>0);
      ctx.clearRect(0,0,width,height);
      if(burst===0)return;
      // Not yet broken off: copy the glyph tile 1:1 in device pixels.
      ctx.setTransform(1,0,0,1,0,0);
      for(const {a,delay,first} of particles)
        if(first&&burst<=delay)ctx.drawImage(glyphs,a.col,a.row,cell,cell,a.col,a.row,cell,cell);
      ctx.setTransform(ratio,0,0,ratio,0,0);
      for(let pass=0;pass<2;pass++){
        ctx.fillStyle=pass?"#ffb020":"#f4eadf";
        ctx.beginPath();
        for(const {a,b,delay,dx,dy} of particles){
          const t=clamp((burst-delay)/.62);
          if(t===0||Number(b.amber&&t>.45)!==pass)continue;
          const move=ease(clamp((t-.12)/.88)),spread=Math.sin(t*Math.PI)*Math.sin(Math.sqrt(t)*Math.PI/2);
          const size=a.size+(b.size-a.size)*move;
          const x=a.x+(b.x-a.x)*move+dx*spread,yy=a.y+(b.y-a.y)*move+dy*spread;
          ctx.rect(x-size/2,yy-size/2,size,size);
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
      ratio=Math.min(devicePixelRatio,2);
      const w=Math.round(width*ratio),h=Math.round(height*ratio);
      for(const c of [target,buffer,glyphs]){c.width=w;c.height=h;}
      target.style.width=w/ratio+"px";target.style.height=h/ratio+"px";
      for(const c of [ctx,src])c.setTransform(ratio,0,0,ratio,0,0);
      src.textBaseline="alphabetic";src.fillStyle="#f4eadf";
      cell=Math.max(2,Math.round((width>700?2:1.5)*ratio));
      const from:Dot[]=[];
      let to:Dot[]=[];
      for(const span of words.querySelectorAll<HTMLElement>("li > span")){
        const text=span.firstChild;
        if(!text||text.nodeType!==Node.TEXT_NODE)continue;
        const content=text.textContent??"",style=getComputedStyle(span);
        src.clearRect(0,0,width,height);
        src.font=`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        src.letterSpacing=style.letterSpacing==="normal"?"0px":style.letterSpacing;
        // Same baseline and device-pixel snapping as the HTML text, so the hand-over is invisible.
        const ascent=src.measureText(content).fontBoundingBoxAscent;
        const range=document.createRange();
        for(const token of content.matchAll(/\S+/g)){
          range.setStart(text,token.index);range.setEnd(text,token.index+token[0].length);
          const r=range.getBoundingClientRect();
          src.fillText(token[0],r.left-bounds.left,Math.round((r.top-bounds.top+ascent)*ratio)/ratio);
        }
        const left=span.getBoundingClientRect().left,edges:number[]=[];
        for(let i=0;i<content.length;i++){range.setStart(text,i);range.setEnd(text,i+1);edges.push(range.getBoundingClientRect().right-left);}
        ink.drawImage(buffer,0,0);
        // Keep faint antialiased cells too, otherwise the intact letters get ragged edges.
        for(const dot of sample(src,w,h,cell,ratio,.004))from.push(dot);
        typed.push({el:span,edges});totalChars+=content.length;
      }
      src.clearRect(0,0,width,height);
      const r=image.getBoundingClientRect();
      try{
        src.drawImage(image,r.left-bounds.left,r.top-bounds.top,r.width,r.height);
        to=sample(src,w,h,cell,ratio,.12);
      }catch{reset();return;}
      if(!from.length||!to.length){reset();return;}
      const sweep=(dot:Dot)=>dot.x+dot.y*.72;
      from.sort((a,b)=>sweep(a)-sweep(b));to.sort((a,b)=>sweep(a)-sweep(b));
      const count=Math.max(from.length,to.length);
      particles=Array.from({length:count},(_,i)=>{
        const at=Math.floor(i*from.length/count),a=from[at],b=to[Math.floor(i*to.length/count)];
        const first=i===0||at!==Math.floor((i-1)*from.length/count);
        // Mid-flight: a wide cloud with an uneven edge and a few stragglers, no clump and no box.
        const angle=noise(i)*Math.PI*2,u=noise(i*1.618+.5),stray=noise(i+.73);
        const edge=1+.2*Math.sin(angle*3+1.1)+.13*Math.sin(angle*5+2.6)+.08*Math.sin(angle*9);
        const radius=Math.pow(u,.62)*edge*(.8+.3*stray+(stray>.9?.35*noise(i+.11):0));
        // Keep part of the fragment's own origin so neighbouring letters drift apart differently.
        const cx=width*(.5+.44*radius*Math.cos(angle))+(a.x-width/2)*.22,cy=height*(.5+.46*radius*Math.sin(angle))+(a.y-height/2)*.22;
        return {a,b,first,delay:.16*a.x/width+.2*noise(i+.25),dx:cx-(a.x+b.x)/2,dy:cy-(a.y+b.y)/2};
      });
      queue();
    };
    const observer=new IntersectionObserver(([entry])=>{
      visible=entry.isIntersecting;
      if(visible){if(!particles.length)measure();queue();}
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
      <div className="shell section statement-inner"><h2>{t("Bisnis ")}<mark>{t("tumbuh")}</mark>{t(", tapi datanya masih terpisah.")}</h2>
        <ul ref={list}>{lines.map(line=><li key={line}><span>{t(line)}</span></li>)}</ul>
      </div>
      <canvas ref={canvas} className="statement-particles" aria-hidden="true"/>
      {/* eslint-disable-next-line @next/next/no-img-element -- the morph samples the local original SVG */}
      <img ref={mark} className="statement-logo" src={logo} alt="RAQIO" width={512} height={512} loading="lazy"/>
    </div>
  </section>;
}
