import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CHIPS, NO_KEY_MSG } from "@/lib/chat/steps";
import { resetChat } from "@/lib/chat/store";
import { resetMe } from "@/lib/me";
import { json, lastBody, me, mockFetch, org, type Route } from "@/test/helpers";
import ChatPanel from "./ChatPanel";

vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }) }));

const BASE: Record<string, Route> = {
  "GET /auth/me": me(),
  "GET /org": org(),
  "GET /chat/sessions": { sessions: [] },
  "GET /chat/suggestions": { suggestions: [] },
  "POST /chat/sid": { sid: "s-baru" },
};

async function openPanel() {
  render(<ChatPanel variant="page" />);
  const ta = await screen.findByLabelText("Pertanyaan");
  await waitFor(() => expect(ta).toBeEnabled());
  return ta;
}

beforeEach(() => {
  resetChat();
  resetMe();
});

describe("ChatPanel", () => {
  it("memuat riwayat sesi tersimpan, daftar sesi, dan sisa kuota", async () => {
    localStorage.setItem("raqio:org1:sid", "s1");
    const fetchMock = mockFetch({
      ...BASE,
      "GET /chat/messages": {
        messages: [
          { id: 1, role: "user", content: "halo", created_at: "2026-10-20T10:00:00Z", job_id: 3 },
          { id: 2, role: "assistant", content: "**Hai** juga", created_at: "2026-10-20T10:00:05Z", job_id: 3 },
        ],
      },
      "GET /chat/sessions": { sessions: [{ id: "s1", title: "halo", last_message_at: "2026-10-20T10:00:05Z", created_at: "2026-10-20T10:00:00Z" }] },
    });
    const user = userEvent.setup();
    await openPanel();
    expect(screen.getByText("halo", { selector: ".msg" })).toHaveClass("me");
    expect(screen.getByText("Hai").tagName).toBe("STRONG");
    expect(fetchMock).toHaveBeenCalledWith("/chat/messages?sid=s1", expect.anything());
    expect(fetchMock).not.toHaveBeenCalledWith("/chat/sid", expect.anything());
    expect(await screen.findByText("Sisa kuota chat bulan ini: 47 dari 50.")).toBeInTheDocument();

    await user.click(screen.getByText("Riwayat"));
    const list = await screen.findByRole("list", { name: "Percakapan sebelumnya" });
    expect(within(list).getByText("halo")).toBeInTheDocument();
    expect(within(list).getByRole("button", { name: "Hapus percakapan halo" })).toBeInTheDocument();
  });

  it("tanpa sid tersimpan: minta sid ke server lalu menyimpannya per org", async () => {
    const fetchMock = mockFetch(BASE);
    await openPanel();
    expect(fetchMock).toHaveBeenCalledWith("/chat/sid", expect.objectContaining({ method: "POST" }));
    expect(localStorage.getItem("raqio:org1:sid")).toBe("s-baru");
  });

  it("chip saran dari server maksimal 4; klik mengirim pertanyaan dengan konteks halaman", async () => {
    const fetchMock = mockFetch({
      ...BASE,
      "GET /chat/suggestions": { suggestions: ["Siapa pemimpin pasar?", "dua", "tiga", "empat", "lima"] },
      "POST /chat": { job: 9, sid: "s-baru" },
      "GET /chat/poll": { done: true, answer: "Jawaban singkat.", steps: [] },
    });
    const user = userEvent.setup();
    await openPanel();
    const chips = await screen.findByRole("group", { name: "Saran pertanyaan" });
    expect(within(chips).getAllByRole("button")).toHaveLength(4);
    await user.click(within(chips).getByRole("button", { name: "Siapa pemimpin pasar?" }));
    expect(await screen.findByText("Jawaban singkat.")).toBeInTheDocument();
    expect(lastBody(fetchMock, "/chat")).toEqual({ sid: "s-baru", message: "Siapa pemimpin pasar?", context: { page: "/" } });
    expect(fetchMock.mock.calls.some(([u]) => String(u).startsWith("/chat/suggestions?page=%2F"))).toBe(true);
  });

  it("endpoint saran gagal: jatuh ke chip bawaan", async () => {
    mockFetch({ ...BASE, "GET /chat/suggestions": json({ error: "rusak" }, 500) });
    await openPanel();
    const chips = await screen.findByRole("group", { name: "Saran pertanyaan" });
    expect(within(chips).getAllByRole("button").map((b) => b.textContent)).toEqual(CHIPS.slice(0, 4));
  });

  it("langkah 🔧 tampil sebagai label selama job berjalan, lalu jawaban menggantikannya", async () => {
    let polls = 0;
    mockFetch({
      ...BASE,
      "POST /chat": { job: 7, sid: "s-baru" },
      "GET /chat/poll": () => {
        polls += 1;
        return polls === 1
          ? { steps: ['🔧 search_competitors({"q":"kopi kemang"})', "membaca 12 hasil"], done: false }
          : { steps: ['🔧 search_competitors({"q":"kopi kemang"})', "membaca 12 hasil"], done: true, answer: "Selesai **ya**" };
      },
    });
    const user = userEvent.setup();
    const ta = await openPanel();
    await user.type(ta, "kompetitor kopi di kemang{Enter}");
    expect(await screen.findByText("Mencari bisnis di lokasi (bisa beberapa menit)… (kopi kemang)")).toBeInTheDocument();
    expect(screen.getByText("membaca 12 hasil")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument();
    expect(await screen.findByText("ya", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByText("1 langkah agent")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kirim" })).toBeInTheDocument();
  });

  it("kunci API belum diisi: pesan 'belum dikonfigurasi' tampil", async () => {
    mockFetch({ ...BASE, "POST /chat": json({ error: "OPENROUTER_API_KEY belum diisi" }, 500) });
    const user = userEvent.setup();
    const ta = await openPanel();
    await user.type(ta, "halo{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent(NO_KEY_MSG);
  });

  it("sesi dengan active_job: stream dilanjutkan sampai jawaban tiba", async () => {
    localStorage.setItem("raqio:org1:sid", "s1");
    mockFetch({
      ...BASE,
      "GET /chat/messages": { sid: "s1", title: "halo", active_job: 11, messages: [{ id: 1, role: "user", content: "halo", created_at: "2026-10-20T10:00:00Z", job_id: 11 }] },
      "GET /chat/poll": { job: 11, status: "done", done: true, answer: "Lanjutan setelah reload." },
    });
    await openPanel();
    expect(await screen.findByText("Lanjutan setelah reload.")).toBeInTheDocument();
  });

  it("409 chat_busy: 'Agent masih menjawab'", async () => {
    mockFetch({ ...BASE, "POST /chat": json({ error: "Masih ada job.", code: "chat_busy" }, 409) });
    const user = userEvent.setup();
    const ta = await openPanel();
    await user.type(ta, "halo{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Agent masih menjawab");
  });

  it("402 quota_exceeded: pesan kuota dengan tautan ke Pengaturan", async () => {
    mockFetch({ ...BASE, "POST /chat": json({ error: "Kuota chat habis", code: "quota_exceeded" }, 402) });
    const user = userEvent.setup();
    const ta = await openPanel();
    await user.type(ta, "halo{Enter}");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Kuota chat bulan ini habis.");
    expect(within(alert).getByRole("link", { name: "Lihat paket di Pengaturan" })).toHaveAttribute("href", "/settings");
  });
});
