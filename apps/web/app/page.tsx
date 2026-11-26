import Link from "next/link";
import {Button} from "../../../packages/ui/components";
import {FAQ,Footer,Header,ProductTile} from "../components/Marketing";
import {ContactTeaser} from "../components/ContactForm";
import HeroVideo from "../components/HeroVideo";
import StatementMorph from "../components/StatementMorph";
import RegionChat from "../components/RegionChat";
import WorkflowSteps from "../components/WorkflowSteps";
import {Sales,UseCases} from "../components/SaasSections";
import HeaderBehavior from "../components/HeaderBehavior";
import {getI18n} from "../i18n/server";
import {copy} from "../content";

export default async function Home() {
  const {t,href}=await getI18n();
  const customVideo=process.env.NEXT_PUBLIC_RAQIO_HERO_VIDEO_URL;
  const video=customVideo||"/media/indonesia-local-trade-4k.mp4";
  const poster=process.env.NEXT_PUBLIC_RAQIO_HERO_POSTER_URL||"/media/indonesia-local-trade-poster.webp";
  return <><Header/><HeaderBehavior/><main id="konten">
    <section className="hero hero-full">
      <HeroVideo src={video} lightSrc={customVideo ? undefined : "/media/indonesia-local-trade-1080p.mp4"} mobileSrc={customVideo ? undefined : "/media/indonesia-local-trade-mobile-1080.mp4"} poster={poster}/>
      <div className="shell hero-copy">
        <h1>{t(copy.headline[0])}<br/><em>{t(copy.headline[1])}</em></h1>
        <p className="hero-intro">{t("Riset pasar lokal dan kelola percakapan WhatsApp pelanggan bersama tim.")}</p>
        <div className="actions"><Button variant="amber" href={href("/produk")}>{t("Jelajahi produk")} <span aria-hidden="true">&#8594;</span></Button><a className="text-link" href="#alur">{t("Lihat cara kerja")} <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14m-5-5 5 5 5-5"/></svg></a></div>
      </div>
    </section>
    <StatementMorph/>
    <WorkflowSteps/>
    <section className="products-section" id="produk"><div className="shell section product-sequence"><ProductTile product="competitor-scraping"/><ProductTile product="wa-suite"/></div></section>
    <UseCases/>
    <section className="region" aria-labelledby="region-title">
      <div className="region-photo">
        {/* eslint-disable-next-line @next/next/no-img-element -- local art with parallax */}
        <img src="/media/raqio-jakarta-skyline.webp" alt="" loading="lazy"/>
      </div>
      <div className="shell region-content">
        <h2 id="region-title">{t("Setiap wilayah punya pasar yang berbeda.")}</h2>
        <p>{t("Mulai dari kelurahan atau kota yang Anda kenal, lalu bandingkan temuan dengan wilayah lain.")}</p>
        <Link className="text-link" href={href("/tentang")}>{t("Cara kami bekerja dengan data")}</Link>
        <RegionChat/>
      </div>
    </section>
    <Sales/>
    <section className="contact"><div className="shell contact-inner"><h2>{t("Mulai bersama RAQIO.")}</h2><p>{t("Ceritakan kebutuhan tim Anda.")}</p><ContactTeaser/></div></section>
    <div className="faq-band"><FAQ/></div>
  </main><Footer/></>;
}
