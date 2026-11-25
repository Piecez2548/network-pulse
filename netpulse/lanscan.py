"""สแกนอุปกรณ์ในวง LAN: ส่ง ARP ไปทุก IP ในวง (อุปกรณ์ที่ปิด ping ก็ยังตอบ ARP) แล้วจำ MAC ไว้

อุปกรณ์ที่ไม่เคยเห็นมาก่อนจะถูกบันทึกเป็นเหตุการณ์ "new_device" (แสดงที่กระดิ่งในเว็บ)
ใช้ได้บน Windows เท่านั้น (iphlpapi.SendARP)
"""
import ipaddress
import socket
import struct
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, wait

from . import db
from .pingutil import _IPV4_RE, _run

MAX_HOSTS = 1022          # ใหญ่กว่า /22 จะสแกนเฉพาะ /24 รอบ ๆ เครื่องนี้
WORKERS = 64
MAX_NEW_EVENTS = 5        # เจอใหม่เกินนี้ในครั้งเดียว → บันทึกเป็นเหตุการณ์สรุปรายการเดียว


def send_arp(ip):
    """คืน MAC (aa:bb:cc:dd:ee:ff) หรือ None ถ้าไม่มีใครตอบ"""
    import ctypes
    from ctypes import wintypes
    dest = struct.unpack("<I", socket.inet_aton(ip))[0]
    buf = (ctypes.c_ubyte * 8)()
    size = wintypes.ULONG(6)
    if ctypes.windll.iphlpapi.SendARP(dest, 0, ctypes.byref(buf), ctypes.byref(size)) != 0 or size.value < 6:
        return None
    mac = bytes(buf[:6])
    if mac == b"\x00" * 6 or mac == b"\xff" * 6:
        return None
    return ":".join(f"{b:02x}" for b in mac)


def parse_ipconfig_mask(output, ip):
    """หา subnet mask ของ IP นี้จากผล ipconfig (ไม่ขึ้นกับภาษา: mask คือ IPv4 ตัวแรกที่ขึ้นต้น 255 หลังบรรทัด IP)"""
    lines = output.splitlines()
    for i, line in enumerate(lines):
        if ip in _IPV4_RE.findall(line):
            for nxt in lines[i + 1:i + 4]:
                for cand in _IPV4_RE.findall(nxt):
                    if cand.startswith("255.") or cand == "0.0.0.0":
                        return cand
    return None


def subnet_for(ip, mask=None):
    """วงที่จะสแกน — ถ้าวงใหญ่เกิน MAX_HOSTS ใช้ /24 รอบ IP นี้แทน"""
    try:
        net = ipaddress.IPv4Network(f"{ip}/{mask or 24}", strict=False)
    except ValueError:
        net = ipaddress.IPv4Network(f"{ip}/24", strict=False)
    if net.num_addresses - 2 > MAX_HOSTS or net.prefixlen > 30:
        net = ipaddress.IPv4Network(f"{ip}/24", strict=False)
    return net


def is_random_mac(mac):
    """MAC แบบสุ่ม (locally administered) — มักเป็นมือถือที่เปิด Private Wi-Fi Address"""
    try:
        return bool(int(mac.split(":")[0], 16) & 0x02)
    except (ValueError, IndexError):
        return False


def reverse_name(ip):
    try:
        name = socket.gethostbyaddr(ip)[0]
    except (OSError, UnicodeError):
        return None
    return None if name == ip else name


def scan(net, arp=send_arp, resolve=reverse_name, workers=WORKERS, name_timeout=6.0):
    """คืน [{"ip", "mac", "hostname"}] ของอุปกรณ์ที่ตอบ เรียงตาม IP"""
    hosts = [str(h) for h in net.hosts()]
    found = []
    pool = ThreadPoolExecutor(max_workers=workers, thread_name_prefix="lanscan")
    try:
        for ip, mac in zip(hosts, pool.map(arp, hosts)):
            if mac:
                found.append({"ip": ip, "mac": mac, "hostname": None})
        futs = {pool.submit(resolve, d["ip"]): d for d in found}
        done, _ = wait(futs, timeout=name_timeout)
        for f in done:
            futs[f]["hostname"] = f.result()
    finally:
        pool.shutdown(wait=False, cancel_futures=True)
    found.sort(key=lambda d: ipaddress.IPv4Address(d["ip"]))
    return found


class LanScanner:
    def __init__(self, cfg, local_ip_fn, arp=send_arp, resolve=reverse_name, mask_fn=None):
        self.cfg = cfg
        self.local_ip_fn = local_ip_fn
        self.arp, self.resolve = arp, resolve
        self.mask_fn = mask_fn or self._mask_from_ipconfig
        self.lock = threading.Lock()
        self.state = {"running": False, "started": None, "error": None, "last": None}
        self._stop = threading.Event()

    @staticmethod
    def _mask_from_ipconfig(ip):
        if sys.platform != "win32":
            return None
        try:
            return parse_ipconfig_mask(_run(["ipconfig"], 10), ip)
        except (subprocess.TimeoutExpired, OSError):
            return None

    def status(self):
        with self.lock:
            return dict(self.state)

    def start(self, trigger="manual"):
        with self.lock:
            if self.state["running"]:
                return False
            self.state.update(running=True, started=int(time.time()), error=None)
        threading.Thread(target=self._safe_run, args=(trigger,), name="lanscan", daemon=True).start()
        return True

    def _safe_run(self, trigger):
        try:
            self.run(trigger)
        except Exception as e:
            print(f"[lanscan] {type(e).__name__}: {e}", flush=True)
            with self.lock:
                self.state.update(running=False, error="สแกนไม่สำเร็จ")

    def run(self, trigger="manual"):
        with self.lock:
            self.state.update(running=True, error=None)
        if sys.platform != "win32" and self.arp is send_arp:
            with self.lock:
                self.state.update(running=False, error="ใช้ได้บน Windows เท่านั้น")
            return None
        ip = self.local_ip_fn()
        if not ip:
            with self.lock:
                self.state.update(running=False, error="หา IP ของเครื่องนี้ในวง LAN ไม่เจอ (ยังไม่ได้ต่อ Wi-Fi/LAN?)")
            return None
        net = subnet_for(ip, self.mask_fn(ip))
        t0 = time.monotonic()
        found = scan(net, self.arp, self.resolve)
        ms = int((time.monotonic() - t0) * 1000)
        now = int(time.time())
        conn = db.connect(self.cfg["db_path"])
        try:
            db.init(conn)
            first_ever = not db.devices_list(conn)
            new = db.devices_upsert(conn, now, found)
            db.lan_scan_add(conn, now, str(net), len(found), ms)
            if first_ever and found:
                db.add_event(conn, now, "lan_scan", f"สแกนวง {net} ครั้งแรก: พบอุปกรณ์ {len(found)} เครื่อง")
            elif len(new) > MAX_NEW_EVENTS:  # วงใหญ่/คนเข้าออกเยอะ — สรุปเป็นเหตุการณ์เดียว
                db.add_event(conn, now, "new_device", f"พบอุปกรณ์ใหม่ในวง LAN {len(new)} เครื่อง (ดูรายการที่หน้า Topology)")
            elif new:
                by_mac = {d["mac"]: d for d in found}
                for mac in new:
                    d = by_mac[mac]
                    label = d["hostname"] or ("MAC สุ่ม" if is_random_mac(mac) else "ไม่ทราบชื่อ")
                    db.add_event(conn, now, "new_device", f"พบอุปกรณ์ใหม่ในวง LAN: {d['ip']} ({label}) · {mac}")
        finally:
            conn.close()
        result = {"ts": now, "subnet": str(net), "found": len(found), "ms": ms, "new": len(new),
                  "trigger": trigger}
        with self.lock:
            self.state.update(running=False, last=result)
        return result

    def start_scheduler(self, check_sec=60):
        def loop():
            self._stop.wait(45)
            while not self._stop.is_set():
                minutes = self.cfg.get("lan_scan_interval_min", 0)
                if minutes > 0:
                    try:
                        conn = db.connect(self.cfg["db_path"])
                        try:
                            db.init(conn)
                            last = db.lan_scan_last(conn)
                        finally:
                            conn.close()
                        if last is None or time.time() - last["ts"] >= minutes * 60:
                            self.start("scheduled")
                    except Exception as e:
                        print(f"[lanscan] {type(e).__name__}: {e}", flush=True)
                self._stop.wait(check_sec)

        threading.Thread(target=loop, name="lanscan-scheduler", daemon=True).start()

    def stop(self):
        self._stop.set()
