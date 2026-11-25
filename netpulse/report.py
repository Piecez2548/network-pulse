"""รายงานคุณภาพอินเทอร์เน็ต (ไว้แนบตอนแจ้งปัญหากับผู้ให้บริการ)

- อินเทอร์เน็ตหลุด = ทุกปลายทางภายนอก (ไม่ใช่ gateway) ไม่ตอบพร้อมกัน — คิดจากเหตุการณ์ down/up
  จึงย้อนดูได้ทุกช่วง ไม่ขึ้นกับระยะเก็บข้อมูลรายรอบ
- ถ้า gateway หลุดด้วยในช่วงเดียวกัน → ปัญหาเครือข่ายในบ้าน (เราเตอร์/Wi-Fi) ไม่ใช่ ISP
- แบ่งรายวันตามเวลาท้องถิ่นของผู้เปิดรายงาน (tz = วินาทีที่บวกจาก UTC)
"""
from . import db

DAY = 86400
LOOKBACK = 30 * DAY  # หาเหตุการณ์ down ที่เริ่มก่อนช่วงรายงาน


def _intervals(evts, target, start_shift, now):
    """แปลงเหตุการณ์ของเป้าหมายหนึ่งเป็นช่วงที่หลุด [(a, b)]"""
    out, open_at = [], None
    for e in evts:
        if e["kind"] == "down" and e["target"] == target and open_at is None:
            open_at = e["ts"] - start_shift
        elif e["kind"] == "up" and e["target"] == target and open_at is not None:
            out.append((open_at, e["ts"]))
            open_at = None
        elif e["kind"] == "gap" and open_at is not None:
            # โปรแกรมหยุดทำงานระหว่างหลุด — นับถึงรอบสุดท้ายที่ยังวัดอยู่
            out.append((open_at, max(open_at, e["ts"])))
            open_at = None
    if open_at is not None:
        out.append((open_at, now))
    return out


def _intersect(a, b):
    out, i, j = [], 0, 0
    while i < len(a) and j < len(b):
        lo, hi = max(a[i][0], b[j][0]), min(a[i][1], b[j][1])
        if lo < hi:
            out.append((lo, hi))
        if a[i][1] < b[j][1]:
            i += 1
        else:
            j += 1
    return out


def _overlap(x, spans):
    return sum(max(0, min(x[1], b) - max(x[0], a)) for a, b in spans)


def _clip(spans, start, end):
    return [(max(a, start), min(b, end)) for a, b in spans if b > start and a < end and min(b, end) > max(a, start)]


def internet_outages(conn, cfg, start, end, now):
    ext = [t["id"] for t in cfg["targets"] if t["kind"] != "gateway"]
    gws = [t["id"] for t in cfg["targets"] if t["kind"] == "gateway"]
    evts = db.events_of_kinds(conn, ("down", "up", "gap"), start - LOOKBACK, end)
    shift = (cfg["down_after_failures"] - 1) * cfg["interval_sec"]
    stop = min(end, now)
    if not ext:
        return []
    spans = _intervals(evts, ext[0], shift, stop)
    for t in ext[1:]:
        spans = _intersect(spans, _intervals(evts, t, shift, stop))
    spans = _clip(spans, start, end)
    gw_spans = _clip(_intervals(evts, gws[0], shift, stop), start, end) if gws else None
    out = []
    for a, b in spans:
        if gw_spans is None:
            cause = "unknown"
        else:
            cause = "local" if _overlap((a, b), gw_spans) >= 0.5 * (b - a) else "isp"
        out.append({"start": a, "end": b, "sec": b - a, "cause": cause, "ongoing": b >= stop and stop == now})
    return out


def build(conn, cfg, start, end, now, tz=0):
    ext = {t["id"] for t in cfg["targets"] if t["kind"] != "gateway"}
    gws = {t["id"] for t in cfg["targets"] if t["kind"] == "gateway"}
    interval = cfg["interval_sec"]
    hstart = (start // 3600) * 3600
    stats = db.hourly_stats(conn, hstart, end)
    beats = db.beats_by_hour(conn, hstart, end)
    exact = db.round_health(conn, start, end, sorted(ext), cfg["latency_threshold_ms"], 3600)

    def day_of(ts):
        return ((ts + tz) // DAY) * DAY - tz

    days = {}
    d = day_of(start)
    while d < end:
        days[d] = {"day": d, "monitored_sec": 0, "up_sec": 0.0, "n": 0, "ok": 0, "sum": 0.0, "max": None,
                   "gw_n": 0, "gw_ok": 0, "gw_sum": 0.0, "outages": 0, "outage_sec": 0,
                   "high_latency": 0, "speed_down": [], "speed_up": []}
        d += DAY

    # ช่วงเวลาที่วัด + สัดส่วนที่ออกเน็ตได้ (รายชั่วโมง)
    for hour, nb in beats.items():
        if hour < hstart or hour >= end:
            continue
        cell = days.get(day_of(hour))
        if cell is None:
            continue
        mon = nb * interval
        if hour in exact and exact[hour][0]:
            rounds, up, _ = exact[hour]
            frac = up / rounds
        else:  # ข้อมูลเก่าที่เหลือแต่ค่ารายชั่วโมง: ใช้ปลายทางที่ตอบดีที่สุด
            ratios = [v[1] / v[0] for (h, t), v in stats.items() if h == hour and t in ext and v[0]]
            frac = max(ratios) if ratios else 1.0
        cell["monitored_sec"] += mon
        cell["up_sec"] += mon * frac

    for (hour, target), (n, ok, s, mx) in stats.items():
        cell = days.get(day_of(hour))
        if cell is None:
            continue
        if target in ext:
            cell["n"] += n
            cell["ok"] += ok
            cell["sum"] += s
            if mx is not None and (cell["max"] is None or mx > cell["max"]):
                cell["max"] = mx
        elif target in gws:
            cell["gw_n"] += n
            cell["gw_ok"] += ok
            cell["gw_sum"] += s

    outages = internet_outages(conn, cfg, start, end, now)
    for o in outages:
        a = o["start"]
        first = True
        while a < o["end"]:
            dk = day_of(a)
            b = min(o["end"], dk + DAY)
            cell = days.get(dk)
            if cell:
                cell["outage_sec"] += b - a
                if first:
                    cell["outages"] += 1
            first = False
            a = b

    for e in db.events_of_kinds(conn, ("high_latency",), start, end):
        cell = days.get(day_of(e["ts"]))
        if cell and e["target"] in ext:
            cell["high_latency"] += 1

    tests = db.speedtest_list(conn, start, end, limit=2000)
    for t in tests:
        cell = days.get(day_of(t["ts"]))
        if cell and not t["error"]:
            cell["speed_down"].append(t["down_bps"])
            cell["speed_up"].append(t["up_bps"])

    pct = lambda a, b: round(100 * a / b, 3) if b else None
    avg = lambda xs: sum(xs) / len(xs) if xs else None
    day_rows = []
    for cell in days.values():
        day_rows.append({
            "day": cell["day"], "monitored_sec": cell["monitored_sec"],
            "uptime_pct": pct(cell["up_sec"], cell["monitored_sec"]),
            "outages": cell["outages"], "outage_sec": cell["outage_sec"],
            "avg_ms": round(cell["sum"] / cell["ok"], 1) if cell["ok"] else None,
            "max_ms": cell["max"],
            "loss_pct": pct(cell["n"] - cell["ok"], cell["n"]),
            "gw_avg_ms": round(cell["gw_sum"] / cell["gw_ok"], 1) if cell["gw_ok"] else None,
            "high_latency": cell["high_latency"],
            "speed_down_bps": avg(cell["speed_down"]), "speed_up_bps": avg(cell["speed_up"]),
        })

    tot = lambda k: sum(c[k] for c in days.values())
    ok_tests = [t for t in tests if not t["error"]]
    mon = tot("monitored_sec")
    summary = {
        "period_sec": max(0, min(end, now) - start), "monitored_sec": mon,
        "uptime_pct": pct(tot("up_sec"), mon),
        "outages": len(outages), "outage_sec": sum(o["sec"] for o in outages),
        "longest_sec": max((o["sec"] for o in outages), default=0),
        "isp_outages": sum(o["cause"] == "isp" for o in outages),
        "local_outages": sum(o["cause"] == "local" for o in outages),
        "avg_ms": round(tot("sum") / tot("ok"), 1) if tot("ok") else None,
        "max_ms": max((c["max"] for c in days.values() if c["max"] is not None), default=None),
        "loss_pct": pct(tot("n") - tot("ok"), tot("n")),
        "high_latency": tot("high_latency"),
        "speedtests": len(ok_tests), "speedtests_failed": len(tests) - len(ok_tests),
        "down_avg_bps": avg([t["down_bps"] for t in ok_tests]),
        "down_min_bps": min((t["down_bps"] for t in ok_tests), default=None),
        "up_avg_bps": avg([t["up_bps"] for t in ok_tests]),
        "up_min_bps": min((t["up_bps"] for t in ok_tests), default=None),
    }
    return {
        "start": start, "end": end, "tz": tz, "generated": now,
        "targets": [{"id": t["id"], "name": t["name"], "host": t.get("resolved") or t["host"], "kind": t["kind"]}
                    for t in cfg["targets"]],
        "threshold_ms": cfg["latency_threshold_ms"],
        "plan": {"down_mbps": cfg.get("plan_down_mbps", 0), "up_mbps": cfg.get("plan_up_mbps", 0)},
        "summary": summary, "days": day_rows, "outages": outages,
        "speedtests": list(reversed(tests)),
    }
