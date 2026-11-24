@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem เริ่มทำงานเบื้องหลัง (ถ้ายังไม่ได้ทำงาน) แล้วเปิดหน้าเว็บ
rem ต้องการดูข้อความแบบมีหน้าต่าง: python app.py
python autostart.py start
start "" http://localhost:8000
