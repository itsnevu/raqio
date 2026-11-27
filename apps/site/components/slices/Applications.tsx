"use client";
import { useRef } from "react";
import { useT } from "@/content/i18n";
import { gsap, useGsap } from "@/lib/motion/core";
import { useOrbit, useRotator, useScrollReveal } from "@/lib/motion/hooks";

/**
 * Applications: scale.com source.
 *  - wrapped in ScrollRevealSection (backdrop scale-gray-90 → --light)
 *  - pin: start "bottom bottom" (mobile "bottom bottom-=50vh"), end +=1.5×innerHeight, pinSpacing:false, scrub
 *    tl: inner y 0 → −20vh (power1.out .25) · black overlay opacity 0 → .35 (power1.out .5)
 *  - tiles: ellipse orbit, 28s linear loop, scale .35 → 1.4 by depth (measured), hover eases timeScale to 0 (1s power2.out)
 *  - rotator `.dynamic-header`: .5s expo.out (interval 1900ms, brief)
 * Rotator words: --accent-primary text (4.64:1 on --light); accent-2/3/4 text would fail contrast here.
 */
// Raqio photography (apps/web/public/media)
const photos = ["audience-cs-expansion-bandung", "raqio-jakarta-skyline", "audience-wa-store", "audience-cs-umkm", "raqio-night-desk", "audience-wa-branches", "bundaran-hi", "audience-cs-sales", "raqio-mountain-valley", "audience-wa-support", "audience-cs-research", "audience-wa-sales"];

export function Applications() {
  const { applications, ui } = useT();
  const root = useRef<HTMLElement>(null); const bd = useRef<HTMLDivElement>(null);
  const orbit = useRef<HTMLDivElement>(null); const rot = useRef<HTMLSpanElement>(null);
  useScrollReveal(root, bd);
  useOrbit(orbit);
  useRotator(rot, 1900);
  useGsap(root, (_c, reduced) => {
    if (reduced) return;
    const q = gsap.utils.selector(root);
    const mm = gsap.matchMedia();
    mm.add("(min-width: 768px)", () => {
      gsap.timeline({ scrollTrigger: { trigger: q("[data-pin]")[0], start: "bottom bottom", end: () => `+=${1.5 * window.innerHeight}`, pin: true, pinSpacing: false, scrub: true } })
        .fromTo(q("[data-inner]"), { y: 0 }, { y: "-20vh", ease: "power1.out", duration: 0.25 })
        .fromTo(q("[data-overlay]"), { opacity: 0 }, { opacity: 0.35, ease: "power1.out", duration: 0.5 });
    });
    return () => mm.revert();
  });

  return (
    <section ref={root} data-theme="light" aria-label={ui.sections.industries} className="relative isolate z-[2] w-full">
      <div ref={bd} aria-hidden className="pointer-events-none absolute inset-0 z-0 origin-top rounded-t-2xl bg-light" />
      <div data-pin className="relative z-[1] isolate flex min-h-dvh flex-col justify-end overflow-hidden">
        <div data-overlay className="pointer-events-none absolute inset-0 z-[1] bg-ink opacity-0" aria-hidden />
        <div data-inner className="relative flex min-h-[90vh] items-center justify-center text-ink md:min-h-screen">
          <div ref={orbit} className="absolute inset-0" aria-hidden>
            {Array.from({ length: 12 }, (_, i) => (
              <div key={i} data-orbit className="absolute left-0 top-0 size-16 overflow-hidden rounded-lg bg-surface-2 will-change-transform md:size-24">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/media/${photos[i % photos.length]}.webp`} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
              </div>
            ))}
          </div>
          <div className="relative z-[11] flex flex-col items-center gap-6 px-6 text-center">
            <h2 className="header2">
              <span className="block">{applications.title}</span>
              <span className="flex items-start justify-center gap-[.22em]">
                <span className="leading-[1.2]">{applications.prefix}</span>
                {/* wrapper height == pill height so off-stage words (yPercent ±105) never peek in */}
                <span ref={rot} className="relative inline-block h-[1.2em] overflow-hidden" aria-live="off">
                  {applications.rotator.map((w, i) => (
                    <span key={w} data-rot className="absolute left-0 top-0 block h-[1.2em] whitespace-nowrap leading-[1.2em] text-accent" aria-hidden={i !== 0}>{w}</span>
                  ))}
                </span>
              </span>
              <span className="sr-only">{applications.rotator.join(", ")}</span>
            </h2>
            <a href={applications.cta.href} className="rounded-md bg-fg px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-ink hover:text-fg">{applications.cta.label}</a>
          </div>
        </div>
      </div>
    </section>
  );
}
