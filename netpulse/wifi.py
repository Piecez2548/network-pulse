"""อ่านสถานะ Wi-Fi จาก `netsh wlan show interfaces` (ความแรงสัญญาณ, ช่อง, ย่าน, ความเร็วลิงก์)

แปลผลจากรูปแบบค่า ไม่ใช่ชื่อหัวข้อ จึงใช้ได้ทั้ง Windows ภาษาอังกฤษและภาษาไทย
"""
import re
import subprocess
import sys

from .pingutil import _run

_LINE_RE = re.compile(r"^\s{2,}(.+?)\s*:\s(.*)$")
_MAC_RE = re.compile(r"^(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}$", re.IGNORECASE)
_PCT_RE = re.compile(r"^(\d{1,3})\s*%$")
_NUM_RE = re.compile(r"^-?\d+(?:\.\d+)?$")
_BAND_RE = re.compile(r"^\d+(?:\.\d+)?\s*GHz$", re.IGNORECASE)


def _blocks(output):
    """แบ่งผลเป็นการ์ดละบล็อก (เริ่มที่บรรทัด Name/ชื่อ)"""
    blocks, cur = [], None
    for line in output.splitlines():
        m = _LINE_RE.match(line)
        if not m:
            continue
        key, val = m.group(1).strip(), m.group(2).strip()
        if cur is None or (key.lower() in ("name", "ชื่อ") and cur):
            cur = []
            blocks.append(cur)
        cur.append((key, val))
    return blocks


def parse_interfaces(output):
    """คืนข้อมูลการ์ด Wi-Fi ตัวที่เชื่อมต่ออยู่ (หรือตัวแรก) หรือ None ถ้าไม่มีการ์ด Wi-Fi"""
    best = None
    for block in _blocks(output):
        info = {"connected": False, "ssid": None, "bssid": None, "signal": None, "rssi": None,
                "channel": None, "band": None, "radio": None, "rx_mbps": None, "tx_mbps": None}
        rates = []
        for key, val in block:
            k = key.lower()
            if k == "ssid":
                info["ssid"] = val or None
            elif "bssid" in k and _MAC_RE.match(val):
                info["bssid"] = val.lower()
            elif _PCT_RE.match(val):
                info["signal"] = int(_PCT_RE.match(val).group(1))
            elif k == "rssi" and _NUM_RE.match(val):
                info["rssi"] = int(float(val))
            elif _BAND_RE.match(val) and k not in ("ssid", "profile", "โปรไฟล์"):
                info["band"] = val
            elif val.startswith("802.11"):
                info["radio"] = val
            elif "mbps" in k and _NUM_RE.match(val):
                rates.append(float(val))
            elif (k == "channel" or "ช่อง" in key) and val.isdigit():
                info["channel"] = int(val)
            elif k in ("state", "สถานะ"):
                info["connected"] = val.lower() == "connected" or val == "เชื่อมต่อแล้ว"
        if rates:
            info["rx_mbps"] = rates[0]
            info["tx_mbps"] = rates[1] if len(rates) > 1 else None
        if not info["connected"] and info["signal"] is not None and info["ssid"]:
            info["connected"] = True  # บาง locale แปลคำว่า connected ต่างออกไป
        if not any(v is not None for k2, v in info.items() if k2 != "connected") and not block:
            continue
        if best is None or (info["connected"] and not best["connected"]):
            best = info
    return best


def read_wifi():
    """คืน dict สถานะ หรือ None ถ้าเครื่องนี้ไม่มี Wi-Fi / ไม่ใช่ Windows"""
    if sys.platform != "win32":
        return None
    try:
        out = _run(["netsh", "wlan", "show", "interfaces"], 10)
    except (subprocess.TimeoutExpired, OSError):
        return None
    if not any(_LINE_RE.match(line) for line in out.splitlines()):
        return None  # ไม่มีการ์ด Wi-Fi (ใช้สาย LAN)
    return parse_interfaces(out)
