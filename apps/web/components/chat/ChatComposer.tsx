"use client";
// Input pertanyaan: chip saran di atas input, textarea, tombol Kirim/Stop, dan sisa kuota chat di bawahnya.
import Link from "next/link";
import { useId } from "react";
import { quotaText } from "@/lib/chat/steps";
import type { ChatQuota } from "@/lib/chat/types";

type Props = {
  value: string;
  onChange: (v: string) => void;
  running: boolean;
  disabled: boolean;
  quota: ChatQuota | null;
  notice: string | null;
  chips: string[];
  onPick: (c: string) => void;
  onSend: () => void;
  onStop: () => void;
};

export default function ChatComposer({ value, onChange, running, disabled, quota, notice, chips, onPick, onSend, onStop }: Props) {
  const id = useId();
  const qt = quotaText(quota);
  const exhausted = !!quota && quota.limit - quota.used <= 0;
  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        if (running) onStop();
        else onSend();
      }}
    >
      {chips.length > 0 && (
        <div className="chips" role="group" aria-label="Saran pertanyaan">
          {chips.map((c) => (
            <button type="button" key={c} className="chip" disabled={disabled} onClick={() => onPick(c)}>
              {c}
            </button>
          ))}
        </div>
      )}
      {notice && (
        <div className="notice" role="alert">
          {notice}
        </div>
      )}
      <div className="box">
        <label className="sr-only" htmlFor={id}>
          Pertanyaan
        </label>
        <textarea
          id={id}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Tanya soal pasar atau kompetitor…"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (!running) onSend();
            }
          }}
        />
        <button className={"btn send" + (running ? " stop" : "")} type="submit" disabled={disabled && !running}>
          {running ? "Stop" : "Kirim"}
        </button>
      </div>
      <div className="hint">Enter untuk kirim, Shift+Enter untuk baris baru</div>
      {qt && (
        <div className="quota" aria-live="polite">
          {qt}
          {exhausted && (
            <>
              {" "}
              <Link href="/settings">Pengaturan paket</Link>
            </>
          )}
        </div>
      )}
    </form>
  );
}
