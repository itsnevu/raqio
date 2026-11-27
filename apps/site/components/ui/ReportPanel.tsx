/**
 * Raqio market report rendered in HTML (the Raqio counterpart of scale.com's leaderboard screen in the hero stack).
 * Built at viewport scale because the 3D panel shrinks it to about half. Businesses are fictional samples.
 */
const ROWS = [
  { n: "Klinik Sehat Sentosa", r: 4.8, v: 1284, s: 92 }, { n: "Dental Care Plus", r: 4.7, v: 962, s: 88 },
  { n: "Klinik Pratama Melati", r: 4.6, v: 811, s: 81 }, { n: "Smile Studio Blok M", r: 4.5, v: 604, s: 76 },
  { n: "Klinik Kita Gandaria", r: 4.4, v: 533, s: 71 }, { n: "Rumah Gigi Senopati", r: 4.3, v: 418, s: 64 },
  { n: "Klinik Bunda Kebayoran", r: 4.1, v: 377, s: 58 }, { n: "Dentalia Pakubuwono", r: 3.9, v: 241, s: 49 },
];
export function ReportPanel({ cols }: { cols: { area: string; business: string; reviews: string; score: string; tabs: string[] } }) {
  return (
    <div className="absolute inset-0 flex flex-col bg-[#d9d9de] p-12 font-mono text-ink">
      <div className="mb-8 flex items-center gap-3 text-[22px]">
        {cols.tabs.map((t, i) => <span key={t} className={`rounded-md px-5 py-2.5 ${i === 0 ? "bg-ink text-fg" : "border border-ink/20"}`}>{t}</span>)}
        <span className="ml-auto text-ink/70">{cols.area}</span>
      </div>
      <div className="grid grid-cols-[60px_1fr_160px_1.3fr] border-b border-ink/20 pb-4 text-[20px] uppercase tracking-wide text-ink/70">
        <span>#</span><span>{cols.business}</span><span>{cols.reviews}</span><span>{cols.score}</span>
      </div>
      {ROWS.map((row, i) => (
        <div key={row.n} className="grid flex-1 grid-cols-[60px_1fr_160px_1.3fr] items-center border-b border-ink/10 text-[24px]">
          <span><span className={`grid size-10 place-items-center rounded ${i < 2 ? "bg-ink text-fg" : "bg-ink/40 text-fg"}`}>{i + 1}</span></span>
          <span>{row.n}</span>
          <span className="text-ink/70">{row.v.toLocaleString("en-US")}</span>
          <span className="flex flex-col gap-2"><span><b>{row.s}</b> <span className="text-ink/60">★ {row.r}</span></span><span className="h-4 rounded-sm bg-ink/70" style={{ width: `${row.s}%`, opacity: 1 - i * 0.07 }} /></span>
        </div>
      ))}
    </div>
  );
}
