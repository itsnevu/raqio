import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import Drawer from "./Drawer";

function Toggle() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>pemicu</button>
      <Drawer open={open} title="Panel uji" body={<button type="button">di dalam</button>} onClose={() => setOpen(false)} />
    </>
  );
}

describe("Drawer", () => {
  it("terbuka sebagai dialog modal dengan judul", () => {
    render(<Drawer open title="Panel uji" body={<p>isi</p>} onClose={() => {}} />);
    const d = screen.getByRole("dialog", { name: "Panel uji" });
    expect(d).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("isi")).toBeInTheDocument();
  });

  it("Escape memanggil onClose", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Drawer open title="Panel uji" body={<p>isi</p>} onClose={onClose} />);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("fokus pindah ke tombol tutup saat dibuka dan kembali ke pemicu saat ditutup", async () => {
    const user = userEvent.setup();
    render(<Toggle />);
    const trigger = screen.getByRole("button", { name: "pemicu" });
    await user.click(trigger);
    await waitFor(() => expect(screen.getByRole("button", { name: "Tutup panel" })).toHaveFocus());
    await user.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
