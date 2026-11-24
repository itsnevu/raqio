"use client";

import {useEffect,useRef,useState} from "react";

const mapWidth=2145;
const mapHeight=733;
const atlasWidth=2048;
const atlasHeight=1352;
const assemblyDuration=2850;
const islandStagger=145;

const regions=[
  {name:"Sumatra",x:14,y:37,share:"22,22",growth:"4,81",sectors:"Industri pengolahan, pertanian, dan perdagangan termasuk pendorong pertumbuhan ekonomi Sumatra."},
  {name:"Jawa",x:32,y:80,share:"56,93",growth:"5,30",sectors:"Industri pengolahan, perdagangan, serta informasi dan komunikasi turut mendorong pertumbuhan ekonomi Jawa."},
  {name:"Kalimantan",x:43,y:47,share:"8,12",growth:"4,79",sectors:"Industri pengolahan, perdagangan, dan pertanian turut mendorong pertumbuhan ekonomi Kalimantan."},
  {name:"Sulawesi",x:53,y:63,share:"7,22",growth:"6,23",sectors:"Industri pengolahan, pertanian, dan perdagangan turut mendorong pertumbuhan ekonomi Sulawesi."},
  {name:"Bali dan Nusa Tenggara",x:62,y:89,share:"2,82",growth:"4,87",sectors:"Industri pengolahan, akomodasi dan makan minum, serta perdagangan turut mendorong pertumbuhan ekonomi Bali dan Nusa Tenggara."},
  {name:"Maluku dan Papua",x:87,y:61,share:"2,69",growth:"1,44",sectors:"Industri pengolahan, perdagangan, dan pertanian turut mendorong pertumbuhan gabungan Maluku dan Papua."},
];
const regionalSource="https://ekon.go.id/files/ekonomi_terkini/1774507659_Publish%20RED%20Maret%202026_EMF.pdf#page=15";
// Each leader ends on the side of the island with room for its explanation.
const callouts=[
  {endX:0,endY:37,below:false},
  {endX:19,endY:109,below:true},
  {endX:30,endY:-9,below:false},
  {endX:67,endY:9,below:false},
  {endX:82,endY:113,below:true},
  {endX:95,endY:21,below:false},
];

// Map bounds, corresponding atlas origin, and initial offset and tilt.
const islands=[
  [0,21,593,649,2,2,-150,-95,-.25],
  [325,331,608,380,599,2,-95,-145,.20],
  [583,9,532,516,1211,2,-45,135,-.17],
  [902,491,539,242,2,655,48,-135,-.19],
  [1007,18,389,552,545,655,85,100,.27],
  [1596,38,520,695,938,655,155,-32,.23],
  [1291,23,450,661,1462,655,120,88,-.23],
];

export default function IndonesiaMap({children}:{children:React.ReactNode}){
  const frame=useRef<HTMLDivElement>(null);
  const surface=useRef<HTMLCanvasElement>(null);
  const [selected,setSelected]=useState<number|null>(null);
  const visibleRegions=regions.flatMap((region,index)=>{
    if(selected!==null&&selected!==index)return [];
    const {endX,endY,below}=callouts[index];
    return [{region,index,endX,endY,below,panelY:endY+(below?4:-4)}];
  });
  const toggleRegion=(index:number)=>setSelected(current=>current===index?null:index);

  useEffect(()=>{
    const element=frame.current;
    const canvas=surface.current;
    if(!element||!canvas)return;

    const motion=window.matchMedia("(prefers-reduced-motion: reduce)");
    let cancelled=false;
    let entered=false;
    let dispose:(()=>void)|undefined;

    const stop=()=>{
      cancelled=true;
      dispose?.();
      delete element.dataset.assembling;
      delete element.dataset.mapPending;
    };
    const onMotionChange=()=>{if(motion.matches&&entered)stop();};
    element.dataset.mapPending="";
    motion.addEventListener("change",onMotionChange);
    canvas.addEventListener("webglcontextlost",stop);

    const observer=new IntersectionObserver(([entry])=>{
      if(!entry?.isIntersecting||cancelled)return;
      observer.disconnect();
      entered=true;
      if(motion.matches){stop();return;}

      void import("three").then(async THREE=>{
        if(cancelled)return;
        const texture=await new THREE.TextureLoader().loadAsync("/media/raqio-indonesia-islands.webp");
        if(cancelled){texture.dispose();return;}
        let renderer;
        try{
          renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true});
        }catch{
          texture.dispose();
          stop();
          return;
        }
        texture.colorSpace=THREE.SRGBColorSpace;
        texture.generateMipmaps=false;
        texture.minFilter=THREE.LinearFilter;

        const scene=new THREE.Scene();
        const halfWidth=mapWidth*.58;
        const halfHeight=mapHeight*.58;
        const camera=new THREE.OrthographicCamera(-halfWidth,halfWidth,halfHeight,-halfHeight,1,1600);
        camera.position.z=800;
        const pieces=islands.map(([x,y,w,h,u,v,offsetX,offsetY,tilt],index)=>{
          const geometry=new THREE.PlaneGeometry(w,h);
          const uv=geometry.attributes.uv;
          for(let i=0;i<uv.count;i++){
            uv.setXY(i,(u+uv.getX(i)*w)/atlasWidth,1-(v+(1-uv.getY(i))*h)/atlasHeight);
          }
          const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false});
          const mesh=new THREE.Mesh(geometry,material);
          scene.add(mesh);
          return {mesh,x:x+w/2-mapWidth/2,y:mapHeight/2-y-h/2,offsetX,offsetY,tilt,delay:index*islandStagger};
        });

        let animation=0;
        const resize=()=>{
          renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
          renderer.setSize(canvas.clientWidth,canvas.clientHeight,false);
        };
        const sizing=new ResizeObserver(resize);
        const release=()=>{
          cancelAnimationFrame(animation);
          sizing.disconnect();
          for(const {mesh} of pieces){mesh.geometry.dispose();mesh.material.dispose();}
          texture.dispose();
          renderer.dispose();
          dispose=undefined;
        };
        dispose=release;
        resize();
        sizing.observe(element);

        const start=performance.now();
        const draw=(now:number)=>{
          const elapsed=now-start;
          for(const {mesh,x,y,offsetX,offsetY,tilt,delay} of pieces){
            const t=THREE.MathUtils.clamp((elapsed-delay)/assemblyDuration,0,1);
            const remaining=1-THREE.MathUtils.smoothstep(t,0,1);
            const rise=Math.sin(Math.PI*t);
            mesh.position.set(x+offsetX*remaining,y+offsetY*remaining+rise*28,rise*45);
            mesh.rotation.set(tilt*remaining,tilt*1.6*remaining,tilt*remaining);
            mesh.material.opacity=THREE.MathUtils.smoothstep(elapsed-delay,0,650);
          }
          renderer.render(scene,camera);
          if(elapsed<assemblyDuration+(pieces.length-1)*islandStagger){
            animation=requestAnimationFrame(draw);
          }else{
            delete element.dataset.assembling;
            release();
          }
        };
        draw(start);
        element.dataset.assembling="";
        delete element.dataset.mapPending;
      }).catch(stop);
    },{threshold:.25});
    observer.observe(element);

    return ()=>{
      observer.disconnect();
      motion.removeEventListener("change",onMotionChange);
      canvas.removeEventListener("webglcontextlost",stop);
      stop();
    };
  },[]);

  return <>
    <div className="about-map-stage">
    <div className="about-photo" data-map-pending="" ref={frame}>
      <svg width="0" height="0" className="about-map-filter" aria-hidden="true">
        <defs>
          <filter id="about-map-satin" colorInterpolationFilters="sRGB">
            <feColorMatrix in="SourceGraphic" type="saturate" values="0.62"/>
            <feComponentTransfer>
              <feFuncR type="linear" slope="1.42"/>
              <feFuncG type="linear" slope="1.42"/>
              <feFuncB type="linear" slope="1.36"/>
            </feComponentTransfer>
          </filter>
        </defs>
      </svg>
      {/* eslint-disable-next-line @next/next/no-img-element -- static image also serves as the animation fallback */}
      <img src="/media/raqio-indonesia-map.webp" alt="Ilustrasi relief kepulauan Indonesia berwarna grafit dengan aksen amber" width={mapWidth} height={mapHeight} loading="lazy"/>
      <canvas ref={surface} aria-hidden="true"/>
      <div className="about-map-points" data-overview={selected===null} role="group" aria-label="Pilih wilayah untuk melihat data ekonomi">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {visibleRegions.map(({region,endX,endY,panelY})=><path className="about-map-leader-wide" key={region.name} vectorEffect="non-scaling-stroke"
            d={`M ${region.x} ${region.y} V ${endY} H ${endX} V ${panelY}`}/>)}
          {selected!==null&&<path className="about-map-leader-narrow" key={selected} vectorEffect="non-scaling-stroke"
            d={`M ${regions[selected].x} ${regions[selected].y} V 106 H 50 V 114`}/>}
        </svg>
        {regions.map(({name,x,y},index)=><button
          key={name}
          className="about-map-pin"
          type="button"
          aria-label={name}
          aria-pressed={selected===index}
          aria-controls="about-map-example"
          style={{left:`${x}%`,top:`${y}%`}}
          onClick={()=>toggleRegion(index)}
        />)}
        <div id="about-map-example" className="about-map-callouts" aria-live="polite">
          {visibleRegions.map(({region,index,endX,panelY,below})=><div key={region.name}
            className="about-map-example" data-below={below}
            data-align={endX<10?"start":endX>90?"end":"center"}
            style={{left:`${endX}%`,top:`${panelY}%`}}>
            {selected===null
              ? <button type="button" className="about-map-summary" onClick={()=>toggleRegion(index)}>
                {region.name} <strong>{region.share}%</strong>
              </button>
              : <div className="about-map-region">
                <h3>{region.name}</h3>
                <p><strong>{region.share}%</strong> PDB nasional · <strong>{region.growth}%</strong> pertumbuhan</p>
                <p>{region.sectors}</p>
                <a href={regionalSource}>Sumber data 2025 · BPS / Kemenko Perekonomian</a>
              </div>}
          </div>)}
        </div>
      </div>
    </div>
      <p className="about-map-note"><span aria-hidden="true">*</span> Pilih titik di peta untuk melihat kontribusi ekonomi dan sektor yang mendorong pertumbuhan tiap wilayah.</p>
    </div>
    <div className="about-copy">{children}</div>
  </>;
}
