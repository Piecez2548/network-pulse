"""ทดสอบ v1.3: Wi-Fi, DNS, ตัวเก็บค่าเบื้องหลัง, สาเหตุ Wi-Fi ในรายงาน, ไฟล์หน้าเว็บแบบ offline"""
import os
import re
import struct
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from netpulse import db, dnsprobe, report, wifi  # noqa: E402
from netpulse.diag import DNS_FAIL_ROUNDS, DiagSampler  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

NETSH_EN = """
There is 1 interface on the system:

    Name                   : Wi-Fi
    Description            : Intel(R) Wi-Fi 6 AX201 160MHz
    GUID                   : 11111111-2222-3333-4444-555555555555
    Physical address       : aa:bb:cc:dd:ee:ff
    State                  : connected
    SSID                   : HomeNet 5G
    AP BSSID               : 11:22:33:44:55:66
    Band                   : 5 GHz
    Channel                : 36
    Radio type             : 802.11ax
    Authentication         : WPA2-Personal
    Receive rate (Mbps)    : 1200
    Transmit rate (Mbps)   : 960
    Signal                 : 88%
    Rssi                   : -48
    Profile                : HomeNet 5G
"""
NETSH_TH = """
มีอินเทอร์เฟซ 1 รายการในระบบ:

    ชื่อ                    : Wi-Fi
    สถานะ                  : เชื่อมต่อแล้ว
    SSID                   : บ้าน
    AP BSSID               : 11:22:33:44:55:77
    ย่านความถี่            : 2.4 GHz
    ช่อง                   : 6
    ชนิดคลื่นวิทยุ          : 802.11n
    อัตราการรับ (Mbps)     : 144.4
    อัตราการส่ง (Mbps)     : 72.2
    สัญญาณ                 : 31%
"""
NETSH_DISCONNECTED = """
    Name                   : Wi-Fi
    State                  : disconnected
    Radio status           : Hardware On
"""


class WifiParseTests(unittest.TestCase):
    def test_english(self):
        w = wifi.parse_interfaces(NETSH_EN)
        self.assertTrue(w["connected"])
        self.assertEqual((w["ssid"], w["signal"], w["rssi"], w["channel"], w["band"]), ("HomeNet 5G", 88, -48, 36, "5 GHz"))
        self.assertEqual((w["rx_mbps"], w["tx_mbps"]), (1200.0, 960.0))
        self.assertEqual(w["bssid"], "11:22:33:44:55:66")

    def test_thai_labels(self):
        w = wifi.parse_interfaces(NETSH_TH)
        self.assertTrue(w["connected"])
        self.assertEqual((w["signal"], w["channel"], w["band"]), (31, 6, "2.4 GHz"))
        self.assertEqual((w["rx_mbps"], w["tx_mbps"]), (144.4, 72.2))

    def test_disconnected(self):
        w = wifi.parse_interfaces(NETSH_DISCONNECTED)
        self.assertFalse(w["connected"])
        self.assertIsNone(w["signal"])


class DnsProbeTests(unittest.TestCase):
    def test_query_packet(self):
        pkt = dnsprobe.build_query("www.google.com", 0x1234)
        self.assertEqual(pkt[:2], b"\x12\x34")
        self.assertIn(b"\x03www\x06google\x03com\x00", pkt)

    def test_parse_reply(self):
        ok = struct.pack(">HHHHHH", 7, 0x8180, 1, 2, 0, 0)
        self.assertEqual(dnsprobe.parse_reply(ok, 7), (0, 2))
        self.assertIsNone(dnsprobe.parse_reply(ok, 8))                      # คนละคำถาม
        self.assertIsNone(dnsprobe.parse_reply(struct.pack(">HHHHHH", 7, 0x0100, 1, 0, 0, 0), 7))  # ไม่ใช่คำตอบ
        self.assertEqual(dnsprobe.parse_reply(struct.pack(">HHHHHH", 7, 0x8183, 1, 0, 0, 0), 7), (3, 0))

    def _sock(self, reply_fn):
        class Sock:
            def settimeout(self, t): pass
            def sendto(self, pkt, addr): self.pkt, self.addr = pkt, addr
            def recvfrom(self, n): return reply_fn(self.pkt), (self.addr[0], 53)
            def close(self): pass
        return Sock

    def test_query_success_and_nxdomain(self):
        answer = lambda pkt: pkt[:2] + struct.pack(">HHHHH", 0x8180, 1, 1, 0, 0)
        ms = dnsprobe.query("9.9.9.9", "example.com", sock_factory=self._sock(answer))
        self.assertIsNotNone(ms)
        nx = lambda pkt: pkt[:2] + struct.pack(">HHHHH", 0x8183, 1, 0, 0, 0)
        self.assertIsNone(dnsprobe.query("9.9.9.9", "example.com", sock_factory=self._sock(nx)))

    def test_query_timeout(self):
        def boom(pkt):
            raise OSError("timed out")
        self.assertIsNone(dnsprobe.query("9.9.9.9", "example.com", sock_factory=self._sock(boom)))

    def test_servers_to_probe(self):
        s = dnsprobe.servers_to_probe(["192.168.1.1", "1.1.1.1"])
        self.assertEqual([x[0] for x in s], ["192.168.1.1", "1.1.1.1", "8.8.8.8"])
        self.assertEqual([x[2] for x in s], ["system", "system", "public"])


class DiagSamplerTests(unittest.TestCase):
    def setUp(self):
        self.conn = db.connect(":memory:")
        db.init(self.conn)
        self.cfg = {"db_path": ":memory:", "raw_retention_days": 7}

    def test_wifi_events(self):
        states = iter([
            {"connected": True, "ssid": "Home", "bssid": "aa", "signal": 80},
            {"connected": True, "ssid": "Home", "bssid": "bb", "signal": 70, "band": "5 GHz", "channel": 36},
            {"connected": False, "ssid": None, "bssid": None, "signal": None},
            {"connected": True, "ssid": "Home", "bssid": "bb", "signal": 75},
        ])
        d = DiagSampler(self.cfg, wifi_fn=lambda: next(states))
        evs = [d.sample_wifi(self.conn, 100 + i * 10) for i in range(4)]
        self.assertEqual(evs[0], [])
        self.assertIn("ย้าย access point", evs[1][0])
        self.assertIn("Wi-Fi หลุด", evs[2][0])
        self.assertIn("ต่อกลับ", evs[3][0])
        self.assertEqual([e["kind"] for e in db.events(self.conn)], ["wifi"] * 3)
        series = db.wifi_series(self.conn, 0, 1000, 1000)
        self.assertEqual(series[0][3], 1)  # หลุด 1 ตัวอย่าง
        self.assertEqual(series[0][4], 4)

    def test_no_wifi(self):
        d = DiagSampler(self.cfg, wifi_fn=lambda: None)
        d.sample_wifi(self.conn, 100)
        self.assertFalse(d.snapshot()["wifi_available"])

    def test_dns_down_and_recover(self):
        answers = {"10.0.0.1": None, "1.1.1.1": 12.0}
        d = DiagSampler(self.cfg, servers_fn=lambda: [("10.0.0.1", "DNS ของเครื่อง", "system"), ("1.1.1.1", "Cloudflare", "public")],
                        query_fn=lambda ip, name: answers[ip])
        for i in range(DNS_FAIL_ROUNDS):
            d.sample_dns(self.conn, 100 + i * 30)
        self.assertEqual(db.events(self.conn)[0]["kind"], "dns_down")
        d.sample_dns(self.conn, 300)
        self.assertEqual(len([e for e in db.events(self.conn) if e["kind"] == "dns_down"]), 1)  # ไม่ซ้ำ
        answers["10.0.0.1"] = 8.0
        d.sample_dns(self.conn, 330)
        self.assertEqual(db.events(self.conn)[0]["kind"], "dns_ok")
        ser = db.dns_series(self.conn, 0, 1000, 1000)
        self.assertEqual(ser["10.0.0.1"]["points"][0][2], 4)  # ไม่ตอบ 4 ครั้ง
        self.assertEqual(ser["1.1.1.1"]["kind"], "public")
        self.assertEqual(d.snapshot()["dns"]["10.0.0.1"]["ms"], 8.0)


class ReportWifiTests(unittest.TestCase):
    def setUp(self):
        self.conn = db.connect(":memory:")
        db.init(self.conn)
        self.cfg = {"targets": [{"id": "g", "name": "G", "host": "8.8.8.8", "kind": "external"},
                                {"id": "gateway", "name": "R", "host": "auto", "kind": "gateway"}],
                    "interval_sec": 2, "down_after_failures": 1, "latency_threshold_ms": 200,
                    "plan_down_mbps": 0, "plan_up_mbps": 0}

    def outage(self, a, b, gw=False):
        for t in ["g"] + (["gateway"] if gw else []):
            db.add_event(self.conn, a, "down", "x", t)
            db.add_event(self.conn, b, "up", "x", t)

    def test_wifi_disconnect_marks_cause(self):
        self.outage(1000, 1100, gw=True)
        db.wifi_add(self.conn, 1050, {"connected": False})
        out = report.build(self.conn, self.cfg, 0, 86400, 86400)["outages"]
        self.assertEqual(out[0]["cause"], "wifi")

    def test_weak_signal(self):
        self.outage(1000, 1100, gw=True)
        db.wifi_add(self.conn, 1040, {"connected": True, "signal": 20})
        self.assertEqual(report.build(self.conn, self.cfg, 0, 86400, 86400)["outages"][0]["cause"], "wifi_weak")

    def test_isp_outage_keeps_cause_but_notes_wifi(self):
        self.outage(1000, 1100, gw=False)
        db.wifi_add(self.conn, 1040, {"connected": True, "signal": 20})
        o = report.build(self.conn, self.cfg, 0, 86400, 86400)["outages"][0]
        self.assertEqual((o["cause"], o.get("wifi")), ("isp", "wifi_weak"))

    def test_daily_wifi_and_dns(self):
        for i in range(6):
            db.wifi_add(self.conn, 100 + i * 10, {"connected": True, "signal": 60 + i * 2})
        db.dns_add(self.conn, 100, [("10.0.0.1", "system", 10.0), ("1.1.1.1", "public", 20.0)])
        db.dns_add(self.conn, 130, [("10.0.0.1", "system", None), ("1.1.1.1", "public", 30.0)])
        r = report.build(self.conn, self.cfg, 0, 86400, 86400)
        d = r["days"][0]
        self.assertEqual(d["wifi_signal"], 65.0)
        self.assertEqual((d["dns_ms"], d["dns_fail_pct"], d["dns_public_ms"]), (10.0, 50.0, 25.0))
        s = r["summary"]
        self.assertTrue(s["has_wifi"])
        self.assertEqual((s["dns_ms"], s["dns_fail_pct"]), (10.0, 50.0))


class OfflineAssetsTests(unittest.TestCase):
    def test_pages_use_no_cdn(self):
        for name in ("index.html", "login.html"):
            html = open(os.path.join(ROOT, "static", name), encoding="utf-8").read()
            self.assertNotRegex(html, r"https?://", name)
            for ref in re.findall(r'(?:src|href)="/static/([^"]+)"', html):
                self.assertTrue(os.path.exists(os.path.join(ROOT, "static", ref)), ref)

    def test_fonts_exist(self):
        css = open(os.path.join(ROOT, "static", "vendor", "fonts.css"), encoding="utf-8").read()
        for ref in re.findall(r'url\("([^"]+)"\)', css):
            self.assertTrue(os.path.exists(os.path.join(ROOT, "static", "vendor", ref)), ref)

    def test_manifest_icons_exist(self):
        import json
        m = json.load(open(os.path.join(ROOT, "static", "manifest.webmanifest"), encoding="utf-8"))
        for ic in m["icons"]:
            self.assertTrue(os.path.exists(os.path.join(ROOT, ic["src"].lstrip("/"))), ic["src"])


if __name__ == "__main__":
    unittest.main()
