"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import "./prospects.css";
import { useShell } from "@/components/Shell";
import { Biz, ST_LABEL, clean, dec, downloadCsv, draft, getOffer, saveLead, setOffer, today, waOf } from "@/lib/biz";

const COLS: [string, string, string][] = [
  ["baru", "Belum dihubungi", "Mulai dari skor tertinggi. Klik WhatsApp, lalu geser ke Dihubungi."],
  ["dihubungi", "Dihubungi", "Pasang tanggal pengingat supaya tidak lupa follow up."],
  ["tertarik", "Tertarik", ""],
  ["deal", "Deal", ""],
  ["tolak", "Tidak jadi", ""],
];
const NEXT: Record<string, string> = { baru: "dihubungi", dihubungi: "tertarik", tertarik: "deal" };
const stOf = (p: Biz) => (p.lead && p.lead.status) || "baru";
const isDue = (p: Biz) => !!(p.lead && p.lead.remind && p.lead.remind <= today() && !["deal", "tolak"].includes(p.lead.status || ""));

export default function ProspectsPage() {
  const { toast, openBusiness } = useShell();
  const [items, setItems] = useState<Biz[] | null>(null);
  const [q, setQ] = useState("");
  const [area, setArea] = useState("");
  const [due, setDue] = useState(false);
  const [offer, setOfferState] = useState("");
  const [show, setShow] = useState<Record<string, number>>({});
  const [over, setOver] = useState<string | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [, bump] = useState(0);
  const rerender = useCallback(() => bump((n) => n + 1), []);

  const load = useCallback(async () => {
    const j = await (await fetch("/prospects/data")).json();
    setItems(j.items);
  }, []);
  useEffect(() => {
    load();
    setOfferState(getOffer() === "meningkatkan penjualan lewat kehadiran online" ? "" : getOffer());
  }, [load]);

  if (!items) return <div className="wrap pros" />;

  const filtered = () =>
    items.filter(
      (p) =>
        (!area || p.industry + " · " + p.area === area) &&
        (!due || isDue(p)) &&
        (!q || [p.name, p.area, p.industry, p.category, p.lead && p.lead.note].join(" ").toLowerCase().includes(q)),
    );

  const move = async (i: number, status: string) => {
    const p = items[i];
    if (stOf(p) === status) return;
    const err = await saveLead(p, { status });
    if (err) toast(err);
    else {
      toast(`${clean(p.name)} dipindah ke ${ST_LABEL[status]}`);
      rerender();
    }
  };

  const exportCsv = () => {
    const cols: [string, string][] = [
      ["name", "Nama"], ["lead_score", "Skor"], ["status", "Status"], ["industry", "Industri"], ["area", "Wilayah"], ["phone", "Telepon"],
      ["website", "Website"], ["instagram", "Instagram"], ["rating", "Rating"], ["reviews", "Ulasan"], ["note", "Catatan"], ["remind", "Pengingat"], ["maps_url", "Maps"],
    ];
    const val = (p: Biz, c: string) =>
      c === "status" ? ST_LABEL[stOf(p)] : c === "note" ? p.lead?.note : c === "remind" ? p.lead?.remind : c === "name" ? clean(p.name) : (p as Record<string, unknown>)[c];
    downloadCsv("prospek.csv", cols.map((c) => c[1]), filtered().map((p) => cols.map(([c]) => val(p, c))));
  };

  const rows = filtered();
  const areas = [...new Set(items.map((p) => p.industry + " · " + p.area))];
  const cnt = (s: string) => items.filter((p) => stOf(p) === s).length;
  const nDue = items.filter(isDue).length;

  return (
    <div className="wrap pros">
      <div className="head">
        <div>
          <h1>Prospek</h1>
          <p className="lead">Bisnis yang paling mungkin butuh jasamu, diambil dari semua riset. Geser kartu untuk ubah status, klik untuk detail.</p>
        </div>
        <button className="btn ghost" onClick={exportCsv}>
          Ekspor CSV
        </button>
      </div>
      {!items.length ? (
        <div className="empty-cta">
          <b>Belum ada prospek</b>Prospek muncul otomatis setelah kamu riset satu industri dan wilayah.
          <div>
            <Link className="btn" href="/market">
              Mulai riset
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="strip">
            <div>
              <small>Total prospek</small>
              <b>{items.length}</b>
            </div>
            <div className={nDue ? "due" : ""}>
              <small>Follow up hari ini</small>
              <b>{nDue}</b>
            </div>
            <div>
              <small>Sedang berjalan</small>
              <b>{cnt("dihubungi") + cnt("tertarik")}</b>
            </div>
            <div>
              <small>Deal</small>
              <b>{cnt("deal")}</b>
            </div>
          </div>
          <div className="bar">
            <input type="search" placeholder="Cari nama, wilayah, catatan" value={q} onChange={(e) => setQ(e.target.value.toLowerCase())} />
            <select value={area} onChange={(e) => setArea(e.target.value)}>
              <option value="">Semua riset</option>
              {areas.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
            <label>
              <input type="checkbox" checked={due} onChange={(e) => setDue(e.target.checked)} /> Hanya yang jatuh tempo
            </label>
          </div>
          <div className="offer">
            Jasa yang kamu tawarkan (dipakai di draf pesan):
            <input
              value={offer}
              placeholder="mis. bikin website dan katalog online"
              onChange={(e) => {
                setOfferState(e.target.value);
                setOffer(e.target.value);
              }}
            />
          </div>
          <div className="board">
            {COLS.map(([k, l, hint]) => {
              const list = rows.map((p) => [p, items.indexOf(p)] as [Biz, number]).filter(([p]) => stOf(p) === k);
              const lim = show[k] || 25;
              return (
                <div
                  key={k}
                  className={"col" + (over === k ? " over" : "")}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOver(k);
                  }}
                  onDragLeave={() => setOver(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setOver(null);
                    move(+e.dataTransfer.getData("text/plain"), k);
                  }}
                >
                  <div className="col-h">
                    {l}
                    <b>{list.length}</b>
                  </div>
                  <div className="col-b">
                    {list.length === 0 && <div className="col-hint">{hint || "Kosong"}</div>}
                    {list.slice(0, lim).map(([p, i]) => (
                      <Card
                        key={i}
                        p={p}
                        i={i}
                        dragging={dragging === i}
                        onDragStart={() => setDragging(i)}
                        onDragEnd={() => setDragging(null)}
                        onOpen={() => openBusiness(p, { onChange: rerender })}
                        onNext={() => move(i, NEXT[stOf(p)])}
                        onWa={() => stOf(p) === "baru" && move(i, "dihubungi")}
                      />
                    ))}
                    {list.length > lim && (
                      <button className="more-btn" onClick={() => setShow({ ...show, [k]: 1e9 })}>
                        Tampilkan {list.length - lim} lagi
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function Card({
  p, i, dragging, onDragStart, onDragEnd, onOpen, onNext, onWa,
}: {
  p: Biz; i: number; dragging: boolean; onDragStart: () => void; onDragEnd: () => void; onOpen: () => void; onNext: () => void; onWa: () => void;
}) {
  const wa = waOf(p),
    due = isDue(p),
    st = stOf(p);
  return (
    <div
      className={"card" + (dragging ? " drag" : "")}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", String(i));
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a,button")) return;
        onOpen();
      }}
    >
      <div className="t">
        <div className="n">{clean(p.name)}</div>
        <span className={"sc" + ((p.lead_score ?? 0) >= 60 ? " hi" : "")} title="Skor prospek 0 sampai 100">
          {p.lead_score}
        </span>
      </div>
      <div className="m">
        {p.industry} · {p.area}
        {p.rating ? " · ★ " + dec(p.rating) : ""}
      </div>
      <div className="r">{(p.lead_reasons || []).slice(0, 3).join(", ")}</div>
      {p.lead?.note && <div className="note">{p.lead.note}</div>}
      {p.lead?.remind && (
        <span className={"remind" + (due ? " due" : "")}>
          {due ? "Follow up hari ini" : "Ingatkan " + new Date(p.lead.remind).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
        </span>
      )}
      <div className="a">
        {wa && (
          <a className="wa" target="_blank" href={wa + "?text=" + encodeURIComponent(draft(p, p.industry, p.area))} onClick={onWa}>
            WhatsApp
          </a>
        )}
        {p.instagram && (
          <a target="_blank" href={"https://instagram.com/" + p.instagram}>
            IG
          </a>
        )}
        {NEXT[st] && (
          <button className="next" title={"Pindah ke " + ST_LABEL[NEXT[st]]} onClick={onNext}>
            {ST_LABEL[NEXT[st]]} →
          </button>
        )}
      </div>
    </div>
  );
}
