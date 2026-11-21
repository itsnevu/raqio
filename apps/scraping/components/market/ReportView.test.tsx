import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Biz } from "@/lib/biz";
import type { Report } from "@/lib/market/types";
import { lastBody, mockFetch } from "@/test/helpers";
import ReportView from "./ReportView";

vi.mock("@/components/Shell", () => ({
  useShell: () => ({ openBusiness: vi.fn(), openDrawer: vi.fn(), closeDrawer: vi.fn(), notify: vi.fn(), askNotify: vi.fn() }),
  useToast: () => vi.fn(),
}));

const biz = (o: Partial<Biz>): Biz => ({ name: "X", ...o });
const R: Report = {
  id: 1, industry: "coffee shop", area: "Kemang", created: "2026-10-01T00:00:00Z",
  summary: { businesses: 2, top3_share: 40, avg_rating: 4.5 },
  digital: { sampled: 2, website: 50, instagram: 50, whatsapp: 100, phone: 100 },
  insights: [], rating_buckets: [], size_buckets: [], leaders: [],
  all: [
    biz({ key: "a", name: "Kopi A", _detailed: true, rating: 4.8, reviews: 120, phone: "081234567890", lead_score: 70, lead_reasons: ["tanpa website"] }),
    biz({ key: "b", name: "Kopi B", _detailed: true, rating: 4.2, reviews: 500, website: "https://b.id", instagram: "kopib", phone: "081234567891", lead_score: 20 }),
  ],
};

function Harness() {
  const [rep, setRep] = useState(R);
  return <ReportView R={rep} rival={false} current={1} watched={false} onSwapGoal={() => {}} onReport={(f) => setRep((r) => f(r))} />;
}

describe("BizTable di dalam ReportView", () => {
  it("mengubah status lead memperbarui hitungan dan daftar filter Follow up", async () => {
    const fetchMock = mockFetch({ "POST /market/lead": { ok: true } });
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("tab", { name: /Semua pemain/ }));
    const follow = screen.getByRole("button", { name: /Follow up/ });
    expect(follow).toHaveTextContent("Follow up0");
    expect(screen.getByRole("button", { name: "Kopi B" })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Status follow up Kopi A"), "dihubungi");
    await waitFor(() => expect(follow).toHaveTextContent("Follow up1"));
    expect(lastBody(fetchMock, "/market/lead")).toMatchObject({ key: "a", status: "dihubungi" });

    await user.click(follow);
    expect(screen.getByRole("button", { name: "Kopi A" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Kopi B" })).not.toBeInTheDocument();
    expect(screen.getByText("1 dari 2 bisnis")).toBeInTheDocument();
  });

  it("status gagal disimpan tidak mengubah daftar", async () => {
    mockFetch({ "POST /market/lead": () => new Response(JSON.stringify({ error: "Gagal" }), { status: 500, headers: { "Content-Type": "application/json" } }) });
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("tab", { name: /Semua pemain/ }));
    await user.selectOptions(screen.getByLabelText("Status follow up Kopi A"), "tertarik");
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: /Follow up/ })).toHaveTextContent("Follow up0");
  });
});
