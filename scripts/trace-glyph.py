"""
Trace a drawn glyph (a flag's emblem, a sketch) into the engine's strokes.

    python scripts/trace-glyph.py <image.png> [--out strokes.json] [--colour r,g,b]

The glyph is the image's ink: the pixels that are neither the background
(the colour at the corners) nor the field they sit on (the next commonest
colour), or `--colour` if given. The ink is thinned to its centre lines
(Zhang-Suen), the centre lines walked into polylines from their ends and
junctions, each polyline simplified (Douglas-Peucker) and marked a curve
where it bends smoothly, and the whole fitted into the engine's unit box.
Also measured: how even the stroke is (a brush thickens and thins, a pen
or a printed line does not), how much of it curves, and its width to
height, which the script's house style is read from (build-scripts.js
FLAGS).
"""

import json
import sys
from collections import Counter

import numpy as np
from PIL import Image


def components(mask, drop_edge=True, min_size=12):
    """Connected parts of a mask; the ones touching the window's edge (a band, a disc's rim) and the specks dropped."""
    from collections import deque
    H, W = mask.shape
    lab = np.zeros(mask.shape, dtype=int)
    keep = np.zeros(mask.shape, dtype=bool)
    n = 0
    for yy in range(H):
        for xx in range(W):
            if mask[yy, xx] and not lab[yy, xx]:
                n += 1
                q = deque([(yy, xx)]); lab[yy, xx] = n; touches = False; cells = []
                while q:
                    cy, cx = q.popleft(); cells.append((cy, cx))
                    if cy in (0, H - 1) or cx in (0, W - 1): touches = True
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < H and 0 <= nx < W and mask[ny, nx] and not lab[ny, nx]:
                            lab[ny, nx] = n; q.append((ny, nx))
                if (drop_edge and touches) or len(cells) < min_size:
                    continue
                for cy, cx in cells: keep[cy, cx] = True
    return keep


def opened(mask):
    """A one-pixel opening: the anti-aliased rim of a disc or band goes, a stroke stays."""
    p = np.pad(mask, 1)
    er = p[1:-1, 1:-1] & p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:]
    q = np.pad(er, 1)
    return q[1:-1, 1:-1] | q[:-2, 1:-1] | q[2:, 1:-1] | q[1:-1, :-2] | q[1:-1, 2:]


def load_ink(path, colour=None, centre=0.6):
    """The ink in the middle of the image: whatever differs from the field it sits on there.
    A flag's emblem sits on its central band or disc; the bands outside, the rim of a disc
    and anything touching the window's edge are left out."""
    Image.MAX_IMAGE_PIXELS = None
    im = Image.open(path).convert('RGB')
    if max(im.size) > 1200:
        im.thumbnail((1200, 1200))
    a = np.asarray(im).astype(int)
    h, w, _ = a.shape
    y0, y1 = int(h * (1 - centre) / 2), int(h * (1 + centre) / 2)
    x0, x1 = int(w * (1 - centre) / 2), int(w * (1 + centre) / 2)
    mid = a[y0:y1, x0:x1]
    flat = [tuple(x) for x in mid.reshape(-1, 3)[::5]]
    field = Counter(flat).most_common(1)[0][0]
    if colour is None:
        ink = components(np.abs(mid - np.array(field)).sum(axis=2) > 90)
        ink = opened(ink)
        if ink.sum() < 20:
            return ink
        colour = Counter(tuple(x) for x in mid[ink][::3]).most_common(1)[0][0]
    ink = np.abs(mid - np.array(colour)).sum(axis=2) < 120
    ink = opened(components(ink))
    return ink


def skeletonize(img):
    """Zhang-Suen thinning on a boolean array."""
    img = img.copy().astype(np.uint8)
    changed = True
    while changed:
        changed = False
        for step in (0, 1):
            p = np.pad(img, 1)
            P2 = p[:-2, 1:-1]; P3 = p[:-2, 2:]; P4 = p[1:-1, 2:]; P5 = p[2:, 2:]
            P6 = p[2:, 1:-1]; P7 = p[2:, :-2]; P8 = p[1:-1, :-2]; P9 = p[:-2, :-2]
            neigh = [P2, P3, P4, P5, P6, P7, P8, P9]
            B = sum(n.astype(int) for n in neigh)
            A = sum(((neigh[i] == 0) & (neigh[(i + 1) % 8] == 1)).astype(int) for i in range(8))
            if step == 0:
                c1 = (P2 * P4 * P6) == 0
                c2 = (P4 * P6 * P8) == 0
            else:
                c1 = (P2 * P4 * P8) == 0
                c2 = (P2 * P6 * P8) == 0
            m = (img == 1) & (B >= 2) & (B <= 6) & (A == 1) & c1 & c2
            if m.any():
                img[m] = 0
                changed = True
    return img.astype(bool)


def neighbours(y, x, sk):
    out = []
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if (dy or dx) and 0 <= y + dy < sk.shape[0] and 0 <= x + dx < sk.shape[1] and sk[y + dy, x + dx]:
                out.append((y + dy, x + dx))
    return out


def walk(sk):
    """Polylines along the skeleton: from ends and junctions, each segment once."""
    pts = list(zip(*np.nonzero(sk)))
    deg = {p: len(neighbours(*p, sk)) for p in pts}
    starts = [p for p in pts if deg[p] != 2]
    seen = set()
    lines = []

    def trace(p, q):
        line = [p, q]
        seen.add((p, q)); seen.add((q, p))
        prev, cur = p, q
        while deg.get(cur, 0) == 2:
            nxt = [n for n in neighbours(*cur, sk) if n != prev]
            if not nxt:
                break
            n = nxt[0]
            if (cur, n) in seen:
                break
            seen.add((cur, n)); seen.add((n, cur))
            line.append(n)
            prev, cur = cur, n
        return line

    for s in starts:
        for n in neighbours(*s, sk):
            if (s, n) not in seen:
                lines.append(trace(s, n))
    # closed loops with no end or junction
    for p in pts:
        if deg[p] == 2 and not any((p, n) in seen for n in neighbours(*p, sk)):
            n = neighbours(*p, sk)[0]
            line = trace(p, n)
            if len(line) > 4:
                line.append(line[0])
                lines.append(line)
    return [l for l in lines if len(l) >= 2]


def peucker(pts, tol):
    if len(pts) < 3:
        return pts
    a, b = np.array(pts[0], float), np.array(pts[-1], float)
    ab = b - a
    L2 = (ab ** 2).sum()
    best, idx = 0, 0
    for i in range(1, len(pts) - 1):
        p = np.array(pts[i], float)
        t = 0 if L2 == 0 else max(0, min(1, ((p - a) @ ab) / L2))
        d = np.linalg.norm(p - (a + t * ab))
        if d > best:
            best, idx = d, i
    if best <= tol:
        return [pts[0], pts[-1]]
    return peucker(pts[:idx + 1], tol)[:-1] + peucker(pts[idx:], tol)


def join_lines(lines, eps=2.5):
    """Join polylines end to end where the skeleton broke at a junction of two."""
    lines = [list(l) for l in lines]
    changed = True
    while changed:
        changed = False
        for i in range(len(lines)):
            for j in range(len(lines)):
                if i == j:
                    continue
                a, b = lines[i], lines[j]
                if np.hypot(a[-1][0] - b[0][0], a[-1][1] - b[0][1]) <= eps:
                    lines[i] = a + b[1:]; lines.pop(j); changed = True; break
                if np.hypot(a[-1][0] - b[-1][0], a[-1][1] - b[-1][1]) <= eps:
                    lines[i] = a + b[::-1][1:]; lines.pop(j); changed = True; break
            if changed:
                break
    return lines


def main():
    args = sys.argv[1:]
    path = args[0]
    out = args[args.index('--out') + 1] if '--out' in args else None
    colour = tuple(int(v) for v in args[args.index('--colour') + 1].split(',')) if '--colour' in args else None
    centre = float(args[args.index('--centre') + 1]) if '--centre' in args else 0.6
    ink = load_ink(path, colour, centre)
    ys, xs = np.nonzero(ink)
    if not len(ys):
        print(json.dumps({'error': 'no ink found'})); return
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    crop = ink[y0:y1 + 1, x0:x1 + 1]
    # work at a manageable size; shrunk by area, not by skipping rows, so a thin ring stays whole
    scale = max(1, max(crop.shape) / 260)
    if scale > 1:
        size = (max(1, round(crop.shape[1] / scale)), max(1, round(crop.shape[0] / scale)))
        small = np.asarray(Image.fromarray((crop * 255).astype(np.uint8)).resize(size, Image.BOX)) > 90
    else:
        small = crop
    # stroke width from the ink area over the skeleton length
    sk = skeletonize(small)
    length = max(1, int(sk.sum()))
    width = small.sum() / length
    # width evenness: the distance of ink pixels to the nearest non-ink, sampled along the skeleton
    from itertools import product
    widths = []
    sy, sx = np.nonzero(sk)
    for k in range(0, len(sy), max(1, len(sy) // 200)):
        y, x = sy[k], sx[k]
        r = 0
        while r < 40:
            r += 1
            ring = [(y + dy, x + dx) for dy, dx in product(range(-r, r + 1), repeat=2) if max(abs(dy), abs(dx)) == r]
            if any(not (0 <= yy < small.shape[0] and 0 <= xx < small.shape[1]) or not small[yy, xx] for yy, xx in ring):
                break
        widths.append(r)
    widths = np.array(widths, float)
    evenness = 1 - (widths.std() / widths.mean() if widths.mean() else 0)
    H, W = small.shape
    span = max(H, W)
    lines = join_lines(walk(sk), eps=2.5)
    # spurs: short lines with a free end, the thinning's whiskers at a thick corner
    def free(pt, me):
        return not any(o is not me and min(np.hypot(pt[0] - q[0], pt[1] - q[1]) for q in (o[0], o[-1])) <= 2.5 for o in lines)
    lines = [l for l in lines if len(l) > span * 0.05 or not (free(l[0], l) or free(l[-1], l))]
    lines = join_lines(lines, eps=3.5)
    strokes = []
    curved = 0.0
    total = 0.0
    for l in lines:
        simp = peucker([(float(y), float(x)) for y, x in l], tol=max(1.5, span * 0.012))
        if len(simp) < 2:
            continue
        pts = [[round(0.12 + (x - (W - span) / 2) / span * 0.76, 3), round(0.12 + (y - (H - span) / 2) / span * 0.76, 3)] for y, x in simp]
        closed = l[0] == l[-1]
        # a curve where the turns between segments are many and small, an angle where few and sharp
        angles = []
        for i in range(1, len(simp) - 1):
            v1 = np.array(simp[i]) - np.array(simp[i - 1]); v2 = np.array(simp[i + 1]) - np.array(simp[i])
            c = (v1 @ v2) / (np.linalg.norm(v1) * np.linalg.norm(v2) + 1e-9)
            angles.append(np.degrees(np.arccos(max(-1, min(1, c)))))
        L = sum(np.hypot(simp[i][0] - simp[i - 1][0], simp[i][1] - simp[i - 1][1]) for i in range(1, len(simp)))
        is_curve = len(angles) >= 2 and np.mean(angles) < 55
        total += L
        if is_curve:
            curved += L
        strokes.append({'pts': pts, 'curve': bool(is_curve), 'closed': bool(closed)})
    # the emblem as separate signs: split at empty columns between inked runs
    cols = small.any(axis=0)
    runs, start = [], None
    for x, c in enumerate(list(cols) + [False]):
        if c and start is None: start = x
        if not c and start is not None: runs.append((start, x)); start = None
    gap = W * 0.04
    merged = []
    for a, b in runs:
        if merged and a - merged[-1][1] < gap: merged[-1] = (merged[-1][0], b)
        else: merged.append((a, b))
    parts = []
    if len(merged) > 1:
        for a, b in merged:
            x0n, x1n = 0.12 + (a - (W - span) / 2) / span * 0.76, 0.12 + (b - (W - span) / 2) / span * 0.76
            parts.append([i for i, st in enumerate(strokes) if all(x0n - 0.02 <= p[0] <= x1n + 0.02 for p in st['pts'])])
    result = {
        'source': path,
        'strokes': strokes,
        'parts': parts,
        'measure': {
            'strokes': len(strokes),
            'widthShare': round(float(width) / span, 3),       # stroke width as a share of the glyph's size
            'evenness': round(float(evenness), 2),               # 1 even (pen, print), lower a brush
            'curved': round(float(curved / total), 2) if total else 0,   # the share of the line that curves
            'aspect': round(float(W / H), 2),
        },
    }
    text = json.dumps(result)
    if out:
        with open(out, 'w', encoding='utf8') as f:
            f.write(text)
    print(json.dumps(result['measure']), 'strokes', len(strokes))


if __name__ == '__main__':
    main()
