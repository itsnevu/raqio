"use client";
import {useEffect,useRef,useState} from "react";

/** Steps through a looping timeline. Each entry is how long (ms) that step lasts.
 *  With reduced motion it jumps straight to the last step and stays there. */
export function useStory(durations:number[]){
  const [step,setStep]=useState(0);
  useEffect(()=>{
    if(matchMedia("(prefers-reduced-motion: reduce)").matches){setStep(durations.length-1);return;}
    let current=0,timer=0,cancelled=false;
    // Only run while on screen, so the loop does not burn CPU off-screen.
    let visible=true;
    const tick=()=>{
      if(cancelled)return;
      timer=window.setTimeout(()=>{
        if(!visible){tick();return;}
        current=(current+1)%durations.length;setStep(current);tick();
      },durations[current]);
    };
    const onVisibility=()=>{visible=document.visibilityState==="visible";};
    document.addEventListener("visibilitychange",onVisibility);
    tick();
    return ()=>{cancelled=true;clearTimeout(timer);document.removeEventListener("visibilitychange",onVisibility);};
  // eslint-disable-next-line react-hooks/exhaustive-deps -- durations is a static literal per caller
  },[]);
  return step;
}

/** Counts from `from` to `to` while `run` is true; snaps back to `from` when it turns false. */
export function CountUp({from=0,to,run,duration=1600}:{from?:number;to:number;run:boolean;duration?:number}){
  const [value,setValue]=useState(run?to:from);
  const raf=useRef(0);
  useEffect(()=>{
    cancelAnimationFrame(raf.current);
    if(!run){setValue(from);return;}
    const start=performance.now();
    const frame=(now:number)=>{
      const t=Math.min(1,(now-start)/duration),eased=1-Math.pow(1-t,3);
      setValue(Math.round(from+(to-from)*eased));
      if(t<1)raf.current=requestAnimationFrame(frame);
    };
    raf.current=requestAnimationFrame(frame);
    return ()=>cancelAnimationFrame(raf.current);
  },[run,from,to,duration]);
  return <>{value.toLocaleString("id-ID")}</>;
}
