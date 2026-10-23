"use client";
// Laporan siap cetak: data yang sama dengan /market, dirender bersih tanpa navigasi (Nav dan Fab sembunyi untuk route ini,
// lihat lib/routes.ts BARE_PAGES). ?id= wajib; ?contacts=1 ikut mencetak nomor telepon prospek.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import "./print.css";
import LoadError from "@/components/LoadError";
import PrintReport from "@/components/market/PrintReport";
import { apiGet, errMsg, type Org } from "@/lib/api";
import type { Report } from "@/lib/market/types";
import { isReport, normalizeReport } from "@/lib/market/verdict";
import { getGoal, loadSettings } from "@/lib/settings";

export default function PrintPage() {
  return (
    <Suspense fallback={<div className="printp" />}>
      <Print />
    </Suspense>
  );
}

type Loaded = { loading: boolean; error: string | null; R: Report | null; org: string; rival: boolean };

function Print() {
  const params = useSearchParams();
  const id = Number(params.get("id") || 0) || null;
  const contacts = params.get("contacts") === "1";
  const [st, setSt] = useState<Loaded>({ loading: true, error: null, R: null, org: "", rival: false });

  const load = useCallback(async () => {
    if (!id) {
      setSt({ loading: false, error: "Laporan tidak dipilih. Buka laporan di halaman Riset, lalu klik Cetak laporan.", R: null, org: "", rival: false });
      return;
    }
    setSt((s) => ({ ...s, loading: true, error: null }));
    try {
      const [rep, org] = await Promise.all([
        apiGet<unknown>("/market/report?id=" + encodeURIComponent(String(id))),
        apiGet<Org>("/org").catch(() => null),
        loadSettings().catch(() => null),
      ]);
      if (!isReport(rep)) throw new Error("Laporan tidak lengkap atau rusak.");
      const R = normalizeReport(rep);
      const goal = params.get("goal");
      const rival = goal ? goal === "rival" : getGoal(R.industry, R.area) === "rival";
      setSt({ loading: false, error: null, R, org: org?.name || "", rival });
    } catch (e) {
      setSt({ loading: false, error: errMsg(e, "Laporan gagal dimuat."), R: null, org: "", rival: false });
    }
  }, [id, params]);
  useEffect(() => {
    void load();
  }, [load]);

  // judul tab dipakai browser sebagai nama berkas PDF
  useEffect(() => {
    const R = st.R;
    if (!R) return;
    const t = document.title;
    document.title = `${R.industry} ${R.area} - Raqio`;
    return () => {
      document.title = t;
    };
  }, [st.R]);

  return (
    <div className="printp">
      <div className="pbar no-print">
        <Link className="pbtn" href={id ? "/market?id=" + id : "/market"}>← Kembali ke laporan</Link>
        <span className="sp" />
        {id && st.R && (
          <Link className="pbtn" href={`/market/print?id=${id}${contacts ? "" : "&contacts=1"}`}>
            {contacts ? "Sembunyikan nomor telepon" : "Tampilkan nomor telepon"}
          </Link>
        )}
        <button type="button" className="pbtn primary" disabled={!st.R} onClick={() => window.print()}>
          Cetak / Simpan PDF
        </button>
      </div>
      {st.loading ? (
        <div className="doc" aria-busy="true"><p className="note">Memuat laporan…</p></div>
      ) : st.error ? (
        <div className="doc"><LoadError error={st.error} onRetry={id ? () => void load() : undefined} title="Laporan gagal dimuat" /></div>
      ) : st.R ? (
        <PrintReport R={st.R} org={st.org} rival={st.rival} contacts={contacts} />
      ) : null}
    </div>
  );
}
