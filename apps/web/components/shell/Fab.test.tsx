import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ShellProvider } from "@/components/Shell";
import { resetChat } from "@/lib/chat/store";
import { resetMe } from "@/lib/me";
import { lastBody, me, mockFetch, org } from "@/test/helpers";

vi.mock("next/navigation", () => ({ usePathname: () => "/market", useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }) }));

beforeEach(() => {
  resetChat();
  resetMe();
  window.history.pushState({}, "", "/market");
});

describe("Fab", () => {
  it("Tanya asisten membuka panel chat di drawer dan pertanyaan membawa konteks halaman", async () => {
    const fetchMock = mockFetch({
      "GET /auth/me": me(),
      "GET /prospects/data": { items: [] },
      "GET /org": org(),
      "GET /chat/sessions": { sessions: [] },
      "GET /chat/suggestions": { suggestions: ["Apa yang berubah minggu ini?"] },
      "POST /chat/sid": { sid: "s-fab" },
      "POST /chat": { job: 2, sid: "s-fab" },
      "GET /chat/poll": { done: true, answer: "Dari panel." },
    });
    const user = userEvent.setup();
    render(
      <ShellProvider>
        <p>isi halaman</p>
      </ShellProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Tanya asisten" }));
    const dialog = await screen.findByRole("dialog", { name: "Asisten" });
    const ta = await within(dialog).findByLabelText("Pertanyaan");
    await waitFor(() => expect(ta).toBeEnabled());
    expect(within(dialog).getByRole("button", { name: "Apa yang berubah minggu ini?" })).toBeInTheDocument();
    await user.type(ta, "halo dari market{Enter}");
    expect(await within(dialog).findByText("Dari panel.")).toBeInTheDocument();
    expect(lastBody(fetchMock, "/chat")).toEqual({ sid: "s-fab", message: "halo dari market", context: { page: "/market" } });
    expect(fetchMock.mock.calls.some(([u]) => String(u).startsWith("/chat/suggestions?page=%2Fmarket"))).toBe(true);
  });
});
