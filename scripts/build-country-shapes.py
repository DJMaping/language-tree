"""
build-country-shapes.py - DJ's 172 countries with his own map's coastlines.

    python scripts/build-country-shapes.py

The outlines in data/canon/country-shapes.json came from the andah-atlas
repository, rounded to a tenth of a degree: fine at a glance, coarse when
zoomed (DJ, 15 Oct 2026: "make the maps higher resolution so zooming isn't
blocky"). This keeps those outlines for which country is where, and takes
the land itself from DJ's 1765 map at picture size (data/cache/years/col,
4000 x 2000): every land pixel belongs to the country whose old outline
holds it, or the nearest one; sea inside an old outline goes back to sea.
Each country is then traced pixel edge by pixel edge and simplified to
under half a pixel, about 3 km.

The coarse file is kept as data/canon/country-shapes-coarse.json.
"""

import json
import os
import shutil
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHAPES = os.path.join(ROOT, 'data', 'canon', 'country-shapes.json')
COARSE = os.path.join(ROOT, 'data', 'canon', 'country-shapes-coarse.json')
FRAME = os.path.join(ROOT, 'data', 'cache', 'years', 'col', '1765.png')
SEA = (110 << 16) | (147 << 8) | 191


def trace(mask):
    """Closed loops of pixel edges around the True cells (holes included), as
    vertex lists in pixel-corner coordinates."""
    m = np.pad(mask, 1)
    # only cells on the edge can contribute an edge
    inner = m[1:-1, 1:-1] & m[:-2, 1:-1] & m[2:, 1:-1] & m[1:-1, :-2] & m[1:-1, 2:]
    ys, xs = np.nonzero(m[1:-1, 1:-1] & ~inner)
    # an edge for every side of a cell that faces outside, oriented so the
    # cell is on the left; a pinch point can have two edges leaving a corner
    out = {}
    for y, x in zip(ys.tolist(), xs.tolist()):
        my, mx = y + 1, x + 1
        for cond, a, b in ((not m[my - 1, mx], (x + 1, y), (x, y)), (not m[my + 1, mx], (x, y + 1), (x + 1, y + 1)),
                           (not m[my, mx - 1], (x, y), (x, y + 1)), (not m[my, mx + 1], (x + 1, y + 1), (x + 1, y))):
            if cond:
                out.setdefault(a, []).append(b)
    loops = []
    while out:
        start = next(iter(out))
        loop = [start]
        cur = start
        while True:
            nxt = out[cur].pop()
            if not out[cur]:
                del out[cur]
            if nxt == start:
                break
            loop.append(nxt)
            cur = nxt
            if cur not in out:
                break
        if len(loop) >= 4:
            loops.append(loop)
    return loops


def simplify(pts, tol):
    """Douglas-Peucker on a closed loop."""
    if len(pts) < 5:
        return pts
    p = np.array(pts, dtype=float)
    far = int(np.argmax(((p - p[0]) ** 2).sum(axis=1)))
    keep = np.zeros(len(p), dtype=bool)
    keep[[0, far, len(p) - 1]] = True
    stack = [(0, far), (far, len(p) - 1)]
    while stack:
        a, b = stack.pop()
        if b <= a + 1:
            continue
        seg = p[b] - p[a]
        n = np.hypot(*seg) or 1e-9
        d = np.abs(seg[1] * (p[a + 1:b, 0] - p[a, 0]) - seg[0] * (p[a + 1:b, 1] - p[a, 1])) / n
        i = int(np.argmax(d))
        if d[i] > tol:
            k = a + 1 + i
            keep[k] = True
            stack += [(a, k), (k, b)]
    return [pts[i] for i in np.nonzero(keep)[0]]


def main():
    if not os.path.exists(FRAME):
        sys.exit('No 1765 frame: run  python scripts/build-years.py frames  first.')
    src = COARSE if os.path.exists(COARSE) else SHAPES
    coarse = json.load(open(src, encoding='utf-8'))
    if src == SHAPES:
        shutil.copyfile(SHAPES, COARSE)
    a = np.asarray(Image.open(FRAME).convert('RGB')).astype(np.int64)
    H, W = a.shape[:2]
    land = ((a[..., 0] << 16) | (a[..., 1] << 8) | a[..., 2]) != SEA
    names = list(coarse['shapes'])
    img = Image.new('I', (W, H), -1)
    d = ImageDraw.Draw(img)
    for k, n in enumerate(names):
        for part in coarse['shapes'][n]:
            d.polygon([((x + 180) / 360 * W, (90 - y) / 180 * H) for x, y in part], fill=k)
    state = np.asarray(img).copy()
    # land outside every old outline: the nearest country
    outside = land & (state < 0)
    if outside.any():
        _, (iy, ix) = ndimage.distance_transform_edt(state < 0, return_indices=True)
        state[outside] = state[iy[outside], ix[outside]]
    state[~land] = -1
    # specks of a country cut off by the coarse outline are kept: they are islands
    shapes = {}
    for k, n in enumerate(names):
        mask = state == k
        if not mask.any():
            shapes[n] = coarse['shapes'][n]
            continue
        parts = []
        for loop in trace(mask):
            if len(loop) < 8:   # a lone pixel or two
                continue
            s = simplify(loop, 0.45)
            parts.append([[round(x / W * 360 - 180, 3), round(90 - y / H * 180, 3)] for x, y in s])
        shapes[n] = parts or coarse['shapes'][n]
    pts = sum(len(p) for v in shapes.values() for p in v)
    out = {
        '_source': "DJ's 172 countries: which country is where from the andah-atlas outlines (now country-shapes-coarse.json), the land and coasts from DJ's own 1765 map at 4000 x 2000 (scripts/build-country-shapes.py). Holes are separate loops; draw with the even-odd rule.",
        'bounds': coarse['bounds'],
        'shapes': shapes,
    }
    json.dump(out, open(SHAPES, 'w', encoding='utf-8'), separators=(',', ':'))
    print(f'{len(shapes)} countries, {pts} points ({os.path.getsize(SHAPES) // 1024} KB; was {sum(len(p) for v in coarse["shapes"].values() for p in v)} points)')


if __name__ == '__main__':
    main()
