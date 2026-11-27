/**
 * Wireframe overlay for the hero's 3D panel stack: rounded outline, contour lines, triangle markers, binary labels and dotted leaders.
 * Drawn from scratch (deterministic pseudo-random) to echo the look of scale.com's annotation layers, not copied from it.
 */
function rng(seed: number) { let s = seed; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; }

export function Wireframe({ seed = 1, variant = "outline", className = "" }: { seed?: number; variant?: "outline" | "contour" | "markers" | "links" | "diamonds"; className?: string }) {
  const r = rng(seed * 9301 + 49297); const W = 1600, H = 900;
  const tri = (x: number, y: number, k: number) => <path key={k} d={`M${x} ${y} l18 6 l-12 12 z`} />;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={`absolute inset-0 size-full overflow-visible ${className}`} fill="none" stroke="currentColor" aria-hidden>
      <rect x="2" y="2" width={W - 4} height={H - 4} rx="56" strokeWidth="2.5" />
      {variant === "contour" && Array.from({ length: 7 }, (_, k) => {
        const cx = 200 + r() * 1200, cy = 150 + r() * 600; let d = "";
        for (let a = 0; a <= 24; a++) { const t = (a / 24) * Math.PI * 2; const rad = 60 + r() * 140; d += `${a ? "L" : "M"}${(cx + Math.cos(t) * rad * 1.6).toFixed(0)} ${(cy + Math.sin(t) * rad).toFixed(0)} `; }
        return <path key={k} d={d + "Z"} strokeWidth="1.6" opacity=".8" />;
      })}
      {(variant === "markers" || variant === "contour") && (
        <g strokeWidth="2">
          {Array.from({ length: 22 }, (_, k) => tri(120 + r() * 1360, 90 + r() * 720, k))}
          {Array.from({ length: 9 }, (_, k) => { const y = 120 + r() * 660; return <path key={`l${k}`} d={`M${-140 - r() * 160} ${y} H${120 + r() * 500}`} strokeDasharray="3 9" strokeWidth="2" opacity=".7" />; })}
        </g>
      )}
      {variant === "links" && (
        <g strokeWidth="2.2">
          {Array.from({ length: 8 }, (_, k) => { const y1 = 160 + k * 80; const y2 = 140 + r() * 620;
            return <g key={k}><path d={`M200 ${y1} C ${700 + r() * 200} ${y1 - 120}, ${900 + r() * 200} ${y2 + 140}, 1420 ${y2}`} /><circle cx="1420" cy={y2} r="9" /><path d={`M${1460} ${y2 - 18} l24 18 l-24 18 l-24 -18 z`} /></g>; })}
        </g>
      )}
      {variant === "diamonds" && (
        <g strokeWidth="2">
          {Array.from({ length: 6 }, (_, ry) => Array.from({ length: 9 }, (_, cx) => { if (r() < 0.35) return null; const x = 260 + cx * 140, y = 130 + ry * 130;
            return <rect key={`${ry}-${cx}`} x={x - 14} y={y - 14} width="28" height="28" rx="7" transform={`rotate(45 ${x} ${y})`} />; }))}
          {Array.from({ length: 7 }, (_, k) => <text key={`t${k}`} x={300 + r() * 1100} y={110 + r() * 700} fill="currentColor" stroke="none" fontFamily="ui-monospace, monospace" fontSize="22" opacity=".7">{["||", "1 0 0", "| |", "01"][k % 4]}</text>)}
        </g>
      )}
      {variant !== "outline" && variant !== "diamonds" && (
        <g fill="currentColor" stroke="none" fontFamily="ui-monospace, monospace" fontSize="30" opacity=".75">
          {Array.from({ length: 6 }, (_, k) => <text key={k} x={1480 - r() * 1300} y={120 + r() * 680}>{["0110", "1011", "01", "111", "1000", "0011"][k]}</text>)}
        </g>
      )}
    </svg>
  );
}
