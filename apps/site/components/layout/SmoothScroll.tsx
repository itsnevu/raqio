"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Lenis from "lenis";
import { gsap, ScrollTrigger, prefersReducedMotion, refreshSoon } from "@/lib/motion/core";

declare global { interface Window { __lenis?: Lenis } }

/** Lenis ↔ ScrollTrigger in one ticker. Disabled under prefers-reduced-motion. */
export function SmoothScroll() {
  useParallax();
  useEffect(() => {
    const onResize = () => refreshSoon(200);
    window.addEventListener("resize", onResize);
    document.fonts?.ready.then(() => refreshSoon(50));
    if (prefersReducedMotion()) return () => window.removeEventListener("resize", onResize);

    const lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
    window.__lenis = lenis;
    lenis.on("scroll", ScrollTrigger.update);
    const tick = (t: number) => lenis.raf(t * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    return () => { gsap.ticker.remove(tick); lenis.destroy(); window.__lenis = undefined; window.removeEventListener("resize", onResize); };
  }, []);
  return null;
}

/** data-parallax="12" → element moves from +12% to −12% of its height while it crosses the viewport (scrubbed). */
function useParallax() {
  const path = usePathname();
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const els = [...document.querySelectorAll<HTMLElement>("[data-parallax]")];
    const tweens = els.map((el) => { const amt = +(el.dataset.parallax || 10);
      return gsap.fromTo(el, { yPercent: amt }, { yPercent: -amt, ease: "none", scrollTrigger: { trigger: el.parentElement ?? el, start: "top bottom", end: "bottom top", scrub: true } }); });
    refreshSoon(100);
    return () => tweens.forEach((t) => { t.scrollTrigger?.kill(); t.kill(); });
  }, [path]);
}
