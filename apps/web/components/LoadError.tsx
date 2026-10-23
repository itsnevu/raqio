"use client";
// Pesan gagal memuat dengan tombol Coba lagi, dipakai semua halaman untuk state {loading, error, data}.
// Pesannya juga dikirim ke bar notifikasi bersama supaya semua error terlihat di satu tempat.
import { useEffect } from "react";
import { useNotice } from "@/components/shell/ToastContext";

export default function LoadError({ error, onRetry, title = "Gagal memuat" }: { error: string; onRetry?: () => void; title?: string }) {
  const { notify, dismiss } = useNotice();
  useEffect(() => {
    notify({ id: "load", kind: "error", text: `${title}: ${error}` });
    return () => dismiss("load");
  }, [title, error, notify, dismiss]);
  return (
    <div className="load-err" role="alert">
      <b>{title}</b>
      <p>{error}</p>
      {onRetry && (
        <button type="button" className="btn ghost" onClick={onRetry}>
          Coba lagi
        </button>
      )}
    </div>
  );
}

export function PageSkeleton({ className = "" }: { className?: string }) {
  return (
    <div className={"wrap " + className} aria-busy="true">
      <div className="skel-line" style={{ width: "40%" }} />
      <div className="skel-line" style={{ width: "70%" }} />
      <div className="skel-box" />
    </div>
  );
}
