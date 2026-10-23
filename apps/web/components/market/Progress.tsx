"use client";
import { useEffect, useRef, useState } from "react";
import { STEPS, etaFor, mmss, parseProgress } from "@/lib/market/progress";

type Props = { log: string; started: number | null; queue?: string[]; onStop: () => Promise<void> | void };

/**
 * Panel progres riset. Angkanya hidup: selagi antre menghitung lama menunggu, begitu worker mulai ada tanda
 * "Worker mulai" dan hitung mundur yang dihitung ulang tiap tahap berganti (bobot tahap di lib/market/progress).
 * Log mentah worker tidak ditampilkan; pengguna cukup melihat tahap dan perkiraan waktu.
 */
export default function Progress({ log, started, queue = [], onStop }: Props) {
  const [stopped, setStopped] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const { step, pct, compare } = parseProgress(log);
  // kapan tahap saat ini (dan kapan tahap pertama) dimulai, menurut jam browser
  const phase = `${compare ? compare.i : 1}:${step}`;
  const phaseRef = useRef<{ key: string; since: number; runSince: number | null }>({ key: phase, since: Date.now(), runSince: null });
  if (phaseRef.current.key !== phase) {
    const t = Date.now();
    phaseRef.current = { key: phase, since: t, runSince: step > 0 ? (phaseRef.current.runSince ?? t) : null };
  }
  const since = phaseRef.current.since, runSince = phaseRef.current.runSince;
  const waitedSec = Math.max(0, Math.round(now / 1000 - (started ?? now / 1000)));
  const justStarted = step > 0 && runSince != null && now - runSince < 6000;
  const eta = etaFor(step, since, compare ? compare.n : 1, compare ? compare.i : 1, now);
  const title = compare ? `Wilayah ${compare.i} dari ${compare.n}: ${compare.area}` : step ? "Riset sedang berjalan" : "Menunggu giliran worker";
  return (
    <div className={"prog" + (step ? " live" : " queued")} role="status" aria-live="polite">
      <div className="prog-h">
        <b>{title}{justStarted && <em className="go"> · Worker mulai!</em>}</b>
        <span className="mono eta-n" style={{ color: step ? "var(--text)" : "var(--muted)" }}>
          {step ? (eta.over ? "hampir selesai…" : `± ${mmss(eta.left)} lagi`) : `menunggu ${mmss(waitedSec)}`}
          {step > 0 && eta.stepOver && !eta.over && <small className="slow"> · tahap ini lebih lama dari biasanya</small>}
          {step > 0 && runSince != null && <small> · berjalan {mmss(Math.round((now - runSince) / 1000))}</small>}
        </span>
        <button
          type="button"
          className="btn ghost"
          disabled={stopped}
          onClick={async () => {
            setStopped(true);
            try {
              await onStop();
            } catch {
              setStopped(false);
            }
          }}
        >
          {stopped ? "Menghentikan…" : "Hentikan"}
        </button>
      </div>
      <div className="prog-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
        <i style={{ width: pct + "%" }} />
      </div>
      <ol>
        {STEPS.map(([k, v], i) => (
          <li key={k} className={i + 1 < step ? "done" : i + 1 === step ? "now" : ""}>{v}</li>
        ))}
      </ol>
      <div className="eta">
        {step === 0 && waitedSec < 90 && <>Worker mengerjakan antrean berurutan. Begitu giliranmu, tahap di atas mulai menyala dan hitung mundur berjalan.</>}
        {step === 0 && waitedSec >= 90 && <>Antrean sedang panjang atau worker belum hidup. Riset ini tetap tersimpan dan jalan begitu worker siap, boleh tinggalkan halaman ini.</>}
        {step > 0 && !eta.over && !eta.stepOver && <>Perkiraan saja, biasanya 2 sampai 4 menit per wilayah. Boleh pindah tab atau halaman, kamu akan diberi tahu saat selesai.</>}
        {step > 0 && !eta.over && eta.stepOver && <>Tahap {step} ({STEPS[step - 1]?.[1]}) memakan waktu lebih dari biasanya, biasanya karena Google Maps lambat merespons. Masih berjalan, sisa tahap lain diperkirakan {mmss(eta.left)}.</>}
        {step > 0 && eta.over && <>Lebih lama dari biasanya, biasanya karena Google Maps lambat merespons. Masih berjalan, tidak perlu diulang.</>}
        {queue.length > 0 && <> Setelah ini antre: {queue.join(", ")}.</>}
      </div>
    </div>
  );
}
