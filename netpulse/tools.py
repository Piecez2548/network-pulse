"""เครื่องมือในหน้า Network Tools: Ping, Traceroute, DNS Lookup, IP Info

host ที่ผู้ใช้พิมพ์ถูกตรวจด้วย settings._check_host (ห้ามขึ้นต้นด้วย '-') และส่งเป็น argument
แยกของ subprocess เสมอ — ไม่ผ่าน shell
"""
import ipaddress
import json
import re
import socket
import subprocess
import sys
import threading
import time
import urllib.request

from .pingutil import _IPV4_RE, _run, ping_once
from .settings import _check_host

# จำกัดให้รันพร้อมกันได้ไม่กี่งาน (traceroute ใช้เวลานาน)
_slots = threading.BoundedSemaphore(2)
_HOP_RE = re.compile(r"^\s*(\d{1,2})\s+(.*)$")
_HOP_MS_RE = re.compile(r"(<?\s*\d+)\s*ms|\*", re.IGNORECASE)


class ToolError(Exception):
    pass


class Busy(ToolError):
    pass


def clean_host(raw):
    host = str(raw or "").strip()
    if not host or host == "auto":
        raise ToolError("ใส่ IP หรือชื่อโดเมน")
    err = _check_host(host)
    if err:
        raise ToolError(err)
    return host


def _slot():
    if not _slots.acquire(blocking=False):
        raise Busy("มีเครื่องมือทำงานอยู่ 2 งานแล้ว — รอสักครู่")
    return _slots


def ping_series(host, count=4, timeout_ms=1000, ping_fn=ping_once):
    host = clean_host(host)
    count = max(1, min(10, int(count)))
    slot = _slot()
    try:
        results = []
        for i in range(count):
            t0 = time.monotonic()
            results.append(ping_fn(host, timeout_ms))
            if i < count - 1:
                time.sleep(max(0.0, 0.5 - (time.monotonic() - t0)))
    finally:
        slot.release()
    ok = [r for r in results if r is not None]
    return {
        "host": host, "results": results, "sent": count, "received": len(ok),
        "loss_pct": round(100 * (count - len(ok)) / count, 1),
        "min": min(ok) if ok else None, "max": max(ok) if ok else None,
        "avg": round(sum(ok) / len(ok), 1) if ok else None,
    }


def parse_tracert(output):
    """แปลงผล tracert -d (ทั้งภาษาอังกฤษ/ไทย) เป็น [{hop, ms:[..], ip}]"""
    hops = []
    for line in output.splitlines():
        m = _HOP_RE.match(line)
        if not m:
            continue
        rest = m.group(2)
        times = []
        for t in _HOP_MS_RE.finditer(rest):
            if t.group(0).strip() == "*":
                times.append(None)
            else:
                v = t.group(1).replace(" ", "")
                times.append(0.5 if v.startswith("<") else float(v))
        if not times:
            continue
        ips = _IPV4_RE.findall(rest)
        hops.append({"hop": int(m.group(1)), "ms": times[:3], "ip": ips[-1] if ips else None})
    return hops


def traceroute(host, max_hops=20):
    host = clean_host(host)
    if sys.platform != "win32":
        raise ToolError("ใช้ได้บน Windows เท่านั้น")
    slot = _slot()
    try:
        out = _run(["tracert", "-d", "-4", "-h", str(max_hops), "-w", "700", host], 90)
    except subprocess.TimeoutExpired:
        raise ToolError("traceroute ใช้เวลานานเกินไป")
    finally:
        slot.release()
    hops = parse_tracert(out)
    if not hops:
        raise ToolError("traceroute ไม่ได้ผล — ชื่อโดเมนถูกต้องไหม?")
    return {"host": host, "hops": hops, "reached": bool(hops and hops[-1]["ip"] and any(hops[-1]["ms"]))}


def dns_lookup(name):
    name = clean_host(name)
    t0 = time.perf_counter()
    try:
        ipaddress.IPv4Address(name)
        is_ip = True
    except ValueError:
        is_ip = False
    if is_ip:
        try:
            host, aliases, _ = socket.gethostbyaddr(name)
            records = [{"type": "PTR", "value": host}] + [{"type": "ALIAS", "value": a} for a in aliases]
        except OSError:
            records = []
    else:
        try:
            infos = socket.getaddrinfo(name, None, proto=socket.IPPROTO_TCP)
        except socket.gaierror:
            infos = []
        seen, records = set(), []
        for fam, *_, addr in infos:
            ip = addr[0]
            if ip in seen:
                continue
            seen.add(ip)
            records.append({"type": "A" if fam == socket.AF_INET else "AAAA", "value": ip})
    return {"query": name, "reverse": is_ip, "records": records,
            "ms": round((time.perf_counter() - t0) * 1000, 1)}


def public_ip(timeout=5):
    """ถาม IP สาธารณะจาก ipify (เรียกเฉพาะเมื่อผู้ใช้กดปุ่ม)"""
    req = urllib.request.Request("https://api.ipify.org?format=json", headers={"User-Agent": "NetworkPulse"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            ip = json.loads(r.read(200).decode())["ip"]
        ipaddress.ip_address(ip)
        return ip
    except Exception:
        raise ToolError("ถาม IP สาธารณะไม่สำเร็จ (ต้องต่ออินเทอร์เน็ต)")
