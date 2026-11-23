"use client";
import {useEffect} from "react";
export default function HeaderBehavior() {
  useEffect(()=>{
    const root=document.documentElement;
    const hero=document.querySelector(".hero");
    if(!hero)return;
    root.classList.add("has-hero");
    const update=()=>{
      root.classList.toggle("has-scrolled",window.scrollY>0);
      root.classList.toggle("past-hero",hero.getBoundingClientRect().bottom<=75);
    };
    update();window.addEventListener("scroll",update,{passive:true});window.addEventListener("resize",update);
    return ()=>{window.removeEventListener("scroll",update);window.removeEventListener("resize",update);root.classList.remove("has-hero","has-scrolled","past-hero");};
  },[]);
  return null;
}
