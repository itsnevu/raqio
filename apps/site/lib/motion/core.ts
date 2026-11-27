"use client";
import { useEffect, useLayoutEffect, useRef, useState, type DependencyList, type RefObject } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true });
}

export { gsap, ScrollTrigger };

export const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export const EASE = { expo: "expo.out", io: "power2.inOut", out: "power3.out" } as const;

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    on(); mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** gsap.context scoped to a ref; reverts every tween + ScrollTrigger on unmount/deps change. */
export function useGsap(scope: RefObject<HTMLElement | null>, fn: (ctx: gsap.Context, reduced: boolean) => void | (() => void), deps: DependencyList = []) {
  const fnRef = useRef(fn); fnRef.current = fn;
  useIsoLayoutEffect(() => {
    if (!scope.current) return;
    let cleanup: void | (() => void);
    const ctx = gsap.context((self) => { cleanup = fnRef.current(self, prefersReducedMotion()); }, scope.current);
    return () => { if (typeof cleanup === "function") cleanup(); ctx.revert(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** Split text nodes into .word spans (keeps spaces). Returns the spans. */
export function splitWords(el: HTMLElement): HTMLSpanElement[] {
  if (el.dataset.split === "1") return [...el.querySelectorAll<HTMLSpanElement>(":scope .word")];
  const walk = (node: Node) => {
    [...node.childNodes].forEach((n) => {
      if (n.nodeType === 3) {
        const parts = (n.textContent ?? "").split(/(\s+)/);
        const frag = document.createDocumentFragment();
        parts.forEach((p) => { if (!p) return; if (/^\s+$/.test(p)) frag.appendChild(document.createTextNode(p)); else { const s = document.createElement("span"); s.className = "word"; s.textContent = p; frag.appendChild(s); } });
        n.parentNode?.replaceChild(frag, n);
      } else if (n.nodeType === 1 && !(n as HTMLElement).classList.contains("word")) walk(n);
    });
  };
  walk(el); el.dataset.split = "1";
  return [...el.querySelectorAll<HTMLSpanElement>(":scope .word")];
}

/** debounced refresh so late fonts/images don't leave stale trigger positions */
let refreshTimer: number | undefined;
export function refreshSoon(ms = 150) {
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => ScrollTrigger.refresh(), ms);
}
