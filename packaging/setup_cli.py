"""จุดเริ่มของ NetworkPulse-setup.exe (มีหน้าต่าง console)

    NetworkPulse-setup.exe                    ตั้งรหัสผ่าน + TOTP (เหมือน python setup_auth.py)
    NetworkPulse-setup.exe --lan on           ตัวเลือกอื่นของ setup_auth.py ใช้ได้เหมือนกัน
    NetworkPulse-setup.exe autostart on       เปิดพร้อม Windows (on / off / status / start / stop / desktop)
"""
import os
import sys


def main():
    args = sys.argv[1:]
    try:
        if args[:1] == ["autostart"]:
            import autostart
            sys.argv = [sys.argv[0]] + (args[1:] or ["status"])
            autostart.main()
        else:
            import setup_auth
            sys.argv = [sys.argv[0]] + args
            setup_auth.main()
    except SystemExit as e:
        if e.code not in (None, 0):
            print(e.code)
    finally:
        # ดับเบิลคลิกเปิด → อย่าปิดหน้าต่างก่อนผู้ใช้อ่านผล
        if not args and os.environ.get("PROMPT") is None:
            try:
                input("\nกด Enter เพื่อปิด…")
            except EOFError:
                pass


if __name__ == "__main__":
    main()
