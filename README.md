# Network Pulse

โปรแกรมเฝ้าการเชื่อมต่ออินเทอร์เน็ตบน Windows แสดงผลเป็นเว็บในเครื่อง (http://localhost:8000)
ทำงานเฉพาะตอนเปิดคอมและเปิดโปรแกรมไว้ — **v1.3**

## เริ่มใช้งาน

### แบบไฟล์ .exe (ไม่ต้องติดตั้ง Python)

1. ดาวน์โหลด `NetworkPulse-win64.zip` จากหน้า [Releases](https://github.com/Piecez2548/network-pulse/releases) แล้วแตกไฟล์ไว้ในโฟลเดอร์ที่จะเก็บถาวร
   (เช่น `D:\NetworkPulse`) — `config.json` และข้อมูล (`data\`) จะถูกสร้างไว้ในโฟลเดอร์เดียวกัน
2. ดับเบิลคลิก **`NetworkPulse.exe`** → เริ่มทำงานเบื้องหลังและเปิดหน้าเว็บให้
3. ตั้งรหัสผ่าน / เปิดพร้อม Windows ด้วย **`NetworkPulse-setup.exe`** (หน้าต่าง console):

```bat
NetworkPulse-setup.exe                    :: ตั้งรหัสผ่าน + TOTP (เหมือน python setup_auth.py)
NetworkPulse-setup.exe --lan on           :: ตัวเลือกอื่นของ setup_auth.py ใช้ได้เหมือนกัน
NetworkPulse-setup.exe autostart on       :: เปิดพร้อม Windows (on / off / status / start / stop / desktop)
```

> Windows SmartScreen อาจเตือนว่าไม่รู้จักผู้พัฒนา (ไฟล์ไม่ได้เซ็นชื่อ) — กด "More info" → "Run anyway"
> สร้าง .exe เองจากซอร์ส: `packaging\build_exe.bat` (ใช้ virtualenv แยกใน `build\venv`)

### แบบรันจากซอร์ส

ต้องมี Python 3.11 ขึ้นไป และ `pip install -r requirements.txt` (มีแค่ pyotp)

```bat
run.bat
```
เริ่มทำงานเบื้องหลัง (ถ้ายังไม่ได้ทำงาน) แล้วเปิด http://localhost:8000 ให้
ต้องการดูข้อความแบบมีหน้าต่าง: `python app.py` (กด Ctrl+C เพื่อหยุด)
กดปุ่ม "เปิดการแจ้งเตือน" มุมขวาบนหนึ่งครั้งเพื่อรับ Browser Notification

### เปิดพร้อม Windows

```bat
python autostart.py on       :: เปิดพร้อม Windows + เริ่มทำงานทันที (ไม่มีหน้าต่าง)
python autostart.py status   :: ดูสถานะ
python autostart.py stop     :: หยุดตัวที่ทำงานเบื้องหลัง
python autostart.py off      :: เลิกเปิดพร้อม Windows
python autostart.py desktop  :: สร้าง shortcut "Network Pulse" บน Desktop
```
- shortcut บน Desktop: ดับเบิลคลิกแล้วเริ่มทำงาน (ถ้ายังไม่ได้เปิด) และเปิดหน้าเว็บให้ — ไม่มีหน้าต่างดำเด้งขึ้นมา
- ใช้ shortcut ในโฟลเดอร์ Startup ของผู้ใช้ → ทำงานหลัง login โดยไม่ต้องใช้สิทธิ์ Administrator
- ทำงานด้วย `pythonw.exe` (ไม่มีหน้าต่าง) ข้อความของโปรแกรมอยู่ใน `data/netpulse.log` (เกิน 1 MB เก็บของเก่าเป็น `.log.1`)
- เปิดซ้ำไม่ได้ — ถ้ามีตัวหนึ่งใช้พอร์ต 8000 อยู่ ตัวที่สองจะแจ้งแล้วปิดตัวเอง
- การแจ้งเตือนต้องเปิดหน้าเว็บค้างไว้ในเบราว์เซอร์ (ตัววัดบันทึกข้อมูลตลอดแม้ไม่ได้เปิดหน้าเว็บ)

> หน้าเว็บไม่โหลดอะไรจากอินเทอร์เน็ต (Chart.js และฟอนต์อยู่ใน `static/vendor/`) จึงเปิดดูได้แม้ตอนเน็ตหลุด

## ทำงานอย่างไร

- ping `8.8.8.8`, `1.1.1.1` และ default gateway (หาจาก `ipconfig`, สำรองด้วย `route print`) พร้อมกันทุก 2 วินาที
- อ่านผล ping จากรูปแบบ `=12ms` / `<1ms` บนบรรทัดที่มี `TTL=` จึงใช้ได้กับ Windows ภาษาไทย
- ทุกรอบบันทึก heartbeat ลง SQLite (`data/netpulse.db`)
  - **เน็ตหลุด** = มี heartbeat แต่ ping ไม่ตอบ
  - **คอมปิด/โปรแกรมไม่ทำงาน** = ไม่มี heartbeat → บันทึกเป็นเหตุการณ์ "ไม่มีข้อมูล" และกราฟจะขาดเป็นช่อง
- หลุด = ไม่ตอบติดกัน 3 ครั้ง, แจ้งอีกครั้งเมื่อกลับมาพร้อมระยะเวลาที่หลุด
- latency สูง = เกิน 200 ms ติดกัน 5 รอบ, หายเตือนเมื่อปกติติดกัน 3 รอบ
- ข้อมูลรายรอบเก็บ 7 วัน จากนั้นรวมเป็นค่าเฉลี่ยรายชั่วโมง (ทำทุกชั่วโมงอัตโนมัติ)
- สถานะรวม: ถ้า router ตอบแต่ 8.8.8.8/1.1.1.1 ไม่ตอบ → บอกว่าน่าจะเป็นที่ ISP; ถ้า router ไม่ตอบด้วย → ปัญหาที่ Wi-Fi/router

## ตั้งค่า

**แก้จากหน้าเว็บ 11 Settings ได้เลย** — บันทึกลง `config.json` ให้ และมีผลทันที
ยกเว้นรายการเป้าหมายที่ต้องเปิดโปรแกรมใหม่ (หน้าเว็บจะขึ้นเตือน) · ทุกการแก้ถูกบันทึกไว้ในหน้า Events

ค่าที่เกี่ยวกับความปลอดภัย (รหัสผ่าน, TOTP, `lan_access`, `host`/`port`) แก้จากเว็บไม่ได้ ต้องใช้ `setup_auth.py`
หรือแก้ `config.json` บนเครื่องนี้แล้วเปิดโปรแกรมใหม่

| ค่า | ค่าเริ่มต้น | ความหมาย |
|---|---|---|
| `host` / `port` | `127.0.0.1` / `8000` | ที่อยู่เว็บ (Phase 1 เปิดเฉพาะเครื่องนี้) |
| `interval_sec` | `2` | ระยะวัดแต่ละรอบ |
| `ping_timeout_ms` | `1000` | รอ ping ตอบนานสุด |
| `targets` | 8.8.8.8, 1.1.1.1, gateway | `"host": "auto"` = หา default gateway เอง |
| `down_after_failures` | `3` | ไม่ตอบกี่ครั้งติดกันจึงนับว่าหลุด |
| `latency_threshold_ms` | `200` | เกณฑ์ latency สูง |
| `latency_consecutive` | `5` | เกินเกณฑ์กี่รอบติดกันจึงเตือน |
| `latency_recover_consecutive` | `3` | ปกติกี่รอบติดกันจึงหายเตือน |
| `raw_retention_days` | `7` | เก็บข้อมูลรายรอบกี่วันก่อนรวมเป็นรายชั่วโมง |
| `lan_access` | `false` | เปิดให้อุปกรณ์ใน Wi-Fi เดียวกันเข้าได้ (ต้องตั้งรหัสก่อน) |
| `lan_ip` | `"auto"` | IP ของเครื่องนี้ในวง LAN ที่จะเปิดพอร์ต |
| `session_days` | `30` | login ค้างไว้ได้กี่วัน |
| `speedtest_interval_hours` | `0` | Speed test อัตโนมัติทุกกี่ชั่วโมง (`0` = ปิด กดวัดเอง) |
| `plan_down_mbps` / `plan_up_mbps` | `0` | ความเร็วตามแพ็กเกจ ใช้เทียบ % ในหน้า Speed Test และรายงาน (`0` = ไม่ระบุ) |
| `lan_scan_interval_min` | `0` | สแกนอุปกรณ์ในวง LAN อัตโนมัติทุกกี่นาที (`0` = ปิด กดสแกนเอง) |
| `auth` | ว่าง | hash รหัสผ่าน + TOTP secret — **อย่าแก้เอง** ใช้ `setup_auth.py` |

## Login และการเข้าจากมือถือ (Phase 2)

```bat
python setup_auth.py          :: ตั้งรหัสผ่าน (อย่างน้อย 10 ตัว) + TOTP
python setup_auth.py --lan on :: เปิดให้มือถือใน Wi-Fi เดียวกันเข้าได้
```
แล้วเปิดโปรแกรมใหม่ — หน้า 10 Security จะแสดงที่อยู่สำหรับมือถือ (เช่น `http://192.168.1.34:8000`)

- **TOTP:** สคริปต์จะแสดง **QR Code ในหน้าต่าง terminal** ให้สแกนด้วยแอป Authenticator (มีคีย์ให้พิมพ์เองเป็นทางสำรอง)
  แล้วให้ยืนยันด้วยรหัส 6 หลักก่อนบันทึก — ยืนยันเสร็จจะล้างหน้าจอทันที
  ต้องการให้มือถืออีกเครื่องใช้ด้วย: `python setup_auth.py --qr`
  (QR สร้างด้วย `netpulse/qr.py` ที่เขียนเอง ไม่ต้องติดตั้งไลบรารีเพิ่ม และไม่ส่งข้อมูลออกนอกเครื่อง)
- **ยังไม่ตั้งรหัส:** เปิดได้เฉพาะเครื่องนี้โดยไม่ต้อง login และจะไม่เปิดพอร์ตให้อุปกรณ์อื่น
- **รหัสผ่าน:** เก็บเป็น PBKDF2-SHA256 (310,000 รอบ + salt) ใน `config.json` — ไม่เก็บรหัสจริง
- **ใส่รหัสผิด** 5 ครั้งใน 15 นาที → ล็อก IP นั้น 15 นาที (รวมทุก IP 20 ครั้ง → ล็อกทั้งหมด) และบันทึกเหตุการณ์ + แจ้งเตือน
- รหัส 6 หลักแต่ละตัวใช้ได้ครั้งเดียว · ยอมให้นาฬิกาคลาดเคลื่อน ±30 วินาที
- **Session:** cookie `HttpOnly; SameSite=Strict` อายุ 30 วัน เก็บเฉพาะ hash ใน SQLite — ดู/เพิกถอนอุปกรณ์ได้ที่หน้า Security
- **จำกัดการเข้าถึง:** รับเฉพาะ IP วงภายใน (192.168.x, 10.x, 172.16–31.x) และ Host ที่รู้จัก (กัน DNS rebinding)
- เปลี่ยนรหัส/TOTP แล้วทุกอุปกรณ์จะถูกออกจากระบบ

ข้อจำกัด
- Windows จะถามสิทธิ์ Firewall ครั้งแรกที่เปิด `lan_access` — อนุญาตเฉพาะ **Private network**
- ถ้า IP ของคอมเปลี่ยน (DHCP) ต้องเปิดโปรแกรมใหม่ · ตั้ง IP คงที่ใน router จะสะดวกกว่า
- การเชื่อมต่อในวง LAN เป็น http ธรรมดา (ไม่เข้ารหัส) — เหมาะกับ Wi-Fi บ้านที่เชื่อถือได้เท่านั้น
- มือถือที่เปิดผ่าน `http://192.168.x.x` จะเห็นการแจ้งเตือนเป็นป๊อปอัปในหน้าเว็บ — Browser Notification ใช้ได้เฉพาะบนเครื่องนี้ (localhost)

| คำสั่ง | ใช้เมื่อ |
|---|---|
| `python setup_auth.py --password` | เปลี่ยนรหัสผ่าน |
| `python setup_auth.py --totp` | เปลี่ยนมือถือ / ตั้ง TOTP ใหม่ |
| `python setup_auth.py --qr` | แสดง QR เดิมอีกครั้ง (เพิ่มมือถืออีกเครื่อง) |
| `python setup_auth.py --lan off` | ปิดการเข้าจากอุปกรณ์อื่น |
| `python setup_auth.py --disable` | ลบรหัสทั้งหมด |

## โครงสร้าง

```
app.py                 จุดเริ่มโปรแกรม
autostart.py           เปิดพร้อม Windows / เริ่ม-หยุดตัวที่ทำงานเบื้องหลัง / shortcut บน Desktop
tools/make_icon.py     สร้าง static/netpulse.ico (ไอคอนของ shortcut) ด้วยไลบรารีในตัว
setup_auth.py          ตั้งรหัสผ่าน + TOTP / เปิด-ปิด LAN
netpulse/auth.py       รหัสผ่าน, TOTP, session, จำกัดการเดารหัส
netpulse/qr.py         สร้าง QR Code (pure Python) สำหรับแอป Authenticator
netpulse/settings.py   ตรวจ/บันทึก/ใช้ค่าจากหน้า Settings
netpulse/config.py     โหลด config.json
netpulse/pingutil.py   เรียก ping / ipconfig และแปลผล
netpulse/monitor.py    เธรดวัด + ตรวจหลุด / latency สูง / ช่วงคอมปิด
netpulse/db.py         SQLite: samples, heartbeat, hourly, events
netpulse/traffic.py    อ่านปริมาณ Download/Upload ของการ์ดเครือข่าย (iphlpapi ผ่าน ctypes)
netpulse/tools.py      Ping / Traceroute / DNS / Public IP ของหน้า Network Tools
netpulse/speedtest.py  Speed test กับ speed.cloudflare.com + ตั้งเวลาอัตโนมัติ
netpulse/report.py     รายงานรายวัน / รายการที่หลุด / แยกสาเหตุ ISP กับในบ้าน
netpulse/lanscan.py    สแกนอุปกรณ์ในวง LAN ด้วย ARP (iphlpapi.SendARP) และจำ MAC ไว้
netpulse/wifi.py       อ่านสัญญาณ Wi-Fi จาก netsh wlan show interfaces (ใช้ได้ทั้ง Windows อังกฤษ/ไทย)
netpulse/dnsprobe.py   ถาม DNS ตรง (UDP) ไปที่ DNS ของเครื่องและ DNS สาธารณะ ไม่ผ่านแคชของ Windows
netpulse/diag.py       เก็บค่า Wi-Fi ทุก 10 วินาที และ DNS ทุก 30 วินาที เบื้องหลัง
netpulse/server.py     http.server: หน้าเว็บ + /api/live, /api/overview, /api/history, /api/events, /api/tools/*,
                       /api/speedtest, /api/report, /api/devices, /api/diag
packaging/             สร้าง .exe ด้วย PyInstaller (launcher.py, setup_cli.py, networkpulse.spec, build_exe.bat)
static/                หน้าเว็บ (HTML/CSS/JS) · static/vendor/ = Chart.js + ฟอนต์ (เก็บในเครื่อง พร้อมไฟล์ license)
tests/                 python -m unittest discover -s tests
```

## หน้าเว็บ

- **01 Overview** — สถานะรวม, Network Health 24 ชม., Latency เฉลี่ย / Jitter / Packet Loss (10 นาทีล่าสุดเทียบ 10 นาทีก่อนหน้า),
  Uptime 24 ชม. (เทียบ 24 ชม. ก่อนหน้า), Response ของ router, กราฟ 1m–24h, Connection Path, ปริมาณ Download/Upload ของการ์ดเครือข่าย
- **02 Live Monitor** — กราฟสด, ping log, **Wi-Fi** (สัญญาณ %, ช่อง, ย่าน, ความเร็วลิงก์ พร้อมกราฟย้อนหลัง)
  และ **DNS** (เวลาตอบของ DNS ของเครื่องเทียบกับ 1.1.1.1 / 8.8.8.8 — ถ้า DNS ช้า เว็บจะเปิดช้าแม้ ping ปกติ)
- **03 Network Tools** — Ping, Traceroute, DNS Lookup, IP Info (ปุ่มตรวจ Public IP ถาม api.ipify.org เฉพาะเมื่อกด)
- **04 Speed Test** — วัดดาวน์โหลด/อัปโหลด/ping จริงกับ speed.cloudflare.com (ราว 20 วินาที ใช้เน็ต 100–400 MB ต่อครั้ง),
  เทียบ % กับความเร็วแพ็กเกจ, กราฟและประวัติย้อนหลัง · วัดอัตโนมัติตั้งได้ที่ Settings (ค่าเริ่มต้นปิด)
- **05 Topology** — แผนผังเครื่องนี้ → router → อินเทอร์เน็ต → เป้าหมาย พร้อม traceroute
  และ **อุปกรณ์ในวง LAN**: กดสแกนเพื่อดู IP / MAC / ชื่อของทุกเครื่องที่ต่ออยู่, ตั้งชื่อ, กด "รู้จักแล้ว",
  เครื่องที่ไม่เคยเห็นจะขึ้นเป็น "อุปกรณ์ใหม่" ที่กระดิ่ง · สแกนเฉพาะวงในบ้าน — เครือข่ายของที่ทำงาน/มหาวิทยาลัยอาจไม่อนุญาตให้สแกน
- **06 History & Logs** — วันนี้ / 24 ชม. / 7 วัน / 30 วัน / เลือกวันเอง
- **07 Events & Alerts** — ตัวเลขสีแดงที่เมนูและจุดแดงที่กระดิ่ง = การหลุด / latency สูง / อุปกรณ์ใหม่ / ล็อก login ที่ยังไม่ได้ดู
- **08 Compare** — วันนี้ vs เมื่อวาน, สัปดาห์นี้ vs สัปดาห์ที่แล้ว (ช่วงเวลาเดียวกัน), 7/30 วัน vs ช่วงก่อนหน้า, กำหนดเอง
- **09 Reports** — รายงานไว้แนบตอนแจ้งปัญหากับ ISP: Uptime, จำนวนครั้ง/เวลาที่หลุด (แยกว่าเป็นที่ ISP หรือเราเตอร์ในบ้าน),
  latency, packet loss, ความเร็วเทียบแพ็กเกจ, สัญญาณ Wi-Fi และเวลา DNS รายวัน
  (ถ้า Wi-Fi หลุดหรือสัญญาณต่ำกว่า 35% ในช่วงที่หลุด จะระบุสาเหตุเป็น Wi-Fi) · ปุ่ม "พิมพ์ / บันทึก PDF" และ "ดาวน์โหลด CSV" (เปิดใน Excel ได้)
- **10 Security** — สถานะการป้องกัน, ที่อยู่สำหรับมือถือ (พร้อมวิธีเพิ่มเป็นไอคอนบนหน้าจอมือถือ), อุปกรณ์ที่ login อยู่
- **11 Settings** — ระยะวัด, เกณฑ์แจ้งเตือน, เป้าหมาย (สูงสุด 8), อายุข้อมูล, อายุการ login, Speed test อัตโนมัติ, ความเร็วแพ็กเกจ, สแกน LAN อัตโนมัติ

ทุกอย่างแสดงในหน้าเว็บเท่านั้น — ไม่มีการส่งแจ้งเตือนออกไปภายนอก

**เปิดบนมือถือแบบแอป:** iPhone เปิดด้วย Safari → แชร์ → "เพิ่มไปยังหน้าจอโฮม" (เปิดเต็มจอเหมือนแอป) ·
Android เปิดด้วย Chrome → ⋮ → "เพิ่มลงในหน้าจอหลัก" · บนคอม Edge/Chrome → "ติดตั้งแอปนี้"
(เข้าผ่าน `http://192.168.x.x` จึงเป็นไอคอนลัดที่เปิดหน้าเว็บ — ไม่มีโหมด offline เพราะต้องดึงข้อมูลสดจากคอมอยู่แล้ว)

ช่องค้นหาด้านบน (Ctrl + K): พิมพ์ชื่อเมนู หรือพิมพ์ IP/โดเมนเพื่อ Ping / Traceroute / DNS ได้ทันที
