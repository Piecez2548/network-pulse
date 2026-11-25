"""แก้การตั้งค่าจากหน้าเว็บ: ตรวจค่า → บันทึก config.json → ใช้ทันที (ยกเว้นเป้าหมายต้องเปิดโปรแกรมใหม่)

ค่าที่เกี่ยวกับความปลอดภัย (รหัสผ่าน, TOTP, lan_access, host/port) แก้ได้เฉพาะ setup_auth.py / ไฟล์
"""
import ipaddress
import re
import threading

from .config import DEFAULTS, _normalize_targets, read_raw, write_raw

# key: (ต่ำสุด, สูงสุด, ชื่อที่แสดง)
FIELDS = {
    "interval_sec": (1, 60, "ระยะวัด (วินาที)"),
    "ping_timeout_ms": (200, 5000, "รอ ping ตอบ (ms)"),
    "down_after_failures": (1, 20, "ไม่ตอบกี่ครั้งจึงนับว่าหลุด"),
    "latency_threshold_ms": (10, 5000, "เกณฑ์ latency สูง (ms)"),
    "latency_consecutive": (1, 60, "เกินเกณฑ์กี่รอบจึงเตือน"),
    "latency_recover_consecutive": (1, 60, "ปกติกี่รอบจึงหายเตือน"),
    "raw_retention_days": (1, 90, "เก็บข้อมูลรายรอบ (วัน)"),
    "session_days": (1, 365, "อายุการเข้าสู่ระบบ (วัน)"),
    "speedtest_interval_hours": (0, 168, "Speed test อัตโนมัติทุกกี่ชั่วโมง (0 = ปิด)"),
    "plan_down_mbps": (0, 10000, "ความเร็วแพ็กเกจ ดาวน์โหลด (Mbps, 0 = ไม่ระบุ)"),
    "plan_up_mbps": (0, 10000, "ความเร็วแพ็กเกจ อัปโหลด (Mbps, 0 = ไม่ระบุ)"),
    "lan_scan_interval_min": (0, 1440, "สแกนอุปกรณ์ในบ้านทุกกี่นาที (0 = ปิด)"),
}
MAX_TARGETS = 8
MAX_NAME = 40
_HOSTNAME_RE = re.compile(
    r"^(?=.{1,253}$)(?!-)[A-Za-z0-9-]{1,63}(?<!-)(?:\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))*\.?$")
_IPV4_LIKE = re.compile(r"^[0-9.]+$")
_lock = threading.Lock()


def _check_host(host):
    """คืนข้อความผิดพลาด หรือ None ถ้าใช้ได้ (host ถูกส่งเป็น argument ของ ping จึงห้ามขึ้นต้นด้วย '-')"""
    if host == "auto":
        return None
    if _IPV4_LIKE.match(host):
        try:
            ip = ipaddress.IPv4Address(host)
        except ValueError:
            return "IP ไม่ถูกต้อง"
        if ip.is_unspecified or ip.is_multicast or str(ip) == "255.255.255.255":
            return "IP นี้ใช้ ping ไม่ได้"
        return None
    if not _HOSTNAME_RE.match(host):
        return "ใส่ IPv4 (เช่น 1.1.1.1), ชื่อโดเมน หรือ auto"
    return None


def validate(payload, saved_targets, current_interval):
    """คืน (ค่าที่ผ่านการตรวจ, errors) — errors เป็น {field: ข้อความ} ว่างถ้าผ่าน"""
    clean, errors = {}, {}
    for key, (lo, hi, label) in FIELDS.items():
        if key not in payload:
            continue
        try:
            val = int(payload[key])
            if isinstance(payload[key], float) and payload[key] != val:
                raise ValueError
        except (TypeError, ValueError):
            errors[key] = "ต้องเป็นจำนวนเต็ม"
            continue
        if not lo <= val <= hi:
            errors[key] = f"ต้องอยู่ระหว่าง {lo}–{hi}"
            continue
        clean[key] = val

    interval = clean.get("interval_sec", current_interval)
    timeout = clean.get("ping_timeout_ms")
    if timeout and timeout > interval * 1000:
        errors["ping_timeout_ms"] = "ต้องไม่นานกว่าระยะวัดแต่ละรอบ"

    if "targets" in payload:
        targets = payload["targets"]
        if not isinstance(targets, list) or not 1 <= len(targets) <= MAX_TARGETS:
            errors["targets"] = f"ต้องมีเป้าหมาย 1–{MAX_TARGETS} รายการ"
        else:
            saved = {t["id"]: t for t in saved_targets}
            out, used_ids, hosts, row_errors = [], set(), set(), {}
            for i, t in enumerate(targets):
                if not isinstance(t, dict):
                    row_errors[i] = "ข้อมูลไม่ถูกต้อง"
                    continue
                name = str(t.get("name", "")).strip()
                host = str(t.get("host", "")).strip()
                if host.lower() == "auto":
                    host = "auto"
                if not name or len(name) > MAX_NAME:
                    row_errors[i] = f"ชื่อต้องมี 1–{MAX_NAME} ตัวอักษร"
                    continue
                err = _check_host(host)
                if err:
                    row_errors[i] = err
                    continue
                if host.lower() in hosts:
                    row_errors[i] = "เป้าหมายซ้ำ" if host != "auto" else "ใช้ auto (gateway) ได้รายการเดียว"
                    continue
                hosts.add(host.lower())
                old = saved.get(str(t.get("id", "")))
                if old and old["host"] == host and old["id"] not in used_ids:
                    tid = old["id"]  # เป้าหมายเดิม → คงประวัติข้อมูลไว้
                else:
                    base = "gateway" if host == "auto" else host.lower()
                    tid, n = base, 2
                    while tid in used_ids or (tid in saved and saved[tid]["host"] != host):
                        tid, n = f"{base}-{n}", n + 1
                used_ids.add(tid)
                out.append({"id": tid, "name": name, "host": host})
            if row_errors:
                errors["targets"] = row_errors
            else:
                clean["targets"] = out
    return clean, errors


def targets_signature(targets):
    return [(t["id"], t["name"], t["host"]) for t in targets]


def saved_targets(path):
    raw = read_raw(path)
    return _normalize_targets(raw.get("targets") or DEFAULTS["targets"])


def save(path, clean):
    """เขียนเฉพาะค่าที่แก้ ลงไฟล์ (คงค่าอื่น เช่น auth ไว้ตามเดิม) คืน dict ค่าเดิมของ key ที่เปลี่ยน"""
    with _lock:
        raw = read_raw(path)
        before = {k: raw.get(k, DEFAULTS.get(k)) for k in clean}
        raw.update(clean)
        write_raw(raw, path)
    return before


def apply_live(cfg, clean, auth=None):
    """ค่าตัวเลขมีผลทันที — Monitor/Server อ่านจาก cfg ทุกรอบ; เป้าหมายรอเปิดโปรแกรมใหม่"""
    cfg.update({k: v for k, v in clean.items() if k in FIELDS})
    if auth is not None and "session_days" in clean:
        auth.session_sec = clean["session_days"] * 86400
