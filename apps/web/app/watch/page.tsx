"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import "./watch.css";
import { useShell } from "@/components/Shell";
import { clean, dec, postJson } from "@/lib/biz";

type ChgItem = { name: string; maps_url?: string; reviews?: number; delta?: number };
type Changes = { new: ChgItem[]; rating_down: ChgItem[]; rating_up: ChgItem[]; reviews_jump: ChgItem[]; gone: ChgItem[] };
type Item = {
  industry: string;
  area: string;
  businesses: number;
  created: string;
  prev_created?: string;
  report_id: number;
  watch?: { last_run?: string; every_days?: number } | null;
  changes?: Changes | null;
};

const fmt = (d: string | Date) => new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

export default function WatchPage() {
  const { toast } = useShell();
  const router = useRouter();
  const [data, setData] = useState<Item[] | null>(null);
  const load = useCallback(async () => setData(await (await fetch("/watch/data")).json()), []);
  useEffect(() => {
    load();
  }, [load]);
  if (!data) return <div className="wrap watchp" />;

  const toggle = async (x: Item) => {
    await postJson("/market/watch", { industry: x.industry, area: x.area, on: !x.watch, last_run: x.created });
    toast(x.watch ? "Pantauan dimatikan" : "Dipantau tiap 7 hari");
    load();
  };
  const rerun = async (x: Item) => {
    const { ok, j } = await postJson("/market/run", { industry: x.industry, area: x.area });
    if (!ok) {
      toast(j.error as string);
      return;
    }
    router.push("/market");
  };

  const on = data.filter((x) => x.watch),
    off = data.filter((x) => !x.watch);
  return (
    <div className="wrap watchp">
      <h1>Pantau</h1>
      <p className="lead">
        Wilayah yang dipantau diriset ulang otomatis selama aplikasi ini menyala. Di sini terlihat apa yang berubah: pesaing baru, rating naik atau turun, dan
        bisnis yang sedang ramai.
      </p>
      {!data.length ? (
        <div className="empty-cta">
          <b>Belum ada yang dipantau</b>Riset satu industri dan wilayah dulu, lalu klik &quot;Pantau mingguan&quot;.
          <div>
            <Link className="btn" href="/market">
              Mulai riset
            </Link>
          </div>
        </div>
      ) : (
        <>
          {on.length > 0 && <div className="sec-h">Dipantau ({on.length})</div>}
          {on.map((x) => (
            <WatchItem key={x.report_id} x={x} onToggle={() => toggle(x)} onRun={() => rerun(x)} />
          ))}
          {off.length > 0 && <div className="sec-h">Riset lain ({off.length})</div>}
          {off.map((x) => (
            <WatchItem key={x.report_id} x={x} onToggle={() => toggle(x)} onRun={() => rerun(x)} />
          ))}
        </>
      )}
    </div>
  );
}

function List({ title, rows, show, cls }: { title: string; rows: ChgItem[]; show: (p: ChgItem) => React.ReactNode; cls?: string }) {
  if (!rows.length) return null;
  return (
    <div>
      <h4>
        {title} ({rows.length})
      </h4>
      <ul>
        {rows.slice(0, 6).map((p, i) => (
          <li key={i}>
            <a target="_blank" href={p.maps_url || "#"}>
              {clean(p.name)}
            </a>
            <em className={cls}>{show(p)}</em>
          </li>
        ))}
      </ul>
    </div>
  );
}

function WatchItem({ x, onToggle, onRun }: { x: Item; onToggle: () => void; onRun: () => void }) {
  const c = x.changes,
    w = x.watch;
  const next = w ? new Date(new Date(w.last_run || x.created).getTime() + (w.every_days || 7) * 864e5) : null;
  const tot = c ? Object.values(c).reduce((a, v) => a + v.length, 0) : 0;
  return (
    <div className="item">
      <div className="item-h">
        <div className="t">
          <b>
            {x.industry} · {x.area}
          </b>
          <span>
            {x.businesses} bisnis · riset terakhir {fmt(x.created)}
            {next ? " · berikutnya " + fmt(next) : ""}
          </span>
        </div>
        <div className="acts">
          <Link className="btn ghost" href={"/market?id=" + x.report_id}>
            Buka laporan
          </Link>
          <button className="btn ghost" onClick={onRun}>
            Riset ulang
          </button>
          <button className={"btn ghost watch" + (w ? " on" : "")} onClick={onToggle}>
            {w ? "✓ Dipantau" : "+ Pantau mingguan"}
          </button>
        </div>
      </div>
      {c ? (
        <>
          <div className="sum">
            {tot ? (
              <>
                {c.new.length > 0 && <span className="down">{c.new.length} pesaing baru</span>}
                {c.rating_down.length > 0 && <span className="up">{c.rating_down.length} rating turun</span>}
                {c.rating_up.length > 0 && <span>{c.rating_up.length} rating naik</span>}
                {c.reviews_jump.length > 0 && <span>{c.reviews_jump.length} makin ramai</span>}
                {c.gone.length > 0 && <span>{c.gone.length} hilang dari Maps</span>}
              </>
            ) : (
              <span>Tidak ada perubahan berarti</span>
            )}{" "}
            <span>dibanding {x.prev_created ? fmt(x.prev_created) : "-"}</span>
          </div>
          {tot > 0 && (
            <div className="chg">
              <List title="Pesaing baru" rows={c.new} show={(p) => `${p.reviews} ulasan`} />
              <List title="Rating turun (peluang)" rows={c.rating_down} cls="down" show={(p) => dec(p.delta)} />
              <List title="Rating naik" rows={c.rating_up} cls="up" show={(p) => "+" + dec(p.delta)} />
              <List title="Makin ramai" rows={c.reviews_jump} cls="up" show={(p) => `+${p.delta} ulasan`} />
              <List title="Hilang dari Maps" rows={c.gone} show={() => ""} />
            </div>
          )}
        </>
      ) : (
        <div className="wait">
          Perubahan akan terlihat setelah wilayah ini diriset lagi
          {next ? ", terjadwal " + fmt(next) : ". Aktifkan pantau mingguan atau riset ulang sekarang"}.
        </div>
      )}
    </div>
  );
}
