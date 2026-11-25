"""Network Pulse — เริ่มตัววัด ping และเว็บเซิร์ฟเวอร์ (python app.py)

รันแบบไม่มีหน้าต่าง (pythonw / เปิดพร้อม Windows) ข้อความจะถูกเขียนลง data/netpulse.log
"""
import os
import sys
import time

from netpulse.auth import Auth
from netpulse.config import BASE_DIR, load_config
from netpulse.monitor import Monitor
from netpulse.server import AppContext, serve, start_lan_listener
from netpulse.traffic import TrafficMeter

LOG_PATH = os.path.join(BASE_DIR, "data", "netpulse.log")
LOG_MAX_BYTES = 1_000_000


class _TimestampedLog:
    """แทน stdout/stderr เมื่อไม่มี console — ใส่เวลาให้ทุกบรรทัด"""

    def __init__(self, f):
        self.f = f
        self.at_line_start = True

    def write(self, text):
        for part in text.splitlines(keepends=True):
            if self.at_line_start and part.strip():
                self.f.write(time.strftime("[%Y-%m-%d %H:%M:%S] "))
            self.f.write(part)
            self.at_line_start = part.endswith("\n")
        self.f.flush()
        return len(text)

    def flush(self):
        self.f.flush()


def setup_output():
    headless = sys.stdout is None or sys.stderr is None \
        or os.path.basename(sys.executable).lower() == "pythonw.exe"
    if headless:  # ไม่มี console (pythonw / เปิดพร้อม Windows)
        os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
        if os.path.exists(LOG_PATH) and os.path.getsize(LOG_PATH) > LOG_MAX_BYTES:
            os.replace(LOG_PATH, LOG_PATH + ".1")  # เก็บของเก่าไว้ 1 ไฟล์
        log = _TimestampedLog(open(LOG_PATH, "a", encoding="utf-8", errors="replace"))
        sys.stdout = sys.stderr = log
        return
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(errors="replace")
        except (AttributeError, ValueError):
            pass


def main():
    setup_output()
    cfg = load_config()
    try:
        auth = Auth(cfg)
    except RuntimeError as e:
        print(e)
        sys.exit(1)
    monitor = Monitor(cfg)
    traffic = TrafficMeter()
    ctx = AppContext(cfg, monitor, auth, traffic=traffic)
    try:
        httpd = serve(ctx, cfg["host"])
    except OSError as e:
        print(f"เปิดพอร์ต {cfg['port']} ไม่ได้: {e}\n"
              f"Network Pulse อาจกำลังทำงานอยู่แล้ว (เช่นเปิดพร้อม Windows) — ลองเปิด http://localhost:{cfg['port']}\n"
              "ดูสถานะ/หยุดตัวที่ทำงานเบื้องหลัง:  python autostart.py status  |  python autostart.py stop")
        sys.exit(1)
    monitor.start()
    traffic.start()
    print(f"Network Pulse กำลังทำงาน → http://localhost:{cfg['port']}  (กด Ctrl+C เพื่อหยุด)", flush=True)
    if not auth.enabled:
        print("ยังไม่ได้ตั้งรหัสผ่าน: เปิดได้เฉพาะเครื่องนี้โดยไม่ต้อง login — ตั้งรหัสด้วย  python setup_auth.py", flush=True)
    if cfg["lan_access"]:
        if auth.enabled:
            start_lan_listener(ctx)
        else:
            ctx.lan["error"] = "ต้องตั้งรหัสผ่าน + TOTP ก่อนจึงจะเปิดให้อุปกรณ์อื่นเข้าได้"
            print("lan_access ถูกปิดไว้: " + ctx.lan["error"], flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nกำลังหยุด…")
    finally:
        monitor.stop()
        httpd.server_close()


if __name__ == "__main__":
    main()
