import type { Metadata } from "next";
import { Albert_Sans, Instrument_Serif } from "next/font/google";
import type { CSSProperties } from "react";
import { tokens } from "../tokens";
import "./site.css";

const display = Instrument_Serif({subsets:["latin"],weight:"400",style:["normal","italic"],variable:"--display-face",display:"swap"});
const body = Albert_Sans({subsets:["latin"],variable:"--body-face",display:"swap"});
export const metadata: Metadata = {
  title: {default:"RAQIO | Data pasar dan percakapan pelanggan",template:"%s | RAQIO"},
  description:"Kenali pasar lokal dengan Competitor Scraping dan kelola percakapan pelanggan dengan WA-Suite.",
  icons:{icon:"/favicon.png"},
};

export default function Layout({children}:{children:React.ReactNode}) {
  const color = Object.fromEntries(Object.entries(tokens.color).map(([name,value])=>["--"+name,value]));
  const styles = {...color,"--headline":tokens.fontSize.headline,"--section-size":tokens.fontSize.section,
    "--body-size":tokens.fontSize.body,"--gutter":tokens.spacing.gutter,"--section-space":tokens.spacing.section,
    "--card-radius":tokens.radius.card,"--pill":tokens.radius.control,"--card-shadow":tokens.shadow.card,
    "--display-fallback":tokens.fontFamily.display,"--body-fallback":tokens.fontFamily.body} as CSSProperties;
  return <html lang="id" className={display.variable+" "+body.variable}><body style={styles}>{children}</body></html>;
}
