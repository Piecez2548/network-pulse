# PyInstaller spec — สร้างโฟลเดอร์ dist/NetworkPulse ที่มี .exe 2 ตัวใช้ไลบรารีร่วมกัน
#   NetworkPulse.exe        ไม่มีหน้าต่าง: เริ่มทำงาน + เปิดหน้าเว็บ (--serve = ตัวเซิร์ฟเวอร์)
#   NetworkPulse-setup.exe  console: ตั้งรหัสผ่าน/TOTP, เปิดพร้อม Windows
# สร้างด้วย: packaging\build_exe.bat
import os

ROOT = os.path.abspath(os.path.join(SPECPATH, ".."))
ICON = os.path.join(ROOT, "static", "netpulse.ico")
DATAS = [(os.path.join(ROOT, "static"), "static")]
HIDDEN = ["pyotp"]


def analysis(script):
    return Analysis([os.path.join(SPECPATH, script)], pathex=[ROOT], datas=DATAS, hiddenimports=HIDDEN,
                    excludes=["tkinter", "unittest", "pydoc", "test"], noarchive=False)


a_main = analysis("launcher.py")
a_cli = analysis("setup_cli.py")

exe_main = EXE(PYZ(a_main.pure), a_main.scripts, [], exclude_binaries=True, name="NetworkPulse",
               console=False, icon=ICON, upx=False)
exe_cli = EXE(PYZ(a_cli.pure), a_cli.scripts, [], exclude_binaries=True, name="NetworkPulse-setup",
              console=True, icon=ICON, upx=False)

coll = COLLECT(exe_main, a_main.binaries, a_main.datas,
               exe_cli, a_cli.binaries, a_cli.datas,
               name="NetworkPulse", upx=False)
