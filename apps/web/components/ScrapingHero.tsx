"use client";

import Link from "next/link";
import {useI18n} from "../i18n/client";
import {Button} from "../../../packages/ui/components";
import {useStory} from "./ProductStory";
import ProductDevices from "./ProductDevices";
import ScrapingMock from "./ScrapingMock";

const TIMELINE=[900,1150,1150,800,430,1100,1100,1100,1100,1100,3100];

export default function ScrapingHero({description,appUrl}:{description:string;appUrl?:string}){
  const {t,href}=useI18n();
  const step=useStory(TIMELINE);
  return <section className="wa-hero scraping-product-hero" data-step={step}>
    <ProductDevices desktop={<ScrapingMock step={step}/>} mobile={<ScrapingMock step={step} mobile/>}/>
    <div className="shell wa-hero-copy">
      <h1>{t("Lihat peta pasar dengan lebih jelas.")}</h1>
      <p>{t(description)}</p>
      <div className="actions">
        <Button variant="amber" href={appUrl??href("/kontak")}>{t(appUrl?"Coba sekarang":"Tanya tentang produk")} <span aria-hidden="true">&#8594;</span></Button>
        <Link className="button button-ghost" href={href("/kontak")}>{t("Minta demo")}</Link>
      </div>
    </div>
  </section>;
}
