"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Several clips played back to back with a 1s crossfade. Only the active and the next clip load;
 * playback runs only while the tile is on screen. Under reduced motion the first clip's first frame stays still.
 */
export function VideoMontage({ clips, className = "" }: { clips: string[]; className?: string }) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLVideoElement | null)[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const visible = useRef(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const io = new IntersectionObserver(([e]) => {
      visible.current = e.isIntersecting;
      const v = refs.current[active]; if (!v || reduced) return;
      if (e.isIntersecting) v.play().catch(() => {}); else v.pause();
    }, { threshold: 0.1 });
    if (root.current) io.observe(root.current);
    return () => io.disconnect();
  }, [active]);

  useEffect(() => {
    const v = refs.current[active]; if (!v) return;
    const next = (active + 1) % clips.length; const nv = refs.current[next];
    if (nv) nv.preload = "auto";
    v.currentTime = 0; if (visible.current) v.play().catch(() => {});
    // start the crossfade ~1s before the clip ends
    const onTime = () => { if (v.duration && v.currentTime > v.duration - 1.05) { v.removeEventListener("timeupdate", onTime); setActive(next); } };
    v.addEventListener("timeupdate", onTime);
    return () => v.removeEventListener("timeupdate", onTime);
  }, [active, clips.length]);

  return (
    <div ref={root} className={`absolute inset-0 ${className}`}>
      {clips.map((src, i) => (
        <video key={src} ref={(el) => { refs.current[i] = el; }} src={src} muted playsInline preload={i === 0 ? "auto" : "none"}
          className={`absolute inset-0 size-full object-cover transition-opacity duration-1000 ease-in-out ${i === active ? "opacity-100" : "opacity-0"}`} />
      ))}
    </div>
  );
}
