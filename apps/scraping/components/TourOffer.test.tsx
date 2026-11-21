import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NoticeBar, ToastProvider } from "./shell/ToastContext";
import { TOUR_EVENT, TOUR_OFFER_EVENT, TourOffer } from "./Tour";

const offer = (name: string | null) => act(() => { window.dispatchEvent(new CustomEvent(TOUR_OFFER_EVENT, { detail: { name } })); });
const ui = () => render(<ToastProvider><TourOffer /><NoticeBar /></ToastProvider>);

describe("TourOffer", () => {
  it("tidak tampil sebelum ada tawaran, lalu tampil di bar notifikasi saat halaman meminta", () => {
    ui();
    expect(screen.queryByRole("status")).toBeNull();
    offer("market");
    expect(screen.getByRole("status")).toHaveTextContent(/panduan/i);
  });

  it("Mulai panduan memicu event tur dan menutup tawaran", async () => {
    const started = vi.fn();
    window.addEventListener(TOUR_EVENT, started);
    ui();
    offer("market");
    await userEvent.click(screen.getByRole("button", { name: /mulai panduan/i }));
    expect(started).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("status")).toBeNull();
    window.removeEventListener(TOUR_EVENT, started);
  });

  it("Nanti saja menandai tur sudah dilihat supaya tidak ditawarkan lagi", async () => {
    ui();
    offer("watch");
    await userEvent.click(screen.getByRole("button", { name: /nanti/i }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(localStorage.getItem("tour:watch")).toBe("1");
  });

  it("tombol × sama dengan Nanti saja", async () => {
    ui();
    offer("prospects");
    await userEvent.click(screen.getByRole("button", { name: "Tutup notifikasi" }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(localStorage.getItem("tour:prospects")).toBe("1");
  });

  it("pindah halaman menutup tawaran", () => {
    ui();
    offer("campaigns");
    expect(screen.getByRole("status")).toBeInTheDocument();
    offer(null);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
