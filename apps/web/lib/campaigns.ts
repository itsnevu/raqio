// Tipe dan helper fitur Kampanye (outreach dari hasil riset).
export type Channel = "whatsapp" | "instagram" | "email";
export type CampaignMode = "auto" | "manual";
export type CampaignStatus = "draft" | "running" | "paused" | "done";
export type RecipientStatus = "pending" | "sent" | "skipped" | "failed" | "replied" | "unsubscribed";

export type Campaign = {
  id: number; name: string; channel: Channel; mode: CampaignMode; subject: string; template: string; throttle_sec: number;
  status: CampaignStatus; job_id: number | null; created_at: string; started_at: string | null; finished_at: string | null;
  counts: Partial<Record<RecipientStatus, number>>;
};
export type Recipient = {
  id: number; lead_key: string; name: string; to_addr: string; rendered: string; status: RecipientStatus; error: string;
  sent_at: string | null; audit_url: string; link: string;
};
export type Templates = Record<Channel, { Subject: string; Body: string }>;
export type Preview = { rendered: string; subject: string; matched: number; reachable: number; sample: { name: string; addr: string; vars: Record<string, string> } | null };
export type Sender = { sender_name: string; sender_phone: string; reply_to: string; wa_provider: string; wa_gateway_url: string; wa_gateway_token_masked: string; offer: string };

export const CHANNEL_LABEL: Record<Channel, string> = { whatsapp: "WhatsApp", instagram: "Instagram", email: "Email" };
export const STATUS_LABEL: Record<CampaignStatus, string> = { draft: "Draf", running: "Berjalan", paused: "Dijeda", done: "Selesai" };
export const RSTATUS_LABEL: Record<RecipientStatus, string> = {
  pending: "Menunggu", sent: "Terkirim", skipped: "Dilewati", failed: "Gagal", replied: "Dibalas", unsubscribed: "Minta berhenti",
};
export const VARS = ["{nama}", "{wilayah}", "{industri}", "{celah}", "{rating}", "{ulasan}", "{jasa}", "{pengirim}", "{audit}"];

export const totalOf = (c: Campaign) => Object.values(c.counts).reduce((a, b) => a + (b || 0), 0);
export const progressOf = (c: Campaign) => {
  const t = totalOf(c);
  const done = (c.counts.sent || 0) + (c.counts.replied || 0) + (c.counts.skipped || 0) + (c.counts.failed || 0) + (c.counts.unsubscribed || 0);
  return t ? Math.round((done / t) * 100) : 0;
};
/** Mode otomatis hanya untuk WhatsApp (gateway) dan email; Instagram selalu manual. */
export const canAuto = (ch: Channel) => ch !== "instagram";
