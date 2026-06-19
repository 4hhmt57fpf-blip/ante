#!/usr/bin/env python3
"""Generate Ante app icons (pure stdlib PNG writer). Gold->orange gradient + 'A' monogram."""
import zlib, struct, os

def lerp(a, b, t): return a + (b - a) * t

# brand colors
GOLD = (255, 214, 0)
ORANGE = (255, 152, 0)
DARK = (10, 10, 18)

def in_A(x, y, S):
    """Return True if pixel (x,y) in an SxS image is part of an 'A' monogram."""
    # normalize to 0..1
    nx, ny = x / S, y / S
    # geometry: apex at top-center, legs splay to bottom
    apex_x, apex_y = 0.5, 0.18
    base_y = 0.82
    half_base = 0.26          # half-width of the legs at the base
    thick = 0.085             # stroke thickness
    if ny < apex_y or ny > base_y:
        return False
    t = (ny - apex_y) / (base_y - apex_y)   # 0 at apex, 1 at base
    left_center = lerp(apex_x, apex_x - half_base, t)
    right_center = lerp(apex_x, apex_x + half_base, t)
    on_leg = abs(nx - left_center) < thick / 2 or abs(nx - right_center) < thick / 2
    # crossbar
    bar_y0, bar_y1 = 0.55, 0.55 + thick * 0.9
    on_bar = bar_y0 <= ny <= bar_y1 and left_center - thick < nx < right_center + thick
    return on_leg or on_bar

def write_png(path, S):
    raw = bytearray()
    for y in range(S):
        raw.append(0)  # filter type 0
        for x in range(S):
            t = (x + y) / (2 * S)               # diagonal gradient factor
            r = int(lerp(GOLD[0], ORANGE[0], t))
            g = int(lerp(GOLD[1], ORANGE[1], t))
            b = int(lerp(GOLD[2], ORANGE[2], t))
            if in_A(x, y, S):
                r, g, b = DARK
            raw += bytes((r, g, b))
    def chunk(typ, data):
        c = struct.pack(">I", len(data)) + typ + data
        return c + struct.pack(">I", zlib.crc32(typ + data) & 0xffffffff)
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", S, S, 8, 2, 0, 0, 0)  # 8-bit RGB
    idat = zlib.compress(bytes(raw), 9)
    with open(path, "wb") as f:
        f.write(sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b""))
    print("wrote", path, S, "x", S)

here = os.path.dirname(os.path.abspath(__file__))
for size, name in [(512, "icon-512.png"), (192, "icon-192.png"), (180, "apple-touch-icon.png")]:
    write_png(os.path.join(here, name), size)
