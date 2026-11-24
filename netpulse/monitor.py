"""เธรดวัด ping ทุกรอบ + state machine สำหรับการหลุด / latency สูง / ช่วงที่คอมปิด"""
import threading
import time
from concurrent.futures import ThreadPoolExecutor

from . import db
from .pingutil import detect_gateway, ping_once


def fmt_duration(sec):
    sec = int(max(0, sec))
    h, rem = divmod(sec, 3600)
    m, s = divmod(rem, 60)
    parts = []
    if h:
        parts.append(f"{h} ชม.")
    if m:
        parts.append(f"{m} นาที")
    if s or not parts:
        parts.append(f"{s} วินาที")
    return " ".join(parts)


class Monitor(threading.Thread):
    def __init__(self, cfg, ping_fn=ping_once, gateway_fn=detect_gateway, conn=None):
        super().__init__(name="monitor", daemon=True)
        self.cfg = cfg
        self.ping_fn = ping_fn
        self.gateway_fn = gateway_fn
        self.conn = conn or db.connect(cfg["db_path"])
        db.init(self.conn)
        self.lock = threading.Lock()
        self.stop_event = threading.Event()
        self.started_at = int(time.time())
        self.last_beat = db.last_heartbeat(self.conn)
        self.targets = [dict(t) for t in cfg["targets"]]
        self.state = {t["id"]: {
            "state": "unknown", "fail": 0, "hi": 0, "lo": 0, "high": False,
            "down_since": None, "ms": None, "ts": None,
        } for t in self.targets}
        self._last_gw_check = 0.0

    # ---------- gateway ----------
    def refresh_gateway(self, force=False):
        now = time.monotonic()
        if not force and now - self._last_gw_check < self.cfg["gateway_recheck_sec"]:
            return
        self._last_gw_check = now
        if not any(t["kind"] == "gateway" for t in self.targets):
            return
        gw = self.gateway_fn()
        if gw:
            with self.lock:
                for t in self.targets:
                    if t["kind"] == "gateway":
                        t["resolved"] = gw

    @staticmethod
    def host_of(t):
        return t.get("resolved") if t["host"] == "auto" else t["host"]

    # ---------- state machine ----------
    def process_round(self, ts, results):
        """results: {target_id: latency_ms | None}; target ที่ไม่มีใน results = ไม่ได้วัดรอบนี้"""
        cfg = self.cfg
        thr = cfg["latency_threshold_ms"]
        events, samples = [], []
        gap_threshold = max(5 * cfg["interval_sec"], 10)
        with self.lock:
            if self.last_beat is not None and ts - self.last_beat > gap_threshold:
                events.append({
                    "kind": "gap", "ts": self.last_beat, "ts_end": ts, "target": None,
                    "message": "ไม่มีข้อมูล " + fmt_duration(ts - self.last_beat)
                               + " (คอมปิด/พักเครื่อง หรือโปรแกรมไม่ได้ทำงาน)",
                })
            for t in self.targets:
                if t["id"] not in results:
                    continue
                lat = results[t["id"]]
                st = self.state[t["id"]]
                name = t["name"]
                samples.append((t["id"], lat))
                st["ms"], st["ts"] = lat, ts
                if lat is not None:
                    st["fail"] = 0
                    if st["state"] == "down":
                        events.append({"kind": "up", "target": t["id"],
                                       "message": f"{name} กลับมาเชื่อมต่อได้ (หลุดไป {fmt_duration(ts - st['down_since'])})"})
                        st["down_since"] = None
                    st["state"] = "up"
                    if lat > thr:
                        st["hi"] += 1
                        st["lo"] = 0
                        if not st["high"] and st["hi"] >= cfg["latency_consecutive"]:
                            st["high"] = True
                            events.append({"kind": "high_latency", "target": t["id"],
                                           "message": f"{name} latency สูง {lat:.0f} ms (เกิน {thr} ms ติดกัน {st['hi']} รอบ)"})
                    else:
                        st["lo"] += 1
                        st["hi"] = 0
                        if st["high"] and st["lo"] >= cfg["latency_recover_consecutive"]:
                            st["high"] = False
                            events.append({"kind": "latency_ok", "target": t["id"],
                                           "message": f"{name} latency กลับเป็นปกติ ({lat:.0f} ms)"})
                else:
                    st["fail"] += 1
                    st["hi"] = st["lo"] = 0
                    if st["fail"] >= cfg["down_after_failures"] and st["state"] != "down":
                        st["state"] = "down"
                        st["high"] = False
                        # นับเวลาหลุดตั้งแต่ครั้งแรกที่ไม่ตอบ
                        st["down_since"] = ts - (st["fail"] - 1) * cfg["interval_sec"]
                        events.append({"kind": "down", "target": t["id"],
                                       "message": f"{name} ({self.host_of(t)}) ไม่ตอบสนองติดกัน {st['fail']} ครั้ง"})
            self.last_beat = ts
        db.write_round(self.conn, ts, samples, events)
        return events

    def snapshot(self):
        with self.lock:
            targets = []
            for t in self.targets:
                st = self.state[t["id"]]
                targets.append({
                    "id": t["id"], "name": t["name"], "kind": t["kind"],
                    "host": self.host_of(t) or "ไม่พบ",
                    "state": st["state"], "high": st["high"], "ms": st["ms"],
                    "ts": st["ts"], "fail_streak": st["fail"],
                })
            last_beat = self.last_beat
        return {"targets": targets, "overall": overall_status(targets),
                "started_at": self.started_at, "last_beat": last_beat}

    # ---------- loop ----------
    def run(self):
        self.refresh_gateway(force=True)
        last_rollup = 0.0
        next_tick = time.monotonic()
        with ThreadPoolExecutor(max_workers=max(1, len(self.targets))) as pool:
            while not self.stop_event.is_set():
                # อ่านทุกรอบ เพื่อให้ค่าที่แก้จากหน้า Settings มีผลทันที
                interval = self.cfg["interval_sec"]
                timeout = self.cfg["ping_timeout_ms"]
                ts = int(time.time())
                jobs = {}
                for t in self.targets:
                    host = self.host_of(t)
                    if host:
                        jobs[t["id"]] = pool.submit(self.ping_fn, host, timeout)
                results = {tid: f.result() for tid, f in jobs.items()}
                try:
                    self.process_round(ts, results)
                    if time.monotonic() - last_rollup > 3600:
                        last_rollup = time.monotonic()
                        db.rollup(self.conn, time.time(), self.cfg["raw_retention_days"])
                except Exception as exc:  # ไม่ให้เธรดตายเพราะ DB ล็อกชั่วคราว
                    print(f"[monitor] error: {exc}", flush=True)
                self.refresh_gateway()
                next_tick += interval
                delay = next_tick - time.monotonic()
                if delay < 0:  # ตามไม่ทัน (เช่นหลังพักเครื่อง) — เริ่มนับใหม่
                    next_tick = time.monotonic()
                    delay = 0
                self.stop_event.wait(delay)

    def stop(self):
        self.stop_event.set()


def overall_status(targets):
    external = [t for t in targets if t["kind"] != "gateway"]
    gateways = [t for t in targets if t["kind"] == "gateway"]
    if all(t["state"] == "unknown" for t in targets):
        return {"status": "unknown", "detail": "กำลังเริ่มวัด…"}
    if external and all(t["state"] == "down" for t in external):
        if gateways and all(t["state"] == "down" for t in gateways):
            return {"status": "offline", "detail": "ติดต่อ router ไม่ได้ — ตรวจ Wi-Fi/สาย LAN หรือ router"}
        return {"status": "offline", "detail": "router ปกติแต่ออกอินเทอร์เน็ตไม่ได้ — น่าจะเป็นที่ ISP"}
    if any(t["state"] == "down" for t in targets):
        names = ", ".join(t["name"] for t in targets if t["state"] == "down")
        return {"status": "degraded", "detail": f"บางเป้าหมายไม่ตอบ: {names}"}
    if any(t["high"] for t in targets):
        names = ", ".join(t["name"] for t in targets if t["high"])
        return {"status": "degraded", "detail": f"latency สูง: {names}"}
    return {"status": "online", "detail": "ทุกเป้าหมายตอบสนองปกติ"}
