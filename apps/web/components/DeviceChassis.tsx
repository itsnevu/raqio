"use client";

import {useEffect,useRef} from "react";
import type {Mesh,WebGLRenderer} from "three";

const devices={
  laptop:{file:"macbook-pro-16",screen:"sfCQkHOWyrsLmor",yaw:-.26,pitch:.15},
  phone:{file:"iphone-17-pro-max",screen:"screen.001",yaw:.20,pitch:.04},
};

export default function DeviceChassis({mobile=false}:{mobile?:boolean}){
  const surface=useRef<HTMLCanvasElement>(null);

  useEffect(()=>{
    const canvas=surface.current;
    const frame=canvas?.parentElement;
    const screen=frame?.querySelector<HTMLElement>(".product-device-screen");
    if(!canvas||!frame||!screen)return;

    let disposed=false;
    let cleanup:(()=>void)|undefined;
    const fallback=()=>{if(!disposed)frame.dataset.chassis="fallback";};
    const device=mobile?devices.phone:devices.laptop;
    void Promise.all([
      import("three"),
      import("three/addons/loaders/GLTFLoader.js"),
      import("three/addons/libs/meshopt_decoder.module.js"),
    ]).then(async ([THREE,{GLTFLoader},{MeshoptDecoder}])=>{
      if(disposed)return;
      let renderer:WebGLRenderer;
      try{renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true});}
      catch{fallback();return;}

      const scene=new THREE.Scene();
      const camera=new THREE.OrthographicCamera();
      const ambient=new THREE.HemisphereLight(0xffffff,0x858994,2.5);
      const light=new THREE.DirectionalLight(0xffeee0,3);
      light.position.set(-3,5,6);
      const fill=new THREE.DirectionalLight(0xd5e4ff,2);
      fill.position.set(4,1,-3);
      scene.add(ambient,light,fill);
      const pose=new THREE.Group();
      scene.add(pose);
      const reset=()=>{
        delete frame.dataset.chassis;
        delete frame.dataset.opening;
        screen.style.removeProperty("transform");
        screen.style.removeProperty("--display-ratio");
      };
      const contextLost=(event:Event)=>{
        event.preventDefault();
        reset();
        fallback();
      };
      canvas.addEventListener("webglcontextlost",contextLost);
      cleanup=()=>{
        canvas.removeEventListener("webglcontextlost",contextLost);
        reset();
        renderer.dispose();
      };

      const {scene:model}=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync("/media/"+device.file+".glb");
      function disposeModel(){
        model.traverse(object=>{
          const mesh=object as Mesh;
          if(!mesh.isMesh)return;
          mesh.geometry.dispose();
          for(const material of [mesh.material].flat()){
            for(const value of Object.values(material))if(value instanceof THREE.Texture)value.dispose();
            material.dispose();
          }
        });
      }
      if(disposed){disposeModel();return;}
      const disposeRenderer=cleanup;
      cleanup=()=>{disposeModel();disposeRenderer();};
      if(mobile)model.rotation.y=Math.PI/2;
      model.updateMatrixWorld(true);
      let display:Mesh|undefined;
      model.traverse(object=>{
        const mesh=object as Mesh;
        if(!mesh.isMesh)return;
        for(const material of [mesh.material].flat()){
          if(material.name===device.screen)display=mesh;
          if(!mobile||!(material instanceof THREE.MeshStandardMaterial))continue;
          if(["basecolor.001","metalframe.002","backpanel.001"].includes(material.name)){
            material.color.setHex(0x363b40);
            material.map?.dispose();
            material.map=null;
          }
          if(material.name===device.screen){
            material.color.setHex(0x08090a);
            material.emissive.setHex(0x08090a);
            material.map?.dispose();
            material.emissiveMap?.dispose();
            material.map=null;
            material.emissiveMap=null;
          }
        }
      });
      if(!display)throw new Error("Device display mesh is missing");
      const bounds=new THREE.Box3().setFromObject(display,true);
      const center=bounds.getCenter(new THREE.Vector3());
      const points=display.geometry.getAttribute("position");
      let covariance=0,variance=0;
      const point=new THREE.Vector3();
      for(let i=0;i<points.count;i++){
        point.fromBufferAttribute(points,i).applyMatrix4(display.matrixWorld);
        covariance+=(point.y-center.y)*(point.z-center.z);
        variance+=(point.y-center.y)**2;
      }
      if(!variance)throw new Error("Device display has no height");
      const pitch=covariance/variance;
      const width=bounds.max.x-bounds.min.x;
      const height=(bounds.max.y-bounds.min.y)*Math.hypot(1,pitch);
      const corner=(x:number,y:number)=>new THREE.Vector3(x,y,center.z+(y-center.y)*pitch);
      const insetX=width*(mobile ? .019 : .006);
      const insetY=(bounds.max.y-bounds.min.y)*(mobile ? .014 : .006);
      const corners=[
        corner(bounds.min.x+insetX,bounds.max.y-insetY),
        corner(bounds.max.x-insetX,bounds.max.y-insetY),
        corner(bounds.min.x+insetX,bounds.min.y+insetY),
      ];
      const lid=new THREE.Group();
      if(!mobile){
        const modelBounds=new THREE.Box3().setFromObject(model,true);
        const modelSize=modelBounds.getSize(new THREE.Vector3());
        const modelCenter=modelBounds.getCenter(new THREE.Vector3());
        const unit=Math.max(modelSize.x,modelSize.y,modelSize.z);
        const pivot=modelCenter.clone().add(new THREE.Vector3(0,-.2946,-.2358).multiplyScalar(unit));
        lid.position.copy(pivot);
        model.add(lid);
        model.updateMatrixWorld(true);
        const upper:Mesh[]=[];
        model.traverse(object=>{
          const mesh=object as Mesh;
          if(!mesh.isMesh)return;
          const meshCenter=new THREE.Box3().setFromObject(mesh,true).getCenter(new THREE.Vector3());
          if(mesh===display||meshCenter.y>modelCenter.y-unit*.20)upper.push(mesh);
        });
        for(const mesh of upper)lid.attach(mesh);
        for(const corner of corners)corner.sub(pivot);
      }
      pose.add(model);
      pose.rotation.set(device.pitch,device.yaw,0);
      pose.updateMatrixWorld(true);
      const body=new THREE.Box3().setFromObject(pose,true);
      const size=body.getSize(new THREE.Vector3());
      const focus=body.getCenter(new THREE.Vector3());
      camera.position.copy(focus).add(new THREE.Vector3(0,0,size.length()*2));
      camera.near=.001;
      camera.far=size.length()*5;
      camera.lookAt(focus);
      camera.updateMatrixWorld();

      renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.65));
      const displayRatio=String(width/height);
      let renderWidth=0,renderHeight=0;
      function render(){
        screen!.style.setProperty("--display-ratio",displayRatio);
        const width=canvas!.clientWidth,height=canvas!.clientHeight;
        const panelWidth=screen!.offsetWidth,panelHeight=screen!.offsetHeight;
        if(!width||!height||!panelWidth||!panelHeight)return;
        const units=Math.max(size.x/width,size.y/height)*1.10;
        camera.left=-width*units/2;
        camera.right=width*units/2;
        camera.top=height*units/2;
        camera.bottom=-height*units/2;
        camera.updateProjectionMatrix();

        if(width!==renderWidth||height!==renderHeight){
          renderer.setSize(width,height,false);
          renderWidth=width;
          renderHeight=height;
        }
        renderer.render(scene,camera);
        const offsetX=canvas!.offsetLeft-screen!.offsetLeft;
        const offsetY=canvas!.offsetTop-screen!.offsetTop;
        const [tl,tr,bl]=corners.map(c=>{
          const v=c.clone().applyMatrix4(mobile?pose.matrixWorld:lid.matrixWorld).project(camera);
          return {x:(v.x+1)*width/2+offsetX,y:(1-v.y)*height/2+offsetY};
        });
        const edgeX=screen!.clientLeft,edgeY=screen!.clientTop;
        const a=(tr.x-tl.x)/screen!.clientWidth,b=(tr.y-tl.y)/screen!.clientWidth;
        const c=(bl.x-tl.x)/screen!.clientHeight,d=(bl.y-tl.y)/screen!.clientHeight;
        screen!.style.transform=`matrix(${a},${b},${c},${d},${tl.x-a*edgeX-c*edgeY},${tl.y-b*edgeX-d*edgeY})`;
        frame!.dataset.chassis="ready";
      }

      const motion=matchMedia("(prefers-reduced-motion: reduce)");
      let animation=0;
      const finish=()=>{
        cancelAnimationFrame(animation);
        lid.rotation.x=0;
        delete frame.dataset.opening;
        render();
      };
      const onMotion=()=>{if(motion.matches)finish();};
      motion.addEventListener("change",onMotion);
      const entry=new IntersectionObserver(entries=>{
        if(!entries.some(item=>item.isIntersecting))return;
        entry.disconnect();
        if(motion.matches||mobile)return;
        const start=performance.now();
        frame.dataset.opening="true";
        const open=(now:number)=>{
          const progress=Math.min(1,(now-start)/1150);
          lid.rotation.x=1.45*(1-progress)**3;
          render();
          if(progress<1)animation=requestAnimationFrame(open);
          else delete frame.dataset.opening;
        };
        animation=requestAnimationFrame(open);
      },{threshold:.15});
      if(!mobile&&!motion.matches)lid.rotation.x=1.45;
      entry.observe(frame);
      const observer=new ResizeObserver(render);
      observer.observe(frame);
      canvas.addEventListener("webglcontextrestored",render);
      cleanup=()=>{
        observer.disconnect();
        entry.disconnect();
        cancelAnimationFrame(animation);
        motion.removeEventListener("change",onMotion);
        canvas.removeEventListener("webglcontextrestored",render);
        disposeModel();
        disposeRenderer();
      };
      render();
    }).catch(()=>{cleanup?.();cleanup=undefined;fallback();});

    return ()=>{disposed=true;cleanup?.();};
  },[mobile]);

  return <canvas ref={surface} className="device-chassis"/>;
}
