"use client";
import {useEffect,useRef,useState} from "react";

const logo = "/brand-transparent.svg";

export default function SignatureMark() {
  const host = useRef<HTMLDivElement>(null);
  const [ready,setReady] = useState(false);

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motion.matches) return;
    let stopped = false;
    let dispose = () => {};
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      void import("three").then(THREE => {
        if (stopped || motion.matches) return;
        let renderer;
        try { renderer = new THREE.WebGLRenderer({alpha:true,antialias:true}); }
        catch { return; }
        renderer.setPixelRatio(Math.min(devicePixelRatio,2));
        renderer.setClearColor(0x000000,0);
        renderer.domElement.setAttribute("aria-hidden","true");
        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1.7,1.7,1.7,-1.7,0.1,20);
        camera.position.z=5;
        const mark = new THREE.Group();
        scene.add(mark);
        const geometry = new THREE.PlaneGeometry(2.6,2.6);
        const materials: import("three").MeshBasicMaterial[] = [];
        const resting = () => { mark.rotation.set(0.13,-0.28,-0.025); };
        resting();
        const draw = () => renderer.render(scene,camera);
        const resize = () => {
          const {width,height} = container.getBoundingClientRect();
          if (width<=0 || height<=0) return;
          const aspect=width/height;
          const span=1.7*Math.max(1,1/aspect);
          camera.left=-span*aspect;
          camera.right=span*aspect;
          camera.top=span;
          camera.bottom=-span;
          camera.updateProjectionMatrix();
          renderer.setSize(width,height);
          draw();
        };
        const texture = new THREE.TextureLoader().load(logo, loaded => {
          if (stopped) { loaded.dispose(); return; }
          loaded.colorSpace=THREE.SRGBColorSpace;
          for(let layer=0;layer<=7;layer++){
            const material=new THREE.MeshBasicMaterial({
              map:loaded,transparent:true,alphaTest:0.40,
              color:layer===7 ? 0xffffff : layer%2 ? 0x666666 : 0x555555,
            });
            materials.push(material);
            const plane=new THREE.Mesh(geometry,material);
            plane.position.z=(layer-7)*0.039;
            mark.add(plane);
          }
          container.append(renderer.domElement);
          resize();
          setReady(true);
        });
        const resizeObserver=new ResizeObserver(resize);
        resizeObserver.observe(container);
        const onMove=(event:PointerEvent)=>{
          if(motion.matches || event.pointerType!=="mouse") return;
          const bounds=container.getBoundingClientRect();
          mark.rotation.y=-0.28+(event.clientX-bounds.left-bounds.width/2)/bounds.width*0.49;
          mark.rotation.x=0.13-(event.clientY-bounds.top-bounds.height/2)/bounds.height*0.36;
          draw();
        };
        const reset=()=>{resting();draw();};
        const lost=(event:Event)=>{event.preventDefault();setReady(false);};
        container.addEventListener("pointermove",onMove);
        container.addEventListener("pointerleave",reset);
        renderer.domElement.addEventListener("webglcontextlost",lost);
        dispose=()=>{
          resizeObserver.disconnect();
          container.removeEventListener("pointermove",onMove);
          container.removeEventListener("pointerleave",reset);
          renderer.domElement.removeEventListener("webglcontextlost",lost);
          renderer.domElement.remove();
          geometry.dispose();
          materials.forEach(material=>material.dispose());
          texture.dispose();
          renderer.dispose();
        };
      }).catch(()=>{});
    },{rootMargin:"140px"});
    observer.observe(container);
    const preference=()=>{if(motion.matches){stopped=true;dispose();setReady(false);}};
    motion.addEventListener("change",preference);
    return ()=>{
      stopped=true;observer.disconnect();motion.removeEventListener("change",preference);dispose();
    };
  },[]);

  return <div ref={host} className={"signature signature-logo"+(ready?" is-live":"")} aria-hidden="true">
    {/* eslint-disable-next-line @next/next/no-img-element -- the original logo is a local SVG */}
    <img src={logo} alt="" width={512} height={512} loading="lazy"/>
  </div>;
}
