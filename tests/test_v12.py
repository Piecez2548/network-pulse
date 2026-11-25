"""ทดสอบ v1.2: Speed test, รายงานสำหรับแจ้ง ISP, สแกนอุปกรณ์ในวง LAN"""
import io
import ipaddress
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from netpulse import db, lanscan, report, settings, speedtest  # noqa: E402

TARGETS = [
    {"id": "g", "name": "Google", "host": "8.8.8.8", "kind": "external"},
    {"id": "c", "name": "Cloudflare", "host": "1.1.1.1", "kind": "external"},
    {"id": "gateway", "name": "Router", "host": "auto", "kind": "gateway"},
]


def make_cfg(path=":memory:"):
    return {"db_path": path, "targets": TARGETS, "interval_sec": 2, "down_after_failures": 3,
            "latency_threshold_ms": 200, "plan_down_mbps": 100, "plan_up_mbps": 50,
            "speedtest_interval_hours": 0, "lan_scan_interval_min": 0}


class TempDbCase(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.path = os.path.join(self.dir, "t.db")
        self.cfg = make_cfg(self.path)

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def conn(self):
        c = db.connect(self.path)
        db.init(c)
        return c


# ---------- Speed test ----------
class _Resp(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.close()


class SpeedTestTests(TempDbCase):
    def test_latency_median_and_jitter(self):
        calls = []
        ping, jitter = speedtest.measure_latency(probe=lambda: calls.append(1), count=4)
        self.assertEqual(len(calls), 4)
        self.assertGreaterEqual(ping, 0)
        self.assertGreaterEqual(jitter, 0)

    def test_latency_all_fail_raises(self):
        def boom():
            raise OSError("no route")
        with self.assertRaises(speedtest.SpeedTestError):
            speedtest.measure_latency(probe=boom, count=3)

    def test_download_counts_bytes(self):
        progress = []
        bps = speedtest.measure_download(get=lambda n: _Resp(b"x" * 200_000), duration=0.4, streams=2,
                                         warmup=0.05, progress=lambda p, r: progress.append(p))
        self.assertGreater(bps, 0)
        self.assertTrue(progress)

    def test_download_all_streams_fail_raises(self):
        def boom(n):
            raise OSError("offline")
        with self.assertRaises(speedtest.SpeedTestError):
            speedtest.measure_download(get=boom, duration=0.2, streams=2)

    def test_upload_consumes_body(self):
        sent = []

        def post(chunks, size):
            n = sum(len(c) for c in chunks)
            sent.append((n, size))

        bps = speedtest.measure_upload(post=post, duration=0.3, streams=2, request_bytes=300_000, warmup=0.05)
        self.assertGreater(bps, 0)
        self.assertTrue(all(n == size for n, size in sent))

    def test_run_saves_result_and_event(self):
        t = speedtest.SpeedTester(self.cfg, latency=lambda: (20.0, 1.5),
                                  download=lambda progress=None: 95e6, upload=lambda progress=None: 40e6)
        res = t.run_now()
        self.assertIsNone(res["error"])
        conn = self.conn()
        rows = db.speedtest_list(conn)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["down_bps"], 95e6)
        ev = db.events(conn, 5)
        self.assertEqual(ev[0]["kind"], "speedtest")
        self.assertIn("95.0", ev[0]["message"])
        self.assertFalse(t.status()["running"])

    def test_run_records_failure(self):
        def fail():
            raise speedtest.SpeedTestError("ติดต่อไม่ได้")
        t = speedtest.SpeedTester(self.cfg, latency=fail)
        res = t.run_now()
        self.assertEqual(res["error"], "ติดต่อไม่ได้")
        row = db.speedtest_list(self.conn())[0]
        self.assertIsNone(row["down_bps"])
        self.assertEqual(row["error"], "ติดต่อไม่ได้")

    def test_due(self):
        t = speedtest.SpeedTester(self.cfg)
        conn = self.conn()
        self.assertFalse(t.due(conn, 10_000))  # ปิดอยู่
        self.cfg["speedtest_interval_hours"] = 6
        self.assertTrue(t.due(conn, 10_000))   # ยังไม่เคยวัด
        db.speedtest_add(conn, 10_000, "manual", 1, 1)
        self.assertFalse(t.due(conn, 10_000 + 3600))
        self.assertTrue(t.due(conn, 10_000 + 6 * 3600))


# ---------- รายงาน ----------
class ReportTests(unittest.TestCase):
    def setUp(self):
        self.conn = db.connect(":memory:")
        db.init(self.conn)
        self.cfg = make_cfg()

    def ev(self, ts, kind, target=None):
        db.add_event(self.conn, ts, kind, kind, target)

    def test_outage_needs_all_external_down(self):
        # g หลุด 1000–1100, c หลุด 1050–1200 → อินเทอร์เน็ตหลุดจริง 1050–1100 (ไม่รวม shift)
        self.ev(1004, "down", "g"); self.ev(1100, "up", "g")
        self.ev(1054, "down", "c"); self.ev(1200, "up", "c")
        self.ev(5004, "down", "g"); self.ev(5100, "up", "g")  # หลุดตัวเดียว → ไม่นับ
        out = report.internet_outages(self.conn, self.cfg, 0, 10_000, 10_000)
        self.assertEqual(len(out), 1)
        self.assertEqual((out[0]["start"], out[0]["end"]), (1050, 1100))  # down ts - (3-1)*2
        self.assertEqual(out[0]["cause"], "isp")

    def test_local_cause_when_gateway_down(self):
        for t in ("g", "c", "gateway"):
            self.ev(2004, "down", t)
            self.ev(2300, "up", t)
        out = report.internet_outages(self.conn, self.cfg, 0, 10_000, 10_000)
        self.assertEqual(out[0]["cause"], "local")

    def test_open_outage_closed_by_gap_and_ongoing(self):
        self.ev(1004, "down", "g"); self.ev(1004, "down", "c")
        db.write_round(self.conn, 1500, [], [{"kind": "gap", "ts": 1500, "ts_end": 4000, "message": "gap"}])
        self.ev(8004, "down", "g"); self.ev(8004, "down", "c")
        out = report.internet_outages(self.conn, self.cfg, 0, 10_000, 9_000)
        self.assertEqual([(o["start"], o["end"]) for o in out], [(1000, 1500), (8000, 9000)])
        self.assertTrue(out[1]["ongoing"])
        self.assertFalse(out[0]["ongoing"])

    def test_build_days_and_summary(self):
        day = 86400 * 100  # เที่ยงคืน UTC
        for i in range(30):
            ts = day + 3600 + i * 2
            db.write_round(self.conn, ts, [("g", 20.0), ("c", None if i < 3 else 30.0), ("gateway", 2.0)], [])
        db.speedtest_add(self.conn, day + 7200, "manual", 80e6, 30e6, 15, 1)
        r = report.build(self.conn, self.cfg, day, day + 2 * 86400, day + 2 * 86400, tz=0)
        self.assertEqual(len(r["days"]), 2)
        d0 = r["days"][0]
        self.assertEqual(d0["monitored_sec"], 60)
        self.assertEqual(d0["uptime_pct"], 100.0)    # g ตอบทุกรอบ → ออกเน็ตได้
        self.assertAlmostEqual(d0["loss_pct"], 5.0)  # 3 จาก 60 ตัวอย่างภายนอก
        self.assertIsNone(r["days"][1]["uptime_pct"])
        s = r["summary"]
        self.assertEqual(s["speedtests"], 1)
        self.assertEqual(s["down_avg_bps"], 80e6)
        self.assertEqual(s["outages"], 0)

    def test_local_day_boundaries(self):
        tz = 7 * 3600
        day_local = 86400 * 100 - tz  # เที่ยงคืนเวลาไทย
        r = report.build(self.conn, self.cfg, day_local, day_local + 86400, day_local + 86400, tz=tz)
        self.assertEqual([d["day"] for d in r["days"]], [day_local])


# ---------- สแกน LAN ----------
IPCONFIG = """
Wireless LAN adapter Wi-Fi:

   IPv4 Address. . . . . . . . . . . : 192.168.1.23(Preferred)
   Subnet Mask . . . . . . . . . . . : 255.255.255.0
   Default Gateway . . . . . . . . . : 192.168.1.1
"""


class LanScanTests(TempDbCase):
    def test_parse_mask(self):
        self.assertEqual(lanscan.parse_ipconfig_mask(IPCONFIG, "192.168.1.23"), "255.255.255.0")
        self.assertIsNone(lanscan.parse_ipconfig_mask(IPCONFIG, "10.0.0.5"))

    def test_subnet_limits(self):
        self.assertEqual(str(lanscan.subnet_for("192.168.1.23", "255.255.255.0")), "192.168.1.0/24")
        self.assertEqual(str(lanscan.subnet_for("10.1.2.3", "255.255.254.0")), "10.1.2.0/23")
        self.assertEqual(str(lanscan.subnet_for("10.1.2.3", "255.255.0.0")), "10.1.2.0/24")  # ใหญ่เกิน
        self.assertEqual(str(lanscan.subnet_for("10.1.2.3", None)), "10.1.2.0/24")

    def test_random_mac(self):
        self.assertTrue(lanscan.is_random_mac("da:70:b7:00:00:01"))
        self.assertFalse(lanscan.is_random_mac("28:41:ec:00:00:01"))

    def test_scan_collects_responders(self):
        macs = {"192.168.1.1": "28:41:ec:00:00:01", "192.168.1.50": "da:70:b7:00:00:02"}
        found = lanscan.scan(ipaddress.IPv4Network("192.168.1.0/24"), arp=macs.get,
                             resolve=lambda ip: "router.lan" if ip.endswith(".1") else None, workers=8)
        self.assertEqual([d["ip"] for d in found], ["192.168.1.1", "192.168.1.50"])
        self.assertEqual(found[0]["hostname"], "router.lan")

    def _scanner(self, macs):
        return lanscan.LanScanner(self.cfg, lambda: "192.168.1.23", arp=lambda ip: macs.get(ip),
                                  resolve=lambda ip: None, mask_fn=lambda ip: "255.255.255.0")

    def test_first_scan_is_baseline_then_new_device_event(self):
        macs = {"192.168.1.1": "28:41:ec:00:00:01", "192.168.1.23": "2c:3b:70:00:00:02"}
        res = self._scanner(macs).run()
        self.assertEqual(res["found"], 2)
        conn = self.conn()
        self.assertEqual([e["kind"] for e in db.events(conn)], ["lan_scan"])
        macs["192.168.1.77"] = "da:70:b7:00:00:03"
        self._scanner(macs).run()
        ev = db.events(conn)[0]
        self.assertEqual(ev["kind"], "new_device")
        self.assertIn("192.168.1.77", ev["message"])
        self.assertIn("MAC สุ่ม", ev["message"])
        self.assertEqual(len(db.devices_list(conn)), 3)

    def test_many_new_devices_summarised(self):
        macs = {"192.168.1.1": "28:41:ec:00:00:01"}
        self._scanner(macs).run()
        for i in range(10):
            macs[f"192.168.1.{100 + i}"] = f"28:41:ec:00:01:{i:02x}"
        self._scanner(macs).run()
        kinds = [e["kind"] for e in db.events(self.conn())]
        self.assertEqual(kinds.count("new_device"), 1)

    def test_device_label_and_delete(self):
        conn = self.conn()
        db.devices_upsert(conn, 100, [{"mac": "aa:bb:cc:dd:ee:ff", "ip": "192.168.1.9", "hostname": None}])
        self.assertEqual(db.device_update(conn, "aa:bb:cc:dd:ee:ff", name="ทีวี", known=True), 1)
        d = db.devices_list(conn)[0]
        self.assertEqual((d["name"], d["known"]), ("ทีวี", 1))
        self.assertEqual(db.device_update(conn, "00:00:00:00:00:01", name="x"), 0)
        self.assertEqual(db.device_delete(conn, "aa:bb:cc:dd:ee:ff"), 1)


class SettingsV12Tests(unittest.TestCase):
    def test_zero_allowed_for_new_fields(self):
        clean, errors = settings.validate({"speedtest_interval_hours": 0, "plan_down_mbps": 500,
                                           "lan_scan_interval_min": 0}, [], 2)
        self.assertEqual(errors, {})
        self.assertEqual(clean["plan_down_mbps"], 500)
        _, errors = settings.validate({"speedtest_interval_hours": 200}, [], 2)
        self.assertIn("speedtest_interval_hours", errors)


if __name__ == "__main__":
    unittest.main()
