"""โหลดค่าตั้งจาก config.json (สร้างไฟล์ค่าเริ่มต้นให้ถ้ายังไม่มี)"""
import copy
import json
import os
import sys

# FROZEN = รันจากไฟล์ .exe (PyInstaller): config.json และ data/ อยู่ข้าง ๆ .exe
# ส่วนไฟล์หน้าเว็บ (static/) ถูกแพ็กไว้ในโฟลเดอร์ _internal (sys._MEIPASS)
FROZEN = bool(getattr(sys, "frozen", False))
BASE_DIR = os.path.dirname(sys.executable) if FROZEN else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES_DIR = getattr(sys, "_MEIPASS", BASE_DIR)
CONFIG_PATH = os.path.join(BASE_DIR, "config.json")

DEFAULTS = {
    "host": "127.0.0.1",
    "port": 8000,
    "db_path": "data/netpulse.db",
    "interval_sec": 2,
    "ping_timeout_ms": 1000,
    "targets": [
        {"id": "8.8.8.8", "name": "Google DNS", "host": "8.8.8.8"},
        {"id": "1.1.1.1", "name": "Cloudflare DNS", "host": "1.1.1.1"},
        {"id": "gateway", "name": "Default Gateway", "host": "auto"},
    ],
    "down_after_failures": 3,
    "latency_threshold_ms": 200,
    "latency_consecutive": 5,
    "latency_recover_consecutive": 3,
    "raw_retention_days": 7,
    "gateway_recheck_sec": 60,
    # ---- Phase 2 ----
    "lan_access": False,        # เปิดให้อุปกรณ์ใน Wi-Fi เดียวกันเข้าได้ (ต้องตั้งรหัสก่อน)
    "lan_ip": "auto",           # IP ของเครื่องนี้ในวง LAN ("auto" = หาเอง)
    "session_days": 30,
    "auth": {"password_hash": "", "totp_secret": ""},  # ตั้งด้วย: python setup_auth.py
    # ---- v1.2 ----
    "speedtest_interval_hours": 0,   # Speed test อัตโนมัติ (0 = ปิด กดเองในหน้าเว็บ)
    "plan_down_mbps": 0,             # ความเร็วตามแพ็กเกจ (0 = ไม่ระบุ)
    "plan_up_mbps": 0,
    "lan_scan_interval_min": 0,      # สแกนอุปกรณ์ในวง LAN อัตโนมัติ (0 = ปิด กดสแกนเองในหน้าเว็บ)
                                     # เปิดเฉพาะวงในบ้าน — วงของที่ทำงาน/มหาวิทยาลัยอาจไม่อนุญาตให้สแกน
}

_NONNEG_INTS = ("speedtest_interval_hours", "plan_down_mbps", "plan_up_mbps", "lan_scan_interval_min")

_POSITIVE_INTS = (
    "port", "interval_sec", "ping_timeout_ms", "down_after_failures",
    "latency_threshold_ms", "latency_consecutive",
    "latency_recover_consecutive", "raw_retention_days", "gateway_recheck_sec",
    "session_days",
)


def read_raw(path=CONFIG_PATH):
    if not os.path.exists(path):
        return copy.deepcopy(DEFAULTS)
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def write_raw(data, path=CONFIG_PATH):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    os.replace(tmp, path)


def _normalize_targets(targets):
    out, seen = [], set()
    for t in targets:
        host = str(t.get("host", "")).strip()
        if not host:
            continue
        auto = host.lower() == "auto"
        tid = str(t.get("id") or ("gateway" if auto else host))
        if tid in seen:
            raise ValueError(f"target id ซ้ำ: {tid}")
        seen.add(tid)
        out.append({
            "id": tid,
            "name": str(t.get("name") or tid),
            "host": "auto" if auto else host,
            "kind": "gateway" if auto else str(t.get("kind", "external")),
        })
    if not out:
        raise ValueError("ต้องมี target อย่างน้อย 1 รายการ")
    return out


def load_config(path=CONFIG_PATH):
    cfg = copy.deepcopy(DEFAULTS)
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            cfg.update(json.load(f))
    else:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(DEFAULTS, f, indent=2, ensure_ascii=False)
    for key in _POSITIVE_INTS:
        cfg[key] = int(cfg[key])
        if cfg[key] <= 0:
            raise ValueError(f"{key} ต้องมากกว่า 0")
    for key in _NONNEG_INTS:
        cfg[key] = max(0, int(cfg[key]))
    cfg["targets"] = _normalize_targets(cfg["targets"])
    cfg["lan_access"] = bool(cfg.get("lan_access"))
    auth = cfg.get("auth") or {}
    cfg["auth"] = {"password_hash": str(auth.get("password_hash") or ""),
                   "totp_secret": str(auth.get("totp_secret") or "")}
    if not os.path.isabs(cfg["db_path"]):
        cfg["db_path"] = os.path.join(BASE_DIR, cfg["db_path"])
    return cfg
