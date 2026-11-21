import type {ReactNode} from "react";

export function Button({href,children,variant="dark"}:{href:string;children:ReactNode;variant?:"dark"|"amber"|"outline"}) {
  const style="button button-"+variant;
  return <a className={style} href={href}>{children}</a>;
}
export function Brand() {
  return <a href="/" className="wordmark" aria-label="RAQIO, beranda"><img src="/mark.webp" alt="" width={33} height={33}/><span>raqio</span></a>;
}
export function Navbar({children}:{children:ReactNode}) {
  return <header className="header"><a className="skip" href="#konten">Lewati ke konten</a><div className="nav shell"><Brand/>{children}</div></header>;
}
export function Footer({children}:{children:ReactNode}) {
  return <footer className="footer"><div className="shell footer-grid"><div><Brand/><p>Riset pasar dan percakapan pelanggan.</p></div>{children}</div><div className="shell footer-bottom"><span>RAQIO</span><span>Indonesia</span></div></footer>;
}
export function MockCard({children,className=""}:{children:ReactNode;className?:string}) {
  return <div className={"demo "+className}>{children}</div>;
}
export function ChatBubble({children,reply=false}:{children:ReactNode;reply?:boolean}) {
  return <p className={"bubble"+(reply?" bubble-reply":"")}>{children}</p>;
}
