"use client";
// Bar atas chat: dropdown "Riwayat" (daftar sesi dengan judul dan tanggal, klik memuat, tombol hapus) dan "Chat baru".
import { useEffect, useRef } from "react";
import { fmtWhen } from "@/lib/chat/steps";
import type { ChatSession } from "@/lib/chat/types";

type Props = { sessions: ChatSession[]; sid: string; onOpen: (id: string) => void; onDelete: (id: string) => void; onNew: () => void };

export default function ChatHistory({ sessions, sid, onOpen, onDelete, onNew }: Props) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      const d = ref.current;
      if (d && d.open && !d.contains(e.target as Node)) d.open = false;
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);
  const pick = (id: string) => {
    if (ref.current) ref.current.open = false;
    onOpen(id);
  };
  const del = (s: ChatSession) => {
    if (typeof confirm === "function" && !confirm(`Hapus percakapan "${s.title || "tanpa judul"}"?`)) return;
    onDelete(s.id);
  };
  return (
    <div className="chatbar">
      <details className="hist" ref={ref}>
        <summary>
          Riwayat{sessions.length > 0 && <b>{sessions.length}</b>}
        </summary>
        <div className="hist-menu">
          {sessions.length === 0 ? (
            <div className="hist-empty">Belum ada percakapan tersimpan.</div>
          ) : (
            <ul aria-label="Percakapan sebelumnya">
              {sessions.map((s) => (
                <li key={s.id} className={s.id === sid ? "on" : ""}>
                  <button type="button" className="hist-open" aria-current={s.id === sid ? "true" : undefined} onClick={() => pick(s.id)}>
                    <span className="hist-t">{s.title || "Tanpa judul"}</span>
                    <span className="hist-d">{fmtWhen(s.last_message_at || s.created_at)}</span>
                  </button>
                  <button type="button" className="hist-x" aria-label={"Hapus percakapan " + (s.title || "tanpa judul")} onClick={() => del(s)}>
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>
      <span className="sp" />
      <button type="button" className="btn ghost" onClick={onNew}>
        Chat baru
      </button>
    </div>
  );
}
