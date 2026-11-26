"use client";
import {createContext,useContext,type ReactNode} from "react";
import {localPath,translate,type Lang} from "./core";

const Context=createContext<Lang>("en");
export function LangProvider({lang,children}:{lang:Lang;children:ReactNode}){
  return <Context.Provider value={lang}>{children}</Context.Provider>;
}
export function useI18n(){
  const lang=useContext(Context);
  return {lang,t:(text:string)=>translate(lang,text),href:(path:string)=>localPath(lang,path)};
}
