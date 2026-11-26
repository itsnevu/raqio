"use client";

import {useEffect,useRef,type ReactNode} from "react";
import DeviceChassis from "./DeviceChassis";
import "./product-devices.css";

function Canvas({mobile=false,children}:{mobile?:boolean;children:ReactNode}){
  const screen=useRef<HTMLDivElement>(null);
  // Small virtual viewports keep the UI text legible at the size the devices are drawn.
  const width=mobile?330:880;

  useEffect(()=>{
    const element=screen.current!;
    const scale=()=>{
      const factor=element.clientWidth/width;
      if(!factor)return;
      element.style.setProperty("--mock-scale",String(factor));
      element.style.setProperty("--mock-height",element.clientHeight/factor+"px");
    };
    scale();
    const observer=new ResizeObserver(scale);
    observer.observe(element);
    return ()=>observer.disconnect();
  },[width]);

  return <div ref={screen} className="product-device-screen">
    <div className="product-device-canvas" style={{width,height:`var(--mock-height, ${mobile?714:570}px)`}}>{children}</div>
  </div>;
}

export default function ProductDevices({desktop,mobile}:{desktop:ReactNode;mobile:ReactNode}){
  return <div className="wa-hero-devices product-devices" aria-hidden="true" inert>
    <div className="wa-laptop"><DeviceChassis/><Canvas>{desktop}</Canvas><div className="wa-base"/></div>
    <div className="wa-phone"><DeviceChassis mobile/><Canvas mobile>{mobile}</Canvas></div>
  </div>;
}
