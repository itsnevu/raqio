// Konteks halaman yang dikirim bersama pertanyaan ke asisten. Halaman riset mendaftarkan laporan yang sedang dibuka,
// panel detail bisnis mendaftarkan kunci bisnisnya. Konteks bisnis hanya berlaku di path tempat panel itu dibuka.
import type { ChatContext } from "./types";

type ReportCtx = { industry: string; area: string; report_id: number | null };
let report: ReportCtx | null = null;
let biz: { key: string; path: string } | null = null;

export const setReportContext = (r: ReportCtx | null) => {
  report = r;
};
export const setBusinessContext = (key: string | null) => {
  biz = key ? { key, path: typeof location !== "undefined" ? location.pathname : "" } : null;
};
export const clearPageContext = () => {
  report = null;
  biz = null;
};

export function getPageContext(page: string): ChatContext {
  const c: ChatContext = { page };
  if (report) {
    c.industry = report.industry;
    c.area = report.area;
    if (report.report_id) c.report_id = report.report_id;
  }
  if (biz && biz.path === page) c.business_key = biz.key;
  return c;
}
