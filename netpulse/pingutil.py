"""เรียกคำสั่ง ping / ipconfig ของ Windows และแปลผล (รองรับ Windows ภาษาไทย)"""
import re
import subprocess
import sys

_CREATE_NO_WINDOW = 0x08000000 if sys.platform == "win32" else 0

# จับ "=12ms" หรือ "<1ms" — ใช้ได้ทั้ง "time=12ms" (อังกฤษ) และ "เวลา=12ms" (ไทย)
_MS_RE = re.compile(r"([=<])\s*(\d+(?:\.\d+)?)\s*ms", re.IGNORECASE)
# บรรทัดตอบกลับที่สำเร็จจริงต้องมี "TTL=" (บรรทัด unreachable / TTL expired ไม่มี)
_TTL_RE = re.compile(r"TTL\s*=\s*\d+", re.IGNORECASE)
_IPV4_RE = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")


def _console_encoding():
    if sys.platform == "win32":
        try:
            import ctypes
            return f"cp{ctypes.windll.kernel32.GetOEMCP()}"
        except Exception:
            pass
    return "utf-8"


def _run(args, timeout):
    proc = subprocess.run(
        args, capture_output=True, timeout=timeout,
        creationflags=_CREATE_NO_WINDOW,
    )
    return proc.stdout.decode(_console_encoding(), errors="replace")


def parse_ping(output):
    """คืนค่า latency (ms) จากผล ping หรือ None ถ้าไม่ตอบ; '<1ms' นับเป็น 0.5"""
    for line in output.splitlines():
        if not _TTL_RE.search(line):
            continue
        m = _MS_RE.search(line)
        if m:
            value = float(m.group(2))
            return 0.5 if m.group(1) == "<" and value <= 1 else value
    return None


def ping_once(host, timeout_ms=1000):
    if sys.platform == "win32":
        # -4: บังคับ IPv4 (ผล ping ของ IPv6 ไม่มี "TTL=" ให้แปลผล)
        args = ["ping", "-4", "-n", "1", "-w", str(timeout_ms), host]
    else:
        args = ["ping", "-c", "1", "-W", str(max(1, timeout_ms // 1000)), host]
    try:
        return parse_ping(_run(args, timeout_ms / 1000 + 3))
    except (subprocess.TimeoutExpired, OSError):
        return None


def _valid_ip(ip):
    parts = ip.split(".")
    return all(0 <= int(p) <= 255 for p in parts) and ip not in ("0.0.0.0", "255.255.255.255")


def parse_ipconfig_gateway(output):
    """หา IPv4 ของ Default Gateway จากผล ipconfig (ค่าอาจอยู่บรรทัดถัดไปถ้ามี IPv6 ก่อน)"""
    in_gateway = False
    for line in output.splitlines():
        lower = line.lower()
        if "gateway" in lower or "เกตเวย์" in line:
            in_gateway = True
            value = line.split(":", 1)[1] if ":" in line else ""
            # IPv6 มี ':' เยอะ — ตัดเฉพาะส่วนหลังป้ายชื่อแล้วหา IPv4
            for ip in _IPV4_RE.findall(value):
                if _valid_ip(ip):
                    return ip
            continue
        if in_gateway:
            stripped = line.strip()
            # บรรทัดต่อเนื่องจะมีแค่ที่อยู่ ไม่มี ". . . :"
            if stripped and ". ." not in line and line[:1].isspace():
                for ip in _IPV4_RE.findall(stripped):
                    if _valid_ip(ip):
                        return ip
                continue
            in_gateway = False
    return None


def parse_route_gateway(output):
    """สำรอง: อ่าน default route จาก 'route print -4' (ไม่ขึ้นกับภาษา) เลือก metric ต่ำสุด"""
    best = None
    for line in output.splitlines():
        cols = line.split()
        if len(cols) >= 5 and cols[0] == "0.0.0.0" and cols[1] == "0.0.0.0" and _IPV4_RE.fullmatch(cols[2]):
            try:
                metric = int(cols[4])
            except ValueError:
                continue
            if best is None or metric < best[0]:
                best = (metric, cols[2])
    return best[1] if best else None


def detect_gateway():
    if sys.platform != "win32":
        return None
    try:
        gw = parse_ipconfig_gateway(_run(["ipconfig"], 10))
        if gw:
            return gw
        return parse_route_gateway(_run(["route", "print", "-4"], 10))
    except (subprocess.TimeoutExpired, OSError):
        return None
