"""Login: รหัสผ่านเดียว (PBKDF2) + TOTP 6 หลัก, session ใน SQLite, จำกัดการเดารหัส"""
import base64
import hashlib
import hmac
import ipaddress
import secrets
import threading
import time

from . import db

try:
    import pyotp
except ImportError:  # Phase 1 ใช้ได้โดยไม่ต้องมี pyotp
    pyotp = None

PBKDF2_ITERATIONS = 310_000
COOKIE_NAME = "np_session"

MAX_FAILS_PER_IP = 5          # ผิดกี่ครั้ง (ต่อ IP) ภายใน FAIL_WINDOW แล้วล็อก
MAX_FAILS_GLOBAL = 20         # รวมทุก IP
FAIL_WINDOW = 15 * 60
LOCK_SEC = 15 * 60
TOUCH_EVERY = 60


def _b64(b):
    return base64.b64encode(b).decode("ascii")


def hash_password(password, iterations=PBKDF2_ITERATIONS):
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"pbkdf2_sha256${iterations}${_b64(salt)}${_b64(dk)}"


def verify_password(password, stored):
    try:
        algo, iterations, salt, expected = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"),
                                 base64.b64decode(salt), int(iterations))
        return hmac.compare_digest(dk, base64.b64decode(expected))
    except (ValueError, TypeError):
        return False


def token_hash(token):
    return hashlib.sha256(token.encode("ascii", "ignore")).hexdigest()


def is_lan_client(ip):
    """อนุญาตเฉพาะเครื่องนี้และ IP วงภายใน (192.168.x.x, 10.x, 172.16-31.x)"""
    try:
        addr = ipaddress.ip_address(ip.split("%")[0])
    except ValueError:
        return False
    if getattr(addr, "ipv4_mapped", None):
        addr = addr.ipv4_mapped
    return addr.is_loopback or (addr.is_private and not addr.is_link_local)


class Auth:
    def __init__(self, cfg, clock=time.time):
        a = cfg["auth"]
        self.password_hash = a["password_hash"]
        self.totp_secret = a["totp_secret"]
        self.enabled = bool(self.password_hash and self.totp_secret)
        if self.enabled and pyotp is None:
            raise RuntimeError("ตั้งรหัสไว้แล้วแต่ไม่พบ pyotp — ติดตั้งด้วย: pip install pyotp")
        if self.enabled:
            try:
                pyotp.TOTP(self.totp_secret).now()
            except Exception as e:
                raise RuntimeError(f"totp_secret ใน config.json ใช้ไม่ได้ ({e}) — ตั้งใหม่ด้วย: python setup_auth.py --totp")
        self.session_sec = cfg["session_days"] * 86400
        self.clock = clock
        self.lock = threading.Lock()
        self.fails = {}          # ip -> [ts, ...]
        self.global_fails = []
        self.locked_until = {}   # ip -> ts ("*" = ทุก IP)
        self.last_totp_step = -1

    # ---------- rate limit ----------
    def retry_after(self, ip):
        now = self.clock()
        with self.lock:
            until = max(self.locked_until.get(ip, 0), self.locked_until.get("*", 0))
        return max(0, int(until - now + 0.999))

    def _record_fail(self, ip):
        """คืน True ถ้าครั้งนี้ทำให้ถูกล็อก"""
        now = self.clock()
        with self.lock:
            lst = [t for t in self.fails.get(ip, []) if now - t < FAIL_WINDOW] + [now]
            self.fails[ip] = lst
            self.global_fails = [t for t in self.global_fails if now - t < FAIL_WINDOW] + [now]
            locked = False
            if len(lst) >= MAX_FAILS_PER_IP:
                self.locked_until[ip] = now + LOCK_SEC
                self.fails[ip] = []
                locked = True
            if len(self.global_fails) >= MAX_FAILS_GLOBAL:
                self.locked_until["*"] = now + LOCK_SEC
                self.global_fails = []
                locked = True
            return locked

    # ---------- TOTP ----------
    def verify_totp(self, code):
        code = (code or "").strip().replace(" ", "")
        if len(code) != 6 or not code.isdigit():
            return False
        totp = pyotp.TOTP(self.totp_secret)
        now = int(self.clock())
        with self.lock:
            for offset in (0, -1, 1):  # เผื่อนาฬิกาคลาดเคลื่อน ±30 วินาที
                t = now + offset * 30
                if hmac.compare_digest(totp.at(t), code):
                    step = t // 30
                    if step <= self.last_totp_step:
                        return False  # รหัสนี้ใช้ไปแล้ว (กันการนำกลับมาใช้ซ้ำ)
                    self.last_totp_step = step
                    return True
        return False

    # ---------- login / session ----------
    def login(self, conn, ip, ua, password, code):
        """คืน (token, None) ถ้าสำเร็จ หรือ (None, (status, message, retry_after))"""
        wait = self.retry_after(ip)
        if wait:
            return None, (429, f"ลองผิดหลายครั้งเกินไป รออีก {wait // 60 + 1} นาที", wait)
        pw_ok = verify_password(password or "", self.password_hash)
        # ตรวจ TOTP เฉพาะเมื่อรหัสผ่านถูก เพื่อไม่ให้รหัส 6 หลักถูกใช้ทิ้งไปเปล่า ๆ
        if not (pw_ok and self.verify_totp(code)):
            now = int(self.clock())
            if self._record_fail(ip):
                db.add_event(conn, now, "auth_lock",
                             f"ล็อกการเข้าสู่ระบบ {LOCK_SEC // 60} นาที — ใส่รหัสผิดหลายครั้งจาก {ip}")
                return None, (429, f"ลองผิดหลายครั้งเกินไป รออีก {LOCK_SEC // 60} นาที", LOCK_SEC)
            return None, (401, "รหัสผ่านหรือรหัส 6 หลักไม่ถูกต้อง", 0)
        with self.lock:
            self.fails.pop(ip, None)
        token = secrets.token_urlsafe(32)
        now = int(self.clock())
        db.session_create(conn, token_hash(token), now, now + self.session_sec, ip, ua)
        db.add_event(conn, now, "auth", f"เข้าสู่ระบบจาก {ip}")
        return token, None

    def session(self, conn, token, ip):
        if not token:
            return None
        now = int(self.clock())
        s = db.session_get(conn, token_hash(token), now)
        if s and now - s["last_seen"] >= TOUCH_EVERY:
            db.session_touch(conn, s["id"], now, ip)
        return s

    def logout(self, conn, token):
        s = db.session_get(conn, token_hash(token or ""), int(self.clock()))
        if s:
            db.session_delete(conn, sid=s["id"])

    def cookie(self, token):
        return (f"{COOKIE_NAME}={token}; Max-Age={self.session_sec}; Path=/; "
                "HttpOnly; SameSite=Strict")

    @staticmethod
    def clear_cookie():
        return f"{COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict"
