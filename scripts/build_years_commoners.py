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


def kf_rel(year, layer='commoners'):
    """Where a keyframe lives in data/language-maps/ (DJ, 16 Oct 2026: AFA and
    BFA, and in each, commoners and rulers): 'AFA/commoners/1765 AFA - commoners.png'."""
    return f"{'AFA' if year >= 0 else 'BFA'}/{layer}/{by.label(year)} - {layer}.png"


def kf_name(year):
    return kf_rel(year, 'commoners')


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
        by_id = tree.by_id
        self.born = np.array([by_id[i]['born'] if by_id[i].get('born') is not None else -NEVER for i in lang_ids], dtype=np.int64)
        self.died = np.array([by_id[i]['died'] if by_id[i].get('died') is not None else NEVER for i in lang_ids], dtype=np.int64)
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


def family_anchor(L, land=None):
    """DJ's family map as a language map at picture size: (a language index per
    pixel, -1 for none; the languages placed by place_unplaced), or None when
    the map is not on this computer. land: where 1765's yearly map has people
    (the coasts differ a little from the family map's); every such pixel gets
    a language, and only those."""
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
    if land is not None:
        lang[~land] = -1
    lang = lang.astype(np.int16)
    placed = place_unplaced(L, lang, state, cnames)
    return lang, placed


# the compass in a language's name (Northeastern Dahen): where in its host's land it goes
COMPASS = (('northeast', (0.85, 0.15)), ('northwest', (0.15, 0.15)), ('southeast', (0.85, 0.85)), ('southwest', (0.15, 0.85)),
           ('north', (0.5, 0.1)), ('south', (0.5, 0.9)), ('east', (0.9, 0.5)), ('west', (0.1, 0.5)), ('central', (0.5, 0.5)))


def place_unplaced(L, lang, state=None, cnames=None):
    """Living languages no country names (Dahen's dialects, most of
    Dahen-Kino) on the map at all (DJ, 15 Oct 2026: "I place them, you
    check"). Its nearest relatives on the map (under the first ancestor with
    languages on the map) host it: each subgroup with nothing on the map goes
    to one of them (where its name points, else the one with the most land per
    language it already hosts) and is split down its own branches there, so
    related languages stay together. A name points with a compass word
    (Southwestern Dahen: the south-west) or a country or continent (Pha Hii
    Dialect: Pha Hii); one that points where its relatives have no land is not
    placed. Each host keeps half its land, around its middle; its guests share
    the rest by how many languages each holds. In place; -> the placements."""
    tree = L.tree
    u, cnt = np.unique(lang[lang >= 0], return_counts=True)
    present = set(u.tolist())
    if not present:
        return []
    if state is None:
        state, cnames = country_raster(IW, IH)
    continent = {}
    for l in tree.doc['languages']:
        for a in l.get('areas') or []:
            if a.get('continent'):
                continent[a['state']] = a['continent']
    places = [(n.lower(), [k]) for k, n in enumerate(cnames)]
    place_names = list(cnames)
    for c in sorted(set(continent.values())):
        places.append((c.lower(), [k for k, n in enumerate(cnames) if continent.get(n) == c]))
        place_names.append(c)

    def hint(name):
        """('compass', (fx, fy)) | ('place', [country indices], its name) | None"""
        low = name.lower()
        word = low.split()[0]
        for c, t in COMPASS:
            if word.startswith(c):
                return 'compass', t
        for (c, ks), shown in zip(places, place_names):
            if (' ' in c and c in low) or any(len(c) >= 5 and w.startswith(c[:-1]) for w in low.split()) or c in low.split():
                return 'place', ks, shown
        return None

    def living_leaves(n):
        out, stack = [], [n]
        while stack:
            x = stack.pop()
            ks = tree.kids.get(x, [])
            l = tree.by_id[x]
            if not ks and l.get('died') is None and l.get('kind') != 'constructed':
                out.append(L.idx[x])
            stack += ks
        return out

    def has_present(n):
        a = L.idx[n]
        return any(L.anc[p, a] for p in present)
    # each unplaced living language under its first ancestor with languages on the map
    hosts = {}
    for k, i in enumerate(L.ids):
        l = tree.by_id[i]
        if k in present or tree.kids.get(i) or l.get('died') is not None or l.get('kind') == 'constructed' or l.get('generated'):
            continue   # (old dialects have their own regions: build_years_dialects.py)
        cur = l.get('parentId')
        while cur in tree.by_id:
            if has_present(cur):
                hosts.setdefault(cur, set()).add(k)
                break
            cur = tree.by_id[cur].get('parentId')
    def depth(n):
        d = 0
        while tree.by_id[n].get('parentId') in tree.by_id:
            n = tree.by_id[n]['parentId']
            d += 1
        return d
    placed = []
    guests = {}       # relative on the map -> [(host ancestor, group, its languages)]
    load = {}
    size = {}
    for A in sorted(hosts, key=lambda n: (depth(n), n)):
        us = hosts[A]
        # the groups to place: A's children with unplaced languages and nothing on the map
        units = []
        for c in tree.kids.get(A, []):
            if not has_present(c):
                leaves = [k for k in living_leaves(c) if k in us]
                if leaves:
                    units.append((c, leaves))
        mine = [p for p in present if L.anc[p, L.idx[A]]]
        for p in mine:
            if p not in size:
                size[p] = int((lang == p).sum())
                load[p] = 0
        mine = sorted(p for p in mine if size[p] >= 50)
        if not units or not mine:
            continue
        # each group goes to one relative: where its name points, else the
        # one with the most land per language it already hosts
        for c, lv in sorted(units, key=lambda u: (-len(u[1]), u[0])):
            h = hint(tree.by_id[c]['name'])
            if h and h[0] == 'place':
                inside = {p: int(((lang == p) & np.isin(state, h[1])).sum()) for p in mine}
                rel = max(inside, key=lambda p: (inside[p], p))
                if not inside[rel]:              # its name points where its relatives have no land
                    placed += [{'id': L.ids[k], 'host': A, 'with': [], 'where': 'not placed', 'place': h[2]} for k in lv]
                    continue
            elif h and h[0] == 'compass':
                ys, xs = np.nonzero(np.isin(lang, mine))
                fx, fy = h[1]
                tx, ty = xs.min() + fx * (xs.max() - xs.min()), ys.min() + fy * (ys.max() - ys.min())
                j_ = int(np.argmin((xs - tx) ** 2 + (ys - ty) ** 2))
                rel = int(lang[ys[j_], xs[j_]])
            else:
                rel = max(mine, key=lambda p: (size[p] / (1 + load[p]), p))
            guests.setdefault(rel, []).append((A, c, lv))
            load[rel] += len(lv)
    # each relative shared out once: it keeps half its land, around its middle
    for rel, gs in sorted(guests.items()):
        ys, xs = np.nonzero(lang == rel)
        pts = np.column_stack([xs, ys]).astype(np.float64)
        owner = carve(pts, [(rel, None, 1.0)], [(c, hint(tree.by_id[c]['name']), len(lv)) for _, c, lv in gs],
                      lang[ys, xs], state[ys, xs], int(rel))
        for k, (A, c, leaves) in enumerate(gs, start=1):
            m = owner == k
            if not m.any():
                continue
            done = split(pts[m], c, set(leaves), state[ys[m], xs[m]], hint, tree, L)
            lang[ys[m], xs[m]] = done
            for leaf in sorted(set(done.tolist())):
                if leaf in hosts[A]:
                    h = hint(tree.by_id[L.ids[leaf]]['name'])
                    placed.append({'id': L.ids[leaf], 'host': A, 'with': [L.ids[rel]],
                                   'where': 'where its name points' if h else 'in part of its land'})
    return placed


_WOBBLE = []


def wobble():
    """A smooth noise field at picture size, so the borders the app draws
    wander like real ones instead of running straight."""
    if not _WOBBLE:
        from scipy import ndimage
        rng = np.random.default_rng(1765)
        n = ndimage.gaussian_filter(rng.standard_normal((IH // 4, IW // 4)).astype(np.float32), 6, mode='wrap')
        n = ndimage.zoom(n / (n.std() + 1e-9), 4, order=1)[:IH, :IW]   # smooth, not blocky
        _WOBBLE.append(n)
    return _WOBBLE[0]


def carve(pts, fixed, units, own, st, seed, fixed_share=None):
    """Share a region (pts) between the languages already there (fixed: they
    keep half, each by its land, around its middle) and new units (the other
    half, by how many languages each holds; where a name points, else as far
    from the rest as can be). Shares are met by a balanced power diagram, so
    a small group still gets its due. A fixed entry may give its own seed
    point, a unit ('point', (x, y)); fixed_share overrides the half.
    -> index per point into fixed + units; a unit whose name points where
    none of pts lie gets nothing."""
    from scipy.spatial import cKDTree
    kd = cKDTree(pts)
    x0, x1 = pts[:, 0].min(), pts[:, 0].max()
    y0, y1 = pts[:, 1].min(), pts[:, 1].max()
    seeds, want, idx = [], [], []
    held = [(k, own == p) for k, (p, _, _) in enumerate(fixed)]
    held = [(k, m) for k, m in held if m.any()]
    total_fixed = sum(int(m.sum()) for _, m in held)
    if fixed_share is None:
        fixed_share = 0.5 if held and units else (1.0 if held else 0.0)
    for k, m in held:
        pos = fixed[k][1]
        if pos is not None:
            _, j = cKDTree(pts[m]).query(pos)
        else:
            _, j = cKDTree(pts[m]).query(pts[m].mean(axis=0))
        seeds.append(pts[m][j]); want.append(fixed_share * m.sum() / total_fixed); idx.append(k)
    rng = np.random.default_rng(seed)
    sample = pts[rng.choice(len(pts), size=min(len(pts), 20000), replace=False)]
    unit_seeds, later = [], []
    for k, (c, h, n) in enumerate(units, start=len(fixed)):
        if h and h[0] == 'point':
            _, j = kd.query(h[1])
            unit_seeds.append((k, pts[j], n))
        elif h and h[0] == 'compass':
            _, j = kd.query((x0 + h[1][0] * (x1 - x0), y0 + h[1][1] * (y1 - y0)))
            unit_seeds.append((k, pts[j], n))
        elif h and h[0] == 'place':
            m = np.isin(st, h[1])
            if m.any():                  # in that place, as far as can be from the others there
                inside = pts[m]
                d = cKDTree(np.array(seeds)).query(inside)[0] if seeds else np.zeros(len(inside))
                j = int(np.argmax(d)) if d.max() > 0 else int(cKDTree(inside).query(inside.mean(axis=0))[1])
                unit_seeds.append((k, inside[j], n))
        else:
            later.append((k, n))
    for k, p, n in unit_seeds:
        seeds.append(p); idx.append(k); want.append(n)
    for k, n in later:
        d, _ = cKDTree(np.array(seeds)).query(sample) if seeds else (np.ones(len(sample)), None)
        seeds.append(sample[int(np.argmax(d))]); idx.append(k); want.append(n)
    want = np.array(want, dtype=np.float64)
    nf = len(held)
    if len(want) > nf:
        want[nf:] = (1 - fixed_share) * want[nf:] / want[nf:].sum()
    S = np.array(seeds)
    D = (pts[:, None, 0] - S[None, :, 0]) ** 2 + (pts[:, None, 1] - S[None, :, 1]) ** 2
    step = float(np.median(D))
    # each seed's own wobble (the one field, shifted), so borders wander
    N = wobble()
    px, py = pts[:, 0].astype(np.int64), pts[:, 1].astype(np.int64)
    for j in range(len(S)):
        D[:, j] += 0.2 * step * N[(py + 389 * j) % IH, (px + 997 * j) % IW]
    w = np.zeros(len(S))
    keep, err = None, np.inf
    for it in range(120):
        best = np.argmin(D - w, axis=1)
        size = np.bincount(best, minlength=len(S)) / len(pts)
        e = float(np.abs(want - size).sum())
        if e < err:
            keep, err = best, e
        w += step * (want - size) * (0.8 if it < 60 else 0.25)
    return np.array(idx, dtype=np.int64)[keep]


def split(pts, node, leaves, st, hint, tree, L):
    """A unit's region down its own branches to its living languages: -> a
    language index per point."""
    if L.idx[node] in leaves and not tree.kids.get(node):
        return np.full(len(pts), L.idx[node], dtype=np.int16)
    parts = []
    for c in tree.kids.get(node, []):
        below = [k for k in leaves if L.anc[k, L.idx[c]]]
        if below:
            parts.append((c, below))
    if len(parts) == 1:
        return split(pts, parts[0][0], leaves, st, hint, tree, L)
    owner = carve(pts, [], [(c, hint(tree.by_id[c]['name']), len(b)) for c, b in parts], np.full(len(pts), -1), st, int(L.idx[node]))
    out = np.full(len(pts), -1, dtype=np.int16)
    for k, (c, below) in enumerate(parts):
        m = owner == k
        if m.any():
            out[m] = split(pts[m], c, leaves, st[m], hint, tree, L)
    if (out < 0).any():   # a part whose name points elsewhere: its land to the nearest
        from scipy.spatial import cKDTree
        ok = out >= 0
        if ok.any():
            _, j = cKDTree(pts[ok]).query(pts[~ok])
            out[~ok] = out[ok][j]
    return out


def official_rulers(L, codes):
    """The rulers' layer of 1765 as each country's official language (DJ,
    15 Oct 2026: the yearly maps draw blocks of culture, not countries):
    named for the country first, then official before colonial, then the one
    fewest countries share; Lastnu only where it is the only one. Elsewhere the
    civilisations' languages. codes: the rulers' codes at picture size."""
    from build_years_languages import stems
    tree = L.tree
    reach = {l['id']: len(l.get('areas') or []) for l in tree.doc['languages']}
    best = {}
    for l in tree.doc['languages']:
        if l['id'] not in L.idx:
            continue
        for a in l.get('areas') or []:
            rank = (l.get('kind') == 'constructed', not (stems(l['name']) & stems(a['state'])), a.get('role') != 'official', reach[l['id']], l['id'])
            if a['state'] not in best or rank < best[a['state']][0]:
                best[a['state']] = (rank, L.idx[l['id']])
    state, cnames = country_raster(IW, IH)
    table = np.array([best[n][1] if n in best else -1 for n in cnames] + [-1], dtype=np.int64)
    pick = table[np.where(state >= 0, state, len(cnames))]
    m = (pick >= 0) & (codes != 0) & (codes != 1)
    out = codes.copy()
    out[m] = LANG0 + pick[m]
    return out


def rulers_picture(codes, L):
    """A rulers' keyframe as colours: languages in their key colours, the sea,
    empty land and greys as on DJ's maps, a civilisation with no language in
    the legend grey (the civilisation decides)."""
    out = np.full(codes.shape, pk(by.UI), dtype=np.int64)
    m = (codes >= LANG0) & (codes < CIV0)
    out[m] = L.keycol[codes[m] - LANG0]
    for c, rgb in ((0, by.SEA), (1, by.EMPTY), (2, by.SAPIENS), (3, by.ADVANCED), (4, by.EMBRYONIC)):
        out[codes == c] = pk(rgb)
    return out


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
    os.makedirs(os.path.dirname(path), exist_ok=True)
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


def list_keyframes(layer='commoners'):
    """{year: path under data/language-maps/} of one layer's keyframes, in
    any folder there (a file is the rulers' if its name or folder says so)."""
    out = {}
    for d, _, fs in os.walk(KEYFRAMES):
        rel_dir = os.path.relpath(d, KEYFRAMES).replace('\\', '/')
        for f in fs:
            y = by.year_of(f)
            if y is None or not f.lower().endswith('.png') or f.endswith('.new.png'):
                continue
            rulers = 'ruler' in f.lower() or 'rulers' in rel_dir.lower().split('/')
            if rulers == (layer == 'rulers'):
                out[y] = f if rel_dir == '.' else f'{rel_dir}/{f}'
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
    # the chart's own dates come first: a language dying between the two
    # keyframes is replaced when it dies (an old dialect by its standard);
    # one born between them takes over when it is born
    dA = np.where(a_ok, L.died[np.maximum(A, 0)], NEVER)
    bB = np.where(b_ok, L.born[np.maximum(B, 0)], -NEVER)
    by_death = need & a_ok & (dA > y1) & (dA <= y2)
    S[by_death] = dA[by_death]
    by_birth = need & b_ok & ~by_death & (bB > y1) & (bB <= y2)
    S[by_birth] = bB[by_birth]
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
