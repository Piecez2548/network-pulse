@echo off
rem Build dist\NetworkPulse\ (NetworkPulse.exe + NetworkPulse-setup.exe) and dist\NetworkPulse-win64.zip
rem Uses a separate virtualenv in build\venv so the main Python install is untouched.
rem (ASCII only: cmd.exe misreads UTF-8 text inside .bat files)
cd /d "%~dp0.."

if not exist build\venv\Scripts\python.exe (
  python -m venv build\venv || goto :fail
  build\venv\Scripts\python -m pip install --upgrade pip >nul
  build\venv\Scripts\python -m pip install pyinstaller==6.11.1 -r requirements.txt || goto :fail
)

build\venv\Scripts\python -m PyInstaller --noconfirm --clean --distpath dist --workpath build\pyinstaller packaging\networkpulse.spec || goto :fail
copy /y README.md dist\NetworkPulse\README.md >nul
powershell -NoProfile -Command "Compress-Archive -Force -Path dist\NetworkPulse -DestinationPath dist\NetworkPulse-win64.zip" || goto :fail
echo.
echo Done: dist\NetworkPulse\NetworkPulse.exe
echo  zip: dist\NetworkPulse-win64.zip
exit /b 0

:fail
echo Build failed
exit /b 1
