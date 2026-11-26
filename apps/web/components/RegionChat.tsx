"use client";
import {useEffect,useState} from "react";
import {useI18n} from "../i18n/client";

// Chat overlay for the region photo: messages appear one by one, RAQIO replies after a typing indicator. Loops.
const thread:[boolean,string][]=[
  [false,"Saya mau buka cabang kedai kopi. Mulai dari mana?"],
  [true,"Mulai dari wilayah yang Anda kenal. Kemang punya 42 kedai kopi."],
  [false,"Kalau dibandingkan dengan Tebet?"],
  [true,"Tebet lebih sepi pesaing: 26 kedai, rating rata-rata 4,5."],
  [false,"Simpan yang paling layak dihubungi ya."],
  [true,"Sudah. 12 prospek prioritas siap ditindaklanjuti."],
];

export default function RegionChat(){
  const {t:tr}=useI18n();
  const [shown,setShown]=useState(0);
  const [typing,setTyping]=useState(false);
  useEffect(()=>{
    if(matchMedia("(prefers-reduced-motion: reduce)").matches){setShown(thread.length);return;}
    let i=0,t=0;
    const next=()=>{
      if(i>=thread.length){t=window.setTimeout(()=>{i=0;setShown(0);t=window.setTimeout(next,900);},4200);return;}
      if(thread[i][0]){setTyping(true);t=window.setTimeout(()=>{setTyping(false);i++;setShown(i);t=window.setTimeout(next,1500);},1300);}
      else{i++;setShown(i);t=window.setTimeout(next,1100);}
    };
    t=window.setTimeout(next,800);
    return ()=>clearTimeout(t);
  },[]);
  return <div className="region-chat" aria-hidden="true">
    {thread.slice(0,shown).map(([bot,text],i)=><div key={i} className={"rc-row"+(bot?" bot":" me")}>
      {bot?<span className="rc-avatar"/>:null}
      <p>{tr(text)}</p></div>)}
    {typing?<div className="rc-row bot"><span className="rc-avatar"/><p className="rc-typing"><i/><i/><i/></p></div>:null}
  </div>;
}
