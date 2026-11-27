"use client";
import { useEffect, useState } from "react";
import { prefersReducedMotion } from "@/lib/motion/core";

/**
 * "Detection machine" story layers for the hero (illustrative overlays; boxes are placed by % and do not track the footage):
 *   DetectLayer  : scene 0: scan sweep, boxes appear one by one with confidence, HUD counter
 *   ExtractLayer : scene A: dotted leaders from detections to extracted records
 *   ReachLayer   : scene C: lead boxes + WhatsApp chat bubbles
 * Colours: --accent-2 boxes + neutral white, so with the header CTA at most two accents are on screen.
 */
export type DetectCopy = { status: string; area: string; found: string; sample: string; tags: string[]; focus: string;
  records: { name: string; meta: string }[]; leads: string[]; chats: { from: string; text: string }[] };

const BOXES = [
  { x: 6, y: 58, w: 9, h: 14, c: 0.94 }, { x: 18, y: 63, w: 7, h: 10, c: 0.88 }, { x: 31, y: 55, w: 10, h: 12, c: 0.91 },
  { x: 58, y: 57, w: 8, h: 11, c: 0.86 }, { x: 69, y: 52, w: 11, h: 15, c: 0.97 }, { x: 84, y: 60, w: 8, h: 12, c: 0.9 },
];

function useCounter(to: number, ms = 4200) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (prefersReducedMotion()) { setN(to); return; }
    let raf = 0; let t0 = 0;
    const loop = (t: number) => { if (!t0) t0 = t; const p = ((t - t0) % (ms + 2400)) / ms; setN(Math.round(to * Math.min(1, p))); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop); return () => cancelAnimationFrame(raf);
  }, [to, ms]);
  return n;
}

export function DetectLayer({ copy }: { copy: DetectCopy }) {
  const n = useCounter(128);
  return (
    <div data-boxes className="absolute inset-0">
      {/* scan sweep */}
      <div className="detect-sweep absolute inset-y-0 w-[18%] bg-gradient-to-r from-transparent via-accent-2/15 to-transparent" />
      {BOXES.map((b, i) => (
        <div key={i} className="detect-box absolute border-[1.5px] border-accent-2 bg-accent-2/10" style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%`, animationDelay: `${0.4 + i * 0.55}s` }}>
          <span className="absolute -top-px left-0 -translate-y-full whitespace-nowrap bg-accent-2 px-1.5 py-0.5 font-mono text-[11px] leading-none text-ink">{copy.tags[i % copy.tags.length]} {b.c.toFixed(2)}</span>
          <span className="absolute -left-1 -top-1 size-2 border-l-2 border-t-2 border-fg" /><span className="absolute -bottom-1 -right-1 size-2 border-b-2 border-r-2 border-fg" />
        </div>
      ))}
      <div className="detect-box absolute border-[1.5px] border-fg/80 bg-fg/10" style={{ left: "40%", top: "62%", width: "15%", height: "22%", animationDelay: "3.8s" }}>
        <span className="absolute -top-px left-0 -translate-y-full whitespace-nowrap bg-fg px-1.5 py-0.5 font-mono text-[11px] leading-none text-ink">{copy.focus}</span>
      </div>
      {/* HUD */}
      <div className="absolute left-[3%] top-[6%] flex flex-col gap-1 font-mono text-[11px] uppercase leading-none tracking-wider text-fg">
        <span className="flex items-center gap-2"><span className="detect-dot size-1.5 rounded-full bg-accent-2" />{copy.status} · {copy.area}</span>
        <span className="text-fg/70">{copy.found}: <b className="tabular-nums text-fg">{n}</b></span>
      </div>
      <span className="absolute bottom-[4%] right-[3%] font-mono text-[10px] uppercase tracking-wider text-fg/60">{copy.sample}</span>
      <style>{`
        .detect-box{opacity:0;animation:detect-in 8s var(--ease-expo) infinite}
        @keyframes detect-in{0%{opacity:0;transform:scale(1.25)}6%{opacity:1;transform:scale(1)}80%{opacity:1}92%,100%{opacity:0}}
        .detect-sweep{animation:detect-sweep 4s linear infinite}@keyframes detect-sweep{from{left:-18%}to{left:100%}}
        .detect-dot{animation:detect-blink 1s steps(2) infinite}@keyframes detect-blink{50%{opacity:.2}}
        @media (prefers-reduced-motion: reduce){.detect-box{animation:none;opacity:1}.detect-sweep,.detect-dot{animation:none}}
      `}</style>
    </div>
  );
}

/** Scene A: leaders from three detections to extracted records (built at viewport scale; the 3D panel shows it at ~half size). */
export function ExtractLayer({ copy }: { copy: DetectCopy }) {
  const from = [BOXES[0], BOXES[2], BOXES[4]];
  return (
    <div data-extract className="absolute inset-0">
      <svg className="absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        {from.map((b, i) => <path key={i} d={`M${b.x + b.w / 2} ${b.y} C ${b.x + b.w / 2} ${20 + i * 6}, 60 ${14 + i * 14}, 64 ${14 + i * 14}`} stroke="#f5f5f7" strokeWidth=".25" strokeDasharray="1 1.2" fill="none" vectorEffect="non-scaling-stroke" />)}
      </svg>
      <div className="absolute right-[4%] top-[8%] flex w-[32%] flex-col gap-4">
        {copy.records.map((r) => (
          <div key={r.name} className="rounded-xl border border-fg/30 bg-ink/75 p-5 font-mono text-fg backdrop-blur">
            <p className="text-[26px] leading-tight">{r.name}</p>
            <p className="mt-2 text-[20px] text-fg/70">{r.meta}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Scene C: reach. Lead detections + WhatsApp bubbles over the Bundaran HI footage. */
export function ReachLayer({ copy }: { copy: DetectCopy }) {
  return (
    <div className="absolute inset-0">
      {[{ x: 12, y: 55, w: 10, h: 20 }, { x: 70, y: 60, w: 9, h: 18 }].map((b, i) => (
        <div key={i} className="absolute border-2 border-fg bg-fg/10" style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%` }}>
          <span className="absolute -top-px left-0 -translate-y-full whitespace-nowrap bg-fg px-2 py-1 font-mono text-[20px] leading-none text-ink">{copy.leads[i]}</span>
        </div>
      ))}
      <div className="absolute left-[30%] top-[10%] flex w-[40%] flex-col gap-4">
        {copy.chats.map((c, i) => (
          <div key={i} className={`max-w-[85%] rounded-2xl px-6 py-4 text-[24px] leading-snug ${i % 2 ? "self-end rounded-br-sm bg-fg text-ink" : "self-start rounded-bl-sm bg-ink/80 text-fg backdrop-blur"}`}>
            <p className="mb-1 font-mono text-[16px] uppercase tracking-wider opacity-70">{c.from}</p>{c.text}
          </div>
        ))}
      </div>
    </div>
  );
}
