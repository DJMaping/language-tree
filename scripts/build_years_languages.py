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

import build_years_commoners as bc  # noqa: E402  (what ordinary people speak: DJ's keyframes)
import build_years_dialects as bd   # noqa: E402  (the old dialects of the big languages)

ROOT, CACHE, HISTORY, KEYFRAMES = by.ROOT, by.CACHE, by.HISTORY, by.KEYFRAMES
W, H, STEP = by.W, by.H, by.STEP
IW, IH = by.IW, by.IH      # the pictures are twice the working grid each way


def up(a):
    """A working-grid raster at picture size."""
    return np.repeat(np.repeat(a, 2, axis=0), 2, axis=1)
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
        """When a language stops being spoken as itself, as the chart has it
        (js/model.js diedOf): its death; for a 'diverged' language, the birth of
        its last daughter; for one renamed into a stage successor, that
        successor's birth. A living language with branch daughters (Emaran and
        its creole, Estijan and its offshoots) goes on being itself: before
        17 Oct 2026 it ended at its last daughter's birth here, so a
        civilisation speaking Emaran was shown speaking Rkmepuii Emaran from
        1650 on."""
        l = self.by_id[i]
        if l.get('died') is not None:
            return l['died']
        ks = self.kids.get(i, [])
        if l.get('diverged'):
            born = [self.by_id[k].get('born') for k in ks if self.by_id[k].get('born') is not None]
            return max(born) if born else None
        stage = [self.by_id[k].get('born') for k in ks if self.by_id[k].get('relation') == 'stage' and self.by_id[k].get('born') is not None]
        return min(stage) if stage else None

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
            # (a language that died lives on in its daughters, if it has any by then:
            # a civilisation on the maps keeps speaking its line, not a dead stage)
            if e is None or year < e or not ks:
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
    # What ordinary people speak there by DJ's own family map (the people
    # atlas's branch shares) wins over the official language, which can be a
    # colonial one (Reerica's official Emaran over an Arten-speaking land):
    # the country's majority branch, through its official language when that
    # belongs to the branch, else the branch's most-spoken living language.
    atlas = by.read_json(os.path.join(ROOT, 'data', 'canon', 'people-atlas-languages.json'), {}).get('states', {})
    branch_node = {b['name']: b.get('nodeId') for f in tree.doc.get('families', []) for b in f.get('branches') or []}
    def under(node):
        out, stack = [], [node]
        while stack:
            n = stack.pop()
            ks = tree.kids.get(n, [])
            if not ks and tree.by_id[n].get('died') is None:
                out.append(n)
            stack += ks
        return out
    for country, info in atlas.items():
        br = sorted(info.get('br') or [], key=lambda x: -x[1])
        node = branch_node.get(br[0][0]) if br else None
        if not node or node not in tree.by_id:
            continue
        living = under(node)
        if not living:
            continue
        off = main.get(country, (None, None))[1]
        lineage_of_off = set()
        cur = off
        while cur in tree.by_id:
            lineage_of_off.add(cur)
            cur = tree.by_id[cur].get('parentId')
        pick = off if off and node in lineage_of_off else max(living, key=lambda i: ((tree.by_id[i].get('speakers') or {}).get('l1') or 0, i))
        main[country] = (None, pick)
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
            col = by.read_packed(os.path.join(CACHE, 'col', f'{ys}.png'))[::2, ::2]
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


def country_raster():
    """DJ's 1765 countries on the frame grid: (state index per pixel, names)."""
    from PIL import ImageDraw
    shapes = by.read_json(os.path.join(ROOT, 'data', 'canon', 'country-shapes.json'), None)
    names = list(shapes['shapes'])
    img = Image.new('I', (W, H), -1)
    d = ImageDraw.Draw(img)
    for k, n in enumerate(names):
        for part in shapes['shapes'][n]:
            d.polygon([((x + 180) / 360 * W, (90 - y) / 180 * H) for x, y in part], fill=k)
    return np.asarray(img), names


def lane_contacts(years):
    """Sea trade between countries (data/canon/sea-lanes.json, from the
    andah-atlas trade model, 1700-1765) as contact between the languages most
    spoken at either end, in the commoners' layer. Each lane year stands for
    the frames nearest it."""
    lanes = by.read_json(os.path.join(ROOT, 'data', 'canon', 'sea-lanes.json'), None)
    if not lanes:
        return {}
    state, names = country_raster()
    idx = {n: k for k, n in enumerate(names)}
    epochs = sorted(int(y) for y in lanes['years'])
    found = {}   # (a, b) -> {year: share}
    for k, ey in enumerate(epochs):
        lo = ey - 10 if k == 0 else (epochs[k - 1] + ey) // 2 + 1
        hi = years[-1] if k == len(epochs) - 1 else (ey + epochs[k + 1]) // 2
        for y in [z for z in years if lo <= z <= hi]:
            codes = by.read_packed(os.path.join(CACHE, 'common', f'{y}.png'))[::2, ::2]
            m = (state >= 0) & (codes >= LANG0) & (codes < CIV0)
            key = state[m].astype(np.int64) * 100000 + (codes[m] - LANG0)
            u, n = np.unique(key, return_counts=True)
            main, best = {}, {}
            for kk, cnt in zip(u, n):
                st_, li = int(kk // 100000), int(kk % 100000)
                if cnt > best.get(st_, 0):
                    best[st_], main[st_] = cnt, li + LANG0
            for A, B, share in lanes['years'][str(ey)]:
                la, lb = main.get(idx.get(A)), main.get(idx.get(B))
                if la and lb and la != lb:
                    pair = (min(la, lb), max(la, lb))
                    cur = found.setdefault(pair, {})
                    cur[y] = max(cur.get(y, 0), share)
    return found


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


def lab_of(rgb):
    """sRGB (0-255, any shape ending in 3) -> CIELAB, for telling colours apart as eyes do."""
    c = np.asarray(rgb, dtype=np.float64) / 255.0
    c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    xyz = c @ np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]]).T
    xyz = xyz / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], axis=-1)


def land_neighbours():
    """Languages that border each other on any yearly map (the last build's contacts)."""
    out = {}
    for c in by.read_json(os.path.join(CACHE, 'contacts.json'), {}).get('contacts', []):
        if c.get('kind') == 'land':
            out.setdefault(c['a'], set()).add(c['b'])
            out.setdefault(c['b'], set()).add(c['a'])
    return out


def key_colours(tree, display, civ_rgbs):
    """Paint colours for the keyframes: one per language, NEVER changed once
    given (DJ's painted maps depend on them), and since 16 Oct 2026 (scheme 2)
    clearly different from one another (DJ: Ioithin and Syrceall were #d5854d
    and #d5884d, which no eye can tell apart): far apart in CIELAB from every
    other language's, farther from any it borders on the maps, never grey or
    near the sea's, white's or the greys' colours, and near its display colour
    where that leaves room."""
    path = os.path.join(KEYFRAMES, 'key.json')
    doc = by.read_json(path, {})
    key = dict(doc.get('languages', {})) if doc.get('scheme') == 2 else {}
    todo = [l['id'] for l in tree.doc['languages'] if l['id'] not in key]
    if todo:
        step = np.arange(5, 256, 10)
        cand = np.stack(np.meshgrid(step, step, step, indexing='ij'), -1).reshape(-1, 3)
        lab = lab_of(cand)
        chroma = np.hypot(lab[:, 1], lab[:, 2])
        ok = (chroma >= 18) & (lab[:, 0] >= 25) & (lab[:, 0] <= 92)
        for c in list(by.NOT_CIVS) + [hex_to_rgb(h) for h in civ_rgbs if isinstance(h, str)]:
            ok &= np.linalg.norm(lab - lab_of(np.array(c)), axis=1) >= 14
        cand, lab = cand[ok], lab[ok]
        nearest = np.full(len(cand), np.inf)
        given = {}
        for i, h in key.items():
            given[i] = lab_of(np.array(hex_to_rgb(h)))
            nearest = np.minimum(nearest, np.linalg.norm(lab - given[i], axis=1))
        nb = land_neighbours()
        todo.sort(key=lambda i: (-len(nb.get(i, ())), i))
        for i in todo:
            want = lab_of(np.array(hex_to_rgb(display.get(i, '#808080'))))
            near_nb = np.full(len(cand), np.inf)
            for j in nb.get(i, ()):
                if j in given:
                    near_nb = np.minimum(near_nb, np.linalg.norm(lab - given[j], axis=1))
            fit = np.linalg.norm(lab - want, axis=1)
            for apart, from_nb in ((12, 28), (10, 22), (8, 16), (6, 10), (3, 5), (0, 0)):
                m = (nearest >= apart) & (near_nb >= from_nb)
                if m.any():
                    k = int(np.argmin(np.where(m, fit, np.inf)))
                    break
            key[i] = by.hexof(cand[k])
            given[i] = lab[k]
            nearest = np.minimum(nearest, np.linalg.norm(lab - lab[k], axis=1))
    by.write_json(path, {
        '_readme': 'Paint colours for language keyframes: one per language id. Never changed once given, so painted maps stay readable. '
                   'Paint a language with exactly its colour; any other colour is read as unpainted (the civilisation decides). '
                   'Scheme 2 (16 Oct 2026): every colour clearly different from every other, more so between neighbours.',
        'scheme': 2,
        'languages': key,
    }, indent=1)
    return key


def separate_neighbours(display, pairs, apart=18, fixed=()):
    """On the app's map, languages that border each other in clearly different
    shades (DJ, 16 Oct 2026: Ioithin and Syrceall "are the same colour on the
    map"). Each language in turn, those with the most neighbours first, takes
    the shade nearest its own (its lightness and a little of its hue) that
    stands at least `apart` (CIELAB) from every neighbour already coloured; a
    colour in `fixed` (already given) stays as it is."""
    nb = {}
    for a, b in pairs:
        if a in display and b in display and a != b:
            nb.setdefault(a, set()).add(b)
            nb.setdefault(b, set()).add(a)
    lab = {i: lab_of(np.array(hex_to_rgb(c))) for i, c in display.items()}
    done = {i for i in fixed if i in display}
    for i in sorted((x for x in nb if x not in done), key=lambda x: (-len(nb[x]), x)):
        near = [lab[j] for j in nb[i] if j in done]
        if near:
            near = np.array(near)
            r, g, bl = (v / 255 for v in hex_to_rgb(display[i]))
            h, l, sat = colorsys.rgb_to_hls(r, g, bl)
            cands, labs = [], []
            for dh in (0, -0.02, 0.02, -0.045, 0.045):
                for l2 in np.arange(0.22, 0.83, 0.04):
                    rgb = colorsys.hls_to_rgb((h + dh) % 1, l2, sat)
                    cands.append('#%02x%02x%02x' % tuple(round(v * 255) for v in rgb))
                    labs.append(lab_of(np.array([round(v * 255) for v in rgb])))
            labs = np.array(labs)
            gap = np.min(np.linalg.norm(labs[:, None, :] - near[None, :, :], axis=2), axis=1)
            stay = np.linalg.norm(labs - lab[i], axis=1)
            k = int(np.argmax(np.minimum(gap, apart) * 10 - stay))
            if np.min(np.linalg.norm(near - lab[i], axis=1)) < apart:   # only when it needs it
                display[i] = cands[k]
                lab[i] = labs[k]
        done.add(i)
    return display


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
    """data/language-maps/: DJ's painted language maps, two kinds (DJ: "both,
    separately"). '<year> - rulers.png' paints the rulers' layer;
    '<year> - commoners.png' (or a plain '<year>.png') paints what ordinary
    people speak."""
    found = {'rulers': {}, 'commoners': {}}
    if not os.path.isdir(KEYFRAMES):
        return found
    lang_of_key = {packed(hex_to_rgb(h)): i for i, h in key.items()}
    for y, f in bc.list_keyframes('rulers').items():   # commoners' keyframes: build_years_commoners.py
        layer = 'rulers'
        rgb = np.asarray(Image.open(os.path.join(KEYFRAMES, f)).convert('RGB'))
        rows = ((np.arange(IH) + 0.5) * rgb.shape[0] / IH).astype(int)
        cols = ((np.arange(IW) + 0.5) * rgb.shape[1] / IW).astype(int)
        p = by.pack(rgb[rows][:, cols]).astype(np.int64)
        u, inv, cnt = np.unique(p, return_inverse=True, return_counts=True)
        codes = np.array([code_of_lang.get(lang_of_key.get(int(c)), -1) for c in u], dtype=np.int64)
        unknown = [{'rgb': by.hexof(by.unpack(int(c))), 'px': int(n) // 4} for c, n, code in zip(u, cnt, codes)
                   if code < 0 and by.unpack(int(c)) not in by.NOT_CIVS and n >= 80 and int(c) not in lang_of_key]
        lang_hi = codes[inv.ravel()].reshape(p.shape)
        found[layer][y] = {'file': f, 'lang': lang_hi[::2, ::2], 'lang_hi': lang_hi, 'unknown': unknown,
                           'painted': int((lang_hi[::2, ::2] >= 0).sum())}
    return {k: dict(sorted(v.items())) for k, v in found.items()}


# --- shared per-frame measures (worker processes) ----------------------------------------

_G = {}


def _init(ctx):
    _G.update(ctx)
    lat = 90.0 - (np.arange(H) + 0.5) * 180.0 / H
    row_km2 = (360.0 / W * KM_PER_DEG) * (180.0 / H * KM_PER_DEG) * np.cos(np.radians(lat))
    _G['area_w'] = np.repeat(row_km2, W)


def col_of(year):
    """A frame's colours at picture size (the working grid is every other pixel)."""
    return by.read_packed(os.path.join(CACHE, 'col', f'{year}.png'))


def save_codes(codes, folder, year):
    os.makedirs(os.path.join(CACHE, folder), exist_ok=True)
    by.save_indexed(codes, os.path.join(CACHE, folder, f'{year}.png'))


def areas_of(codes):
    """Each area's size (km², by latitude) and where to write its name: the
    point deepest inside it (farthest from any other area), which is inside
    even a ring-shaped or scattered language, unlike a centroid. Measured on
    a half-size copy: four times quicker, and a name needs no finer place.
    -> {code: [pixels, x, y, room, km2]}"""
    from scipy import ndimage
    u, inv = np.unique(codes, return_inverse=True)
    inv = inv.ravel()
    cnt = np.bincount(inv, minlength=len(u))
    km2 = np.bincount(inv, weights=_G['area_w'], minlength=len(u))
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
    where = {int(c): k for k, c in enumerate(u)}
    out = {}
    for c in want:
        k = where[c]
        py, px_ = poles[c]
        out[c] = [int(cnt[k]), int(px_) * 2 + 1, int(py) * 2 + 1, round(float(rooms[c]) * 2, 1), int(km2[k])]
    return out


def contacts_of(codes):
    """Land borders between languages (pixels of shared edge), and coasts
    within MAX_SEA_KM of each other across water for pairs with no border."""
    from scipy.spatial import cKDTree
    borders, seas = {}, {}
    for a, b in ((codes[:, :-1], codes[:, 1:]), (codes[:-1, :], codes[1:, :])):
        m = (a != b) & (a >= LANG0) & (b >= LANG0) & (a < CIV0) & (b < CIV0)
        if m.any():
            lo, hi = np.minimum(a[m], b[m]), np.maximum(a[m], b[m])
            pr, n = np.unique(lo * 10_000_000 + hi, return_counts=True)
            for p, k in zip(pr, n):
                key2 = (int(p // 10_000_000), int(p % 10_000_000))
                borders[key2] = borders.get(key2, 0) + int(k)
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
        trees, box = {}, {}
        for c in np.unique(cc):
            sel = cc == c
            trees[int(c)] = (cKDTree(pts[sel]), pts[sel])
            box[int(c)] = (cx[sel].min(), cx[sel].max(), cy[sel].min(), cy[sel].max())
        keys = list(trees)
        r = 2 * math.sin(MAX_SEA_KM / 6371.0 / 2)
        reach = MAX_SEA_KM / (180.0 / codes.shape[0] * KM_PER_DEG)        # in pixels north-south
        Wc = codes.shape[1]
        for i, a in enumerate(keys):
            ta, pa = trees[a]
            xa0, xa1, ya0, ya1 = box[a]
            for b in keys[i + 1:]:
                if (min(a, b), max(a, b)) in borders:
                    continue
                xb0, xb1, yb0, yb1 = box[b]
                if max(ya0 - yb1, yb0 - ya1) > reach:
                    continue
                lat = 90 - min(min(ya0, yb0), codes.shape[0] - max(ya1, yb1)) * 180.0 / codes.shape[0]
                gap = max(0, xa0 - xb1, xb0 - xa1)
                if min(gap, Wc - (max(xa1, xb1) - min(xa0, xb0))) > reach / max(0.05, math.cos(math.radians(min(89.0, abs(lat))))):
                    continue
                tb, pb = trees[b]
                small, big = (pa, tb) if len(pa) < len(pb) else (pb, ta)
                d, _ = big.query(small, k=1, distance_upper_bound=r)
                dm = float(np.min(d))
                if math.isfinite(dm):
                    seas[(min(a, b), max(a, b))] = round(float(chord_to_km(dm)))
    return borders, seas


def tenure_of(years, civ_of, civs, last):
    """Per working-grid pixel, since when the civilisation holding it in the
    last year has held it without a break (a later year than last: nobody)."""
    from concurrent.futures import ThreadPoolExecutor
    keys = {k: n for n, k in enumerate(civs)}

    def ids(y):
        m = civ_of.get(str(y), {})
        col = col_of(y)[::2, ::2]
        u, inv = np.unique(col, return_inverse=True)
        lut = np.array([keys.get(m.get(by.hexof(by.unpack(int(c)))), -1) for c in u], dtype=np.int32)
        return lut[inv.reshape(col.shape)]
    cur = ids(last)
    tenure = np.where(cur >= 0, last, last + 1).astype(np.int32)
    still = cur >= 0
    back = [y for y in reversed(years) if y < last]
    with ThreadPoolExecutor(max_workers=8) as ex:
        for y, now in zip(back, ex.map(ids, back)):
            still &= now == cur
            if not still.any():
                break
            tenure[still] = y
    return tenure


def _rulers(year):
    """The rulers' layer of one frame: the civilisation map, through civs.json
    and any rulers' keyframe."""
    col_hi = col_of(year)
    ky = max([z for z in _G['kf_years'] if z <= year], default=None)
    k = _G['keyframes'][ky] if ky is not None else None
    cc = _G['cc'][year]
    # the picture at full size, the measures on the working grid
    hi = without_text(resolve(col_hi, (k[3], k[4], k[2]) if k else None, cc))
    if 'official' in _G and year < _G['last']:
        # the official language back through the civilisation's unbroken rule, within its family
        off, fam = _G['official'], _G['fam']
        held = up(_G['tenure'].reshape(H, W)) <= year
        m = held & (off >= 0) & (hi >= LANG0) & (hi < CIV0)
        if m.any():
            same = np.zeros(hi.shape, dtype=bool)
            same[m] = fam[hi[m] - LANG0] == fam[off[m]]
            hi[same] = LANG0 + _G['at_up'][year][off[same]]
    save_codes(hi, 'lang', year)
    codes = hi[::2, ::2]
    return year, ky, areas_of(codes), codes.astype(np.int32)


def without_text(codes):
    """Writing on DJ's yearly maps (a label like "UVR" in white, or "Verusa"
    in grey, across a civilisation) is ink, not empty land or a lost people:
    strokes too thin to be a place take the code of the land around them, as
    black ink already does (DJ, 16-17 Oct 2026: the letters showed through)."""
    from scipy import ndimage
    nob = (codes >= 1) & (codes <= 4)
    if not nob.any():
        return codes
    big = ndimage.binary_opening(nob, structure=np.ones((5, 5), dtype=bool))
    thin = nob & ~ndimage.binary_dilation(big, iterations=2)
    if not thin.any():
        return codes
    lab, n = ndimage.label(thin)
    out = codes.copy()
    for k, sl in enumerate(ndimage.find_objects(lab), start=1):
        y0, y1 = max(0, sl[0].start - 12), min(codes.shape[0], sl[0].stop + 12)
        x0, x1 = max(0, sl[1].start - 12), min(codes.shape[1], sl[1].stop + 12)
        win = out[y0:y1, x0:x1]
        mine = lab[y0:y1, x0:x1] == k
        source = (win > 4)                 # a civilisation or a language, not sea, empty land or a grey
        if not source.any():
            continue                      # writing on the sea or on empty land: leave it
        _, (iy, ix) = ndimage.distance_transform_edt(~source, return_indices=True)
        win[mine] = win[iy[mine], ix[mine]]
    return out


def _common_years(job):
    """The commoners' layer for a run of years, from the schedule (worker
    process): each frame's picture, its measures, who rules whom, and who
    switched language since the frame before."""
    if 'L' not in _G:
        doc = by.read_json(os.path.join(ROOT, 'data', 'languages.json'), None)
        ids = [l['id'] for l in doc['languages']]
        key = by.read_json(os.path.join(KEYFRAMES, 'key.json'), {}).get('languages', {})
        _G['L'] = bc.Lines(Tree(doc), ids, {i: key.get(i, '#808080') for i in ids})
        _G['sched'] = bc.Schedule(_G['schedule']).load()
    L, sched, related = _G['L'], _G['sched'], _G['related']
    out = []
    prev_lo = None
    ys = ([job['prev']] if job['prev'] is not None else []) + job['years']
    for t in ys:
        lang = sched.compose(t, L)
        at = L.at(t)
        rh = by.read_packed(os.path.join(CACHE, 'lang', f'{t}.png'))
        codes = np.zeros((IH, IW), dtype=np.int64)
        ok = lang >= 0
        codes[ok] = LANG0 + at[lang[ok]]
        lostp = ~ok
        codes[lostp] = np.where((rh[lostp] >= 2) & (rh[lostp] <= 4), rh[lostp], 3)
        codes[rh == 1] = 1
        codes[rh == 0] = 0
        lo = codes[::2, ::2]
        if t == job['prev']:
            prev_lo = lo
            continue
        save_codes(codes, 'common', t)
        areas = areas_of(lo)
        b_, s_ = contacts_of(lo)
        events = {}
        # rulers over people of another line (a superstrate: donor the rulers)
        r_lo = rh[::2, ::2]
        n_ = L.n
        m = (r_lo >= LANG0) & (r_lo < CIV0) & (lo >= LANG0) & (lo < CIV0)
        if m.any():
            tally_ = np.bincount((r_lo[m] - LANG0) * n_ + (lo[m] - LANG0), minlength=n_ * n_)
            for k_ in np.nonzero(tally_)[0]:
                r_, c_ = divmod(int(k_), n_)
                if not related[r_, c_]:
                    events[('superstrate', r_, c_)] = int(tally_[k_])
        # people who switched language since the frame before (a substrate: donor the old language)
        if prev_lo is not None:
            sw = (prev_lo >= LANG0) & (prev_lo < CIV0) & (lo >= LANG0) & (lo < CIV0) & (prev_lo != lo)
            if sw.any():
                tally_ = np.bincount((prev_lo[sw] - LANG0) * n_ + (lo[sw] - LANG0), minlength=n_ * n_)
                for k_ in np.nonzero(tally_)[0]:
                    o, r_ = divmod(int(k_), n_)
                    if not related[o, r_]:
                        events[('substrate', o, r_)] = int(tally_[k_])
        prev_lo = lo
        # which civilisation rules which people, for the civilisations' guesses
        col = col_of(t)[::2, ::2]
        m = (lo >= LANG0) & (lo < CIV0)
        civ_people = {}
        if m.any():
            keys_, n = np.unique((col[m].astype(np.int64) << 12) | (lo[m] - LANG0), return_counts=True)
            civ_people = {(int(k_ >> 12), int(k_ & 4095)): int(cnt) for k_, cnt in zip(keys_, n)}
        out.append((t, areas, b_, s_, events, civ_people))
    return out


# --- the commoners: DJ's keyframes (scripts/build_years_commoners.py) --------------------

SHIFT_DEFAULTS = {
    '_readme': "How the commoners' map moves between DJ's keyframes, and how the app works out its starter keyframes (scripts/build_years_commoners.py). "
               'DJ, 15 Oct 2026: keyframes only; between two, "new rulers + shift time"; before his earliest, "earlier rulers, else lost"; '
               'shift time "mostly 300 years ... vary it".',
    'years': 300,          # shift time: years of a new family's rule before its people take up its language
    'variation': 0.5,      # +-50%, smooth across the land, so a shift creeps in by districts
    'sameFamily': 1.7,     # x faster between related languages
    'lostPeoples': 4.0,    # x faster for peoples whose language is lost (the greys)
    'heldYears': 300,      # earlier rulers held a place this long: their language was its people's
    'nearKm': 400,         # a family reaches people it never ruled within this distance of its rule
    'catchUp': 0.6,        # a keyframe sooner than the shift time: the switch lands this far from arrival to keyframe
    'starterEvery': 100,   # years between the app's starter keyframes, back from 1765
}


def subjects_guess(civs, civ_of, tally, tree, lang_ids):
    """A civilisation no name matched speaks what most of its people spoke
    over its life on the commoners' map (DJ's keyframes), as the line's stage
    at its end: a guess for DJ to check, marked how: "place"."""
    votes = {}
    for (year, colour, l), n in tally.items():
        key = civ_of.get(str(year), {}).get(by.hexof(by.unpack(colour)))
        c = civs.get(key)
        if not c or c.get('how') not in ('place', None):
            continue
        line = tree.at(lang_ids[l], c['to'])
        v = votes.setdefault(key, {})
        v[line] = v.get(line, 0) + n
    changed = 0
    for key, v in votes.items():
        c = civs[key]
        pick = max(v, key=lambda i: (v[i], i))
        if c.get('lang') != pick or c.get('how') != 'place':
            c['lang'], c['how'] = pick, 'place'
            changed += 1
    return changed


def run(again=True):
    import time
    t_start = time.time()
    marks = []

    def tick(what):
        marks.append(f'{what} {time.time() - t_start - sum(float(m.split()[-1][:-1]) for m in marks):.0f}s')
    doc = by.read_json(os.path.join(ROOT, 'data', 'languages.json'), None)
    tree = Tree(doc)
    legend = by.read_json(os.path.join(CACHE, 'legend.json'), {})
    if not legend:
        raise SystemExit('No frames yet: run  python scripts/build-years.py frames')
    civ_path = os.path.join(HISTORY, 'civs.json')
    civ_doc = by.read_json(civ_path, {'civs': {}})
    civs = civ_doc['civs']
    changed = auto_match(civs, tree)
    changed += place_match(civs, tree, legend, by.read_json(os.path.join(CACHE, 'civ_of.json'), {}))
    if changed:
        by.write_json(civ_path, civ_doc, indent=1)
    shift_path = os.path.join(HISTORY, 'shift.json')
    old = by.read_json(shift_path, {})
    shift = {**SHIFT_DEFAULTS, **{k: v for k, v in old.items() if k in SHIFT_DEFAULTS and not k.startswith('_')}}
    if set(old) != set(SHIFT_DEFAULTS):
        by.write_json(shift_path, shift, indent=1)
    shift['_readme'] = SHIFT_DEFAULTS['_readme']
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
            if k and k.startswith('special:'):   # a fringe colour that belongs to the sea or a grey
                out[p] = SPECIAL.get(hex_to_rgb(k[8:]), 0)
                continue
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

    # Paint colours first: the starters are painted with them.
    civ_rgbs = {c['rgb'] for c in civs.values()}
    key = key_colours(tree, continuum_colours(tree, {})[0], civ_rgbs)
    Lx = bc.Lines(tree, lang_ids, key)
    thresh = bc.threshold(shift)
    files = bc.manifest()
    cc = {y: colour_codes(y) for y in years}
    snap = lambda y: min([z for z in years if z >= y], default=years[-1])

    # 1765: DJ's family map, unless he has repainted that keyframe himself.
    last = years[-1]
    anchor_file = bc.kf_name(last)
    anchor_path = os.path.join(KEYFRAMES, anchor_file)
    base_last = without_text(resolve(col_of(last), None, cc[last]))   # 1765's civilisations, before any keyframe (no writing)
    # DJ's own maps of earlier years, the latest of each pixel: 1765 continues them
    earlier = None
    mine = [(y, bc.read_keyframe(os.path.join(KEYFRAMES, f), Lx)[0], None)
            for y, f in bc.list_keyframes().items() if y < last and bc.kind_of(f, files) == 'yours']
    for y, fs in bc.list_regions().items():
        if y < last:
            for f in fs:
                lang_r, cov, _ = bc.read_region(os.path.join(KEYFRAMES, f), Lx)
                mine.append((y, lang_r, cov))
    for y, lang_m, cov in sorted(mine, key=lambda t: (t[0], t[2] is not None)):
        if earlier is None:
            earlier = np.full((IH, IW), -1, dtype=np.int16)
        m = (lang_m >= 0) if cov is None else (cov & (lang_m >= 0))
        earlier[m] = lang_m[m]
    if not os.path.exists(anchor_path) or bc.kind_of(anchor_file, files) != 'yours':
        made = bc.family_anchor(Lx, land=(base_last != 0) & (base_last != 1), earlier=earlier, year=last)
        if made is not None:
            lang, placed = made
            # the old dialects that survive to 1765 (build_years_dialects.py) hold their regions
            reg, std_of, _ = bd.regions(Lx, lang)
            for dlx in std_of:
                if Lx.died[dlx] >= bc.NEVER:
                    lang[reg == dlx] = dlx
            os.makedirs(KEYFRAMES, exist_ok=True)
            pic = bc.picture(lang, base_last, Lx, last)
            if bc.save_picture(pic, anchor_path):
                print(f'Wrote {anchor_file} from the family map ({len(placed)} languages with no country placed for DJ to check).')
            files[anchor_file] = {'sha1': bc.sha1(anchor_path), 'kind': 'family-map', 'year': last, 'placed': placed}
        elif not os.path.exists(anchor_path):
            print(f'No family map at {bc.FAMILY_MAP} and no {anchor_file}: the commoners have no language to start from.')
    # 1765's rulers: each country's official language (DJ: "Yes, official languages")
    rul_file = bc.kf_rel(last, 'rulers')
    rul_path = os.path.join(KEYFRAMES, rul_file)
    if not os.path.exists(rul_path) or bc.kind_of(rul_file, files) != 'yours':
        os.makedirs(KEYFRAMES, exist_ok=True)
        if bc.save_picture(bc.rulers_picture(bc.official_rulers(Lx, base_last), Lx), rul_path):
            print(f'Wrote {rul_file} from the official languages.')
        files[rul_file] = {'sha1': bc.sha1(rul_path), 'kind': 'official', 'year': last}
    bc.write_manifest(files)

    # DJ's own keyframes (and the family map's) anchor everything else.
    on_disk = {snap(y): f for y, f in bc.list_keyframes().items()}
    anchors = {y: f for y, f in on_disk.items() if bc.kind_of(f, files) in ('yours', 'family-map')}
    kf_path = lambda f: os.path.join(KEYFRAMES, f)
    # Each pixel's keyframes: DJ's whole ones, and his regional maps (a part
    # of the world in one year, transparent elsewhere: his 1565 Ayuma map).
    layers = []                       # (year, languages at picture size, where it speaks or None: everywhere)
    for y, f in sorted(anchors.items()):
        layers.append((y, bc.read_keyframe(kf_path(f), Lx)[0], None))
    regions = {snap(y): fs for y, fs in bc.list_regions().items()}
    region_meta = {}
    region_at = []
    for y, fs in regions.items():
        for f in fs:
            lang_r, cov, unknown = bc.read_region(kf_path(f), Lx)
            layers.append((y, lang_r, cov))
            region_at.append((len(layers) - 1, f'region:{y}:{f}', f))
            region_meta[f'region:{y}:{f}'] = {'layer': 'commoners', 'year': y, 'file': f, 'kind': 'region',
                                              'painted': int(cov[::2, ::2].sum()), 'unknown': unknown}
    # a regional map's straight cuts are no border: past them its edge languages carry on (bc.past_cuts)
    grey_px = [bc.pk(by.SAPIENS), bc.pk(by.ADVANCED), bc.pk(by.EMBRYONIC)]
    for i, rkey, f in region_at:
        y, lang_r, cov = layers[i]
        nxt = np.full((IH, IW), -1, dtype=np.int16)
        filled = np.zeros((IH, IW), dtype=bool)
        for ly, lang_l, cov_l in sorted((t for t in layers if t[0] > y), key=lambda t: (t[0], t[2] is None)):
            m = (np.ones((IH, IW), dtype=bool) if cov_l is None else cov_l) & ~filled
            nxt[m] = lang_l[m]
            filled |= m
        taken = np.zeros((IH, IW), dtype=bool)
        for j, (ly, _, cov_l) in enumerate(layers):
            if ly == y and j != i:
                taken |= True if cov_l is None else cov_l
        stateless = np.isin(col_of(y), grey_px)
        lang2, cov2, n_agree, n_near = bc.past_cuts(lang_r, cov, nxt, stateless, Lx, taken=taken)
        if n_agree or n_near:
            layers[i] = (y, lang2, cov2)
            region_meta[rkey]['pastCuts'] = n_agree + n_near
            print(f'{f}: past its cuts, its languages carry on over {n_agree} places as far as the next keyframe agrees '
                  f'and {n_near} more a short way.')
    layers.sort(key=lambda t: (t[0], t[2] is not None))     # in one year a regional map overrides the whole one
    y0 = None
    back = None
    if layers:
        T0_hi = np.full((IH, IW), -1, dtype=np.int16)
        y0_hi = np.full((IH, IW), bc.NEVER, dtype=np.int64)
        for y, lang_l, cov in sorted(layers, key=lambda t: (-t[0], t[2] is not None)):   # latest first, earliest wins
            m = np.ones((IH, IW), dtype=bool) if cov is None else cov
            T0_hi[m] = lang_l[m]
            y0_hi[m] = y
        y0 = int(y0_hi.min())
        back = bc.Backward(T0_hi[::2, ::2].ravel().copy(), y0_hi[::2, ::2].ravel().copy(), Lx, shift, thresh)
    # Rulers' keyframes. A rulers' keyframe also records what each
    # civilisation mostly spoke in it, so its languages follow the civilisation later.
    keyframes = read_keyframes(tree, key, code_of_lang)
    for y, k in keyframes['rulers'].items():
        fy = max([z for z in years if z <= y], default=years[0])
        k['col_hi'] = col_of(fy)
        k['col'] = k['col_hi'][::2, ::2]
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

    frames = {}
    borders, seas = {}, {}     # (a, b) -> {year: border px | km}
    layered = {}               # (kind, ruler, commoner) -> {year: px}
    presence = {}              # code -> [years]
    fam8 = {}                  # year -> the rulers' families, working grid
    ctx = {'cc': cc, 'kf_years': sorted(keyframes['rulers']),
           'keyframes': {y: (k['col'], k['lang'], k['dominant'], k['col_hi'], k['lang_hi']) for y, k in keyframes['rulers'].items()}}
    # 1765's rulers (each country's official language) back through each
    # civilisation's unbroken rule of the place, where the official language
    # is of the civilisation's own family (DJ, 17 Oct 2026: "Same family, back
    # in time"; the rulers' map jumped from civilisation blocks to countries
    # in one frame). Colonial rule by another family stays as it was.
    k_last = keyframes['rulers'].get(last)
    if k_last is not None:
        official = np.where(k_last['lang_hi'] >= LANG0, k_last['lang_hi'] - LANG0, -1).astype(np.int16)
        ctx.update(official=official, tenure=tenure_of(years, civ_of, civs, last), fam=Lx.fam,
                   at_up={y: Lx.at(y) for y in years if y < last}, last=last)
    from concurrent.futures import ProcessPoolExecutor
    jobs = int(os.environ.get('YEARS_JOBS', str(min(8, max(2, (os.cpu_count() or 4) // 2)))))   # a laptop gets fewer; more did not help
    with ProcessPoolExecutor(max_workers=jobs, initializer=_init, initargs=(ctx,)) as ex:
        for year, ky, areas, rcodes in ex.map(_rulers, years, chunksize=4):
            frames[year] = {'keyframe': ky, 'areas': areas}
            rc = rcodes.ravel()
            fam8[year] = Lx.families(rc)
            if back is not None:
                back.step(year, rc, fam8[year])
    first_civ = next((y for y in years if any(int(c) >= LANG0 for c in frames[y]['areas'])), years[0])
    tick('rulers')

    dreg, dstd, drank, dkeep, fade_lo = None, {}, None, None, None

    # --- starter keyframes ------------------------------------------------------
    every = int(shift['starterEvery'])
    grid = []
    y = last - every
    while y > first_civ:
        grid.append(snap(y))
        y -= every
    grid.append(first_civ)
    grid = sorted((set(grid) | set(regions)) - set(anchors))
    written = 0
    # starters off the grid (the step changed) go, unless DJ has painted them
    for f, e in list(files.items()):
        if e.get('kind') == 'starter' and e.get('year') not in grid and bc.kind_of(f, files) == 'starter':
            os.remove(kf_path(f))
            del files[f]

    def put(s, lang_hi):
        nonlocal written
        f = bc.kf_name(s)
        p = kf_path(f)
        if os.path.exists(p) and bc.kind_of(f, files) == 'yours':
            return
        pic = bc.picture(lang_hi, by.read_packed(os.path.join(CACHE, 'lang', f'{s}.png')), Lx, s)
        written += bc.save_picture(pic, p)
        files[f] = {'sha1': bc.sha1(p), 'kind': 'starter', 'year': s}

    # The schedule: what people speak in any year (bc.Schedule). The starters
    # are snapshots of it, and the map is drawn from it frame by frame.
    sched = bc.Schedule(os.path.join(CACHE, 'kf', 'schedule'))
    import shutil
    shutil.rmtree(sched.folder, ignore_errors=True)
    if back is not None:
        S, P, Pst = back.finish()
        # where each old dialect was spoken before its standard replaced it: where its people have
        # spoken the standard's line since heldBefore (Backward: native all along, or taken up by
        # then), not the land it reached later, its colonies (build_years_dialects.regions)
        anchor_lang = bc.read_keyframe(kf_path(anchors[max(anchors)]), Lx)[0] if anchors else None
        ddoc = bd.read_doc()
        T0w = T0_hi[::2, ::2]
        # the arrival years smoothed and their line made uneven, so the homeland's edge follows no
        # straight border of the yearly maps or block of the backwards grid (the old dialects took it)
        from scipy import ndimage
        S2 = S.reshape(H, W).astype(np.float32)
        S2 = ndimage.median_filter(np.clip(S2, -5000, 5000), size=9) + 60 * bc.wobble()[::2, ::2]
        since = S2 <= ddoc['dials']['heldBefore']
        held = {}
        for e in ddoc['languages'].values():
            si = Lx.idx.get(e.get('standard'))
            if si is not None:
                held[si] = since & (T0w >= 0) & Lx.related[np.maximum(T0w, 0), si]
        dreg, dstd, drank = bd.regions(Lx, anchor_lang, ddoc, held=held, earlier=T0_hi) if anchors else (None, {}, None)
        n_dial = sum(len([x for x in e.get('dialects') or [] if x.get('id') in Lx.idx]) for e in ddoc['languages'].values())
        if n_dial:
            print(f'{len(dstd)} of {n_dial} old dialects on the map (the rest are named for places outside the long-held homeland of their standard).')
        # DJ's own last map says how much of its region each surviving old dialect still holds (bd.overlay)
        dkeep = (dreg >= 0) & (anchor_lang == dreg) if dstd and bc.kind_of(anchors[max(anchors)], files) == 'yours' else None
        fade_lo = np.where(dreg >= 0, drank, -1.0)[::2, ::2].ravel().astype(np.float32) if dstd else None
        lyears = sorted({y for y, _, _ in layers})

        def at_layer(y):
            """Every keyframe of one year together: the languages, and where they speak."""
            v = np.full((IH, IW), -1, dtype=np.int16)
            c = np.zeros((IH, IW), dtype=bool)
            for ly, lang_l, cov in layers:
                if ly == y:
                    m = np.ones((IH, IW), dtype=bool) if cov is None else cov
                    v[m] = lang_l[m]
                    c |= m
            return v, c
        sched.put('T0', T0_hi)
        sched.put('S', S.astype(np.int32))
        sched.put('P', P.astype(np.int16))
        sched.put('Pst', Pst.astype(np.int32))
        for y in lyears:
            v, c = at_layer(y)
            sched.put(f'v{y}', v)
            sched.put(f'c{y}', c)
        meta = {'years': lyears}
        sched.write_meta(meta)
        sched.load()
        # the pairs of keyframe years some place goes between, each with its switch years
        pairs = sorted({(a, b) for t in lyears for a, b, _ in sched.era(t) if b is not None})
        for a, b in pairs:
            runs = bc.Runs()
            for y in years:
                if y > a:
                    break
                runs.step(y, fam8[y])
            fr = [(y, fam8[y]) for y in years if a < y <= b]
            people = (fam8[a] != bc.NOBODY) & (fam8[a] != bc.SEA)
            A, B = np.asarray(sched.cover[a][0]), np.asarray(sched.cover[b][0])
            sched.put(f'p{a}_{b}', bc.interval(A[::2, ::2].ravel(), B[::2, ::2].ravel(), Lx, shift, thresh, fr, runs, people, a, b, fade=fade_lo))
        if dstd:
            sched.put('dreg', dreg)
            sched.put('drank', drank)
        if dkeep is not None:
            sched.put('dkeep', dkeep)
            meta.update(dkeep_year=int(max(anchors)))
        meta.update(pairs=[list(p) for p in pairs], dstd={str(k): int(v) for k, v in dstd.items()})
        sched.write_meta(meta)
    else:
        sched.write_meta({'years': []})
    sched = bc.Schedule(sched.folder).load()
    for s in grid:
        put(s, sched.compose(s, Lx))
    del sched
    bc.write_manifest(files)
    if written:
        print(f'{written} starter keyframes written.')
    tick('starters')

    # --- the commoners' layer: every frame from the schedule ----------------------
    on_disk = {snap(y): f for y, f in bc.list_keyframes().items()}
    kf_meta = {}
    for y, f in sorted(on_disk.items()):
        lang_hi, unknown = bc.read_keyframe(kf_path(f), Lx)
        kf_meta[f'commoners:{y}'] = {'layer': 'commoners', 'year': y, 'file': f, 'kind': bc.kind_of(f, files),
                                     'painted': int((lang_hi[::2, ::2] >= 0).sum()), 'unknown': unknown}
    kf_meta.update(region_meta)
    for y, k in keyframes['rulers'].items():
        kf_meta[f'rulers:{y}'] = {'layer': 'rulers', 'year': y, 'file': k['file'], 'kind': bc.kind_of(k['file'], files), 'painted': k['painted'], 'unknown': k['unknown']}
    tally = {}
    step = 12
    chunks = [years[k:k + step] for k in range(0, len(years), step)]
    with ProcessPoolExecutor(max_workers=jobs, initializer=_init,
                             initargs=({'anc': Lx.anc, 'related': Lx.related, 'schedule': os.path.join(CACHE, 'kf', 'schedule')},)) as ex2:
        pending = [ex2.submit(_common_years, {'years': ch, 'prev': years[years.index(ch[0]) - 1] if ch[0] != years[0] else None})
                   for ch in chunks]
        for fut in pending:
            for year, careas, b_, s_, events, civ_people in fut.result():
                frames[year]['common'] = careas
                for c in set(careas) | set(frames[year]['areas']):
                    if int(c) < CIV0:
                        presence.setdefault(int(c), set()).add(year)
                for k_, v in b_.items():
                    borders.setdefault(k_, {})[year] = v
                for k_, v in s_.items():
                    seas.setdefault(k_, {})[year] = v
                for k_, v in events.items():
                    layered.setdefault(k_, {})[year] = v
                for (colour, l), n in civ_people.items():
                    tally[(year, colour, l)] = n
    del fam8
    tick('commoners')
    presence = {c: sorted(v) for c, v in presence.items()}

    # Civilisations no name matched: what their own people spoke. If that
    # changes any, the rulers' layer is built again with the new guesses.
    guessed = subjects_guess(civs, civ_of, tally, tree, lang_ids)
    if guessed:
        by.write_json(civ_path, civ_doc, indent=1)
        print(f'{guessed} civilisations take the language of the people they ruled.')
        # a handful wait for the next build (each rebuild takes minutes, DJ found it slow)
        if again and guessed >= 5:
            print('Building again with them.')
            return run(again=False)

    # --- contacts: runs of years ---------------------------------------------
    index_of = {y: i for i, y in enumerate(years)}

    def runs(ys):
        out, start, prev = [], None, None
        for y in ys:
            if start is None:
                start = prev = y
            elif index_of[prev] + 2 >= index_of[y]:   # a one-frame gap does not break a contact
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
    def ancestors(i):
        out = set()
        while i in tree.by_id:
            out.add(i)
            i = tree.by_id[i].get('parentId')
        return out
    # a language and its own ancestor are one line, not neighbours (an old
    # stage left on the map beside its daughter is a date clash, listed there)
    one_line = lambda x, y: x in ancestors(y) or y in ancestors(x)
    for kind, table in (('land', borders), ('sea', seas)):
        for (a, b), per_year in table.items():
            if one_line(lang_of[a], lang_of[b]):
                continue
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
    # Rulers over commoners of another language (a superstrate, donor = the
    # rulers), and a finished switch (a substrate, donor = the old language).
    # a/b: a is the donor.
    for (kind, x, y_), per_year in layered.items():
        ys = sorted(per_year)
        for f, t in runs(ys):
            inside = [z for z in ys if f <= z <= t]
            px = sum(per_year[z] for z in inside) if kind == 'substrate' else max(per_year[z] for z in inside)
            if px < 25:
                continue
            ia, ib = (lang_ids[x], lang_ids[y_])
            contacts.append({'a': ia, 'b': ib, 'kind': kind, 'from': f, 'to': t, 'frames': len(inside),
                             'areaKm2': int(px * km_per_px * km_per_px * 0.8),
                             'exists': (ia, ib) in existing, 'sameFamily': tree.family[ia] == tree.family[ib]})
    # Sea trade lanes from the trade model (1700-1765).
    for (a, b), per_year in lane_contacts(years).items():
        if one_line(lang_of[a], lang_of[b]):
            continue
        ys = sorted(per_year)
        for f, t in runs(ys):
            inside = [z for z in ys if f <= z <= t]
            ia, ib = lang_of[a], lang_of[b]
            contacts.append({'a': ia, 'b': ib, 'kind': 'lane', 'from': f, 'to': t, 'frames': len(inside),
                             'share': max(per_year[z] for z in inside),
                             'exists': (ia, ib) in existing, 'sameFamily': tree.family[ia] == tree.family[ib]})
    contacts.sort(key=lambda c: (c['from'], c['a'], c['b']))

    # --- colours ---------------------------------------------------------------
    fam_nb = {}
    for c in contacts:
        fa, fb = tree.family[c['a']], tree.family[c['b']]
        if fa != fb and (c['kind'] == 'land' or c.get('km', 1e9) < 300):
            fam_nb.setdefault(fa, set()).add(fb)
            fam_nb.setdefault(fb, set()).add(fa)
    display, fam_hue = continuum_colours(tree, fam_nb)
    # The map's colours stay as given (DJ found them changing with every
    # rebuild): only languages new to the chart get one; delete
    # data/language-maps/colours.json to have them all worked out afresh.
    colours_path = os.path.join(KEYFRAMES, 'colours.json')
    kept = by.read_json(colours_path, {})
    display.update({i: c for i, c in (kept.get('languages') or {}).items() if i in display})
    fam_hue.update({f: h for f, h in (kept.get('families') or {}).items() if f in fam_hue})
    display = separate_neighbours(display, sorted({(c['a'], c['b']) for c in contacts if c['kind'] == 'land'}),
                                  fixed=set((kept.get('languages') or {})))
    by.write_json(colours_path, {
        '_readme': "The app's map colours for each language and family (scripts/build_years_languages.py). Kept from build to build; "
                   'a new language gets one near its relatives, apart from its neighbours. Delete this file to work them all out afresh.',
        'families': fam_hue, 'languages': dict(sorted(display.items()))}, indent=1)
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
    for p in (files.get(anchor_file) or {}).get('placed') or []:
        if p['id'] in tree.by_id and p.get('where') == 'not placed':
            on_map.add(p['id'])   # listed here, not again as never on the map
            clashes.append({'id': p['id'], 'name': tree.by_id[p['id']]['name'], 'kind': 'placed',
                            'note': f"NOT placed: no country in the chart, and its name points to {p.get('place')}, where your family map has none of its relatives. Paint it into the {years[-1]} keyframe, or give it a country in the chart."})
            continue
        if p['id'] in on_map and p['host'] in tree.by_id:   # (a share too small for the map is listed as never on it)
            near = ', '.join(tree.by_id[w]['name'] for w in p.get('with', []) if w in tree.by_id)
            clashes.append({'id': p['id'], 'name': tree.by_id[p['id']]['name'], 'kind': 'placed',
                            'note': f"no country in the chart: placed in {years[-1]} in {near}'s land ({p['where']}), its nearest relative on the map (both under {tree.by_id[p['host']]['name']}). Repaint the {years[-1]} keyframe to move it."})
    ddoc = bd.read_doc()
    for e in ddoc['languages'].values():
        for x in e.get('dialects') or []:
            if x.get('id') in tree.by_id:
                lx = tree.by_id[x['id']]
                when = f"replaced by {e['name']} by {by.label(lx['died'])}" if lx.get('died') is not None else 'still spoken in 1765'
                clashes.append({'id': x['id'], 'name': lx['name'], 'kind': 'dialect',
                                'note': f"an old regional language of {e['name']} around {x.get('city') or 'a point the app chose'} "
                                        f"(from {by.label(lx.get('born') or 0)}, {when}). The app's: delete it on the chart to veto it."})
    for l in doc['languages']:
        if l['id'] not in on_map and not tree.kids.get(l['id']) and l.get('died') is None and l.get('kind') != 'constructed':
            clashes.append({'id': l['id'], 'name': l['name'], 'kind': 'never-on-map', 'note': 'living on the tree, but on no map: paint it into a keyframe'})

    # 1765 against DJ's own family map, land for land: where the commoners'
    # layer has been repainted away from it (or the map is newer than the keyframe)
    fm = bc.map_families(Lx)
    if fm is not None:
        state, names = country_raster()
        last = by.read_packed(os.path.join(CACHE, 'common', f'{years[-1]}.png'))[::2, ::2]
        ok = (last >= LANG0) & (last < CIV0) & (fm >= 0)
        if earlier is not None:   # where his own maps say otherwise, they win (his choice, 17 Oct 2026)
            ok &= earlier[::2, ::2] < 0
        fam_now = np.full(last.shape, -1, dtype=np.int16)
        fam_now[ok] = Lx.fam[last[ok] - LANG0]
        for k, country in enumerate(names):
            m = ok & (state == k)
            if m.sum() < 20:
                continue
            off = float((fam_now[m] != fm[m]).mean())
            if off > 0.35:
                a, an = np.unique(fam_now[m], return_counts=True)
                b, bn = np.unique(fm[m], return_counts=True)
                hm, wm = a[np.argmax(an)], b[np.argmax(bn)]
                clashes.append({'id': None, 'name': country, 'kind': 'family-map', 'distance': round(off, 2),
                                'note': f'the commoners in {years[-1]}: {round(100 * an.max() / m.sum())}% {Lx.fams[hm]}; your family map: {round(100 * bn.max() / m.sum())}% {Lx.fams[wm]} '
                                        f'({round(100 * off)}% of the land differs: repaint the {years[-1]} keyframe, or delete it to make it again from the map)'})

    meta = {'years': years, 'size': [W, H], 'image': [IW, IH], 'lang0': LANG0, 'civ0': CIV0,
            'special': {'0': 'sea', '1': 'no people', '2': 'people whose language is lost (Homo sapiens)', '3': 'people whose language is lost (Advanced Culture)', '4': 'people whose language is lost (Embryonic Civilisation)'},
            'keyframes': kf_meta, 'shift': {k: v for k, v in shift.items() if not k.startswith('_')},
            'familyHue': fam_hue, 'built': __import__('datetime').datetime.now().isoformat(timespec='seconds')}
    by.write_json(os.path.join(CACHE, 'frames.json'), {'meta': meta, 'langs': langs, 'civs': civ_list,
                                                         'frames': {str(y): f for y, f in frames.items()}})
    by.write_json(os.path.join(CACHE, 'contacts.json'), {'contacts': contacts})
    by.write_json(os.path.join(CACHE, 'clashes.json'), {'clashes': clashes})
    assigned = sum(1 for c in civs.values() if c.get('lang'))
    count = lambda k: sum(c['kind'] == k for c in contacts)
    print(f'{len(years)} frames; {assigned}/{len(civs)} civilisations have a language ({changed} matched now); '
          f'contacts: {count("land")} land, {count("sea")} sea, {count("lane")} sea trade, {count("superstrate")} superstrate, {count("substrate")} substrate; '
          f'{len(clashes)} date clashes; {len(kf_meta)} keyframes.')
    tick('the rest')
    print('Times: ' + ', '.join(marks))


# --- starter keyframes ------------------------------------------------------------------

def starter(year, src, layer='commoners'):
    """A rulers' keyframe for one year, to open in Paint.NET: each language in
    its key colour, flat, with no borders, writing or legend (DJ, 15 Oct 2026:
    "I just want languages on a map ... you generate the border pixels when I
    view it in the app"); the sea, empty land and greys as on his maps.
    Saved as data/language-maps/<AFA|BFA>/rulers/<year> - rulers.png."""
    if layer != 'rulers':
        raise SystemExit("The commoners' starters are written by the languages stage (every 100 years); delete one to get it fresh.")
    frame = by.read_json(os.path.join(CACHE, 'frames.json'), None)
    if not frame or str(year) not in frame['frames']:
        raise SystemExit(f'No map for {by.label(year)}: run the languages stage first.')
    doc = by.read_json(os.path.join(ROOT, 'data', 'languages.json'), None)
    tree = Tree(doc)
    ids = [l['id'] for l in doc['languages']]
    key = by.read_json(os.path.join(KEYFRAMES, 'key.json'), {}).get('languages', {})
    Lx = bc.Lines(tree, ids, {i: key.get(i, '#808080') for i in ids})
    codes = by.read_packed(os.path.join(CACHE, 'lang', f'{year}.png'))
    p = os.path.join(KEYFRAMES, bc.kf_rel(year, 'rulers'))
    os.makedirs(os.path.dirname(p), exist_ok=True)
    if os.path.exists(p):
        raise SystemExit(f"{p} already exists; not overwriting DJ's painting.")
    by.save_indexed(bc.rulers_picture(codes, Lx), p)
    print(f'Wrote {p}')
