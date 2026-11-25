"""Speed test: วัดความเร็วดาวน์โหลด/อัปโหลดจริง กับเซิร์ฟเวอร์ speed.cloudflare.com

- ดาวน์โหลด: เปิดหลายสายพร้อมกัน อ่านข้อมูลจนครบเวลา แล้วคิดจากช่วงหลังวินาทีแรก (ข้ามช่วงเร่งความเร็ว)
- อัปโหลด: ส่งข้อมูลหลายสายพร้อมกันจนครบเวลา
- ทำทีละครั้งเท่านั้น; ระหว่างวัด latency ของตัววัด ping จะสูงขึ้นชั่วคราว จึงบันทึกเป็นเหตุการณ์ไว้ด้วย
"""
import http.client
import os
import statistics
import threading
import time
import urllib.request

from . import db

SERVER = "speed.cloudflare.com"
_DOWN_URL = f"https://{SERVER}/__down?bytes=%d"
_UP_URL = f"https://{SERVER}/__up"
_UA = {"User-Agent": "NetworkPulse"}
_CHUNK = 64 * 1024


class SpeedTestError(Exception):
    pass


# ---------- การเชื่อมต่อจริง (แทนได้ในเทสต์) ----------
def http_get(nbytes, timeout=10):
    return urllib.request.urlopen(urllib.request.Request(_DOWN_URL % nbytes, headers=_UA), timeout=timeout)


def http_post(chunks, size, timeout=15):
    req = urllib.request.Request(_UP_URL, data=chunks, method="POST",
                                 headers={**_UA, "Content-Type": "application/octet-stream",
                                          "Content-Length": str(size)})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        r.read()


# ---------- ขั้นตอนการวัด ----------
class KeepAlive:
    """ยิง request เล็ก ๆ ซ้ำบนการเชื่อมต่อเดิม — วัดเวลาไป-กลับจริง ไม่รวมเวลาเปิด TLS"""

    def __init__(self, timeout=5):
        self.conn = http.client.HTTPSConnection(SERVER, timeout=timeout)

    def __call__(self):
        self.conn.request("GET", "/__down?bytes=0", headers=_UA)
        r = self.conn.getresponse()
        r.read()
        if r.status != 200:
            raise SpeedTestError(f"เซิร์ฟเวอร์ตอบ {r.status}")

    def close(self):
        self.conn.close()


def measure_latency(probe=None, count=8):
    """เวลาไป-กลับของ HTTP request เล็ก ๆ (ms) — คืน (median, jitter)"""
    own = probe is None
    probe = probe or KeepAlive()
    times = []
    try:
        for _ in range(count):
            t0 = time.perf_counter()
            try:
                probe()
            except Exception:
                continue
            times.append((time.perf_counter() - t0) * 1000)
    finally:
        if own:
            probe.close()
    if not times:
        raise SpeedTestError("ติดต่อเซิร์ฟเวอร์ speed test ไม่ได้ (ต้องต่ออินเทอร์เน็ต)")
    times = times[1:] if len(times) > 2 else times  # ครั้งแรกรวมเวลาเปิด TLS
    jitter = statistics.mean(abs(a - b) for a, b in zip(times, times[1:])) if len(times) > 1 else 0.0
    return round(statistics.median(times), 1), round(jitter, 1)


class _Meter:
    """นับไบต์รวมจากหลายเธรด และคำนวณความเร็วช่วงหลัง warm-up"""

    def __init__(self, warmup):
        self.lock = threading.Lock()
        self.total = 0
        self.t0 = time.perf_counter()
        self.warmup = warmup
        self.mark = None  # (เวลา, ไบต์) ตอนพ้น warm-up

    def add(self, n):
        with self.lock:
            self.total += n
            if self.mark is None and time.perf_counter() - self.t0 >= self.warmup:
                self.mark = (time.perf_counter(), self.total)

    def rate(self):
        """bit/s"""
        with self.lock:
            now = time.perf_counter()
            if self.mark and now - self.mark[0] > 0.2:
                return (self.total - self.mark[1]) * 8 / (now - self.mark[0])
            el = now - self.t0
            return self.total * 8 / el if el > 0 else 0.0


def _run_streams(worker, streams, duration, warmup, progress):
    meter = _Meter(warmup)
    deadline = time.perf_counter() + duration
    errors = []

    def wrap():
        try:
            worker(meter, deadline)
        except Exception as e:  # สายใดสายหนึ่งพังไม่เป็นไร ถ้าสายอื่นยังได้ข้อมูล
            errors.append(e)

    threads = [threading.Thread(target=wrap, daemon=True) for _ in range(streams)]
    for t in threads:
        t.start()
    while any(t.is_alive() for t in threads):
        if progress:
            progress(min(1.0, 1 - (deadline - time.perf_counter()) / duration), meter.rate())
        time.sleep(0.25)
        if time.perf_counter() > deadline + 15:
            break
    if meter.total == 0:
        raise SpeedTestError("วัดความเร็วไม่สำเร็จ" + (f": {errors[0]}" if errors else ""))
    return meter.rate()


def measure_download(get=http_get, duration=8.0, streams=4, request_bytes=25_000_000, warmup=1.5, progress=None):
    def worker(meter, deadline):
        while time.perf_counter() < deadline:
            with get(request_bytes) as r:
                while time.perf_counter() < deadline:
                    chunk = r.read(_CHUNK)
                    if not chunk:
                        break
                    meter.add(len(chunk))

    return _run_streams(worker, streams, duration, warmup, progress)


def measure_upload(post=http_post, duration=8.0, streams=3, request_bytes=4_000_000, warmup=1.0, progress=None):
    payload = os.urandom(_CHUNK)  # ข้อมูลสุ่ม — บีบอัดไม่ได้

    def worker(meter, deadline):
        while time.perf_counter() < deadline:
            def body():
                sent = 0
                while sent < request_bytes:
                    n = min(_CHUNK, request_bytes - sent)
                    yield payload[:n]
                    sent += n
                    meter.add(n)
            post(body(), request_bytes)

    return _run_streams(worker, streams, duration, warmup, progress)


def fmt_mbps(bps):
    return "—" if bps is None else f"{bps / 1e6:.1f}"


class SpeedTester:
    """ทำ speed test เบื้องหลังทีละครั้ง + ตั้งเวลาอัตโนมัติตาม cfg["speedtest_interval_hours"]"""

    def __init__(self, cfg, latency=measure_latency, download=measure_download, upload=measure_upload):
        self.cfg = cfg
        self._latency, self._download, self._upload = latency, download, upload
        self.lock = threading.Lock()
        self.state = {"running": False, "phase": None, "progress": 0.0, "live_bps": None,
                      "started": None, "ping_ms": None, "down_bps": None, "up_bps": None,
                      "error": None, "last_id": None}
        self._stop = threading.Event()

    def status(self):
        with self.lock:
            return dict(self.state)

    def _set(self, **kw):
        with self.lock:
            self.state.update(kw)

    def start(self, trigger="manual"):
        """เริ่มวัดในเธรดใหม่ คืน False ถ้ากำลังวัดอยู่"""
        with self.lock:
            if self.state["running"]:
                return False
            self.state.update(running=True, phase="latency", progress=0.0, live_bps=None,
                              started=int(time.time()), ping_ms=None, down_bps=None, up_bps=None, error=None)
        threading.Thread(target=self._run, args=(trigger,), name="speedtest", daemon=True).start()
        return True

    def run_now(self, trigger="manual"):
        """วัดแบบรอผล (ใช้ในเทสต์/สคริปต์)"""
        with self.lock:
            if self.state["running"]:
                return None
            self.state.update(running=True, started=int(time.time()))
        return self._run(trigger)

    def _run(self, trigger):
        ts = int(time.time())
        result = {"down_bps": None, "up_bps": None, "ping_ms": None, "jitter_ms": None, "error": None}
        try:
            self._set(phase="latency", progress=0.0)
            result["ping_ms"], result["jitter_ms"] = self._latency()
            self._set(ping_ms=result["ping_ms"], phase="download", progress=0.0)
            result["down_bps"] = self._download(progress=lambda p, r: self._set(progress=p, live_bps=r))
            self._set(down_bps=result["down_bps"], phase="upload", progress=0.0, live_bps=None)
            result["up_bps"] = self._upload(progress=lambda p, r: self._set(progress=p, live_bps=r))
            self._set(up_bps=result["up_bps"])
        except SpeedTestError as e:
            result["error"] = str(e)
        except Exception as e:
            result["error"] = f"วัดความเร็วไม่สำเร็จ: {type(e).__name__}"
        conn = db.connect(self.cfg["db_path"])
        try:
            db.init(conn)
            rid = db.speedtest_add(conn, ts, trigger, server=SERVER, **result)
            if result["error"]:
                msg = f"Speed test ไม่สำเร็จ: {result['error']}"
            else:
                msg = (f"Speed test: ดาวน์โหลด {fmt_mbps(result['down_bps'])} Mbps · "
                       f"อัปโหลด {fmt_mbps(result['up_bps'])} Mbps · ping {result['ping_ms']:.0f} ms")
            db.add_event(conn, ts, "speedtest", msg)
        finally:
            conn.close()
        self._set(running=False, phase=None, progress=1.0, live_bps=None, error=result["error"], last_id=rid)
        return {**result, "id": rid, "ts": ts}

    # ---------- ตั้งเวลา ----------
    def due(self, conn, now):
        hours = self.cfg.get("speedtest_interval_hours", 0)
        if hours <= 0:
            return False
        last = db.speedtest_last_ts(conn)
        return last is None or now - last >= hours * 3600

    def start_scheduler(self, check_sec=60):
        def loop():
            self._stop.wait(90)  # รอให้โปรแกรมเริ่มทำงานก่อน
            while not self._stop.is_set():
                try:
                    conn = db.connect(self.cfg["db_path"])
                    try:
                        db.init(conn)
                        if self.due(conn, int(time.time())):
                            self.start("scheduled")
                    finally:
                        conn.close()
                except Exception as e:
                    print(f"[speedtest] {type(e).__name__}: {e}", flush=True)
                self._stop.wait(check_sec)

        threading.Thread(target=loop, name="speedtest-scheduler", daemon=True).start()

    def stop(self):
        self._stop.set()
