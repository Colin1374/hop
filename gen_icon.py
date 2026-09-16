"""Generate apple-touch-icon.png (180x180) for xcancel hop. Pure stdlib, no Pillow.

Draws a blue X on dark background. Writes icon.png + icon_b64.txt (base64 for inlining).
"""
import base64
import struct
import zlib

S = 180
BG = (13, 17, 23)     # near-black
FG = (35, 134, 234)   # blue


def px(x: int, y: int):
    dx = x - (S - 1) / 2.0
    dy = y - (S - 1) / 2.0
    half, t = 56, 15
    if max(abs(dx), abs(dy)) <= half and (abs(dx - dy) <= t or abs(dx + dy) <= t):
        return FG
    return BG


rows = bytearray()
for y in range(S):
    rows.append(0)  # filter: none
    for x in range(S):
        rows.extend(px(x, y))


def chunk(tag: bytes, data: bytes) -> bytes:
    return (
        struct.pack(">I", len(data))
        + tag
        + data
        + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    )


png = (
    b"\x89PNG\r\n\x1a\n"
    + chunk(b"IHDR", struct.pack(">IIBBBBB", S, S, 8, 6, 0, 0, 0))
    + chunk(b"IDAT", zlib.compress(bytes(rows), 9))
    + chunk(b"IEND", b"")
)

with open("icon.png", "wb") as f:
    f.write(png)

b64 = base64.b64encode(png).decode()
with open("icon_b64.txt", "w") as f:
    f.write(b64)

print("icon.png", len(png), "bytes; b64", len(b64), "chars")
