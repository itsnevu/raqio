"use client";
import { useRef } from "react";
import { useT } from "@/content/i18n";
import { gsap, ScrollTrigger, useGsap, splitWords } from "@/lib/motion/core";
import { Button } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { SourceLogos } from "@/components/ui/SourceLogos";
import { WhatsAppFlow } from "@/components/ui/WhatsAppFlow";
import { HeroVideo } from "@/components/ui/HeroVideo";
import { Wireframe } from "@/components/ui/Wireframe";
import { EdgeLayer, WireLayer, ContourLayer, MarkerLayer } from "@/components/ui/Vision";

/**
 * Hero: scale.com HomeHero choreography (user-supplied frame references + measured frames), 450dvh pinned.
 *  p .00–.05  white page, inset video card (88 top / 18 sides) shrinks a little, headline out
 *  p .05–.12  page → black; the card tilts into a 3D panel at centre-top, wireframe layers appear  → stage A text below (centre)
 *  p .40–.50  panel slides right, rotates and layers spread; content → Raqio report            → stage B text left
 *  p .72–.82  panel slides left, rotates the other way; content → Bundaran HI video + links      → stage C text right
 * Every value is scrubbed (reversible); stage copy uses triggered word reveals (25ms stagger) re-armed both ways.
 */
const WINDOWS: [number, number][] = [[0.12, 0.4], [0.48, 0.72], [0.8, 0.97]];
const STAGE_POS = [
  "md:inset-x-0 md:top-[67vh] md:items-center md:text-center",
  "md:left-[9vw] md:top-1/2 md:w-[30vw] md:-translate-y-1/2 md:items-start md:text-left",
  "md:left-[62vw] md:top-1/2 md:w-[30vw] md:-translate-y-1/2 md:items-start md:text-left",
];

export function Hero() {
  const { hero, ui } = useT();
  const root = useRef<HTMLElement>(null);
  useGsap(root, (_c, reduced) => {
    const q = gsap.utils.selector(root);
    const stages = q<HTMLElement>("[data-stage]");
    const words = stages.map((s) => splitWords(s.querySelector("[data-title]")!));
    const headWords = splitWords(q<HTMLElement>("[data-headline]")[0]);
    const mm = gsap.matchMedia();

    mm.add({ desk: "(min-width: 768px)", reduced: "(prefers-reduced-motion: reduce)" }, (ctx) => {
      const { desk } = ctx.conditions as { desk: boolean; reduced: boolean };
      if (reduced || !desk) {
        gsap.set(q("[data-bg]"), { opacity: 1 });
        stages.forEach((s, i) => { gsap.set(s, { autoAlpha: 1 }); if (reduced) gsap.set(words[i], { opacity: 1 });
          else { gsap.set(words[i], { opacity: 0 }); ScrollTrigger.create({ trigger: s, start: "top 80%", once: true, onEnter: () => gsap.to(words[i], { opacity: 1, duration: 0.45, stagger: 0.025, ease: "power2.out" }) }); } });
        return;
      }
      gsap.from(headWords, { y: 30, opacity: 0, duration: 0.7, stagger: 0.022, ease: "expo.out", delay: 0.15 });

      const rig = q("[data-rig]")[0]; const w = rig.offsetWidth, h = rig.offsetHeight;
      const layers = q<HTMLElement>("[data-layer]");
      // every plane has its own depth (data-depth): z = depth × spread, plus a lateral slide = depth × pct (scale.com: stacked panes that fan out sideways)
      const dep = layers.map((l) => +(l.dataset.depth ?? 0));
      const z = (spread: number) => (i: number) => dep[i] * spread;
      const xs = (pct: number) => (i: number) => dep[i] * pct;
      gsap.set(layers, { opacity: 0, z: z(40) });

      // ONE video all the way down: it only shrinks, then tilts diagonally (centre → right → left) while the layers explode in Z
      const tl = gsap.timeline({ defaults: { ease: "power2.inOut" }, scrollTrigger: { trigger: root.current, start: "top top", end: "bottom bottom", scrub: true } });
      tl
        // 1 · inset card shrinks a little; headline + hints leave; page → black
        .fromTo(rig, { scaleX: (w - 36) / w, scaleY: (h - 106) / h, y: 35 }, { scaleX: 0.84, scaleY: 0.8, y: 20, duration: 0.05 }, 0)
        .fromTo(q("[data-card]"), { borderRadius: 16 }, { borderRadius: 22, duration: 0.05 }, 0)
        .to(q("[data-headline]"), { opacity: 0, y: -24, duration: 0.03, ease: "none" }, 0.01)
        .to(q("[data-scroll-hint]"), { autoAlpha: 0, duration: 0.02, ease: "none" }, 0.01)
        .to(q("[data-bg]"), { opacity: 1, duration: 0.07, ease: "none" }, 0.02)
        // 2 · diagonal 3D panel at centre-top, wire layers come out of it
        .to(rig, { scaleX: 0.36, scaleY: 0.36, y: "-4vh", rotationY: -30, rotationX: 10, rotationZ: -4, duration: 0.07 }, 0.05)
        .to(q("[data-card]"), { borderRadius: 40, duration: 0.07 }, 0.05)
        .to(layers, { opacity: 1, z: z(60), xPercent: xs(2.2), duration: 0.07, stagger: 0.006 }, 0.06)
        .to(rig, { rotationY: -36, duration: 0.28, ease: "none" }, 0.12)
        // 3 · panel → right (copy left), layers spread further
        .to(rig, { x: "17vw", y: 0, rotationY: -38, rotationX: 6, rotationZ: -2, scaleX: 0.46, scaleY: 0.46, duration: 0.1 }, 0.4)
        .to(layers, { z: z(95), xPercent: xs(-1.8), duration: 0.1 }, 0.4)
        .to(rig, { rotationY: -34, duration: 0.22, ease: "none" }, 0.5)
        // 4 · panel → left (copy right: WA-Suite), rotate the other way
        .to(rig, { x: "-22vw", rotationY: -36, rotationX: 6, rotationZ: 2, scaleX: 0.44, scaleY: 0.44, duration: 0.1 }, 0.72)
        .to(layers, { z: z(90), xPercent: xs(1), duration: 0.1 }, 0.72)
        .to(rig, { rotationY: -32, duration: 0.14, ease: "none" }, 0.82)
        // exit (measured parallaxOut y −10px, power3.in)
        .to(q("[data-pin]"), { y: -10, duration: 0.04, ease: "power3.in" }, 0.96);

      // pointer tilt: ±3° Y / ±2° X on a wrapper, slow ease (1.8s), returns to rest on leave
      if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
        const tilt = q("[data-tilt]")[0];
        const ry = gsap.quickTo(tilt, "rotationY", { duration: 1.8, ease: "power2.out" });
        const rx = gsap.quickTo(tilt, "rotationX", { duration: 1.8, ease: "power2.out" });
        const pin = q<HTMLElement>("[data-pin]")[0];
        const move = (e: PointerEvent) => {
          // no tilt while the flat video card is showing at the very top; only once it has become the 3D panel
          const sec = root.current!; const prog = -sec.getBoundingClientRect().top / Math.max(1, sec.offsetHeight - innerHeight);
          if (prog < 0.05) { ry(0); rx(0); return; }
          const r = pin.getBoundingClientRect(); const nx = (e.clientX - r.left) / r.width - 0.5, ny = (e.clientY - r.top) / r.height - 0.5; ry(nx * 6); rx(-ny * 4);
        };
        const onScroll = () => { const sec = root.current!; if (-sec.getBoundingClientRect().top / Math.max(1, sec.offsetHeight - innerHeight) < 0.05) { ry(0); rx(0); } };
        window.addEventListener("scroll", onScroll, { passive: true });
        ctx.add(() => () => window.removeEventListener("scroll", onScroll));
        const leave = () => { ry(0); rx(0); };
        pin.addEventListener("pointermove", move); pin.addEventListener("pointerleave", leave);
        ctx.add(() => () => { pin.removeEventListener("pointermove", move); pin.removeEventListener("pointerleave", leave); });
      }

      // idle float: slow ±8px drift so the stack never looks frozen
      gsap.fromTo(q("[data-tilt]")[0], { y: -8 }, { y: 8, duration: 4, ease: "sine.inOut", yoyo: true, repeat: -1 });

      // stage copy: triggered tweens, re-armed both directions
      let cur = -1;
      gsap.set(stages, { autoAlpha: 0 }); words.forEach((ws) => gsap.set(ws, { opacity: 0 }));
      const show = (n: number) => {
        if (n === cur) return;
        if (cur >= 0) { const old = cur; gsap.to(words[old], { opacity: 0, y: -6, duration: 0.22, stagger: { each: 0.04, from: "end" }, ease: "power2.out", overwrite: "auto", onComplete: () => { if (cur !== old) gsap.set(stages[old], { autoAlpha: 0 }); } }); gsap.to(stages[old].querySelectorAll("[data-fade]"), { autoAlpha: 0, duration: 0.25, overwrite: "auto" }); }
        cur = n; if (n < 0) return;
        gsap.set(stages[n], { autoAlpha: 1 });
        gsap.fromTo(words[n], { opacity: 0, y: 0 }, { opacity: 1, duration: 0.45, stagger: 0.025, ease: "power2.out", overwrite: "auto" });
        gsap.fromTo(stages[n].querySelectorAll("[data-fade]"), { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.5, delay: 0.25, stagger: 0.08, ease: "expo.out", overwrite: "auto" });
      };
      ScrollTrigger.create({ trigger: root.current, start: "top top", end: "bottom bottom", onUpdate: (st) => show(WINDOWS.findIndex(([a, b]) => st.progress >= a && st.progress < b)) });
    });
    // GSAP now owns every start state: lift the pre-hydration CSS mask (globals.css, [data-hero]:not([data-ready]))
    root.current?.setAttribute("data-ready", "");
    return () => mm.revert();
  });

  return (
    <section ref={root} data-hero data-theme="dark" data-theme-offset="300" className="relative bg-ink md:h-[450dvh] md:bg-fg" aria-label={ui.sections.intro}>
      <div data-bg className="pointer-events-none absolute inset-0 bg-ink opacity-100 md:opacity-0" aria-hidden />
      <div data-pin className="relative overflow-hidden md:sticky md:top-0 md:h-dvh">
        {/* 3D rig: the video card + wireframe layers (CSS 3D, no WebGL) */}
        <div className="absolute inset-0 hidden [perspective:1700px] md:block" aria-hidden>
          <div data-tilt className="absolute inset-0 origin-center [transform-style:preserve-3d]">
          <div data-rig className="absolute inset-0 origin-center [transform-style:preserve-3d]">
            {/* back: live edge drawing of the video + outline frames */}
            <div data-layer data-depth="-2" className="absolute inset-0 text-fg/50"><EdgeLayer /><Wireframe seed={1} variant="outline" /></div>
            <div data-layer data-depth="-1" className="absolute inset-0 text-fg/35"><Wireframe seed={2} variant="outline" /></div>
            {/* the hero video itself */}
            <div data-card className="absolute inset-0 overflow-hidden bg-ink">
              <HeroVideo />
            </div>
            {/* front 1: topographic contours + triangle markers traced from the video */}
            <div data-layer data-depth="1" className="absolute inset-0"><ContourLayer /><MarkerLayer /></div>
            <div data-layer data-depth="1.6" className="absolute inset-0 text-fg/45"><Wireframe seed={6} variant="outline" /></div>
            <div data-layer data-depth="2.2" className="absolute inset-0 text-fg/60"><Wireframe seed={5} variant="diamonds" /><Wireframe seed={7} variant="outline" /></div>
            <div data-layer data-depth="2.8" className="absolute inset-0 text-fg/45"><Wireframe seed={8} variant="outline" /></div>
            {/* front 2: curved wires to the node column + outline */}
            <div data-layer data-depth="3.4" className="absolute inset-0 text-fg/70"><WireLayer /><Wireframe seed={4} variant="outline" /></div>
          </div>
          </div>
        </div>

        <div className="relative flex min-h-[70svh] items-center justify-center px-6 pt-24 md:h-full md:min-h-0 md:px-8 md:pt-0">
          <h1 data-headline className="header2 max-w-[18ch] text-balance text-center text-fg">{hero.headline}</h1>
        </div>
        <div data-scroll-hint className="absolute bottom-[72px] right-[72px] hidden items-center gap-4 text-fg md:flex">
          <span className="body3 font-medium tracking-wide">{ui.scroll}</span>
          <span className="grid aspect-square place-items-center rounded-sm border border-fg p-2"><svg viewBox="0 0 16 16" className="size-4" aria-hidden><path d="M8 2v12M3 9l5 5 5-5" stroke="currentColor" strokeWidth="1.5" fill="none" /></svg></span>
        </div>

        {/* stage copy: A centre-bottom, B left, C right (as in the reference frames) */}
        <div className="relative px-6 pb-20 pt-10 md:absolute md:inset-0 md:p-0">
          {hero.stages.map((s, i) => (
            <div key={i} data-stage className={`mb-16 flex flex-col items-center gap-4 text-center text-fg md:absolute md:mb-0 ${STAGE_POS[i]}`}>
              {s.eyebrow && <div data-fade><Eyebrow className="text-fg-muted">{s.eyebrow}</Eyebrow></div>}
              <h2 data-title className={`max-w-[22ch] text-balance ${i === 0 ? "header4" : "header3"}`}>{s.title}</h2>
              <p data-fade className="body2 max-w-[48ch] text-fg-muted">{s.body}</p>
              {s.cta && <div data-fade className="pt-2"><Button href={s.cta.href}>{s.cta.label}</Button></div>}
              {i === 1 && <div data-fade className="pt-6"><SourceLogos label={hero.sourcesLabel} /></div>}
              {i === 2 && <div data-fade className="pt-6"><WhatsAppFlow label={hero.waLabel} /></div>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
