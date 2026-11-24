"""เปิด Network Pulse พร้อม Windows (แบบไม่มีหน้าต่าง)

    python autostart.py on       เปิดพร้อม Windows (สร้าง shortcut ในโฟลเดอร์ Startup) และเริ่มทำงานทันที
    python autostart.py off      เลิกเปิดพร้อม Windows (ตัวที่ทำงานอยู่ยังไม่หยุด — ใช้ stop)
    python autostart.py status   ดูว่าตั้งไว้ไหม และตอนนี้ทำงานอยู่หรือเปล่า
    python autostart.py start    เริ่มทำงานเบื้องหลังเดี๋ยวนี้
    python autostart.py stop     หยุดตัวที่ทำงานเบื้องหลัง

ทำงานด้วย pythonw.exe จึงไม่มีหน้าต่าง — ข้อความของโปรแกรมอยู่ใน data/netpulse.log
ไม่ต้องใช้สิทธิ์ Administrator
"""
import ctypes
import json
import os
import subprocess
import sys
import time
import urllib.request

from netpulse.config import BASE_DIR, load_config

APP = os.path.join(BASE_DIR, "app.py")
SHORTCUT_NAME = "Network Pulse.lnk"
LOG = os.path.join(BASE_DIR, "data", "netpulse.log")
NO_WINDOW = 0x08000000
DETACHED = 0x00000008 | 0x00000200  # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP


def startup_dir():
    buf = ctypes.create_unicode_buffer(260)
    ctypes.windll.shell32.SHGetFolderPathW(None, 7, None, 0, buf)  # CSIDL_STARTUP
    return buf.value


def shortcut_path():
    return os.path.join(startup_dir(), SHORTCUT_NAME)


def pythonw():
    exe = os.path.join(os.path.dirname(sys.executable), "pythonw.exe")
    if not os.path.exists(exe):
        sys.exit(f"ไม่พบ {exe}")
    return exe


def _powershell(script, env_extra=None):
    env = dict(os.environ, **(env_extra or {}))
    return subprocess.run(
        ["powershell", "-NoProfile", "-NonInteractive", "-Command", script],
        capture_output=True, text=True, env=env, creationflags=NO_WINDOW)


def create_shortcut():
    # ส่งค่าผ่าน environment เพื่อไม่ต้องกังวลเรื่อง quote ของ path ที่มีช่องว่าง
    r = _powershell(
        "$s = (New-Object -ComObject WScript.Shell).CreateShortcut($env:NP_LNK);"
        "$s.TargetPath = $env:NP_TARGET; $s.Arguments = $env:NP_ARGS;"
        "$s.WorkingDirectory = $env:NP_WD; $s.WindowStyle = 7;"
        "$s.Description = 'Network Pulse - home internet monitor'; $s.Save()",
        {"NP_LNK": shortcut_path(), "NP_TARGET": pythonw(), "NP_ARGS": f'"{APP}"', "NP_WD": BASE_DIR})
    if r.returncode != 0 or not os.path.exists(shortcut_path()):
        sys.exit("สร้าง shortcut ไม่สำเร็จ:\n" + r.stderr.strip())


def running_pids():
    """PID ของ python/pythonw ที่กำลังรัน app.py ของโฟลเดอร์นี้"""
    r = _powershell(
        "Get-CimInstance Win32_Process -Filter \"Name='python.exe' or Name='pythonw.exe'\" | "
        "Select-Object ProcessId, CommandLine | ConvertTo-Json -Compress")
    try:
        data = json.loads(r.stdout or "[]")
    except ValueError:
        return []
    if isinstance(data, dict):
        data = [data]
    app = APP.lower()
    pids = []
    for p in data:
        cmd = (p.get("CommandLine") or "").lower().replace("/", "\\")
        if p["ProcessId"] != os.getpid() and app in cmd:
            pids.append(p["ProcessId"])
    return pids


def responding(port):
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/auth-status", timeout=2) as r:
            return r.status == 200
    except Exception:
        return False


def start(port):
    if responding(port):
        print(f"ทำงานอยู่แล้ว → http://localhost:{port}")
        return
    subprocess.Popen([pythonw(), APP], cwd=BASE_DIR, creationflags=DETACHED,
                     stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                     close_fds=True)
    for _ in range(20):
        time.sleep(0.5)
        if responding(port):
            print(f"เริ่มทำงานเบื้องหลังแล้ว → http://localhost:{port}")
            return
    print(f"ยังไม่ตอบสนอง — ดูข้อความผิดพลาดใน {LOG}")


def stop():
    pids = running_pids()
    if not pids:
        print("ไม่มีตัวที่ทำงานอยู่")
        return
    for pid in pids:
        subprocess.run(["taskkill", "/PID", str(pid), "/F"], capture_output=True, creationflags=NO_WINDOW)
    print(f"หยุดแล้ว (PID {', '.join(map(str, pids))})")


def status(port):
    lnk = os.path.exists(shortcut_path())
    print(f"เปิดพร้อม Windows : {'เปิด' if lnk else 'ปิด'}")
    if lnk:
        print(f"  shortcut       : {shortcut_path()}")
    pids = running_pids()
    if responding(port):
        print(f"ตอนนี้            : ทำงานอยู่ → http://localhost:{port}" + (f"  (PID {', '.join(map(str, pids))})" if pids else ""))
    else:
        print("ตอนนี้            : ไม่ได้ทำงาน")
    print(f"log               : {LOG}")


def main():
    if sys.platform != "win32":
        sys.exit("ใช้ได้บน Windows เท่านั้น")
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(errors="replace")
        except (AttributeError, ValueError):
            pass
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    port = load_config()["port"]
    if cmd == "on":
        create_shortcut()
        print("ตั้งให้เปิดพร้อม Windows แล้ว (ทำงานเบื้องหลัง ไม่มีหน้าต่าง)")
        start(port)
    elif cmd == "off":
        path = shortcut_path()
        if os.path.exists(path):
            os.remove(path)
            print("เลิกเปิดพร้อม Windows แล้ว — ตัวที่ทำงานอยู่ยังไม่หยุด (หยุดด้วย: python autostart.py stop)")
        else:
            print("ไม่ได้ตั้งไว้อยู่แล้ว")
    elif cmd == "start":
        start(port)
    elif cmd == "stop":
        stop()
    elif cmd == "status":
        status(port)
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
