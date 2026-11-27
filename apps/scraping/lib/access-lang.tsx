"use client";
import { createContext, useContext, type ReactNode } from "react";

/**
 * Bahasa halaman akses (masuk, daftar, lupa password). Mengikuti pilihan bahasa di situs Raqio:
 * situs mengirim ?lang=en|id di tautan Masuk, middleware menyimpannya ke cookie raqio_lang dan meneruskannya
 * lewat header x-raqio-lang, layout membacanya sehingga render pertama sudah dalam bahasa yang benar.
 */
export type AccessLang = "en" | "id";
export const LANG_COOKIE = "raqio_lang";

const Ctx = createContext<AccessLang>("id");
export function AccessLangProvider({ initial, children }: { initial: AccessLang; children: ReactNode }) {
  return <Ctx.Provider value={initial}>{children}</Ctx.Provider>;
}
export const useAccessLang = () => useContext(Ctx);

const id = {
  back: "Kembali ke beranda",
  eyebrow: "Satu akun Raqio",
  panelTitle: "Satu login untuk keempat agen AI Raqio.",
  panelNote: "Setelah masuk, pilih agen yang ingin dibuka. Customer Service Agent terbuka di WA-Suite tanpa login ulang.",
  legal: ["Dengan menggunakan Raqio, Anda menyetujui ", "Syarat & Ketentuan", " dan ", "Kebijakan Privasi", "."],
  legalLabel: "Informasi legal",
  agents: {
    research: "Memetakan setiap usaha di industri dan wilayah Anda, lalu memberi skor prospek 0–100. Usaha dengan skor 40 ke atas layak dihubungi.",
    seo: "Menghitung skor peringkat 0–100 per industri dan wilayah: 60% kualitas ulasan, 25% skala usaha, 15% jangkauan.",
    marketing: "Menyusun dan mengirim pesan personal lewat WhatsApp, Instagram, dan email ke prospek yang dipilih berdasarkan skornya.",
    cs: "Mengelola dashboard WhatsApp tim, deal, dan pengingat DP. Chat yang belum dibalas 4 jam operasional dihitung tidak terjawab.",
  } as Record<string, string>,
  login: {
    title: "Masuk",
    lead: "Satu akun untuk Research, SEO, Marketing, dan Customer Service Agent.",
    email: "Email",
    password: "Password",
    forgot: "Lupa password?",
    show: "Tampilkan",
    hide: "Sembunyikan",
    submit: "Masuk",
    checking: "Memeriksa…",
    guest: "Coba tanpa daftar",
    guestTitle: "Org sementara dengan kuota uji coba, dihapus otomatis. Bisa disimpan jadi akun kapan saja.",
    noAccount: "Belum punya akun?",
    register: "Daftar",
    wait: "Sebentar…",
    preparing: "Menyiapkan sesi tamu.",
    guestFail: "Mode tamu tidak tersedia.",
    loginFail: "Gagal masuk.",
    dialogTitle: "Mulai dengan Raqio",
    dialogBody: "Buat workspace baru untuk tim Anda, atau buka tautan undangan dari admin untuk bergabung.",
    create: "Buat akun",
    close: "Tutup",
    msg: {
      "reset-ok": "Password berhasil diganti. Masuk dengan password baru.",
      verified: "Email terverifikasi. Silakan masuk.",
      "verify-gagal": "Tautan verifikasi tidak valid atau kedaluwarsa.",
    } as Record<string, string>,
    // akses lewat undangan (API INVITE_ONLY)
    inviteOnlyTitle: "Raqio hanya lewat undangan",
    inviteOnlyBody: "Akun Raqio saat ini hanya lewat undangan. Minta admin akun Raqio Anda untuk mengundang Anda.",
    haveCode: "Punya kode undangan?",
    useCode: "Pakai kode undangan",
  },
  invite: {
    title: "Masukkan kode undangan",
    lead: "Selama akses awal, akun Raqio dibuat lewat undangan. Masukkan kode yang Anda terima untuk membuat akun.",
    label: "Kode undangan",
    submit: "Lanjut",
    checking: "Memeriksa…",
    invalid: "Kode undangan tidak valid, kedaluwarsa, atau sudah habis dipakai.",
    fail: "Kode belum bisa diperiksa. Coba lagi.",
    noCode: "Belum punya kode? Minta ke admin akun Raqio Anda.",
    back: "Kembali ke masuk",
  },
};

const en: typeof id = {
  back: "Back to home",
  eyebrow: "One Raqio account",
  panelTitle: "One login for all four Raqio agents.",
  panelNote: "After you sign in, pick the agent you want to open. Customer Service Agent opens in WA-Suite with the same account.",
  legal: ["By using Raqio, you agree to the ", "Terms & Conditions", " and ", "Privacy Policy", "."],
  legalLabel: "Legal information",
  agents: {
    research: "Maps every business in your industry and area, then scores who is worth contacting.",
    seo: "Audits your local visibility against your nearest competitors and publishes your ranking.",
    marketing: "Writes and sends personal messages over WhatsApp, Instagram and email.",
    cs: "Runs a shared WhatsApp inbox, deals, reminders and analytics.",
  },
  login: {
    title: "Sign in",
    lead: "One account for the Research, SEO, Marketing and Customer Service Agents.",
    email: "Email",
    password: "Password",
    forgot: "Forgot password?",
    show: "Show",
    hide: "Hide",
    submit: "Sign in",
    checking: "Checking…",
    guest: "Try without signing up",
    guestTitle: "A temporary org with a trial quota, deleted automatically. You can save it as an account at any time.",
    noAccount: "No account yet?",
    register: "Sign up",
    wait: "One moment…",
    preparing: "Setting up a guest session.",
    guestFail: "Guest mode is not available.",
    loginFail: "Could not sign in.",
    dialogTitle: "Get started with RAQIO",
    dialogBody: "Create a new workspace for your team, or open the invite link from your admin to join.",
    create: "Create account",
    close: "Close",
    msg: {
      "reset-ok": "Password changed. Sign in with your new password.",
      verified: "Email verified. Please sign in.",
      "verify-gagal": "The verification link is invalid or has expired.",
    },
    inviteOnlyTitle: "Raqio is invite-only",
    inviteOnlyBody: "Raqio accounts are invite-only. Ask an admin of your Raqio account to invite you.",
    haveCode: "Have an invite code?",
    useCode: "Use an invite code",
  },
  invite: {
    title: "Enter your invite code",
    lead: "During early access, Raqio accounts are created by invitation. Enter the code you received to create your account.",
    label: "Invite code",
    submit: "Continue",
    checking: "Checking…",
    invalid: "This invite code is invalid, expired, or fully used.",
    fail: "The code could not be checked. Try again.",
    noCode: "No code yet? Ask an admin of your Raqio account.",
    back: "Back to sign in",
  },
};

export const ACCESS_TEXT: Record<AccessLang, typeof id> = { id, en };
export const useAccessText = () => ACCESS_TEXT[useAccessLang()];
