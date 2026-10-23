import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { me, mockFetch } from "@/test/helpers";
import { NoticeBar, ToastProvider } from "./ToastContext";
import VerifyBanner, { VERIFY_DISMISS_KEY } from "./VerifyBanner";

const ui = (m: Parameters<typeof VerifyBanner>[0]["me"]) => (
  <ToastProvider>
    <VerifyBanner me={m} />
    <NoticeBar />
  </ToastProvider>
);

describe("VerifyBanner", () => {
  it("muncul di bar notifikasi bila email belum diverifikasi", () => {
    render(ui(me({ verified: false })));
    expect(screen.getByRole("status")).toHaveTextContent("Verifikasi email kamu untuk membuka undangan, API key, dan notifikasi.");
    expect(screen.getByRole("button", { name: "Kirim ulang" })).toBeInTheDocument();
  });

  it("tidak muncul bila sudah terverifikasi, tamu, atau profil belum ada", () => {
    const { rerender } = render(ui(me({ verified: true })));
    expect(screen.queryByRole("status")).toBeNull();
    rerender(ui(me({ verified: false, guest: true })));
    expect(screen.queryByRole("status")).toBeNull();
    rerender(ui(null));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("Kirim ulang memanggil POST /auth/resend-verify dan menampilkan konfirmasi", async () => {
    const fetchMock = mockFetch({ "POST /auth/resend-verify": { ok: true } });
    const user = userEvent.setup();
    render(ui(me({ verified: false })));
    await user.click(screen.getByRole("button", { name: "Kirim ulang" }));
    expect(await screen.findByText(/Email verifikasi dikirim ulang/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/auth/resend-verify", expect.objectContaining({ method: "POST" }));
  });

  it("bisa ditutup dengan × untuk sesi ini (sessionStorage)", async () => {
    const user = userEvent.setup();
    const { unmount } = render(ui(me({ verified: false })));
    await user.click(screen.getByRole("button", { name: "Tutup notifikasi" }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(sessionStorage.getItem(VERIFY_DISMISS_KEY)).toBe("1");
    unmount();
    render(ui(me({ verified: false })));
    expect(screen.queryByRole("status")).toBeNull();
  });
});
