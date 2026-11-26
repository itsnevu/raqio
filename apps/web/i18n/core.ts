import {en} from "./en";

export type Lang="en"|"id";
/** Indonesian text is the key; English comes from en.ts. Missing entries fall back to the Indonesian text. */
export const translate=(lang:Lang,text:string)=>lang==="id"?text:en[text]??text;
/** Internal link in the current language. English has no prefix. */
export const localPath=(lang:Lang,path:string)=>{
  if(lang==="en")return path;
  if(path==="/")return "/id";
  return "/id"+(path.startsWith("/#")?path.slice(1):path);
};
