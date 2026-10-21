"use client";
// Komponen bersama semua halaman: navigasi, asisten melayang, panel detail bisnis, toast, notifikasi.
// Port dari templates/shell.js.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Biz, LEAD_ST, ST_LABEL, clean, draft, host, leadKey, num, postJson, saveLead, today, waOf, dec } from "@/lib/biz";

type OpenCtx = { industry?: string; area?: string; report_id?: number | string | null; onChange?: (p: Biz) => void };
type ShellApi = {
  toast: (msg: string) => void;
  notify: (title: string, body: string) => void;
  askNotify: () => void;
  openDrawer: (title: string, body: ReactNode, isFrame?: boolean) => void;
  closeDrawer: () => void;
  openBusiness: (p: Biz, ctx?: OpenCtx) => void;
  embed: boolean;
};

const Ctx = createContext<ShellApi | null>(null);
export const useShell = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useShell di luar ShellProvider");
  return c;
};

const NAV: [string, string][] = [
  ["/market", "Riset"],
  ["/prospects", "Prospek"],
  ["/watch", "Pantau"],
  ["/", "Asisten"],
];
const MORE: [string, string, string, boolean][] = [
  ["/competitors", "Kompetitor IG", "Akun Instagram pesaing di sekitar lokasi", true],
  ["/report", "Analisis IG", "Followers, engagement, dan konten akun", true],
  ["/tools", "Scrape manual", "Scrape IG manual dan pilihan koneksi", false],
  ["/settings", "Pengaturan", "Tim, kuota, dan akun", false],
];

export function ShellProvider({ children }: { children: ReactNode }) {
  const [embed, setEmbed] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [drawer, setDrawer] = useState<{ title: string; body: ReactNode; frame: boolean; on: boolean } | null>(null);

  useEffect(() => {
    const e = new URLSearchParams(location.search).has("embed");
    setEmbed(e);
    document.body.classList.toggle("embed", e);
  }, []);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2600);
  }, []);
  const askNotify = useCallback(() => {
    try {
      if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
    } catch {}
  }, []);
  const notify = useCallback((title: string, body: string) => {
    try {
      if (document.hidden && "Notification" in window && Notification.permission === "granted") new Notification(title, { body });
    } catch {}
    const t = document.title;
    if (document.hidden) {
      document.title = "● " + title;
      addEventListener("focus", () => (document.title = t), { once: true });
    }
  }, []);
  const closeDrawer = useCallback(() => setDrawer((d) => (d ? { ...d, on: false } : d)), []);
  const openDrawer = useCallback((title: string, body: ReactNode, isFrame = false) => {
    setDrawer({ title, body, frame: isFrame, on: false });
    requestAnimationFrame(() => setDrawer((d) => (d ? { ...d, on: true } : d)));
  }, []);
  const openBusiness = useCallback(
    (p: Biz, ctx: OpenCtx = {}) => {
      openDrawer(clean(p.name), <BusinessPanel p={p} ctx={ctx} toast={toast} reopen={(q) => openBusiness(q, ctx)} />);
    },
    [openDrawer, toast],
  );

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && closeDrawer();
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [closeDrawer]);

  const api: ShellApi = { toast, notify, askNotify, openDrawer, closeDrawer, openBusiness, embed };
  return (
    <Ctx.Provider value={api}>
      {!embed && <Nav />}
      {children}
      {!embed && <Fab />}
      <div className={"drawer-bg" + (drawer?.on ? " on" : "")} onClick={closeDrawer} />
      <aside className={"drawer" + (drawer?.on ? " on" : "")}>
        {drawer && (
          <>
            <div className="dh">
              <b>{drawer.title}</b>
              <button className="x" aria-label="Tutup" onClick={closeDrawer}>
                ✕
              </button>
            </div>
            {drawer.frame ? drawer.body : <div className="db">{drawer.body}</div>}
          </>
        )}
      </aside>
      <div className={"toast" + (toastMsg ? " on" : "")}>{toastMsg}</div>
    </Ctx.Provider>
  );
}

function Nav() {
  const here = usePathname();
  const [due, setDue] = useState(0);
  const moreRef = useRef<HTMLDetailsElement>(null);
  const isLogin = ["/login", "/register", "/forgot", "/reset", "/privacy"].includes(here);
  useEffect(() => {
    if (isLogin) return;
    fetch("/prospects/data")
      .then((r) => r.json())
      .then((j: { items: Biz[] }) => {
        setDue(
          j.items.filter((p) => p.lead && p.lead.remind && p.lead.remind <= today() && !["deal", "tolak"].includes(p.lead.status || ""))
            .length,
        );
      })
      .catch(() => {});
    const close = (e: MouseEvent) => {
      const m = moreRef.current;
      if (m && !m.contains(e.target as Node)) m.open = false;
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [isLogin]);
  if (isLogin)
    return (
      <div className="top">
        <span className="brand" aria-label="Raqio">
          <svg className="mark" viewBox="0 0 32 32" aria-hidden="true">
            <path d="M5 29V3H18A8 8 0 0 1 18 19H11" fill="none" stroke="currentColor" strokeWidth="4" />
            <path d="M17 19L27 29" stroke="var(--good, #FFB020)" strokeWidth="4" />
          </svg>
          <span className="word">raqio</span>
        </span>
      </div>
    );
  return (
    <div className="top">
      <Link className="brand" href="/market" style={{ textDecoration: "none" }} aria-label="Raqio">
        <svg className="mark" viewBox="0 0 32 32" aria-hidden="true">
          <path d="M5 29V3H18A8 8 0 0 1 18 19H11" fill="none" stroke="currentColor" strokeWidth="4" />
          <path d="M17 19L27 29" stroke="var(--good, #FFB020)" strokeWidth="4" />
        </svg>
        <span className="word">raqio</span>
      </Link>
      <nav>
        {NAV.map(([h, l]) => (
          <Link key={h} href={h} className={(here === h ? "on" : "") + (h === "/" ? " hide-m" : "")}>
            {l}
            {h === "/prospects" && due > 0 && (
              <span className="badge-n" title={due + " follow up jatuh tempo"}>
                {due}
              </span>
            )}
          </Link>
        ))}
        <details className="more" ref={moreRef}>
          <summary>Lanjutan</summary>
          <div className="menu">
            {MORE.map(([h, l, d, nw]) => (
              <a key={h} href={h} target={nw ? "_blank" : undefined}>
                {l}
                <small>{d}</small>
              </a>
            ))}
            <form method="post" action="/auth/logout">
              <button type="submit">
                Keluar<small>Akhiri sesi di browser ini</small>
              </button>
            </form>
          </div>
        </details>
      </nav>
    </div>
  );
}

function Fab() {
  const here = usePathname();
  const { openDrawer } = useShell();
  if (["/", "/login", "/register", "/forgot", "/reset", "/privacy"].includes(here)) return null;
  return (
    <button className="fab" onClick={() => openDrawer("Asisten", <iframe src="/?embed=1" title="Asisten" />, true)}>
      Tanya asisten
    </button>
  );
}

// ---------- panel detail bisnis ----------
function BusinessPanel({ p, ctx, toast, reopen }: { p: Biz; ctx: OpenCtx; toast: (m: string) => void; reopen: (p: Biz) => void }) {
  const industry = ctx.industry || p.industry,
    area = ctx.area || p.area,
    rid = ctx.report_id || p.report_id;
  const wa = waOf(p),
    lead = p.lead || {};
  const [status, setStatus] = useState(lead.status || "");
  const [note, setNote] = useState(lead.note || "");
  const [remind, setRemind] = useState(lead.remind || "");
  const [copyTxt, setCopyTxt] = useState("Salin draf");
  const [detTxt, setDetTxt] = useState("Cek kontak sekarang");
  const [detBusy, setDetBusy] = useState(false);
  const msg = draft(p, industry, area);
  const no = <span style={{ color: "var(--faint)" }}>tidak ada</span>;
  const unk = <span style={{ color: "var(--faint)" }}>belum dicek</span>;

  const save = async () => {
    const err = await saveLead(p, { status: status || "baru", note, remind });
    if (err) toast(err);
    else {
      toast("Tersimpan");
      ctx.onChange?.(p);
    }
  };
  const detail = async () => {
    setDetBusy(true);
    setDetTxt("Membuka Google Maps… (±15 detik)");
    const { ok, j } = await postJson("/market/detail", { report_id: rid, key: leadKey(p) });
    if (!ok) {
      setDetBusy(false);
      setDetTxt("Cek kontak sekarang");
      toast((j.error as string) || "Gagal");
      return;
    }
    Object.assign(p, j);
    toast("Kontak diperbarui");
    ctx.onChange?.(p);
    reopen(p);
  };

  return (
    <>
      <div className="bz-sec">
        <div className="muted-note">
          {clean(p.category || "")}
          {area ? " · " + area : ""}
        </div>
        <div className="big-n" style={{ marginTop: 12 }}>
          <div>
            <b>{p.rating ? dec(p.rating) : "-"}</b>
            <small>rating</small>
          </div>
          <div>
            <b>{num(p.reviews)}</b>
            <small>ulasan</small>
          </div>
          <div>
            <b>{p.lead_score ?? "-"}</b>
            <small>skor prospek</small>
          </div>
        </div>
        {(p.lead_reasons || []).length > 0 && (
          <div className="reasons">
            {p.lead_reasons!.map((x) => (
              <span key={x}>{clean(x)}</span>
            ))}
          </div>
        )}
      </div>
      <div className="bz-sec">
        <h4>Kontak</h4>
        <div className="kv">
          <span>Telepon</span>
          <span>{p.phone ? clean(p.phone) : p._detailed ? no : unk}</span>
          <span>Website</span>
          <span>
            {p.website ? (
              <a href={p.website} target="_blank">
                {host(p.website)}
              </a>
            ) : p._detailed ? (
              no
            ) : (
              unk
            )}
          </span>
          <span>Instagram</span>
          <span>
            {p.instagram ? (
              <a href={"https://instagram.com/" + p.instagram} target="_blank">
                @{p.instagram}
              </a>
            ) : p._detailed ? (
              no
            ) : (
              unk
            )}
          </span>
          <span>Email</span>
          <span>
            {(p.emails || []).length
              ? p.emails!.map((e, i) => (
                  <span key={e}>
                    {i > 0 && <br />}
                    <a href={"mailto:" + e}>{e}</a>
                  </span>
                ))
              : no}
          </span>
          <span>Alamat</span>
          <span>{clean(p.address || "-")}</span>
        </div>
        <div className="acts-row">
          {wa && (
            <a className="btn wa-btn" target="_blank" href={wa + "?text=" + encodeURIComponent(msg)}>
              Kirim WhatsApp
            </a>
          )}
          {p.maps_url && (
            <a className="btn ghost" target="_blank" href={p.maps_url}>
              Buka di Maps
            </a>
          )}
          {!p._detailed && rid && (
            <button className="btn ghost" disabled={detBusy} onClick={detail}>
              {detTxt}
            </button>
          )}
        </div>
      </div>
      <div className="bz-sec">
        <h4>Follow up</h4>
        <div className="st-row">
          {LEAD_ST.map((s) => (
            <button key={s} className={status === s ? "on" : ""} onClick={() => setStatus(s)}>
              {ST_LABEL[s]}
            </button>
          ))}
        </div>
        <label className="field">
          Catatan
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. pemiliknya Pak Budi, minta dihubungi sore" />
        </label>
        <label className="field">
          Ingatkan saya tanggal
          <input type="date" value={remind} onChange={(e) => setRemind(e.target.value)} />
        </label>
        <div className="acts-row">
          <button className="btn" onClick={save}>
            Simpan
          </button>
        </div>
      </div>
      <div className="bz-sec">
        <h4>Draf pesan</h4>
        <p className="muted-note">{msg}</p>
        <button
          className="btn ghost"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(msg);
              setCopyTxt("Tersalin ✓");
            } catch {
              setCopyTxt("Gagal menyalin");
            }
          }}
        >
          {copyTxt}
        </button>
      </div>
      {p.instagram && <IgSection handle={p.instagram} toast={toast} />}
    </>
  );
}

type IgInfo = {
  found: boolean;
  username?: string;
  biography?: string;
  followers?: number;
  followers_delta?: number;
  engagement_rate?: number | null;
  posts_per_week?: number | null;
  best_day?: string;
};

function IgSection({ handle, toast }: { handle: string; toast: (m: string) => void }) {
  const [j, setJ] = useState<IgInfo | null>(null);
  const [scrapeTxt, setScrapeTxt] = useState("Analisis akun ini");
  const [scrapeBusy, setScrapeBusy] = useState(false);
  useEffect(() => {
    fetch("/business?ig=" + encodeURIComponent(handle))
      .then((r) => r.json())
      .then(setJ)
      .catch(() => setJ({ found: false }));
  }, [handle]);
  if (!j)
    return (
      <div className="bz-sec">
        <h4>Instagram</h4>
        <div className="muted-note">Memuat…</div>
      </div>
    );
  if (!j.found)
    return (
      <div className="bz-sec">
        <h4>Instagram</h4>
        <p className="muted-note">@{handle} belum pernah dianalisis.</p>
        <button
          className="btn ghost"
          disabled={scrapeBusy}
          onClick={async () => {
            const { ok, j: k } = await postJson("/run", { targets: handle, mode: "direct" });
            if (!ok) {
              toast((k.error as string) || "Gagal");
              return;
            }
            setScrapeBusy(true);
            setScrapeTxt("Sedang dianalisis, buka lagi 1 sampai 2 menit lagi");
          }}
        >
          {scrapeTxt}
        </button>
      </div>
    );
  const er = j.engagement_rate;
  return (
    <div className="bz-sec">
      <h4>Instagram @{j.username}</h4>
      <div className="big-n">
        <div>
          <b>{num(j.followers)}</b>
          <small>
            followers{j.followers_delta ? ` (${j.followers_delta > 0 ? "+" : ""}${num(j.followers_delta)})` : ""}
          </small>
        </div>
        <div>
          <b>{er != null ? dec(er) + "%" : "-"}</b>
          <small>engagement</small>
        </div>
        <div>
          <b>{j.posts_per_week != null ? dec(j.posts_per_week) : "-"}</b>
          <small>post/minggu</small>
        </div>
      </div>
      {j.biography && (
        <p className="muted-note" style={{ marginTop: 12 }}>
          {j.biography}
        </p>
      )}
      <p className="muted-note" style={{ marginTop: 8 }}>
        {er != null ? (er >= 3 ? "Interaksi tinggi, audiensnya aktif." : er >= 1 ? "Interaksi wajar." : "Interaksi rendah, kontennya kurang ditanggapi.") : ""}
        {j.best_day ? " Hari terbaik posting: " + j.best_day + "." : ""}
      </p>
    </div>
  );
}
