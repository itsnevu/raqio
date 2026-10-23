"use client";
import Link from "next/link";
import type { Report } from "@/lib/market/types";

type Props = {
  R: Report; rival: boolean; watched: boolean; watchBusy: boolean; printHref?: string | null;
  onSwapGoal: () => void; onToggleWatch: () => void; onExport: () => void;
};

export default function ReportHeader({ R, rival, watched, watchBusy, printHref, onSwapGoal, onToggleWatch, onExport }: Props) {
  return (
    <div className="rh">
      <div>
        <h2>{R.industry} · {R.area}</h2>
        <div className="meta">
          Discrape {new Date(R.created).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })} dari Google Maps ·{" "}
          {rival ? <>dilihat sebagai <b className="goal-tag">pesaing</b></> : <>dilihat sebagai <b className="goal-tag">calon klien</b></>}{" "}
          <button type="button" className="mini" style={{ marginLeft: 6 }} onClick={onSwapGoal}>{rival ? "ubah jadi calon klien" : "ubah jadi pesaing"}</button>
        </div>
      </div>
      <div className="acts">
        <button type="button" className={"btn ghost watch" + (watched ? " on" : "")} aria-pressed={watched} disabled={watchBusy} onClick={onToggleWatch}>
          {watched ? "✓ Dipantau mingguan" : "+ Pantau mingguan"}
        </button>
        <button type="button" className="btn ghost" onClick={onExport}>Ekspor CSV</button>
        {printHref && <Link className="btn ghost" href={printHref} target="_blank" rel="noopener">Cetak laporan</Link>}
      </div>
    </div>
  );
}
