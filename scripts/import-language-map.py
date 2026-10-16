"""
import-language-map.py - one of DJ's own language maps (a part of the world in
one year, with his legend) as a regional keyframe of the yearly maps.

    python scripts/import-language-map.py "data/language-maps/sources/1565 AFA - Ayuma.json"

The JSON beside DJ's picture says what the picture is:
    source     his PNG (beside the JSON, in data/language-maps/sources/)
    year       the year it shows
    name       the region (part of the output's name)
    panel      [x0, y0, x1, y1]: the map's part of the picture (not the legend)
    sea        the sea's colour in it
    legend     [[colour, language id], ...]: his legend's swatch colours
    places     [[x, y, language id], ...]: where one colour is two languages
               (his legend gives two a colour), the patch of that colour at
               (x, y) of the picture belongs to that language
The picture is fitted to the yearly maps by its coastlines (scale and offset,
found here and written back to the JSON as "fit"). Lines, rivers, numbers and
anti-aliasing take the nearest legend colour. The result is
data/language-maps/<AFA|BFA>/commoners/regions/<year> - <name>.png, each
language in its paint colour (key.json), transparent everywhere the map says
nothing (the sea, and outside it); the yearly build reads it (python
scripts/build-years.py languages, or Apply changes).

DJ, 16 Oct 2026: "this map for 1565 shows all the language borders for
Ayuma, please use these and then redraw the whole map".
"""

import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_years_commoners as bc   # noqa: E402

by = bc.by
IW, IH = bc.IW, bc.IH


def hexrgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def main(spec_path):
    from scipy import ndimage
    Image.MAX_IMAGE_PIXELS = None
    spec = json.load(open(spec_path, encoding='utf-8'))
    here = os.path.dirname(os.path.abspath(spec_path))
    src = np.asarray(Image.open(os.path.join(here, spec['source'])).convert('RGB')).astype(np.int64)
    x0, y0, x1, y1 = spec['panel']
    pic = src[y0:y1, x0:x1]
    packed = (pic[..., 0] << 16) | (pic[..., 1] << 8) | pic[..., 2]
    sea = np.abs(pic - np.array(hexrgb(spec['sea']))).sum(-1) < 12
    land = ~sea
    year = int(spec['year'])

    # the chart and its paint colours
    import build_years_languages as bl
    doc = by.read_json(os.path.join(bc.ROOT, 'data', 'languages.json'), None)
    tree = bl.Tree(doc)
    ids = [l['id'] for l in doc['languages']]
    key = by.read_json(os.path.join(bc.KEYFRAMES, 'key.json'), {}).get('languages', {})
    L = bc.Lines(tree, ids, {i: key.get(i, '#808080') for i in ids})

    # his colours -> languages
    lang = np.full(packed.shape, -1, dtype=np.int32)
    for colour, lid in spec['legend']:
        if lid not in L.idx:
            raise SystemExit(f'{lid} is not on the chart')
        lang[packed == bc.pk(colour)] = L.idx[lid]
    for x, y, lid in spec.get('places', []):
        colour = packed[y - y0, x - x0]
        same = packed == colour
        lab, _ = ndimage.label(ndimage.binary_closing(same, iterations=4) & same)
        k = lab[y - y0, x - x0]
        if k:
            lang[lab == k] = L.idx[lid]
    # lines, rivers, numbers, anti-aliasing: the nearest painted colour, on land
    painted = lang >= 0
    print(f'{painted.sum() / land.sum():.1%} of the land in his colours exactly')
    _, (iy, ix) = ndimage.distance_transform_edt(~painted, return_indices=True)
    lang = np.where(land, lang[iy, ix], -1)

    # where it sits on the yearly maps: the scale and offset that best match the coastlines
    rc = by.read_packed(os.path.join(bc.CACHE, 'lang', f'{year}.png'))
    fit = spec.get('fit') or find_fit(land, rc != 0)
    spec['fit'] = fit
    s, ox, oy = fit['scale'], fit['x'], fit['y']
    print(f"fitted: {fit['agreement']:.1%} of the coast agrees (scale {s:.4f}, at {ox}, {oy})")

    # onto the frame at picture size: each frame pixel from the map pixel at its centre
    X0, Y0 = int(np.floor(ox)), int(np.floor(oy))
    X1, Y1 = int(np.ceil(ox + pic.shape[1] * s)), int(np.ceil(oy + pic.shape[0] * s))
    out = np.full((IH, IW), -1, dtype=np.int32)
    ys = np.arange(max(0, Y0), min(IH, Y1))
    xs = np.arange(X0, X1)
    v = ((ys + 0.5 - oy) / s).astype(int)
    u = ((xs + 0.5 - ox) / s).astype(int)
    okv, oku = (v >= 0) & (v < pic.shape[0]), (u >= 0) & (u < pic.shape[1])
    ys, v = ys[okv], v[okv]
    xs, u = xs[oku], u[oku]
    out[np.ix_(ys, xs % IW)] = lang[np.ix_(v, u)]
    covered = out >= 0

    # the picture: paint colours where it speaks, transparent elsewhere
    at = L.at(year)
    rgba = np.zeros((IH, IW, 4), dtype=np.uint8)
    col = L.keycol[at[np.maximum(out, 0)]]
    rgba[..., 0] = (col >> 16) & 255
    rgba[..., 1] = (col >> 8) & 255
    rgba[..., 2] = col & 255
    rgba[..., 3] = np.where(covered, 255, 0)
    era = 'AFA' if year >= 0 else 'BFA'
    rel = f"{era}/commoners/regions/{by.label(year)} - {spec['name']}.png"
    path = os.path.join(bc.KEYFRAMES, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.fromarray(rgba, 'RGBA').save(path, optimize=True)
    with open(spec_path, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(spec, f, indent=1, ensure_ascii=False)
        f.write('\n')
    u_, n_ = np.unique(out[covered], return_counts=True)
    print(f'Wrote data/language-maps/{rel}: {covered.sum():,} pixels, {len(u_)} languages')


def find_fit(land, frame_land):
    """Scale and offset (frame pixels at picture size) that best match the map's
    land to the frame's: a coarse search on the working grid, then a fine one."""
    F2 = np.where(frame_land[::2, ::2], 1.0, -1.0)
    FH, FW = F2.shape
    landimg = Image.fromarray(land.astype(np.uint8) * 255)

    def at(s, F, FH, FW):
        h, w = int(round(land.shape[0] * s)), int(round(land.shape[1] * s))
        if h < 20 or w < 20 or h > FH or w > FW:
            return None
        M = np.where(np.asarray(landimg.resize((w, h), Image.NEAREST)) > 127, 1.0, -1.0)
        Mp = np.zeros((FH, FW)); Mp[:h, :w] = M
        corr = np.fft.irfft2(np.fft.rfft2(F) * np.conj(np.fft.rfft2(Mp)), s=(FH, FW))
        corr[FH - h + 1:, :] = -1e9
        k = int(np.argmax(corr))
        dy, dx = divmod(k, FW)
        return corr.flat[k] / (h * w), dx, dy
    best = None
    for s in np.arange(0.05, 1.0, 0.01):
        r = at(s, F2, FH, FW)
        if r and (best is None or r[0] > best[0][0]):
            best = (r, s)
    s0 = best[1]
    for s in np.arange(s0 - 0.012, s0 + 0.012, 0.0005):
        r = at(s, F2, FH, FW)
        if r and r[0] > best[0][0]:
            best = (r, s)
    (agree, dx, dy), s = best
    # at picture size, a last fine pass around it
    F = np.where(frame_land, 1.0, -1.0)
    s_hi, best_hi = 2 * s, None
    for s2 in np.arange(s_hi - 0.004, s_hi + 0.004, 0.0005):
        r = at(s2, F, *F.shape)
        if r and (best_hi is None or r[0] > best_hi[0][0]):
            best_hi = (r, s2)
    (agree, dx, dy), s2 = best_hi
    return {'scale': float(s2), 'x': int(dx), 'y': int(dy), 'agreement': float((agree + 1) / 2)}


if __name__ == '__main__':
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    main(sys.argv[1])
