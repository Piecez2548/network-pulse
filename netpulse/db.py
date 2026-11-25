"""SQLite: เก็บผล ping, heartbeat, เหตุการณ์ และรวมข้อมูลเก่าเป็นรายชั่วโมง"""
import os
import sqlite3

SCHEMA = """
CREATE TABLE IF NOT EXISTS samples(
    ts INTEGER NOT NULL, target TEXT NOT NULL, latency REAL, ok INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_samples_ts ON samples(ts);
CREATE TABLE IF NOT EXISTS heartbeat(ts INTEGER PRIMARY KEY);
CREATE TABLE IF NOT EXISTS hourly(
    hour INTEGER NOT NULL, target TEXT NOT NULL, n INTEGER NOT NULL, ok_n INTEGER NOT NULL,
    avg_ms REAL, min_ms REAL, max_ms REAL, PRIMARY KEY(hour, target)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS hourly_beats(hour INTEGER PRIMARY KEY, beats INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS events(
    id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, ts_end INTEGER,
    kind TEXT NOT NULL, target TEXT, message TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
CREATE TABLE IF NOT EXISTS sessions(
    id INTEGER PRIMARY KEY AUTOINCREMENT, token_hash TEXT NOT NULL UNIQUE,
    created INTEGER NOT NULL, last_seen INTEGER NOT NULL, expires INTEGER NOT NULL,
    ip TEXT, ua TEXT);
CREATE TABLE IF NOT EXISTS speedtests(
    id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, trigger TEXT NOT NULL,
    down_bps REAL, up_bps REAL, ping_ms REAL, jitter_ms REAL, server TEXT, error TEXT);
CREATE INDEX IF NOT EXISTS idx_speedtests_ts ON speedtests(ts);
CREATE TABLE IF NOT EXISTS devices(
    mac TEXT PRIMARY KEY, ip TEXT, hostname TEXT, name TEXT, known INTEGER NOT NULL DEFAULT 0,
    first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS lan_scans(
    ts INTEGER PRIMARY KEY, subnet TEXT, found INTEGER NOT NULL, ms INTEGER);
CREATE TABLE IF NOT EXISTS wifi_samples(
    ts INTEGER PRIMARY KEY, connected INTEGER NOT NULL, signal INTEGER, rssi INTEGER, channel INTEGER,
    band TEXT, rx_mbps REAL, tx_mbps REAL, ssid TEXT, bssid TEXT);
CREATE TABLE IF NOT EXISTS dns_samples(
    ts INTEGER NOT NULL, server TEXT NOT NULL, kind TEXT NOT NULL, ms REAL);
CREATE INDEX IF NOT EXISTS idx_dns_ts ON dns_samples(ts);
"""


def connect(path):
    if path != ":memory:":
        os.makedirs(os.path.dirname(path), exist_ok=True)
    # check_same_thread=False: Monitor สร้าง connection ในเธรดหลักแต่ใช้ในเธรดวัด (ใช้ทีละเธรดเท่านั้น)
    conn = sqlite3.connect(path, timeout=10, check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    return conn


def init(conn):
    conn.executescript(SCHEMA)
    conn.commit()


def last_heartbeat(conn):
    row = conn.execute("SELECT MAX(ts) FROM heartbeat").fetchone()
    if row[0] is not None:
        return row[0]
    row = conn.execute("SELECT MAX(hour) FROM hourly_beats").fetchone()
    return row[0] + 3599 if row[0] is not None else None


def write_round(conn, ts, samples, events):
    """samples: [(target, latency|None)]
    events: [{"kind", "target", "message", "ts"(ไม่ใส่ = ts ของรอบ), "ts_end"}]"""
    with conn:
        conn.executemany(
            "INSERT INTO samples(ts, target, latency, ok) VALUES (?,?,?,?)",
            [(ts, t, lat, 0 if lat is None else 1) for t, lat in samples])
        conn.execute("INSERT OR REPLACE INTO heartbeat(ts) VALUES (?)", (ts,))
        conn.executemany(
            "INSERT INTO events(ts, ts_end, kind, target, message) VALUES (?,?,?,?,?)",
            [(e.get("ts", ts), e.get("ts_end"), e["kind"], e.get("target"), e["message"])
             for e in events])


def rollup(conn, now, retention_days):
    """ย้ายข้อมูลรายรอบที่เก่ากว่า retention ไปเป็นค่ารายชั่วโมง (ตัดที่ขอบชั่วโมงพอดี)"""
    cutoff = (int(now - retention_days * 86400) // 3600) * 3600
    with conn:
        conn.execute(
            """INSERT OR REPLACE INTO hourly(hour, target, n, ok_n, avg_ms, min_ms, max_ms)
               SELECT (ts/3600)*3600, target, COUNT(*), SUM(ok), AVG(latency), MIN(latency), MAX(latency)
               FROM samples WHERE ts < ? GROUP BY 1, 2""", (cutoff,))
        conn.execute(
            """INSERT OR REPLACE INTO hourly_beats(hour, beats)
               SELECT (ts/3600)*3600, COUNT(*) FROM heartbeat WHERE ts < ? GROUP BY 1""", (cutoff,))
        moved = conn.execute("DELETE FROM samples WHERE ts < ?", (cutoff,)).rowcount
        conn.execute("DELETE FROM heartbeat WHERE ts < ?", (cutoff,))
    if moved:
        conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    return moved


def recent_rounds(conn, since, target_ids):
    """คืน [[ts, lat_t1, lat_t2, ...], ...] เรียงตามเวลา"""
    index = {t: i for i, t in enumerate(target_ids)}
    rounds = {}
    for ts, target, lat in conn.execute(
            "SELECT ts, target, latency FROM samples WHERE ts > ? ORDER BY ts", (since,)):
        if target not in index:
            continue
        row = rounds.get(ts)
        if row is None:
            row = rounds[ts] = [ts] + [None] * len(target_ids)
            row.append([])  # รายชื่อ target ที่ ping ในรอบนั้น
        row[1 + index[target]] = lat
        row[-1].append(index[target])
    out = []
    for row in rounds.values():
        pinged = set(row.pop())
        # None = ไม่ตอบ, "x" = ไม่ได้วัดในรอบนั้น (เช่นยังหา gateway ไม่เจอ)
        for i in range(len(target_ids)):
            if i not in pinged:
                row[1 + i] = "x"
        out.append(row)
    return out


def history(conn, start, end, bucket, target_ids):
    """รวมข้อมูลเป็นช่วง ๆ ละ bucket วินาที — ใช้ทั้งข้อมูลดิบและรายชั่วโมง"""
    acc = {t: {} for t in target_ids}

    def add(target, bk, n, ok_n, avg, mx):
        if target not in acc:
            return
        cell = acc[target].setdefault(bk, [0, 0, 0.0, None])
        cell[0] += n
        cell[1] += ok_n or 0
        if avg is not None and ok_n:
            cell[2] += avg * ok_n
        if mx is not None and (cell[3] is None or mx > cell[3]):
            cell[3] = mx

    for row in conn.execute(
            """SELECT target, (ts/?)*? AS bk, COUNT(*), SUM(ok), AVG(latency), MAX(latency)
               FROM samples WHERE ts >= ? AND ts < ? GROUP BY target, bk""",
            (bucket, bucket, start, end)):
        add(row[0], row[1], row[2], row[3], row[4], row[5])
    for row in conn.execute(
            "SELECT target, hour, n, ok_n, avg_ms, max_ms FROM hourly WHERE hour >= ? AND hour < ?",
            (start - 3599, end)):
        add(row[0], (row[1] // bucket) * bucket, row[2], row[3], row[4], row[5])

    series, summary = {}, {}
    for t in target_ids:
        pts, n_all, ok_all, sum_lat, mx_all = [], 0, 0, 0.0, None
        for bk in sorted(acc[t]):
            n, ok_n, s, mx = acc[t][bk]
            avg = round(s / ok_n, 2) if ok_n else None
            loss = round(100.0 * (n - ok_n) / n, 1) if n else None
            pts.append([bk, avg, mx, loss])
            n_all += n
            ok_all += ok_n
            sum_lat += s
            if mx is not None and (mx_all is None or mx > mx_all):
                mx_all = mx
        series[t] = pts
        summary[t] = {
            "samples": n_all,
            "avg_ms": round(sum_lat / ok_all, 2) if ok_all else None,
            "max_ms": mx_all,
            "loss_pct": round(100.0 * (n_all - ok_all) / n_all, 2) if n_all else None,
        }
    return series, summary


def round_health(conn, start, end, external_ids, threshold_ms, bucket):
    """นับรอบที่วัดได้ / รอบที่ออกเน็ตได้ / รอบที่ปกติทุกอย่าง แยกเป็นช่วง ๆ ละ bucket วินาที

    ออกเน็ตได้ = มี external อย่างน้อย 1 ตัวตอบ
    ปกติ = ทุกเป้าหมายที่วัดตอบ และ latency ของ external ไม่เกินเกณฑ์
    คืน {bucket_start: [rounds, up, healthy]} — ใช้เฉพาะข้อมูลรายรอบ (ช่วงไม่เกิน retention)
    """
    ext = list(external_ids) or ["__none__"]
    marks = ",".join("?" * len(ext))
    sql = f"""SELECT ts,
                SUM(CASE WHEN target IN ({marks}) THEN 1 ELSE 0 END),
                SUM(CASE WHEN target IN ({marks}) AND ok = 1 THEN 1 ELSE 0 END),
                COUNT(*), SUM(ok),
                MAX(CASE WHEN target IN ({marks}) THEN latency END)
              FROM samples WHERE ts >= ? AND ts < ? GROUP BY ts"""
    out = {}
    for ts, n_ext, ok_ext, n_all, ok_all, max_ext in conn.execute(sql, (*ext, *ext, *ext, start, end)):
        cell = out.setdefault((ts // bucket) * bucket, [0, 0, 0])
        cell[0] += 1
        up = ok_ext > 0 if n_ext else ok_all > 0
        cell[1] += up
        cell[2] += up and ok_all == n_all and (max_ext is None or max_ext <= threshold_ms)
    return out


def beats_between(conn, start, end):
    raw = conn.execute("SELECT COUNT(*) FROM heartbeat WHERE ts >= ? AND ts < ?", (start, end)).fetchone()[0]
    hourly = conn.execute(
        "SELECT COALESCE(SUM(beats),0) FROM hourly_beats WHERE hour >= ? AND hour < ?",
        (start - 3599, end)).fetchone()[0]
    return raw + hourly


def event_counts(conn, start, end):
    return dict(conn.execute(
        "SELECT target, COUNT(*) FROM events WHERE kind='down' AND ts >= ? AND ts < ? GROUP BY target",
        (start, end)).fetchall())


def events(conn, limit=50, after_id=None, start=None, end=None):
    sql = "SELECT id, ts, ts_end, kind, target, message FROM events WHERE 1=1"
    args = []
    if after_id is not None:
        sql += " AND id > ?"
        args.append(after_id)
    if start is not None:
        sql += " AND ts >= ?"
        args.append(start)
    if end is not None:
        sql += " AND ts < ?"
        args.append(end)
    sql += " ORDER BY id DESC LIMIT ?"
    args.append(limit)
    cols = ("id", "ts", "ts_end", "kind", "target", "message")
    return [dict(zip(cols, r)) for r in conn.execute(sql, args)]


def last_event_id(conn):
    return conn.execute("SELECT COALESCE(MAX(id), 0) FROM events").fetchone()[0]


def add_event(conn, ts, kind, message, target=None):
    with conn:
        conn.execute("INSERT INTO events(ts, kind, target, message) VALUES (?,?,?,?)",
                     (ts, kind, target, message))


# ---------- sessions (เก็บเฉพาะ hash ของ token) ----------
def session_create(conn, token_hash, now, expires, ip, ua):
    with conn:
        conn.execute("DELETE FROM sessions WHERE expires < ?", (now,))
        conn.execute(
            "INSERT INTO sessions(token_hash, created, last_seen, expires, ip, ua) VALUES (?,?,?,?,?,?)",
            (token_hash, now, now, expires, ip, (ua or "")[:200]))


def session_get(conn, token_hash, now):
    row = conn.execute(
        "SELECT id, last_seen FROM sessions WHERE token_hash = ? AND expires >= ?",
        (token_hash, now)).fetchone()
    return {"id": row[0], "last_seen": row[1]} if row else None


def session_touch(conn, sid, now, ip):
    with conn:
        conn.execute("UPDATE sessions SET last_seen = ?, ip = ? WHERE id = ?", (now, ip, sid))


def session_list(conn, now):
    cols = ("id", "created", "last_seen", "expires", "ip", "ua")
    return [dict(zip(cols, r)) for r in conn.execute(
        "SELECT id, created, last_seen, expires, ip, ua FROM sessions WHERE expires >= ? "
        "ORDER BY last_seen DESC", (now,))]


def session_delete(conn, sid=None, except_id=None):
    with conn:
        if sid is not None:
            return conn.execute("DELETE FROM sessions WHERE id = ?", (sid,)).rowcount
        return conn.execute("DELETE FROM sessions WHERE id != ?", (except_id or -1,)).rowcount


# ---------- speed test ----------
_ST_COLS = ("id", "ts", "trigger", "down_bps", "up_bps", "ping_ms", "jitter_ms", "server", "error")


def speedtest_add(conn, ts, trigger, down_bps=None, up_bps=None, ping_ms=None, jitter_ms=None,
                  server=None, error=None):
    with conn:
        return conn.execute(
            "INSERT INTO speedtests(ts, trigger, down_bps, up_bps, ping_ms, jitter_ms, server, error) "
            "VALUES (?,?,?,?,?,?,?,?)",
            (ts, trigger, down_bps, up_bps, ping_ms, jitter_ms, server, error)).lastrowid


def speedtest_list(conn, start=None, end=None, limit=500):
    sql, args = "SELECT " + ", ".join(_ST_COLS) + " FROM speedtests WHERE 1=1", []
    if start is not None:
        sql += " AND ts >= ?"
        args.append(start)
    if end is not None:
        sql += " AND ts < ?"
        args.append(end)
    sql += " ORDER BY ts DESC LIMIT ?"
    args.append(limit)
    return [dict(zip(_ST_COLS, r)) for r in conn.execute(sql, args)]


def speedtest_last_ts(conn):
    return conn.execute("SELECT MAX(ts) FROM speedtests").fetchone()[0]


# ---------- รายงาน ----------
def hourly_stats(conn, start, end):
    """สถิติรายชั่วโมงต่อเป้าหมาย จากข้อมูลดิบ + ข้อมูลรายชั่วโมงที่ rollup แล้ว
    คืน {(hour, target): [n, ok_n, sum_latency, max_latency]}"""
    out = {}

    def add(hour, target, n, ok_n, sum_lat, mx):
        cell = out.setdefault((hour, target), [0, 0, 0.0, None])
        cell[0] += n
        cell[1] += ok_n or 0
        cell[2] += sum_lat or 0.0
        if mx is not None and (cell[3] is None or mx > cell[3]):
            cell[3] = mx

    for row in conn.execute(
            """SELECT (ts/3600)*3600, target, COUNT(*), SUM(ok), SUM(latency), MAX(latency)
               FROM samples WHERE ts >= ? AND ts < ? GROUP BY 1, 2""", (start, end)):
        add(*row)
    for hour, target, n, ok_n, avg, mx in conn.execute(
            "SELECT hour, target, n, ok_n, avg_ms, max_ms FROM hourly WHERE hour >= ? AND hour < ?",
            (start, end)):
        add(hour, target, n, ok_n, (avg or 0.0) * (ok_n or 0), mx)
    return out


def beats_by_hour(conn, start, end):
    out = dict(conn.execute("SELECT hour, beats FROM hourly_beats WHERE hour >= ? AND hour < ?", (start, end)))
    for hour, n in conn.execute(
            "SELECT (ts/3600)*3600, COUNT(*) FROM heartbeat WHERE ts >= ? AND ts < ? GROUP BY 1", (start, end)):
        out[hour] = out.get(hour, 0) + n
    return out


def events_of_kinds(conn, kinds, start, end):
    marks = ",".join("?" * len(kinds))
    cols = ("id", "ts", "ts_end", "kind", "target", "message")
    return [dict(zip(cols, r)) for r in conn.execute(
        f"SELECT {', '.join(cols)} FROM events WHERE kind IN ({marks}) AND ts >= ? AND ts < ? ORDER BY ts, id",
        (*kinds, start, end))]


def last_event_before(conn, kinds, target, ts):
    marks = ",".join("?" * len(kinds))
    row = conn.execute(
        f"SELECT kind, ts FROM events WHERE kind IN ({marks}) AND target IS ? AND ts < ? ORDER BY ts DESC, id DESC LIMIT 1",
        (*kinds, target, ts)).fetchone()
    return row


# ---------- อุปกรณ์ในวง LAN ----------
_DEV_COLS = ("mac", "ip", "hostname", "name", "known", "first_seen", "last_seen")


def devices_upsert(conn, now, found):
    """found: [{"mac", "ip", "hostname"}] — คืนรายการ MAC ที่ไม่เคยเห็นมาก่อน"""
    new = []
    with conn:
        for d in found:
            row = conn.execute("SELECT hostname FROM devices WHERE mac = ?", (d["mac"],)).fetchone()
            if row is None:
                conn.execute("INSERT INTO devices(mac, ip, hostname, first_seen, last_seen) VALUES (?,?,?,?,?)",
                             (d["mac"], d["ip"], d.get("hostname"), now, now))
                new.append(d["mac"])
            else:
                conn.execute("UPDATE devices SET ip = ?, hostname = COALESCE(?, hostname), last_seen = ? WHERE mac = ?",
                             (d["ip"], d.get("hostname"), now, d["mac"]))
    return new


def devices_list(conn):
    return [dict(zip(_DEV_COLS, r)) for r in conn.execute(
        f"SELECT {', '.join(_DEV_COLS)} FROM devices ORDER BY last_seen DESC, ip")]


def device_update(conn, mac, name=None, known=None):
    with conn:
        if name is not None:
            conn.execute("UPDATE devices SET name = ? WHERE mac = ?", (name or None, mac))
        if known is not None:
            conn.execute("UPDATE devices SET known = ? WHERE mac = ?", (1 if known else 0, mac))
        return conn.execute("SELECT COUNT(*) FROM devices WHERE mac = ?", (mac,)).fetchone()[0]


def device_delete(conn, mac):
    with conn:
        return conn.execute("DELETE FROM devices WHERE mac = ?", (mac,)).rowcount


def lan_scan_add(conn, ts, subnet, found, ms):
    with conn:
        conn.execute("INSERT OR REPLACE INTO lan_scans(ts, subnet, found, ms) VALUES (?,?,?,?)",
                     (ts, subnet, found, ms))
        conn.execute("DELETE FROM lan_scans WHERE ts < ?", (ts - 90 * 86400,))


def lan_scan_last(conn):
    row = conn.execute("SELECT ts, subnet, found, ms FROM lan_scans ORDER BY ts DESC LIMIT 1").fetchone()
    return dict(zip(("ts", "subnet", "found", "ms"), row)) if row else None


# ---------- Wi-Fi / DNS ----------
_WIFI_COLS = ("ts", "connected", "signal", "rssi", "channel", "band", "rx_mbps", "tx_mbps", "ssid", "bssid")


def wifi_add(conn, ts, w):
    with conn:
        conn.execute(
            f"INSERT OR REPLACE INTO wifi_samples({', '.join(_WIFI_COLS)}) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (ts, 1 if w["connected"] else 0, w.get("signal"), w.get("rssi"), w.get("channel"), w.get("band"),
             w.get("rx_mbps"), w.get("tx_mbps"), w.get("ssid"), w.get("bssid")))


def wifi_series(conn, start, end, bucket):
    """[[bucket, สัญญาณเฉลี่ย, ต่ำสุด, จำนวนครั้งที่หลุด, จำนวนตัวอย่าง]]"""
    return [list(r) for r in conn.execute(
        """SELECT (ts/?)*?, ROUND(AVG(CASE WHEN connected=1 THEN signal END), 1),
                  MIN(CASE WHEN connected=1 THEN signal END), SUM(1-connected), COUNT(*)
           FROM wifi_samples WHERE ts >= ? AND ts < ? GROUP BY 1 ORDER BY 1""",
        (bucket, bucket, start, end))]


def wifi_between(conn, start, end):
    return [dict(zip(_WIFI_COLS, r)) for r in conn.execute(
        f"SELECT {', '.join(_WIFI_COLS)} FROM wifi_samples WHERE ts >= ? AND ts < ? ORDER BY ts", (start, end))]


def wifi_daily(conn, start, end, tz):
    """{วัน (UTC ts ของเที่ยงคืนท้องถิ่น): [สัญญาณเฉลี่ย, จำนวนตัวอย่างที่หลุด, ทั้งหมด]}"""
    return {r[0]: list(r[1:]) for r in conn.execute(
        """SELECT ((ts+?)/86400)*86400-?, AVG(CASE WHEN connected=1 THEN signal END), SUM(1-connected), COUNT(*)
           FROM wifi_samples WHERE ts >= ? AND ts < ? GROUP BY 1""", (tz, tz, start, end))}


def dns_add(conn, ts, rows):
    """rows: [(server, kind, ms|None)]"""
    with conn:
        conn.executemany("INSERT INTO dns_samples(ts, server, kind, ms) VALUES (?,?,?,?)",
                         [(ts, s, k, ms) for s, k, ms in rows])


def dns_series(conn, start, end, bucket):
    """{server: {"kind", "points": [[bucket, ms เฉลี่ย, ไม่ตอบ, ทั้งหมด]]}}"""
    out = {}
    for server, kind, bk, avg, fail, n in conn.execute(
            """SELECT server, kind, (ts/?)*?, ROUND(AVG(ms), 1), SUM(ms IS NULL), COUNT(*)
               FROM dns_samples WHERE ts >= ? AND ts < ? GROUP BY 1, 2, 3 ORDER BY 3""",
            (bucket, bucket, start, end)):
        out.setdefault(server, {"kind": kind, "points": []})["points"].append([bk, avg, fail, n])
    return out


def dns_daily(conn, start, end, tz):
    """{วัน: {kind: [ms เฉลี่ย, ไม่ตอบ, ทั้งหมด]}}"""
    out = {}
    for day, kind, avg, fail, n in conn.execute(
            """SELECT ((ts+?)/86400)*86400-?, kind, AVG(ms), SUM(ms IS NULL), COUNT(*)
               FROM dns_samples WHERE ts >= ? AND ts < ? GROUP BY 1, 2""", (tz, tz, start, end)):
        out.setdefault(day, {})[kind] = [avg, fail, n]
    return out


def prune_diag(conn, before):
    with conn:
        a = conn.execute("DELETE FROM wifi_samples WHERE ts < ?", (before,)).rowcount
        b = conn.execute("DELETE FROM dns_samples WHERE ts < ?", (before,)).rowcount
    return a + b
