"""Key the paper out of a stamped page and remap its inks to Haunt's palette.

The generated art is ink pressed onto warm paper. In the app there is no paper —
the ground is black — so the paper has to become transparency and the ink has to
become light. Alpha comes from how much darker than paper a pixel is, which is
also what carries the carving texture: dry gaps, grain and uneven pressure all
survive as partial alpha rather than as a colour.

Colour comes from the pixel's own hue, mapped to the nearest state colour in the
app's theme. A brick-red roof lands on the friend-of-a-friend tan, deep green on
the visited sage, grey-blue on the unvisited lavender, and everything neutral on
plain ink. So the stamps keep their multi-ink character while speaking the
palette the rest of the app speaks.
"""
import struct, subprocess, sys, zlib, pathlib

SCRATCH = pathlib.Path('/private/tmp/claude-501/-Users-kenanaiahjo-Haunt/08697513-ce64-4353-85bc-d2139c94122f/scratchpad')

# from the @theme block in src/index.css
INK      = (0xC8, 0xC8, 0xCC)   # --color-ink-2
SAGE     = (0xB7, 0xD2, 0xC6)   # --color-visited
LAVENDER = (0xC8, 0xC4, 0xEE)   # --color-unvisited
TAN      = (0xDF, 0xBE, 0xA4)   # --color-fof

FLOOR = 34          # darkest ink worth calling opaque
NOISE = 0.10        # paper texture below this fraction is not ink
GAMMA = 0.85        # lift the mid-tones so dry ink stays visible


def read_bmp(path):
    raw = path.read_bytes()
    off = struct.unpack_from('<I', raw, 10)[0]
    w, h = struct.unpack_from('<ii', raw, 18)
    bpp = struct.unpack_from('<H', raw, 28)[0]
    assert bpp == 24, bpp
    topdown = h < 0
    h = abs(h)
    stride = ((w * 3) + 3) // 4 * 4
    px = raw[off:]
    rows = []
    for y in range(h):
        src = y if topdown else (h - 1 - y)
        rows.append(px[src * stride: src * stride + w * 3])
    return w, h, rows


def write_png(path, w, h, rows):
    raw = b''.join(b'\x00' + row for row in rows)
    def chunk(tag, data):
        return (struct.pack('>I', len(data)) + tag + data
                + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF))
    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
           + chunk(b'IDAT', zlib.compress(raw, 9))
           + chunk(b'IEND', b''))
    path.write_bytes(png)


def tint(r, g, b):
    """Which of the app's colours this ink is closest to."""
    hi, lo = max(r, g, b), min(r, g, b)
    if hi - lo < 13:
        return INK
    span = hi - lo
    if hi == r:
        hue = (60 * (g - b) / span) % 360
    elif hi == g:
        hue = 60 * (2 + (b - r) / span)
    else:
        hue = 60 * (4 + (r - g) / span)
    if hue < 46 or hue >= 330:
        return TAN            # brick red
    if hue < 76:
        return TAN            # ochre
    if hue < 185:
        return SAGE           # deep green
    return LAVENDER           # grey blue through violet


def convert(src: pathlib.Path):
    bmp = SCRATCH / 'key.bmp'
    if bmp.exists():
        bmp.unlink()
    subprocess.run(['sips', '-s', 'format', 'bmp', str(src), '--out', str(bmp)],
                   check=True, capture_output=True)
    w, h, rows = read_bmp(bmp)

    lums = []
    for row in rows[::3]:
        for x in range(0, w * 3, 9):
            b, g, r = row[x], row[x+1], row[x+2]
            lums.append((r * 299 + g * 587 + b * 114) // 1000)
    lums.sort()
    paper = max(lums[int(len(lums) * 0.94)], FLOOR + 20)

    out, opaque = [], 0
    for row in rows:
        line = bytearray()
        for x in range(0, w * 3, 3):
            b, g, r = row[x], row[x+1], row[x+2]
            lum = (r * 299 + g * 587 + b * 114) // 1000
            t = (paper - lum) / (paper - FLOOR)
            t = (t - NOISE) / (1 - NOISE)
            if t <= 0:
                line += b'\x00\x00\x00\x00'
                continue
            a = min(1.0, t) ** GAMMA
            cr, cg, cb = tint(r, g, b)
            line += bytes((cr, cg, cb, round(a * 255)))
            if a > 0.5:
                opaque += 1
        out.append(bytes(line))

    write_png(src, w, h, out)
    return w, h, paper, opaque / (w * h)


if __name__ == '__main__':
    for path in sorted(pathlib.Path('public/art').glob('*.png')):
        w, h, paper, cover = convert(path)
        print(f'{path.name:28} {w}x{h}  paper={paper}  ink={cover*100:5.1f}%')
