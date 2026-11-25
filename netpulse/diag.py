"""เก็บค่า Wi-Fi (ทุก 10 วินาที) และเวลาตอบของ DNS (ทุก 30 วินาที) เบื้องหลัง

- บันทึกเหตุการณ์ "wifi" เมื่อ Wi-Fi หลุด / ต่อกลับ / ย้ายไป access point อื่น
- บันทึกเหตุการณ์ "dns_down" เมื่อ DNS ของเครื่องไม่ตอบติดกัน 3 รอบ และ "dns_ok" เมื่อกลับมา
- ลบข้อมูลที่เก่ากว่า raw_retention_days ทุกชั่วโมง
"""
import threading
import time
from concurrent.futures import ThreadPoolExecutor

from . import db, dnsprobe
from .wifi import read_wifi

WIFI_SEC = 10
DNS_SEC = 30
DNS_FAIL_ROUNDS = 3


class DiagSampler:
    def __init__(self, cfg, wifi_fn=read_wifi, servers_fn=dnsprobe.servers_to_probe, query_fn=dnsprobe.query,
                 clock=time.time):
        self.cfg = cfg
        self.wifi_fn, self.servers_fn, self.query_fn, self.clock = wifi_fn, servers_fn, query_fn, clock
        self.lock = threading.Lock()
        self.wifi = None          # ค่าล่าสุด (มี ts)
        self.wifi_available = None
        self.dns = {}             # server -> {"name", "kind", "ms", "ts"}
        self._prev_wifi = None
        self._dns_fail = 0
        self._dns_down = False
        self._name_i = 0
        self._servers = []
        self._servers_at = 0
        self._stop = threading.Event()
        self._pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix="dns")

    def snapshot(self):
        with self.lock:
            return {"wifi": dict(self.wifi) if self.wifi else None, "wifi_available": self.wifi_available,
                    "dns": {k: dict(v) for k, v in self.dns.items()}}

    # ---------- Wi-Fi ----------
    def sample_wifi(self, conn, now):
        w = self.wifi_fn()
        events = []
        with self.lock:
            self.wifi_available = w is not None
            self.wifi = dict(w, ts=now) if w else None
        if w is None:
            self._prev_wifi = None
            return events
        prev = self._prev_wifi
        if prev is not None:
            if prev["connected"] and not w["connected"]:
                events.append(f"Wi-Fi หลุด (เดิมต่อ {prev.get('ssid') or '—'} สัญญาณ {prev.get('signal') or '—'}%)")
            elif not prev["connected"] and w["connected"]:
                events.append(f"Wi-Fi ต่อกลับแล้ว: {w.get('ssid') or '—'} สัญญาณ {w.get('signal') or '—'}%")
            elif (w["connected"] and prev.get("bssid") and w.get("bssid") and prev["bssid"] != w["bssid"]):
                events.append(f"Wi-Fi ย้าย access point ({w.get('ssid') or '—'} · {w.get('band') or ''} ช่อง {w.get('channel') or '—'})")
        self._prev_wifi = w
        db.wifi_add(conn, now, w)
        for msg in events:
            db.add_event(conn, now, "wifi", msg)
        return events

    # ---------- DNS ----------
    def sample_dns(self, conn, now):
        if not self._servers or now - self._servers_at > 300:  # DNS ของเครื่องอาจเปลี่ยนเมื่อย้ายเครือข่าย
            self._servers = self.servers_fn()
            self._servers_at = now
        if not self._servers:
            return []
        name = dnsprobe.NAMES[self._name_i % len(dnsprobe.NAMES)]
        self._name_i += 1
        futs = [(ip, label, kind, self._pool.submit(self.query_fn, ip, name)) for ip, label, kind in self._servers]
        rows = []
        with self.lock:
            for ip, label, kind, f in futs:
                ms = f.result()
                rows.append((ip, kind, ms))
                self.dns[ip] = {"name": label, "kind": kind, "ms": ms, "ts": now, "query": name}
            for ip in [k for k in self.dns if k not in {s[0] for s in self._servers}]:
                del self.dns[ip]
        db.dns_add(conn, now, rows)
        system = [ms for _ip, kind, ms in rows if kind == "system"]
        events = []
        if system:
            if all(ms is None for ms in system):
                self._dns_fail += 1
                if self._dns_fail >= DNS_FAIL_ROUNDS and not self._dns_down:
                    self._dns_down = True
                    events.append(("dns_down", f"DNS ของเครื่องไม่ตอบติดกัน {self._dns_fail} รอบ — เว็บจะเปิดไม่ได้แม้ ping ผ่าน"))
            else:
                if self._dns_down:
                    events.append(("dns_ok", f"DNS ของเครื่องกลับมาตอบแล้ว ({min(m for m in system if m is not None):.0f} ms)"))
                self._dns_down = False
                self._dns_fail = 0
        for kind, msg in events:
            db.add_event(conn, now, kind, msg)
        return rows

    # ---------- loop ----------
    def start(self):
        def loop():
            conn = db.connect(self.cfg["db_path"])
            db.init(conn)
            last_dns = last_prune = 0
            while not self._stop.is_set():
                now = int(self.clock())
                try:
                    self.sample_wifi(conn, now)
                    if now - last_dns >= DNS_SEC:
                        last_dns = now
                        self.sample_dns(conn, now)
                    if now - last_prune >= 3600:
                        last_prune = now
                        db.prune_diag(conn, now - self.cfg["raw_retention_days"] * 86400)
                except Exception as e:
                    print(f"[diag] {type(e).__name__}: {e}", flush=True)
                self._stop.wait(WIFI_SEC)
            conn.close()

        threading.Thread(target=loop, name="diag", daemon=True).start()

    def stop(self):
        self._stop.set()
