"use client";
import { LazyMotion, domAnimation, m, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

export function Reveal({children,className}:{children:ReactNode;className?:string}) {
  const reduced = useReducedMotion();
  return <LazyMotion features={domAnimation}><m.div className={className} initial={false}
    whileInView={reduced ? undefined : {y:[24,0],opacity:[0.72,1]}}
    viewport={{once:true,amount:0.2}} transition={{duration:0.72,ease:[0.22,1,0.36,1]}}>{children}</m.div></LazyMotion>;
}
