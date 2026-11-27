/**
 * Logo row: scale uses `.pull-apart-logo { background-color: currentColor; mask-image: url(...) }` so logos inherit text colour.
 * Raqio has no customer logos cleared for use, so these are neutral placeholder marks (abstract shapes, not brands).
 */
const marks = [
  "M2 12a10 10 0 1 0 20 0 10 10 0 0 0-20 0Zm6 0h8",
  "M3 3h18v18H3zM8 8h8v8H8z",
  "M12 2 22 20H2L12 2Z",
  "M4 6h16M4 12h10M4 18h16",
  "M12 2a10 10 0 0 1 0 20M12 2a10 10 0 0 0 0 20M2 12h20",
  "M3 12c3-6 6-6 9 0s6 6 9 0",
];
const toMask = (d: string) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='${d}' fill='none' stroke='black' stroke-width='2.2'/></svg>`)}")`;

export function LogoRow({ className = "" }: { className?: string }) {
  return (
    <ul className={`flex items-center justify-center gap-6 text-fg/70 ${className}`} aria-label="Placeholder partner marks">
      {marks.map((d, i) => (
        <li key={i} aria-hidden className="inline-block size-6 bg-current" style={{ maskImage: toMask(d), WebkitMaskImage: toMask(d), maskSize: "contain", maskRepeat: "no-repeat" }} />
      ))}
    </ul>
  );
}
