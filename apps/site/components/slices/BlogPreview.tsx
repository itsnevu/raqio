"use client";
import { useRef } from "react";
import Link from "next/link";
import { useT } from "@/content/i18n";
import { useScaleIn } from "@/lib/motion/hooks";

/**
 * BlogPreview bento: 12-col grid (measured), one hero tile, category chips, gradient overlay, image scale 1 → 1.05 on hover.
 * Tiles reveal at scale .98 → 1 with a 35ms stagger. Chips use only two accents (a3, a4), per the max-two-accents rule.
 */
// header CTA already shows --accent-primary, so only ONE extra accent here: the hero tile's chip uses a3, the rest are neutral
// Real photography from Pexels (Pexels licence: free commercial use, no attribution required). Photographers: javaistan, prtscfn, Anthony Shkraba Production, Tom Fisk, silverkblack.
const IMGS = ["blog-jakarta-aerial.jpg", "blog-night-market.jpg", "blog-bakery-phone.jpg", "blog-market-canal.jpg", "blog-boutique.jpg"];
const chip = (hero?: boolean) => (hero ? "bg-accent-3" : "bg-fg");
export function BlogPreview() {
  const { blog, ui } = useT();
  const root = useRef<HTMLElement>(null);
  useScaleIn(root, "[data-tile]", 0.98, 0.035);
  return (
    <section ref={root} data-theme="light" aria-label={ui.sections.latest} className="relative overflow-hidden bg-fg py-12 md:py-16">
      <div className="grid-layout">
        <h2 className="header2 col-span-8 mb-10 text-balance text-center md:col-span-8 md:col-start-3 md:mb-16">{blog.title}</h2>
        <ul className="col-span-8 grid grid-cols-2 gap-2 md:col-span-10 md:col-start-2 md:grid-cols-4 md:grid-rows-[repeat(2,minmax(260px,auto))]">
          {blog.posts.slice(0, 5).map((p, i) => (
            <li key={p.href} data-tile className={p.hero ? "col-span-2 md:row-span-2" : "col-span-1"}>
              <Link href={p.href} className="group/tile relative flex h-full min-h-[220px] flex-col justify-end overflow-hidden rounded-card bg-surface p-5 text-fg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/media/${IMGS[i]}`} alt="" loading="lazy" decoding="async" data-parallax="6" className="absolute inset-0 size-full scale-[1.12] object-cover transition-[scale] duration-700 ease-expo group-hover/tile:scale-[1.18]" />
                <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/35 to-transparent" />
                <span className={`relative mb-3 w-fit rounded-xl px-3 py-1 text-xs font-medium text-ink ${chip(p.hero)}`}>{p.tag}</span>
                <span className={`relative text-balance ${p.hero ? "header4" : "text-base leading-6 md:text-lg"}`}>{p.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
