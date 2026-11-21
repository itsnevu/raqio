"use client";
import SegmentError from "@/components/SegmentError";

// Error boundary root (di bawah layout): tampilkan pesan ramah plus tombol coba lagi dan muat ulang.
export default function AppError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <SegmentError {...props} />;
}
