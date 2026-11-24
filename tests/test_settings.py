"""ทดสอบหน้า Settings: ตรวจค่า, บันทึกลงไฟล์, ใช้ทันที และไม่แตะค่าความปลอดภัย"""
import http.client
import json
import os
import shutil
import sys
import tempfile
import threading
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from netpulse import db  # noqa: E402
from netpulse.auth import Auth  # noqa: E402
from netpulse.config import DEFAULTS, _normalize_targets, load_config  # noqa: E402
from netpulse.server import AppContext, serve  # noqa: E402
from netpulse.settings import validate  # noqa: E402

SAVED = _normalize_targets(DEFAULTS["targets"])


class ValidateTests(unittest.TestCase):
    def test_numbers(self):
        clean, err = validate({"latency_threshold_ms": 150, "interval_sec": "3"}, SAVED, 2)
        self.assertEqual(err, {})
        self.assertEqual(clean, {"latency_threshold_ms": 150, "interval_sec": 3})
        _, err = validate({"latency_threshold_ms": 5, "interval_sec": "abc", "down_after_failures": 1.5}, SAVED, 2)
        self.assertEqual(set(err), {"latency_threshold_ms", "interval_sec", "down_after_failures"})

    def test_timeout_not_longer_than_interval(self):
        _, err = validate({"ping_timeout_ms": 3000}, SAVED, 2)
        self.assertIn("ping_timeout_ms", err)
        _, err = validate({"ping_timeout_ms": 3000, "interval_sec": 5}, SAVED, 2)
        self.assertEqual(err, {})

    def test_hosts_rejected(self):
        bad = ["-t", "-n 100 8.8.8.8", "8.8.8.8 -t", "999.1.1.1", "0.0.0.0", "a..b", "x;calc", "", "::1"]
        for host in bad:
            _, err = validate({"targets": [{"name": "x", "host": host}]}, SAVED, 2)
            self.assertIn("targets", err, host)

    def test_hosts_accepted_and_ids(self):
        targets = [
            {"id": "8.8.8.8", "name": "Google", "host": "8.8.8.8"},       # เดิม → คง id
            {"id": "gateway", "name": "Router", "host": "AUTO"},          # auto ตัวพิมพ์ใหญ่ได้
            {"id": "", "name": "Quad9", "host": "9.9.9.9"},
            {"id": "", "name": "Site", "host": "example.com"},
        ]
        clean, err = validate({"targets": targets}, SAVED, 2)
        self.assertEqual(err, {})
        self.assertEqual([t["id"] for t in clean["targets"]], ["8.8.8.8", "gateway", "9.9.9.9", "example.com"])
        self.assertEqual(clean["targets"][1]["host"], "auto")

    def test_changed_host_gets_new_id(self):
        clean, err = validate({"targets": [{"id": "8.8.8.8", "name": "G", "host": "8.8.4.4"}]}, SAVED, 2)
        self.assertEqual(err, {})
        self.assertEqual(clean["targets"][0]["id"], "8.8.4.4")

    def test_duplicates_and_limits(self):
        _, err = validate({"targets": [{"name": "a", "host": "1.1.1.1"}, {"name": "b", "host": "1.1.1.1"}]}, SAVED, 2)
        self.assertIn(1, err["targets"])
        _, err = validate({"targets": [{"name": "a", "host": "auto"}, {"name": "b", "host": "auto"}]}, SAVED, 2)
        self.assertIn(1, err["targets"])
        _, err = validate({"targets": []}, SAVED, 2)
        self.assertIn("targets", err)
        _, err = validate({"targets": [{"name": "", "host": "1.1.1.1"}]}, SAVED, 2)
        self.assertIn(0, err["targets"])


class FakeMonitor:
    def snapshot(self):
        return {"targets": [{"kind": "gateway", "host": "192.168.1.1"}], "overall": {}, "started_at": 0, "last_beat": None}


class SettingsApiTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.path = os.path.join(self.tmp, "config.json")
        raw = dict(DEFAULTS, db_path=os.path.join(self.tmp, "t.db"))
        raw["auth"] = {"password_hash": "", "totp_secret": "KEEP-ME"}
        with open(self.path, "w", encoding="utf-8") as f:
            json.dump(raw, f)
        self.cfg = load_config(self.path)
        self.cfg["port"] = 0
        conn = db.connect(self.cfg["db_path"])
        db.init(conn)
        conn.close()
        self.auth = Auth(self.cfg)
        self.ctx = AppContext(self.cfg, FakeMonitor(), self.auth, config_path=self.path)
        self.httpd = serve(self.ctx, "127.0.0.1")
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def req(self, method, path, body=None):
        c = http.client.HTTPConnection("127.0.0.1", self.httpd.server_address[1], timeout=10)
        h = {"Content-Type": "application/json"} if body is not None else {}
        c.request(method, path, body=json.dumps(body).encode() if body is not None else None, headers=h)
        r = c.getresponse()
        data = json.loads(r.read() or b"{}")
        c.close()
        return r.status, data

    def file(self):
        with open(self.path, encoding="utf-8") as f:
            return json.load(f)

    def test_get(self):
        status, d = self.req("GET", "/api/settings")
        self.assertEqual(status, 200)
        self.assertEqual(d["values"]["latency_threshold_ms"], 200)
        self.assertEqual(d["gateway_ip"], "192.168.1.1")
        self.assertFalse(d["restart_required"])
        self.assertNotIn("auth", json.dumps(d["values"]))

    def test_save_applies_live_and_keeps_auth(self):
        status, d = self.req("POST", "/api/settings", {"latency_threshold_ms": 120, "session_days": 7})
        self.assertEqual(status, 200)
        self.assertEqual(d["changed"], ["latency_threshold_ms", "session_days"])
        self.assertFalse(d["restart_required"])
        self.assertEqual(self.cfg["latency_threshold_ms"], 120)          # ใช้ทันที
        self.assertEqual(self.auth.session_sec, 7 * 86400)
        f = self.file()
        self.assertEqual(f["latency_threshold_ms"], 120)                 # บันทึกลงไฟล์
        self.assertEqual(f["auth"]["totp_secret"], "KEEP-ME")             # ค่าอื่นไม่ถูกแตะ
        conn = db.connect(self.cfg["db_path"])
        kinds = [r[0] for r in conn.execute("SELECT kind FROM events")]
        conn.close()
        self.assertEqual(kinds, ["settings"])

    def test_security_keys_ignored(self):
        status, d = self.req("POST", "/api/settings", {"lan_access": True, "port": 9999,
                                                       "auth": {"password_hash": "x"}})
        self.assertEqual(status, 200)
        self.assertEqual(d["changed"], [])
        f = self.file()
        self.assertFalse(f["lan_access"])
        self.assertEqual(f["port"], 8000)
        self.assertEqual(f["auth"]["totp_secret"], "KEEP-ME")

    def test_invalid_returns_field_errors_and_saves_nothing(self):
        before = self.file()
        status, d = self.req("POST", "/api/settings", {"latency_threshold_ms": 1, "targets": [{"name": "x", "host": "-t"}]})
        self.assertEqual(status, 400)
        self.assertIn("latency_threshold_ms", d["fields"])
        self.assertIn("0", d["fields"]["targets"])
        self.assertEqual(self.file(), before)
        self.assertEqual(self.cfg["latency_threshold_ms"], 200)

    def test_targets_need_restart(self):
        targets = [{"id": "8.8.8.8", "name": "Google DNS", "host": "8.8.8.8"},
                   {"id": "", "name": "Quad9", "host": "9.9.9.9"}]
        status, d = self.req("POST", "/api/settings", {"targets": targets})
        self.assertEqual(status, 200)
        self.assertTrue(d["restart_required"])
        self.assertEqual([t["host"] for t in self.file()["targets"]], ["8.8.8.8", "9.9.9.9"])
        self.assertEqual(len(self.cfg["targets"]), 3)  # ตัวที่กำลังรันยังไม่เปลี่ยน
        _, g = self.req("GET", "/api/settings")
        self.assertTrue(g["restart_required"])


if __name__ == "__main__":
    unittest.main()
