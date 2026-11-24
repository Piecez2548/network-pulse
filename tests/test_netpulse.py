"""ทดสอบ: python -m unittest discover -s tests"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from netpulse import db  # noqa: E402
from netpulse.config import DEFAULTS, _normalize_targets  # noqa: E402
from netpulse.monitor import Monitor, overall_status  # noqa: E402
from netpulse.pingutil import parse_ipconfig_gateway, parse_ping, parse_route_gateway  # noqa: E402

PING_EN = """
Pinging 8.8.8.8 with 32 bytes of data:
Reply from 8.8.8.8: bytes=32 time=12ms TTL=117

Ping statistics for 8.8.8.8:
    Packets: Sent = 1, Received = 1, Lost = 0 (0% loss),
Approximate round trip times in milli-seconds:
    Minimum = 12ms, Maximum = 12ms, Average = 12ms
"""
PING_TH = """
กำลัง Ping 8.8.8.8 ด้วยข้อมูล 32 ไบต์:
ตอบกลับจาก 8.8.8.8: ไบต์=32 เวลา=27ms TTL=117
"""
PING_LT1 = "Reply from 192.168.1.1: bytes=32 time<1ms TTL=64\n"
PING_TIMEOUT = """
Pinging 8.8.8.8 with 32 bytes of data:
Request timed out.

Ping statistics for 8.8.8.8:
    Packets: Sent = 1, Received = 0, Lost = 1 (100% loss),
"""
PING_UNREACH = """
Reply from 192.168.1.5: Destination host unreachable.

Ping statistics for 8.8.8.8:
    Packets: Sent = 1, Received = 1, Lost = 0 (0% loss),
"""
PING_TTL_EXPIRED = "Reply from 10.0.0.1: TTL expired in transit.\n"

IPCONFIG = """
Ethernet adapter vEthernet (WSL):
   IPv4 Address. . . . . . . . . . . : 172.20.0.1
   Default Gateway . . . . . . . . . :

Wireless LAN adapter Wi-Fi:
   IPv4 Address. . . . . . . . . . . : 192.168.1.34
   Subnet Mask . . . . . . . . . . . : 255.255.255.0
   Default Gateway . . . . . . . . . : fe80::1%12
                                       192.168.1.1
   DHCP Server . . . . . . . . . . . : 192.168.1.1
"""
IPCONFIG_TH = """
อะแดปเตอร์ LAN ไร้สาย Wi-Fi:
   ที่อยู่ IPv4. . . . . . . . . . . : 192.168.0.20
   เกตเวย์เริ่มต้น . . . . . . . . . : 192.168.0.1
"""
ROUTE = """
Network Destination        Netmask          Gateway       Interface  Metric
          0.0.0.0          0.0.0.0      10.0.0.1      10.0.0.50     50
          0.0.0.0          0.0.0.0   192.168.1.1   192.168.1.34     25
        127.0.0.0        255.0.0.0         On-link         127.0.0.1    331
"""


class ParseTests(unittest.TestCase):
    def test_ping_english(self):
        self.assertEqual(parse_ping(PING_EN), 12.0)

    def test_ping_thai(self):
        self.assertEqual(parse_ping(PING_TH), 27.0)

    def test_ping_less_than_1ms(self):
        self.assertEqual(parse_ping(PING_LT1), 0.5)

    def test_ping_failures(self):
        for out in (PING_TIMEOUT, PING_UNREACH, PING_TTL_EXPIRED, ""):
            self.assertIsNone(parse_ping(out))

    def test_gateway(self):
        self.assertEqual(parse_ipconfig_gateway(IPCONFIG), "192.168.1.1")
        self.assertEqual(parse_ipconfig_gateway(IPCONFIG_TH), "192.168.0.1")
        self.assertIsNone(parse_ipconfig_gateway("Default Gateway . . . :\n"))
        self.assertEqual(parse_route_gateway(ROUTE), "192.168.1.1")


def make_monitor(**over):
    cfg = dict(DEFAULTS, db_path=":memory:", **over)
    cfg["targets"] = _normalize_targets(DEFAULTS["targets"])
    conn = db.connect(":memory:")
    return Monitor(cfg, ping_fn=None, gateway_fn=lambda: "192.168.1.1", conn=conn), conn


class MonitorTests(unittest.TestCase):
    def kinds(self, conn):
        return [r[0] for r in conn.execute("SELECT kind FROM events ORDER BY id")]

    def test_down_after_three_failures_and_up(self):
        m, conn = make_monitor()
        ts = 1_000_000
        ok = {"8.8.8.8": 10.0, "1.1.1.1": 11.0, "gateway": 1.0}
        m.process_round(ts, ok)
        for k in range(1, 3):
            m.process_round(ts + 2 * k, dict(ok, **{"8.8.8.8": None}))
        self.assertEqual(self.kinds(conn), [])  # ยังไม่ถึง 3 ครั้ง
        m.process_round(ts + 6, dict(ok, **{"8.8.8.8": None}))
        self.assertEqual(self.kinds(conn), ["down"])
        m.process_round(ts + 8, dict(ok, **{"8.8.8.8": None}))
        self.assertEqual(self.kinds(conn), ["down"])  # ไม่แจ้งซ้ำ
        evs = m.process_round(ts + 10, ok)
        self.assertEqual(self.kinds(conn), ["down", "up"])
        self.assertIn("8 วินาที", evs[0]["message"])  # หลุดตั้งแต่ ts+2 ถึง ts+10

    def test_high_latency_and_recovery(self):
        m, conn = make_monitor(latency_consecutive=3, latency_recover_consecutive=2)
        ts = 2_000_000
        base = {"1.1.1.1": 11.0, "gateway": 1.0}
        for k in range(2):
            m.process_round(ts + 2 * k, dict(base, **{"8.8.8.8": 250.0}))
        self.assertEqual(self.kinds(conn), [])
        m.process_round(ts + 4, dict(base, **{"8.8.8.8": 300.0}))
        self.assertEqual(self.kinds(conn), ["high_latency"])
        self.assertEqual(overall_status(m.snapshot()["targets"])["status"], "degraded")
        m.process_round(ts + 6, dict(base, **{"8.8.8.8": 20.0}))
        m.process_round(ts + 8, dict(base, **{"8.8.8.8": 20.0}))
        self.assertEqual(self.kinds(conn), ["high_latency", "latency_ok"])
        self.assertEqual(overall_status(m.snapshot()["targets"])["status"], "online")

    def test_gap_event_when_pc_was_off(self):
        m, conn = make_monitor()
        m.process_round(3_000_000, {"8.8.8.8": 10.0})
        m.process_round(3_000_002, {"8.8.8.8": 10.0})
        m.process_round(3_003_602, {"8.8.8.8": 10.0})  # หายไป 1 ชม.
        row = conn.execute("SELECT kind, ts, ts_end FROM events").fetchone()
        self.assertEqual(row, ("gap", 3_000_002, 3_003_602))

    def test_offline_diagnosis(self):
        m, _ = make_monitor()
        ts = 4_000_000
        for k in range(3):
            m.process_round(ts + 2 * k, {"8.8.8.8": None, "1.1.1.1": None, "gateway": 1.0})
        st = overall_status(m.snapshot()["targets"])
        self.assertEqual(st["status"], "offline")
        self.assertIn("ISP", st["detail"])


class StorageTests(unittest.TestCase):
    def test_rollup_and_history(self):
        conn = db.connect(":memory:")
        db.init(conn)
        day = 86400
        now = 100 * day
        old_hour = now - 8 * day  # เก่ากว่า 7 วัน
        for i in range(1800):  # 1 ชม. ทุก 2 วินาที
            lat = None if i % 10 == 0 else 20.0
            db.write_round(conn, old_hour + 2 * i, [("8.8.8.8", lat)], [])
        db.write_round(conn, now - 60, [("8.8.8.8", 30.0)], [])
        moved = db.rollup(conn, now, 7)
        self.assertEqual(moved, 1800)
        self.assertEqual(conn.execute("SELECT COUNT(*) FROM samples").fetchone()[0], 1)
        n, ok_n, avg = conn.execute("SELECT n, ok_n, avg_ms FROM hourly").fetchone()
        self.assertEqual((n, ok_n, avg), (1800, 1620, 20.0))
        self.assertEqual(db.beats_between(conn, old_hour, now), 1801)

        series, summary = db.history(conn, now - 30 * day, now, 3600, ["8.8.8.8"])
        self.assertEqual(len(series["8.8.8.8"]), 2)
        s = summary["8.8.8.8"]
        self.assertEqual(s["samples"], 1801)
        self.assertAlmostEqual(s["loss_pct"], 100 * 180 / 1801, places=2)
        self.assertEqual(s["max_ms"], 30.0)

    def test_recent_rounds_marks_unmeasured(self):
        conn = db.connect(":memory:")
        db.init(conn)
        db.write_round(conn, 10, [("a", 5.0), ("b", None)], [])
        self.assertEqual(db.recent_rounds(conn, 0, ["a", "b", "c"]), [[10, 5.0, None, "x"]])


if __name__ == "__main__":
    unittest.main()
