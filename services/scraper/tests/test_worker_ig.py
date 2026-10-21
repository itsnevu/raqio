"""Job ig_profile: validasi username, salin profil dari SQLite ke Postgres (koneksi palsu)."""
import json
import os
import sqlite3

import worker
from tests.test_worker import FakeConn


def test_username_tidak_valid():
    status, _, err = worker.do_ig_profile(FakeConn(), {"id": 1, "org_id": "o", "params": {"username": "a b!"}})
    assert status == "failed" and "username" in err


def test_profil_disalin_ke_postgres(tmp_path, monkeypatch):
    db = tmp_path / "ig.db"
    c = sqlite3.connect(db)
    c.execute("CREATE TABLE profiles (username TEXT PRIMARY KEY, data TEXT, followers INTEGER, last_scraped TEXT, followers_history TEXT)")
    c.execute("INSERT INTO profiles VALUES (?,?,?,?,?)", ("kopi.enak", json.dumps({"username": "kopi.enak", "followers": 1200}), 1200,
                                                         "2026-01-01T00:00:00+00:00", json.dumps([{"ts": "2026-01-01", "followers": 1200}])))
    c.commit(); c.close()
    monkeypatch.setenv("RAQIO_DATA_DIR", str(tmp_path))
    monkeypatch.setattr(worker, "run_cmd", lambda conn, jid, script, args: ("ok\n", 0, False))
    conn = FakeConn()
    status, result, err = worker.do_ig_profile(conn, {"id": 1, "org_id": "o", "params": {"username": "Kopi.Enak"}})
    assert status == "done" and result == {"username": "kopi.enak", "followers": 1200} and err is None
    kind, params = conn.calls[-1]
    assert kind == "INSERT" and params[0] == "kopi.enak" and params[2] == 1200


def test_akun_tidak_ditemukan(tmp_path, monkeypatch):
    c = sqlite3.connect(tmp_path / "ig.db")
    c.execute("CREATE TABLE profiles (username TEXT PRIMARY KEY, data TEXT, followers INTEGER, last_scraped TEXT, followers_history TEXT)")
    c.commit(); c.close()
    monkeypatch.setenv("RAQIO_DATA_DIR", str(tmp_path))
    monkeypatch.setattr(worker, "run_cmd", lambda conn, jid, script, args: ("gagal\n", 1, False))
    status, _, err = worker.do_ig_profile(FakeConn(), {"id": 1, "org_id": "o", "params": {"username": "x"}})
    assert status == "failed" and err == "gagal"
    assert os.path.exists(tmp_path / "ig.db")
