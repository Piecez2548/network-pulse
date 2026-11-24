"""Network Pulse — เริ่มตัววัด ping และเว็บเซิร์ฟเวอร์ (python app.py)"""
import sys

from netpulse.auth import Auth
from netpulse.config import load_config
from netpulse.monitor import Monitor
from netpulse.server import AppContext, serve, start_lan_listener


def main():
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(errors="replace")
        except (AttributeError, ValueError):
            pass
    cfg = load_config()
    try:
        auth = Auth(cfg)
    except RuntimeError as e:
        print(e)
        sys.exit(1)
    monitor = Monitor(cfg)
    ctx = AppContext(cfg, monitor, auth)
    try:
        httpd = serve(ctx, cfg["host"])
    except OSError as e:
        print(f"เปิดพอร์ต {cfg['port']} ไม่ได้: {e}\n(มีโปรแกรมอื่นใช้พอร์ตนี้อยู่หรือเปิด Network Pulse ซ้ำ?)")
        sys.exit(1)
    monitor.start()
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
