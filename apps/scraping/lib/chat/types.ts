// Tipe kontrak chat yang dilayani Go. Ditulis lokal supaya tidak menunggu lib/api.gen.d.ts diregenerasi dari openapi.yaml.
import type { Limits } from "../api";

export type ChatRole = "user" | "assistant";

/** GET /chat/sessions */
export type ChatSession = { id: string; title: string; last_message_at: string | null; created_at: string };
export type ChatSessionsResponse = { sessions: ChatSession[] };

/** GET /chat/messages?sid= ; active_job = job chat yang masih jalan untuk sesi itu (untuk melanjutkan stream setelah reload) */
export type ChatMessageRow = { id: number; role: ChatRole; content: string; created_at: string; job_id?: number | null };
export type ChatMessagesResponse = { sid?: string; title?: string; messages: ChatMessageRow[]; active_job?: number | null };

/** POST /chat/sid */
export type ChatSidResponse = { sid: string };

/** Konteks halaman yang dikirim bersama pertanyaan (POST /chat). */
export type ChatContext = { page: string; industry?: string; area?: string; report_id?: number; business_key?: string };

/** POST /chat {sid,message,context}. sid di respons bisa berbeda kalau server membuat sesi baru. 409 chat_busy, 402 quota_exceeded, 503 chat_disabled. */
export type ChatSendResponse = { ok?: boolean; job: number | string; sid?: string };

/** GET /chat/poll?job= */
export type ChatPoll = {
  job?: number; status?: string; steps?: string[]; done?: boolean; error?: string | null; answer?: string | null; model?: string; report_ids?: number[];
};

/** GET /chat/suggestions?page=&report_id= */
export type ChatSuggestionsResponse = { suggestions?: string[]; page?: string; report_id?: number; industry?: string; area?: string };

/** /auth/me limits.chats dan /org usage.chat belum ada di tipe hasil generate. */
export type ChatLimits = Limits & { chats?: number };
export type ChatQuota = { used: number; limit: number };

export type MsgErrorCode = "busy" | "quota" | "nokey" | "disabled" | "other";

/** Pesan di layar (bukan baris DB). Placeholder asisten punya done=false sampai job selesai. */
export type Msg = {
  id: number;
  role: ChatRole;
  text: string;
  steps: string[];
  done: boolean;
  error?: string;
  errorCode?: MsgErrorCode;
};
