"use client";
import {useId,useRef,useState} from "react";
import type {KeyboardEvent, ReactNode} from "react";

export default function Tabs({label,items}:{label:string;items:{title:string;body:ReactNode}[]}) {
  const [active,setActive]=useState(0);
  const prefix=useId();
  const buttons=useRef<(HTMLButtonElement|null)[]>([]);
  function change(e:KeyboardEvent,index:number) {
    const next=e.key==="ArrowRight"?(index+1)%items.length:e.key==="ArrowLeft"?(index+items.length-1)%items.length:e.key==="Home"?0:e.key==="End"?items.length-1:null;
    if(next===null)return;
    e.preventDefault();setActive(next);buttons.current[next]?.focus();
  }
  return <div className="interactive-tabs">
    <div className="tablist" role="tablist" aria-label={label}>
      {items.map((item,index)=><button type="button" key={item.title} role="tab" id={prefix+"-tab-"+index}
        aria-controls={prefix+"-panel-"+index} aria-selected={active===index} tabIndex={active===index?0:-1}
        ref={node=>{buttons.current[index]=node;}} onClick={()=>setActive(index)} onKeyDown={e=>change(e,index)}>{item.title}</button>)}
    </div>
    {items.map((item,index)=><div className="tab-panel" key={item.title} id={prefix+"-panel-"+index}
      role="tabpanel" aria-labelledby={prefix+"-tab-"+index} hidden={active!==index} tabIndex={0}>{item.body}</div>)}
  </div>;
}
