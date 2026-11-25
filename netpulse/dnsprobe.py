"""วัดเวลาที่ DNS ตอบ — ส่งคำถาม DNS (UDP) ตรงไปที่เซิร์ฟเวอร์ ไม่ผ่านแคชของ Windows

เทียบ DNS ของเครื่อง (ปกติเป็นของเราเตอร์/ISP) กับ DNS สาธารณะ (1.1.1.1, 8.8.8.8)
ถ้า ping ปกติแต่ DNS ของ ISP ช้า → เว็บจะเปิดช้าทั้งที่ "เน็ตไม่หลุด"
"""
import ipaddress
import os
import socket
import struct
import sys
import time

PUBLIC = [("1.1.1.1", "Cloudflare"), ("8.8.8.8", "Google")]
NAMES = ["www.google.com", "www.youtube.com", "www.facebook.com", "line.me", "www.wikipedia.org"]


def build_query(name, qid):
    """แพ็กเก็ต DNS ถาม A record (recursion desired)"""
    header = struct.pack(">HHHHHH", qid, 0x0100, 1, 0, 0, 0)
    qname = b"".join(bytes([len(p)]) + p.encode("ascii") for p in name.rstrip(".").split(".")) + b"\x00"
    return header + qname + struct.pack(">HH", 1, 1)


def parse_reply(data, qid):
    """คืน (rcode, จำนวนคำตอบ) หรือ None ถ้าไม่ใช่คำตอบของคำถามนี้"""
    if len(data) < 12:
        return None
    rid, flags, _qd, an, _ns, _ar = struct.unpack(">HHHHHH", data[:12])
    if rid != qid or not flags & 0x8000:
        return None
    return flags & 0x000F, an


def query(server, name, timeout=2.0, sock_factory=None):
    """คืนเวลาตอบ (ms) หรือ None ถ้าไม่ตอบ/ตอบผิดพลาด"""
    qid = int.from_bytes(os.urandom(2), "big")
    pkt = build_query(name, qid)
    s = (sock_factory or (lambda: socket.socket(socket.AF_INET, socket.SOCK_DGRAM)))()
    try:
        s.settimeout(timeout)
        t0 = time.perf_counter()
        s.sendto(pkt, (server, 53))
        deadline = t0 + timeout
        while True:
            remaining = deadline - time.perf_counter()
            if remaining <= 0:
                return None
            s.settimeout(remaining)
            data, addr = s.recvfrom(1500)
            if addr[0] != server:
                continue
            res = parse_reply(data, qid)
            if res is None:
                continue
            rcode, answers = res
            if rcode != 0 or answers == 0:
                return None
            return round((time.perf_counter() - t0) * 1000, 1)
    except OSError:
        return None
    finally:
        s.close()


def system_dns_servers():
    """DNS server ที่ Windows ใช้ (iphlpapi.GetNetworkParams) — คืน [] ถ้าอ่านไม่ได้"""
    if sys.platform != "win32":
        return []
    import ctypes
    from ctypes import wintypes

    class IP_ADDR_STRING(ctypes.Structure):
        pass
    IP_ADDR_STRING._fields_ = [("Next", ctypes.POINTER(IP_ADDR_STRING)), ("IpAddress", ctypes.c_char * 16),
                               ("IpMask", ctypes.c_char * 16), ("Context", wintypes.DWORD)]

    class FIXED_INFO(ctypes.Structure):
        _fields_ = [("HostName", ctypes.c_char * 132), ("DomainName", ctypes.c_char * 132),
                    ("CurrentDnsServer", ctypes.POINTER(IP_ADDR_STRING)), ("DnsServerList", IP_ADDR_STRING),
                    ("NodeType", wintypes.UINT), ("ScopeId", ctypes.c_char * 260),
                    ("EnableRouting", wintypes.UINT), ("EnableProxy", wintypes.UINT), ("EnableDns", wintypes.UINT)]

    size = wintypes.ULONG(0)
    fn = ctypes.windll.iphlpapi.GetNetworkParams
    fn(None, ctypes.byref(size))
    buf = ctypes.create_string_buffer(size.value or ctypes.sizeof(FIXED_INFO))
    if fn(buf, ctypes.byref(size)) != 0:
        return []
    info = ctypes.cast(buf, ctypes.POINTER(FIXED_INFO)).contents
    out, node = [], info.DnsServerList
    while True:
        ip = node.IpAddress.decode("ascii", "ignore").strip("\x00 ")
        try:
            if ip and ipaddress.IPv4Address(ip) and ip not in out:
                out.append(ip)
        except ValueError:
            pass
        if not node.Next:
            break
        node = node.Next.contents
    return out


def servers_to_probe(system=None):
    """[(ip, ชื่อ, kind)] — DNS ของเครื่อง (สูงสุด 2 ตัว) + DNS สาธารณะที่ไม่ซ้ำ"""
    system = system_dns_servers() if system is None else system
    out = [(ip, "DNS ของเครื่อง" + (f" #{i + 1}" if len(system) > 1 else ""), "system") for i, ip in enumerate(system[:2])]
    seen = {ip for ip, *_ in out}
    out += [(ip, name, "public") for ip, name in PUBLIC if ip not in seen]
    return out
