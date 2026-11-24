"""ทดสอบตัวสร้าง QR — ถ้ามี OpenCV จะถอดรหัสจริงเพื่อยืนยันว่าสแกนได้"""
import os
import random
import string
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from netpulse import qr  # noqa: E402

try:
    import cv2
    import numpy as np
except ImportError:
    cv2 = None

URI = ("otpauth://totp/Network%20Pulse:home?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP"
       "&issuer=Network%20Pulse")


def decode(matrix):
    """ลองหลายขนาดภาพ เพราะตัวตรวจจับของ OpenCV พลาดเป็นบางขนาด"""
    det = cv2.QRCodeDetector()
    n = len(matrix)
    for scale in (6, 4, 8, 5):
        q = 4
        img = np.full(((n + 2 * q) * scale,) * 2, 255, np.uint8)
        for y in range(n):
            for x in range(n):
                if matrix[y][x]:
                    img[(y + q) * scale:(y + q + 1) * scale, (x + q) * scale:(x + q + 1) * scale] = 0
        text = det.detectAndDecode(img)[0]
        if text:
            return text
    return ""


class QrTests(unittest.TestCase):
    def test_structure(self):
        m = qr.encode(URI)
        n = len(m)
        self.assertEqual((n - 17) % 4, 0)
        self.assertTrue(all(len(row) == n for row in m))
        # finder pattern มุมซ้ายบน: กรอบดำ 7x7, วงขาว, แกนดำ 3x3
        for i in range(7):
            self.assertTrue(m[0][i] and m[6][i] and m[i][0] and m[i][6])
        self.assertFalse(m[1][1])
        self.assertTrue(m[3][3])
        self.assertTrue(m[n - 8][8])  # dark module

    def test_terminal_round_trip(self):
        m = qr.encode("hello")
        quiet = 2
        lines = [ln.replace("\x1b[30;107m", "").replace("\x1b[0m", "") for ln in qr.to_terminal(m, quiet).splitlines()]
        size = len(m) + quiet * 2
        back = [[False] * size for _ in range(size + 1)]
        for r, line in enumerate(lines):
            self.assertEqual(len(line), size)
            for x, ch in enumerate(line):
                back[2 * r][x] = ch in "█▀"
                back[2 * r + 1][x] = ch in "█▄"
        inner = [row[quiet:quiet + len(m)] for row in back[quiet:quiet + len(m)]]
        self.assertEqual(inner, m)

    def test_too_long(self):
        with self.assertRaises(ValueError):
            qr.encode("x" * 3000)

    @unittest.skipIf(cv2 is None, "ไม่มี OpenCV สำหรับถอดรหัส")
    def test_decodes(self):
        random.seed(3)
        samples = [URI, "A", "Network Pulse ภาษาไทย"]
        samples += ["".join(random.choices(string.ascii_letters + string.digits, k=k)) for k in (20, 80, 150, 220)]
        for s in samples:
            with self.subTest(length=len(s)):
                self.assertEqual(decode(qr.encode(s)), s)


if __name__ == "__main__":
    unittest.main()
