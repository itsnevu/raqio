"""
procutil.py, menjalankan skrip Python anak (market.py, ig_scraper.py, pipeline.py) dari worker dan agent.

Pagar yang sama untuk semua pemanggil:
  - pohon proses: anak dijalankan sebagai grup/sesi proses sendiri, sehingga saat dihentikan (batas waktu, batal,
    worker berhenti) seluruh turunannya ikut mati: Python -> driver Playwright (node) -> Chromium. Tanpa ini Chromium
    yatim bisa tertinggal dan memakan RAM/shm worker. POSIX: killpg; Windows: taskkill /T.
  - env: rahasia yang tidak dibutuhkan anak (SMTP, AUTH_SECRET, webhook) tidak diwariskan; yang dibutuhkan
    (DATABASE_URL untuk --detail, OPENROUTER_API_KEY untuk klasifikasi/insight, TG_TOKEN untuk alert IG) tetap ada.
  - nilai argumen CLI dari pengguna disaring (cli_value) supaya tidak terbaca argparse sebagai opsi.
"""
import os
import signal
import subprocess
import sys

SECRET_ENV = ("SMTP_PASS", "SMTP_USER", "SMTP_HOST", "SMTP_FROM", "SMTP_PORT", "AUTH_SECRET", "SLACK_WEBHOOK")


def cli_value(v, n=120):
    """Nilai argumen untuk argparse anak: dipotong `n` karakter, tanpa awalan '-' (akan dikira opsi), tanpa ';'
    (pemisah --areas) dan tanpa karakter kontrol/baris baru."""
    s = "".join(ch if ch >= " " else " " for ch in str(v or ""))
    return s.replace(";", " ").strip().lstrip("-").strip()[:n]


def child_env(extra=None):
    """os.environ tanpa rahasia yang tidak dibutuhkan anak, plus encoding UTF-8 dan `extra`."""
    env = {k: v for k, v in os.environ.items() if k not in SECRET_ENV}
    env.update(PYTHONIOENCODING="utf-8", PYTHONUTF8="1")
    env.update(extra or {})
    return env


def popen(script, args, cwd, env=None):
    """Popen skrip Python dengan stdout+stderr digabung (teks UTF-8), dalam grup proses sendiri."""
    cmd = [sys.executable, "-W", "ignore", "-u", script] + [str(a) for a in args]
    kw = {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP} if os.name == "nt" else {"start_new_session": True}
    return subprocess.Popen(cmd, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8",
                            errors="replace", env=env if env is not None else child_env(), **kw)


def kill_tree(proc, grace=10):
    """Hentikan proses beserta seluruh turunannya. POSIX: SIGTERM ke grup, tunggu `grace` detik, lalu SIGKILL.
    Windows: taskkill /T /F (tidak ada sinyal halus untuk pohon proses)."""
    if proc.poll() is not None:
        return
    if os.name == "nt":
        try:
            subprocess.run(["taskkill", "/T", "/F", "/PID", str(proc.pid)], capture_output=True, timeout=30)
        except Exception:  # noqa: BLE001
            proc.kill()
    else:
        try:
            os.killpg(proc.pid, signal.SIGTERM)
        except ProcessLookupError:
            return
        except Exception:  # noqa: BLE001 (bukan pemimpin grup, mis. dijalankan tanpa start_new_session)
            proc.terminate()
        try:
            proc.wait(timeout=grace)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(proc.pid, signal.SIGKILL)
            except Exception:  # noqa: BLE001
                proc.kill()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        pass
