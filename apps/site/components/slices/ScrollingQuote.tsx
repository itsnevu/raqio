"use client";
import { useRef } from "react";
import { useT } from "@/content/i18n";
import { gsap, ScrollTrigger, useGsap, splitWords } from "@/lib/motion/core";
import { VideoMontage } from "@/components/ui/VideoMontage";

/**
 * ScrollingQuote: scale.com source (3po5x6ewjdt6h.js):
 *   root h-[200dvh] px-3 md:px-6 bg-black; section pinned start "top 20%" (desktop) / "top top", end +=2×innerHeight, pinSpacing:false
 *   tl: wrapper yPercent 25 → 0 (.75 power3.out) @0 · media yPercent 67 → 0 (2.25 cubic.inOut) @0 · wrapper → scale .9, opacity 0, yPercent −20 (.75 power2.inOut) @1.5
 *   quote words: seek(clamp(1.4 × progress)), opacity .12 → 1
 * Quote panel bg = --accent-primary (replaces evergreen). Text --fg on accent = 4.89:1.
 */
export function ScrollingQuote() {
  const { quote, ui } = useT();
  const root = useRef<HTMLDivElement>(null);
  useGsap(root, (_c, reduced) => {
    const q = gsap.utils.selector(root);
    const words = splitWords(q<HTMLElement>("[data-quote]")[0]);
    const words_tl = gsap.timeline({ paused: true }).fromTo(words, { opacity: 0.12 }, { opacity: 1, duration: 0.45, stagger: 0.05, ease: "none" });
    if (reduced) { words_tl.progress(1); return; }
    const mm = gsap.matchMedia();
    mm.add("(min-width: 768px)", () => {
      // media naik sampai bawahnya sejajar dengan kartu kutipan (self-end) di 1.2, lalu ditahan sejajar sampai 1.65
      // sebelum keduanya memudar; kata-kata kutipan selesai menyala di ~62% scroll, sebelum pudar.
      const tl = gsap.timeline({ scrollTrigger: { trigger: q("[data-pin]")[0], start: "top 20%", end: () => `+=${2 * window.innerHeight}`, pin: true, pinSpacing: false, scrub: true,
        onUpdate: (st) => words_tl.progress(Math.min(1, 1.6 * st.progress)) } });
      tl.fromTo(q("[data-wrapper]"), { yPercent: 25 }, { yPercent: 0, duration: 0.75, ease: "power3.out" }, 0)
        .fromTo(q("[data-media]"), { yPercent: 67 }, { yPercent: 0, duration: 1.2, ease: "power2.out" }, 0)
        .to(q("[data-wrapper]"), { scale: 0.9, opacity: 0, yPercent: -20, duration: 0.75, ease: "power2.inOut" }, 1.65);
    });
    mm.add("(max-width: 767px)", () => {
      ScrollTrigger.create({ trigger: q("[data-quote]")[0], start: "top 80%", end: "bottom 40%", scrub: true, onUpdate: (st) => words_tl.progress(st.progress) });
    });
    return () => mm.revert();
  });

  return (
    <div ref={root} data-theme="dark" className="relative z-[1] bg-ink px-3 md:-mt-[60dvh] md:h-[200dvh] md:bg-transparent md:bg-[linear-gradient(to_bottom,transparent_0,transparent_14dvh,color-mix(in_srgb,var(--ink)_70%,transparent)_40dvh,var(--ink)_60dvh)] md:px-6">
      <section data-pin className="relative mx-auto w-full max-w-[2048px] py-16 md:py-0" aria-label={ui.sections.why}>
        <div data-wrapper className="flex w-full flex-col gap-2 pb-3 md:min-h-[70vh] md:flex-row">
          {/* vertical media tile (scale.com: 362px) */}
          <div data-media className="relative aspect-square shrink-0 overflow-hidden rounded-lg bg-surface-2 md:w-[380px] md:self-end" aria-hidden>
            {/* 4K abstract network montage (monochrome, matches the hero wireframes). Pixabay content licence: #112258, #113368 */}
            <VideoMontage clips={["/media/net-1.mp4", "/media/net-2.mp4"]} />
          </div>
          <figure className="flex flex-1 flex-col justify-between gap-10 rounded-lg bg-accent p-8 text-fg md:p-12">
            <blockquote data-quote className="header3 max-w-[24ch] text-balance">{quote.text}</blockquote>
            <figcaption className="detail-mono">{quote.attribution}</figcaption>
          </figure>
        </div>
      </section>
    </div>
  );
}
