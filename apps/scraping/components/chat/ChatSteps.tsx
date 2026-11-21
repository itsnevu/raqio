"use client";
// Langkah agent dari baris log job: baris "🔧 tool(args)" jadi label tool yang mudah dibaca, baris lain progres kecil.
// Saat jawaban sudah selesai, daftar dilipat supaya jawabannya yang menonjol.
import { isToolStep, stepText } from "@/lib/chat/steps";

export default function ChatSteps({ steps, live }: { steps: string[]; live: boolean }) {
  if (!steps.length) return null;
  const items = steps.map((s, i) =>
    isToolStep(s) ? (
      <div key={i} className="step tool">
        <span className="ico" aria-hidden="true">🔧</span>
        <span>{stepText(s)}</span>
      </div>
    ) : (
      <div key={i} className="step note">{s}</div>
    ),
  );
  if (live) return <div className="steps" aria-label="Langkah agent">{items}</div>;
  const n = steps.filter(isToolStep).length;
  return (
    <details className="steps done">
      <summary>{n ? `${n} langkah agent` : "Catatan proses"}</summary>
      {items}
    </details>
  );
}
