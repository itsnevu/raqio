"use client";
// Tombol melayang "Tanya asisten": membuka panel chat yang sama dengan halaman /, tanpa iframe.
// State percakapan ada di lib/chat/store, jadi obrolan lanjut saat berpindah halaman atau panel ditutup.
import { usePathname } from "next/navigation";
import ChatPanel from "@/components/chat/ChatPanel";
import ErrorBoundary from "@/components/ErrorBoundary";
import { useShell } from "@/components/Shell";
import { isAuthPage, isBarePage } from "@/lib/routes";

export default function Fab() {
  const here = usePathname();
  const { openDrawer } = useShell();
  if (here === "/chat" || isAuthPage(here) || isBarePage(here)) return null;
  return (
    <button
      type="button"
      className="fab"
      onClick={() =>
        openDrawer(
          "Asisten",
          <ErrorBoundary label="Asisten">
            <ChatPanel variant="drawer" />
          </ErrorBoundary>,
          { frame: true, kind: "chat" },
        )
      }
    >
      Tanya asisten
    </button>
  );
}
