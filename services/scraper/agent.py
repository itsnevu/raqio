"""
agent.py, agent riset kompetitor Raqio (OpenRouter + tool calling).

Dipakai dua cara:
  - worker.py (job `chat`): run_agent(question, history, log, ctx) dengan Context berisi org, akses Postgres,
    kuota, URL aplikasi, peran pengguna, dan pengecekan pembatalan. Semua tool yang membaca/menulis data org
    difilter org_id. Fungsi ini dijalankan worker di thread sendiri; log mengalir lewat ctx.log.
  - CLI: python agent.py "pertanyaan" (ctx default: tanpa org, riset pasar memakai cache lokal ig.db).

Tool:
  market_research         : laporan org (< 7 hari) -> salinan cache lintas org (tanpa kontak) -> riset baru (kuota market_run)
  get_report              : ringkasan satu laporan org
  list_competitors        : bisnis dari laporan org; fallback cache peta OSM (tanpa kontak)
  list_prospects          : tabel leads org digabung data bisnis dari laporan terbaru
  set_lead_status         : ubah status follow up prospek (bukan viewer)
  add_watch               : pasang pantauan wilayah (bukan viewer, batas limits.watches)
  draft_whatsapp          : draf pesan WhatsApp untuk satu bisnis (memakai org_settings.offer)
  search_competitors      : pipeline OSM -> website -> IG (subprocess, batas SEARCH_TIMEOUT)
  scrape_instagram        : detail akun IG (subprocess, batas SCRAPE_TIMEOUT)
  find_instagram_accounts : cari akun IG lewat Bing
  google_trends           : minat pencarian Google

Setup: OPENROUTER_API_KEY (wajib), OPENROUTER_MODEL (opsional; harus mendukung tool calling).
"""
import copy
import json
import os
import re
import sqlite3
import sys
import tempfile
import threading
import time
from datetime import date, datetime, timezone

import psycopg

import datastore
import netutil
import procutil
from pipeline import CATEGORIES

HERE = os.path.dirname(os.path.abspath(__file__))
# folder data (ig.db, state); di Docker diarahkan ke volume lewat RAQIO_DATA_DIR
DATA_DIR = os.environ.get("RAQIO_DATA_DIR", HERE)
DB = os.path.join(DATA_DIR, "ig.db")
# kosong = pilih otomatis model gratis (":free") yang mendukung tool calling
MODEL = os.getenv("OPENROUTER_MODEL", "")
# urutan coba: murah tapi pintar (<Rp10/pertanyaan) -> gratis (kalau saldo habis / error 402)
PREFERRED = ["deepseek/deepseek-v4.1-flash", "qwen/qwen3.7-flash",
             "google/gemma-4-31b-it:free", "nvidia/nemotron-3-super-120b-a12b:free",
             "nvidia/nemotron-3-ultra-550b-a55b:free", "thinkingmachines/inkling:free"]
OPENROUTER = "https://openrouter.ai/api/v1"
MAX_STEPS = 8
LLM_TIMEOUT = 120  # detik per request; request yang sedang jalan paling lama segini setelah dibatalkan
SEARCH_TIMEOUT = int(os.environ.get("SEARCH_TIMEOUT", "600"))   # market.py / pipeline.py
SCRAPE_TIMEOUT = int(os.environ.get("SCRAPE_TIMEOUT", "300"))   # ig_scraper.py
MARKET_CACHE_DAYS = int(os.environ.get("MARKET_CACHE_DAYS", "7"))  # sama dengan API Go
REPORT_FRESH_DAYS = 7      # laporan org sendiri yang dipakai ulang tanpa riset
DEFAULT_RUNS = 5           # kuota riset kalau params.limits tidak membawa "runs" (paket free)
DEFAULT_WATCHES = 1        # batas pantauan kalau params.limits tidak membawa "watches"
LEAD_STATUSES = ("baru", "dihubungi", "tertarik", "deal", "tolak")
# hasil "Cek kontak" berbayar org asal; dibuang saat laporan disalin lintas org (seperti contactFields di Go,
# ditambah whatsapp karena berisi nomor telepon)
CONTACT_FIELDS = ("phone", "website", "instagram", "instagram_shared", "emails", "_detailed", "lead", "whatsapp", "src_fields")
USAGE_SQL = """INSERT INTO usage (org_id, period, kind, count)
    SELECT %s::uuid, to_char(now() at time zone 'utc', 'YYYY-MM'), 'market_run', 1 WHERE 1 <= %s::int
    ON CONFLICT (org_id, period, kind) DO UPDATE SET count = usage.count + 1 WHERE usage.count + 1 <= %s::int
    RETURNING count"""

SYSTEM = """Kamu asisten riset kompetitor Raqio untuk pemilik bisnis lokal di Indonesia. Jawabanmu dibaca langsung
oleh pemilik bisnis, jadi pakai bahasa Indonesia yang santai, ringkas, mudah dimengerti, dan berbasis data dari tool.

Aturan data:
- Selalu sebut angka yang didapat dari tool (jumlah bisnis, rating, review, skor, persentase). Jangan mengarang angka;
  kalau data kosong, bilang terus terang dan sarankan langkah berikutnya.
- Untuk "riset pasar", "peta persaingan", atau industri apa pun (termasuk jasa), utamakan market_research (Google Maps,
  data paling lengkap). Sertakan tautan laporan persis seperti report_url yang diberikan tool; jangan mengarang URL.
- Kalau pengguna sedang membuka laporan tertentu (lihat pesan Konteks), pakai get_report untuk laporan itu dulu.
- SELALU panggil list_competitors dulu sebelum search_competitors. search_competitors hanya kalau hasilnya kosong untuk
  lokasi+kategori itu, atau pengguna eksplisit minta data terbaru. Jangan scrape ulang data yang sudah ada.
- Jangan panggil scrape_instagram untuk akun yang datanya sudah ada, kecuali butuh detail (frekuensi posting, jam terbaik).
- "Berkembang" = followers besar, followers_delta positif, ER tinggi, tren Google naik. Akun IG bertanda
  instagram_source=bing adalah tebakan pencarian; sebutkan kalau relevan.
- Data peta OSM (search_competitors) lemah untuk industri jasa/kantor (agency, konsultan, WO, catering). Untuk itu, atau
  kalau hasil peta < 5 bisnis, pakai find_instagram_accounts lalu scrape_instagram (maks 5 akun per panggilan, lambat).
- Tool yang menulis (set_lead_status, add_watch, riset baru) ditolak untuk peran viewer; sampaikan dengan sopan.
- Setelah menjawab, tawarkan tindakan lanjutan yang tersedia bila relevan, misalnya "mau saya pasang pantauan wilayah
  ini?", "mau saya tandai bisnis ini sudah dihubungi?", atau "mau saya buatkan draf pesan WhatsApp untuk prospek ini?".
- Jangan pernah memakai tanda em dash. Pakai koma, titik, atau titik dua.

Panduan singkat fitur Raqio (pertanyaan "cara pakai" dijawab dari sini, tanpa tool):
- Riset (halaman Riset): pilih industri dan wilayah, hasilnya laporan dari Google Maps: pemimpin pasar, hidden gem,
  pemain lemah, kematangan digital, prospek. Pasangan industri+wilayah yang baru diriset org lain (< 7 hari) tersedia
  instan tanpa kuota. "Cek kontak" mengambil telepon/website/IG satu bisnis (kuota cek kontak). Ada mode bandingkan
  beberapa wilayah sekaligus.
- Prospek (halaman Prospek): bisnis yang layak ditawari, status follow up (baru, dihubungi, tertarik, deal, tolak),
  catatan, pengingat tanggal, tombol WhatsApp kalau nomornya HP.
- Pantau (halaman Pantau): wilayah dipindai ulang otomatis tiap N hari; perubahan berarti (pemain baru, hilang, rating
  naik/turun, lonjakan review) jadi alert dan dikirim ke email, Telegram, atau webhook yang diatur di Pengaturan.
- Pengaturan: profil penawaran (dipakai draf pesan), anggota tim dan peran (viewer hanya melihat; analyst menjalankan
  riset, prospek, pantauan; admin juga mengelola anggota, API key, notifikasi; owner pemilik org), API key untuk
  integrasi (header Authorization: Bearer rq_...), notifikasi pantauan, paket dan kuota.
- Paket dan kuota bulanan: Free 5 riset, 30 cek kontak, 1 pantauan, 1 anggota; Pro 60 riset, 600 cek kontak,
  15 pantauan, 3 anggota; Team 300 riset, 3000 cek kontak, 60 pantauan, 15 anggota. Upgrade dan tagihan di
  Pengaturan > Paket.
- Mode tamu: coba tanpa daftar dengan kuota kecil (2 riset), data dihapus otomatis setelah beberapa jam. Simpan lewat
  tombol "Simpan akun" (isi email dan password, lalu verifikasi email); data org tetap, paket jadi Free."""

TOOLS = [
    {"type": "function", "function": {
        "name": "market_research",
        "description": "Riset pasar satu industri di satu wilayah dari Google Maps: jumlah bisnis, rating, konsentrasi "
                       "pasar, pemimpin, hidden gems, pemain lemah, kematangan digital, prospek bisnis kecil. Urutan: "
                       "laporan org ini < 7 hari; kalau tidak ada, laporan org lain yang masih baru disalin instan "
                       "(tanpa kontak, tanpa kuota); kalau tidak ada juga atau fresh=true, riset baru (2-4 menit, "
                       "memakai kuota riset bulanan). Hasil memuat report_url yang harus disertakan di jawaban. "
                       "Cocok juga untuk industri jasa (agency, WO, konsultan).",
        "parameters": {"type": "object", "properties": {
            "industry": {"type": "string", "description": "mis. 'coffee shop', 'digital agency', 'salon'"},
            "area": {"type": "string", "description": "mis. 'Kemang Jakarta'"},
            "fresh": {"type": "boolean", "description": "true = paksa riset ulang (memakai kuota)"},
        }, "required": ["industry", "area"]}}},
    {"type": "function", "function": {
        "name": "get_report",
        "description": "Ringkasan satu laporan riset pasar milik org ini (summary, insight, strategi, kematangan "
                       "digital, kategori, 5 pemimpin, 5 hidden gem, 5 pemain lemah, 8 prospek). Pakai untuk laporan "
                       "yang sedang dibuka pengguna (id di pesan Konteks) atau id dari market_research.",
        "parameters": {"type": "object", "properties": {
            "report_id": {"type": "integer"},
        }, "required": ["report_id"]}}},
    {"type": "function", "function": {
        "name": "list_competitors",
        "description": "Bisnis yang sudah ada di laporan riset pasar org ini (Google Maps: nama, rating, review, "
                       "kategori, IG, jarak, skor prospek, wilayah, industri). Kalau org belum punya laporan yang cocok, "
                       "jatuh ke cache peta OSM hasil search_competitors (tanpa telepon/email/website). "
                       "Filter lokasi/kategori berupa potongan teks.",
        "parameters": {"type": "object", "properties": {
            "location": {"type": "string", "description": "potongan nama wilayah, mis. 'Kemang'"},
            "category": {"type": "string", "description": "potongan industri/kategori, mis. 'kopi'"},
            "only_with_instagram": {"type": "boolean"},
            "limit": {"type": "integer", "description": "default 20, maks 50"},
        }}}},
    {"type": "function", "function": {
        "name": "list_prospects",
        "description": "Prospek org ini: status follow up dari tabel prospek digabung data bisnis di laporan terbaru "
                       "(nama, skor, rating, review, status, catatan, pengingat, wilayah). Tanpa filter status juga "
                       "menampilkan prospek skor >= 40 yang belum ditindaklanjuti (status baru).",
        "parameters": {"type": "object", "properties": {
            "status": {"type": "string", "enum": list(LEAD_STATUSES)},
            "due_today": {"type": "boolean", "description": "hanya yang pengingatnya hari ini atau sudah lewat"},
            "limit": {"type": "integer", "description": "default 20"},
        }}}},
    {"type": "function", "function": {
        "name": "set_lead_status",
        "description": "Ubah status follow up satu prospek (key dari list_prospects/list_competitors/get_report). "
                       "note/remind yang tidak dikirim tidak diubah. Hanya untuk peran analyst ke atas.",
        "parameters": {"type": "object", "properties": {
            "key": {"type": "string", "description": "key bisnis (place_id)"},
            "status": {"type": "string", "enum": list(LEAD_STATUSES)},
            "note": {"type": "string"},
            "remind": {"type": "string", "description": "tanggal pengingat YYYY-MM-DD, string kosong = hapus"},
        }, "required": ["key", "status"]}}},
    {"type": "function", "function": {
        "name": "add_watch",
        "description": "Pasang pantauan wilayah: industri+wilayah dipindai ulang otomatis tiap every_days hari dan "
                       "perubahannya jadi alert. Dibatasi kuota pantauan paket. Hanya untuk peran analyst ke atas.",
        "parameters": {"type": "object", "properties": {
            "industry": {"type": "string"},
            "area": {"type": "string"},
            "every_days": {"type": "integer", "description": "1-90, default 7"},
        }, "required": ["industry", "area"]}}},
    {"type": "function", "function": {
        "name": "draft_whatsapp",
        "description": "Draf pesan WhatsApp singkat untuk satu bisnis di laporan org ini, berdasarkan data bisnis "
                       "(rating, review, celah digital) dan profil penawaran org (bisa diganti lewat offer).",
        "parameters": {"type": "object", "properties": {
            "business_key": {"type": "string", "description": "key bisnis (place_id)"},
            "offer": {"type": "string", "description": "penawaran singkat, mis. 'jasa pembuatan website UMKM'"},
        }, "required": ["business_key"]}}},
    {"type": "function", "function": {
        "name": "search_competitors",
        "description": "Cari bisnis kategori tertentu di sekitar lokasi dari peta OSM, lalu kumpulkan IG, followers, "
                       "ER, tren Google. Butuh beberapa menit. Hasil tersimpan di cache bersama (tanpa kontak).",
        "parameters": {"type": "object", "properties": {
            "category": {"type": "string", "description":
                         f"Salah satu: {', '.join(CATEGORIES)}. Kalau industrinya tidak ada di daftar, "
                         "pakai 'keyword:<kata kunci di nama bisnis>', mis. 'keyword:wedding organizer|wo' "
                         "atau 'keyword:catering'. Pisahkan sinonim dengan |."},
            "location": {"type": "string", "description": "mis. 'Kemang, Jakarta Selatan'"},
            "radius": {"type": "integer", "description": "meter, default 2000"},
            "ig_scrape": {"type": "integer", "description": "jumlah akun IG teratas yang di-scrape detail, default 3"},
        }, "required": ["category", "location"]}}},
    {"type": "function", "function": {
        "name": "scrape_instagram",
        "description": "Scrape detail akun IG (followers, ER, rata-rata likes/komentar, frekuensi posting, "
                       "hari & jam terbaik). Maks 5 akun per panggilan.",
        "parameters": {"type": "object", "properties": {
            "usernames": {"type": "array", "items": {"type": "string"}},
        }, "required": ["usernames"]}}},
    {"type": "function", "function": {
        "name": "find_instagram_accounts",
        "description": "Cari akun IG bisnis lewat pencarian web (Bing). Pakai untuk industri yang jarang "
                       "ada di peta (agency, konsultan, WO, catering, online shop) atau kalau "
                       "search_competitors hasilnya sedikit. Lanjutkan dengan scrape_instagram.",
        "parameters": {"type": "object", "properties": {
            "query": {"type": "string", "description": "mis. 'digital agency gading serpong'"},
        }, "required": ["query"]}}},
    {"type": "function", "function": {
        "name": "google_trends",
        "description": "Bandingkan minat pencarian Google (Indonesia) untuk maks 5 nama brand, 3 bulan terakhir.",
        "parameters": {"type": "object", "properties": {
            "keywords": {"type": "array", "items": {"type": "string"}},
        }, "required": ["keywords"]}}},
]


class ChatStopped(Exception):
    """Dibatalkan pengguna atau worker berhenti: dilempar dari ctx.check() di antara langkah agent."""


class Context:
    """Konteks satu giliran chat.

    db          : callable tanpa argumen yang mengembalikan koneksi psycopg baru (autocommit). Dipakai dari thread agent,
                  jadi tidak boleh koneksi yang dipakai worker. None = tanpa org (CLI, hanya cache lokal).
    log         : callable(baris); dipanggil dari thread agent dan thread pembaca subprocess (harus thread-safe).
    should_stop : callable -> bool; True = batalkan di langkah berikutnya (ctx.check() melempar ChatStopped).
    limits      : dict kuota dari params job ({"runs": N, "details": N, "watches": N, ...}).
    """

    def __init__(self, org_id=None, job_id=None, db=None, limits=None, app_url="", log=None, should_stop=None,
                 role="", org_name="", plan="", verified=None, page_context=None):
        self.org_id = org_id
        self.job_id = job_id
        self.db = db
        self.limits = dict(limits or {})
        self.app_url = (app_url or os.environ.get("APP_URL", "http://localhost:3000")).rstrip("/")
        self.log = log or (lambda s: print(s, flush=True))
        self.should_stop = should_stop or (lambda: False)
        self.role = str(role or "").lower()
        self.org_name = str(org_name or "")
        self.plan = str(plan or "")
        self.verified = verified
        self.page_context = dict(page_context or {})
        self.report_ids = []   # laporan yang dibuat/disalin selama giliran ini (dicatat ke result job)
        self.model = None      # model LLM yang menjawab

    def check(self):
        if self.should_stop():
            raise ChatStopped()

    @property
    def can_write(self):
        return self.role != "viewer"

    def conn(self):
        """Koneksi Postgres baru untuk thread agent (pemanggil yang menutup). None = tidak ada org/DB."""
        return self.db() if self.db and self.org_id else None

    def report_url(self, rid):
        return f"{self.app_url}/market?id={rid}"

    def context_messages(self):
        """Pesan system tambahan untuk giliran ini (tidak disimpan ke history)."""
        out = []
        c = self.page_context
        parts = []
        if c.get("industry") and c.get("area"):
            parts.append(f"pengguna sedang membuka laporan {c['industry']} di {c['area']}"
                         + (f" (id {c['report_id']})" if c.get("report_id") else ""))
        elif c.get("report_id"):
            parts.append(f"pengguna sedang membuka laporan id {c['report_id']}")
        if c.get("business_key"):
            parts.append(f"bisnis yang sedang dipilih: key {c['business_key']}")
        if c.get("page"):
            parts.append(f"halaman: {c['page']}")
        if parts:
            out.append("Konteks: " + "; ".join(parts) + ".")
        if self.role or self.org_name or self.plan:
            s = f"Pengguna: {self.role or 'anggota'}"
            if self.org_name:
                s += f" di org {self.org_name}"
            if self.plan:
                s += f", paket {self.plan}"
            if self.verified is False:
                s += ", email belum diverifikasi"
            out.append(s + ".")
        return [{"role": "system", "content": "\n".join(out)}] if out else []


# ------------------------------------------------------------
# subprocess (log mengalir ke ctx.log, bisa dibatalkan, ada batas waktu)
# ------------------------------------------------------------

def run_script(ctx, script, args, timeout):
    """Jalankan script Python di folder ini. Tiap baris output dikirim ke ctx.log. Dihentikan kalau ctx.should_stop()
    atau lewat `timeout` detik. Mengembalikan (output, exit_code, stopped) dengan stopped False | "cancel" | "timeout"."""
    args = [str(a) for a in args]
    ctx.log("$ " + script + " " + " ".join(args))
    # grup proses sendiri + env tanpa rahasia yang tidak perlu (procutil); Chromium ikut mati saat dihentikan
    proc = procutil.popen(script, args, cwd=HERE)
    lines = []

    def reader():
        for line in proc.stdout:
            lines.append(line)
            if line.strip():
                ctx.log(line.rstrip("\n"))

    t = threading.Thread(target=reader, daemon=True)
    t.start()
    t0 = time.time()
    stopped = False
    try:
        while proc.poll() is None:
            time.sleep(0.5)
            if ctx.should_stop():
                stopped = "cancel"
                break
            if time.time() - t0 > timeout:
                stopped = "timeout"
                break
    finally:
        if proc.poll() is None:
            procutil.kill_tree(proc)
    t.join(timeout=5)
    if stopped == "timeout":
        ctx.log(f"[{script} dihentikan: melebihi batas waktu {timeout} detik]")
    return "".join(lines), proc.returncode, stopped


def _last_line(out):
    tail = [l for l in (out or "").strip().splitlines() if l.strip()]
    return (tail[-1] if tail else "")[:300]


def _read_json(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


# ------------------------------------------------------------
# helper data laporan (Postgres, difilter org)
# ------------------------------------------------------------

def _as_json(v):
    if isinstance(v, (dict, list)):
        return v
    return json.loads(v) if v else {}


def _lead_key(p):
    return p.get("place_id") or p.get("maps_url") or ""


def _latest_reports(conn, org_id):
    """Laporan terbaru org per pasangan industri+wilayah: [(id, industry, area, report)]."""
    rows = conn.execute("""SELECT DISTINCT ON (lower(industry), lower(area)) id, industry, area, report
                           FROM reports WHERE org_id=%s ORDER BY lower(industry), lower(area), id DESC""",
                        (org_id,)).fetchall()
    return [(r[0], r[1], r[2], _as_json(r[3])) for r in rows]


def _businesses(conn, org_id):
    """key -> (bisnis, industri, wilayah, report_id) dari laporan terbaru org; kalau satu bisnis ada di beberapa
    laporan, yang skor prospeknya tertinggi yang dipakai."""
    best = {}
    for rid, ind, area, rep in _latest_reports(conn, org_id):
        for p in rep.get("all") or []:
            k = _lead_key(p)
            if not k:
                continue
            if k not in best or (p.get("lead_score") or 0) > (best[k][0].get("lead_score") or 0):
                best[k] = (p, ind, area, rid)
    return best


def _find_business(conn, org_id, key):
    return _businesses(conn, org_id).get(str(key or "").strip())


def strip_contact_fields(rep):
    """Buang field kontak dari semua daftar bisnis di laporan (all, prospects, leaders, ...), in-place."""
    for v in rep.values():
        if isinstance(v, list):
            for p in v:
                if isinstance(p, dict):
                    for f in CONTACT_FIELDS:
                        p.pop(f, None)
    return rep


def copy_cached_report(conn, org_id, industry, area, src_id, src_report):
    """Salin laporan org lain ke org ini tanpa kontak (seperti copyCachedReport di Go). Kalau org sudah punya
    salinan dari sumber yang sama, salinan lama yang dikembalikan. Mengembalikan (id, report)."""
    row = conn.execute("SELECT id, report FROM reports WHERE org_id=%s AND cached_from=%s ORDER BY id DESC LIMIT 1",
                       (org_id, src_id)).fetchone()
    if row:
        return row[0], _as_json(row[1])
    rep = strip_contact_fields(copy.deepcopy(src_report))
    rep.pop("cached_from", None)
    rep["industry"], rep["area"] = industry, area
    rid = conn.execute("""INSERT INTO reports (org_id, industry, area, report, summary, cached_from)
                          VALUES (%s,%s,%s,%s,%s,%s) RETURNING id""",
                       (org_id, industry, area, json.dumps(rep, ensure_ascii=False),
                        json.dumps(rep.get("summary") or {}, ensure_ascii=False), src_id)).fetchone()[0]
    return rid, rep


def insert_report(conn, org_id, job_id, rep):
    """Simpan laporan hasil riset chat ke org ini (job_id = job chat, summary terisi). Index unik (job_id, wilayah)
    hanya mengizinkan satu laporan per wilayah per job; riset kedua untuk wilayah yang sama disimpan tanpa job_id."""
    sql = "INSERT INTO reports (org_id, job_id, industry, area, report, summary) VALUES (%s,%s,%s,%s,%s,%s) RETURNING id"
    rest = (rep["industry"], rep["area"], json.dumps(rep, ensure_ascii=False),
            json.dumps(rep.get("summary") or {}, ensure_ascii=False))
    try:
        return conn.execute(sql, (org_id, job_id, *rest)).fetchone()[0]
    except psycopg.errors.UniqueViolation:
        return conn.execute(sql, (org_id, None, *rest)).fetchone()[0]


def _slim(xs, n):
    keys = ("name", "rating", "reviews", "category", "instagram", "whatsapp", "gaps", "lead_score")
    out = []
    for p in (xs or [])[:n]:
        d = {k: p.get(k) for k in keys if p.get(k) is not None}
        if _lead_key(p):
            d["key"] = _lead_key(p)
        out.append(d)
    return out


def _report_summary(ctx, rid, rep, source):
    return {"report_id": rid, "report_url": ctx.report_url(rid), "industry": rep.get("industry"), "area": rep.get("area"),
            "created": rep.get("created"), "source": source, "summary": rep.get("summary"), "insights": rep.get("insights"),
            "ai_strategy": rep.get("ai_strategy"), "digital": rep.get("digital"), "categories": rep.get("categories"),
            "leaders": _slim(rep.get("leaders"), 5), "gems": _slim(rep.get("gems"), 5), "weak": _slim(rep.get("weak"), 5),
            "prospects": _slim(rep.get("prospects"), 8)}


def _needs_org():
    return {"error": "tool ini butuh konteks org (jalankan lewat aplikasi Raqio)"}


# ------------------------------------------------------------
# tools
# ------------------------------------------------------------

def _run_market(ctx, industry, area):
    """market.py --out sebagai subprocess. Mengembalikan (report, error)."""
    fd, path = tempfile.mkstemp(prefix=f"raqio-chat{ctx.job_id or 0}-", suffix=".json")
    os.close(fd)
    os.unlink(path)  # market.py yang membuatnya (atomik lewat rename); tidak ada = gagal
    try:
        out, code, stopped = run_script(ctx, "market.py", ["--industry", procutil.cli_value(industry, 60), "--area",
                                                           procutil.cli_value(area, 80), "--out", path], SEARCH_TIMEOUT)
        if stopped == "cancel":
            raise ChatStopped()
        if stopped == "timeout":
            return None, f"riset melebihi batas waktu {SEARCH_TIMEOUT // 60} menit, coba lagi nanti"
        data = _read_json(path)
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass
    rep = (data or {}).get("report")
    if rep:
        return rep, None
    return None, (data or {}).get("error") or _last_line(out) or "riset gagal tanpa pesan"


def _refund_run(conn, org_id):
    conn.execute("""UPDATE usage SET count = greatest(count - 1, 0)
                    WHERE org_id=%s::uuid AND period=to_char(now() at time zone 'utc', 'YYYY-MM') AND kind='market_run'""",
                 (org_id,))


def tool_market_research(ctx, industry, area, fresh=False):
    industry, area = str(industry or "").strip(), str(area or "").strip()
    if not industry or not area:
        return {"error": "industri dan wilayah wajib diisi"}
    conn = ctx.conn()
    if conn is None:
        return _market_research_local(ctx, industry, area, fresh)
    try:
        if not fresh:
            row = conn.execute("""SELECT id, report FROM reports WHERE org_id=%s AND lower(industry)=lower(%s)
                                  AND lower(area)=lower(%s) AND created_at > now() - make_interval(days => %s)
                                  ORDER BY id DESC LIMIT 1""", (ctx.org_id, industry, area, REPORT_FRESH_DAYS)).fetchone()
            if row:
                return _report_summary(ctx, row[0], _as_json(row[1]), f"laporan org ini (< {REPORT_FRESH_DAYS} hari)")
            src = conn.execute("""SELECT id, report FROM reports WHERE lower(industry)=lower(%s) AND lower(area)=lower(%s)
                                  AND cached_from IS NULL AND org_id <> %s AND created_at > now() - make_interval(days => %s)
                                  ORDER BY id DESC LIMIT 1""", (industry, area, ctx.org_id, MARKET_CACHE_DAYS)).fetchone()
            if src:
                rid, rep = copy_cached_report(conn, ctx.org_id, industry, area, src[0], _as_json(src[1]))
                ctx.report_ids.append(rid)
                ctx.log(f"[cache] laporan lain disalin jadi laporan #{rid} (tanpa kontak)")
                return _report_summary(ctx, rid, rep, f"hasil instan dari laporan org lain (< {MARKET_CACHE_DAYS} hari), "
                                                      "tanpa kontak; pakai Cek kontak di laporan atau fresh=true kalau butuh")
        if not ctx.can_write:
            return {"error": "peran viewer tidak bisa menjalankan riset baru; minta analyst atau admin di org"}
        max_runs = int(ctx.limits.get("runs", DEFAULT_RUNS) or 0)
        row = conn.execute(USAGE_SQL, (ctx.org_id, max_runs, max_runs)).fetchone()
        if not row:
            return {"error": "kuota riset bulan ini habis"}
        ctx.log(f"[kuota] riset ke-{row[0]} dari {max_runs} bulan ini")
        try:
            rep, err = _run_market(ctx, industry, area)
        except BaseException:
            _refund_run(conn, ctx.org_id)
            raise
        if err:
            _refund_run(conn, ctx.org_id)
            return {"error": err}
        rid = insert_report(conn, ctx.org_id, ctx.job_id, rep)
        ctx.report_ids.append(rid)
        ctx.log(f"REPORT_PG_ID={rid}")
        return _report_summary(ctx, rid, rep, "riset baru")
    finally:
        conn.close()


def _market_research_local(ctx, industry, area, fresh):
    """Mode CLI tanpa org: cache market_reports di ig.db (laporan < 7 hari), kalau tidak ada jalankan market.py."""
    import market
    row = None
    if not fresh and os.path.exists(DB):
        conn = market.db()
        try:
            got = market.latest_report(conn, industry, area, REPORT_FRESH_DAYS)
        finally:
            conn.close()
        if got:
            row = got
    if not row:
        rep, err = _run_market(ctx, industry, area)
        if err:
            return {"error": err}
        conn = market.db()
        try:
            row = market.latest_report(conn, industry, area)
        finally:
            conn.close()
        if not row:
            row = (None, rep)
    res = _report_summary(ctx, row[0], row[1], "cache lokal (CLI)")
    res["report_url"] = None
    return res


def tool_get_report(ctx, report_id):
    conn = ctx.conn()
    if conn is None:
        return _needs_org()
    try:
        try:
            rid = int(report_id)
        except (TypeError, ValueError):
            return {"error": "report_id harus angka"}
        row = conn.execute("SELECT id, report FROM reports WHERE id=%s AND org_id=%s", (rid, ctx.org_id)).fetchone()
    finally:
        conn.close()
    if not row:
        return {"error": "laporan tidak ada atau bukan milik org ini"}
    return _report_summary(ctx, row[0], _as_json(row[1]), "laporan org ini")


def _osm_competitors(location=None, category=None, only_with_instagram=False, limit=20):
    """Cache peta OSM (ig.db businesses, bersama lintas org): tanpa telepon/email/website."""
    note = "cache peta OSM hasil search_competitors (tanpa kontak)"
    if not os.path.exists(DB):
        return {"count": 0, "items": [], "source": note, "note": "cache kosong, panggil search_competitors"}
    conn = datastore.connect_sqlite(DB)
    try:
        rows = conn.execute("SELECT location, data, last_scanned FROM businesses").fetchall()
    except sqlite3.OperationalError:
        rows = []
    finally:
        conn.close()
    items = []
    for loc, data, scanned in rows:
        b = json.loads(data)
        if location and location.lower() not in (loc or "").lower():
            continue
        if category and b.get("category") != category:
            continue
        if only_with_instagram and not b.get("instagram"):
            continue
        items.append({k: b.get(k) for k in (
            "name", "address", "category", "instagram", "instagram_source", "followers", "followers_delta",
            "engagement_rate", "avg_likes", "grade", "search_trend")}
            | {"location": loc, "scanned": (scanned or "")[:10]})
    items.sort(key=lambda x: -(x.get("followers") or 0))
    return {"count": len(items), "items": items[:limit], "source": note}


def tool_list_competitors(ctx, location=None, category=None, only_with_instagram=False, limit=20):
    limit = max(1, min(int(limit or 20), 50))
    conn = ctx.conn()
    if conn is not None:
        try:
            reports = _latest_reports(conn, ctx.org_id)
        finally:
            conn.close()
        items = []
        for rid, ind, area, rep in reports:
            if location and str(location).lower() not in (area or "").lower():
                continue
            for p in rep.get("all") or []:
                hay = f"{ind} {p.get('category') or ''}".lower()
                if category and str(category).lower() not in hay:
                    continue
                if only_with_instagram and not p.get("instagram"):
                    continue
                items.append({"key": _lead_key(p), "name": p.get("name"), "rating": p.get("rating"),
                              "reviews": p.get("reviews"), "category": p.get("category"), "instagram": p.get("instagram"),
                              "dist_km": p.get("dist_km"), "lead_score": p.get("lead_score"), "area": area,
                              "industry": ind, "report_id": rid})
        if items:
            items.sort(key=lambda x: -(x.get("reviews") or 0))
            return {"count": len(items), "items": items[:limit], "source": "laporan riset pasar org ini (Google Maps)"}
    return _osm_competitors(location, category, only_with_instagram, limit)


def tool_list_prospects(ctx, status=None, due_today=False, limit=20):
    conn = ctx.conn()
    if conn is None:
        return _needs_org()
    status = str(status or "").strip().lower() or None
    if status and status not in LEAD_STATUSES:
        return {"error": f"status harus salah satu: {', '.join(LEAD_STATUSES)}"}
    limit = max(1, min(int(limit or 20), 100))
    try:
        sql = "SELECT key, name, status, note, to_char(remind, 'YYYY-MM-DD'), updated_at FROM leads WHERE org_id=%s"
        params = [ctx.org_id]
        if status:
            sql += " AND status=%s"
            params.append(status)
        if due_today:
            sql += " AND remind IS NOT NULL AND remind <= current_date"
        leads = conn.execute(sql + " ORDER BY updated_at DESC", params).fetchall()
        biz = _businesses(conn, ctx.org_id)
    finally:
        conn.close()
    today = date.today().isoformat()
    items = []
    for key, name, st, note, remind, updated in leads:
        p, ind, area, rid = biz.get(key) or ({}, None, None, None)
        items.append({"key": key, "name": name or p.get("name"), "status": st, "note": note or "", "remind": remind,
                      "due": bool(remind and remind <= today), "updated": updated.isoformat() if updated else None,
                      "score": p.get("lead_score"), "rating": p.get("rating"), "reviews": p.get("reviews"),
                      "whatsapp": p.get("whatsapp"), "industry": ind, "area": area, "report_id": rid})
    if status in (None, "baru") and not due_today:
        seen = {i["key"] for i in items}
        for key, (p, ind, area, rid) in biz.items():
            if key in seen or (p.get("lead_score") or 0) < 40:
                continue
            items.append({"key": key, "name": p.get("name"), "status": "baru", "note": "", "remind": None, "due": False,
                          "updated": None, "score": p.get("lead_score"), "rating": p.get("rating"),
                          "reviews": p.get("reviews"), "whatsapp": p.get("whatsapp"), "industry": ind, "area": area,
                          "report_id": rid})
    items.sort(key=lambda x: (not x["due"], -(x.get("score") or 0)))
    return {"count": len(items), "items": items[:limit], "today": today}


def tool_set_lead_status(ctx, key, status, note=None, remind=None):
    if not ctx.can_write:
        return {"error": "peran viewer tidak bisa mengubah status prospek; minta analyst atau admin di org"}
    key, status = str(key or "").strip(), str(status or "").strip().lower()
    if not key:
        return {"error": "key bisnis wajib diisi"}
    if status not in LEAD_STATUSES:
        return {"error": f"status harus salah satu: {', '.join(LEAD_STATUSES)}"}
    if remind:
        remind = str(remind).strip()
        try:
            date.fromisoformat(remind)
            ok = bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}", remind))
        except ValueError:
            ok = False
        if not ok:
            return {"error": "format tanggal pengingat harus YYYY-MM-DD"}
    conn = ctx.conn()
    if conn is None:
        return _needs_org()
    try:
        found = _find_business(conn, ctx.org_id, key)
        name = (found[0].get("name") if found else "") or ""
        row = conn.execute("""INSERT INTO leads (org_id, key, name, status, note, remind, updated_at)
            VALUES (%s,%s,%s,%s,%s,%s::date,now())
            ON CONFLICT (org_id, key) DO UPDATE SET status=excluded.status,
              name=CASE WHEN excluded.name <> '' THEN excluded.name ELSE leads.name END,
              note=CASE WHEN %s THEN excluded.note ELSE leads.note END,
              remind=CASE WHEN %s THEN excluded.remind ELSE leads.remind END,
              updated_at=now()
            RETURNING name, status, note, to_char(remind, 'YYYY-MM-DD')""",
                           (ctx.org_id, key, name, status, note or "", remind or None,
                            note is not None, remind is not None)).fetchone()
    finally:
        conn.close()
    ctx.log(f"[prospek] {row[0] or key}: status {row[1]}" + (f", pengingat {row[3]}" if row[3] else ""))
    return {"ok": True, "key": key, "name": row[0], "status": row[1], "note": row[2], "remind": row[3],
            "in_report": bool(found)}


def tool_add_watch(ctx, industry, area, every_days=7):
    if not ctx.can_write:
        return {"error": "peran viewer tidak bisa memasang pantauan; minta analyst atau admin di org"}
    industry, area = str(industry or "").strip(), str(area or "").strip()
    if not industry or not area:
        return {"error": "industri dan wilayah wajib diisi"}
    try:
        every_days = min(max(int(every_days or 7), 1), 90)
    except (TypeError, ValueError):
        every_days = 7
    conn = ctx.conn()
    if conn is None:
        return _needs_org()
    limit = int(ctx.limits.get("watches", DEFAULT_WATCHES) or 0)
    try:
        exists = conn.execute("SELECT 1 FROM watches WHERE org_id=%s AND lower(industry)=lower(%s) AND lower(area)=lower(%s)",
                              (ctx.org_id, industry, area)).fetchone()
        if not exists:
            n = conn.execute("SELECT count(*) FROM watches WHERE org_id=%s", (ctx.org_id,)).fetchone()[0]
            if n >= limit:
                return {"error": f"batas pantauan paket ini {limit} wilayah (sudah {n}); hapus pantauan lain di halaman "
                                 "Pantau atau upgrade paket"}
        conn.execute("""INSERT INTO watches (org_id, industry, area, every_days) VALUES (%s,%s,%s,%s)
                        ON CONFLICT (org_id, lower(industry), lower(area)) DO UPDATE SET every_days=excluded.every_days""",
                     (ctx.org_id, industry, area, every_days))
    finally:
        conn.close()
    ctx.log(f"[pantau] {industry} di {area} tiap {every_days} hari" + (" (diperbarui)" if exists else ""))
    return {"ok": True, "industry": industry, "area": area, "every_days": every_days, "updated": bool(exists),
            "note": "dipindai ulang otomatis; alert muncul di halaman Pantau dan saluran notifikasi di Pengaturan"}


def tool_draft_whatsapp(ctx, business_key, offer=None):
    conn = ctx.conn()
    if conn is None:
        return _needs_org()
    try:
        found = _find_business(conn, ctx.org_id, business_key)
        offer = str(offer or "").strip()
        if not offer:
            row = conn.execute("SELECT offer FROM org_settings WHERE org_id=%s", (ctx.org_id,)).fetchone()
            offer = ((row[0] if row else "") or "").strip()
    finally:
        conn.close()
    if not found:
        return {"error": "bisnis tidak ditemukan di laporan org ini; pakai key dari list_competitors atau get_report"}
    p, industry, area, rid = found
    name = p.get("name") or "Kak"
    gaps = []
    if p.get("_detailed") and not p.get("website"):
        gaps.append("website")
    if not p.get("instagram"):
        gaps.append("akun Instagram")
    sender = ctx.org_name or "[nama Anda]"
    lines = [f"Halo {name}, saya dari {sender}."]
    if p.get("rating") and p.get("reviews"):
        lines.append(f"Saya lihat {name} di Google Maps punya rating {p['rating']} dari {p['reviews']} ulasan di {area}, keren.")
    else:
        lines.append(f"Saya lihat {name} di Google Maps untuk {industry} di {area}.")
    if gaps:
        lines.append(f"Tapi saya belum menemukan {' dan '.join(gaps)}-nya, padahal banyak pelanggan {industry} sekarang "
                     "mencari lewat situ.")
    if offer:
        lines.append(f"Kami bantu {offer}.")
    else:
        lines.append(f"Kami bantu bisnis lokal seperti {name} supaya lebih mudah ditemukan pelanggan baru.")
    lines.append("Kalau berkenan, boleh saya kirim contoh singkatnya? Terima kasih.")
    return {"business": name, "key": _lead_key(p), "industry": industry, "area": area, "report_id": rid,
            "whatsapp": p.get("whatsapp"), "draft": "\n".join(lines), "offer_used": offer or None,
            "note": None if p.get("whatsapp") else "belum ada nomor HP: jalankan Cek kontak di laporan dulu"}


def tool_search_competitors(ctx, category, location, radius=2000, ig_scrape=3):
    if category not in CATEGORIES and not category.startswith("keyword:") and "=" not in category:
        return {"error": f"kategori harus salah satu dari {list(CATEGORIES)} atau 'keyword:...'"}
    radius = min(max(int(radius or 2000), 200), 10000)
    ig_scrape = min(max(int(ig_scrape or 3), 0), 15)
    # guard: kalau lokasi+kategori ini sudah dipindai hari ini, pakai data yang ada
    cached = _osm_competitors(location=location.split(",")[0], category=category, limit=25)
    today = datetime.now(timezone.utc).date().isoformat()  # last_scanned disimpan dalam UTC
    if cached["count"] and any(i["scanned"] == today for i in cached["items"]):
        return {"note": "sudah dipindai hari ini, pakai data tersimpan (tidak scrape ulang)", "data": cached}
    out, code, stopped = run_script(ctx, "pipeline.py", ["--location", location, "--category", category,
                                                          "--radius", str(radius), "--ig-scrape", str(ig_scrape)],
                                    SEARCH_TIMEOUT)
    if stopped == "cancel":
        raise ChatStopped()
    res = {"log_tail": out[-600:], "data": _osm_competitors(location=location.split(",")[0], category=category, limit=25)}
    if stopped == "timeout":
        res["error"] = f"pencarian melebihi batas waktu {SEARCH_TIMEOUT // 60} menit; data di bawah mungkin belum lengkap"
    return res


def tool_scrape_instagram(ctx, usernames):
    users = [u.strip().lstrip("@").lower() for u in (usernames or []) if str(u).strip()][:5]
    users = [u for u in users if re.fullmatch(r"[a-z0-9._]{1,30}", u)]
    if not users:
        return {"error": "usernames kosong atau tidak valid"}
    # ig_scraper.py sendiri melewati akun yang di-scrape < 24 jam (diff mode)
    out, code, stopped = run_script(ctx, "ig_scraper.py", ["--mode", "direct", "--targets", ",".join(users), "--out", "hasil"],
                                    SCRAPE_TIMEOUT)
    if stopped == "cancel":
        raise ChatStopped()
    res = {"profiles": []}
    if stopped == "timeout":
        res["error"] = f"scraping melebihi batas waktu {SCRAPE_TIMEOUT // 60} menit; sebagian akun mungkin belum ada"
    if not os.path.exists(DB):
        res["profiles"] = [{"username": u, "error": "gagal diambil"} for u in users]
        return res
    conn = datastore.connect_sqlite(DB)
    try:
        for u in users:
            try:
                row = conn.execute("SELECT data FROM profiles WHERE lower(username)=?", (u,)).fetchone()
            except sqlite3.OperationalError:
                row = None
            if not row:
                res["profiles"].append({"username": u, "error": "gagal diambil"})
                continue
            d = json.loads(row[0])
            s = d.get("stats") or {}
            res["profiles"].append({"username": u, "followers": d.get("followers"), "posts": d.get("posts_count"),
                                    "bio": d.get("biography"), "engagement_rate": s.get("engagement_rate"),
                                    "avg_likes": s.get("avg_likes"), "avg_comments": s.get("avg_comments"),
                                    "posts_per_week": s.get("posts_per_week"), "media_mix": s.get("media_mix"),
                                    "best_day": s.get("best_day"), "best_hour_utc": s.get("best_hour_utc"),
                                    "growth": s.get("growth")})
    finally:
        conn.close()
    return res


def tool_find_instagram_accounts(ctx, query):
    from pipeline import bing_instagram
    found = []
    for q in (f"{query} instagram", f"{query} site:instagram.com"):
        ctx.check()
        try:
            found += [u for u in bing_instagram(q) if u not in found]
        except Exception as e:  # noqa: BLE001
            return {"error": str(e), "found": found}
    return {"query": query, "instagram_accounts": found[:15],
            "note": "hasil pencarian web, belum tentu semuanya bisnis yang relevan; cek bio via scrape_instagram"}


def tool_google_trends(ctx, keywords):
    from google_trends import trends
    try:
        df = trends(list(keywords or [])[:5]).drop(columns=["isPartial"], errors="ignore")
    except Exception as e:  # noqa: BLE001
        return {"error": str(e)}
    if df.empty:
        return {"note": "volume pencarian terlalu kecil"}
    return {c: {"avg_4w": round(float(df[c].tail(28).mean()), 1),
                "avg_prev_4w": round(float(df[c].iloc[-56:-28].mean()), 1),
                "latest": int(df[c].iloc[-1])} for c in df.columns}


TOOL_FUNCS = {
    "market_research": tool_market_research,
    "get_report": tool_get_report,
    "list_competitors": tool_list_competitors,
    "list_prospects": tool_list_prospects,
    "set_lead_status": tool_set_lead_status,
    "add_watch": tool_add_watch,
    "draft_whatsapp": tool_draft_whatsapp,
    "search_competitors": tool_search_competitors,
    "scrape_instagram": tool_scrape_instagram,
    "find_instagram_accounts": tool_find_instagram_accounts,
    "google_trends": tool_google_trends,
}


def call_tool(ctx, name, args):
    fn = TOOL_FUNCS.get(name)
    if not fn:
        return {"error": "tool tidak dikenal"}
    try:
        return fn(ctx, **args)
    except ChatStopped:
        raise
    except TypeError as e:
        return {"error": f"argumen tool tidak valid: {e}"}
    except Exception as e:  # noqa: BLE001
        return {"error": f"{type(e).__name__}: {e}"}


# ------------------------------------------------------------
# agent loop
# ------------------------------------------------------------

_models = []


def api_key():
    return os.environ.get("OPENROUTER_API_KEY", "")


def candidate_models(log=None):
    """MODEL dari env dulu, lalu PREFERRED yang tersedia, lalu sisa model gratis + tools."""
    log = log or (lambda s: print(s, flush=True))
    if _models:
        return _models
    if MODEL:
        _models.append(MODEL)
    try:
        data = netutil.get(f"{OPENROUTER}/models").json()["data"]
        tools = {m["id"] for m in data if "tools" in (m.get("supported_parameters") or [])}
        _models.extend(m for m in PREFERRED if m in tools and m not in _models)
        _models.extend(sorted(m for m in tools if m.endswith(":free") and m not in _models))
    except Exception as e:  # noqa: BLE001
        log(f"[agent] gagal ambil daftar model: {e}")
        _models.extend(m for m in PREFERRED if m not in _models)
    return _models


def chat(messages, ctx):
    """Satu panggilan LLM dengan tools. Model dicoba berurutan; yang berhasil dipakai terus untuk langkah berikutnya.
    Request yang sedang berjalan tidak bisa diputus dari luar, batasnya LLM_TIMEOUT detik."""
    last = None
    for model in list(candidate_models(ctx.log)):
        r = netutil.post(f"{OPENROUTER}/chat/completions", retries=2, timeout=LLM_TIMEOUT,
                         headers={"Authorization": f"Bearer {api_key()}", "Content-Type": "application/json",
                                  "X-Title": "raqio-agent"},
                         json={"model": model, "messages": messages, "tools": TOOLS, "temperature": 0.2})
        try:
            j = r.json()
        except Exception:  # noqa: BLE001
            j = {"error": {"message": f"HTTP {r.status_code}"}}
        if "error" not in j and j.get("choices"):
            if _models[0] != model:  # model ini jalan -> pakai terus untuk langkah berikutnya
                _models.remove(model)
                _models.insert(0, model)
            if ctx.model != model:
                ctx.model = model
                ctx.log(f"[model: {model}]")
            return j["choices"][0]["message"]
        last = (j.get("error") or {}).get("message", j)
        ctx.log(f"[agent] {model} gagal: {str(last)[:120]}, coba model lain")
        if model in _models:
            _models.remove(model)
    raise RuntimeError(f"Semua model gagal. Terakhir: {str(last)[:200]}")


def no_dash(text: str) -> str:
    """Model kadang tetap memakai em dash; ganti jadi koma."""
    return text.replace(" — ", ", ").replace("—", ", ")


def trim_history(history, max_len=60, keep=40):
    """Kalau > max_len pesan: simpan system + `keep` terakhir, dipotong di awal pesan user supaya pasangan
    tool_call/tool tetap utuh."""
    if len(history) <= max_len:
        return history
    tail = list(history[-keep:])
    while tail and tail[0].get("role") != "user":
        tail.pop(0)
    return [history[0]] + tail


def run_agent(question, history=None, log=None, ctx=None):
    """Jawab satu pertanyaan. history = daftar pesan LLM giliran sebelumnya (system di indeks 0) atau None.
    Mengembalikan (jawaban, history_baru). Pesan Konteks dari ctx hanya dikirim ke model, tidak masuk history."""
    ctx = ctx or Context()
    if log is not None:
        ctx.log = log
    messages = list(history) if history else []
    if not messages or messages[0].get("role") != "system":
        messages.insert(0, {"role": "system", "content": SYSTEM})
    else:
        messages[0] = {"role": "system", "content": SYSTEM}  # prompt versi terbaru selalu dipakai
    messages.append({"role": "user", "content": str(question)})
    extra = ctx.context_messages()
    for _ in range(MAX_STEPS):
        ctx.check()
        msg = chat(messages[:1] + extra + messages[1:], ctx)
        ctx.check()
        messages.append({k: v for k, v in msg.items() if k in ("role", "content", "tool_calls")})
        calls = msg.get("tool_calls") or []
        if not calls:
            return no_dash(msg.get("content") or ""), messages
        for c in calls:
            fn = c.get("function") or {}
            name = fn.get("name") or ""
            try:
                args = json.loads(fn.get("arguments") or "{}")
            except (json.JSONDecodeError, TypeError):
                args = {}
            if not isinstance(args, dict):
                args = {}
            ctx.log(f"🔧 {name}({json.dumps(args, ensure_ascii=False)})")
            ctx.check()
            result = call_tool(ctx, name, args)
            messages.append({"role": "tool", "tool_call_id": c.get("id"),
                             "content": json.dumps(result, ensure_ascii=False, default=str)[:12000]})
    return "Berhenti: terlalu banyak langkah. Coba pertanyaan yang lebih spesifik.", messages


def main():
    if not api_key():
        sys.exit("Set dulu: export OPENROUTER_API_KEY=\"sk-or-...\" (buat di openrouter.ai/keys)")
    print(f"Model: {MODEL or 'otomatis (murah -> gratis)'}", flush=True)
    ctx = Context()
    if len(sys.argv) > 1:
        answer, _ = run_agent(" ".join(sys.argv[1:]), ctx=ctx)
        print("\n" + answer)
        return
    history = None
    print("Agent riset kompetitor (tanpa org: riset pasar memakai cache lokal). Ketik pertanyaan (Ctrl+C untuk keluar).")
    while True:
        try:
            q = input("\nKamu: ").strip()
        except (KeyboardInterrupt, EOFError):
            break
        if q:
            answer, history = run_agent(q, history, ctx=ctx)
            history = trim_history(history)
            print("\nAgent:", answer)


if __name__ == "__main__":
    main()
