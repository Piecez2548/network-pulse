"""สร้าง static/netpulse.ico และไอคอน PNG สำหรับมือถือ (PWA) ด้วยไลบรารีในตัวเท่านั้น

    python tools/make_icon.py

วาดแต่ละขนาดแยกกัน (ไม่ย่อจากภาพใหญ่) ให้คมทุกขนาด ใช้ anti-aliasing แบบคำนวณระยะ
"""
import math
import os
import struct
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "static", "netpulse.ico")
SIZES = (256, 64, 48, 32, 24, 16)

BG = (0x0E, 0x18, 0x28)
BORDER = (0x20, 0x30, 0x47)
LINE = (0x41, 0xD8, 0xEF)
# เส้นชีพจรในพิกัด 32x32 เหมือน favicon.svg: M3 17 h6 l3-8 5 15 4-11 2 4 h6
POINTS = [(3, 17), (9, 17), (12, 9), (17, 24), (21, 13), (23, 17), (29, 17)]


def _seg_dist(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - ax - t * dx, py - ay - t * dy)


def _rrect_sd(px, py, size, radius):
    """signed distance ถึงขอบสี่เหลี่ยมมุมมน (ลบ = อยู่ข้างใน)"""
    half = size / 2
    qx = abs(px - half) - (half - radius)
    qy = abs(py - half) - (half - radius)
    outside = math.hypot(max(qx, 0), max(qy, 0))
    return outside + min(max(qx, qy), 0) - radius


def render(size, radius_frac=0.22, inset=0.0):
    """inset: เว้นขอบให้เส้น (สัดส่วน) — ไอคอนแบบ maskable ต้องอยู่ใน safe zone 80% ตรงกลาง"""
    k = size * (1 - 2 * inset) / 32
    off = size * inset
    pts = [(off + x * k, off + y * k) for x, y in POINTS]
    segs = list(zip(pts, pts[1:]))
    half_w = max(2.4 * k, 1.35) / 2
    glow_w = half_w * 2.8
    radius = size * radius_frac
    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            px, py = x + 0.5, y + 0.5
            sd = _rrect_sd(px, py, size, radius) if radius_frac else -size
            a_bg = max(0.0, min(1.0, 0.5 - sd))
            if a_bg == 0:
                row += b"\0\0\0\0"
                continue
            # ขอบบาง ๆ ด้านใน
            border = max(0.0, min(1.0, 1.0 - abs(sd + max(1.0, size / 64)) / max(1.0, size / 64))) if size >= 32 else 0
            r, g, b = [BG[i] + (BORDER[i] - BG[i]) * border for i in range(3)]
            d = min(_seg_dist(px, py, ax, ay, bx, by) for (ax, ay), (bx, by) in segs)
            glow = max(0.0, 1 - d / glow_w) ** 2 * 0.35 if size >= 32 else 0
            line = max(0.0, min(1.0, half_w + 0.5 - d))
            for amount in (glow, line):
                r, g, b = (r + (LINE[0] - r) * amount, g + (LINE[1] - g) * amount, b + (LINE[2] - b) * amount)
            row += bytes((round(r), round(g), round(b), round(a_bg * 255)))
        rows.append(bytes(row))
    return rows


def png(rows, size):
    raw = b"".join(b"\0" + r for r in rows)  # filter type 0 ทุกแถว

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9))
            + chunk(b"IEND", b""))


def main():
    images = [(s, png(render(s), s)) for s in SIZES]
    header = struct.pack("<HHH", 0, 1, len(images))
    offset = len(header) + 16 * len(images)
    entries, blobs = b"", b""
    for s, data in images:
        dim = 0 if s >= 256 else s
        entries += struct.pack("<BBBBHHII", dim, dim, 0, 0, 1, 32, len(data), offset)
        offset += len(data)
        blobs += data
    with open(OUT, "wb") as f:
        f.write(header + entries + blobs)
    print(f"สร้าง {OUT} ({len(header + entries + blobs):,} bytes, ขนาด {', '.join(map(str, SIZES))})")
    # ไอคอนสำหรับ "เพิ่มไปยังหน้าจอหลัก" บนมือถือ
    for name, size, radius, inset in (("icon-192.png", 192, 0.22, 0), ("icon-512.png", 512, 0.22, 0),
                                      ("apple-touch-icon.png", 180, 0, 0.06), ("icon-maskable-512.png", 512, 0, 0.14)):
        path = os.path.join(ROOT, "static", name)
        with open(path, "wb") as f:
            f.write(png(render(size, radius, inset), size))
        print(f"สร้าง {path}")


if __name__ == "__main__":
    main()
