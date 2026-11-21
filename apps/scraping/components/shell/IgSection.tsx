"use client";
import { useEffect, useState } from "react";
import { apiGet, apiPost, errMsg } from "@/lib/api";
import { dec, num } from "@/lib/biz";
import { useToast } from "./ToastContext";

type IgInfo = {
  found: boolean;
  pending?: boolean;
  username?: string;
  biography?: string;
  followers?: number;
  followers_delta?: number;
  engagement_rate?: number | null;
  posts_per_week?: number | null;
  best_day?: string;
};

export default function IgSection({ handle }: { handle: string }) {
  const toast = useToast();
  const [st, setSt] = useState<{ loading: boolean; error: string | null; data: IgInfo | null }>({ loading: true, error: null, data: null });
  const [tick, setTick] = useState(0);
  const [scrapeBusy, setScrapeBusy] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    setSt((s) => ({ ...s, loading: true, error: null }));
    apiGet<IgInfo>("/business?ig=" + encodeURIComponent(handle), { signal: ac.signal })
      .then((j) => setSt({ loading: false, error: null, data: j }))
      .catch((e) => {
        if (ac.signal.aborted) return;
        setSt({ loading: false, error: errMsg(e), data: null });
      });
    return () => ac.abort();
  }, [handle, tick]);

  if (st.loading)
    return (
      <div className="bz-sec">
        <h4>Instagram</h4>
        <div className="muted-note">Memuat…</div>
      </div>
    );
  if (st.error || !st.data)
    return (
      <div className="bz-sec">
        <h4>Instagram</h4>
        <p className="err" role="alert">{st.error || "Data Instagram tidak terbaca."}</p>
        <button type="button" className="btn ghost" onClick={() => setTick((n) => n + 1)}>Coba lagi</button>
      </div>
    );
  const j = st.data;
  if (!j.found)
    return (
      <div className="bz-sec">
        <h4>Instagram</h4>
        <p className="muted-note">{j.pending || scrapeBusy ? `@${handle} sedang dianalisis, buka lagi 1 sampai 2 menit lagi.` : `@${handle} belum pernah dianalisis.`}</p>
        {!j.pending && !scrapeBusy && (
          <button
            type="button"
            className="btn ghost"
            onClick={async () => {
              try {
                await apiPost("/run", { targets: handle, mode: "direct" });
                setScrapeBusy(true);
              } catch (e) {
                toast(errMsg(e, "Gagal memulai analisis"));
              }
            }}
          >
            Analisis akun ini
          </button>
        )}
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
