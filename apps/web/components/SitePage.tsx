import type {ReactNode} from "react";
import {Footer,Header} from "./Marketing";

// Sub-page shell: photo hero (from /public/media) with a dark gradient so the title stays readable.
export default function SitePage({title,intro,image,children}:{title:string;intro:string;image?:string;children:ReactNode}) {
  return <><Header/><main id="konten">
    <section className={"simple-hero"+(image?" photo-hero":"")}>
      {image?<div className="photo-hero-art" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element -- decorative local art with parallax */}
        <img src={image} alt=""/>
      </div>:null}
      <div className="shell"><h1>{title}</h1><p>{intro}</p></div>
    </section>
    {children}
  </main><Footer/></>;
}
