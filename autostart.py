"""เปิด Network Pulse พร้อม Windows (แบบไม่มีหน้าต่าง)

    python autostart.py on       เปิดพร้อม Windows (สร้าง shortcut ในโฟลเดอร์ Startup) และเริ่มทำงานทันที
    python autostart.py off      เลิกเปิดพร้อม Windows (ตัวที่ทำงานอยู่ยังไม่หยุด — ใช้ stop)
    python autostart.py status   ดูว่าตั้งไว้ไหม และตอนนี้ทำงานอยู่หรือเปล่า
    python autostart.py start    เริ่มทำงานเบื้องหลังเดี๋ยวนี้
    python autostart.py stop     หยุดตัวที่ทำงานเบื้องหลัง
    python autostart.py open     เริ่ม (ถ้ายังไม่ทำงาน) แล้วเปิดหน้าเว็บ — ใช้โดย shortcut บน Desktop
    python autostart.py desktop  สร้าง shortcut "Network Pulse" บน Desktop

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
import webbrowser

from netpulse.config import BASE_DIR, FROZEN, RES_DIR, load_config

APP = os.path.join(BASE_DIR, "app.py")
SELF = os.path.abspath(__file__)
ICON = os.path.join(RES_DIR, "static", "netpulse.ico")
# รุ่น .exe: NetworkPulse.exe --serve = ตัวเซิร์ฟเวอร์, NetworkPulse.exe (ไม่มี argument) = เปิดหน้าเว็บ
EXE = os.path.join(BASE_DIR, "NetworkPulse.exe")
SHORTCUT_NAME = "Network Pulse.lnk"
LOG = os.path.join(BASE_DIR, "data", "netpulse.log")
NO_WINDOW = 0x08000000
DETACHED = 0x00000008 | 0x00000200  # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP


def _shell_folder(csidl):
    buf = ctypes.create_unicode_buffer(260)
    ctypes.windll.shell32.SHGetFolderPathW(None, csidl, None, 0, buf)
    return buf.value


def shortcut_path():
    return os.path.join(_shell_folder(7), SHORTCUT_NAME)  # CSIDL_STARTUP


def desktop_shortcut_path():
    # CSIDL_DESKTOPDIRECTORY — รองรับ Desktop ที่ถูกย้ายไป OneDrive
    return os.path.join(_shell_folder(0x10), SHORTCUT_NAME)


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


def server_cmd():
    """คำสั่งเริ่มเซิร์ฟเวอร์แบบไม่มีหน้าต่าง"""
    return [EXE, "--serve"] if FROZEN else [pythonw(), APP]


def create_shortcut(path, script, description):
    """shortcut ที่รัน pythonw.exe <script> (หรือ NetworkPulse.exe <args> ในรุ่น .exe) พร้อมไอคอนของโปรแกรม"""
    # ส่งค่าผ่าน environment เพื่อไม่ต้องกังวลเรื่อง quote ของ path ที่มีช่องว่าง
    r = _powershell(
        "$s = (New-Object -ComObject WScript.Shell).CreateShortcut($env:NP_LNK);"
        "$s.TargetPath = $env:NP_TARGET; $s.Arguments = $env:NP_ARGS;"
        "$s.WorkingDirectory = $env:NP_WD; $s.WindowStyle = 7;"
        "if (Test-Path $env:NP_ICON) { $s.IconLocation = $env:NP_ICON + ',0' };"
        "$s.Description = $env:NP_DESC; $s.Save()",
        {"NP_LNK": path, "NP_TARGET": EXE if FROZEN else pythonw(), "NP_ARGS": script, "NP_WD": BASE_DIR,
         "NP_ICON": EXE if FROZEN else ICON, "NP_DESC": description})
    if r.returncode != 0 or not os.path.exists(path):
        sys.exit("สร้าง shortcut ไม่สำเร็จ:\n" + r.stderr.strip())


def message_box(text, error=False):
    """ใช้แจ้งผู้ใช้ตอนรันจาก shortcut (pythonw ไม่มีหน้าต่างให้ print)"""
    ctypes.windll.user32.MessageBoxW(None, text, "Network Pulse", 0x10 if error else 0x40)


def running_pids():
    """PID ของ python/pythonw ที่กำลังรัน app.py ของโฟลเดอร์นี้ (หรือ NetworkPulse.exe --serve)"""
    r = _powershell(
        "Get-CimInstance Win32_Process -Filter \"Name='python.exe' or Name='pythonw.exe' or Name='NetworkPulse.exe'\" | "
        "Select-Object ProcessId, CommandLine | ConvertTo-Json -Compress")
    try:
        data = json.loads(r.stdout or "[]")
    except ValueError:
        return []
    if isinstance(data, dict):
        data = [data]
    app = APP.lower()
    exe = EXE.lower()
    pids = []
    for p in data:
        cmd = (p.get("CommandLine") or "").lower().replace("/", "\\")
        if p["ProcessId"] != os.getpid() and (app in cmd or (exe in cmd and "--serve" in cmd)):
            pids.append(p["ProcessId"])
    return pids


def responding(port):
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/auth-status", timeout=2) as r:
            return r.status == 200
    except Exception:
        return False


def start(port):
    """คืน True ถ้าเซิร์ฟเวอร์ตอบสนอง (ทำงานอยู่แล้ว หรือเริ่มสำเร็จ)"""
    if responding(port):
        print(f"ทำงานอยู่แล้ว → http://localhost:{port}")
        return True
    subprocess.Popen(server_cmd(), cwd=BASE_DIR, creationflags=DETACHED,
                     stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                     close_fds=True)
    for _ in range(20):
        time.sleep(0.5)
        if responding(port):
            print(f"เริ่มทำงานเบื้องหลังแล้ว → http://localhost:{port}")
            return True
    print(f"ยังไม่ตอบสนอง — ดูข้อความผิดพลาดใน {LOG}")
    return False


def open_page(port):
    if start(port):
        webbrowser.open(f"http://localhost:{port}")
    else:
        message_box(f"เปิด Network Pulse ไม่สำเร็จ\nดูรายละเอียดใน:\n{LOG}", error=True)


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
    print(f"shortcut Desktop  : {'มี' if os.path.exists(desktop_shortcut_path()) else 'ไม่มี'}")
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
        create_shortcut(shortcut_path(), "--serve" if FROZEN else f'"{APP}"', "Network Pulse - start with Windows")
        print("ตั้งให้เปิดพร้อม Windows แล้ว (ทำงานเบื้องหลัง ไม่มีหน้าต่าง)")
        start(port)
    elif cmd == "desktop":
        path = desktop_shortcut_path()
        create_shortcut(path, "" if FROZEN else f'"{SELF}" open', "เปิด Network Pulse (เริ่มทำงานถ้ายังไม่ได้เปิด)")
        print(f"สร้าง shortcut แล้ว: {path}")
    elif cmd == "open":
        open_page(port)
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
