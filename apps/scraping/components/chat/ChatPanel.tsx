"use client";
// Komponen chat bersama: halaman / memakai variant "page" (hero penuh), panel melayang dari Fab memakai "drawer".
// Semua state ada di lib/chat/store (satu percakapan per tab), komponen ini hanya tampilan dan input lokal.
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import "@/app/chat.css";
import { activate, ask, deleteSession, loadSuggestions, newChat, openSession, retry, stop, useChatState } from "@/lib/chat/store";
import ChatComposer from "./ChatComposer";
import ChatHero from "./ChatHero";
import ChatHistory from "./ChatHistory";
import ChatMessage from "./ChatMessage";

export default function ChatPanel({ variant }: { variant: "page" | "drawer" }) {
  const s = useChatState();
  const pathname = usePathname();
  const [input, setInput] = useState("");
  const box = useRef<HTMLDivElement>(null);

  // inisialisasi sekali per sesi login; saran pertanyaan mengikuti halaman yang sedang dibuka
  useEffect(() => {
    let alive = true;
    void activate().then(() => {
      if (alive) void loadSuggestions();
    });
    return () => {
      alive = false;
    };
  }, [pathname]);
  useEffect(() => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [s.msgs]);

  const send = () => {
    const t = input.trim();
    if (!t || s.running) return;
    setInput("");
    void ask(t);
  };
  const last = s.msgs[s.msgs.length - 1];
  const showChips = !s.running && s.ready && (s.msgs.length === 0 || (last?.role === "assistant" && last.done && !last.error));

  return (
    <div className={"chatp " + variant}>
      <ChatHistory sessions={s.sessions} sid={s.sid} onOpen={(id) => void openSession(id)} onDelete={(id) => void deleteSession(id)} onNew={() => void newChat()} />
      <div className="msgs" ref={box}>
        <div className="list">
          {s.msgs.length === 0 && (
            <ChatHero compact={variant === "drawer"} ready={s.ready} noKey={s.noKey} disabled={s.disabled} error={s.initError} onRetry={() => void retry()} />
          )}
          {s.msgs.map((m) => (
            <ChatMessage key={m.id} m={m} />
          ))}
        </div>
      </div>
      <ChatComposer
        value={input}
        onChange={setInput}
        running={!!s.running}
        disabled={!s.ready || !!s.disabled}
        quota={s.quota}
        notice={s.notice}
        chips={showChips ? s.suggestions : []}
        onPick={(c) => void ask(c)}
        onSend={send}
        onStop={() => void stop()}
      />
    </div>
  );
}
