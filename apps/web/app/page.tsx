"use client";
// Asisten (chat agent). Port dari CHAT_PAGE di app.py. Jawaban markdown dirender sendiri (tanpa library).
import { useEffect, useRef, useState } from "react";
import "./chat.css";

type Msg = { id: number; role: "me" | "bot"; text: string; steps: string[]; error?: string; done: boolean };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
function inline(s: string) {
  return esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<i>$2</i>")
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank">$1</a>')
    .replace(/(^|[\s(])@([A-Za-z0-9_.]{3,30})/g, '$1<a href="https://instagram.com/$2" target="_blank">@$2</a>');
}
function md(text: string) {
  const lines = text.split("\n");
  let out = "",
    i = 0;
  const row = (r: string) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  while (i < lines.length) {
    const l = lines[i];
    if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      out += "<table><thead><tr>" + row(l).map((c) => "<th>" + inline(c) + "</th>").join("") + "</tr></thead><tbody>";
      i += 2;
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        out += "<tr>" + row(lines[i]).map((c) => "<td>" + inline(c) + "</td>").join("") + "</tr>";
        i++;
      }
      out += "</tbody></table>";
      continue;
    }
    if (/^\s*[-*•]\s+/.test(l)) {
      out += "<ul>";
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) out += "<li>" + inline(lines[i++].replace(/^\s*[-*•]\s+/, "")) + "</li>";
      out += "</ul>";
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(l)) {
      out += "<ol>";
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) out += "<li>" + inline(lines[i++].replace(/^\s*\d+[.)]\s+/, "")) + "</li>";
      out += "</ol>";
      continue;
    }
    const h = l.match(/^#{1,4}\s+(.*)/);
    if (h) {
      out += "<h3>" + inline(h[1]) + "</h3>";
      i++;
      continue;
    }
    if (l.trim()) out += "<p>" + inline(l) + "</p>";
    i++;
  }
  return out;
}
const TOOL_LABEL: Record<string, string> = {
  search_competitors: "Mencari bisnis di lokasi (bisa beberapa menit)…",
  list_competitors: "Membaca data tersimpan…",
  scrape_instagram: "Scrape Instagram…",
  google_trends: "Cek Google Trends…",
};
function stepText(s: string) {
  const m = s.match(/^🔧 (\w+)\((.*)\)$/);
  if (!m) return s;
  let args = "";
  try {
    args = Object.values(JSON.parse(m[2]))
      .filter((v) => typeof v !== "boolean")
      .join(" · ");
  } catch {}
  return (TOOL_LABEL[m[1]] || m[1]) + (args ? " (" + args + ")" : "");
}
function actions(answer: string): [string, string][] {
  const a: [string, string][] = [];
  if (/riset|pasar|wilayah|prospek/i.test(answer)) a.push(["/market", "Buka laporan riset"]);
  if (/prospek|whatsapp|hubungi/i.test(answer)) a.push(["/prospects", "Lihat prospek"]);
  if (/instagram|followers|@\w/i.test(answer)) a.push(["/competitors", "Data kompetitor IG"]);
  return a;
}

const CHIPS = [
  "kompetitor coffee shop di Kemang siapa aja?",
  "riset pasar agency di Gading Serpong",
  "salon di Dago Bandung yang paling rame di IG",
  "bandingin Kopi Kenangan sama Janji Jiwa",
];

export default function ChatPage() {
  const [sid, setSid] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState<string | null>(null);
  const [noKey, setNoKey] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    let s = "";
    try {
      s = localStorage.getItem("sid") || "";
    } catch {}
    if (!s) {
      s = Math.random().toString(36).slice(2);
      try {
        localStorage.setItem("sid", s);
      } catch {}
    }
    setSid(s);
  }, []);
  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [msgs]);

  const patch = (id: number, f: (m: Msg) => Msg) => setMsgs((ms) => ms.map((m) => (m.id === id ? f(m) : m)));

  async function ask(text: string) {
    text = text.trim();
    if (!text || running) return;
    setInput("");
    const meId = ++seq.current,
      botId = ++seq.current;
    setMsgs((ms) => [...ms, { id: meId, role: "me", text, steps: [], done: true }, { id: botId, role: "bot", text: "", steps: [], done: false }]);
    const r = await fetch("/chat", { method: "POST", body: JSON.stringify({ sid, message: text }) });
    const j = await r.json();
    if (!r.ok) {
      if (/OPENROUTER_API_KEY/.test(j.error || "")) setNoKey(true);
      patch(botId, (m) => ({ ...m, done: true, error: j.error }));
      return;
    }
    setRunning(j.job);
    const poll = async () => {
      const p = await (await fetch("/chat/poll?job=" + j.job)).json();
      patch(botId, (m) => ({ ...m, steps: p.steps, done: !!p.done, error: p.error || undefined, text: p.answer || "" }));
      if (p.done) setRunning(null);
      else setTimeout(poll, 1200);
    };
    poll();
  }
  async function stop() {
    if (running) await fetch("/chat/stop", { method: "POST", body: JSON.stringify({ job: running }) });
  }
  function newChat() {
    const s = Math.random().toString(36).slice(2);
    try {
      localStorage.setItem("sid", s);
    } catch {}
    setSid(s);
    setMsgs([]);
  }

  return (
    <div className="chatp">
      <div id="msgs" ref={box}>
        <div className="wrap" id="list">
          {msgs.length === 0 && (
            <div className="hero">
              <h1>
                Kenali pasarmu. <span>Temukan celahnya.</span>
              </h1>
              <p className="lead">
                Tanya bebas soal bisnis apa pun di lokasi mana pun. Agent akan mencari pemainnya, mengecek IG, website, dan tren, lalu merangkum siapa yang kuat,
                siapa yang lemah, dan di mana peluangnya.
              </p>
              <div className="chips">
                {CHIPS.map((c) => (
                  <span key={c} className="chip" onClick={() => ask(c)}>
                    {c}
                  </span>
                ))}
              </div>
              {noKey && (
                <div className="note">
                  <b>Chat dengan agent belum aktif.</b> Isi <code>OPENROUTER_API_KEY</code> di file <code>services/scraper/.env</code>, lalu jalankan ulang
                  service Python. Riset pasar dan mode manual tetap bisa dipakai tanpa key.
                </div>
              )}
              <div className="feats">
                <a className="feat" href="/market">
                  <b>Riset pasar</b>
                  <span>Peta pemain per industri dan wilayah, skor kekuatan, dan prospek siap dihubungi.</span>
                  <em>Buka →</em>
                </a>
                <a className="feat" href="/competitors" target="_blank">
                  <b>Kompetitor IG</b>
                  <span>Followers, engagement, dan pertumbuhan akun Instagram pesaing.</span>
                  <em>Buka →</em>
                </a>
                <a className="feat" href="/tools">
                  <b>Mode manual</b>
                  <span>Atur sendiri kategori, radius, dan jumlah akun yang di-scrape.</span>
                  <em>Buka →</em>
                </a>
              </div>
            </div>
          )}
          {msgs.map((m) =>
            m.role === "me" ? (
              <div key={m.id} className="msg me">
                {m.text}
              </div>
            ) : (
              <div key={m.id} className="msg bot">
                {m.steps.length > 0 && (
                  <div className="steps">
                    {m.steps.map((s, i) => (
                      <div key={i}>{stepText(s)}</div>
                    ))}
                  </div>
                )}
                {!m.done ? (
                  <div className="typing" />
                ) : m.error ? (
                  <span className="err">{m.error}</span>
                ) : (
                  <>
                    <div dangerouslySetInnerHTML={{ __html: md(m.text) }} />
                    {actions(m.text).length > 0 && (
                      <div className="acts">
                        {actions(m.text).map(([h, l]) => (
                          <a key={h} className="btn ghost" href={h} target="_top">
                            {l}
                          </a>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            ),
          )}
        </div>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (running) stop();
          else ask(input);
        }}
      >
        <div className="wrap">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Tanya soal pasar atau kompetitor…"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!running) ask(input);
              }
            }}
          />
          <button className={"btn" + (running ? " stop" : "")} id="send" type="submit">
            {running ? "Stop" : "Kirim"}
          </button>
        </div>
        <div className="hint">
          Enter untuk kirim, Shift+Enter untuk baris baru ·{" "}
          <a href="#" onClick={(e) => { e.preventDefault(); newChat(); }}>
            Chat baru
          </a>
        </div>
      </form>
    </div>
  );
}
