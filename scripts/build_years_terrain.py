"""
Travel over the land, for the yearly language maps (DJ, 19 Oct 2026: "too
many circles, most of the history is an estimation of what it looked like,
but still seeing languages spread from a dot is too fake").

Where the maps have to guess (which places took up a language first, between
two of DJ's keyframes; where each old dialect was spoken, and in what order
its standard replaced it), the guess was made by straight-line distance from
a point: every front was a ring and every region a disc. Languages spread the
way people travel: along valleys, rivers and coasts, through farmland and
towns, slowly over mountains and through deserts, and last of all into the
remote hills, where the holdouts survive (Breton, Basque, the Alpine dialects).
So distances here are travel distances over DJ's own geography, in the same
frame as his maps:

    topography  the V3 mod's paint/topography.png: eight bands of height
    climate     its paint/climate.png: DJ's Koppen map (deserts, ice, jungle)
    rivers      its paint/rivers.png: the visible "Rivers" layer of his river map
    people      the andah-atlas's data/density_grid.png: people per cell in 1765

Any map that is missing counts as level, temperate, dry and evenly peopled, so
the scripts still run without them (and fall back to plain distance).

    cost()             what crossing one working-grid pixel costs (H x W)
    towns()            0..1 how townish each pixel is (its people per km2, ranked)
    reach(src, box)    travel distance from the pixels src, within a box
    land()             where the land is (working grid)
    rough()            unevenness at several scales, for borders the app guesses outright
    warped(labels, m)  labels read a little way off, so a guessed border meanders
"""

import os

import numpy as np

import importlib.util
_spec = importlib.util.spec_from_file_location('by', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'build-years.py'))
by = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(by)

W, H = by.W, by.H
CACHE = by.CACHE
HOME = os.path.expanduser('~')
MOD_PAINT = os.environ.get('ANDAH_MOD_PAINT', os.path.join(HOME, 'Documents', 'Paradox Interactive', 'Victoria 3', 'mod', 'Andah Tester', 'paint'))
DENSITY = os.environ.get('ANDAH_DENSITY', os.path.join(HOME, 'Documents', 'andah-atlas', 'data', 'density_grid.png'))

# the topography's bands, lowest first (the V3 tools' _arable.BAND_FACTOR order), and what crossing each costs
BANDS = [(1, 116, 118), (58, 142, 134), (116, 169, 150), (173, 195, 165), (230, 221, 181), (195, 151, 126), (159, 84, 73), (255, 255, 255)]
BAND_COST = [1.0, 1.0, 1.05, 1.15, 1.35, 1.9, 3.2, 6.0]
# Koppen colours that slow travel: deserts, steppe, rainforest, the coldest forest, tundra, ice
CLIMATE_COST = {(255, 0, 0): 2.5, (255, 150, 150): 2.5, (245, 165, 0): 1.3, (255, 220, 100): 1.3, (0, 0, 255): 1.6,
                (0, 69, 94): 1.6, (50, 0, 135): 1.6, (150, 100, 150): 1.6, (178, 178, 178): 2.5, (102, 102, 102): 6.0}
RIVER = 0.6        # a river valley is a road
SEA = 9.0          # the sea is crossed, but dearly: a strait, not an ocean
NOISE = 0.15       # the land is never quite even: a little low-frequency unevenness, so no two fronts run alike
ROUGH = 0.8        # how much rougher an edge the app guesses outright is (rough())
WARP = 8.0         # how far a guessed border wanders either way (working-grid pixels, ~140 km; warp())
VERSION = 2        # of the costs above: a change here remakes the cache

_C = {}


def _load():
    if 'cost' in _C:
        return
    from PIL import Image
    Image.MAX_IMAGE_PIXELS = None
    # cached beside the frames, and committed with them: a computer without DJ's maps (his laptop) uses it as it is
    path = os.path.join(CACHE, 'terrain.npz')
    stamp = [os.path.getmtime(p) if os.path.exists(p) else 0 for p in
             (os.path.join(MOD_PAINT, 'topography.png'), os.path.join(MOD_PAINT, 'climate.png'), os.path.join(MOD_PAINT, 'rivers.png'), DENSITY)]
    have = any(stamp)
    stamp.append(VERSION)
    if os.path.exists(path):
        z = np.load(path)
        if list(z['stamp']) == stamp or (not have and z['stamp'][-1] == VERSION):
            _C.update(cost=z['cost'], people=z['people'], land=z['land'])
            return
    ys = ((np.arange(H) + 0.5) / H)
    xs = ((np.arange(W) + 0.5) / W)

    def sample(img):
        a = np.asarray(img)
        h, w = a.shape[:2]
        return a[np.minimum((ys * h).astype(int), h - 1)[:, None], np.minimum((xs * w).astype(int), w - 1)[None, :]]

    cost = np.ones((H, W), dtype=np.float32)
    land = np.ones((H, W), dtype=bool)
    p = os.path.join(MOD_PAINT, 'topography.png')
    if os.path.exists(p):
        im = Image.open(p)
        pal = np.array(im.getpalette()[:768]).reshape(-1, 3) if im.mode == 'P' else None
        if pal is not None:
            lut = np.full(256, -1, dtype=np.int16)
            for i, rgb in enumerate(pal):
                if tuple(rgb) != (0, 0, 0):
                    lut[i] = int(np.argmin([np.sum((np.array(b) - rgb) ** 2) for b in BANDS]))
            band = lut[sample(im)]
            land = band >= 0
            cost = np.where(land, np.array(BAND_COST, dtype=np.float32)[np.maximum(band, 0)], SEA).astype(np.float32)
    p = os.path.join(MOD_PAINT, 'climate.png')
    if os.path.exists(p):
        c = sample(Image.open(p).convert('RGB')).astype(np.int32)
        packed = (c[..., 0] << 16) | (c[..., 1] << 8) | c[..., 2]
        for rgb, f in CLIMATE_COST.items():
            cost[(packed == ((rgb[0] << 16) | (rgb[1] << 8) | rgb[2])) & land] *= f
    p = os.path.join(MOD_PAINT, 'rivers.png')
    if os.path.exists(p):
        r = np.asarray(Image.open(p).convert('L'))
        on = r < 128 if (r > 127).mean() > 0.5 else r > 127      # the rivers are the rarer colour
        river = np.zeros((H, W), dtype=bool)
        ry, rx = np.nonzero(on)
        river[ry * H // r.shape[0], rx * W // r.shape[1]] = True
        cost[river & land] *= RIVER
    people = np.zeros((H, W), dtype=np.float32)
    if os.path.exists(DENSITY):
        from scipy import ndimage
        d = np.asarray(Image.open(DENSITY)).astype(np.float64)
        lat = 90.0 - (np.arange(d.shape[0]) + 0.5) * 180.0 / d.shape[0]
        km2 = (360.0 / d.shape[1] * 111.2) * (180.0 / d.shape[0] * 111.2) * np.cos(np.radians(lat))
        pk = d / np.maximum(km2[:, None], 1e-3)
        people = ndimage.zoom(pk, (H / d.shape[0], W / d.shape[1]), order=1)[:H, :W].astype(np.float32)
        # towns and farmland are crossed sooner than empty land
        cost *= np.where(land, np.clip(1.5 - 0.3 * np.log10(1 + people), 0.55, 1.5), 1.0).astype(np.float32)
    # a little unevenness at two scales (the land is never quite level, nor its people evenly spread),
    # so no two fronts are alike and no border runs as a smooth arc across a plain
    from scipy import ndimage
    rng = np.random.default_rng(1765)
    for k, amp in ((4, NOISE), (2, NOISE * 0.7)):
        n = ndimage.gaussian_filter(rng.standard_normal((H // k, W // k)).astype(np.float32), 3, mode='wrap')
        n = ndimage.zoom(n / (n.std() + 1e-9), k, order=1)[:H, :W]
        cost *= np.exp(amp * n).astype(np.float32)
    os.makedirs(CACHE, exist_ok=True)
    np.savez_compressed(path, cost=cost, people=people, land=land, stamp=np.array(stamp))
    _C.update(cost=cost, people=people, land=land)


def cost():
    _load()
    return _C['cost']


def land():
    """Where the land is, on the working grid (all of it without the topography)."""
    _load()
    return _C['land']


def rough():
    """A multiplier on the cost (H x W), uneven at scales from a few pixels to
    a few hundred km, for an edge the app has to guess outright (how far a
    language carried on past the cut edge of one of DJ's regional maps): with
    it the edge frays like a real one, where on even land it ran parallel to
    the line it set out from."""
    if 'rough' not in _C:
        from scipy import ndimage
        rng = np.random.default_rng(1563)
        n = np.zeros((H, W), dtype=np.float32)
        for k, amp in ((2, 0.35), (4, 0.5), (8, 0.7), (16, 0.8)):
            g = ndimage.gaussian_filter(rng.standard_normal((-(-H // k) + 1, -(-W // k) + 1)).astype(np.float32), 1.5, mode='wrap')
            n += amp * ndimage.zoom(g / (g.std() + 1e-9), k, order=1)[:H, :W]
        # never much cheaper than the land itself: rough, not a shortcut
        _C['rough'] = np.clip(np.exp(ROUGH * n / (n.std() + 1e-9)), 0.7, 4.0).astype(np.float32)
    return _C['rough']


def warp():
    """A smooth shift (dy, dx) for each working-grid pixel, in pixels: mostly
    over hundreds of km, a little over tens, so it never folds the land over."""
    if 'warp' not in _C:
        from scipy import ndimage
        rng = np.random.default_rng(1564)
        out = []
        for _ in range(2):
            n = np.zeros((H, W), dtype=np.float32)
            for k, amp in ((32, 1.0), (12, 0.6), (5, 0.3)):
                g = ndimage.gaussian_filter(rng.standard_normal((-(-H // k) + 2, -(-W // k) + 2)).astype(np.float32), 1.0, mode='wrap')
                n += amp * ndimage.zoom(g / (g.std() + 1e-9), k, order=1)[:H, :W]
            out.append((WARP * n / (n.std() + 1e-9)).astype(np.float32))
        _C['warp'] = out
    return _C['warp']


def blotches(n, box):
    """n smooth uneven fields (spread 1) over box, one per seed of a carve:
    each seed's reach a little longer here and shorter there, independently
    of its neighbours', over tens to a few hundred km."""
    from scipy import ndimage
    y0, y1, x0, x1 = box
    out = []
    for i in range(n):
        if ('blotch', i) not in _C:
            rng = np.random.default_rng(2000 + i)
            f = np.zeros((H, W), dtype=np.float32)
            for k, amp in ((16, 1.0), (8, 0.6), (4, 0.3)):
                g = ndimage.gaussian_filter(rng.standard_normal((-(-H // k) + 2, -(-W // k) + 2)).astype(np.float32), 1.0, mode='wrap')
                f += amp * ndimage.zoom(g / (g.std() + 1e-9), k, order=1)[:H, :W]
            _C[('blotch', i)] = f / (f.std() + 1e-9)
        out.append(_C[('blotch', i)][y0:y1, x0:x1])
    return out


def warped(labels, mask, box=None):
    """labels (working grid, or a box of it) read through warp(): each pixel
    of mask takes the label found a little way off. A border by travel
    distance is nearly straight on even land however rough the going (the
    cheapest path evens it out), so between two far-apart seeds an old
    dialect's border ran ruler-straight for 500 km; read this way it meanders
    like a real one. Off mask, a place reads its nearest pixel of mask."""
    from scipy import ndimage
    y0, y1, x0, x1 = box if box is not None else (0, H, 0, W)
    dy, dx = (a[y0:y1, x0:x1] for a in warp())
    h, w = labels.shape
    iy, ix = ndimage.distance_transform_edt(~mask, return_distances=False, return_indices=True)
    filled = labels[iy, ix]
    yy, xx = np.nonzero(mask)
    sy = np.clip(np.rint(yy + dy[yy, xx]).astype(np.int64), 0, h - 1)
    sx = np.rint(xx + dx[yy, xx]).astype(np.int64)
    sx = sx % w if (x0, x1) == (0, W) else np.clip(sx, 0, w - 1)
    out = labels.copy()
    out[yy, xx] = filled[sy, sx]
    return out


def towns():
    """How townish each working-grid pixel is, 0 (emptiest land) to 1 (the densest), by rank among the land."""
    _load()
    if 'towns' not in _C:
        p, land = _C['people'], _C['land']
        t = np.zeros((H, W), dtype=np.float32)
        if land.any() and p[land].max() > 0:
            v = p[land]
            order = np.argsort(v, kind='stable')
            r = np.empty(len(v), dtype=np.float32)
            r[order] = np.arange(len(v)) / max(1, len(v) - 1)
            t[land] = r
        _C['towns'] = t
    return _C['towns']


def reach(src, box=None, limit=np.inf, dear=None, nearest=False):
    """Travel distance (a level pixel at the equator is 1) from the
    working-grid pixels src (bool, H x W), within box (y0, y1, x0, x1; the
    whole map if None). dear: a box-shaped multiplier on the cost (the land
    beyond a language's own, say). -> float32 array of the box's shape, inf
    where unreached; with nearest, also each pixel's nearest source (its flat
    index in the box, negative where unreached)."""
    from scipy import sparse
    from scipy.sparse.csgraph import dijkstra
    c = cost()
    y0, y1, x0, x1 = box if box is not None else (0, H, 0, W)
    cb = c[y0:y1, x0:x1]
    if dear is not None:
        cb = cb * dear
    sb = np.asarray(src)[y0:y1, x0:x1]
    h, w = cb.shape
    if not sb.any():
        far = np.full((h, w), np.inf, dtype=np.float32)
        return (far, np.full((h, w), -1, dtype=np.int64)) if nearest else far
    lat = 90.0 - (np.arange(y0, y1) + 0.5) * 180.0 / H
    cl = np.cos(np.radians(lat)).astype(np.float32)[:, None]
    idx = np.arange(h * w).reshape(h, w)
    rows, cols, wts = [], [], []

    def link(a, b, dx, dy):
        # a step east is shorter towards the poles (the map is equirectangular); north and south are not
        step = np.sqrt((dx * cl[a[0]]) ** 2 + dy ** 2) * np.ones_like(cb[a])
        rows.append(idx[a].ravel()); cols.append(idx[b].ravel()); wts.append((0.5 * (cb[a] + cb[b]) * step).ravel())
    link((slice(None), slice(0, w - 1)), (slice(None), slice(1, w)), 1, 0)
    link((slice(0, h - 1), slice(None)), (slice(1, h), slice(None)), 0, 1)
    link((slice(0, h - 1), slice(0, w - 1)), (slice(1, h), slice(1, w)), 1, 1)
    link((slice(0, h - 1), slice(1, w)), (slice(1, h), slice(0, w - 1)), 1, 1)
    if x0 == 0 and x1 == W:   # the world wraps east to west
        link((slice(None), slice(w - 1, w)), (slice(None), slice(0, 1)), 1, 0)
    G = sparse.csr_matrix((np.concatenate(wts), (np.concatenate(rows), np.concatenate(cols))), shape=(h * w, h * w))
    if nearest:
        d, _, s = dijkstra(G, directed=False, indices=np.nonzero(sb.ravel())[0], min_only=True, limit=limit,
                           return_predecessors=True)
        return np.asarray(d, dtype=np.float32).reshape(h, w), np.asarray(s, dtype=np.int64).reshape(h, w)
    d = dijkstra(G, directed=False, indices=np.nonzero(sb.ravel())[0], min_only=True, limit=limit)
    return np.asarray(d, dtype=np.float32).reshape(h, w)


def box_around(mask, margin=40):
    """The working-grid box (y0, y1, x0, x1) around a mask, with a margin; the
    whole width where it touches both edges (it wraps)."""
    ys, xs = np.nonzero(mask)
    if not len(ys):
        return (0, H, 0, W)
    y0, y1 = max(0, ys.min() - margin), min(H, ys.max() + 1 + margin)
    x0, x1 = xs.min() - margin, xs.max() + 1 + margin
    if x0 < 0 or x1 > W or (x1 - x0) > W * 0.6:
        return (y0, y1, 0, W)
    return (y0, y1, x0, x1)


def carve(land, seeds, want, rough_land=False):
    """Share the working-grid pixels land (bool, H x W) between seeds [(x, y)
    on the working grid] in the shares want: each pixel to the seed nearest
    by travel over that land (the land beyond it dearly, the sea more so),
    balanced as a weighted diagram so each seed gets its due. Mountains,
    deserts and empty land become the borders, where straight-line distance
    drew discs round points. rough_land: over the land made rough (rough()),
    for borders that are guesses (an old dialect's): over even steppe a
    border between two seeds ran ruler-straight for 1,000 km. -> (owner per
    land pixel, in mask order; travel distances from each seed, n_pixels x
    n_seeds)."""
    box = box_around(land, margin=6)
    y0, y1, x0, x1 = box
    lw = land[y0:y1, x0:x1]
    dear = np.where(lw, 1.0, 4.0).astype(np.float32)
    if rough_land:
        dear = dear * rough()[y0:y1, x0:x1]
    ly, lx = np.nonzero(lw)
    D = []
    for sx, sy in seeds:
        j = int(np.argmin((lx + x0 - sx) ** 2 + (ly + y0 - sy) ** 2))      # the seed's nearest pixel of the land
        src = np.zeros((H, W), dtype=bool)
        src[ly[j] + y0, lx[j] + x0] = True
        D.append(reach(src, box, dear=dear)[lw])
    D = np.stack(D, axis=1).astype(np.float64)
    fin = np.isfinite(D)
    D[~fin] = (D[fin].max() if fin.any() else 1.0) * 2
    if rough_land:
        # and each seed's reach longer here and shorter there, independently of the others': rough
        # going alone evens out over long distances, and two far-apart seeds still met in a straight line
        amp = 0.3 * float(np.median(D))
        for i, b in enumerate(blotches(len(seeds), box)):
            D[:, i] += amp * b[lw]
    want = np.asarray(want, dtype=np.float64)
    want = want / want.sum()
    step = float(np.median(D)) or 1.0
    w = np.zeros(len(seeds))
    keep, err = None, np.inf
    for it in range(150):
        best = np.argmin(D - w, axis=1)
        size = np.bincount(best, minlength=len(seeds)) / len(best)
        e = float(np.abs(want - size).sum())
        if e < err:
            keep, err = best, e
        w += step * (want - size) * (0.8 if it < 75 else 0.25)
    return keep, D


def rank_by(values):
    """Ranks 0 (smallest) to 1 (largest), ties in order."""
    order = np.argsort(values, kind='stable')
    r = np.empty(len(values), dtype=np.float32)
    r[order] = np.arange(len(values)) / max(1, len(values) - 1)
    return r


def front_rank(src, grp, town_weight=0.35):
    """The order the places grp (working grid, bool) take up a language spoken
    at src: by travel distance from its speakers, towns sooner (a language
    reaches the towns along the roads before the countryside between them),
    by rank 0 (first) to 1 (last). Over the land made rough (rough()): the
    order is a guess, and over even land the front ran in smooth rings round
    the speakers. -> float32 per pixel of grp (in mask order)."""
    if not grp.any():
        return np.zeros(0, dtype=np.float32)
    box = box_around(grp | src)
    y0, y1, x0, x1 = box
    d = reach(src, box, dear=rough()[y0:y1, x0:x1])
    g = grp[y0:y1, x0:x1]
    dist = d[g]
    if not np.isfinite(dist).any():
        dist = np.zeros(len(dist), dtype=np.float32)
    dist = np.where(np.isfinite(dist), dist, np.nanmax(np.where(np.isfinite(dist), dist, np.nan)) * 1.2)
    t = towns()[y0:y1, x0:x1][g]
    # read a little way off, so the fronts meander rather than run as smooth rings
    r = np.zeros(g.shape, dtype=np.float32)
    r[g] = dist * (1.0 - town_weight * t)
    return rank_by(warped(r, g, box)[g])
