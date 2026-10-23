"use client";
// Halaman Asisten: tur + panel chat bersama (components/chat/ChatPanel). State percakapan ada di lib/chat/store,
// sehingga obrolan yang sama lanjut di panel melayang (tombol "Tanya asisten") saat berpindah halaman.
// Dulu di "/"; pindah ke /chat karena "/" sekarang landing page publik.
import ChatPanel from "@/components/chat/ChatPanel";
import { useTour } from "@/components/Tour";
import { CHAT_TOUR } from "@/lib/tours";

export default function ChatPage() {
  useTour("chat", CHAT_TOUR);
  return <ChatPanel variant="page" />;
}
