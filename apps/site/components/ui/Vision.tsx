"use client";
import { useEffect, useRef } from "react";

/**
 * Live analysis of the hero video (Canvas 2D, no WebGL). About 30×/s the current frame is downsampled to 160×90 and we derive:
 *   - edges: blurred Sobel magnitude, top ~9% pixels → the white line-drawing on the back layer
 *   - features: strongest, well-spaced gradient points, tracked frame to frame → wires to the node column on the front layer
 * Real object tracks (cars, people, boats…) come from an offline COCO-SSD pass (research/scripts/track-videos.cjs) and are
 * replayed in sync with video.currentTime, so labels are what is actually in the footage.
 * Strokes fade over a few frames instead of being cleared, so scene cuts in the montage dissolve smoothly.
 */
const GW = 160, GH = 90;
type Frame = { edges: Uint8Array; points: [number, number, number][]; segs: number[][]; scene: number };
// scene-cut detection state
let prevL: Float32Array | null = null; let scene = 0; let lastCut = 0;
const LEVELS = [[0.28, 0.5], [0.22, 0.4, 0.6], [0.45], [0.3, 0.36], [0.2, 0.45, 0.7]];
type Sub = (f: Frame, v: HTMLVideoElement) => void;

const subs = new Set<Sub>(); let running = false; let last = 0; let adopted = 0; let drawn = 0; let frame: Frame | null = null;
let work: HTMLCanvasElement | null = null;
const video = () => document.querySelector<HTMLVideoElement>("[data-hero-video]");

function analyse(v: HTMLVideoElement): Frame | null {
  if (v.readyState < 2) return null;
  if (!work) { work = document.createElement("canvas"); work.width = GW; work.height = GH; }
  const ctx = work.getContext("2d", { willReadFrequently: true })!;
  ctx.filter = "blur(1px)"; ctx.drawImage(v, 0, 0, GW, GH); ctx.filter = "none";
  const d = ctx.getImageData(0, 0, GW, GH).data; const L = new Float32Array(GW * GH);
  for (let i = 0; i < GW * GH; i++) L[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255;
  if (prevL) { let diff = 0; for (let i = 0; i < GW * GH; i += 3) diff += Math.abs(L[i] - prevL[i]); diff /= GW * GH / 3;
    const now = performance.now(); if (diff > 0.09 && now - lastCut > 900) { scene++; lastCut = now; } }
  prevL = L;
  const G = new Float32Array(GW * GH); const hist = new Uint32Array(64);
  for (let y = 1; y < GH - 1; y++) for (let x = 1; x < GW - 1; x++) {
    const i = y * GW + x;
    const gx = L[i - GW + 1] + 2 * L[i + 1] + L[i + GW + 1] - L[i - GW - 1] - 2 * L[i - 1] - L[i + GW - 1];
    const gy = L[i + GW - 1] + 2 * L[i + GW] + L[i + GW + 1] - L[i - GW - 1] - 2 * L[i - GW] - L[i - GW + 1];
    const g = Math.min(1, Math.hypot(gx, gy) / 2); G[i] = g; hist[Math.min(63, Math.floor(g * 64))]++;
  }
  // adaptive threshold: keep the strongest ~9% of edge pixels whatever the scene brightness
  let acc = 0, thr = 63; const target = GW * GH * 0.09; while (thr > 1 && acc + hist[thr] < target) { acc += hist[thr]; thr--; }
  const t = thr / 64; const edges = new Uint8Array(GW * GH);
  for (let i = 0; i < GW * GH; i++) if (G[i] > t) edges[i] = 1;
  // features: local maxima, spaced
  const cand: [number, number, number][] = [];
  for (let y = 4; y < GH - 4; y += 3) for (let x = 6; x < GW - 6; x += 3) { const g = G[y * GW + x]; if (g > t * 1.3) cand.push([x / GW, y / GH, g]); }
  cand.sort((a, b) => b[2] - a[2]);
  const points: [number, number, number][] = [];
  for (const c of cand) { if (points.every((p) => Math.hypot(p[0] - c[0], (p[1] - c[1]) * 0.56) > 0.07)) points.push(c); if (points.length >= 24) break; }
  const CW = GW / 2, CH = GH / 2; const C = (x: number, y: number) => L[(y * 2) * GW + x * 2]; const segs: number[][] = [];
  for (const lv of LEVELS[scene % LEVELS.length]) for (let y = 0; y < CH - 1; y++) for (let x = 0; x < CW - 1; x++) {
    const tl = C(x, y), tr = C(x + 1, y), br = C(x + 1, y + 1), bl = C(x, y + 1);
    const k = (tl > lv ? 8 : 0) | (tr > lv ? 4 : 0) | (br > lv ? 2 : 0) | (bl > lv ? 1 : 0); if (k === 0 || k === 15) continue;
    const f = (a: number, b: number) => (lv - a) / (b - a || 1e-6);
    const T = [(x + f(tl, tr)) / (CW - 1), y / (CH - 1)], Rr = [(x + 1) / (CW - 1), (y + f(tr, br)) / (CH - 1)], B = [(x + f(bl, br)) / (CW - 1), (y + 1) / (CH - 1)], Lf = [x / (CW - 1), (y + f(tl, bl)) / (CH - 1)];
    const add = (p: number[], q: number[]) => segs.push([p[0], p[1], q[0], q[1]]);
    switch (k) { case 1: case 14: add(Lf, B); break; case 2: case 13: add(B, Rr); break; case 3: case 12: add(Lf, Rr); break; case 4: case 11: add(T, Rr); break; case 5: add(Lf, T); add(B, Rr); break; case 6: case 9: add(T, B); break; case 7: case 8: add(Lf, T); break; case 10: add(T, Rr); add(Lf, B); break; }
  }
  return { edges, points, segs, scene };
}

function loop(t: number) {
  if (!subs.size) { running = false; return; }
  const v = video();
  if (v && t - last > 125) { last = t; const f = analyse(v);
    // new pattern immediately on a scene cut; otherwise only every 600ms so it follows the footage slowly instead of jittering
    if (f && (!frame || f.scene !== frame.scene || t - adopted > 600)) { frame = f; adopted = t; } }
  if (v && frame && t - drawn > 33) { drawn = t; const fr = frame; subs.forEach((s) => s(fr, v)); }
  requestAnimationFrame(loop);
}
function subscribe(s: Sub) { subs.add(s); if (!running) { running = true; requestAnimationFrame(loop); } return () => { subs.delete(s); }; }

type Smooth = { points: Frame["points"] };
function useVisionCanvas(draw: (ctx: CanvasRenderingContext2D, f: Frame, w: number, h: number, sm: Smooth, v: HTMLVideoElement) => void, trail = 0.3) {
  const ref = useRef<HTMLCanvasElement>(null); const drawRef = useRef(draw); drawRef.current = draw;
  useEffect(() => {
    const c = ref.current; if (!c || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const sm: Smooth = { points: [] }; let unsub: (() => void) | null = null;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !unsub) unsub = subscribe((f, v) => {
        const dpr = Math.min(2, window.devicePixelRatio || 1); const w = c.clientWidth, h = c.clientHeight;
        if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
        const ctx = c.getContext("2d")!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (trail > 0) { ctx.globalCompositeOperation = "destination-out"; ctx.fillStyle = `rgba(0,0,0,${trail})`; ctx.fillRect(0, 0, w, h); ctx.globalCompositeOperation = "source-over"; }
        else ctx.clearRect(0, 0, w, h);
        // track feature points across frames (lerp to nearest previous point) so wires glide instead of jumping
        sm.points = f.points.map((p, i) => { const o = sm.points[i]; return o && Math.hypot(o[0] - p[0], o[1] - p[1]) < 0.6 ? [o[0] + (p[0] - o[0]) * 0.12, o[1] + (p[1] - o[1]) * 0.12, p[2]] : p; });
        drawRef.current(ctx, f, w, h, sm, v);
      });
      else if (!e.isIntersecting && unsub) { unsub(); unsub = null; }
    });
    io.observe(c);
    return () => { io.disconnect(); unsub?.(); };
  }, [trail]);
  return ref;
}

/** Back layer: line drawing of the video's edges. */
export function EdgeLayer() {
  const ref = useVisionCanvas((ctx, f, w, h) => {
    const sx = w / GW, sy = h / GH; ctx.fillStyle = "rgba(245,245,247,.55)";
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (f.edges[y * GW + x]) ctx.fillRect(x * sx, y * sy, Math.max(1, sx * 0.45), Math.max(1, sy * 0.45));
  }, 0.08);
  return <canvas ref={ref} aria-hidden className="absolute inset-0 size-full" />;
}

const BIN = ["01", "0110", "1011", "111", "1000", "0011", "11", "010", "1110"];
/**
 * Front layer: bundled wires. ~12 tracked video features converge on 5 target nodes with S-curves,
 * as in scale.com's data scene. Nodes: ring + centre dot + binary tag.
 */
const NODE_SETS: [number, number][][] = [
  [[0.86, 0.16], [0.86, 0.34], [0.86, 0.52], [0.86, 0.7], [0.86, 0.86]],   // column right
  [[0.6, 0.16], [0.54, 0.4], [0.66, 0.56], [0.84, 0.33], [0.8, 0.66]],    // cluster
  [[0.55, 0.12], [0.67, 0.08], [0.79, 0.1], [0.9, 0.18], [0.95, 0.3]],    // arc over the top
  [[0.55, 0.85], [0.64, 0.66], [0.73, 0.48], [0.82, 0.3], [0.91, 0.12]],  // diagonal
  [[0.62, 0.28], [0.9, 0.2], [0.7, 0.72], [0.93, 0.6], [0.78, 0.45]],     // scattered
];
const nodeState: [number, number][] = NODE_SETS[0].map((n) => [...n] as [number, number]);
export function WireLayer() {
  const ref = useVisionCanvas((ctx, _f, w, h, sm) => {
    const target = NODE_SETS[_f.scene % NODE_SETS.length];
    nodeState.forEach((n, k) => { n[0] += (target[k][0] - n[0]) * 0.1; n[1] += (target[k][1] - n[1]) * 0.1; });
    const NODES = nodeState; const count = [6, 5, 4, 6, 5][_f.scene % 5];
    const pts = sm.points.slice(0, count);
    ctx.lineWidth = 1; ctx.strokeStyle = "rgba(245,245,247,.45)"; ctx.fillStyle = "rgba(245,245,247,.7)"; ctx.font = "18px ui-monospace, monospace";
    pts.forEach(([x, y], i) => {
      const [tx, ty] = NODES[i % NODES.length]; const px = x * w * 0.55, py = y * h, nx = tx * w, ny = ty * h; const bend = (i % 2 ? 1 : -1) * 0.08 * h;
      ctx.save(); ctx.setLineDash([10, 14]); ctx.lineDashOffset = -performance.now() * 0.03 - i * 7;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.bezierCurveTo(px + 0.16 * w, py + bend, nx - 0.18 * w, ny - bend, nx, ny); ctx.stroke(); ctx.restore();
      ctx.beginPath(); ctx.arc(px, py, 3.5, 0, Math.PI * 2); ctx.fill();
    });
    NODES.forEach(([tx, ty], k) => {
      const nx = tx * w, ny = ty * h;
      const pulse = 11 + Math.sin(performance.now() / 700 + k) * 2.5;
      ctx.beginPath(); ctx.arc(nx, ny, pulse, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(nx, ny, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillText(BIN[k % BIN.length], nx + 18, ny - 14);
    });
  }, 0.09);
  return <canvas ref={ref} aria-hidden className="absolute inset-0 size-full" />;
}

/** Object tracks from the offline detector: boxes + motion trails, synced to video time. */
type Track = { id: number; cls: string; f0: number; boxes: number[][] };
export function TrackLayer({ src, labels }: { src: string; labels: Record<string, string> }) {
  const data = useRef<{ fps: number; tracks: Track[] } | null>(null);
  useEffect(() => { fetch(src).then((r) => r.json()).then((d) => { d.tracks = d.tracks.filter((t: Track) => t.boxes.reduce((a, b) => a + b[4], 0) / t.boxes.length >= 0.4); data.current = d; }).catch(() => {}); }, [src]);
  const ref = useVisionCanvas((ctx, _f, w, h, _sm, v) => {
    const d = data.current; if (!d) return; const ft = v.currentTime * d.fps;
    ctx.font = "12px ui-monospace, monospace"; ctx.textBaseline = "top";
    for (const t of d.tracks) {
      const k = ft - t.f0; if (k < 0 || k > t.boxes.length - 1) continue;
      const i = Math.floor(k), r = k - i, a = t.boxes[i], b = t.boxes[Math.min(i + 1, t.boxes.length - 1)];
      const [x, y, bw, bh, s] = a.map((v0, n) => v0 + (b[n] - v0) * r);
      const vehicle = ["car", "truck", "bus", "motorcycle", "boat", "bicycle"].includes(t.cls); const col = vehicle ? "#ff6b4a" : "rgba(245,245,247,.95)";
      // trail: last ~1s of box centres
      ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath();
      for (let j = Math.max(0, i - 10); j <= i; j++) { const q = t.boxes[j]; const cx = (q[0] + q[2] / 2) * w, cy = (q[1] + q[3]) * h; if (j === Math.max(0, i - 10)) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy); }
      ctx.stroke();
      ctx.lineWidth = 1.5; ctx.strokeRect(x * w, y * h, bw * w, bh * h);
      const label = `${labels[t.cls] ?? t.cls} #${t.id} ${s.toFixed(2)}`; const tw = ctx.measureText(label).width + 10;
      ctx.fillStyle = col; ctx.fillRect(x * w - 0.75, y * h - 17, tw, 17); ctx.fillStyle = "#0a0a0f"; ctx.fillText(label, x * w + 4, y * h - 14);
    }
  }, 0);
  return <canvas ref={ref} aria-hidden className="absolute inset-0 size-full" />;
}

/** Front layer: topographic contour lines traced from the video (two luminance levels). */
export function ContourLayer() {
  const ref = useVisionCanvas((ctx, f, w, h) => {
    ctx.strokeStyle = "rgba(245,245,247,.55)"; ctx.lineWidth = 1.1; ctx.beginPath();
    for (const g of f.segs) { ctx.moveTo(g[0] * w, g[1] * h); ctx.lineTo(g[2] * w, g[3] * h); }
    ctx.stroke();
  }, 0.07);
  return <canvas ref={ref} aria-hidden className="absolute inset-0 size-full" />;
}

/** Front layer: triangle markers on tracked features, dotted leaders from the left edge, binary labels. */
export function MarkerLayer() {
  const ref = useVisionCanvas((ctx, _f, w, h, sm) => {
    ctx.strokeStyle = "rgba(245,245,247,.9)"; ctx.fillStyle = "rgba(245,245,247,.8)"; ctx.lineWidth = 1.8; ctx.font = "22px ui-monospace, monospace";
    sm.points.forEach(([x, y], i) => {
      const px = x * w, py = y * h;
      const shape = _f.scene % 5; ctx.beginPath();
      if (shape === 0) { ctx.moveTo(px, py); ctx.lineTo(px + 20, py + 7); ctx.lineTo(px + 6, py + 20); ctx.closePath(); }
      else if (shape === 1) { ctx.moveTo(px, py - 11); ctx.lineTo(px + 11, py); ctx.lineTo(px, py + 11); ctx.lineTo(px - 11, py); ctx.closePath(); }
      else if (shape === 2) { ctx.moveTo(px - 12, py); ctx.lineTo(px + 12, py); ctx.moveTo(px, py - 12); ctx.lineTo(px, py + 12); }
      else if (shape === 3) { ctx.moveTo(px - 8, py - 12); ctx.lineTo(px - 12, py - 12); ctx.lineTo(px - 12, py + 12); ctx.lineTo(px - 8, py + 12); ctx.moveTo(px + 8, py - 12); ctx.lineTo(px + 12, py - 12); ctx.lineTo(px + 12, py + 12); ctx.lineTo(px + 8, py + 12); }
      else { ctx.arc(px, py, 9, 0, Math.PI * 2); }
      ctx.stroke();
      if (i % 3 === 0) { ctx.save(); ctx.setLineDash([2, 9]); ctx.globalAlpha = 0.65; ctx.beginPath(); ctx.moveTo(-0.06 * w, py); ctx.lineTo(px - 4, py); ctx.stroke(); ctx.restore(); }
      if (i % 4 === 1) ctx.fillText(BIN[i % BIN.length], px + 26, py + 4);
    });
  }, 0.08);
  return <canvas ref={ref} aria-hidden className="absolute inset-0 size-full" />;
}
