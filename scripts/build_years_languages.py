"""
Stage 2 of scripts/build-years.py: which language every pixel speaks in every
frame, the borders between languages over time, and where the map and the
tree disagree. Fast (about a minute): rerun after any change to
data/history/civs.json, a keyframe in data/language-maps/, or the chart.

frames.json areas: code -> [pixels, label x, label y, room (pixels from the
label to the area's edge), km2].

Codes in lang/<year>.png (R*65536 + G*256 + B):
    0 sea, 1 no people, 2 Homo sapiens, 3 Advanced Culture, 4 Embryonic
    Civilisation (the greys: peoples whose languages are lost)
    1000 + i      language i of langs.json
    100000 + j    civilisation j of civs.json that has no language yet
"""

import colorsys
import json
import math
import os
import re
from difflib import SequenceMatcher

import numpy as np
from PIL import Image

import importlib.util
_spec = importlib.util.spec_from_file_location('by', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'build-years.py'))
by = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(by)

ROOT, CACHE, HISTORY, KEYFRAMES = by.ROOT, by.CACHE, by.HISTORY, by.KEYFRAMES
W, H, STEP = by.W, by.H, by.STEP
SPECIAL = {by.SEA: 0, by.EMPTY: 1, by.SAPIENS: 2, by.ADVANCED: 3, by.EMBRYONIC: 4}
LANG0, CIV0 = 1000, 100000
KM_PER_DEG = 111.2
MAX_SEA_KM = 800


def packed(rgb):
    return (rgb[0] << 16) | (rgb[1] << 8) | rgb[2]


def hex_to_rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


# --- the chart ------------------------------------------------------------------

class Tree:
    def __init__(self, doc):
        self.doc = doc
        self.by_id = {l['id']: l for l in doc['languages']}
        self.kids = {}
        for l in doc['languages']:
            if l.get('parentId'):
                self.kids.setdefault(l['parentId'], []).append(l['id'])
        fam_by_root = {f.get('rootId'): f['name'] for f in doc.get('families', []) if f.get('rootId')}
        self._w = {}
        self._at = {}
        self.family = {}
        for l in doc['languages']:
            r = self.root(l['id'])
            self.family[l['id']] = fam_by_root.get(r, self.by_id[r]['name'])

    def root(self, i):
        seen = 0
        while self.by_id[i].get('parentId') in self.by_id and seen < 500:
            i = self.by_id[i]['parentId']
            seen += 1
        return i

    def end(self, i):
        """When a language stops being spoken as itself: its death, or, for an
        ancestor that lives on in its daughters (the chart leaves those
        undated), the birth of its last daughter."""
        l = self.by_id[i]
        if l.get('died') is not None:
            return l['died']
        ks = [self.by_id[k].get('born') for k in self.kids.get(i, []) if self.by_id[k].get('born') is not None]
        return max(ks) if ks else None

    def alive(self, i, year):
        l = self.by_id[i]
        return (l.get('born') is None or l['born'] <= year) and (l.get('died') is None or year < l['died'])

    def weight(self, i):
        """How much a line still speaks: native speakers of its living
        languages, or failing figures, how many there are."""
        if i in self._w:
            return self._w[i]
        l = self.by_id[i]
        ks = self.kids.get(i, [])
        if not ks:
            w = 0 if l.get('died') is not None else 1 + ((l.get('speakers') or {}).get('l1') or 0)
        else:
            w = sum(self.weight(k) for k in ks)
        self._w[i] = w
        return w

    def at(self, i, year):
        """The language of i's line spoken in a year. Before i was born, the
        ancestor alive then; after i has split into daughters, the main line:
        the daughter that keeps the name (Old Dahen -> Middle Dahen -> Dahen),
        else the one most people speak today."""
        key = (i, year)
        if key in self._at:
            return self._at[key]
        names = stems(self.by_id[i]['name'])
        cur = i
        while (self.by_id[cur].get('born') or -1e9) > year and self.by_id[cur].get('parentId') in self.by_id:
            cur = self.by_id[cur]['parentId']
        while True:
            e = self.end(cur)
            ks = [k for k in self.kids.get(cur, []) if (self.by_id[k].get('born') or -1e9) <= year]
            if e is None or year < e or not ks or self.by_id[cur].get('died') is not None:
                self._at[key] = cur
                return cur
            cur = max(ks, key=lambda k: (bool(stems(self.by_id[k]['name']) & names), self.weight(k)))


# --- civilisation -> language, by name --------------------------------------------

PREFIXES = ('proto', 'old', 'middle', 'classical', 'early', 'late', 'modern', 'new', 'archaic', 'common', 'ancient')
SUFFIXES = ('ians', 'ans', 'ites', 'ite', 'ese', 'ish', 'ian', 'an', 'ic', 'i', 's', 'n', 'e')


def stems(name):
    words = re.sub(r'[^a-z ]', '', (name or '').lower()).split()
    while words and words[0] in PREFIXES:
        words = words[1:]
    w = ''.join(words)
    out = {w}
    for s in SUFFIXES:
        if w.endswith(s) and len(w) - len(s) >= 3:
            out.add(w[:-len(s)])
    return out


def auto_match(civs, tree):
    """Fill civs without DJ's choice: the language whose name shares a stem
    with the civilisation's, preferring one alive during the civilisation."""
    index = {}
    for l in tree.doc['languages']:
        for n in {l['name'], l.get('canonName')} - {None}:
            for s in stems(n):
                index.setdefault(s, set()).add(l['id'])
    changed = 0
    redo = bool(os.environ.get('REMATCH'))   # REMATCH=1: match every guess again
    for key, c in civs.items():
        if c.get('how') in ('dj', 'lost') or (c.get('how') in ('auto', 'place') and c.get('lang') and not redo):
            continue
        cands = set()
        for s in stems(c['name']):
            cands |= index.get(s, set())
        if not cands:
            # OCR noise: a near-identical name.
            best, score = None, 0
            cs = max(stems(c['name']), key=len)
            for s, ids in index.items():
                r = SequenceMatcher(None, cs, s).ratio()
                if r > score:
                    best, score = ids, r
            if score >= 0.8:
                cands = set(best)
        pick = None
        if cands:
            mid = (c['from'] + c['to']) / 2
            def fit(i):
                l = tree.by_id[i]
                b = l.get('born') if l.get('born') is not None else -1e9
                d = l.get('died') if l.get('died') is not None else 1e9
                # A line lives on in its daughters (the app follows its main
                # line), so the best match is the one born nearest the
                # civilisation's first appearance that lasts through it.
                overlap = max(0, min(d, c['to']) - max(b, c['from']))
                return (overlap, -abs(b - c['from']))
            # The latest of a line: the app walks back to the ancestor alive in each year.
            pick = max(cands, key=fit)
        if not pick:
            if c.get('how') == 'auto':
                c['lang'], c['how'] = None, None
                changed += 1
            continue
        new_how = 'auto'
        if c.get('lang') != pick or c.get('how') != new_how:
            c['lang'], c['how'] = pick, new_how
            changed += 1
    return changed


# --- colours: a dialect continuum --------------------------------------------------

def place_match(civs, tree, legend, civ_of):
    """Civilisations no name matched: the language of the land they held, from
    DJ's 1765 countries (data/canon/country-shapes.json, which line up with
    the yearly maps) and each country's main language. A civilisation gone
    long before 1765 gets the line of the language spoken on its land in
    1765; the app walks it back to the ancestor alive in each year. A guess
    for DJ to check, marked how: "place"."""
    from PIL import ImageDraw
    shapes = by.read_json(os.path.join(ROOT, 'data', 'canon', 'country-shapes.json'), None)
    if not shapes:
        return 0
    names = list(shapes['shapes'])
    img = Image.new('I', (W, H), -1)
    d = ImageDraw.Draw(img)
    for k, n in enumerate(names):
        for part in shapes['shapes'][n]:
            d.polygon([((x + 180) / 360 * W, (90 - y) / 180 * H) for x, y in part], fill=k)
    state = np.asarray(img)
    main = {}
    for l in tree.doc['languages']:
        if l.get('kind') == 'constructed':   # Lastnu is everyone's second language, nobody's homeland
            continue
        for a in l.get('areas') or []:
            if a.get('role') in ('official', None) or a.get('role') != 'colonial':
                w = (l.get('speakers') or {}).get('l1') or 0
                cur = main.get(a['state'])
                rank = (a.get('role') == 'official', w)
                if not cur or rank > cur[0]:
                    main[a['state']] = (rank, l['id'])
    changed = 0
    redo = bool(os.environ.get('REMATCH'))
    for key, c in civs.items():
        if c.get('how') in ('dj', 'lost', 'auto') or (c.get('how') == 'place' and c.get('lang') and not redo):
            continue
        votes = {}
        for y in sorted({c['from'], (c['from'] + c['to']) // 2 // 5 * 5, c['to']}):
            ys = str(min((int(z) for z in legend), key=lambda z: abs(z - y)))
            if civ_of.get(ys, {}).get(c['rgb']) != key:
                continue
            col = by.pack(np.asarray(Image.open(os.path.join(CACHE, 'col', f'{ys}.png')).convert('RGB')))
            m = col == packed(hex_to_rgb(c['rgb']))
            st, n = np.unique(state[m], return_counts=True)
            for k, cnt in zip(st, n):
                if k >= 0 and names[k] in main:
                    lid = main[names[k]][1]
                    votes[lid] = votes.get(lid, 0) + int(cnt)
        pick = max(votes, key=votes.get) if votes else None
        how = 'place' if pick else None
        if c.get('lang') != pick or c.get('how') != how:
            c['lang'], c['how'] = pick, how
            changed += 1
    return changed


def continuum_colours(tree, family_neighbours):
    """Related languages get related colours; families that touch get hues far
    apart; families that never meet may share a hue (DJ: "two languages across
    the other side of the globe can both be red")."""
    fams = sorted(set(tree.family.values()))
    order = sorted(fams, key=lambda f: -len(family_neighbours.get(f, ())))
    hue = {}
    for f in order:
        taken = [hue[n] for n in family_neighbours.get(f, ()) if n in hue]
        used = list(hue.values())
        best, score = 0, -1
        for h in range(0, 360, 6):
            near = min((min(abs(h - t), 360 - abs(h - t)) for t in taken), default=180)
            crowd = sum(1 for t in used if min(abs(h - t), 360 - abs(h - t)) < 20)
            s = near * 10 - crowd * 25
            if s > score:
                best, score = h, s
        hue[f] = best
    colours = {}
    roots = [l['id'] for l in tree.doc['languages'] if l.get('parentId') not in tree.by_id]
    for r in roots:
        fam = tree.family[r]
        leaves = []
        def walk(i, depth):
            ks = sorted(tree.kids.get(i, []), key=lambda k: tree.by_id[k].get('born') or 0)
            if not ks:
                leaves.append(i)
            for k in ks:
                walk(k, depth + 1)
        walk(r, 0)
        span = min(70, 6 * max(1, len(leaves) - 1))
        pos = {leaf: (k / max(1, len(leaves) - 1) - 0.5) for k, leaf in enumerate(leaves)}
        def hue_of(i):
            if i in pos:
                return pos[i]
            ks = tree.kids.get(i, [])
            return sum(hue_of(k) for k in ks) / len(ks) if ks else 0
        def paint(i, depth):
            h = (hue[fam] + span * hue_of(i)) % 360
            leaf = i in pos
            light = (0.50 + 0.07 * ((hash(i) % 3) - 1)) if leaf else max(0.30, 0.46 - 0.03 * depth)
            sat = 0.62 if leaf else 0.45
            if fam == 'Lastnu':
                sat, light = 0.08, 0.55
            rr, gg, bb = colorsys.hls_to_rgb(h / 360, light, sat)
            colours[i] = '#%02x%02x%02x' % (round(rr * 255), round(gg * 255), round(bb * 255))
            for k in tree.kids.get(i, []):
                paint(k, depth + 1)
        paint(r, 0)
    return colours, hue


def key_colours(tree, display, civ_rgbs):
    """Paint colours for the keyframes: one per language, NEVER changed once
    given (DJ's painted maps depend on them), unique, and unlike any map colour."""
    path = os.path.join(KEYFRAMES, 'key.json')
    key = by.read_json(path, {}).get('languages', {})
    taken = set(key.values()) | {by.hexof(c) for c in by.NOT_CIVS} | set(civ_rgbs)
    for l in tree.doc['languages']:
        if l['id'] in key:
            continue
        r, g, b = hex_to_rgb(display.get(l['id'], '#808080'))
        k = 0
        while by.hexof((r, g, b)) in taken:
            k += 1
            r, g, b = (r + 3 * k) % 256, (g + 7 * k) % 256, (b + 5 * k) % 256
        key[l['id']] = by.hexof((r, g, b))
        taken.add(key[l['id']])
    by.write_json(path, {
        '_readme': 'Paint colours for language keyframes: one per language id. Never changed once given, so painted maps stay readable. '
                   'Paint a language with exactly its colour; any other colour is read as unpainted (the civilisation decides).',
        'languages': key,
    }, indent=1)
    return key


# --- geometry -----------------------------------------------------------------------

def lonlat(xs, ys):
    return xs * (360.0 / W) - 180.0 + 180.0 / W, 90.0 - ys * (180.0 / H) - 90.0 / H


def unit(xs, ys):
    lon, lat = lonlat(xs.astype(float), ys.astype(float))
    lo, la = np.radians(lon), np.radians(lat)
    return np.stack([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)], axis=1)


def chord_to_km(c):
    return 2 * 6371.0 * np.arcsin(np.clip(c / 2, 0, 1))


# --- one frame ------------------------------------------------------------------------

def resolve(col, kf, colour_code):
    """Codes for one frame from its colour raster (packed ints).
    colour_code: packed colour -> code without keyframes (every colour in the
    frame is a key). kf: None, or (k_col, k_lang, dominant): the keyframe's
    colour raster, its painted language codes (-1 unpainted), and per colour
    the language the keyframe mostly gave that civilisation.

    A frame has under a hundred colours, so a sorted lookup replaces np.unique
    over two million pixels (the slow part)."""
    u = np.array(sorted(colour_code), dtype=np.int64)
    inv = np.searchsorted(u, col)
    base = np.array([colour_code[int(c)] for c in u], dtype=np.int64)
    if kf is not None:
        k_col, k_lang, dominant = kf
        follow = np.array([dominant.get(int(c), -1) for c in u], dtype=np.int64)
        base = np.where(follow >= 0, follow, base)
    out = base[inv]
    if kf is not None:
        same = (col == k_col) & (k_lang >= 0)
        out = np.where(same, k_lang, out)
    return out


def read_keyframes(tree, key, code_of_lang):
    """data/language-maps/<year> AFA.png: DJ's painted language maps."""
    found = {}
    if not os.path.isdir(KEYFRAMES):
        return found
    lang_of_key = {packed(hex_to_rgb(h)): i for i, h in key.items()}
    for f in os.listdir(KEYFRAMES):
        y = by.year_of(f)
        if y is None or not f.lower().endswith('.png'):
            continue
        rgb = np.asarray(Image.open(os.path.join(KEYFRAMES, f)).convert('RGB'))
        small = rgb[STEP // 2::STEP, STEP // 2::STEP][:H, :W]
        p = by.pack(small).astype(np.int64)
        u, inv, cnt = np.unique(p, return_inverse=True, return_counts=True)
        codes = np.array([code_of_lang.get(lang_of_key.get(int(c)), -1) for c in u], dtype=np.int64)
        unknown = [{'rgb': by.hexof(by.unpack(int(c))), 'px': int(n)} for c, n, code in zip(u, cnt, codes)
                   if code < 0 and by.unpack(int(c)) not in by.NOT_CIVS and n >= 20 and int(c) not in lang_of_key]
        found[y] = {'file': f, 'lang': codes[inv].reshape(p.shape), 'unknown': unknown,
                    'painted': int((codes[inv] >= 0).sum())}
    return dict(sorted(found.items()))


# --- one frame, in a worker process ------------------------------------------------------

_G = {}


def _init(ctx):
    _G.update(ctx)
    lat = 90.0 - (np.arange(H) + 0.5) * 180.0 / H
    row_km2 = (360.0 / W * KM_PER_DEG) * (180.0 / H * KM_PER_DEG) * np.cos(np.radians(lat))
    _G['area_w'] = np.repeat(row_km2, W)


def col_of(year):
    return by.pack(np.asarray(Image.open(os.path.join(CACHE, 'col', f'{year}.png')).convert('RGB'))).astype(np.int64)


def _frame(year):
    from scipy import ndimage
    from scipy.spatial import cKDTree
    col = col_of(year)
    ky = max([z for z in _G['kf_years'] if z <= year], default=None)
    kf = _G['keyframes'][ky] if ky is not None else None
    cc = _G['cc'][year]
    codes = resolve(col, kf, cc)
    img = np.stack([(codes >> 16) & 255, (codes >> 8) & 255, codes & 255], axis=-1).astype(np.uint8)
    Image.fromarray(img).save(os.path.join(CACHE, 'lang', f'{year}.png'), compress_level=6)

    # Each area's size (km², by latitude) and where to write its name: the
    # point deepest inside it (farthest from any other area), which is
    # inside even a ring-shaped or scattered language, unlike a centroid.
    u = np.unique(np.concatenate([np.array(list(cc.values()), dtype=np.int64)] +
                                 ([np.unique(kf[1])] if kf is not None else [])))
    inv = np.searchsorted(u, codes).ravel()
    cnt = np.bincount(inv, minlength=len(u))
    km2 = np.bincount(inv, weights=_G['area_w'], minlength=len(u))
    # (on a half-size copy: four times quicker, and a name needs no finer place)
    half = codes[::2, ::2]
    edge = np.zeros(half.shape, dtype=bool)
    edge[:, 1:] |= half[:, 1:] != half[:, :-1]
    edge[:, :-1] |= half[:, :-1] != half[:, 1:]
    edge[1:, :] |= half[1:, :] != half[:-1, :]
    edge[:-1, :] |= half[:-1, :] != half[1:, :]
    depth = ndimage.distance_transform_edt(~edge)
    in_half = set(np.unique(half).tolist())
    want = [int(c) for c, n in zip(u, cnt) if c >= LANG0 and n]
    big = [c for c in want if c in in_half]
    poles = dict(zip(big, ndimage.maximum_position(depth, labels=half, index=big))) if big else {}
    rooms = dict(zip(big, np.atleast_1d(ndimage.maximum(depth, labels=half, index=big)))) if big else {}
    for c in want:
        if c not in poles:   # too small to survive halving: any pixel of it
            k = int(np.argmax(codes.ravel() == c))
            poles[c], rooms[c] = (k // W // 2, k % W // 2), 0.5
    stats = {}
    where = {int(c): k for k, c in enumerate(u)}
    for c in want:
        k = where[c]
        py, px_ = poles[c]
        stats[c] = [int(cnt[k]), int(px_) * 2 + 1, int(py) * 2 + 1, round(float(rooms[c]) * 2, 1), int(km2[k])]
    frame = {'keyframe': ky, 'areas': stats}
    borders, seas = {}, {}

    # land borders between languages
    for a, b in ((codes[:, :-1], codes[:, 1:]), (codes[:-1, :], codes[1:, :])):
        m = (a != b) & (a >= LANG0) & (b >= LANG0) & (a < CIV0) & (b < CIV0)
        if m.any():
            lo, hi = np.minimum(a[m], b[m]), np.maximum(a[m], b[m])
            pr, n = np.unique(lo * 10_000_000 + hi, return_counts=True)
            for p, k in zip(pr, n):
                key2 = (int(p // 10_000_000), int(p % 10_000_000))
                borders[key2] = borders.get(key2, 0) + int(k)

    # across water: coasts within MAX_SEA_KM, for pairs with no land border
    sea = codes == 0
    coast = np.zeros_like(sea)
    coast[:, :-1] |= sea[:, 1:]
    coast[:, 1:] |= sea[:, :-1]
    coast[:-1, :] |= sea[1:, :]
    coast[1:, :] |= sea[:-1, :]
    coast &= (codes >= LANG0) & (codes < CIV0)
    cy, cx = np.nonzero(coast)
    if len(cy):
        cc = codes[cy, cx]
        pts = unit(cx, cy)
        trees = {}
        for c in np.unique(cc):
            sel = cc == c
            trees[int(c)] = (cKDTree(pts[sel]), pts[sel])
        keys = list(trees)
        r = 2 * math.sin(MAX_SEA_KM / 6371.0 / 2)
        for i, a in enumerate(keys):
            ta, pa = trees[a]
            for b in keys[i + 1:]:
                if (min(a, b), max(a, b)) in borders:
                    continue
                tb, pb = trees[b]
                small, big = (pa, tb) if len(pa) < len(pb) else (pb, ta)
                d, _ = big.query(small, k=1, distance_upper_bound=r)
                dm = float(np.min(d))
                if math.isfinite(dm):
                    seas[(min(a, b), max(a, b))] = round(float(chord_to_km(dm)))
    return year, frame, borders, seas


def run():
    doc = by.read_json(os.path.join(ROOT, 'data', 'languages.json'), None)
    tree = Tree(doc)
    legend = by.read_json(os.path.join(CACHE, 'legend.json'), {})
    if not legend:
        raise SystemExit('No frames yet: run  python scripts/build-years.py frames')
    civ_path = os.path.join(HISTORY, 'civs.json')
    civ_doc = by.read_json(civ_path, {'civs': {}})
    civs = civ_doc['civs']
    changed = auto_match(civs, tree)
    legend_ = by.read_json(os.path.join(CACHE, 'legend.json'), {})
    changed += place_match(civs, tree, legend_, by.read_json(os.path.join(CACHE, 'civ_of.json'), {}))
    if changed:
        by.write_json(civ_path, civ_doc, indent=1)
    years = sorted(int(y) for y in legend)
    if os.environ.get('YEARS_ONLY'):   # for testing: a few frames
        lo, hi = (int(v) for v in os.environ['YEARS_ONLY'].split(':'))
        years = [y for y in years if lo <= y <= hi]
    lang_ids = [l['id'] for l in doc['languages']]
    code_of_lang = {i: LANG0 + k for k, i in enumerate(lang_ids)}
    civ_keys = list(civs)
    civ_code = {k: CIV0 + j for j, k in enumerate(civ_keys)}

    # colour -> civilisation in each year, as stage 1 read the legends
    civ_of = by.read_json(os.path.join(CACHE, 'civ_of.json'), {})

    def colour_codes(year):
        e = legend[str(year)]
        m = civ_of.get(str(year), {})
        out = {}
        for rgb in e['colours']:
            p = packed(hex_to_rgb(rgb))
            sp = by.special_of(rgb)
            if sp:
                out[p] = SPECIAL.get(sp, 0)
                continue
            k = m.get(rgb)
            if not k or k not in civs:
                out[p] = 0
                continue
            lang = civs[k].get('lang')
            if civs[k].get('how') == 'lost':
                out[p] = 3
            elif not lang or lang not in tree.by_id:
                out[p] = civ_code[k]
            else:
                out[p] = code_of_lang[tree.at(lang, year)]
        return out

    def col_of(year):
        return by.pack(np.asarray(Image.open(os.path.join(CACHE, 'col', f'{year}.png')).convert('RGB'))).astype(np.int64)

    # Keyframes, each with what its civilisations mostly spoke.
    key = by.read_json(os.path.join(KEYFRAMES, 'key.json'), {}).get('languages', {})
    keyframes = read_keyframes(tree, key, code_of_lang)
    for y, k in keyframes.items():
        fy = max([z for z in years if z <= y], default=years[0])
        k['col'] = col_of(fy)
        dom = {}
        flat_c, flat_l = k['col'].ravel(), k['lang'].ravel()
        m = flat_l >= 0
        if m.any():
            pairs, n = np.unique(np.stack([flat_c[m], flat_l[m]]), axis=1, return_counts=True)
            best = {}
            for (c, l), cnt in zip(pairs.T, n):
                if cnt > best.get(int(c), (0, -1))[0]:
                    best[int(c)] = (cnt, int(l))
            dom = {c: l for c, (cnt, l) in best.items()}
        k['dominant'] = dom

    os.makedirs(os.path.join(CACHE, 'lang'), exist_ok=True)
    frames = {}
    borders = {}      # (a, b) -> {year: border px}
    seas = {}         # (a, b) -> {year: km}
    presence = {}     # code -> [years]
    kf_years = sorted(keyframes)
    ctx = {'cc': {y: colour_codes(y) for y in years}, 'kf_years': kf_years,
           'keyframes': {y: (k['col'], k['lang'], k['dominant']) for y, k in keyframes.items()}}
    from concurrent.futures import ProcessPoolExecutor
    jobs = int(os.environ.get('YEARS_JOBS', '4'))
    with ProcessPoolExecutor(max_workers=jobs, initializer=_init, initargs=(ctx,)) as ex:
        for year, frame, b_, s_ in ex.map(_frame, years, chunksize=8):
            frames[year] = frame
            for c in frame['areas']:
                if int(c) < CIV0:
                    presence.setdefault(int(c), []).append(year)
            for k, v in b_.items():
                borders.setdefault(k, {})[year] = v
            for k, v in s_.items():
                seas.setdefault(k, {})[year] = v
    # --- contacts: runs of years ---------------------------------------------
    def runs(ys):
        out, start, prev = [], None, None
        for y in ys:
            i = years.index(y)
            if start is None:
                start = prev = y
            elif years.index(prev) + 2 >= i:   # a one-frame gap does not break a contact
                prev = y
            else:
                out.append((start, prev))
                start = prev = y
        if start is not None:
            out.append((start, prev))
        return out

    lang_of = {v: k for k, v in code_of_lang.items()}
    km_per_px = 360.0 / W * KM_PER_DEG
    existing = set()
    for b in doc.get('borrowings', []):
        existing.add((b.get('fromId'), b.get('toId')))
        existing.add((b.get('toId'), b.get('fromId')))
    contacts = []
    for kind, table in (('land', borders), ('sea', seas)):
        for (a, b), per_year in table.items():
            ys = sorted(per_year)
            for f, t in runs(ys):
                inside = [y for y in ys if f <= y <= t]
                ia, ib = lang_of[a], lang_of[b]
                item = {'a': ia, 'b': ib, 'kind': kind, 'from': f, 'to': t, 'frames': len(inside)}
                if kind == 'land':
                    item['borderKm'] = round(max(per_year[y] for y in inside) * km_per_px)
                else:
                    item['km'] = min(per_year[y] for y in inside)
                item['exists'] = (ia, ib) in existing
                item['sameFamily'] = tree.family[ia] == tree.family[ib]
                contacts.append(item)
    contacts.sort(key=lambda c: (c['from'], c['a'], c['b']))

    # --- colours ---------------------------------------------------------------
    fam_nb = {}
    for c in contacts:
        fa, fb = tree.family[c['a']], tree.family[c['b']]
        if fa != fb and (c['kind'] == 'land' or c.get('km', 1e9) < 300):
            fam_nb.setdefault(fa, set()).add(fb)
            fam_nb.setdefault(fb, set()).add(fa)
    display, fam_hue = continuum_colours(tree, fam_nb)
    civ_rgbs = {c['rgb'] for c in civs.values()}
    key = key_colours(tree, display, civ_rgbs)

    langs = {str(code_of_lang[i]): {'id': i, 'name': tree.by_id[i]['name'], 'family': tree.family[i],
                                    'color': display.get(i, '#888888'), 'key': key.get(i)} for i in lang_ids}
    civ_list = {str(civ_code[k]): {'key': k, 'name': c['name'], 'rgb': c['rgb']} for k, c in civs.items()}

    # --- clashes: map against tree -------------------------------------------------
    clashes = []
    for code, ys in presence.items():
        i = lang_of[code]
        l = tree.by_id[i]
        born, died = l.get('born'), l.get('died')
        first, last = ys[0], ys[-1]
        if born is not None and first < born - 50:
            clashes.append({'id': i, 'name': l['name'], 'kind': 'map-before-birth', 'map': first, 'tree': born,
                            'note': f'on the map from {by.label(first)}, born on the tree {by.label(born)}'})
        if died is not None and last > died + 50:
            clashes.append({'id': i, 'name': l['name'], 'kind': 'map-after-death', 'map': last, 'tree': died,
                            'note': f'on the map until {by.label(last)}, dies on the tree {by.label(died)}'})
    on_map = {lang_of[c] for c in presence}
    for l in doc['languages']:
        if l['id'] not in on_map and not tree.kids.get(l['id']) and l.get('died') is None and l.get('kind') != 'constructed':
            clashes.append({'id': l['id'], 'name': l['name'], 'kind': 'never-on-map', 'note': 'living on the tree, but no civilisation on any map speaks it'})

    meta = {'years': years, 'size': [W, H], 'lang0': LANG0, 'civ0': CIV0,
            'special': {'0': 'sea', '1': 'no people', '2': 'Homo sapiens', '3': 'Advanced Culture (language lost)', '4': 'Embryonic Civilisation (language lost)'},
            'keyframes': {str(y): {'file': k['file'], 'painted': k['painted'], 'unknown': k['unknown']} for y, k in keyframes.items()},
            'familyHue': fam_hue, 'built': __import__('datetime').datetime.now().isoformat(timespec='seconds')}
    by.write_json(os.path.join(CACHE, 'frames.json'), {'meta': meta, 'langs': langs, 'civs': civ_list,
                                                         'frames': {str(y): f for y, f in frames.items()}})
    by.write_json(os.path.join(CACHE, 'contacts.json'), {'contacts': contacts})
    by.write_json(os.path.join(CACHE, 'clashes.json'), {'clashes': clashes})
    assigned = sum(1 for c in civs.values() if c.get('lang'))
    print(f'{len(years)} frames; {assigned}/{len(civs)} civilisations have a language ({changed} matched now); '
          f'{len(contacts)} contacts ({sum(c["kind"] == "land" for c in contacts)} land); {len(clashes)} date clashes; '
          f'{len(keyframes)} keyframes.')


# --- starter keyframes ------------------------------------------------------------------

def starter(year, src):
    """A full-size language map for one year, to open in Paint.NET: every
    civilisation in its language's paint colour, borders, sea and greys as DJ
    drew them. Saved as data/language-maps/<year>.png."""
    srcs = by.sources(src)
    if year not in srcs:
        raise SystemExit(f'No map for {by.label(year)}.')
    frame = by.read_json(os.path.join(CACHE, 'frames.json'), None)
    if not frame or str(year) not in frame['frames']:
        raise SystemExit('Run the languages stage first.')
    langs = frame['langs']
    im = Image.open(srcs[year])
    pal = im.getpalette()
    idx = np.asarray(im)
    small = np.asarray(Image.open(os.path.join(CACHE, 'lang', f'{year}.png')).convert('RGB')).astype(np.int64)
    codes = (small[..., 0] << 16) | (small[..., 1] << 8) | small[..., 2]
    big = np.repeat(np.repeat(codes, STEP, axis=0), STEP, axis=1)[:by.SRC_H, :by.SRC_W]
    out = np.asarray(im.convert('RGB')).copy()
    pal_rgb = [tuple(pal[3 * i:3 * i + 3]) for i in range(len(pal) // 3)]
    is_civ = np.array([t not in by.NOT_CIVS for t in pal_rgb] + [False] * (256 - len(pal_rgb)))[idx]
    for code, info in langs.items():
        if not info.get('key'):
            continue
        m = is_civ & (big == int(code))
        if m.any():
            out[m] = hex_to_rgb(info['key'])
    os.makedirs(KEYFRAMES, exist_ok=True)
    p = os.path.join(KEYFRAMES, f'{by.label(year)}.png')
    if os.path.exists(p):
        raise SystemExit(f'{p} already exists; not overwriting DJ\'s painting.')
    Image.fromarray(out).save(p)
    print(f'Wrote {p}')
