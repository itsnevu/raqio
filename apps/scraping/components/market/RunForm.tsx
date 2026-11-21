"use client";
import { useState } from "react";
import { looksLikeSelf } from "@/lib/market/verdict";
import type { Goal, Mode, RunArgs } from "@/lib/market/types";
import AreaPicker from "./AreaPicker";
import AreaChips from "./AreaChips";

export type Suggestion = { industry: string; area: string; businesses: number };

type Props = {
  mode: Mode; goal: Goal; industry: string; area: string; running: boolean; suggest: Suggestion[]; areaOptions?: string[];
  onMode: (m: Mode) => void; onGoal: (g: Goal) => void; onIndustry: (v: string) => void; onArea: (v: string) => void;
  onRun: (args: RunArgs) => void;
};

export default function RunForm({ mode, goal, industry, area, running, suggest, areaOptions = [], onMode, onGoal, onIndustry, onArea, onRun }: Props) {
  const selfWarn = goal === "client" && looksLikeSelf(industry);
  const [showMap, setShowMap] = useState(false);
  // dari peta: mode satu wilayah mengganti isian; mode bandingkan menambah ke daftar (tanpa duplikat)
  const pickArea = (name: string) => {
    if (mode !== "cmp") { onArea(name); return; }
    const parts = area.split(/[;\n]/).map((s) => s.trim()).filter(Boolean);
    if (!parts.some((p) => p.toLowerCase() === name.toLowerCase())) parts.push(name);
    onArea(parts.join("; "));
  };
  return (
    <>
      {suggest.length > 0 && !running && (
        <div className="suggest" role="group" aria-label="Hasil instan">
          <span className="suggest-l">Coba instan:</span>
          {suggest.slice(0, 8).map((x) => (
            <button key={x.industry + x.area} type="button" className="chip" title={`${x.businesses} bisnis, hasil langsung tanpa menunggu`}
              onClick={() => { onMode("one"); onIndustry(x.industry); onArea(x.area); onRun({ industry: x.industry, area: x.area, fresh: false, mode: "one" }); }}>
              {x.industry} · {x.area}
            </button>
          ))}
        </div>
      )}
      <div className="mode" role="group" aria-label="Mode riset">
        <button type="button" className={mode === "one" ? "on" : ""} aria-pressed={mode === "one"} onClick={() => onMode("one")}>Satu wilayah</button>
        <button type="button" className={mode === "cmp" ? "on" : ""} aria-pressed={mode === "cmp"} onClick={() => onMode("cmp")}>Bandingkan wilayah</button>
      </div>
      <fieldset className="goal">
        <legend className="sr-only">Tujuan riset</legend>
        <label className={goal === "client" ? "on" : ""}>
          <input type="radio" name="goal" value="client" checked={goal === "client"} onChange={() => onGoal("client")} />
          <div><b>Cari calon klien</b><span>Isi industri bisnis yang mau kamu tawari. Contoh: kamu agency, isi &quot;coffee shop&quot; atau &quot;klinik gigi&quot;.</span></div>
        </label>
        <label className={goal === "rival" ? "on" : ""}>
          <input type="radio" name="goal" value="rival" checked={goal === "rival"} onChange={() => onGoal("rival")} />
          <div><b>Pelajari pesaing</b><span>Isi industri bisnismu sendiri. Contoh: kamu agency, isi &quot;digital agency&quot;. Hasilnya pesaing, bukan klien.</span></div>
        </label>
      </fieldset>
      {selfWarn && (
        <div className="goalwarn" style={{ display: "block" }} role="note">
          &quot;{industry}&quot; terdengar seperti bisnismu sendiri. Bisnis di industri ini akan dianggap calon klien. Kalau maksudmu mau lihat pesaing,{" "}
          <button type="button" onClick={() => onGoal("rival")}>ganti ke Pelajari pesaing</button>.
        </div>
      )}
      <form className="search" onSubmit={(e) => { e.preventDefault(); onRun({ industry, area, fresh: false, mode }); }}>
        <input value={industry} onChange={(e) => onIndustry(e.target.value)} aria-label="Industri" placeholder="Industri, mis. coffee shop, salon, digital agency" required autoComplete="off" />
        <span className="sep" />
        {mode === "cmp" ? (
          <AreaChips value={area} onChange={onArea} options={areaOptions} placeholder="Wilayah, Enter untuk menambah. Contoh: Kemang Jakarta" />
        ) : (
          <input value={area} onChange={(e) => onArea(e.target.value)} aria-label="Wilayah" placeholder="Wilayah, mis. Kemang Jakarta" required autoComplete="off" />
        )}
        <button type="button" className="mapbtn" aria-pressed={showMap} aria-label="Pilih wilayah lewat peta" onClick={() => setShowMap(!showMap)}>
          {showMap ? "Tutup peta" : "Pilih di peta"}
        </button>
        <button type="submit" className="btn" disabled={running}>{mode === "cmp" ? "Bandingkan" : "Riset"}</button>
      </form>
      {showMap && <AreaPicker onPick={pickArea} />}
    </>
  );
}
