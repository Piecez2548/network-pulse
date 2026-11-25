"""จุดเริ่มของ NetworkPulse.exe (ไม่มีหน้าต่าง)

    NetworkPulse.exe            เริ่มทำงานเบื้องหลัง (ถ้ายังไม่ได้เปิด) แล้วเปิดหน้าเว็บ
    NetworkPulse.exe --serve    ตัวเซิร์ฟเวอร์จริง (ถูกเรียกโดยคำสั่งข้างบน / shortcut เปิดพร้อม Windows)
"""
import sys


def main():
    if sys.argv[1:2] == ["--serve"]:
        import app
        app.main()
        return
    import autostart
    sys.argv = [sys.argv[0], "open"]
    autostart.main()


if __name__ == "__main__":
    main()
