"""วัดปริมาณการใช้เน็ต (download/upload) ของการ์ดเครือข่ายที่ใช้ออกอินเทอร์เน็ต

ใช้ iphlpapi ผ่าน ctypes (ไม่ต้องติดตั้งอะไรเพิ่ม): GetBestInterface หา interface ที่ใช้ไป 8.8.8.8
แล้วอ่านตัวนับไบต์ด้วย GetIfEntry ทุก ๆ รอบ ตัวนับเป็น 32 บิต จึงคำนวณแบบวนรอบ (wrap) ได้
"""
import collections
import ctypes
import socket
import struct
import sys
import threading
import time

WRAP = 2 ** 32


class MIB_IFROW(ctypes.Structure):
    _fields_ = [
        ("wszName", ctypes.c_wchar * 256), ("dwIndex", ctypes.c_uint32), ("dwType", ctypes.c_uint32),
        ("dwMtu", ctypes.c_uint32), ("dwSpeed", ctypes.c_uint32), ("dwPhysAddrLen", ctypes.c_uint32),
        ("bPhysAddr", ctypes.c_ubyte * 8), ("dwAdminStatus", ctypes.c_uint32),
        ("dwOperStatus", ctypes.c_uint32), ("dwLastChange", ctypes.c_uint32),
        ("dwInOctets", ctypes.c_uint32), ("dwInUcastPkts", ctypes.c_uint32),
        ("dwInNUcastPkts", ctypes.c_uint32), ("dwInDiscards", ctypes.c_uint32),
        ("dwInErrors", ctypes.c_uint32), ("dwInUnknownProtos", ctypes.c_uint32),
        ("dwOutOctets", ctypes.c_uint32), ("dwOutUcastPkts", ctypes.c_uint32),
        ("dwOutNUcastPkts", ctypes.c_uint32), ("dwOutDiscards", ctypes.c_uint32),
        ("dwOutErrors", ctypes.c_uint32), ("dwOutQLen", ctypes.c_uint32),
        ("dwDescrLen", ctypes.c_uint32), ("bDescr", ctypes.c_ubyte * 256),
    ]


def best_interface(probe="8.8.8.8"):
    if sys.platform != "win32":
        return None
    idx = ctypes.c_uint32()
    addr = struct.unpack("<I", socket.inet_aton(probe))[0]  # network byte order ในหน่วยความจำ
    if ctypes.windll.iphlpapi.GetBestInterface(addr, ctypes.byref(idx)) != 0:
        return None
    return idx.value


def read_counters(index):
    """คืน (rx_bytes, tx_bytes, ชื่อการ์ด, ความเร็วลิงก์ bps) หรือ None"""
    row = MIB_IFROW()
    row.dwIndex = index
    if ctypes.windll.iphlpapi.GetIfEntry(ctypes.byref(row)) != 0:
        return None
    name = bytes(row.bDescr[:max(0, row.dwDescrLen - 1)]).decode("mbcs", errors="replace").strip("\0 ")
    return row.dwInOctets, row.dwOutOctets, name, row.dwSpeed


def delta(now, before):
    """ผลต่างของตัวนับ 32 บิต (รองรับกรณีวนกลับเป็น 0)"""
    return (now - before) % WRAP


class TrafficMeter(threading.Thread):
    """สุ่มอ่านทุก interval วินาที เก็บอัตรา (bit/s) ย้อนหลังไว้ในหน่วยความจำ"""

    def __init__(self, interval=2.0, keep=150, reader=read_counters, finder=best_interface):
        super().__init__(name="traffic", daemon=True)
        self.interval = interval
        self.reader = reader
        self.finder = finder
        self.samples = collections.deque(maxlen=keep)  # (ts, rx_bps, tx_bps)
        self.lock = threading.Lock()
        self.info = {"name": None, "speed_bps": None, "available": sys.platform == "win32"}
        self.stop_event = threading.Event()

    def run(self):
        index, last, last_t, last_find = None, None, None, 0.0
        while not self.stop_event.is_set():
            now = time.monotonic()
            if index is None or now - last_find > 60:  # เปลี่ยน Wi-Fi/สาย LAN ระหว่างทำงาน
                last_find = now
                new_index = self.finder()
                if new_index != index:
                    index, last = new_index, None
            got = self.reader(index) if index is not None else None
            if got:
                rx, tx, name, speed = got
                with self.lock:
                    self.info.update(name=name, speed_bps=speed or None)
                    if last is not None and now > last_t:
                        dt = now - last_t
                        self.samples.append((int(time.time()), round(delta(rx, last[0]) * 8 / dt),
                                             round(delta(tx, last[1]) * 8 / dt)))
                last, last_t = (rx, tx), now
            else:
                last = None
            self.stop_event.wait(self.interval)

    def snapshot(self, limit=60):
        with self.lock:
            pts = list(self.samples)[-limit:]
            return {"interface": self.info["name"], "speed_bps": self.info["speed_bps"],
                    "available": self.info["available"], "series": pts}

    def stop(self):
        self.stop_event.set()
