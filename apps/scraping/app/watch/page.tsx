"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import "./watch.css";
import ExtLink from "@/components/ExtLink";
import LoadError, { PageSkeleton } from "@/components/LoadError";
import { useToast } from "@/components/Shell";
import { useTour } from "@/components/Tour";
import { apiGet, apiPost, errMsg } from "@/lib/api";
import { clean, dec } from "@/lib/biz";
import { invalidate, REFRESH_MSG, WATCHES_KEY } from "@/lib/cache";
import { WATCH_TOUR } from "@/lib/tours";
import { useRefresh } from "@/lib/useRefresh";

type ChgItem = { name: string; maps_url?: string; reviews?: number; delta?: number };
type Changes = { new: ChgItem[]; rating_down: ChgItem[]; rating_up: ChgItem[]; reviews_jump: ChgItem[]; gone: ChgItem[] };
type Alert = { id: number; report_id: number; industry: string; area: string; severity: number; summary: string; changes: Changes; created_at: string; read_at: string | null };
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
type Loaded = { loading: boolean; error: string | null; data: Item[] | null };

const fmt = (d: string | Date) => new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
const EMPTY: Changes = { new: [], rating_down: [], rating_up: [], reviews_jump: [], gone: [] };
const normChanges = (c?: Changes | null): Changes | null => (c ? { ...EMPTY, ...Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Array.isArray(v) ? v : []])) } : null);

export default function WatchPage() {
  const toast = useToast();
  const router = useRouter();
  const [st, setSt] = useState<Loaded>({ loading: true, error: null, data: null });
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [unread, setUnread] = useState(0);
  const load = useCallback(async () => {
    setSt((s) => ({ ...s, loading: true, error: null }));
    try {
      const d = await apiGet<Item[]>("/watch/data");
      setSt({ loading: false, error: null, data: (Array.isArray(d) ? d : []).map((x) => ({ ...x, changes: normChanges(x.changes) })) });
    } catch (e) {
      setSt({ loading: false, error: errMsg(e, "Data pantauan gagal dimuat."), data: null });
    }
    try {
      const a = await apiGet<{ alerts?: Alert[]; unread?: number }>("/watch/alerts");
      setAlerts(a.alerts || []);
      setUnread(a.unread || 0);
    } catch {
      setAlerts([]);
    }
  }, []);
  const markRead = async (id?: number) => {
    try {
      await apiPost("/watch/alerts/read", id ? { id } : { all: true });
      void load();
    } catch (e) {
      toast(errMsg(e, "Gagal menandai"));
    }
  };
  useEffect(() => {
    void load();
  }, [load]);
  // asisten selesai bekerja (mis. memasang pantauan): muat ulang daftar
  useRefresh((mutated) => {
    void load();
    if (mutated) toast(REFRESH_MSG);
  });
  const data = st.data;
  useTour("watch", WATCH_TOUR, !!data);
  if (st.loading && !data) return <PageSkeleton className="watchp" />;
  if (st.error || !data)
    return (
      <div className="wrap watchp">
        <h1>Pantau</h1>
        <LoadError error={st.error || "Data kosong."} onRetry={() => void load()} />
      </div>
    );

  const toggle = async (x: Item) => {
    try {
      await apiPost("/market/watch", { industry: x.industry, area: x.area, on: !x.watch, last_run: x.created });
      invalidate(WATCHES_KEY);
      const days = x.watch?.every_days;
      toast(x.watch ? "Pantauan dimatikan" : days ? `Dipantau tiap ${days} hari` : "Dipantau, riset ulang otomatis sesuai jadwal paket");
      void load();
    } catch (e) {
      toast(errMsg(e, "Gagal mengubah pantauan"));
    }
  };
  const rerun = async (x: Item) => {
    try {
      await apiPost("/market/run", { industry: x.industry, area: x.area, fresh: true });
      router.push("/market");
    } catch (e) {
      toast(errMsg(e, "Gagal memulai riset ulang"));
    }
  };

  const on = data.filter((x) => x.watch),
    off = data.filter((x) => !x.watch);
  return (
    <div className="wrap watchp">
      <h1>Pantau</h1>
      <p className="lead">
        Wilayah yang dipantau diriset ulang otomatis selama aplikasi ini menyala. Di sini terlihat apa yang berubah: pesaing baru, rating naik atau turun, dan
        bisnis yang sedang ramai. Perubahan penting dikirim ke email, Telegram, atau webhook (atur di Pengaturan).
      </p>
      {alerts.length > 0 && (
        <div className="alerts">
          <div className="alerts-h">
            <h3>Alert {unread > 0 && <span className="badge-n">{unread}</span>}</h3>
            {unread > 0 && <button type="button" className="mini" onClick={() => markRead()}>Tandai semua dibaca</button>}
          </div>
          {alerts.slice(0, 12).map((al) => (
            <button
              type="button"
              key={al.id}
              className={"alert" + (al.read_at ? "" : " unread") + (al.severity >= 6 ? " hot" : "")}
              onClick={() => {
                if (!al.read_at) void markRead(al.id);
                router.push("/market?id=" + al.report_id);
              }}
            >
              <span className="alert-sev" aria-label={"tingkat " + al.severity} title={"tingkat " + al.severity}>{al.severity >= 6 ? "!!" : "!"}</span>
              <span className="alert-txt">{al.summary}</span>
              <span className="alert-when">{fmt(al.created_at)}</span>
            </button>
          ))}
        </div>
      )}
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
            <ExtLink href={p.maps_url}>{clean(p.name)}</ExtLink>
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
          <button type="button" className="btn ghost" onClick={onRun}>
            Riset ulang
          </button>
          <button type="button" className={"btn ghost watch" + (w ? " on" : "")} aria-pressed={!!w} onClick={onToggle}>
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
