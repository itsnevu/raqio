"use client";
// Isian daftar wilayah untuk mode Bandingkan: tiap wilayah yang di-Enter jadi chip kuning yang bisa dihapus,
// dengan dropdown saran dari wilayah yang pernah diriset. Nilai keluar tetap string "A; B; C" supaya alur run tidak berubah.
import { useEffect, useId, useRef, useState } from "react";
import { checkArea } from "@/lib/market/geo";

type Props = { value: string; onChange: (v: string) => void; options: string[]; max?: number; placeholder?: string };

export const splitAreas = (v: string) => v.split(/[;\n]/).map((s) => s.trim()).filter(Boolean);

export default function AreaChips({ value, onChange, options, max = 8, placeholder = "ketik wilayah lalu Enter" }: Props) {
  const chips = splitAreas(value);
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [err, setErr] = useState("");
  const [checking, setChecking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const has = (name: string) => chips.some((c) => c.toLowerCase() === name.toLowerCase());
  const matches = options
    .filter((o) => !has(o) && (draft.trim() === "" || o.toLowerCase().includes(draft.trim().toLowerCase())))
    .slice(0, 8);

  // dari saran (riset sebelumnya): langsung masuk. Ketikan bebas: divalidasi dulu ke peta supaya "asdf" tidak lolos.
  const addKnown = (name: string) => {
    if (has(name)) return;
    onChange([...chips, name].slice(0, max).join("; "));
    setDraft("");
    setHi(0);
    setErr("");
  };
  const addTyped = async (raw: string) => {
    const parts = splitAreas(raw).filter((p) => !has(p));
    if (!parts.length) return;
    setChecking(true);
    setErr("");
    const okNames: string[] = [];
    for (const part of parts) {
      const r = await checkArea(part);
      if (r.ok) okNames.push(r.name);
      else setErr(r.reason);
    }
    setChecking(false);
    if (!okNames.length) return;
    onChange([...chips, ...okNames.filter((n) => !has(n))].slice(0, max).join("; "));
    setDraft("");
    setHi(0);
  };
  const remove = (i: number) => onChange(chips.filter((_, k) => k !== i).join("; "));

  useEffect(() => {
    const close = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div className="chips" ref={boxRef} role="group" aria-label="Daftar wilayah yang dibandingkan">
      {chips.map((c, i) => (
        <span className="achip" key={c + i}>
          {c}
          <button type="button" aria-label={"Hapus " + c} onClick={(e) => { e.stopPropagation(); remove(i); }}>×</button>
        </span>
      ))}
      {chips.length < max && (
        <input
          ref={inputRef}
          value={draft}
          role="combobox"
          aria-label="Tambah wilayah"
          aria-autocomplete="list"
          aria-expanded={open && matches.length > 0}
          aria-controls={listId}
          placeholder={chips.length ? "wilayah lain" : placeholder}
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(e) => { setDraft(e.target.value); setOpen(true); setHi(0); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ";" || e.key === ",") {
              e.preventDefault();
              if (checking) return;
              const typed = draft.trim();
              const exact = matches.find((m) => m.toLowerCase() === typed.toLowerCase());
              if (exact) addKnown(exact);
              else if (open && matches[hi] && typed === "") addKnown(matches[hi]!);
              else void addTyped(draft);
            } else if (e.key === "Backspace" && draft === "" && chips.length) {
              remove(chips.length - 1);
            } else if (e.key === "ArrowDown" && matches.length) {
              e.preventDefault(); setOpen(true); setHi((h) => (h + 1) % matches.length);
            } else if (e.key === "ArrowUp" && matches.length) {
              e.preventDefault(); setHi((h) => (h - 1 + matches.length) % matches.length);
            } else if (e.key === "Escape") {
              setOpen(false);
              setErr("");
            }
          }}
        />
      )}
      {open && matches.length > 0 && (
        <ul className="chips-dd" id={listId} role="listbox" aria-label="Saran wilayah">
          {matches.map((m, i) => (
            <li key={m} role="option" aria-selected={i === hi} className={i === hi ? "on" : ""}
              onMouseDown={(e) => { e.preventDefault(); addKnown(m); }} onMouseEnter={() => setHi(i)}>
              {m}
            </li>
          ))}
        </ul>
      )}
      <span className="chips-n">{checking ? "cek peta…" : `${chips.length}/${max}`}</span>
      {err && <span className="chips-err" role="alert">{err}</span>}
    </div>
  );
}
