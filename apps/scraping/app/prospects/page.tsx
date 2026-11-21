"use client";
import BizAvatar from "@/components/BizAvatar";
import ScoreHelp from "@/components/ScoreHelp";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import "./prospects.css";
import ExtLink from "@/components/ExtLink";
import LoadError, { PageSkeleton } from "@/components/LoadError";
import { useShell, useToast } from "@/components/Shell";
import { useTour } from "@/components/Tour";
import { apiGet, errMsg } from "@/lib/api";
import { type Biz, LEAD_ST, ST_LABEL, clean, dec, downloadCsv, draft, leadKey, saveLead, waOf } from "@/lib/biz";
import { invalidate, isDue, loadProspects, PROSPECTS_KEY, REFRESH_MSG } from "@/lib/cache";
import { igUrl } from "@/lib/safe";
import { getOffer, isDefaultOffer, loadSettings, setOffer } from "@/lib/settings";
import { PROSPECTS_TOUR } from "@/lib/tours";
import { useRefresh } from "@/lib/useRefresh";

const COLS: [string, string, string][] = [
  ["baru", "Belum dihubungi", "Mulai dari skor tertinggi. Klik WhatsApp, lalu geser ke Dihubungi."],
  ["dihubungi", "Dihubungi", "Pasang tanggal pengingat supaya tidak lupa follow up."],
  ["tertarik", "Tertarik", ""],
  ["deal", "Deal", ""],
  ["tolak", "Tidak jadi", ""],
];
const NEXT: Record<string, string> = { baru: "dihubungi", dihubungi: "tertarik", tertarik: "deal" };
const stOf = (p: Biz) => (p.lead && p.lead.status) || "baru";
const keyOf = (p: Biz, i: number) => leadKey(p) || `${p.name}#${i}`;

type Loaded = { loading: boolean; error: string | null; data: Biz[] | null };

export default function ProspectsPage() {
  const toast = useToast();
  const { openBusiness } = useShell();
  const [st, setSt] = useState<Loaded>({ loading: true, error: null, data: null });
  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");
  const [area, setArea] = useState("");
  const [due, setDue] = useState(false);
  const [offer, setOfferState] = useState("");
  const [members, setMembers] = useState<{ user_id: string; email: string }[]>([]);
  const [pj, setPj] = useState(""); // filter penanggung jawab: "" semua, "none" belum dipegang, selainnya user_id
  const [show, setShow] = useState<Record<string, number>>({});
  const [over, setOver] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const load = useCallback(async () => {
    setSt((s) => ({ ...s, loading: true, error: null }));
    try {
      await loadSettings().catch(() => null);
      setOfferState(isDefaultOffer() ? "" : getOffer());
      // anggota org untuk pembagian penanggung jawab; gagal dimuat bukan masalah (fitur tim saja)
      apiGet<{ members?: { user_id: string; email: string }[] }>("/org").then((o) => setMembers(o.members || [])).catch(() => {});
      const items = await loadProspects();
      setSt({ loading: false, error: null, data: items });
    } catch (e) {
      setSt({ loading: false, error: errMsg(e, "Prospek gagal dimuat."), data: null });
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  // asisten selesai bekerja (mis. mengubah status prospek): muat ulang papan
  useRefresh((mutated) => {
    invalidate(PROSPECTS_KEY);
    void load();
    if (mutated) toast(REFRESH_MSG);
  });
  useEffect(() => {
    const t = setTimeout(() => setQ(qInput.toLowerCase()), 200);
    return () => clearTimeout(t);
  }, [qInput]);

  const items = st.data;
  useTour("prospects", PROSPECTS_TOUR, !!items);

  const replace = useCallback((next: Biz) => {
    setSt((s) => (s.data ? { ...s, data: s.data.map((p) => (leadKey(p) === leadKey(next) ? next : p)) } : s));
    invalidate(PROSPECTS_KEY);
  }, []);

  const move = useCallback(async (p: Biz, status: string) => {
    if (stOf(p) === status) return;
    try {
      const next = await saveLead(p, { status });
      replace(next);
      toast(`${clean(p.name)} dipindah ke ${ST_LABEL[status]}`);
    } catch (e) {
      toast(errMsg(e, "Gagal memindahkan"));
    }
  }, [replace, toast]);

  const assign = useCallback(async (p: Biz, userId: string) => {
    try {
      replace(await saveLead(p, { status: stOf(p), assignee: userId }));
      toast(userId ? "Penanggung jawab diatur" : "Penanggung jawab dilepas");
    } catch (e) {
      toast(errMsg(e, "Gagal mengatur penanggung jawab"));
    }
  }, [replace, toast]);

  const rows = useMemo(() => {
    if (!items) return [];
    return items.filter(
      (p) =>
        (!area || p.industry + " · " + p.area === area) &&
        (!due || isDue(p)) &&
        (!pj || (pj === "none" ? !p.lead?.assignee : p.lead?.assignee === pj)) &&
        (!q || [p.name, p.area, p.industry, p.category, p.lead && p.lead.note].join(" ").toLowerCase().includes(q)),
    );
  }, [items, area, due, q, pj]);

  if (st.loading && !items) return <PageSkeleton className="pros" />;
  if (st.error || !items)
    return (
      <div className="wrap pros">
        <h1>Prospek</h1>
        <LoadError error={st.error || "Data kosong."} onRetry={() => { invalidate(PROSPECTS_KEY); void load(); }} />
      </div>
    );

  const exportCsv = () => {
    const cols: [string, string][] = [
      ["name", "Nama"], ["lead_score", "Skor"], ["status", "Status"], ["industry", "Industri"], ["area", "Wilayah"], ["phone", "Telepon"],
      ["website", "Website"], ["instagram", "Instagram"], ["rating", "Rating"], ["reviews", "Ulasan"], ["note", "Catatan"], ["remind", "Pengingat"], ["maps_url", "Maps"],
    ];
    const val = (p: Biz, c: string) =>
      c === "status" ? ST_LABEL[stOf(p)] : c === "note" ? p.lead?.note : c === "remind" ? p.lead?.remind : c === "name" ? clean(p.name) : (p as Record<string, unknown>)[c];
    downloadCsv("prospek.csv", cols.map((c) => c[1]), rows.map((p) => cols.map(([c]) => val(p, c))));
  };

  const areas = [...new Set(items.map((p) => p.industry + " · " + p.area))];
  const cnt = (s: string) => items.filter((p) => stOf(p) === s).length;
  const nDue = items.filter(isDue).length;
  const byKey = new Map(items.map((p, i) => [keyOf(p, i), p] as const));

  return (
    <div className="wrap pros">
      <div className="head">
        <div>
          <h1>Prospek</h1>
          <p className="lead">Bisnis yang paling mungkin butuh jasamu, diambil dari semua riset. Geser kartu atau pakai menu Pindah ke untuk ubah status, klik untuk detail.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/campaigns?from=prospects" className="btn">Buat kampanye</Link>
          <button type="button" className="btn ghost" onClick={exportCsv}>
            Ekspor CSV
          </button>
        </div>
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
            <input type="search" aria-label="Cari prospek" placeholder="Cari nama, wilayah, catatan" value={qInput} onChange={(e) => setQInput(e.target.value)} />
            <select value={area} aria-label="Batasi ke satu riset" onChange={(e) => setArea(e.target.value)}>
              <option value="">Semua riset</option>
              {areas.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
            {members.length > 1 && (
              <select value={pj} aria-label="Batasi ke penanggung jawab" onChange={(e) => setPj(e.target.value)}>
                <option value="">Semua penanggung jawab</option>
                <option value="none">Belum dipegang</option>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>{m.email.split("@")[0]}</option>
                ))}
              </select>
            )}
            <label>
              <input type="checkbox" checked={due} onChange={(e) => setDue(e.target.checked)} /> Hanya yang jatuh tempo
            </label>
          </div>
          <label className="offer">
            Jasa yang kamu tawarkan (dipakai di draf pesan):
            <input
              value={offer}
              placeholder="mis. bikin website dan katalog online"
              onChange={(e) => {
                setOfferState(e.target.value);
                setOffer(e.target.value);
              }}
            />
          </label>
          <div className="board">
            {COLS.map(([k, l, hint]) => {
              const list = rows.filter((p) => stOf(p) === k);
              const lim = show[k] || 25;
              return (
                <section
                  key={k}
                  className={"col" + (over === k ? " over" : "")}
                  data-col={k}
                  aria-label={l}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOver(k);
                  }}
                  onDragLeave={() => setOver(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setOver(null);
                    const p = byKey.get(e.dataTransfer.getData("text/plain"));
                    if (p) void move(p, k);
                  }}
                >
                  <div className="col-h">
                    {l}
                    <b>{list.length}</b>
                  </div>
                  <div className="col-b">
                    {list.length === 0 && <div className="col-hint">{hint || "Kosong"}</div>}
                    {list.slice(0, lim).map((p, i) => {
                      const key = keyOf(p, i);
                      return (
                        <Card
                          key={key}
                          p={p}
                          id={key}
                          members={members}
                          dragging={dragging === key}
                          onDragStart={() => setDragging(key)}
                          onDragEnd={() => setDragging(null)}
                          onOpen={() => openBusiness(p, { onChange: replace })}
                          onMove={(s) => move(p, s)}
                          onAssign={(u) => assign(p, u)}
                          onWa={() => stOf(p) === "baru" && move(p, "dihubungi")}
                        />
                      );
                    })}
                    {list.length > lim && (
                      <button type="button" className="more-btn" onClick={() => setShow({ ...show, [k]: 1e9 })}>
                        Tampilkan {list.length - lim} lagi
                      </button>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function Card({
  p, id, members, dragging, onDragStart, onDragEnd, onOpen, onMove, onAssign, onWa,
}: {
  p: Biz; id: string; members: { user_id: string; email: string }[]; dragging: boolean; onDragStart: () => void; onDragEnd: () => void;
  onOpen: () => void; onMove: (st: string) => void; onAssign: (userId: string) => void; onWa: () => void;
}) {
  const wa = waOf(p),
    due = isDue(p),
    st = stOf(p);
  const next = NEXT[st];
  return (
    <article
      className={"card" + (dragging ? " drag" : "")}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
    >
      <div className="t">
        <button type="button" className="n nm-btn withlogo" onClick={onOpen}><BizAvatar name={clean(p.name)} website={p.website} logoKey={p.logo_key} size={34} />{clean(p.name)}</button>
        <span className={"sc" + ((p.lead_score ?? 0) >= 60 ? " hi" : "")} title="Skor prospek 0 sampai 100" aria-label={`Skor prospek ${p.lead_score ?? "-"}`}>
          {p.lead_score}
        </span>
        <ScoreHelp kind="prospek" />
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
          <ExtLink className="wa" href={wa + "?text=" + encodeURIComponent(draft(p, p.industry, p.area))} onClick={onWa}>
            WhatsApp
          </ExtLink>
        )}
        {p.instagram && <ExtLink href={igUrl(p.instagram)}>IG</ExtLink>}
        <label className="mv">
          <span className="sr-only">Pindah ke</span>
          <select value={st} aria-label={"Pindah " + clean(p.name) + " ke"} onChange={(e) => onMove(e.target.value)}>
            {LEAD_ST.map((s) => (
              <option key={s} value={s}>{s === st ? ST_LABEL[s] : "Pindah ke " + ST_LABEL[s]}</option>
            ))}
          </select>
        </label>
        {members.length > 1 && (
          <label className="mv">
            <span className="sr-only">Penanggung jawab</span>
            <select value={p.lead?.assignee || ""} aria-label={"Penanggung jawab " + clean(p.name)} onChange={(e) => onAssign(e.target.value)}>
              <option value="">PJ: —</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>PJ: {m.email.split("@")[0]}</option>
              ))}
            </select>
          </label>
        )}
        {next && (
          <button type="button" className="next" title={"Pindah ke " + ST_LABEL[next]} onClick={() => onMove(next)}>
            {ST_LABEL[next]} →
          </button>
        )}
      </div>
    </article>
  );
}
