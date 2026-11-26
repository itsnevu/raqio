"use client";

import Link from "next/link";
import {useI18n} from "../i18n/client";
import {Button} from "../../../packages/ui/components";
import {useStory} from "./ProductStory";
import ProductDevices from "./ProductDevices";
import WaSuiteMock from "./WaSuiteMock";

const TIMELINE=[1500,900,950,850,450,850,3000];

export default function WaSuiteHero({description,appUrl}:{description:string;appUrl?:string}){
  const {t,href}=useI18n();
  const step=useStory(TIMELINE);
  return <section className="wa-hero wa-suite-product-hero" data-step={step}>
    <ProductDevices desktop={<WaSuiteMock step={step}/>} mobile={<WaSuiteMock step={step} mobile/>}/>
    <div className="shell wa-hero-copy">
      <h1>{t("Satu inbox untuk semua percakapan pelanggan.")}</h1>
      <p>{t(description)}</p>
      <div className="actions">
        <Button variant="amber" href={appUrl??href("/kontak")}>{t(appUrl?"Coba sekarang":"Tanya tentang produk")} <span aria-hidden="true">&#8594;</span></Button>
        <Link className="button button-ghost" href={href("/kontak")}>{t("Minta demo")}</Link>
      </div>
    </div>
  </section>;
}
