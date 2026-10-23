"use client";
// Satu gelembung percakapan. Jawaban markdown dirender react-markdown (tanpa HTML mentah), link hanya http(s).
import Link from "next/link";
import type { ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { actions } from "@/lib/chat/steps";
import type { Msg } from "@/lib/chat/types";
import { safeHttpUrl } from "@/lib/safe";
import ChatSteps from "./ChatSteps";

// Tautan di jawaban: hanya http(s), dibuka di tab baru tanpa referrer. Skema lain dirender sebagai teks.
const MdLink = ({ href, children }: ComponentProps<"a">) => {
  const u = safeHttpUrl(href);
  return u ? <a href={u} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>;
};
const MD_COMPONENTS = { a: MdLink, img: () => null };

export default function ChatMessage({ m }: { m: Msg }) {
  if (m.role === "user") return <div className="msg me">{m.text}</div>;
  const acts = m.done && !m.error ? actions(m.text) : [];
  return (
    <div className="msg bot" aria-live="polite">
      <ChatSteps steps={m.steps} live={!m.done} />
      {!m.done ? (
        <div className="typing" aria-label="Sedang mengetik" />
      ) : m.error ? (
        <span className="err" role="alert">
          {m.error}
          {m.errorCode === "quota" && (
            <>
              {" "}
              <Link href="/settings">Lihat paket di Pengaturan</Link>.
            </>
          )}
        </span>
      ) : (
        <>
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS} skipHtml>
            {m.text}
          </ReactMarkdown>
          {acts.length > 0 && (
            <div className="acts">
              {acts.map(([h, l]) => (
                <Link key={h} className="btn ghost" href={h}>
                  {l}
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
