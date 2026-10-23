import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { RunArgs } from "@/lib/market/types";
import RunForm, { type Suggestion } from "./RunForm";

function Harness({ running = false, suggest = [], onRun }: { running?: boolean; suggest?: Suggestion[]; onRun: (a: RunArgs) => void }) {
  const [industry, setIndustry] = useState("");
  const [area, setArea] = useState("");
  return (
    <RunForm mode="one" goal="client" industry={industry} area={area} running={running} suggest={suggest}
      onMode={() => {}} onGoal={() => {}} onIndustry={setIndustry} onArea={setArea} onRun={onRun} />
  );
}

describe("RunForm", () => {
  it("submit memanggil onRun dengan industri, wilayah, dan fresh=false", async () => {
    const onRun = vi.fn();
    const user = userEvent.setup();
    render(<Harness onRun={onRun} />);
    await user.type(screen.getByLabelText("Industri"), "coffee shop");
    await user.type(screen.getByLabelText("Wilayah"), "Kemang Jakarta");
    await user.click(screen.getByRole("button", { name: "Riset" }));
    expect(onRun).toHaveBeenCalledTimes(1);
    expect(onRun).toHaveBeenCalledWith({ industry: "coffee shop", area: "Kemang Jakarta", fresh: false, mode: "one" });
  });

  it("tombol nonaktif saat riset sedang berjalan", () => {
    render(<Harness running onRun={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Riset" })).toBeDisabled();
  });

  it("chip hasil instan langsung menjalankan riset tanpa fresh", async () => {
    const onRun = vi.fn();
    const user = userEvent.setup();
    render(<Harness suggest={[{ industry: "salon", area: "Dago Bandung", businesses: 12 }]} onRun={onRun} />);
    await user.click(screen.getByRole("button", { name: "salon · Dago Bandung" }));
    expect(onRun).toHaveBeenCalledWith({ industry: "salon", area: "Dago Bandung", fresh: false, mode: "one" });
  });
});
