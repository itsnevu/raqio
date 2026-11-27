"use client";
import { useEffect, useState } from "react";
import { prefersReducedMotion } from "@/lib/motion/core";

/**
 * Raqio city footage (reused from apps/web/public/media) with business "detections" drawn over it,
 * the Raqio equivalent of scale.com's labelled bounding boxes. Box colour: --accent-2 only, plus one neutral
 * focus box, so with the header CTA at most two accents are on screen.
 * Boxes are illustrative overlays: they are placed by percentage and do not track objects in the footage.
 */
const BOXES = [
  { x: 6, y: 58, w: 9, h: 14 }, { x: 18, y: 63, w: 7, h: 10 }, { x: 31, y: 55, w: 10, h: 12 },
  { x: 58, y: 57, w: 8, h: 11 }, { x: 69, y: 52, w: 11, h: 15 }, { x: 84, y: 60, w: 8, h: 12 },
];

export function HeroVideo() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const v = document.querySelector<HTMLVideoElement>("[data-hero-video]");
    if (!v) return;
    if (prefersReducedMotion()) { v.pause(); v.removeAttribute("autoplay"); }
    else v.play().catch(() => {});
    const t = window.setTimeout(() => setReady(true), 600);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <>
      <video data-hero-video className="absolute inset-0 size-full object-cover" autoPlay muted loop playsInline preload="metadata" poster="/media/indonesia-local-trade-poster.webp">
        {/* one source everywhere: object tracks (hero-tracks.json) were computed on this exact file */}
        <source src="/media/indonesia-local-trade-1080p.mp4" type="video/mp4" />
      </video>
      {/* legibility scrim for the white headline */}
      <div className="absolute inset-0 bg-[radial-gradient(70%_55%_at_50%_50%,rgb(10_10_15/.55),rgb(10_10_15/.25)_70%)]" />
    </>
  );
}

/** Pause / play control (autoplaying video > 5s must be pausable, WCAG 2.2.2). Outside the aria-hidden card. */
export function VideoToggle({ label }: { label: { pauseVideo: string; playVideo: string } }) {
  const [playing, setPlaying] = useState(true);
  useEffect(() => { if (prefersReducedMotion()) setPlaying(false); }, []);
  const toggle = () => { const v = document.querySelector<HTMLVideoElement>("[data-hero-video]"); if (!v) return; if (v.paused) { v.play().catch(() => {}); setPlaying(true); } else { v.pause(); setPlaying(false); } };
  return (
    <button data-scroll-hint type="button" onClick={toggle} aria-pressed={!playing}
      className="absolute bottom-[72px] left-[72px] z-10 hidden items-center gap-2 rounded-full bg-ink/60 px-3 py-2 text-xs font-medium text-fg backdrop-blur md:flex">
      <svg viewBox="0 0 16 16" className="size-3" aria-hidden fill="currentColor">{playing ? <path d="M4 3h3v10H4zM9 3h3v10H9z" /> : <path d="M4 2.5v11l9-5.5z" />}</svg>
      {playing ? label.pauseVideo : label.playVideo}
    </button>
  );
}
