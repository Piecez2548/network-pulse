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
