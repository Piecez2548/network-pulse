"""เว็บเซิร์ฟเวอร์ (http.server ในตัว) — หน้าเว็บ static + JSON API + login"""
import json
import mimetypes
import os
import socket
import sys
import threading
import time
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from . import __version__, db
from . import settings as settings_mod
from .auth import COOKIE_NAME, is_lan_client
from .config import BASE_DIR, CONFIG_PATH, DEFAULTS

STATIC_DIR = os.path.join(BASE_DIR, "static")
TYPES = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
         ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json"}
CSP = ("default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; "
       "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
       "font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; "
       "frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
MAX_BODY = 8192
PUBLIC_API = {"/api/login", "/api/auth-status"}


class ApiError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def _int(qs, key, default=None, lo=None, hi=None):
    raw = qs.get(key, [None])[0]
    if raw in (None, ""):
        return default
    try:
        val = int(float(raw))
    except ValueError:
        raise ApiError(f"{key} ต้องเป็นตัวเลข")
    if lo is not None:
        val = max(lo, val)
    if hi is not None:
        val = min(hi, val)
    return val


def detect_lan_ip(probe="8.8.8.8"):
    """IP ของเครื่องนี้บนวง LAN (UDP connect ไม่ได้ส่งแพ็กเก็ตจริง)"""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect((probe, 53))
            ip = s.getsockname()[0]
    except OSError:
        return None
    return ip if ip and is_lan_client(ip) and not ip.startswith("127.") else None


class AppContext:
    def __init__(self, cfg, monitor, auth, config_path=CONFIG_PATH):
        self.cfg = cfg
        self.monitor = monitor
        self.auth = auth
        self.config_path = config_path
        self.running_targets = settings_mod.targets_signature(cfg["targets"])
        self.lan = {"enabled": cfg["lan_access"], "ip": None, "bound": False, "error": None}

    def allowed_hosts(self):
        hosts = {"localhost", "127.0.0.1", "[::1]"}
        if self.lan["ip"]:
            hosts.add(self.lan["ip"])
        return hosts


def make_handler(ctx):
    cfg, monitor, auth = ctx.cfg, ctx.monitor, ctx.auth
    target_ids = [t["id"] for t in cfg["targets"]]

    # ---------- GET API ----------
    def api_live(h, conn, qs):
        now = int(time.time())
        since = _int(qs, "since", now - 3600, lo=now - 3 * 3600)
        after = _int(qs, "after_event")
        return {
            "now": now,
            "targets": target_ids,
            "status": monitor.snapshot(),
            "rounds": db.recent_rounds(conn, since, target_ids),
            "events": list(reversed(db.events(conn, 50, after_id=after))) if after is not None else [],
            "last_event_id": db.last_event_id(conn),
        }

    def api_history(h, conn, qs):
        now = int(time.time())
        end = _int(qs, "end", now)
        start = _int(qs, "start", end - 86400)
        if end - start < 60 or end - start > 400 * 86400:
            raise ApiError("ช่วงเวลาไม่ถูกต้อง")
        span = end - start
        bucket = 60 if span <= 2 * 86400 else 300 if span <= 8 * 86400 else 3600
        if start < now - cfg["raw_retention_days"] * 86400 - 3600:
            bucket = max(bucket, 3600)  # ช่วงที่เก่ากว่า retention มีแต่ค่ารายชั่วโมง
        bucket = _int(qs, "bucket", bucket, lo=10, hi=86400)
        series, summary = db.history(conn, start, end, bucket, target_ids)
        downs = db.event_counts(conn, start, end)
        for t in target_ids:
            summary[t]["outages"] = downs.get(t, 0)
        return {
            "start": start, "end": end, "bucket": bucket, "targets": target_ids,
            "series": series, "summary": summary,
            "monitored_sec": db.beats_between(conn, start, end) * cfg["interval_sec"],
        }

    def api_events(h, conn, qs):
        return {"events": db.events(conn, _int(qs, "limit", 100, 1, 1000),
                                    start=_int(qs, "start"), end=_int(qs, "end"))}

    def api_config(h, conn, qs):
        size = sum(os.path.getsize(cfg["db_path"] + s) for s in ("", "-wal")
                   if os.path.exists(cfg["db_path"] + s))
        lan = dict(ctx.lan)
        lan["url"] = f"http://{lan['ip']}:{cfg['port']}" if lan["bound"] else None
        return {
            "version": __version__,
            "targets": [{"id": t["id"], "name": t["name"], "kind": t["kind"], "host": t["host"]}
                        for t in cfg["targets"]],
            "interval_sec": cfg["interval_sec"],
            "down_after_failures": cfg["down_after_failures"],
            "latency_threshold_ms": cfg["latency_threshold_ms"],
            "latency_consecutive": cfg["latency_consecutive"],
            "raw_retention_days": cfg["raw_retention_days"],
            "listen": f"{cfg['host']}:{cfg['port']}",
            "db_bytes": size,
            "auth_enabled": auth.enabled,
            "session_days": cfg["session_days"],
            "lan": lan,
            "client_ip": h.client_address[0],
        }

    def api_auth_status(h, conn, qs):
        return {"auth_enabled": auth.enabled, "logged_in": h.session is not None,
                "retry_after": auth.retry_after(h.client_address[0]) if auth.enabled else 0}

    def api_sessions(h, conn, qs):
        if not auth.enabled:
            return {"sessions": []}
        rows = db.session_list(conn, int(time.time()))
        for r in rows:
            r["current"] = r["id"] == h.session["id"]
        return {"sessions": rows}

    def api_settings(h, conn, qs):
        saved = settings_mod.saved_targets(ctx.config_path)
        gw = next((t["host"] for t in monitor.snapshot()["targets"] if t["kind"] == "gateway"), None)
        return {
            "values": {k: cfg[k] for k in settings_mod.FIELDS},
            "fields": {k: {"min": lo, "max": hi, "label": label}
                       for k, (lo, hi, label) in settings_mod.FIELDS.items()},
            "defaults": {k: DEFAULTS[k] for k in settings_mod.FIELDS},
            "default_targets": DEFAULTS["targets"],
            "targets": [{"id": t["id"], "name": t["name"], "host": t["host"]} for t in saved],
            "max_targets": settings_mod.MAX_TARGETS,
            "restart_required": settings_mod.targets_signature(saved) != ctx.running_targets,
            "gateway_ip": gw,
            "readonly": {"port": cfg["port"], "lan_access": cfg["lan_access"],
                         "auth_enabled": auth.enabled, "db_path": cfg["db_path"]},
        }

    # ---------- POST API ----------
    def post_settings(h, conn, body):
        saved = settings_mod.saved_targets(ctx.config_path)
        clean, errors = settings_mod.validate(body, saved, cfg["interval_sec"])
        if errors:
            return 400, {"error": "ค่าบางช่องไม่ถูกต้อง", "fields": errors}, None
        if "targets" in clean and settings_mod.targets_signature(clean["targets"]) == settings_mod.targets_signature(saved):
            del clean["targets"]  # ไม่ได้แก้เป้าหมาย
        changed = {k: v for k, v in clean.items()
                   if k == "targets" or cfg.get(k) != v}
        if changed:
            before = settings_mod.save(ctx.config_path, changed)
            settings_mod.apply_live(cfg, changed, auth)
            parts = []
            for k, v in changed.items():
                if k == "targets":
                    parts.append("เป้าหมาย (" + ", ".join(t["name"] for t in v) + ")")
                else:
                    parts.append(f"{settings_mod.FIELDS[k][2]} {before.get(k)}→{v}")
            db.add_event(conn, int(time.time()), "settings", "แก้การตั้งค่า: " + "; ".join(parts))
        restart = settings_mod.targets_signature(settings_mod.saved_targets(ctx.config_path)) != ctx.running_targets
        return 200, {"ok": True, "changed": sorted(changed), "restart_required": restart}, None

    def post_login(h, conn, body):
        if not auth.enabled:
            raise ApiError("ยังไม่ได้ตั้งรหัสผ่าน — รัน python setup_auth.py ก่อน")
        token, err = auth.login(conn, h.client_address[0], h.headers.get("User-Agent", ""),
                                str(body.get("password", "")), str(body.get("code", "")))
        if err:
            status, message, retry = err
            return status, {"error": message, "retry_after": retry}, None
        return 200, {"ok": True}, auth.cookie(token)

    def post_logout(h, conn, body):
        if auth.enabled:
            auth.logout(conn, h.cookie_token)
        return 200, {"ok": True}, auth.clear_cookie()

    def post_revoke(h, conn, body):
        if not auth.enabled:
            raise ApiError("ยังไม่ได้เปิดใช้ login")
        if body.get("others"):
            n = db.session_delete(conn, except_id=h.session["id"])
        else:
            try:
                sid = int(body.get("id"))
            except (TypeError, ValueError):
                raise ApiError("id ไม่ถูกต้อง")
            n = db.session_delete(conn, sid=sid)
            if sid == h.session["id"]:
                return 200, {"ok": True, "removed": n, "self": True}, auth.clear_cookie()
        return 200, {"ok": True, "removed": n}, None

    get_routes = {"/api/live": api_live, "/api/history": api_history, "/api/events": api_events,
                  "/api/config": api_config, "/api/auth-status": api_auth_status,
                  "/api/sessions": api_sessions, "/api/settings": api_settings}
    post_routes = {"/api/login": post_login, "/api/logout": post_logout,
                   "/api/sessions/revoke": post_revoke, "/api/settings": post_settings}

    class Handler(BaseHTTPRequestHandler):
        server_version = "NetworkPulse/" + __version__
        sys_version = ""

        def log_message(self, fmt, *args):  # เงียบ — ไม่พิมพ์ทุก request
            pass

        # ---------- response helpers ----------
        def _send(self, code, body, ctype, cache="no-store", cookie=None, extra=None):
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", cache)
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("X-Frame-Options", "DENY")
            self.send_header("Referrer-Policy", "no-referrer")
            if ctype.startswith("text/html"):
                self.send_header("Content-Security-Policy", CSP)
            if cookie:
                self.send_header("Set-Cookie", cookie)
            for k, v in (extra or {}).items():
                self.send_header(k, v)
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)

        def _json(self, code, obj, cookie=None):
            self._send(code, json.dumps(obj, ensure_ascii=False).encode("utf-8"),
                       "application/json; charset=utf-8", cookie=cookie)

        def _redirect(self, location):
            self._send(302, b"", "text/plain", extra={"Location": location})

        def _file(self, rel):
            full = os.path.normpath(os.path.join(STATIC_DIR, rel.lstrip("/")))
            if not full.startswith(STATIC_DIR + os.sep) or not os.path.isfile(full):
                self._json(404, {"error": "not found"})
                return
            ext = os.path.splitext(full)[1].lower()
            ctype = TYPES.get(ext) or mimetypes.guess_type(full)[0] or "application/octet-stream"
            with open(full, "rb") as f:
                self._send(200, f.read(), ctype, cache="no-cache")

        # ---------- guards ----------
        def _precheck(self):
            ip = self.client_address[0]
            if not is_lan_client(ip):
                self._send(403, "อนุญาตเฉพาะอุปกรณ์ในวง LAN".encode("utf-8"), "text/plain; charset=utf-8")
                return False
            host = (self.headers.get("Host") or "").strip().lower()
            hostname = host.rsplit(":", 1)[0] if not host.endswith("]") else host
            if hostname not in ctx.allowed_hosts():  # กัน DNS rebinding
                self._send(421, b"Misdirected request", "text/plain")
                return False
            jar = SimpleCookie()
            try:
                jar.load(self.headers.get("Cookie") or "")
            except Exception:
                pass
            self.cookie_token = jar[COOKIE_NAME].value if COOKIE_NAME in jar else None
            return True

        def _same_origin(self):
            origin = self.headers.get("Origin")
            if origin is None:
                return True
            return urlparse(origin).netloc.lower() == (self.headers.get("Host") or "").lower()

        def _load_session(self, conn):
            self.session = auth.session(conn, self.cookie_token, self.client_address[0]) \
                if auth.enabled else {"id": None}

        # ---------- GET ----------
        def do_HEAD(self):
            self.do_GET()

        def do_GET(self):
            if not self._precheck():
                return
            url = urlparse(self.path)
            path = url.path
            if path.startswith("/static/") or path == "/favicon.ico":
                self._file(path[len("/static"):] if path.startswith("/static/") else "favicon.svg")
                return
            conn = db.connect(cfg["db_path"])
            try:
                self._load_session(conn)
                if path == "/login":
                    if not auth.enabled or self.session:
                        self._redirect("/")
                    else:
                        self._file("login.html")
                    return
                if path in get_routes:
                    if self.session is None and path not in PUBLIC_API:
                        self._json(401, {"error": "ต้องเข้าสู่ระบบ"})
                        return
                    try:
                        self._json(200, get_routes[path](self, conn, parse_qs(url.query)))
                    except ApiError as e:
                        self._json(e.status, {"error": str(e)})
                    return
                if path in ("/", "/index.html"):
                    if self.session is None:
                        self._redirect("/login")
                    else:
                        self._file("index.html")
                    return
                self._json(404, {"error": "not found"})
            except Exception as e:
                self._fail(e)
            finally:
                conn.close()

        # ---------- POST ----------
        def do_POST(self):
            if not self._precheck():
                return
            path = urlparse(self.path).path
            if path not in post_routes:
                self._json(404, {"error": "not found"})
                return
            if not self._same_origin() or "application/json" not in (self.headers.get("Content-Type") or ""):
                self._json(403, {"error": "คำขอไม่ถูกต้อง"})
                return
            try:
                length = int(self.headers.get("Content-Length") or 0)
            except ValueError:
                length = -1
            if length < 0 or length > MAX_BODY:
                self._json(413, {"error": "ข้อมูลใหญ่เกินไป"})
                return
            try:
                body = json.loads(self.rfile.read(length) or b"{}")
                if not isinstance(body, dict):
                    raise ValueError
            except ValueError:
                self._json(400, {"error": "JSON ไม่ถูกต้อง"})
                return
            conn = db.connect(cfg["db_path"])
            try:
                self._load_session(conn)
                if self.session is None and path not in PUBLIC_API:
                    self._json(401, {"error": "ต้องเข้าสู่ระบบ"})
                    return
                status, obj, cookie = post_routes[path](self, conn, body)
                self._json(status, obj, cookie=cookie)
            except ApiError as e:
                self._json(e.status, {"error": str(e)})
            except Exception as e:
                self._fail(e)
            finally:
                conn.close()

        def _fail(self, exc):
            print(f"[server] {self.command} {urlparse(self.path).path}: {type(exc).__name__}: {exc}", flush=True)
            self._json(500, {"error": "เกิดข้อผิดพลาดภายในโปรแกรม (ดูรายละเอียดในหน้าต่างที่รันโปรแกรม)"})

    return Handler


class _Server(ThreadingHTTPServer):
    """บน Windows: SO_REUSEADDR ทำให้หลายโปรเซส bind พอร์ตเดียวกันได้ (เปิดซ้ำ 2 ตัว / ถูกแย่งพอร์ต)
    จึงปิด reuse และจองพอร์ตแบบ exclusive แทน"""
    daemon_threads = True
    allow_reuse_address = sys.platform != "win32"

    def server_bind(self):
        if sys.platform == "win32" and hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def serve(ctx, host):
    return _Server((host, ctx.cfg["port"]), make_handler(ctx))


def start_lan_listener(ctx, retry_sec=30):
    """เปิดพอร์ตบน IP วง LAN — ถ้ายังไม่มีเน็ต/หา IP ไม่ได้ จะลองใหม่เรื่อย ๆ"""
    def run():
        while True:
            ip = ctx.cfg["lan_ip"] if ctx.cfg["lan_ip"] not in ("", "auto") else detect_lan_ip()
            if not ip:
                ctx.lan["error"] = "หา IP ของเครื่องในวง LAN ไม่เจอ — จะลองใหม่"
            else:
                try:
                    httpd = serve(ctx, ip)
                except OSError as e:
                    ctx.lan["error"] = f"เปิด {ip}:{ctx.cfg['port']} ไม่ได้: {e}"
                else:
                    ctx.lan.update(ip=ip, bound=True, error=None)
                    print(f"เปิดให้อุปกรณ์ใน Wi-Fi เดียวกันเข้าได้ที่ → http://{ip}:{ctx.cfg['port']}", flush=True)
                    httpd.serve_forever()
                    return
            time.sleep(retry_sec)

    t = threading.Thread(target=run, name="lan-listener", daemon=True)
    t.start()
    return t
