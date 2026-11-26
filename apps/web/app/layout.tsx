import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { tokens } from "../../../packages/ui/tokens";
import {getI18n} from "../i18n/server";
import {localPath} from "../i18n/core";
import {LangProvider} from "../i18n/client";
import "./site.css";
import ScrollEffects from "../components/ScrollEffects";

export async function generateMetadata():Promise<Metadata>{
  const {t,lang,path}=await getI18n();
  return {
    title:{default:t("RAQIO | Data pasar dan percakapan pelanggan"),template:"%s | RAQIO"},
    description:t("Kenali pasar lokal dengan Competitor Scraping dan kelola percakapan pelanggan dengan WA-Suite."),
    icons:{icon:"/favicon.png"},
    alternates:{canonical:localPath(lang,path),languages:{en:localPath("en",path),id:localPath("id",path),"x-default":localPath("en",path)}},
  };
}

export default async function Layout({children}:{children:React.ReactNode}) {
  const {lang}=await getI18n();
  const color = Object.fromEntries(Object.entries(tokens.color).map(([name,value])=>["--"+name,value]));
  const styles = {...color,"--headline":tokens.fontSize.headline,"--section-size":tokens.fontSize.section,
    "--body-size":tokens.fontSize.body,"--gutter":tokens.spacing.gutter,"--section-space":tokens.spacing.section,
    "--card-radius":tokens.radius.card,"--pill":tokens.radius.control,"--card-shadow":tokens.shadow.card,
    "--display-fallback":tokens.fontFamily.display,"--body-fallback":tokens.fontFamily.body} as CSSProperties;
  return <html lang={lang}><body style={styles}><LangProvider lang={lang}>{children}</LangProvider><ScrollEffects/></body></html>;
}
