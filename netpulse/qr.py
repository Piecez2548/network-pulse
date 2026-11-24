"""สร้าง QR Code แบบ pure Python (byte mode, ระดับแก้ข้อผิดพลาด M, version 1–40)
อ้างอิงอัลกอริทึมตามมาตรฐาน ISO/IEC 18004 — ไม่ต้องติดตั้งไลบรารีเพิ่ม

    matrix = encode("otpauth://...")   # list[list[bool]]  True = จุดดำ
    print(to_terminal(matrix))
"""

# ตารางสำหรับระดับ M: จำนวน ECC codeword ต่อบล็อก และจำนวนบล็อก (index = version)
_ECC_PER_BLOCK_M = (
    -1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26,
    26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28)
_NUM_BLOCKS_M = (
    -1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16,
    17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49)
_FORMAT_ECL_M = 0  # ค่า format bits ของระดับ M


# ---------- Reed–Solomon บน GF(256) ----------
def _gf_mul(x, y):
    z = 0
    for i in reversed(range(8)):
        z = (z << 1) ^ ((z >> 7) * 0x11D)
        z ^= ((y >> i) & 1) * x
    return z


def _rs_divisor(degree):
    result = [0] * (degree - 1) + [1]
    root = 1
    for _ in range(degree):
        for j in range(degree):
            result[j] = _gf_mul(result[j], root)
            if j + 1 < degree:
                result[j] ^= result[j + 1]
        root = _gf_mul(root, 0x02)
    return result


def _rs_remainder(data, divisor):
    result = [0] * len(divisor)
    for b in data:
        factor = b ^ result.pop(0)
        result.append(0)
        for i, coef in enumerate(divisor):
            result[i] ^= _gf_mul(coef, factor)
    return result


# ---------- ขนาดและความจุ ----------
def _num_raw_data_modules(ver):
    result = (16 * ver + 128) * ver + 64
    if ver >= 2:
        num_align = ver // 7 + 2
        result -= (25 * num_align - 10) * num_align - 55
        if ver >= 7:
            result -= 36
    return result


def _num_data_codewords(ver):
    return _num_raw_data_modules(ver) // 8 - _ECC_PER_BLOCK_M[ver] * _NUM_BLOCKS_M[ver]


def _alignment_positions(ver, size):
    if ver == 1:
        return []
    num_align = ver // 7 + 2
    step = 26 if ver == 32 else (ver * 4 + num_align * 2 + 1) // (num_align * 2 - 2) * 2
    result = [size - 7 - i * step for i in range(num_align - 1)] + [6]
    return list(reversed(result))


# ---------- ตัวสร้าง ----------
class _Builder:
    def __init__(self, ver):
        self.ver = ver
        self.size = ver * 4 + 17
        self.mod = [[False] * self.size for _ in range(self.size)]
        self.func = [[False] * self.size for _ in range(self.size)]

    def set_func(self, x, y, dark):
        self.mod[y][x] = dark
        self.func[y][x] = True

    def draw_function_patterns(self):
        n = self.size
        for i in range(n):  # timing patterns
            self.set_func(6, i, i % 2 == 0)
            self.set_func(i, 6, i % 2 == 0)
        for cx, cy in ((3, 3), (n - 4, 3), (3, n - 4)):  # finder patterns + separator
            for dy in range(-4, 5):
                for dx in range(-4, 5):
                    x, y = cx + dx, cy + dy
                    if 0 <= x < n and 0 <= y < n:
                        self.set_func(x, y, max(abs(dx), abs(dy)) not in (2, 4))
        pos = _alignment_positions(self.ver, n)
        last = len(pos) - 1
        for i, ax in enumerate(pos):
            for j, ay in enumerate(pos):
                if (i, j) in ((0, 0), (0, last), (last, 0)):
                    continue  # ทับกับ finder
                for dy in range(-2, 3):
                    for dx in range(-2, 3):
                        self.set_func(ax + dx, ay + dy, max(abs(dx), abs(dy)) != 1)
        self.draw_format_bits(0)  # จองพื้นที่ไว้ก่อน
        self.draw_version()

    def draw_format_bits(self, mask):
        data = _FORMAT_ECL_M << 3 | mask
        rem = data
        for _ in range(10):
            rem = (rem << 1) ^ ((rem >> 9) * 0x537)
        bits = (data << 10 | rem) ^ 0x5412
        bit = lambda i: ((bits >> i) & 1) != 0  # noqa: E731
        n = self.size
        for i in range(0, 6):
            self.set_func(8, i, bit(i))
        self.set_func(8, 7, bit(6))
        self.set_func(8, 8, bit(7))
        self.set_func(7, 8, bit(8))
        for i in range(9, 15):
            self.set_func(14 - i, 8, bit(i))
        for i in range(0, 8):
            self.set_func(n - 1 - i, 8, bit(i))
        for i in range(8, 15):
            self.set_func(8, n - 15 + i, bit(i))
        self.set_func(8, n - 8, True)  # dark module

    def draw_version(self):
        if self.ver < 7:
            return
        rem = self.ver
        for _ in range(12):
            rem = (rem << 1) ^ ((rem >> 11) * 0x1F25)
        bits = self.ver << 12 | rem
        for i in range(18):
            b = ((bits >> i) & 1) != 0
            a, c = self.size - 11 + i % 3, i // 3
            self.set_func(a, c, b)
            self.set_func(c, a, b)

    def draw_codewords(self, data):
        n = self.size
        i = 0
        right = n - 1
        while right >= 1:
            if right == 6:
                right = 5
            for vert in range(n):
                for j in range(2):
                    x = right - j
                    upward = ((right + 1) & 2) == 0
                    y = n - 1 - vert if upward else vert
                    if not self.func[y][x] and i < len(data) * 8:
                        self.mod[y][x] = ((data[i >> 3] >> (7 - (i & 7))) & 1) != 0
                        i += 1
            right -= 2

    def apply_mask(self, mask):
        f = _MASKS[mask]
        for y in range(self.size):
            for x in range(self.size):
                if not self.func[y][x] and f(x, y):
                    self.mod[y][x] = not self.mod[y][x]

    def penalty(self):
        """คะแนนโทษแบบย่อ (กฎ 1, 2, 4) — ใช้เลือก mask ที่สแกนง่ายที่สุด"""
        m, n = self.mod, self.size
        score = 0
        for lines in (m, [list(col) for col in zip(*m)]):
            for row in lines:
                run, prev = 0, None
                for v in row + [None]:
                    if v == prev:
                        run += 1
                    else:
                        if run >= 5:
                            score += run - 2
                        run, prev = 1, v
        for y in range(n - 1):
            for x in range(n - 1):
                c = m[y][x]
                if c == m[y][x + 1] == m[y + 1][x] == m[y + 1][x + 1]:
                    score += 3
        dark = sum(sum(row) for row in m)
        total = n * n
        score += (abs(dark * 20 - total * 10) + total - 1) // total * 10
        return score


_MASKS = (
    lambda x, y: (x + y) % 2 == 0,
    lambda x, y: y % 2 == 0,
    lambda x, y: x % 3 == 0,
    lambda x, y: (x + y) % 3 == 0,
    lambda x, y: (x // 3 + y // 2) % 2 == 0,
    lambda x, y: x * y % 2 + x * y % 3 == 0,
    lambda x, y: (x * y % 2 + x * y % 3) % 2 == 0,
    lambda x, y: ((x + y) % 2 + x * y % 3) % 2 == 0,
)


def _add_ecc_and_interleave(ver, data):
    num_blocks = _NUM_BLOCKS_M[ver]
    ecc_len = _ECC_PER_BLOCK_M[ver]
    raw_codewords = _num_raw_data_modules(ver) // 8
    num_short = num_blocks - raw_codewords % num_blocks
    short_len = raw_codewords // num_blocks
    divisor = _rs_divisor(ecc_len)
    blocks, k = [], 0
    for i in range(num_blocks):
        dat = data[k:k + short_len - ecc_len + (0 if i < num_short else 1)]
        k += len(dat)
        ecc = _rs_remainder(dat, divisor)
        if i < num_short:
            dat = dat + [0]  # ช่องว่างให้บล็อกสั้นยาวเท่าบล็อกยาว (ไม่ถูกใส่ลงผลลัพธ์)
        blocks.append(dat + ecc)
    result = []
    for i in range(len(blocks[0])):
        for j, blk in enumerate(blocks):
            if i != short_len - ecc_len or j >= num_short:
                result.append(blk[i])
    return result


def encode(text):
    """เข้ารหัสข้อความ (UTF-8, byte mode, ระดับ M) คืนเมทริกซ์ True = จุดดำ"""
    payload = text.encode("utf-8")
    for ver in range(1, 41):
        cc_bits = 8 if ver <= 9 else 16
        capacity = _num_data_codewords(ver) * 8
        if 4 + cc_bits + len(payload) * 8 <= capacity:
            break
    else:
        raise ValueError("ข้อความยาวเกินกว่าที่ QR Code รองรับ")

    bits = []

    def put(value, length):
        bits.extend((value >> i) & 1 for i in reversed(range(length)))

    put(0b0100, 4)              # byte mode
    put(len(payload), cc_bits)
    for b in payload:
        put(b, 8)
    put(0, min(4, capacity - len(bits)))  # terminator
    put(0, (-len(bits)) % 8)
    pad = 0xEC
    while len(bits) < capacity:
        put(pad, 8)
        pad ^= 0xEC ^ 0x11
    codewords = [int("".join(map(str, bits[i:i + 8])), 2) for i in range(0, len(bits), 8)]

    b = _Builder(ver)
    b.draw_function_patterns()
    b.draw_codewords(_add_ecc_and_interleave(ver, codewords))

    best, best_score = 0, None
    for mask in range(8):
        b.apply_mask(mask)
        b.draw_format_bits(mask)
        score = b.penalty()
        if best_score is None or score < best_score:
            best, best_score = mask, score
        b.apply_mask(mask)  # XOR ซ้ำ = ย้อนกลับ
    b.apply_mask(best)
    b.draw_format_bits(best)
    return b.mod


def to_terminal(matrix, quiet=2):
    """วาด QR ด้วยตัวอักษรครึ่งบล็อก (1 บรรทัด = 2 แถว) สีดำบนพื้นขาวด้วย ANSI
    จึงสแกนได้แม้ terminal จะเป็นธีมมืด"""
    n = len(matrix)
    size = n + quiet * 2

    def dark(x, y):
        x -= quiet
        y -= quiet
        return 0 <= x < n and 0 <= y < n and matrix[y][x]

    lines = []
    for y in range(0, size, 2):
        row = []
        for x in range(size):
            top, bottom = dark(x, y), dark(x, y + 1) if y + 1 < size else False
            row.append("█" if top and bottom else "▀" if top else "▄" if bottom else " ")
        lines.append("\x1b[30;107m" + "".join(row) + "\x1b[0m")
    return "\n".join(lines)


def to_svg(matrix, scale=8, quiet=4):
    n = len(matrix)
    size = (n + quiet * 2) * scale
    path = "".join(f"M{(x + quiet) * scale},{(y + quiet) * scale}h{scale}v{scale}h-{scale}z"
                   for y in range(n) for x in range(n) if matrix[y][x])
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" '
            f'width="{size}" height="{size}" shape-rendering="crispEdges">'
            f'<rect width="100%" height="100%" fill="#fff"/><path d="{path}" fill="#000"/></svg>')
