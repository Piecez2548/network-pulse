"""ตั้งรหัสผ่าน + TOTP สำหรับ Network Pulse

    python setup_auth.py              ตั้งทั้งรหัสผ่านและ TOTP ใหม่
    python setup_auth.py --password   เปลี่ยนเฉพาะรหัสผ่าน
    python setup_auth.py --totp       สร้าง TOTP ใหม่ (เช่นเปลี่ยนมือถือ)
    python setup_auth.py --qr         แสดง QR ของ TOTP เดิมอีกครั้ง (เพิ่มมือถืออีกเครื่อง)
    python setup_auth.py --lan on|off เปิด/ปิดการเข้าจากอุปกรณ์ใน Wi-Fi เดียวกัน
    python setup_auth.py --disable    ลบรหัสทั้งหมด (กลับไปใช้ได้เฉพาะเครื่องนี้)

ทุกครั้งที่เปลี่ยนรหัส อุปกรณ์ที่ login ค้างไว้จะถูกออกจากระบบ — เปิดโปรแกรมใหม่หลังรันสคริปต์นี้
"""
import argparse
import getpass
import os
import sqlite3
import sys

from netpulse import qr
from netpulse.auth import hash_password
from netpulse.config import BASE_DIR, read_raw, write_raw

MIN_PASSWORD = 10
ISSUER = "Network Pulse"
ACCOUNT = "home"


def enable_terminal_colors():
    """เปิดการรองรับ ANSI ใน console ของ Windows (cmd / PowerShell)"""
    if sys.platform == "win32":
        os.system("")
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass


def show_totp(secret):
    import pyotp
    uri = pyotp.TOTP(secret).provisioning_uri(name=ACCOUNT, issuer_name=ISSUER)
    grouped = " ".join(secret[i:i + 4] for i in range(0, len(secret), 4))
    print("\nเปิดแอป Authenticator (Google / Microsoft Authenticator ฯลฯ) → เพิ่มบัญชี → สแกน QR นี้:\n")
    print(qr.to_terminal(qr.encode(uri)))
    print("\nถ้าสแกนไม่ได้ (เช่นหน้าต่างเล็กเกินไป ลองขยายหน้าต่าง/ลดขนาดฟอนต์) ให้เลือก 'ป้อนคีย์การตั้งค่า' แล้วใส่:")
    print(f"    ชื่อบัญชี : {ISSUER}")
    print(f"    คีย์      : {grouped}")
    print("    ประเภท    : ตามเวลา (Time based)")
    print("\n⚠ QR/คีย์นี้คือกุญแจเข้าระบบ — อย่าถ่ายรูปเก็บหรือส่งให้ใคร\n")


def ask_password():
    while True:
        pw = getpass.getpass(f"รหัสผ่านใหม่ (อย่างน้อย {MIN_PASSWORD} ตัวอักษร): ")
        if len(pw) < MIN_PASSWORD:
            print("  สั้นเกินไป")
            continue
        if getpass.getpass("พิมพ์ซ้ำอีกครั้ง: ") != pw:
            print("  ไม่ตรงกัน ลองใหม่")
            continue
        return hash_password(pw)


def ask_totp():
    try:
        import pyotp
    except ImportError:
        sys.exit("ต้องติดตั้ง pyotp ก่อน:  pip install pyotp")
    secret = pyotp.random_base32()
    totp = pyotp.TOTP(secret)
    show_totp(secret)
    for _ in range(3):
        code = input("ใส่รหัส 6 หลักจากแอปเพื่อยืนยัน: ").strip().replace(" ", "")
        if totp.verify(code, valid_window=1):
            os.system("cls" if sys.platform == "win32" else "clear")  # ไม่ให้ QR ค้างบนจอ
            print("✓ ยืนยันรหัส 6 หลักถูกต้อง")
            return secret
        print("  ไม่ถูกต้อง (ตรวจว่าเวลาบนมือถือและคอมตรงกัน)")
    sys.exit("ยกเลิก — ยังไม่ได้บันทึกอะไร")


def clear_sessions(cfg):
    db_path = cfg.get("db_path", "data/netpulse.db")
    if not os.path.isabs(db_path):
        db_path = os.path.join(BASE_DIR, db_path)
    if not os.path.exists(db_path):
        return
    conn = sqlite3.connect(db_path, timeout=10)
    try:
        conn.execute("DELETE FROM sessions")
        conn.commit()
    except sqlite3.OperationalError:
        pass  # ยังไม่มีตาราง sessions
    finally:
        conn.close()


def main():
    p = argparse.ArgumentParser(description="ตั้งรหัสผ่าน + TOTP ของ Network Pulse")
    g = p.add_mutually_exclusive_group()
    g.add_argument("--password", action="store_true", help="เปลี่ยนเฉพาะรหัสผ่าน")
    g.add_argument("--totp", action="store_true", help="สร้าง TOTP ใหม่")
    g.add_argument("--lan", choices=["on", "off"], help="เปิด/ปิดการเข้าจากอุปกรณ์อื่นใน Wi-Fi")
    g.add_argument("--disable", action="store_true", help="ลบรหัสผ่านและ TOTP")
    g.add_argument("--qr", action="store_true", help="แสดง QR ของ TOTP ที่ตั้งไว้แล้วอีกครั้ง")
    args = p.parse_args()
    enable_terminal_colors()

    cfg = read_raw()
    auth = dict(cfg.get("auth") or {})
    configured = bool(auth.get("password_hash") and auth.get("totp_secret"))

    if args.qr:
        if not auth.get("totp_secret"):
            sys.exit("ยังไม่ได้ตั้ง TOTP — รัน:  python setup_auth.py")
        show_totp(auth["totp_secret"])
        input("กด Enter เมื่อสแกนเสร็จ (หน้าจอจะถูกล้าง)…")
        os.system("cls" if sys.platform == "win32" else "clear")
        return

    if args.lan:
        if args.lan == "on" and not configured:
            sys.exit("ต้องตั้งรหัสผ่าน + TOTP ก่อน:  python setup_auth.py")
        cfg["lan_access"] = args.lan == "on"
        write_raw(cfg)
        print(f"lan_access = {cfg['lan_access']} — เปิดโปรแกรมใหม่เพื่อให้มีผล")
        return
    if args.disable:
        cfg["auth"] = {"password_hash": "", "totp_secret": ""}
        cfg["lan_access"] = False
        write_raw(cfg)
        clear_sessions(cfg)
        print("ลบรหัสแล้ว และปิด lan_access — เปิดได้เฉพาะเครื่องนี้")
        return
    if (args.password or args.totp) and not configured:
        print("ยังไม่เคยตั้งรหัส — จะตั้งทั้งรหัสผ่านและ TOTP")
        args.password = args.totp = False

    if not args.totp:
        auth["password_hash"] = ask_password()
    if not args.password:
        auth["totp_secret"] = ask_totp()
    cfg["auth"] = auth
    if not configured and "lan_access" not in cfg:
        cfg["lan_access"] = False
    write_raw(cfg)
    clear_sessions(cfg)
    print("\nบันทึกลง config.json แล้ว (อุปกรณ์ที่ login ค้างไว้ถูกออกจากระบบ)")
    if not cfg.get("lan_access"):
        print("ถ้าต้องการให้มือถือใน Wi-Fi เดียวกันเข้าได้:  python setup_auth.py --lan on")
    print("เปิด Network Pulse ใหม่เพื่อให้มีผล")


if __name__ == "__main__":
    main()
