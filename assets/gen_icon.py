#!/usr/bin/env python3
"""Generate Ante app icons (pure stdlib PNG writer).

Renders the "vault-wheel chip" brand mark: an ember disc with cream rim bolts,
an inner ring, a 6-spoke vault wheel and a cream hub, centered on a warm
charcoal tile. Geometry mirrors the inline SVG mark in index.html (100-unit
mark box, disc r=42), scaled to 0.72 of the tile so it sits like an app icon.
iOS masks the square to its superellipse, so we emit a full square (no rounding).
"""
import zlib, struct, os, math

CHARCOAL = (22, 20, 15)    # #16140f tile
EMBER    = (226, 85, 47)   # #E2552F disc
CREAM    = (244, 239, 228) # #F4EFE4 details


def mark_color(mx, my):
    """Color of mark-space point (mx,my) in the 0..100 box, or None for tile bg."""
    dx, dy = mx - 50.0, my - 50.0
    d = math.hypot(dx, dy)
    if d > 42.0:
        return None                      # outside the disc -> charcoal tile
    col = EMBER
    a = math.degrees(math.atan2(dy, dx))
    if 26.8 <= d <= 29.2:                # inner ring (r28, w2.4)
        col = CREAM
    if 31.0 <= d <= 39.0:                # 8 rim bolts, every 45 degrees
        f = a % 45.0
        if min(f, 45.0 - f) < 2.8:
            col = CREAM
    if d <= 26.0:                        # 6-spoke wheel (lines at 30/90/150)
        for phi in (30.0, 90.0, 150.0):
            if abs(d * math.sin(math.radians(a - phi))) < 1.8:
                col = CREAM
                break
    if d <= 7.5:                         # hub
        col = CREAM
    if d <= 3.0:                         # ember center dot
        col = EMBER
    return col


def pixel_color(px, py, S, ss):
    """Supersampled color for output pixel (px,py)."""
    unit = 0.0072 * S                    # one mark-unit in pixels (0.72 tile / 100)
    r = g = b = 0
    n = ss * ss
    for sx in range(ss):
        for sy in range(ss):
            fx = px + (sx + 0.5) / ss
            fy = py + (sy + 0.5) / ss
            mx = 50.0 + (fx - S / 2.0) / unit
            my = 50.0 + (fy - S / 2.0) / unit
            c = mark_color(mx, my) or CHARCOAL
            r += c[0]; g += c[1]; b += c[2]
    return (r // n, g // n, b // n)


def write_png(path, S):
    ss = 2 if S <= 512 else 1            # supersample small sizes for clean edges
    raw = bytearray()
    for y in range(S):
        raw.append(0)                    # filter type 0
        for x in range(S):
            raw += bytes(pixel_color(x, y, S, ss))

    def chunk(typ, data):
        c = struct.pack(">I", len(data)) + typ + data
        return c + struct.pack(">I", zlib.crc32(typ + data) & 0xffffffff)

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", S, S, 8, 2, 0, 0, 0)  # 8-bit RGB
    idat = zlib.compress(bytes(raw), 9)
    with open(path, "wb") as f:
        f.write(sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b""))
    print("wrote", path, f"{S}x{S}")


here = os.path.dirname(os.path.abspath(__file__))
for size, name in [(1024, "icon-1024.png"), (512, "icon-512.png"),
                   (192, "icon-192.png"), (180, "apple-touch-icon.png")]:
    write_png(os.path.join(here, name), size)
