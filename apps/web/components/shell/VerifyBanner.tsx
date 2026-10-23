"use client";
// Pengingat verifikasi email di bar notifikasi bersama. Bisa ditutup untuk satu sesi tab (sessionStorage).
import { useEffect, useState } from "react";
import { apiPost, errMsg, type Me } from "@/lib/api";
import { useNotice } from "./ToastContext";

export const VERIFY_DISMISS_KEY = "raqio:verify-dismissed";

export default function VerifyBanner({ me }: { me: Me | null }) {
  const { notify, dismiss, toast } = useNotice();
  const [hidden, setHidden] = useState(true); // mulai tersembunyi supaya tidak berkedip sebelum sessionStorage terbaca
  useEffect(() => {
    try {
      setHidden(sessionStorage.getItem(VERIFY_DISMISS_KEY) === "1");
    } catch {
      setHidden(false);
    }
  }, []);
  const show = !!me && !me.guest && !me.verified && !hidden;
  useEffect(() => {
    if (!show) return;
    notify({
      id: "verify",
      kind: "info",
      text: "Verifikasi email kamu untuk membuka undangan, API key, dan notifikasi.",
      actions: [
        {
          label: "Kirim ulang",
          onClick: async () => {
            try {
              await apiPost("/auth/resend-verify", {});
              toast("Email verifikasi dikirim ulang. Cek kotak masuk atau folder spam.");
            } catch (e) {
              toast(errMsg(e, "Gagal mengirim ulang."), "error");
            }
          },
        },
      ],
      onClose: () => {
        try {
          sessionStorage.setItem(VERIFY_DISMISS_KEY, "1");
        } catch {}
        setHidden(true);
      },
    });
    return () => dismiss("verify");
  }, [show, notify, dismiss, toast]);
  return null;
}
