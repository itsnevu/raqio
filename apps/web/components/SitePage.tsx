import type {ReactNode} from "react";
import {Footer,Header} from "./Marketing";
export default function SitePage({title,intro,children}:{title:string;intro:string;children:ReactNode}) {
  return <><Header/><main id="konten"><section className="simple-hero"><div className="shell"><h1>{title}</h1><p>{intro}</p></div></section>{children}</main><Footer/></>;
}
