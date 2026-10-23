"use client";
// Tampilan awal saat percakapan kosong. Versi penuh (halaman /) punya tautan fitur; versi ringkas untuk panel melayang.
import Link from "next/link";
import { NO_KEY_MSG } from "@/lib/chat/steps";

type Props = { compact: boolean; ready: boolean; noKey: boolean; disabled: string | null; error: string | null; onRetry: () => void };

export default function ChatHero({ compact, ready, noKey, disabled, error, onRetry }: Props) {
  return (
    <div className={"hero" + (compact ? " compact" : "")}>
      <h1>
        Kenali pasarmu. <span>Temukan celahnya.</span>
      </h1>
      <p className="lead">
        Tanya bebas soal bisnis apa pun di lokasi mana pun. Agent akan mencari pemainnya, mengecek IG, website, dan tren, lalu merangkum siapa yang kuat,
        siapa yang lemah, dan di mana peluangnya.
      </p>
      {disabled && (
        <div className="note" role="status">
          <b>Asisten tidak aktif.</b> {disabled}
        </div>
      )}
      {error && (
        <div className="note" role="alert">
          <b>Asisten belum bisa dibuka.</b> {error}{" "}
          <button type="button" className="linkish" onClick={onRetry}>
            Coba lagi
          </button>
        </div>
      )}
      {noKey && (
        <div className="note" role="status">
          <b>Chat dengan agent belum aktif.</b> {NO_KEY_MSG}
        </div>
      )}
      {!ready && !error && !disabled && (
        <div className="note" aria-busy="true">
          Menyiapkan sesi…
        </div>
      )}
      {!compact && (
        <div className="feats">
          <Link className="feat" href="/market">
            <b>Riset pasar</b>
            <span>Peta pemain per industri dan wilayah, skor kekuatan, dan prospek siap dihubungi.</span>
            <em>Buka →</em>
          </Link>
          <Link className="feat" href="/prospects">
            <b>Papan prospek</b>
            <span>Semua bisnis yang layak dihubungi dari seluruh riset, dikelola seperti kanban.</span>
            <em>Buka →</em>
          </Link>
          <Link className="feat" href="/watch">
            <b>Pantau</b>
            <span>Wilayah diriset ulang otomatis; lihat pesaing baru dan rating yang berubah.</span>
            <em>Buka →</em>
          </Link>
        </div>
      )}
    </div>
  );
}
