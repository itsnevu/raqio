import {headers} from "next/headers";
import {localPath,translate,type Lang} from "./core";

export async function getI18n(){
  const h=await headers();
  const lang:Lang=h.get("x-raqio-lang")==="id"?"id":"en";
  return {lang,path:h.get("x-raqio-path")??"/",t:(text:string)=>translate(lang,text),href:(path:string)=>localPath(lang,path)};
}
