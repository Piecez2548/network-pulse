"""ทดสอบส่วนที่เพิ่มตอน redesign: traceroute parser, ตัวนับ traffic, สถิติ 24 ชม., Network Tools"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from netpulse import db, tools  # noqa: E402
from netpulse.traffic import WRAP, TrafficMeter, delta  # noqa: E402

TRACERT_EN = """
Tracing route to 8.8.8.8 over a maximum of 20 hops

  1    <1 ms    <1 ms    <1 ms  192.168.1.1
  2     *        *        *     Request timed out.
  3    10 ms     4 ms     3 ms  10.9.2.1
  4     2 ms     *       12 ms  8.8.8.8

Trace complete.
"""
TRACERT_TH = """
กำลังติดตามเส้นทางไปยัง 8.8.8.8 ผ่านสูงสุด 20 hops

  1     1 ms     1 ms     1 ms  192.168.1.1
  2     *        *        *     คำขอหมดเวลา
  3    15 ms    14 ms    16 ms  8.8.8.8

การติดตามเสร็จสมบูรณ์
"""


class TracertTests(unittest.TestCase):
    def test_english(self):
        hops = tools.parse_tracert(TRACERT_EN)
        self.assertEqual([h["hop"] for h in hops], [1, 2, 3, 4])
        self.assertEqual(hops[0], {"hop": 1, "ms": [0.5, 0.5, 0.5], "ip": "192.168.1.1"})
        self.assertEqual(hops[1], {"hop": 2, "ms": [None, None, None], "ip": None})
        self.assertEqual(hops[3]["ms"], [2.0, None, 12.0])

    def test_thai(self):
        hops = tools.parse_tracert(TRACERT_TH)
        self.assertEqual(len(hops), 3)
        self.assertEqual(hops[2]["ip"], "8.8.8.8")
        self.assertEqual(hops[1]["ip"], None)


class ToolInputTests(unittest.TestCase):
    def test_rejects_option_injection(self):
        for bad in ("-n 100 8.8.8.8", "-t", "", "auto", "a b", "8.8.8.8; calc", "999.1.1.1"):
            with self.assertRaises(tools.ToolError, msg=bad):
                tools.clean_host(bad)
        self.assertEqual(tools.clean_host(" google.com "), "google.com")

    def test_ping_series_stats(self):
        seq = iter([10.0, None, 20.0])
        r = tools.ping_series("1.1.1.1", 3, ping_fn=lambda h, t: next(seq))
        self.assertEqual((r["sent"], r["received"], r["avg"], r["min"], r["max"]), (3, 2, 15.0, 10.0, 20.0))
        self.assertAlmostEqual(r["loss_pct"], 33.3)

    def test_busy_limit(self):
        a, b = tools._slot(), tools._slot()
        try:
            with self.assertRaises(tools.Busy):
                tools._slot()
        finally:
            a.release()
            b.release()


class TrafficTests(unittest.TestCase):
    def test_wrap(self):
        self.assertEqual(delta(100, 50), 50)
        self.assertEqual(delta(10, WRAP - 10), 20)

    def test_meter_rates(self):
        counters = iter([(0, 0), (250_000, 125_000), (500_000, 250_000)])

        def reader(_index):
            c = next(counters, None)
            return (*c, "NIC", 100_000_000) if c else None

        m = TrafficMeter(interval=0.05, reader=reader, finder=lambda: 1)
        m.start()
        for _ in range(100):
            if len(m.samples) >= 2:
                break
            m.stop_event.wait(0.05)
        m.stop()
        snap = m.snapshot()
        self.assertEqual(snap["interface"], "NIC")
        self.assertGreaterEqual(len(snap["series"]), 2)
        self.assertTrue(all(rx > tx > 0 for _, rx, tx in snap["series"]))


class RoundHealthTests(unittest.TestCase):
    def test_counts(self):
        conn = db.connect(":memory:")
        db.init(conn)
        # รอบ 1 ปกติ, รอบ 2 latency สูง, รอบ 3 external หลุดทั้งหมด, รอบ 4 gateway หลุดแต่ออกเน็ตได้
        rounds = [
            (100, [("g", 12), ("c", 15), ("gw", 1)]),
            (102, [("g", 300), ("c", 15), ("gw", 1)]),
            (104, [("g", None), ("c", None), ("gw", 1)]),
            (3700, [("g", 12), ("c", 15), ("gw", None)]),
        ]
        for ts, samples in rounds:
            db.write_round(conn, ts, samples, [])
        cells = db.round_health(conn, 0, 7200, ["g", "c"], 200, 3600)
        self.assertEqual(cells[0], [3, 2, 1])
        self.assertEqual(cells[3600], [1, 1, 0])


if __name__ == "__main__":
    unittest.main()
