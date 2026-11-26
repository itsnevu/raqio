import type {ReactNode} from "react";

export function Button({href,children,variant="dark"}:{href:string;children:ReactNode;variant?:"dark"|"amber"|"outline"}) {
  const style="button button-"+variant;
  return <a className={style} href={href}>{children}</a>;
}
export function Brand({href="/",label="RAQIO, beranda"}:{href?:string;label?:string}) {
  return <a href={href} className="wordmark" aria-label={label}><img src="/mark.webp" alt="" width={33} height={33}/><span>raqio</span></a>;
}
export function Navbar({children,home,homeLabel,skip="Lewati ke konten"}:{children:ReactNode;home?:string;homeLabel?:string;skip?:string}) {
  return <header className="header"><a className="skip" href="#konten">{skip}</a><div className="nav shell"><Brand href={home} label={homeLabel}/>{children}</div></header>;
}
export function Footer({children,home,homeLabel,tagline="Riset pasar dan percakapan pelanggan."}:{children:ReactNode;home?:string;homeLabel?:string;tagline?:string}) {
  return <footer className="footer"><div className="shell footer-grid"><div><Brand href={home} label={homeLabel}/><p>{tagline}</p></div>{children}</div><div className="shell footer-bottom"><span>© 2026 RAQIO</span><span>Indonesia</span></div></footer>;
}
export function MockCard({children,className=""}:{children:ReactNode;className?:string}) {
  return <div className={"demo "+className}>{children}</div>;
}
export function ChatBubble({children,reply=false}:{children:ReactNode;reply?:boolean}) {
  return <p className={"bubble"+(reply?" bubble-reply":"")}>{children}</p>;
}
