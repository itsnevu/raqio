"use client";
import { useEffect, useRef, type RefObject } from "react";
import { gsap, ScrollTrigger, useGsap, splitWords, prefersReducedMotion } from "./core";

const clamp = gsap.utils.clamp(0, 1);
const map = (v: number, a: number, b: number, c: number, d: number) => c + (d - c) * clamp((v - a) / (b - a));

/**
 * useScrollReveal: scale.com `ScrollRevealSection`.
 * The backdrop layer (not the content) goes from inset 24px (12 on mobile) with 16px top radius to full bleed.
 * Driven over `top bottom → top top`, remapped to progress .5–1, reaching full width at .8 of that.
 */
export function useScrollReveal(section: RefObject<HTMLElement | null>, backdrop: RefObject<HTMLElement | null>) {
  useGsap(section, (_c, reduced) => {
    const el = section.current!, bd = backdrop.current!;
    if (reduced) { gsap.set(bd, { scaleX: 1, borderTopLeftRadius: 0, borderTopRightRadius: 0 }); return; }
    const sx = gsap.quickSetter(bd, "scaleX"); const rl = gsap.quickSetter(bd, "borderTopLeftRadius", "px"); const rr = gsap.quickSetter(bd, "borderTopRightRadius", "px");
    ScrollTrigger.create({ trigger: el, start: "top bottom", end: "top top", onUpdate: (st) => {
      const w = el.offsetWidth || 1; const inset = window.innerWidth < 768 ? 12 : 24;
      const min = Math.max(0.01, 1 - (2 * inset) / w); const c = map(st.progress, 0.5, 1, 0, 1);
      sx(map(c, 0, 0.8, min, 1)); const r = 16 * (1 - map(c, 0, 0.8, 0, 1)); rl(r); rr(r);
    }, onRefresh: (st) => st.progress === 0 && (sx(1 - 48 / (el.offsetWidth || 1)), rl(16), rr(16)) });
  });
}

/** useSectionWidth: scale.com `Section` inner card 90% → 100%, scrub `top bottom → bottom 75%`, power3.out. Uses scaleX (transform-only). */
export function useSectionWidth(section: RefObject<HTMLElement | null>, inner: RefObject<HTMLElement | null>) {
  useGsap(section, (_c, reduced) => {
    if (reduced) return;
    gsap.fromTo(inner.current, { scaleX: 0.9 }, { scaleX: 1, ease: "power3.out", scrollTrigger: { trigger: section.current, start: "top bottom", end: "bottom 75%", scrub: true } });
  });
}

/** useScaleIn: scale.com SgpStack / BaseCard: scale .96–.98 → 1 with opacity, scrubbed while entering. */
export function useScaleIn(scope: RefObject<HTMLElement | null>, selector: string, from = 0.96, stagger = 0.04) {
  useGsap(scope, (_c, reduced) => {
    const items = gsap.utils.toArray<HTMLElement>(selector, scope.current);
    if (reduced || !items.length) return;
    gsap.fromTo(items, { scale: from, opacity: 0, transformOrigin: "center top" }, { scale: 1, opacity: 1, ease: "power2.inOut", stagger,
      scrollTrigger: { trigger: scope.current, start: "top 85%", end: "top 35%", scrub: true } });
  });
}

/**
 * useWordReveal: per-word opacity reveal.
 * mode "inview": tween when the element hits `start`; re-armed on re-entry (scale quote words: .12 → 1).
 * mode "scrub": progress-linked (the ScrollingQuote seeks 1.4 × pin progress).
 */
export function useWordReveal(scope: RefObject<HTMLElement | null>, target: RefObject<HTMLElement | null>, opts: { from?: number; y?: number; stagger?: number; duration?: number; start?: string; mode?: "inview" | "scrub"; end?: string; trigger?: RefObject<HTMLElement | null> } = {}) {
  const { from = 0, y = 0, stagger = 0.025, duration = 0.45, start = "top 75%", mode = "inview", end = "bottom top", trigger } = opts;
  useGsap(scope, (_c, reduced) => {
    const words = splitWords(target.current!);
    if (reduced) { gsap.set(words, { opacity: 1, y: 0 }); return; }
    gsap.set(words, { opacity: from, y });
    const tl = gsap.timeline({ paused: true }).to(words, { opacity: 1, y: 0, duration, stagger, ease: "power2.out" });
    if (mode === "scrub") ScrollTrigger.create({ trigger: (trigger ?? target).current, start, end, onUpdate: (st) => tl.progress(clamp(st.progress * 1.4)) });
    else ScrollTrigger.create({ trigger: (trigger ?? target).current, start, onEnter: () => tl.restart(), onEnterBack: () => tl.restart(), onLeaveBack: () => tl.pause(0) });
  });
}

/** useRotator: scale `.dynamic-header`: in xP −10/yP 100 → 0, out yP −102 (xP ±10), container width tween, .5s expo.out. */
export function useRotator(container: RefObject<HTMLElement | null>, interval = 1900) {
  useGsap(container, (_c, reduced) => {
    const box = container.current!; const words = gsap.utils.toArray<HTMLElement>("[data-rot]", box);
    if (!words.length) return;
    let i = 0; gsap.set(words, { xPercent: -10, yPercent: 105, opacity: 1 }); gsap.set(words[0], { xPercent: 0, yPercent: 0 }); gsap.set(box, { width: words[0].offsetWidth });
    if (reduced) return;
    const step = () => { const prev = words[i]; i = (i + 1) % words.length; const next = words[i];
      gsap.to(box, { width: next.offsetWidth, duration: 0.5, ease: "expo.out" });
      gsap.fromTo(next, { xPercent: -10, yPercent: 105 }, { xPercent: 0, yPercent: 0, duration: 0.5, ease: "expo.out" });
      gsap.fromTo(prev, { xPercent: 0, yPercent: 0 }, { xPercent: i % 2 ? 10 : -10, yPercent: -105, duration: 0.5, ease: "expo.out" }); };
    let id = 0; const st = ScrollTrigger.create({ trigger: box, start: "top bottom", end: "bottom top", onToggle: (s) => { window.clearInterval(id); if (s.isActive) id = window.setInterval(step, interval); } });
    return () => { window.clearInterval(id); st.kill(); };
  });
}

/**
 * useOrbit: scale Applications tiles. Positions sit on an ellipse by trig, the loop takes 28s (linear), and scale follows
 * the depth (measured .35 → 1.4). The loop pauses off-screen; hover eases timeScale → 0 over 1s with power2.out.
 */
export function useOrbit(scope: RefObject<HTMLElement | null>, opts: { rx?: number; ry?: number; period?: number; minScale?: number; maxScale?: number } = {}) {
  const { period = 28, minScale = 0.55, maxScale = 1.3 } = opts;
  useGsap(scope, (_c, reduced) => {
    const root = scope.current!; const items = gsap.utils.toArray<HTMLElement>("[data-orbit]", root); const n = items.length;
    const state = { t: 0, speed: 1 };
    // keep the largest tile (size × maxScale) fully inside the section
    const place = () => { const w = root.clientWidth, h = root.clientHeight; const half = ((items[0]?.offsetWidth ?? 80) * maxScale) / 2 + 16;
      const rx = Math.min((opts.rx ?? 0.3) * w, w / 2 - half), ry = Math.min((opts.ry ?? 0.3) * h, (h / 2 - half) / 0.9);
      const tilt = (-18 * Math.PI) / 180, ct = Math.cos(tilt), stl = Math.sin(tilt);
      items.forEach((el, k) => { const a = ((k / n + state.t) % 1) * Math.PI * 2; const depth = (Math.sin(a) + 1) / 2; const ex = Math.cos(a) * rx, ey = Math.sin(a) * ry * 0.9;
        gsap.set(el, { x: w / 2 + ex * ct - ey * stl, y: h / 2 + ex * stl + ey * ct, xPercent: -50, yPercent: -50, scale: minScale + (maxScale - minScale) * depth, zIndex: Math.round(depth * 10), opacity: 1 }); }); };
    place(); if (reduced) return;
    const tick = (_t: number, dt: number) => { state.t = (state.t + (dt / 1000 / period) * state.speed) % 1; place(); };
    const st = ScrollTrigger.create({ trigger: root, start: "top bottom", end: "bottom top", onToggle: (s) => (s.isActive ? gsap.ticker.add(tick) : gsap.ticker.remove(tick)) });
    const enter = () => gsap.to(state, { speed: 0, duration: 1, ease: "power2.out", overwrite: true });
    const leave = () => gsap.to(state, { speed: 1, duration: 1, ease: "power2.out", overwrite: true });
    root.addEventListener("pointerenter", enter); root.addEventListener("pointerleave", leave);
    return () => { gsap.ticker.remove(tick); st.kill(); root.removeEventListener("pointerenter", enter); root.removeEventListener("pointerleave", leave); };
  });
}

/** useDragCarousel: pointer drag with inertia-free clamp + arrow API. transform-only. */
export function useDragCarousel(track: RefObject<HTMLElement | null>) {
  const api = useRef({ prev: () => {}, next: () => {} });
  useEffect(() => {
    const el = track.current; if (!el) return;
    let x = 0, startX = 0, startPos = 0, dragging = false, moved = 0;
    const max = () => Math.min(0, (el.parentElement?.clientWidth ?? 0) - el.scrollWidth);
    const set = (v: number, animate = true) => { x = gsap.utils.clamp(max(), 0, v); gsap.to(el, { x, duration: animate ? 0.6 : 0, ease: "expo.out", overwrite: true }); };
    const card = () => (el.firstElementChild as HTMLElement | null)?.offsetWidth ?? 404;
    api.current = { prev: () => set(x + card() + 8), next: () => set(x - card() - 8) };
    const down = (e: PointerEvent) => { dragging = true; moved = 0; startX = e.clientX; startPos = x; el.setPointerCapture(e.pointerId); el.style.cursor = "grabbing"; };
    const move = (e: PointerEvent) => { if (!dragging) return; moved = e.clientX - startX; set(startPos + moved, false); };
    const up = () => { dragging = false; el.style.cursor = "grab"; };
    const click = (e: MouseEvent) => { if (Math.abs(moved) > 6) { e.preventDefault(); e.stopPropagation(); } };
    el.addEventListener("pointerdown", down); el.addEventListener("pointermove", move); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up); el.addEventListener("click", click, true);
    return () => { el.removeEventListener("pointerdown", down); el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up); el.removeEventListener("click", click, true); };
  }, [track]);
  return api;
}

/** useSectionTheme: header inverts by the section under it ([data-theme] = dark | light). ScrollTrigger only, no hardcoded classes. */
export function useSectionTheme() {
  useEffect(() => {
    const root = document.documentElement; const apply = (t: string) => { root.dataset.navTheme = t; };
    // data-theme-offset (px) delays a section's theme, e.g. the hero turns dark only once its media card has dissolved
    let sts: ScrollTrigger[] = [];
    sts = [...document.querySelectorAll<HTMLElement>("[data-theme]")].map((el) => { const off = window.innerWidth >= 768 ? +(el.dataset.themeOffset ?? 0) : 0;
      return ScrollTrigger.create({ trigger: el, start: `top+=${off} 44px`, end: "bottom 44px", onToggle: () => sync() }); });
    // recompute from every active section on each toggle; nothing active (e.g. back at the very top) → light
    function sync() { const act = sts.filter((s) => s.isActive).pop(); apply(act ? (act.trigger as HTMLElement).dataset.theme! : "light"); };
    ScrollTrigger.addEventListener("refresh", sync); ScrollTrigger.refresh();
    return () => { ScrollTrigger.removeEventListener("refresh", sync); sts.forEach((s) => s.kill()); };
  }, []);
}

export { prefersReducedMotion };
