import type { Metadata } from "next";
import { Instrument_Sans, Newsreader } from "next/font/google";
import type { CSSProperties } from "react";
import { tokens } from "../../../packages/ui/tokens";
import "./site.css";
import ScrollEffects from "../components/ScrollEffects";

// Editorial serif for headings, clean sans for body/UI.
const serif = Newsreader({subsets:["latin"],variable:"--font-serif",display:"swap",weight:["400","500","600"]});
const sans = Instrument_Sans({subsets:["latin"],variable:"--raqio-font",display:"swap"});
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
  return <html lang="id" className={`${serif.variable} ${sans.variable}`}><body style={styles}>{children}<ScrollEffects/></body></html>;
}
