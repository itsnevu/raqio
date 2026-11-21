import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ChatSteps from "./ChatSteps";

describe("ChatSteps", () => {
  it("baris 🔧 dirender sebagai label tool, baris lain sebagai progres kecil", () => {
    const { container } = render(<ChatSteps live steps={['🔧 search_competitors({"q":"kopi kemang","fresh":true})', "membaca 12 hasil", "🔧 alat_baru({})"]} />);
    expect(screen.getByText("Mencari bisnis di lokasi (bisa beberapa menit)… (kopi kemang)")).toBeInTheDocument();
    expect(screen.getByText("alat_baru")).toBeInTheDocument();
    expect(screen.getByText("membaca 12 hasil")).toHaveClass("note");
    expect(container.querySelectorAll(".step.tool")).toHaveLength(2);
    expect(container.querySelectorAll(".step.note")).toHaveLength(1);
  });

  it("setelah selesai daftar dilipat dengan jumlah langkah tool", () => {
    render(<ChatSteps live={false} steps={["🔧 list_competitors({})", "catatan"]} />);
    expect(screen.getByText("1 langkah agent")).toBeInTheDocument();
    expect(document.querySelector("details.steps")).not.toHaveAttribute("open");
  });

  it("tidak merender apa pun tanpa langkah", () => {
    const { container } = render(<ChatSteps live steps={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
