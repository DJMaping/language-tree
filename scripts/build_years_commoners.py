"""
What ordinary people speak, frame by frame, made from DJ's keyframes only.

DJ, 15 Oct 2026: "none of this fits the language map I gave you". The forward
simulation this replaces moved people's languages with every civilisation on
the yearly maps, so one wrong guess carried to the end: 1765 matched his
family map on only 75% of the land, and Ealdorii's people spoke Ukhdari after
the union years. He chose "your keyframes only", with starters he repaints:

  * 1765 is his family map ("Distribution of the Major Language Families"),
    pixel by pixel: each branch he painted, as the language of that branch the
    country speaks (the nearest country's where it has none). Written as the
    keyframe '1765 AFA - commoners.png', which he can repaint.
  * Every 100 years back from 1765 the app writes a starter keyframe, worked
    out backwards from his earliest own keyframe: each place keeps its later
    language's line; where the civilisation maps show that language's family
    arriving (ruling the place, or ruling nearby for people it never ruled),
    the people before spoke the earlier rulers' language if those held the
    place about 300 years or more, else a language now lost (grey). Between
    two of his own keyframes the starters follow the switching rule below.
    A starter he has edited is his, and never overwritten.
  * The map shows only keyframes. Between two that disagree about a place, it
    switches once its new language's family has ruled it for the shift time
    (about 300 years, varied by district; faster between related languages
    and for peoples whose language is lost), always between the two
    keyframes; with no such rulers, halfway between them.

Keyframes are pictures at the frames' size (4000x2000); any size is scaled.
Each language is painted in its key colour (data/language-maps/key.json);
sea, empty land and the greys as on DJ's maps; any other colour (borders,
writing, anti-aliasing) takes the nearest painted colour.
"""

import hashlib
import os

import numpy as np
from PIL import Image

import importlib.util
_spec = importlib.util.spec_from_file_location('by', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'build-years.py'))
by = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(by)

ROOT, CACHE, KEYFRAMES = by.ROOT, by.CACHE, by.KEYFRAMES
W, H, IW, IH = by.W, by.H, by.IW, by.IH
LANG0, CIV0 = 1000, 100000
NEVER = 10 ** 7                      # a year that never comes
ANCHOR_YEAR = 1765
MANIFEST = os.path.join(KEYFRAMES, 'starters.json')
LEGEND_PATH = os.path.join(ROOT, 'data', 'canon', 'family-map-legend.json')
FAMILY_MAP = os.environ.get('ANDAH_FAMILY_MAP', os.path.join(
    os.path.expanduser('~'), 'Documents', 'Andah Main', 'Statistics', 'Distribution of the Major Language Families.png'))
# the rulers' layer as families: a family's index, or one of these
GREY, NOBODY, SEA, UNKNOWN = -1, -2, -3, -4


def pk(rgb):
    if isinstance(rgb, str):
        rgb = tuple(int(rgb[i:i + 2], 16) for i in (1, 3, 5))
    return (int(rgb[0]) << 16) | (int(rgb[1]) << 8) | int(rgb[2])


def up(a):
    return np.repeat(np.repeat(a, 2, axis=0), 2, axis=1)


def kf_name(year):
    return f'{by.label(year)} - commoners.png'


def sha1(path):
    with open(path, 'rb') as f:
        return hashlib.sha1(f.read()).hexdigest()


class Lines:
    """The chart as arrays: every language an index, as in frames.json."""

    def __init__(self, tree, lang_ids, key):
        n = len(lang_ids)
        self.tree, self.ids, self.n = tree, lang_ids, n
        self.idx = {i: k for k, i in enumerate(lang_ids)}
        anc = np.zeros((n, n), dtype=bool)   # anc[a, b]: b is a, or one of a's ancestors
        for j, i in enumerate(lang_ids):
            cur = i
            while cur in tree.by_id:
                anc[j, self.idx[cur]] = True
                cur = tree.by_id[cur].get('parentId')
        self.anc = anc
        self.related = anc | anc.T
        self.fams = sorted(set(tree.family.values()))
        self.fam = np.array([self.fams.index(tree.family[i]) for i in lang_ids], dtype=np.int8)
        self.keycol = np.array([pk(key[i]) for i in lang_ids], dtype=np.int64)
        self.of_key = {int(c): k for k, c in enumerate(self.keycol)}
        self._at = {}

    def at(self, year):
        """Every language as the stage of its line spoken in a year: before it
        was born, its ancestor then. Never on to a daughter: a keyframe's
        language stays itself (Dahen over Dahe, not its main dialect; Emaran
        in Emara, not Rkmepuii Emaran)."""
        if year not in self._at:
            if len(self._at) > 64:
                self._at.clear()
            by_id = self.tree.by_id
            out = np.empty(self.n, dtype=np.int16)
            for k, i in enumerate(self.ids):
                cur = i
                while (by_id[cur].get('born') if by_id[cur].get('born') is not None else -1e9) > year and by_id[cur].get('parentId') in by_id:
                    cur = by_id[cur]['parentId']
                out[k] = self.idx[cur]
            self._at[year] = out
        return self._at[year]

    def families(self, rc):
        """The rulers' codes of a frame as families."""
        out = np.full(rc.shape, UNKNOWN, dtype=np.int8)
        rl = (rc >= LANG0) & (rc < CIV0)
        out[rl] = self.fam[rc[rl] - LANG0]
        out[rc == 0] = SEA
        out[rc == 1] = NOBODY
        out[(rc >= 2) & (rc <= 4)] = GREY
        return out


def threshold(shift):
    """Years of rule a place needs before its people switch: the shift time,
    varied smoothly across the land so a shift creeps in by districts."""
    from scipy import ndimage
    rng = np.random.default_rng(1765)
    noise = ndimage.gaussian_filter(rng.standard_normal((H, W)), 18)
    noise = (noise - noise.mean()) / (noise.std() + 1e-9)
    return (shift['years'] * np.clip(1 + shift['variation'] * np.tanh(noise), 0.25, None)).ravel().astype(np.float32)


# --- 1765 from DJ's family map ------------------------------------------------------------

def country_raster(w, h):
    from PIL import ImageDraw
    shapes = by.read_json(os.path.join(ROOT, 'data', 'canon', 'country-shapes.json'), None)
    names = list(shapes['shapes'])
    img = Image.new('I', (w, h), -1)
    d = ImageDraw.Draw(img)
    for k, n in enumerate(names):
        for part in shapes['shapes'][n]:
            d.polygon([((x + 180) / 360 * w, (90 - y) / 180 * h) for x, y in part], fill=k)
    return np.asarray(img), names


def branch_languages(L):
    """For each branch on the family map: its node, and per country the
    language of that branch the country speaks (by the chart's areas). Where
    a country lists two of one branch (Alqiran and Canldivese in Canldives),
    the one named for it, else the one fewest countries speak: its own."""
    tree = L.tree
    branches = {b['name']: b.get('nodeId') for f in tree.doc.get('families', []) for b in f.get('branches') or []}
    node_branch = {v: k for k, v in branches.items() if v}

    def branch_of(i):
        while i in tree.by_id:
            if i in node_branch:
                return node_branch[i]
            i = tree.by_id[i].get('parentId')
        return None
    reach = {}
    cands = {}
    for l in tree.doc['languages']:
        if l.get('kind') == 'constructed' or l['id'] not in L.idx:
            continue
        b = branch_of(l['id'])
        if not b:
            continue
        areas = [a for a in l.get('areas') or [] if a.get('role') != 'colonial']
        reach[l['id']] = len(areas)
        for a in areas:
            cands.setdefault((a['state'], b), []).append(l['id'])
    from build_years_languages import stems   # the name test the civilisations use

    def named(i, country):
        return bool(stems(tree.by_id[i]['name']) & stems(country))
    pick = {k: min(v, key=lambda i: (not named(i, k[0]), reach[i], -((tree.by_id[i].get('speakers') or {}).get('l1') or 0), i))
            for k, v in cands.items()}

    def default(b):
        """A branch no country names a language of: its most-spoken living language."""
        node = branches.get(b)
        if node not in tree.by_id:
            return None
        out, stack = [], [node]
        while stack:
            n = stack.pop()
            ks = tree.kids.get(n, [])
            if not ks and tree.by_id[n].get('died') is None:
                out.append(n)
            stack += ks
        return max(out, key=lambda i: ((tree.by_id[i].get('speakers') or {}).get('l1') or 0, tree.weight(i), i)) if out else node
    return pick, default


def family_anchor(L):
    """DJ's family map as a language map at picture size: a language index per
    pixel (-1 for none), or None when the map is not on this computer."""
    from scipy import ndimage
    legend = (by.read_json(LEGEND_PATH, {}) or {}).get('branches')
    if not legend or not os.path.exists(FAMILY_MAP):
        return None
    Image.MAX_IMAGE_PIXELS = None
    rgb = np.asarray(Image.open(FAMILY_MAP).convert('RGB'))
    rows = ((np.arange(IH) + 0.5) * rgb.shape[0] / IH).astype(int)
    cols = ((np.arange(IW) + 0.5) * rgb.shape[1] / IW).astype(int)
    p = by.pack(rgb[rows][:, cols]).astype(np.int64)
    names = list(legend)
    lab = np.full((IH, IW), -1, dtype=np.int16)
    for k, n in enumerate(names):
        lab[p == pk(legend[n])] = k
    state, cnames = country_raster(IW, IH)
    pick, default = branch_languages(L)
    table = np.full((len(cnames), len(names)), -1, dtype=np.int32)
    for (country, b), i in pick.items():
        if country in cnames and b in names:
            table[cnames.index(country), names.index(b)] = L.idx[i]
    lang = np.full((IH, IW), -1, dtype=np.int32)
    m = (lab >= 0) & (state >= 0)
    lang[m] = table[state[m], lab[m]]
    # a branch painted where the country speaks none of its languages: the
    # nearest country's that does, else the branch's most-spoken language
    for k, n in enumerate(names):
        inb = lab == k
        miss = inb & (lang < 0)
        if not miss.any():
            continue
        have = inb & (lang >= 0)
        if have.any():
            _, (iy, ix) = ndimage.distance_transform_edt(~have, return_indices=True)
            lang[miss] = lang[iy[miss], ix[miss]]
        else:
            d = default(n)
            if d in L.idx:
                lang[miss] = L.idx[d]
    # land the map leaves unpainted (rivers, lakes, slivers): the nearest painted
    painted = lang >= 0
    if painted.any() and not painted.all():
        _, (iy, ix) = ndimage.distance_transform_edt(~painted, return_indices=True)
        lang = lang[iy, ix]
    return lang.astype(np.int16)


def map_families(L):
    """DJ's family map on the working grid: a family (index into L.fams) per
    pixel, -1 unpainted; None when the map is not on this computer."""
    legend = (by.read_json(LEGEND_PATH, {}) or {}).get('branches')
    if not legend or not os.path.exists(FAMILY_MAP):
        return None
    Image.MAX_IMAGE_PIXELS = None
    rgb = np.asarray(Image.open(FAMILY_MAP).convert('RGB'))
    rows = ((np.arange(H) + 0.5) * rgb.shape[0] / H).astype(int)
    cols = ((np.arange(W) + 0.5) * rgb.shape[1] / W).astype(int)
    p = by.pack(rgb[rows][:, cols]).astype(np.int64)
    fam_of = {b['name']: f['name'] for f in L.tree.doc.get('families', []) for b in f.get('branches') or []}
    out = np.full((H, W), -1, dtype=np.int16)
    for n, c in legend.items():
        if fam_of.get(n) in L.fams:
            out[p == pk(c)] = L.fams.index(fam_of[n])
    return out


# --- keyframe pictures ----------------------------------------------------------------------

CLASS_COLOURS = {pk(by.SEA): 0, pk(by.EMPTY): 1, pk(by.SAPIENS): 2, pk(by.ADVANCED): 3, pk(by.EMBRYONIC): 4}


def picture(lang_hi, rulers_hi, L, year):
    """A keyframe as colours: each language as the stage spoken that year, in
    its key colour; the sea, empty land and the greys where the yearly map has
    them; peoples whose language is lost in grey."""
    at = L.at(year)
    out = np.full((IH, IW), pk(by.ADVANCED), dtype=np.int64)
    m = lang_hi >= 0
    out[m] = L.keycol[at[lang_hi[m]]]
    g = ~m
    out[g & (rulers_hi == 2)] = pk(by.SAPIENS)
    out[g & (rulers_hi == 4)] = pk(by.EMBRYONIC)
    out[rulers_hi == 1] = pk(by.EMPTY)
    out[rulers_hi == 0] = pk(by.SEA)
    return out


def read_keyframe(path, L):
    """A commoners' keyframe -> (language index per pixel or -1, colours not in
    the key). Language colours are the key's (any stage of a line); sea,
    white and the greys are no language; anything else takes the nearest."""
    from scipy import ndimage
    Image.MAX_IMAGE_PIXELS = None
    rgb = np.asarray(Image.open(path).convert('RGB'))
    rows = ((np.arange(IH) + 0.5) * rgb.shape[0] / IH).astype(int)
    cols = ((np.arange(IW) + 0.5) * rgb.shape[1] / IW).astype(int)
    p = by.pack(rgb[rows][:, cols]).astype(np.int64)
    u, inv, cnt = np.unique(p, return_inverse=True, return_counts=True)
    inv = inv.ravel()
    val = np.full(len(u), -2, dtype=np.int32)   # -2: not a known colour
    unknown = []
    for k, c in enumerate(u.tolist()):
        if c in L.of_key:
            val[k] = L.of_key[c]
        elif c in CLASS_COLOURS:
            val[k] = -1
        elif cnt[k] >= 80 and by.unpack(c) not in (by.BLACK, by.UI):
            unknown.append({'rgb': by.hexof(by.unpack(c)), 'px': int(cnt[k]) // 4})
    lang = val[inv].reshape(IH, IW)
    odd = lang == -2
    if odd.any() and (~odd).any():
        _, (iy, ix) = ndimage.distance_transform_edt(odd, return_indices=True)
        lang = lang[iy, ix]
    lang[lang == -2] = -1
    return lang.astype(np.int16), unknown


def save_picture(codes, path):
    """Write a keyframe picture only if its pixels changed (no churn in git).
    -> True if written."""
    tmp = path + '.new.png'
    by.save_indexed(codes, tmp)
    if os.path.exists(path) and sha1(path) == sha1(tmp):
        os.remove(tmp)
        return False
    os.replace(tmp, path)
    return True


def manifest():
    return by.read_json(MANIFEST, {}).get('files', {})


def write_manifest(files):
    by.write_json(MANIFEST, {
        '_readme': "Keyframes the app wrote (scripts/build_years_commoners.py), with their checksums. A file whose checksum no longer matches "
                   "was edited by DJ: it is his, and the app never writes over it. Delete a file to get a fresh starter.",
        'files': dict(sorted(files.items(), key=lambda kv: kv[1].get('year', 0))),
    }, indent=1)


def kind_of(f, files):
    """'family-map' and 'starter' are the app's while unedited; else 'yours'."""
    e = files.get(f)
    p = os.path.join(KEYFRAMES, f)
    if not e or not os.path.exists(p) or sha1(p) != e.get('sha1'):
        return 'yours'
    return e.get('kind', 'starter')


def list_keyframes():
    """{year: file} of the commoners' keyframes on disk."""
    out = {}
    if os.path.isdir(KEYFRAMES):
        for f in os.listdir(KEYFRAMES):
            y = by.year_of(f)
            if y is not None and f.lower().endswith('.png') and 'ruler' not in f.lower() and not f.endswith('.new.png'):
                out[y] = f
    return dict(sorted(out.items()))


# --- switching between two keyframes --------------------------------------------------------

class Runs:
    """Each place's current run of rulers of one family, and since when."""

    def __init__(self):
        self.fam = np.full(W * H, -9, dtype=np.int8)
        self.start = np.zeros(W * H, dtype=np.int32)

    def step(self, year, f8):
        ch = f8 != self.fam
        self.fam[ch] = f8[ch]
        self.start[ch] = year


def interval(A, B, L, shift, thresh, frames, runs, people_before, y1, y2):
    """When each place switches from keyframe A's language (y1) to B's (y2),
    over the frames between (each (year, families)), advancing runs. A and B
    are languages per working-grid pixel (-1 none). -> switch year per pixel
    (NEVER where no switch: the same line, or both without a language)."""
    a_ok, b_ok = A >= 0, B >= 0
    both = a_ok & b_ok
    rel = np.zeros(W * H, dtype=bool)
    rel[both] = L.related[A[both], B[both]]
    need = (a_ok != b_ok) | (both & ~rel)
    S = np.full(W * H, NEVER, dtype=np.int32)
    fb = np.where(b_ok, L.fam[np.maximum(B, 0)], -9).astype(np.int8)
    factor = np.ones(W * H, dtype=np.float32)
    factor[~a_ok] = shift['lostPeoples']
    factor[both & ~rel & (L.fam[np.maximum(A, 0)] == fb)] = shift['sameFamily']
    d = thresh / factor
    settle = need & b_ok & ~a_ok & ~people_before
    first = np.full(W * H, NEVER, dtype=np.int32)
    for year, f8 in frames:
        runs.step(year, f8)
        todo = need & (S == NEVER)
        if not todo.any():
            continue
        m = todo & b_ok & (runs.fam == fb)
        first[m & (first == NEVER)] = year
        go = m & (year >= runs.start + d)
        go |= todo & settle & (f8 != NOBODY) & (f8 != SEA)       # empty land settled: at once
        go |= todo & ~b_ok & (f8 == GREY)                         # a language lost with its state
        S[go] = year
    rest = need & (S == NEVER)
    seen = rest & (first < NEVER)
    S[seen] = (first[seen] + y2) // 2
    S[rest & ~seen] = (y1 + y2) // 2
    S[need] = np.clip(S[need], y1 + 1, y2)
    return S


def prepare(A, B, S, anc):
    """Between keyframes A and B (languages per pixel, -1 none; S the switch
    years at the same size): whether each place switches, and where it does
    not, the language of its line to show (the later of the two)."""
    a_ok, b_ok = A >= 0, B >= 0
    both = a_ok & b_ok
    deep = np.where(b_ok, B, A)
    keep_a = np.zeros(A.shape, dtype=bool)
    keep_a[both] = ~anc[B[both], A[both]]       # A is the later stage of the line
    deep[keep_a] = A[keep_a]
    return S < NEVER, deep


def choose(t, A, B, S, need, deep):
    """Each place's language (unresolved) at year t between keyframes A and B."""
    return np.where(need, np.where(S <= t, B, A), deep).astype(np.int16)


# --- before DJ's earliest keyframe: backwards ---------------------------------------------

class Backward:
    """Works out, going forward through the frames up to DJ's earliest keyframe
    (target T: its language per working-grid pixel), when each place took up
    T's line, and what its people spoke before.

    Arrival: the first frame T's family rules the place; for a place it never
    rules, the first frame it rules within nearKm. The switch comes once the
    family has ruled it for the shift time (faster for peoples whose language
    is lost or for a related language), or, if the keyframe comes sooner, at
    catchUp of the way from the arrival to it. Before: the language of the
    longest run of other rulers before the arrival, if it held heldYears or
    more; else a language now lost."""

    def __init__(self, T, y0, L, shift, thresh):
        n = W * H
        self.T, self.y0, self.L, self.k, self.thresh = T, y0, L, shift, thresh
        self.F = np.where(T >= 0, L.fam[np.maximum(T, 0)], -9).astype(np.int8)
        self.first = np.full(n, NEVER, dtype=np.int32)
        self.near = np.full(n, NEVER, dtype=np.int32)
        self.E = np.zeros(n, dtype=np.float32)
        self.cross = {f: np.full(n, NEVER, dtype=np.int32) for f in ('lost', 'same', 'other')}
        self.run_fam = np.full(n, -9, dtype=np.int8)
        self.run_start = np.zeros(n, dtype=np.int32)
        self.run_len = np.zeros(n, dtype=np.float32)
        self.run_lang = np.full(n, -1, dtype=np.int16)
        self.best = {w: [np.full(n, -1, dtype=np.int16), np.zeros(n, dtype=np.int32), np.zeros(n, dtype=np.float32)] for w in ('first', 'near')}
        self.prev = None
        # the coarse grid for "rules nearby": 4x4 blocks, the reach in blocks
        self.cy = (np.arange(H) // 4)[:, None] * (W // 4) + (np.arange(W) // 4)[None, :]
        self.cy = self.cy.ravel()
        km_block = 4 * 360.0 / W * 111.2
        self.reach = max(1, int(round(shift['nearKm'] / km_block)))
        self.bit = np.left_shift(np.int64(1), np.maximum(self.F, 0).astype(np.int64))

    def _close(self, m):
        """Close the runs at pixels m: keep each as the best so far where it is longer."""
        for w, (lang, start, ln) in self.best.items():
            frozen = (self.first if w == 'first' else self.near) < NEVER
            better = m & ~frozen & (self.run_len > ln) & (self.run_lang >= 0)
            lang[better] = self.run_lang[better]
            start[better] = self.run_start[better]
            ln[better] = self.run_len[better]

    def step(self, year, rc, f8):
        if year > self.y0:
            return
        dt = 5 if self.prev is None else year - self.prev
        self.prev = year
        F = self.F
        rl = (rc >= LANG0) & (rc < CIV0)
        stage = np.where(rl, rc - LANG0, -1).astype(np.int16)
        isF = (f8 == F) & (F >= 0)
        # nearby: the family's rule within reach, on the coarse grid
        bits = np.zeros(H * W, dtype=np.int64)
        fam_ok = f8 >= 0
        bits[fam_ok] = np.left_shift(np.int64(1), f8[fam_ok].astype(np.int64))
        cb = np.bitwise_or.reduce(bits.reshape(H // 4, 4, W // 4, 4), axis=(1, 3))
        acc = cb.copy()
        for s in range(1, self.reach + 1):
            acc |= np.roll(cb, s, axis=1) | np.roll(cb, -s, axis=1)
        out = acc.copy()
        for s in range(1, self.reach + 1):
            out[s:] |= acc[:-s]
            out[:-s] |= acc[s:]
        near_now = (out.ravel()[self.cy] & self.bit) != 0
        near_now &= F >= 0
        # runs of other rulers (before the arrivals)
        g = np.where(fam_ok & ~isF, f8, -9).astype(np.int8)
        cont = (g == self.run_fam) & (g >= 0)
        self.run_len[cont] += dt
        self.run_lang[cont] = stage[cont]
        brk = ~cont
        self._close(brk)
        new = brk & (g >= 0)
        self.run_fam[brk] = g[brk]
        self.run_start[new] = year
        self.run_len[brk] = np.where(new[brk], dt, 0)
        self.run_lang[brk] = np.where(new[brk], stage[brk], -1)
        # arrivals: freeze the best run before each
        nn = near_now & (self.near == NEVER)
        self._close(nn)
        self.near[nn] = year
        nf = isF & (self.first == NEVER)
        self._close(nf)
        self.first[nf] = year
        # years of the family's rule, and when they reach the shift time
        self.E[isF] += dt
        for f, fac in (('lost', self.k['lostPeoples']), ('same', self.k['sameFamily']), ('other', 1.0)):
            c = self.cross[f]
            c[(c == NEVER) & isF & (self.E >= self.thresh / fac)] = year

    def finish(self):
        """-> (S, P, P_start): the switch to T's line; the language before it
        (-1 lost) and when that one took the place."""
        k, y0 = self.k, self.y0
        self._close(np.ones(W * H, dtype=bool))
        direct = self.first < NEVER
        nearby = ~direct & (self.near < NEVER)
        A = np.where(direct, self.first, self.near)
        P = np.where(direct, self.best['first'][0], self.best['near'][0])
        Ps = np.where(direct, self.best['first'][1], self.best['near'][1])
        Pl = np.where(direct, self.best['first'][2], self.best['near'][2])
        P[Pl < k['heldYears']] = -1
        lost = P < 0
        same = ~lost & (self.L.fam[np.maximum(P, 0)] == self.F)
        fac = np.where(lost, k['lostPeoples'], np.where(same, k['sameFamily'], 1.0)).astype(np.float32)
        d = self.thresh / fac
        cross = np.where(lost, self.cross['lost'], np.where(same, self.cross['same'], self.cross['other']))
        late = A + np.minimum(d, (y0 - A) * k['catchUp']).astype(np.int32)
        S = np.full(W * H, -NEVER, dtype=np.int32)                # native: T's line all along
        S[direct] = np.where(cross[direct] < NEVER, cross[direct], late[direct])
        S[nearby] = late[nearby]
        S[self.T < 0] = -NEVER
        # the earlier rulers' language: their people's after a lifetime or two
        Pst = Ps + np.minimum(self.thresh / k['lostPeoples'], np.maximum(0, S - Ps) / 2).astype(np.int32)
        P[(S <= -NEVER) | (Pst >= S)] = -1
        return S, P.astype(np.int16), Pst

    @staticmethod
    def state(t, S, P, Pst):
        """0: T's line; 1: the earlier rulers' language; 2: lost."""
        return np.where(t >= S, 0, np.where((P >= 0) & (t >= Pst), 1, 2)).astype(np.int8)
