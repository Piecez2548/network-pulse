"""ทดสอบ Phase 2: login, TOTP, rate limit, session และการป้องกันของเว็บเซิร์ฟเวอร์"""
import http.client
import json
import os
import shutil
import sys
import tempfile
import threading
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pyotp  # noqa: E402

from netpulse import auth as authmod, db  # noqa: E402
from netpulse.auth import Auth, hash_password, is_lan_client, verify_password  # noqa: E402
from netpulse.config import DEFAULTS, _normalize_targets  # noqa: E402
from netpulse.server import AppContext, serve  # noqa: E402

SECRET = pyotp.random_base32()
PASSWORD = "correct horse battery"
PW_HASH = hash_password(PASSWORD, iterations=1000)  # ลดรอบเพื่อให้เทสต์เร็ว


def make_cfg(db_path, enabled=True):
    cfg = dict(DEFAULTS, db_path=db_path, port=0)
    cfg["targets"] = _normalize_targets(DEFAULTS["targets"])
    cfg["auth"] = {"password_hash": PW_HASH if enabled else "", "totp_secret": SECRET if enabled else ""}
    return cfg


class Clock:
    def __init__(self, t):
        self.t = t

    def __call__(self):
        return self.t


class AuthUnitTests(unittest.TestCase):
    def setUp(self):
        self.conn = db.connect(":memory:")
        db.init(self.conn)
        self.clock = Clock(1_800_000_000)
        self.auth = Auth(make_cfg(":memory:"), clock=self.clock)
        self.totp = pyotp.TOTP(SECRET)

    def code(self, offset=0):
        return self.totp.at(int(self.clock.t) + offset)

    def test_password_hash(self):
        self.assertTrue(verify_password(PASSWORD, PW_HASH))
        self.assertFalse(verify_password("wrong", PW_HASH))
        self.assertFalse(verify_password(PASSWORD, "garbage"))
        self.assertNotEqual(hash_password("x", 1000), hash_password("x", 1000))  # salt ต่างกัน

    def test_login_success_and_session(self):
        token, err = self.auth.login(self.conn, "192.168.1.20", "UA", PASSWORD, self.code())
        self.assertIsNone(err)
        self.assertIsNotNone(self.auth.session(self.conn, token, "192.168.1.20"))
        self.assertIsNone(self.auth.session(self.conn, token + "x", "192.168.1.20"))
        self.auth.logout(self.conn, token)
        self.assertIsNone(self.auth.session(self.conn, token, "192.168.1.20"))

    def test_session_expires(self):
        token, _ = self.auth.login(self.conn, "127.0.0.1", "UA", PASSWORD, self.code())
        self.clock.t += self.auth.session_sec + 1
        self.assertIsNone(self.auth.session(self.conn, token, "127.0.0.1"))

    def test_totp_replay_rejected(self):
        code = self.code()
        token, err = self.auth.login(self.conn, "127.0.0.1", "UA", PASSWORD, code)
        self.assertIsNone(err)
        token, err = self.auth.login(self.conn, "127.0.0.1", "UA", PASSWORD, code)
        self.assertIsNone(token)
        self.assertEqual(err[0], 401)

    def test_totp_clock_skew_window(self):
        self.assertIsNone(self.auth.login(self.conn, "127.0.0.1", "", PASSWORD, self.code(-30))[1])
        self.clock.t += 120
        self.assertIsNotNone(self.auth.login(self.conn, "127.0.0.1", "", PASSWORD, self.code(-90))[1])

    def test_wrong_password_or_code(self):
        self.assertEqual(self.auth.login(self.conn, "127.0.0.1", "", "nope", self.code())[1][0], 401)
        self.assertEqual(self.auth.login(self.conn, "127.0.0.1", "", PASSWORD, "000000")[1][0], 401)
        self.assertEqual(self.auth.login(self.conn, "127.0.0.1", "", PASSWORD, "abc")[1][0], 401)

    def test_lockout_per_ip(self):
        for _ in range(authmod.MAX_FAILS_PER_IP - 1):
            self.assertEqual(self.auth.login(self.conn, "192.168.1.9", "", "bad", "123456")[1][0], 401)
        self.assertEqual(self.auth.login(self.conn, "192.168.1.9", "", "bad", "123456")[1][0], 429)
        # แม้รหัสถูกก็ยังเข้าไม่ได้ระหว่างล็อก
        self.assertEqual(self.auth.login(self.conn, "192.168.1.9", "", PASSWORD, self.code())[1][0], 429)
        # IP อื่นยังเข้าได้
        self.assertIsNone(self.auth.login(self.conn, "192.168.1.10", "", PASSWORD, self.code())[1])
        self.clock.t += authmod.LOCK_SEC + 31
        self.assertIsNone(self.auth.login(self.conn, "192.168.1.9", "", PASSWORD, self.code())[1])
        kinds = [r[0] for r in self.conn.execute("SELECT kind FROM events ORDER BY id")]
        self.assertIn("auth_lock", kinds)

    def test_lan_client_filter(self):
        for ip in ("127.0.0.1", "192.168.1.5", "10.0.0.8", "172.16.3.4", "::1", "::ffff:192.168.1.7"):
            self.assertTrue(is_lan_client(ip), ip)
        for ip in ("8.8.8.8", "100.64.1.1", "169.254.1.1", "not-an-ip"):
            self.assertFalse(is_lan_client(ip), ip)


class FakeMonitor:
    def snapshot(self):
        return {"targets": [], "overall": {"status": "unknown", "detail": ""}, "started_at": 0, "last_beat": None}


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp()
        cls.cfg = make_cfg(os.path.join(cls.tmp, "t.db"))
        conn = db.connect(cls.cfg["db_path"])
        db.init(conn)
        conn.close()
        cls.ctx = AppContext(cls.cfg, FakeMonitor(), Auth(cls.cfg))
        cls.httpd = serve(cls.ctx, "127.0.0.1")
        cls.port = cls.httpd.server_address[1]
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def req(self, method, path, body=None, headers=None, cookie=None):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        h = dict(headers or {})
        if cookie:
            h["Cookie"] = cookie
        data = None
        if body is not None:
            data = json.dumps(body).encode()
            h.setdefault("Content-Type", "application/json")
        c.request(method, path, body=data, headers=h)
        r = c.getresponse()
        raw = r.read()
        c.close()
        return r, raw

    def login(self):
        code = pyotp.TOTP(SECRET).now()
        r, _ = self.req("POST", "/api/login", {"password": PASSWORD, "code": code})
        if r.status != 200:  # รหัสนี้อาจถูกใช้ไปแล้วในเทสต์ก่อนหน้า — ข้ามขั้น TOTP ด้วย session ตรง
            token = "t-" + code + str(id(self))
            conn = db.connect(self.cfg["db_path"])
            db.session_create(conn, authmod.token_hash(token), 0, 2_000_000_000, "127.0.0.1", "")
            conn.close()
            return f"np_session={token}"
        cookie = r.getheader("Set-Cookie")
        self.assertIn("HttpOnly", cookie)
        self.assertIn("SameSite=Strict", cookie)
        return cookie.split(";")[0]

    def test_redirects_and_401_without_session(self):
        r, _ = self.req("GET", "/")
        self.assertEqual((r.status, r.getheader("Location")), (302, "/login"))
        self.assertEqual(self.req("GET", "/api/live")[0].status, 401)
        self.assertEqual(self.req("GET", "/api/config")[0].status, 401)
        r, raw = self.req("GET", "/api/auth-status")
        self.assertEqual(json.loads(raw)["logged_in"], False)
        r, _ = self.req("GET", "/login")
        self.assertEqual(r.status, 200)
        self.assertIn("frame-ancestors 'none'", r.getheader("Content-Security-Policy"))
        self.assertEqual(self.req("GET", "/static/login.js")[0].status, 200)

    def test_login_flow(self):
        r, raw = self.req("POST", "/api/login", {"password": "nope", "code": "123456"})
        self.assertEqual(r.status, 401)
        cookie = self.login()
        self.assertEqual(self.req("GET", "/", cookie=cookie)[0].status, 200)
        r, raw = self.req("GET", "/api/config", cookie=cookie)
        self.assertEqual(r.status, 200)
        self.assertTrue(json.loads(raw)["auth_enabled"])
        r, raw = self.req("GET", "/api/sessions", cookie=cookie)
        self.assertTrue(any(s["current"] for s in json.loads(raw)["sessions"]))
        r, _ = self.req("POST", "/api/logout", {}, cookie=cookie)
        self.assertEqual(r.status, 200)
        self.assertEqual(self.req("GET", "/api/live", cookie=cookie)[0].status, 401)

    def test_post_guards(self):
        cookie = self.login()
        r, _ = self.req("POST", "/api/logout", {}, cookie=cookie, headers={"Origin": "http://evil.example"})
        self.assertEqual(r.status, 403)
        r, _ = self.req("POST", "/api/logout", {}, cookie=cookie, headers={"Content-Type": "text/plain"})
        self.assertEqual(r.status, 403)
        r, _ = self.req("POST", "/api/login", {"password": "x" * 9000, "code": "1"})
        self.assertEqual(r.status, 413)

    def test_dns_rebinding_host_rejected(self):
        r, _ = self.req("GET", "/api/auth-status", headers={"Host": f"evil.example:{self.port}"})
        self.assertEqual(r.status, 421)

    def test_static_path_traversal(self):
        self.assertEqual(self.req("GET", "/static/../config.json")[0].status, 404)
        self.assertEqual(self.req("GET", "/static/..%2fconfig.json")[0].status, 404)


class NoAuthModeTests(unittest.TestCase):
    def test_open_on_localhost_when_not_configured(self):
        tmp = tempfile.mkdtemp()
        try:
            cfg = make_cfg(os.path.join(tmp, "t.db"), enabled=False)
            conn = db.connect(cfg["db_path"])
            db.init(conn)
            conn.close()
            ctx = AppContext(cfg, FakeMonitor(), Auth(cfg))
            httpd = serve(ctx, "127.0.0.1")
            threading.Thread(target=httpd.serve_forever, daemon=True).start()
            c = http.client.HTTPConnection("127.0.0.1", httpd.server_address[1], timeout=10)
            c.request("GET", "/api/config")
            r = c.getresponse()
            self.assertEqual(r.status, 200)
            self.assertFalse(json.loads(r.read())["auth_enabled"])
            c.close()
            httpd.shutdown()
            httpd.server_close()
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
