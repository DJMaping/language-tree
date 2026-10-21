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
    place about 300 years or more. A people with no civilisation over them
    (the greys of his maps) spoke the language its place shows later all
    along (DJ, 19 Oct 2026: "they do have languages ... those have been there
    the whole time"), unless that language's family reached them by sea: a
    colony's language came with its settlers, and what was spoken before is
    lost (grey). Between two of his own keyframes the starters follow the
    switching rule below. A starter he has edited is his, and never
    overwritten.
  * The map shows only keyframes. Between two that disagree about a place, it
    switches once its new language's family has ruled it for the shift time
    (about 300 years, varied by district; faster between related languages
    and for peoples whose language is lost), always between the two
    keyframes; with no such rulers, halfway between them.
  * A regional keyframe (part of the world) is cut out with straight edges;
    past a cut its edge languages carry on over the land (past_cuts), so the
    cut never shows as a border.

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
        self.fam = np.array([self.fams.index(tree.family[i]) for i in lang_ids], dtype=np.int16)
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
        out = np.full(rc.shape, UNKNOWN, dtype=np.int16)
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


MIGRATIONS = os.path.join(ROOT, 'data', 'history', 'migrations.json')


def _land_picture():
    """Where the land is, at picture size."""
    import build_years_terrain as bt
    return np.repeat(np.repeat(bt.land(), 2, axis=0), 2, axis=1)[:IH, :IW]


def _nearest(base, src, km=None, share=None):
    """The part of base (picture size) nearest src: a share of it, or as much as
    lies within km, but nearest by travel over the land (build_years_terrain),
    so its edge follows the valleys and hills; an even distance drew a smooth
    band along the border or coast."""
    from scipy import ndimage
    import build_years_terrain as bt
    if not base.any():
        return base
    if share is None:
        lat = 90.0 - (np.nonzero(base)[0].mean() + 0.5) * 180.0 / IH
        px = 40075.0 / IW
        d = ndimage.distance_transform_edt(~src, sampling=(px, px * np.cos(np.radians(lat))))
        share = (base & (d <= float(km or 200))).sum() / max(base.sum(), 1)
    grp = base[::2, ::2]
    r = np.full(grp.shape, np.inf, dtype=np.float32)
    r[grp] = bt.front_rank(src[::2, ::2], grp)
    return base & np.repeat(np.repeat(r <= float(share), 2, axis=0), 2, axis=1)[:IH, :IW]


def _shared(sel, langs):
    """sel's land (picture size) shared evenly between several languages, each
    round a seed spread as far from the others as the land allows, the
    borders by travel (build_years_terrain.carve). -> language per pixel of sel."""
    import build_years_terrain as bt
    landw = sel[::2, ::2].copy()
    ys, xs = np.nonzero(landw)
    if len(ys) < len(langs):
        return np.full(int(sel.sum()), langs[0], dtype=np.int16)
    pts = [int(np.argmax((ys - ys.mean()) ** 2 + (xs - xs.mean()) ** 2))]
    while len(pts) < len(langs):
        d = np.min([(ys - ys[p]) ** 2 + (xs - xs[p]) ** 2 for p in pts], axis=0)
        pts.append(int(np.argmax(d)))
    owner, _ = bt.carve(landw, [(int(xs[p]), int(ys[p])) for p in pts], [1] * len(langs), rough_land=True)
    lw = np.full(landw.shape, -1, dtype=np.int16)
    lw[landw] = np.asarray(langs, dtype=np.int16)[owner]
    big = np.repeat(np.repeat(lw, 2, axis=0), 2, axis=1)[:IH, :IW]
    big = np.where(big >= 0, big, langs[0])
    return big[sel]


def migration_layers(L, layers, snap, stateless=None, ruled=None):
    """DJ's word on where peoples moved (data/history/migrations.json): each
    keyframe a year and the land of some of his 1765 countries, speaking one
    language, or "as in 1765" (what his last whole map shows there, as its
    stage that year). Taken as regional keyframes of his, so the yearly map
    goes between them by the usual rule, outwards from the language's
    speakers (DJ, 19 Oct 2026: the Pelugrotoan languages came from Quia
    through Ashain, whose first people they were, before the ancestors of
    Ashain's people today took the islands).
    A keyframe can speak only in part of its land ("where"), the rest
    speaking what DJ's word had there before: "stateless", the land no state
    held on the rulers' map that year (a people that came without one: the
    Pelugrotoans were by the coast, outside Mervan, whose own land spoke
    another language; DJ: "it goes from the coast down instead of inland
    out"), "east" / "west" / "north" / "south", the islands or land
    farthest that way, a tenth of it (where colonists landed first), or
    {"near": a 1765 country, "km": distance or "share": fraction}, the land
    that close to it (Tyrnotean along the Inania border), {"coast": km}, the
    land that close to the sea (the Passonians' coast), and with any of them
    "instead of": a family or language, only the land DJ's last map gives it
    (the Dahen-Kino land of Etretes). "speaks" can be a list: the land shared
    between them (Finae's Biorundi, Trenz and Garlls). Keyframes of one year
    make one map.
    {"ruled by": a state on DJ's rulers' maps, "year": y}: the land it held
    then (the Pyrruans' hills in Finae).
    stateless(year): the rulers' map's stateless land that year; ruled(name,
    year): the land that state held.
    -> [(year, language per pixel, where it speaks)]."""
    from scipy import ndimage
    doc = by.read_json(MIGRATIONS, None)
    entries = [e for e in (doc or {}).get('keyframes', []) if e.get('year') is not None]
    if not entries:
        return []
    state, names = country_raster(IW, IH)
    index = {n: k for k, n in enumerate(names)}
    whole = [t for t in layers if t[2] is None]
    last = max(whole, key=lambda t: t[0])[1] if whole else None
    known = np.full((IH, IW), -1, dtype=np.int16)      # what DJ's word has them speaking so far
    out = {}
    for e in sorted(entries, key=lambda e: e['year']):
        ks = [index[c] for c in e.get('countries', []) if c in index]
        missing = [c for c in e.get('countries', []) if c not in index]
        if missing:
            print(f'migrations.json: no 1765 country named {", ".join(missing)}')
        if not ks:
            continue
        year = int(e['year'])
        cov = np.isin(state, ks)
        speaks = e.get('speaks')
        lst = speaks if isinstance(speaks, list) else [speaks]
        neigh = speaks if isinstance(speaks, dict) else None
        if neigh is None and not (speaks == 'as in 1765' and last is not None) and any(x not in L.idx for x in lst):
            print(f'migrations.json: no language "{speaks}" in the tree')
            continue
        where = e.get('where')
        w = where if isinstance(where, dict) else {}
        base = cov.copy()
        if w.get('instead of') and last is not None:
            # only the land DJ's last map gives that family or line (Etretes' Dahen-Kino land)
            x = w['instead of']
            lastv = np.asarray(last)
            if x in L.idx:
                base &= (lastv >= 0) & L.related[np.maximum(lastv, 0), L.idx[x]]
            elif x in L.fams:
                base &= (lastv >= 0) & (L.fam[np.maximum(lastv, 0)] == L.fams.index(x))
            else:
                print(f'migrations.json: no family or language "{x}" to stand instead of')
                continue
        if w.get('ruled by'):
            if ruled is None:
                continue
            base &= ruled(w['ruled by'], int(w.get('year', year)))
        if where is None or (w and not ({'near', 'coast'} & set(w))):
            sel = base
        elif where == 'stateless':
            if stateless is None:
                continue
            sel = base & stateless(year)
        elif w.get('near') in index or 'coast' in w:
            src = (state == index[w['near']]) if 'near' in w else ~_land_picture()
            sel = _nearest(base, src, km=w.get('km', w.get('coast')), share=w.get('share'))
        elif where in ('east', 'west', 'north', 'south'):
            # whole islands (or the land) farthest that way, until a tenth of it
            ys, xs = np.nonzero(base)
            lon = xs * 2 * np.pi / IW
            mid = np.angle(np.exp(1j * lon).mean())
            x = np.angle(np.exp(1j * (lon - mid)))                    # across the date line too
            v = {'east': x, 'west': -x, 'north': -ys.astype(float), 'south': ys.astype(float)}[where]
            lab, n = ndimage.label(base)
            per = lab[ys, xs]
            reach_of = np.full(n + 1, -np.inf)
            np.maximum.at(reach_of, per, v)
            size = np.bincount(per, minlength=n + 1)
            sel = np.zeros_like(base)
            got = 0
            for k in np.argsort(-reach_of[1:]) + 1:
                if got >= 0.1 * len(ys):
                    break
                sel |= lab == k
                got += size[k]
            if got > 0.3 * len(ys):                                 # one land: its far tenth
                sel = np.zeros_like(base)
                cut = np.quantile(v, 0.9)
                sel[ys[v >= cut], xs[v >= cut]] = True
        else:
            print(f'migrations.json: no "where" called "{where}"')
            continue
        lang = np.full((IH, IW), -1, dtype=np.int16)
        lost = np.zeros((IH, IW), dtype=bool)
        if neigh is not None:
            # as the nearest people of another family on DJ's last map spoke (of the family named,
            # or any but the one it stands instead of), within km; past that, "else": "lost"
            lastv = np.asarray(last)
            src = lastv >= 0
            fam_l = np.where(src, L.fam[np.maximum(lastv, 0)], -1)
            if neigh.get('neighbours') in L.fams:
                src &= fam_l == L.fams.index(neigh['neighbours'])
            if w.get('instead of') in L.fams:
                src &= fam_l != L.fams.index(w['instead of'])
            elif w.get('instead of') in L.idx:
                src &= ~L.related[np.maximum(lastv, 0), L.idx[w['instead of']]]
            if not src.any():
                print(f'migrations.json: no {neigh.get("neighbours") or "other"} speakers to stand in for {e["countries"]}')
                continue
            lat = 90.0 - (np.nonzero(sel)[0].mean() + 0.5) * 180.0 / IH if sel.any() else 0.0
            px = 40075.0 / IW
            d, (iy, ix) = ndimage.distance_transform_edt(~src, sampling=(px, px * np.cos(np.radians(lat))), return_indices=True)
            near = sel & (d <= float(neigh.get('km', 300)))
            lang[near] = lastv[iy[near], ix[near]]
            if neigh.get('else') == 'lost':
                lost = sel & ~near
        elif speaks == 'as in 1765':
            lang[sel] = np.asarray(last)[sel]
        elif len(lst) == 1:
            lang[sel] = L.idx[speaks if not isinstance(speaks, list) else lst[0]]
        else:
            lang[sel] = _shared(sel, [L.idx[x] for x in lst])
        now = np.where(sel, lang, known).astype(np.int16)
        c = cov & ((now >= 0) | lost)          # a lost people's land is a keyframe too: no known speech
        known[c] = now[c]
        if not c.any():
            continue
        y = snap(year)
        if y in out:                                             # the later word of a year wins where it speaks
            out[y][0][c] = now[c]
            out[y][1][...] |= c
        else:
            out[y] = (now, c)
    return [(y, lang, c) for y, (lang, c) in sorted(out.items())]


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


def continuation(L, i, year):
    """A language's line in a later year: itself while it lives, else the
    stage it became (Middle Ealdorii -> Ealdorii); -1 if the line died out."""
    tree = L.tree
    cur = L.ids[i]
    for _ in range(50):
        if L.died[L.idx[cur]] > year:
            return L.idx[cur]
        nxt = [k for k in tree.kids.get(cur, []) if tree.by_id[k].get('relation') == 'stage']
        if not nxt:
            return -1
        cur = nxt[0]
    return -1


def branch_index(L, names):
    """Each language's branch on the family map (index into names), -1 for none."""
    tree = L.tree
    node = {b.get('nodeId'): b['name'] for f in tree.doc.get('families', []) for b in f.get('branches') or [] if b.get('nodeId')}
    out = np.full(L.n, -1, dtype=np.int64)
    for k, i in enumerate(L.ids):
        cur = i
        while cur in tree.by_id:
            if cur in node and node[cur] in names:
                out[k] = names.index(node[cur])
                break
            cur = tree.by_id[cur].get('parentId')
    return out


def family_anchor(L, land=None, earlier=None, year=ANCHOR_YEAR):
    """DJ's family map as a language map at picture size: (a language index per
    pixel, -1 for none; the languages placed by place_unplaced), or None when
    the map is not on this computer. land: where 1765's yearly map has people
    (the coasts differ a little from the family map's); every such pixel gets
    a language, and only those.

    earlier: DJ's own maps of earlier years (his 1565 Ayuma map), a language
    per pixel (-1 where they say nothing). The family map gives only branches,
    so within a branch the language is a guess by country; where he has drawn
    the language himself, 1765 continues his: the same language, or the stage
    it became, even where the family map paints another branch (DJ, 17 Oct
    2026: "Using the new map in 1565, make sure you adjust the future";
    "1565 wins"). Where his language died out, the family map's choice
    stands, and the language hands over when it dies."""
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
    if earlier is not None:
        bidx = branch_index(L, names)
        cont = np.array([continuation(L, k, year) for k in range(L.n)], dtype=np.int64)
        e = earlier.astype(np.int64)
        ok = (e >= 0) & (lang >= 0)
        c = np.full(e.shape, -1, dtype=np.int64)
        c[ok] = cont[e[ok]]
        ok &= c >= 0
        # his own map wins over the family map wherever its language lives on
        # (DJ, 17 Oct 2026: "1565 wins"), whatever branch the family map paints there
        same = ok
        lang[same] = c[same]
        protect = same
    else:
        protect = None
    lang = lang.astype(np.int16)
    placed = place_unplaced(L, lang, state, cnames, protect=protect)
    return lang, placed


# the compass in a language's name (Northeastern Dahen): where in its host's land it goes
COMPASS = (('northeast', (0.85, 0.15)), ('northwest', (0.15, 0.15)), ('southeast', (0.85, 0.85)), ('southwest', (0.15, 0.85)),
           ('north', (0.5, 0.1)), ('south', (0.5, 0.9)), ('east', (0.9, 0.5)), ('west', (0.1, 0.5)), ('central', (0.5, 0.5)))


def place_unplaced(L, lang, state=None, cnames=None, protect=None):
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
    the rest by how many languages each holds. Land in `protect` (where DJ's
    own maps say what is spoken) is never given away. In place; -> the
    placements."""
    tree = L.tree
    free = np.ones(lang.shape, dtype=bool) if protect is None else ~protect
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
                size[p] = int(((lang == p) & free).sum())
                load[p] = 0
        mine = sorted(p for p in mine if size[p] >= 50)
        if not units or not mine:
            continue
        # each group goes to one relative: where its name points, else the
        # one with the most land per language it already hosts
        for c, lv in sorted(units, key=lambda u: (-len(u[1]), u[0])):
            h = hint(tree.by_id[c]['name'])
            if h and h[0] == 'place':
                inside = {p: int(((lang == p) & free & np.isin(state, h[1])).sum()) for p in mine}
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
        ys, xs = np.nonzero((lang == rel) & free)
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
            parts = rel_dir.lower().split('/')
            if 'regions' in parts or 'sources' in parts:   # regional maps and DJ's originals: list_regions
                continue
            rulers = 'ruler' in f.lower() or 'rulers' in parts
            if rulers == (layer == 'rulers'):
                out[y] = f if rel_dir == '.' else f'{rel_dir}/{f}'
    return dict(sorted(out.items()))


def list_regions(layer='commoners'):
    """{year: [paths]} of regional maps: keyframes for part of the world
    (DJ's 1565 Ayuma map), in a 'regions' folder: <AFA|BFA>/<layer>/regions/.
    Transparent where they say nothing."""
    out = {}
    for d, _, fs in os.walk(KEYFRAMES):
        rel_dir = os.path.relpath(d, KEYFRAMES).replace('\\', '/')
        parts = rel_dir.lower().split('/')
        if 'regions' not in parts or (layer == 'rulers') != ('rulers' in parts):
            continue
        for f in fs:
            y = by.year_of(f)
            # a draft is the app's suggestion for DJ to check (the Irrans draft of
            # 17 Oct 2026), never applied until he adopts it by taking "draft" out
            # of its name: applied, it painted over his own 1765 map (DJ, 18 Oct)
            if 'draft' in f.lower():
                continue
            if y is not None and f.lower().endswith('.png') and not f.endswith('.new.png'):
                out.setdefault(y, []).append(f'{rel_dir}/{f}')
    return dict(sorted(out.items()))


def read_region(path, L):
    """A regional map -> (language index per pixel or -1, where it says
    anything): transparent pixels say nothing; elsewhere as read_keyframe."""
    Image.MAX_IMAGE_PIXELS = None
    im = Image.open(path)
    alpha = np.asarray(im.convert('RGBA'))[..., 3]
    rows = ((np.arange(IH) + 0.5) * alpha.shape[0] / IH).astype(int)
    cols = ((np.arange(IW) + 0.5) * alpha.shape[1] / IW).astype(int)
    covered = alpha[rows][:, cols] >= 128
    lang, unknown = read_keyframe(path, L)
    lang[~covered] = -1
    return lang, covered, unknown


CUT_RUN = 13        # an edge of a regional map is a cut where it runs straight this many working-grid pixels (~260 km)
CUT_REACH = 14.0    # past a cut its languages carry on about this far (travel over rough land: a level pixel at the equator is 1, ~20 km)
CUT_BOX = 160       # and are looked for no further than this many pixels past it
CUT_HOLE = 400      # a pocket of land past a cut, closed in by what they took, this small or smaller is theirs too


def cuts(cw, land):
    """The straight edges of a regional map's coverage cw (working grid) with
    land beyond: where DJ cut the picture out of the world, not a border he
    painted (a painted border wanders)."""
    from scipy import ndimage
    out = np.zeros_like(cw)
    for axis in (0, 1):
        for d in (1, -1):
            # covered, with the next place that way uncovered land (the map's top and bottom rows are polar sea)
            e = cw & ~np.roll(cw, d, axis=axis) & np.roll(land, d, axis=axis)
            run = 1 - axis
            full = ndimage.uniform_filter1d(e.astype(np.float32), CUT_RUN, axis=run, mode='constant') > 0.999
            out |= ndimage.maximum_filter1d(full, CUT_RUN, axis=run) & e
    return out


def past_cuts(lang_r, cov, nxt, stateless, L, taken=None):
    """A regional map is a picture of part of the world, cut out with straight
    edges: DJ's 1565 Ayuma map stops at 77.6E and at 60.5N. A cut is no
    border, but the maps drew it as one: ruler-straight across the land for
    seven centuries, his languages on one side and grey on the other (DJ,
    19 Oct 2026: "looks fake"). Past a cut, the languages at its edge carry
    on over the land beyond, shared between them by travel:
      * where the land was stateless in the map's year (nothing else says what
        its people spoke), as far as the next keyframe shows the same line:
        his two maps agree, his 1565 mint up to the cut and his 1765 mint
        beyond it, so the mint was spoken there all along;
      * elsewhere a short way (CUT_REACH of travel over the land made rough,
        bt.rough), so the edge follows the hills and rivers and frays, rather
        than running parallel to the cut. The rulers' history decides beyond
        that, as before.
    lang_r, cov: the regional map (read_region); nxt: each place's language
    at its next keyframe (-1: none); stateless: the yearly map's greys in the
    map's year; taken: places another keyframe of the same year speaks for;
    all at picture size. -> (lang, cov, places added as far as the next
    keyframe agrees, places added a short way), on the working grid."""
    import build_years_terrain as bt
    from scipy import ndimage
    land = bt.land()
    cw, lw = cov[::2, ::2], lang_r[::2, ::2]
    cut = cuts(cw, land) & (lw >= 0)
    if not cut.any():
        return lang_r, cov, 0, 0
    free = land & ~cw & (nxt[::2, ::2] >= 0)
    if taken is not None:
        free &= ~taken[::2, ::2]
    y0, y1, x0, x1 = box = bt.box_around(cut, margin=CUT_BOX)
    fb, cb = free[y0:y1, x0:x1], cut[y0:y1, x0:x1]
    # travel over the land past the cut only, from the cut's own places, the land made rough: the
    # edges between the cut's languages and round them are guesses, and should not run straight
    dear = np.where(fb | cb, 1.0, 1e6).astype(np.float32) * bt.rough()[y0:y1, x0:x1]
    d, src = bt.reach(cut, box, dear=dear, nearest=True)
    ok = fb & (d < 1e5) & (src >= 0)
    sy, sx = np.divmod(np.maximum(src, 0), x1 - x0)
    lb = lw[y0:y1, x0:x1]
    owner = np.where(ok, lb[sy, sx], -1).astype(np.int16)
    ok &= owner >= 0
    # as far as the next keyframe shows its line, over land stateless in the map's year: each language
    # of the cut through the land its own line holds next, joined to its own stretch of the cut (not
    # only where its stretch is the nearest)
    nb = nxt[::2, ::2][y0:y1, x0:x1]
    sl = fb & stateless[::2, ::2][y0:y1, x0:x1] & (nb >= 0)
    agree = np.zeros(fb.shape, dtype=bool)
    eight = np.ones((3, 3), dtype=bool)
    for l in np.unique(lb[cb]):
        if l < 0:
            continue
        m = sl & ~agree
        m[m] = L.related[nb[m], l]
        mine = cb & (lb == l)
        if not m.any():
            continue
        lab, n = ndimage.label(m | mine, structure=eight)
        joined = np.zeros(n + 1, dtype=bool)
        joined[np.unique(lab[mine])] = True
        joined[0] = False
        m &= joined[lab]
        agree |= m
        owner[m] = l
    near = ok & ~agree & (d <= CUT_REACH)
    take = agree | near
    # only land joined to the cut through the land taken
    lab, n = ndimage.label(take | cb, structure=np.ones((3, 3), dtype=bool))
    keep = np.zeros(n + 1, dtype=bool)
    keep[np.unique(lab[cb])] = True
    keep[0] = False
    take &= keep[lab]
    # and the small pockets it closes in (no speck of the old guess left inside)
    lab, n = ndimage.label(ok & ~take)
    if n:
        size = np.bincount(lab.ravel(), minlength=n + 1)
        closed = np.ones(n + 1, dtype=bool)
        closed[np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))] = False   # runs on out of the box
        pocket = (size <= CUT_HOLE) & closed
        pocket[0] = False
        take |= pocket[lab]
    add_w = np.zeros((H, W), dtype=bool)
    own_w = np.full((H, W), -1, dtype=np.int16)
    add_w[y0:y1, x0:x1] = take
    own_w[y0:y1, x0:x1] = owner
    # and the cut's own places in full: a cut can fall between the two picture pixels of a place
    # (the Ayuma map stops at an even column), which left a hairline of the old guess along it
    own_w[cut] = lw[cut]
    add_w |= cut
    add = up(add_w) & ~cov & (nxt >= 0) & (up(own_w) >= 0)
    if taken is not None:
        add &= ~taken
    lang = lang_r.copy()
    lang[add] = up(own_w)[add]
    return lang, cov | add, int((take & agree).sum()), int((take & ~agree).sum())


# --- switching between two keyframes --------------------------------------------------------

class Runs:
    """Each place's current run of rulers of one family, and since when."""

    def __init__(self):
        self.fam = np.full(W * H, -9, dtype=np.int16)
        self.start = np.zeros(W * H, dtype=np.int32)

    def step(self, year, f8):
        ch = f8 != self.fam
        self.fam[ch] = f8[ch]
        self.start[ch] = year


FADE = 80   # years an old dialect takes to give way, from the side facing its standard
SETTLE = 150  # years empty land a state claims takes to fill with its settlers' language: Earth's
              # settler frontiers took longer still (English to the Mississippi about 200, Russian Siberia about 300)
FILL_REACH = 6    # working-grid pixels (about 120 km): how far a colony's land before it looks for the people round it
NEAR_PAD = 16   # blocks of the far side of the world beside each edge, for distances across it


def fronts(A, B, need, L):
    """How soon each changing place takes up its new language, 0 first to 1
    last of those taking the same language: a language spreads outwards from
    its speakers, so the near places change first (DJ, 17 Oct 2026: whole
    regions switched in one frame). Near by travel over the land, from where
    the new language's line was already spoken at the first keyframe (A):
    along valleys, rivers and farmland first, the towns sooner than the
    country between them, mountains and deserts last
    (build_years_terrain.py). By straight-line distance on a quarter grid,
    every front was a ring and every edge a staircase (DJ, 19 Oct 2026:
    "seeing languages spread from a dot is too fake")."""
    import build_years_terrain as bt
    A2, B2 = A.reshape(H, W), B.reshape(H, W)
    n2 = need.reshape(H, W) & (B2 >= 0)
    out = np.full((H, W), 0.5, dtype=np.float32)
    a_ok = A2 >= 0
    for b in np.unique(B2[n2]):
        grp = n2 & (B2 == b)
        src = a_ok & L.related[np.maximum(A2, 0), b]
        if not src.any():
            src = a_ok & (L.fam[np.maximum(A2, 0)] == L.fam[b]) & ~grp
        if not src.any():
            # none of its line or family in the keyframe's land to spread from: it comes in from
            # the sea where that land has a coast (a people that came by boat), else from its
            # edges. All at one rank, a whole coast switched in one year (Pelugrotoa, 707 AFA).
            from scipy import ndimage
            near = ndimage.binary_dilation(grp, iterations=3)
            src = near & ~bt.land()
            if not src.any():
                src = near & ~grp
        # by rank, not raw distance: the land gives way evenly through the years
        out[grp] = bt.front_rank(src, grp)
    return out.ravel()


def interval(A, B, L, shift, thresh, frames, runs, people_before, y1, y2, fade=None):
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
    fb = np.where(b_ok, L.fam[np.maximum(B, 0)], -9).astype(np.int16)
    factor = np.ones(W * H, dtype=np.float32)
    factor[~a_ok] = shift['lostPeoples']
    factor[both & ~rel & (L.fam[np.maximum(A, 0)] == fb)] = shift['sameFamily']
    d = thresh / factor
    settle = need & b_ok & ~a_ok & ~people_before
    rank = fronts(A, B, need, L)
    # the shift creeps in from the side nearest the language's speakers: a land its rulers took
    # whole switched all together, one shift time after (Kutone, Zarsing under Estijan)
    d = d * (0.75 + 0.5 * rank)
    # the chart's own dates come first: a language dying between the two
    # keyframes is replaced when it dies (an old dialect by its standard);
    # one born between them takes over when it is born
    dA = np.where(a_ok, L.died[np.maximum(A, 0)], NEVER)
    bB = np.where(b_ok, L.born[np.maximum(B, 0)], -NEVER)
    by_death = need & a_ok & (dA > y1) & (dA <= y2)
    # a dying language gives way over its last years, nearest its successor first
    span = np.clip(np.minimum(FADE, dA - y1 - 5), 0, None)
    S[by_death] = (dA - span * (1 - rank))[by_death]
    if fade is not None:   # an old dialect: the same timing its keyframes show (build_years_dialects.overlay),
        # whether or not it is gone by the next keyframe
        own = need & a_ok & (fade >= 0) & (dA < NEVER)
        when = dA - FADE * (1 - fade)
        own &= (when > y1) & (when <= y2)
        S[own] = when[own]
    # (only where its whole line is new: a language whose line was already spoken comes in as its
    # speakers do, the older stage first, as Pelugrotoan came in as Mikrolean from 600 AFA, born 800;
    # timed by its birth, a whole country switched in one year)
    line_new = b_ok & (L.born[L.at(y1)[np.maximum(B, 0)]] > y1)
    by_birth = need & b_ok & ~by_death & (bB > y1) & (bB <= y2) & line_new
    S[by_birth] = bB[by_birth]
    first = np.full(W * H, NEVER, dtype=np.int32)
    ruled = np.zeros(W * H, dtype=bool)
    settled = np.zeros(W * H, dtype=bool)
    for year, f8 in frames:
        runs.step(year, f8)
        todo = need & (S == NEVER)
        if not todo.any():
            continue
        m = todo & b_ok & (runs.fam == fb)
        first[m & (first == NEVER)] = year
        go = m & (year >= runs.start + d)
        ruled |= go
        new = todo & ~go & settle & (f8 != NOBODY) & (f8 != SEA)
        settled |= new
        go |= new
        go |= todo & ~b_ok & (f8 == GREY)                         # a language lost with its state
        S[go] = year
    # held long enough before the first keyframe, which still shows the old language: the
    # shift was still to come, so it comes over the years after, nearest first (after DJ's
    # 1565 map, all of Rakoka's land went over to Estijan in its first five years)
    late = ruled & (S < NEVER)
    S[late] = np.maximum(S[late], (y1 + np.minimum(d, y2 - y1) * (0.05 + 0.9 * rank))[late])
    # empty land settled fills from the coast and its nearest speakers over SETTLE years,
    # not the moment a state claims it
    S[settled] = (S[settled] + SETTLE * rank[settled]).astype(np.int32)
    # no rulers of the new language held it long enough: it spreads outwards
    # from its speakers through the years between, not all in one year
    rest = need & (S == NEVER)
    seen = rest & (first < NEVER)
    S[seen] = (first + (y2 - first) * (0.1 + 0.85 * rank))[seen]
    S[rest & ~seen] = (y1 + (y2 - y1) * (0.1 + 0.85 * rank))[rest & ~seen]
    S[need] = np.clip(S[need], y1 + 1, y2)
    return smooth_switch(S, need)


def smooth_switch(S, need, size=7):
    """Each changing place's switch year as the median of its neighbours'
    (7 x 7 on the working grid). Worked out place by place from the yearly
    maps, a single place, or a thin line the maps' borders left, could fall
    decades out of step with the land round it, which showed as salt and
    pepper and stray bars (DJ, 19 Oct 2026). -> S with the changing places
    smoothed (the others as they were)."""
    from scipy import ndimage
    m = need.reshape(H, W)
    if not m.any():
        return S
    S2 = S.reshape(H, W)
    # every place takes its nearest changing place's year, so the median is of switch years only
    iy, ix = ndimage.distance_transform_edt(~m, return_distances=False, return_indices=True)
    med = ndimage.median_filter(S2[iy, ix].astype(np.float32), size=size)
    out = S.copy()
    out[need] = np.round(med.ravel()[need]).astype(S.dtype)
    return out


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


def despeckle(out, rounds=2):
    """Lone pixels in a frame between keyframes take the language round
    them: the switch years are worked out place by place, and where
    neighbours fall either side of a year the map was salt and pepper (DJ,
    19 Oct 2026). A pixel at most one of whose eight neighbours is like it,
    among at least five of one language, becomes that language; nothing is
    turned into no language, so a small island keeps its own."""
    a = out
    h, w = a.shape
    for _ in range(rounds):
        p = np.pad(a, 1, mode='edge')
        nb = [p[1 + dy:1 + dy + h, 1 + dx:1 + dx + w] for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dy or dx]
        same = np.zeros(a.shape, dtype=np.int8)
        for n in nb:
            same += (n == a)
        ys, xs = np.nonzero(same <= 1)
        if not len(ys):
            break
        vals = np.stack([n[ys, xs] for n in nb], axis=1)
        cnt = (vals[:, :, None] == vals[:, None, :]).sum(axis=2)
        j = np.argmax(cnt, axis=1)
        top = vals[np.arange(len(j)), j]
        ok = (cnt[np.arange(len(j)), j] >= 5) & (top >= 0)
        if not ok.any():
            break
        a = a.copy()
        a[ys[ok], xs[ok]] = top[ok]
    return a


def choose(t, A, B, S, need, deep):
    """Each place's language (unresolved) at year t between keyframes A and B."""
    return np.where(need, np.where(S <= t, B, A), deep).astype(np.int16)


# --- before DJ's earliest keyframe: backwards ---------------------------------------------

FAMILY_KMPY = 1.5    # km a year a people spreads over easy land: Earth's prehistoric expansions
                     # (farming across Europe about 1, the Bantu about 1.5-2); mountains and deserts
                     # slow it as they slow travel (build_years_terrain.cost)
ASSIM_KMPY = 0.3     # how fast a language creeps beyond its states' rule when it spreads by assimilation
SEA_SPREAD = 1 / 3   # a people crossing the sea: three times easy land's cost, not the nine of trade
ASSIM_SCORE = 0.45   # a branch spreads with its states from this score (spread_modes)
KM_PER_PX = 40075.0 / W   # a working-grid pixel at the equator
CLIP_SPAN = 150      # years before a keyframe that a spread running late comes in over
MIN_LAYER = 60       # years a language must have been spoken somewhere to show as a layer there
V_MAX = 12.0         # km a year no spread is fitted faster than (Earth's fastest, by sea or horse);
                     # past it the rest come in late, over CLIP_SPAN (a few places due just after a
                     # branch's birth had a whole land arrive within five years)
LOBES = 0.45         # how unevenly a front runs: farther here, shorter there (lobes, not ovals)


def branch_of_lang(L):
    """Each language's first branch below its family's root (the root itself for a root).
    -> language index per language."""
    by_id = L.tree.by_id
    out = np.empty(L.n, dtype=np.int32)
    for k, i in enumerate(L.ids):
        chain = [i]
        while by_id[chain[-1]].get('parentId') in by_id:
            chain.append(by_id[chain[-1]]['parentId'])
        out[k] = L.idx[chain[-2] if len(chain) > 1 else chain[-1]]
    return out


def spread_modes(L, T, rulers_at, years, min_px=300):
    """How each first branch came by its land (DJ, 19 Oct 2026: "not every
    language spreads like Indo-European ... The Chinese language kind of just
    assimilated nearby cultures ... you need to work it out"). With its states,
    as Chinese did, where its own states came to rule nearly all of its land,
    reaching it outwards from their first core over a long time; before them,
    as Indo-European did, where its land was there before its states, which
    arose here and there in it. Score: the share of its land its own states
    ruled, x how closely their first rule followed the distance from that core
    (correlation), x how long it took (up to 1,500 years). T: the language per
    working-grid pixel at its earliest keyframe; rulers_at(year): the rulers'
    language per working-grid pixel (flat, -1 none). -> {branch index: (score,
    share ruled, correlation, first year, years to rule half, core: bool H x W)}."""
    import build_years_terrain as bt
    T = np.asarray(T).ravel()
    bo = branch_of_lang(L)
    br = np.where(T >= 0, bo[np.maximum(T, 0)], -1)
    first = np.full(W * H, NEVER, dtype=np.int32)
    for y in years:
        r = np.asarray(rulers_at(y)).ravel()
        rb = np.where(r >= 0, bo[np.maximum(r, 0)], -2)
        own = (rb == br) & (br >= 0) & (first == NEVER)
        first[own] = y
    out = {}
    for b in np.unique(br[br >= 0]):
        R = br == b
        n = int(R.sum())
        ruled = R & (first < NEVER)
        if n < min_px or ruled.sum() < 30:
            continue
        cov = ruled.sum() / n
        y0 = int(first[ruled].min())
        core = (ruled & (first <= y0 + 50)).reshape(H, W)
        box = bt.box_around(R.reshape(H, W))
        y_0, y_1, x_0, x_1 = box
        d = bt.reach(core, box)[ruled.reshape(H, W)[y_0:y_1, x_0:x_1]]
        fy = first.reshape(H, W)[y_0:y_1, x_0:x_1][ruled.reshape(H, W)[y_0:y_1, x_0:x_1]].astype(float)
        okd = np.isfinite(d)
        corr = float(np.corrcoef(d[okd], fy[okd])[0, 1]) if okd.sum() > 10 and fy[okd].std() > 0 else 0.0
        half = float(np.median(fy)) - y0
        score = cov * max(0.0, corr) * min(1.0, half / 1500)
        out[int(b)] = (score, cov, corr, y0, int(half), core)
    return out


HOME_KM = 500        # a family's homeland stays within this of its first civilisation's land
HOME_YEARS = 300     # ... and is the land its own states held in their first this many years


def family_arrival(L, T, homes, S_rule, y0, Nat, first_state):
    """When each place's own language reached it (DJ, 20 Oct 2026, confirmed:
    "wherever a language ends up, you're putting them there thousands of
    years ... before they got there"). (1) A family is spoken from its proto's
    birth in its homeland, the land its own early states held (homes);
    (2) land with a state history (first_state before its first keyframe)
    takes up its 1765 language only once that language's own countries rule
    it, after the shift time (S_rule: Proto-Zanalaric came to Desaki, United
    Mihili and Iareva with the Zanalaric countries, not before); (3) land no
    state held, and land whose own line's countries never ruled it, gets its
    language by its people spreading from the homeland at Earth's pace
    (FAMILY_KMPY on easy land, the Bantu's kind: "like in africa, many places
    never had a permanent state, yet still have languages"). A family of one
    language, or with no civilisation, was there from its birth. Late for its
    first keyframe, it comes over the CLIP_SPAN years before, nearest first.
    Colonies (Nat false) are left to their settlers. T: the language per
    working-grid pixel at its earliest keyframe; homes: {family index:
    homeland, working-grid bool}. -> (year per pixel, flat, -NEVER where
    none; [(family, born, homeland cells, cells by its states, cells by its
    people)])."""
    import build_years_terrain as bt
    from scipy import ndimage
    T = np.asarray(T).ravel()
    S_rule = np.asarray(S_rule).ravel()
    y0 = np.asarray(y0).ravel()
    first_state = np.asarray(first_state).ravel()
    by_id = L.tree.by_id
    root_born = np.full(L.n, NEVER, dtype=np.int64)
    for k, i in enumerate(L.ids):
        cur = i
        while by_id[cur].get('parentId') in by_id:
            cur = by_id[cur]['parentId']
        root_born[k] = by_id[cur].get('born') if by_id[cur].get('born') is not None else NEVER
    ok = (T >= 0) & np.asarray(Nat).ravel()
    fam = np.where(T >= 0, L.fam[np.maximum(T, 0)], -1)
    rule_at = np.where((S_rule > -NEVER) & (S_rule < NEVER), S_rule, np.inf).astype(np.float64)
    stately = first_state < y0
    n_lang = np.bincount(L.fam, minlength=len(L.fams))
    base = (np.where(bt.land(), 1.0, SEA_SPREAD) * bt.rough()).astype(np.float32)
    Arr = np.full(W * H, np.inf)
    report = []
    for f in np.unique(fam[ok]):
        grp = ok & (fam == f)
        B = float(np.min(root_born[T[grp]]))
        home = homes.get(int(f))
        if home is None or not home.any() or n_lang[f] <= 1:
            Arr[grp] = B                          # no civilisation, or a people of one language: there from its birth
            continue
        inh = grp & home.ravel()
        Arr[inh] = B
        by_state = grp & ~inh & stately & np.isfinite(rule_at)
        Arr[by_state] = rule_at[by_state]
        people = grp & ~inh & ~by_state
        if people.any():
            # its people walk out from the homeland, the fronts in lobes (each family its own)
            noise = ndimage.gaussian_filter(np.random.default_rng(1700 + int(f)).standard_normal((H, W)), 14, mode='wrap')
            dear = base * np.exp(LOBES * noise / (noise.std() + 1e-9)).astype(np.float32)
            g2 = (people | home.ravel()).reshape(H, W)
            box = bt.box_around(g2)
            y_0, y_1, x_0, x_1 = box
            tt = bt.reach_timed(home, np.full((H, W), B), box, FAMILY_KMPY, dear=dear[y_0:y_1, x_0:x_1])
            full_t = np.full((H, W), np.inf)
            full_t[y_0:y_1, x_0:x_1] = tt
            Arr[people] = full_t.ravel()[people]
        report.append((L.fams[f], int(B), int(inh.sum()), int(by_state.sum()), int(people.sum())))
    # late for its first keyframe (or never reached): over the CLIP_SPAN years before it, nearest
    # first, each stretch of a family's late land on its own. Ranked all together, the land never
    # reached tied last the world over and came in the keyframe's last few years at once: a
    # 100,000 km2 stand-in gone in one step. Never-reached land comes in from the edge the
    # family's speech had reached, inwards, in lobes
    late = ok & (Arr >= y0 - 5)
    lobes = np.exp(LOBES * ndimage.gaussian_filter(np.random.default_rng(1800).standard_normal((H, W)), 8, mode='wrap'))
    for y in np.unique(y0[late]):
        for f in np.unique(fam[late & (y0 == y)]):
            fm = (late & (y0 == y) & (fam == f)).reshape(H, W)
            had = (ok & (fam == f) & ~late).reshape(H, W)
            d = ndimage.distance_transform_edt(~had) if had.any() else np.zeros((H, W))
            lab, _ = ndimage.label(fm, structure=np.ones((3, 3)))
            A2 = Arr.reshape(H, W)
            for j, sl in enumerate(ndimage.find_objects(lab), 1):
                c = lab[sl] == j
                v = A2[sl][c]
                v = np.where(np.isfinite(v), v, 1e9 + d[sl][c] * lobes[sl][c])
                order = np.argsort(np.argsort(v, kind='stable')) / max(1, c.sum() - 1)
                sub = A2[sl]
                sub[c] = y - CLIP_SPAN * (1 - order)
    Arr[~ok] = -NEVER
    return np.clip(Arr, -NEVER, NEVER).astype(np.int32), report


PRE_FROM = -1500     # by when a land a language had not yet reached speaks as its neighbours did
PRE_SPAN = 500       # ... coming over the years before, nearest first (not all in PRE_FROM)
PRE_REACH = 30       # how far a neighbour's speech stands in (working pixels, about 600 km)


STANDIN_KMPY = 1.5   # how fast a neighbouring people's speech spreads into land still waiting for its own


def stand_ins(L, T, Arr, Nat, S):
    """What a place spoke before its own language reached it: its nearest
    people of another branch's (DJ, 20 Oct 2026: "Earlier states, else
    neighbours"), within PRE_REACH, coming in from when that people had it
    at a people's pace (STANDIN_KMPY): switched on all at once, a 600 km belt
    changed in one step. Past PRE_REACH, unknown. Colonies (Nat false) are
    left to their settlers. T: the language per working-grid pixel at its
    earliest keyframe; Arr: when its own came (family_arrival); S: a colony's
    switch. -> (language per working-grid pixel, flat, -1 none; the year it
    is spoken from)."""
    from scipy import ndimage
    import build_years_terrain as bt
    T = np.asarray(T).ravel()
    Arr = np.asarray(Arr).ravel().astype(np.float64)
    Nat = np.asarray(Nat).ravel()
    S = np.asarray(S).ravel().astype(np.float64)
    had = np.where(Nat, Arr, np.where(S > -NEVER, S, -NEVER))         # when each place had its own speech
    noise = ndimage.gaussian_filter(np.random.default_rng(1500).standard_normal((H, W)), 8, mode='wrap')
    noise = np.exp(0.4 * noise / (noise.std() + 1e-9))
    bo = branch_of_lang(L)
    br = np.where(T >= 0, bo[np.maximum(T, 0)], -1)
    wait = (T >= 0) & Nat & (Arr > -NEVER) & (Arr < NEVER)
    out = np.full(W * H, -1, dtype=np.int16)
    onset = np.full(W * H, NEVER, dtype=np.int32)
    T2, br2, had2 = T.reshape(H, W), br.reshape(H, W), had.reshape(H, W)
    for b in np.unique(br[wait]):
        grp = (wait & (br == b)).reshape(H, W)
        y0, y1, x0, x1 = bt.box_around(grp, margin=PRE_REACH + 2)
        src = (T2[y0:y1, x0:x1] >= 0) & (br2[y0:y1, x0:x1] != b)
        if not src.any():
            continue
        d, (iy, ix) = ndimage.distance_transform_edt(~src, return_indices=True)
        g = grp[y0:y1, x0:x1] & (d <= PRE_REACH)
        out.reshape(H, W)[y0:y1, x0:x1][g] = T2[y0:y1, x0:x1][iy[g], ix[g]]
        km = d[g] * KM_PER_PX * noise[y0:y1, x0:x1][g]
        onset.reshape(H, W)[y0:y1, x0:x1][g] = np.clip(had2[y0:y1, x0:x1][iy[g], ix[g]] + km / STANDIN_KMPY,
                                                       -NEVER, NEVER).astype(np.int32)
    return out, onset


def spread_blobs(S, T, spread, cap, min_px=120, ranks=False):
    """Wide stretches switching to one language in one decade (a land a state
    claimed whole, in one frame of DJ's maps) take it up over spread years
    instead, nearest first: from the land round them that already spoke it,
    else from the coast (settlers by sea), else from their edges (DJ, 19 Oct
    2026: whole regions in one frame look fake; the Emaran colonies filled
    750 cells at once in 1635-1640). S, T, spread, cap: per working-grid
    pixel (flat); cap: the latest a switch may come (its keyframe). -> S (with
    ranks, also each place's rank in its stretch, 0 nearest to 1 farthest,
    NaN where it was in none)"""
    import build_years_terrain as bt
    from scipy import ndimage
    S2, T2 = S.reshape(H, W), T.reshape(H, W)
    ok = (S2 > -NEVER) & (S2 < NEVER) & (T2 >= 0)
    rk = np.full(W * H, np.nan, dtype=np.float32)
    if not ok.any():
        return (S, rk) if ranks else S
    key = np.where(ok, T2.astype(np.int64) * 100000 + (S2 // 10 + 50000), -1)
    ks, cnt = np.unique(key[ok], return_counts=True)
    out = S2.copy()
    sp2, cap2 = spread.reshape(H, W), cap.reshape(H, W)
    land = bt.land()
    for k in ks[cnt >= min_px]:
        lab, n = ndimage.label(key == k)
        if n == 0:
            continue
        sizes = np.bincount(lab.ravel(), minlength=n + 1)
        t = int(k // 100000)
        for j in np.nonzero(sizes >= min_px)[0]:
            if j == 0:
                continue
            comp = lab == j
            s0 = int(S2[comp].min())
            ring = ndimage.binary_dilation(comp, iterations=3) & ~comp
            src = ring & (T2 == t) & (S2 < s0)
            if not src.any():
                src = ring & ~land
            if not src.any():
                src = ring
            r = bt.front_rank(src, comp)
            # a settling that started late for its keyframe is squeezed to finish by it, not cut off there
            room = np.maximum(cap2[comp].astype(np.float64) - S2[comp], 0)
            out[comp] = (S2[comp] + np.minimum(sp2[comp], room) * r).astype(np.int32)
            rk.reshape(H, W)[comp] = r
    return (out.ravel(), rk) if ranks else out.ravel()


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
    more. Else the people had no rulers long enough to change their speech,
    and their later language's line is theirs all along: the greys of DJ's
    maps are peoples without a civilisation, not without a language (DJ,
    19 Oct 2026: "those didn't just spawn in, those have been there the whole
    time"), unless the family came by sea. Each family's land is home (where
    its rule rose, or spread to over land from home) or colonial (reached
    across the sea, or spread to over land from such land); where it came as
    a colony, what was spoken before is lost."""

    def __init__(self, T, y0, L, shift, thresh):
        # y0: the year of each pixel's earliest keyframe (a regional map can come before the world's)
        y0 = np.broadcast_to(np.asarray(y0, dtype=np.int64), (W * H,))
        # only places with a language at their keyframe need a history: a quarter of the globe,
        # so the work is a quarter too
        self.sel = np.nonzero(np.asarray(T) >= 0)[0]
        n = len(self.sel)
        self.T, self.y0, self.L, self.k = np.asarray(T)[self.sel], y0[self.sel].copy(), L, shift
        self.thresh = np.asarray(thresh)[self.sel]
        T = self.T
        self.ymax = int(self.y0.max()) if n else -NEVER
        self.F = np.where(T >= 0, L.fam[np.maximum(T, 0)], -9).astype(np.int16)
        self.first = np.full(n, NEVER, dtype=np.int32)
        self.near = np.full(n, NEVER, dtype=np.int32)
        self.E = np.zeros(n, dtype=np.float32)
        self.cross = {f: np.full(n, NEVER, dtype=np.int32) for f in ('lost', 'same', 'other')}
        self.run_fam = np.full(n, -9, dtype=np.int16)
        self.run_start = np.zeros(n, dtype=np.int32)
        self.run_len = np.zeros(n, dtype=np.float32)
        self.run_lang = np.full(n, -1, dtype=np.int16)
        self.best = {w: [np.full(n, -1, dtype=np.int16), np.zeros(n, dtype=np.int32), np.zeros(n, dtype=np.float32)] for w in ('first', 'near')}
        # and the next longest: a place could change its speech under two rulers before its own came
        self.best2 = {w: [np.full(n, -1, dtype=np.int16), np.zeros(n, dtype=np.int32), np.zeros(n, dtype=np.float32)] for w in ('first', 'near')}
        # and the longest other rule after its own line first ruled it: speech can go back and forth
        # wherever states change hands (DJ, 20 Oct 2026), each holding it the shift time
        self.after = [np.full(n, -1, dtype=np.int16), np.zeros(n, dtype=np.int32), np.zeros(n, dtype=np.float32)]
        self.prev = None
        # "rules nearby", on a coarse grid of 4x4 blocks: the distance from the family's rule, read
        # between the blocks' centres so its edge runs smooth, within a reach that varies with the land
        # (farther over easy land, less over mountains and deserts) and never quite evenly. A square of
        # blocks round each one drew long straight lines, then stair steps, between the people who had
        # always spoken a language and those it reached (DJ, 19 Oct 2026).
        import build_years_terrain as bt
        km_block = 4 * 360.0 / W * 111.2
        self.reach = max(1, int(round(shift['nearKm'] / km_block)))
        ys, xs = np.divmod(self.sel, W)
        self.cyf = ((ys + 0.5) / 4 - 0.5).astype(np.float32)
        self.cxf = ((xs + 0.5) / 4 - 0.5 + NEAR_PAD).astype(np.float32)
        wob = wobble()[::2, ::2].ravel()[self.sel]
        self.rad = (self.reach * np.clip((1 + 0.35 * wob) / np.sqrt(bt.cost().ravel()[self.sel]), 0.4, 1.6)).astype(np.float32)
        self.fam_at = {int(f): np.nonzero(self.F == f)[0] for f in np.unique(self.F) if f >= 0}
        self.prev_rule = {}
        self.blk = ((ys // 4) * (W // 4) + (xs // 4)).astype(np.int64)
        self.land_c = bt.land().reshape(H // 4, 4, W // 4, 4).any(axis=(1, 3))
        self.home, self.col = {}, {}          # family -> blocks of its land at home / reached across the sea
        self.colonial = np.zeros(n, dtype=bool)

    def _classify(self, cb):
        """Sort each family's newly ruled blocks into home and colonial: within
        an overland reach (nearKm, by land alone) of its home land, home; else
        of its colonies, colonial; else home where it ruled nowhere before (it
        rose there), and colonial where it did (it came across the sea)."""
        from scipy import ndimage
        eight = np.ones((3, 3), dtype=bool)
        present = int(np.bitwise_or.reduce(cb.ravel()))
        for f in self.fam_at:
            bit = np.int64(1) << np.int64(f)
            if not present & int(bit):
                continue
            ruled = (cb & bit) != 0
            home = self.home.setdefault(f, np.zeros_like(ruled))
            col = self.col.setdefault(f, np.zeros_like(ruled))
            new = ruled & ~home & ~col
            if not new.any():
                continue
            if not home.any() and not col.any():
                home |= new
                continue
            # over land, or across a strait: a short hop over water within the same reach is the same
            # people spreading (an island off its own coast), not a colony
            near_home = ndimage.binary_dilation(home, structure=eight, iterations=self.reach, mask=self.land_c) | home
            near_home |= ndimage.binary_dilation(home, structure=eight, iterations=max(1, self.reach // 2))
            # a block joined to land of its own this frame counts as reached over land from it
            lab, k = ndimage.label(new | home | col, structure=eight)
            to_home = np.zeros(k + 1, dtype=bool)
            to_home[np.unique(lab[near_home & new])] = True
            to_home[0] = False
            h = new & to_home[lab]
            # the rest came from its colonies, or across the sea
            home |= h
            col |= new & ~h

    def _by_sea(self, fams, blocks):
        """Whether each arrival's family holds that block's neighbourhood as a
        colony rather than at home."""
        out = np.zeros(len(fams), dtype=bool)
        for f in np.unique(fams):
            if f < 0 or int(f) not in self.col:
                continue
            m = fams == f
            home = self.home[int(f)].ravel()
            col = self.col[int(f)].ravel()
            # the nearest of its land: its own block, else the blocks round it
            out[m] = col[blocks[m]] & ~home[blocks[m]]
        return out

    def _close(self, m):
        """Close the runs at pixels m: keep each as the best so far where it is
        longer, the best before it as the second (one run can be closed more
        than once as it grows: then it only grows)."""
        for w, (lang, start, ln) in self.best.items():
            l2, s2, n2 = self.best2[w]
            frozen = (self.first if w == 'first' else self.near) < NEVER
            cand = m & ~frozen & (self.run_lang >= 0)
            same1 = cand & (start == self.run_start) & (lang >= 0)
            better = cand & (self.run_len > ln)
            move = better & ~same1 & (lang >= 0)
            l2[move], s2[move], n2[move] = lang[move], start[move], ln[move]
            lang[better] = self.run_lang[better]
            start[better] = self.run_start[better]
            ln[better] = self.run_len[better]
            second = cand & ~better & ~same1 & (self.run_len > n2)
            l2[second] = self.run_lang[second]
            s2[second] = self.run_start[second]
            n2[second] = self.run_len[second]
        al, as_, an = self.after
        later = m & (self.first < NEVER) & (self.run_lang >= 0) & (self.run_start > self.first) & (self.run_len > an)
        al[later], as_[later], an[later] = self.run_lang[later], self.run_start[later], self.run_len[later]

    def step(self, year, rc, f8):
        if year > self.ymax:
            return
        dt = 5 if self.prev is None else year - self.prev
        self.prev = year
        F = self.F
        # nearby: the family's rule within reach, on the coarse grid (from the whole map)
        bits = np.zeros(H * W, dtype=np.int64)
        fam_all = f8 >= 0
        bits[fam_all] = np.left_shift(np.int64(1), f8[fam_all].astype(np.int64))
        rc, f8 = rc[self.sel], f8[self.sel]
        fam_ok = f8 >= 0
        act = year <= self.y0                 # pixels still before their keyframe
        rl = (rc >= LANG0) & (rc < CIV0)
        stage = np.where(rl, rc - LANG0, -1).astype(np.int16)
        # T's own line rules here (its language, an ancestor or a descendant of it): another
        # branch of its family is other rulers, whose speech its people could take up first, as
        # Gaul spoke Celtic under Celtic kings before Latin came (DJ, 20 Oct 2026: more replaced)
        isF = (f8 == F) & (F >= 0) & act & rl & self.L.related[np.maximum(stage, 0), np.maximum(self.T, 0)]
        cb = np.bitwise_or.reduce(bits.reshape(H // 4, 4, W // 4, 4), axis=(1, 3))
        from scipy import ndimage
        near_now = np.zeros(len(self.sel), dtype=bool)
        for f, at in self.fam_at.items():
            at = at[(self.near[at] == NEVER) & act[at]]
            if not len(at):
                continue
            rule = (cb & np.left_shift(np.int64(1), np.int64(f))) != 0
            if not rule.any():
                continue
            prev = self.prev_rule.get(f)
            if prev is not None and np.array_equal(prev[0], rule):
                dist = prev[1]
            else:
                # in blocks, the world wrapping east-west
                dist = ndimage.distance_transform_edt(~np.pad(rule, ((0, 0), (NEAR_PAD, NEAR_PAD)), mode='wrap')).astype(np.float32)
                self.prev_rule[f] = (rule, dist)
            near_now[at] = ndimage.map_coordinates(dist, [self.cyf[at], self.cxf[at]], order=1, mode='nearest') <= self.rad[at]
        # runs of other rulers (before the arrivals)
        g = np.where(fam_ok & ~isF & act, f8, -9).astype(np.int16)
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
        # each family's land this frame, home or colonial, and its arrivals by sea
        self._classify(cb)
        # arrivals: freeze the best run before each
        nn = near_now & (self.near == NEVER)
        self._close(nn)
        self.near[nn] = year
        nf = isF & (self.first == NEVER)
        self._close(nf)
        self.first[nf] = year
        for arrived in (nn, nf):
            if arrived.any():
                self.colonial[arrived] = self._by_sea(F[arrived], self.blk[arrived])
        # years of the family's rule, and when they reach the shift time
        self.E[isF] += dt
        for f, fac in (('lost', self.k['lostPeoples']), ('same', self.k['sameFamily']), ('other', 1.0)):
            c = self.cross[f]
            c[(c == NEVER) & isF & (self.E >= self.thresh / fac)] = year

    def finish(self):
        """-> (S, P, P_start, Nat): the switch to T's line; the language before it
        (-1 lost) and when that one took the place; and whether, before that
        (or before all), the place's own people spoke T's line (not a colony)."""
        k, y0 = self.k, self.y0
        self._close(np.ones(len(self.sel), dtype=bool))
        direct = self.first < NEVER
        nearby = ~direct & (self.near < NEVER)
        A = np.where(direct, self.first, self.near)
        P = np.where(direct, self.best['first'][0], self.best['near'][0])
        Ps = np.where(direct, self.best['first'][1], self.best['near'][1])
        Pl = np.where(direct, self.best['first'][2], self.best['near'][2])
        P[Pl < k['heldYears']] = -1
        lost = P < 0
        # no rulers long enough to change their speech, and not a colony: the later line all along
        # a colony's edge as the land runs, not the 80 km blocks it was decided on: the share of
        # colonial places round each, against an uneven threshold
        from scipy import ndimage
        col_w = np.zeros(W * H, dtype=np.float32)
        col_w[self.sel] = self.colonial
        share = ndimage.uniform_filter(col_w.reshape(H, W), size=9, mode='wrap').ravel()[self.sel]
        colonial = share > np.clip(0.5 + 0.15 * wobble()[::2, ::2].ravel()[self.sel], 0.2, 0.8)
        native = lost & ~colonial
        rule_direct, rule_nearby = direct.copy(), nearby.copy()
        direct &= ~native
        nearby &= ~native
        same = ~lost & (self.L.fam[np.maximum(P, 0)] == self.F)
        fac = np.where(lost, k['lostPeoples'], np.where(same, k['sameFamily'], 1.0)).astype(np.float32)
        d = self.thresh / fac
        cross = np.where(lost, self.cross['lost'], np.where(same, self.cross['same'], self.cross['other']))
        late = A + np.minimum(d, (y0 - A) * k['catchUp']).astype(np.int32)
        S = np.full(len(self.sel), -NEVER, dtype=np.int32)       # native: T's line all along
        S[direct] = np.where(cross[direct] < NEVER, cross[direct], late[direct])
        S[nearby] = late[nearby]
        # when its family's rule alone would have brought T's line, native or not (family_arrival)
        S_rule = np.full(len(self.sel), NEVER, dtype=np.int32)
        S_rule[rule_direct] = np.where(cross[rule_direct] < NEVER, cross[rule_direct], late[rule_direct])
        S_rule[rule_nearby] = late[rule_nearby]
        self.S_rule = np.full(W * H, NEVER, dtype=np.int32)
        self.S_rule[self.sel] = S_rule
        # a land taken whole takes the language up over the years after, nearest its speakers
        # first: a colony's settlers over SETTLE years, a shift over half its shift time
        def full(v, fill):
            a = np.full(W * H, fill, dtype=np.asarray(v).dtype)
            a[self.sel] = v
            return a
        S = spread_blobs(full(S, -NEVER), full(self.T, -1), full(np.where(lost, SETTLE, 0.5 * d).astype(np.float32), 0),
                         full(y0.astype(np.int32), NEVER))[self.sel]
        # what its family's rule alone would bring, spread the same way over a land taken whole
        S_rule = spread_blobs(full(np.where(S_rule < NEVER, S_rule, -NEVER).astype(np.int32), -NEVER), full(self.T, -1),
                              full(np.where(lost, SETTLE, 0.5 * d).astype(np.float32), 0),
                              full(y0.astype(np.int32), NEVER))[self.sel]
        self.S_rule[self.sel] = np.where(S_rule > -NEVER, S_rule, NEVER).astype(np.int32)
        # a second earlier rulers' language, where two held the place long enough before its own
        # came: the older one first (DJ, 20 Oct 2026: more languages replaced, as Anatolia went
        # from Hittite and Luwian to Greek to Turkish)
        P2 = np.where(direct, self.best2['first'][0], self.best2['near'][0])
        Ps2 = np.where(direct, self.best2['first'][1], self.best2['near'][1])
        Pl2 = np.where(direct, self.best2['first'][2], self.best2['near'][2])
        P2[(Pl2 < k['heldYears']) | (P < 0)] = -1
        swap = (P2 >= 0) & (Ps2 > Ps)
        P, P2 = np.where(swap, P2, P).astype(np.int16), np.where(swap, P, P2).astype(np.int16)
        Ps, Ps2 = np.where(swap, Ps2, Ps), np.where(swap, Ps, Ps2)
        # the earlier rulers' language: their people's after a lifetime or two
        Pst = Ps + np.minimum(self.thresh / k['lostPeoples'], np.maximum(0, S - Ps) / 2).astype(np.int32)
        P[(S <= -NEVER) | (Pst >= S)] = -1
        Pst2 = Ps2 + np.minimum(self.thresh / k['lostPeoples'], np.maximum(0, Pst - Ps2) / 2).astype(np.int32)
        P2[(P < 0) | (Pst2 >= Pst) | (P2 == P)] = -1
        # a land a state took whole takes up its language over the years after, nearest first, as S
        # does (spread_blobs): by the state's start alone, a whole land changed speech in five years
        Pst = spread_blobs(full(np.where(P >= 0, Pst, -NEVER).astype(np.int32), -NEVER), full(P, -1),
                           full(np.full(len(P), 100.0, dtype=np.float32), 0),
                           full(np.where(S > -NEVER, S - 1, y0).astype(np.int32), NEVER))[self.sel]
        Pst = np.where(P >= 0, Pst, 0).astype(np.int32)
        # a language its people spoke for less than a lifetime before the next came is no layer, a flicker
        P[(P >= 0) & (S > -NEVER) & (S - Pst < MIN_LAYER)] = -1
        P2[(P2 >= 0) & ((Pst2 >= Pst) | (Pst - Pst2 < MIN_LAYER) | (P < 0))] = -1
        # a switch that only comes at the keyframe itself (its rulers there first in that very map)
        # comes over the years before it instead, nearest its speakers first, not all in that step
        pinned = (S > -NEVER) & (S >= y0 - 5)
        if pinned.any():
            _, r = spread_blobs(full(np.where(pinned, y0 - 1, -NEVER).astype(np.int32), -NEVER), full(self.T, -1),
                                full(np.full(len(S), float(CLIP_SPAN), dtype=np.float32), 0),
                                full(np.full(len(S), NEVER, dtype=np.int32), NEVER), ranks=True)
            r = r[self.sel]
            eased = pinned & np.isfinite(r)
            floor = np.where(P >= 0, Pst + 1, -NEVER)
            S = np.where(eased, np.maximum(y0 - 1 - CLIP_SPAN * (1 - np.nan_to_num(r)), floor), S).astype(np.int32)
        self.P2_all = np.full(W * H, -1, dtype=np.int16)
        self.Pst2_all = np.zeros(W * H, dtype=np.int32)
        self.P2_all[self.sel], self.Pst2_all[self.sel] = P2, Pst2
        # a foreign rule after its own line came, held the shift time: its people took up the rulers'
        # language, and took their own back once their own countries had ruled again a shift time;
        # not where the foreign rule lasted to the keyframe that still shows their own (they kept it)
        al, as_, an = self.after
        same3 = (al >= 0) & (self.L.fam[np.maximum(al, 0)] == self.F)
        d3 = self.thresh / np.where(same3, k['sameFamily'], 1.0)
        P3 = np.where((al >= 0) & (an >= d3), al, -1).astype(np.int16)
        Pst3 = (as_ + d3).astype(np.int32)
        Pend3 = (as_ + an + self.thresh).astype(np.int32)
        P3[(Pend3 > y0 - 5) | (Pend3 - Pst3 < MIN_LAYER) | (Pst3 <= np.maximum(S, -NEVER + 1))] = -1
        self.P3_all = np.full(W * H, -1, dtype=np.int16)
        self.Pst3_all = np.zeros(W * H, dtype=np.int32)
        self.Pend3_all = np.zeros(W * H, dtype=np.int32)
        self.P3_all[self.sel], self.Pst3_all[self.sel], self.Pend3_all[self.sel] = P3, Pst3, Pend3
        # back onto the whole map: places without a language are lost all along
        S_all = np.full(W * H, -NEVER, dtype=np.int32)
        P_all = np.full(W * H, -1, dtype=np.int16)
        Pst_all = np.zeros(W * H, dtype=np.int32)
        S_all[self.sel], P_all[self.sel], Pst_all[self.sel] = S, P, Pst
        # before the earlier rulers' language took hold, the place's own people spoke what it shows later
        # (a thin strip a state held for centuries had stayed grey before it, inside land that was not)
        Nat_all = np.zeros(W * H, dtype=bool)
        Nat_all[self.sel] = ~colonial
        return S_all, P_all, Pst_all, Nat_all

    @staticmethod
    def state(t, S, P, Pst, Nat=None, P2=None, Pst2=None):
        """0: T's line; 1: the earlier rulers' language; 3: the rulers' before
        those; 2: lost (only where the place's language came as a colony: Nat
        says it did not)."""
        older = 2 if P2 is None else np.where((np.asarray(P2) >= 0) & (t >= np.asarray(Pst2)), 3, 2)
        st = np.where(t >= S, 0, np.where((P >= 0) & (t >= Pst), 1, older)).astype(np.int8)
        if Nat is not None:
            st[(st == 2) & np.asarray(Nat)] = 0
        return st


# --- the schedule: what people speak in any year ----------------------------------------

class Schedule:
    """What ordinary people speak in any year, worked out from the keyframes:
    before each place's first keyframe, backwards (Backward); between two of
    its keyframes, the switching rule (interval); the old dialects over it
    (build_years_dialects.overlay). The app's starter keyframes are snapshots
    of it for DJ to paint over, and the map is drawn from it frame by frame,
    so the frames between keyframes follow exactly the same timing (DJ,
    17 Oct 2026: the languages of his 1565 map gave way to Estijan straight
    after 1565, when the keyframes had them live to the 1690s).

    Kept on disk (data/cache/years/kf/schedule/) for the worker processes."""

    def __init__(self, folder):
        self.folder = folder
        self._pair, self._era = {}, {}

    # writing ------------------------------------------------------------------------------
    def put(self, name, arr):
        os.makedirs(self.folder, exist_ok=True)
        np.save(os.path.join(self.folder, f'{name}.npy'), arr)

    def write_meta(self, meta):
        by.write_json(os.path.join(self.folder, 'meta.json'), meta)

    # reading ------------------------------------------------------------------------------
    def get(self, name):
        p = os.path.join(self.folder, f'{name}.npy')
        return np.load(p, mmap_mode='r') if os.path.exists(p) else None

    def load(self):
        self.meta = by.read_json(os.path.join(self.folder, 'meta.json'), {})
        self.years = self.meta.get('years', [])
        self.T0 = self.get('T0')
        self.S, self.P, self.Pst, self.Nat = self.get('S'), self.get('P'), self.get('Pst'), self.get('Nat')
        self.Arr, self.Pre, self.PreOn = self.get('Arr'), self.get('Pre'), self.get('PreOn')
        self.Lost, self.LostOn = self.get('Lost'), self.get('LostOn')
        self.P2, self.Pst2 = self.get('P2'), self.get('Pst2')
        self.P3, self.Pst3, self.Pend3 = self.get('P3'), self.get('Pst3'), self.get('Pend3')
        self.Claimed, self.Settled = self.get('Claimed'), self.get('Settled')
        self.BanFam, self.BanUntil = self.get('BanFam'), self.get('BanUntil')
        self.cover = {y: (self.get(f'v{y}'), self.get(f'c{y}')) for y in self.years}
        self.dreg, self.drank = self.get('dreg'), self.get('drank')
        self.dkeep, self.dkeep_year = self.get('dkeep'), self.meta.get('dkeep_year')
        self.dstd = {int(k): v for k, v in self.meta.get('dstd', {}).items()}
        return self

    def pair(self, a, b, L):
        if (a, b) not in self._pair:
            S_hi = up(self.get(f'p{a}_{b}').reshape(H, W))
            va, vb = np.asarray(self.cover[a][0]), np.asarray(self.cover[b][0])
            self._pair[(a, b)] = (va, vb, S_hi, *prepare(va, vb, S_hi, L.anc))
        return self._pair[(a, b)]

    def era(self, t):
        """The places whose last keyframe is a and next b (None: none after), for years from t to the next keyframe year."""
        done = [y for y in self.years if y <= t]
        key = len(done)
        if key not in self._era:
            prev = np.full((IH, IW), -1, dtype=np.int64)
            nxt = np.full((IH, IW), -1, dtype=np.int64)
            for k, y in enumerate(self.years):
                c = np.asarray(self.cover[y][1])
                if y <= t:
                    prev[c] = k
                else:
                    nxt[c & (nxt < 0)] = k
            out = []
            for i in range(len(done)):
                for j in list(range(len(done), len(self.years))) + [-1]:
                    m = (prev == i) & (nxt == j)
                    if m.any():
                        out.append((self.years[i], self.years[j] if j >= 0 else None, m))
            self._era = {key: out}       # one era at a time: the years come in order
        return self._era[key]

    def _neighbours(self, out, wait, L):
        """Places whose own line had not reached them yet speak as the people
        nearest them of another branch spoke that year, within PRE_REACH
        (about 600 km); past that, unknown (DJ, 20 Oct 2026: "Earlier states,
        else neighbours"). The earlier states' languages are already there
        (Backward's P); these are the rest. wait: working grid (H x W)."""
        from scipy import ndimage
        if not hasattr(self, '_bo'):
            self._bo = branch_of_lang(L)
        T = np.asarray(self.T0)[::2, ::2]
        lo = out[::2, ::2].copy()
        need = wait & (lo < 0) & (T >= 0)
        if not need.any():
            return out
        tb = np.where(T >= 0, self._bo[np.maximum(T, 0)], -1)
        speak_b = np.where(lo >= 0, self._bo[np.maximum(lo, 0)], -2)
        filled = lo.copy()
        for b in np.unique(tb[need]):
            g = need & (tb == b)
            ys, xs = np.nonzero(g)
            y0, y1 = max(0, ys.min() - PRE_REACH), min(H, ys.max() + 1 + PRE_REACH)
            x0, x1 = max(0, xs.min() - PRE_REACH), min(W, xs.max() + 1 + PRE_REACH)
            src = (lo[y0:y1, x0:x1] >= 0) & (speak_b[y0:y1, x0:x1] != b)
            if not src.any():
                continue
            d, (iy, ix) = ndimage.distance_transform_edt(~src, return_indices=True)
            gg = g[y0:y1, x0:x1] & (d <= PRE_REACH)
            sub = filled[y0:y1, x0:x1]
            sub[gg] = lo[y0:y1, x0:x1][iy[gg], ix[gg]]
        ch = up(filled != lo)
        return np.where(ch, up(filled), out).astype(out.dtype)

    def _before_colonists(self, out, st):
        """A colony's land before its colonists came spoke as the people round
        it did: the nearest place with a language, within FILL_REACH (about 120 km); a strip
        or a stretch of coast colonised later was left a grey island inside
        land whose languages are known (DJ, 19 Oct 2026: replace the grey). A
        land colonised whole, with no people of known speech that near, stays
        grey: what was spoken there before is lost."""
        if self.Nat is None:
            return out
        from scipy import ndimage
        lost = (st[::2, ::2] == 2) & ~np.asarray(self.Nat).reshape(H, W) & (np.asarray(self.T0)[::2, ::2] >= 0)
        if not lost.any():
            return out
        ys, xs = np.nonzero(lost)
        y0, y1 = max(0, ys.min() - FILL_REACH), min(H, ys.max() + 1 + FILL_REACH)
        x0, x1 = max(0, xs.min() - FILL_REACH), min(W, xs.max() + 1 + FILL_REACH)
        ow = out[::2, ::2][y0:y1, x0:x1]
        dist, (iy, ix) = ndimage.distance_transform_edt(ow < 0, return_indices=True)
        fill = lost[y0:y1, x0:x1] & (dist <= FILL_REACH)
        if not fill.any():
            return out
        got = ow[iy, ix]
        w = out[::2, ::2].copy()
        w[y0:y1, x0:x1][fill] = got[fill]
        ch = up(w != out[::2, ::2])
        return np.where(ch, up(w), out).astype(out.dtype)

    def compose(self, t, L):
        """Each place's language (unresolved) in year t, at picture size."""
        if self.T0 is None:
            return np.full((IH, IW), -1, dtype=np.int16)
        st = Backward.state(t, np.asarray(self.S), np.asarray(self.P), np.asarray(self.Pst), self.Nat, self.P2, self.Pst2)
        wait = None
        if self.Arr is not None:     # the family had not reached the place yet: earlier peoples, unknown speech
            wait = (st == 0) & (t < np.asarray(self.Arr))
            st = np.where(wait, 2, st).astype(np.int8)
        st = up(st.reshape(H, W))
        out = np.where(st == 0, self.T0, np.where(st == 1, up(np.asarray(self.P).reshape(H, W)), -1)).astype(np.int16)
        if self.P2 is not None:
            m3 = st == 3
            out[m3] = up(np.asarray(self.P2).reshape(H, W))[m3]
        if self.P3 is not None:     # a later foreign rule's language, before their own came back
            p3 = np.asarray(self.P3)
            m4 = up(((p3 >= 0) & (t >= np.asarray(self.Pst3)) & (t < np.asarray(self.Pend3))).reshape(H, W)) & (st == 0)
            out[m4] = up(p3.reshape(H, W))[m4]
        if wait is not None and wait.any() and self.Pre is not None:
            # ... unless they spoke as their neighbours had come to (stand_ins)
            pre = np.where(wait & (t >= np.asarray(self.PreOn)), np.asarray(self.Pre), -1).reshape(H, W)
            m = up(pre >= 0)
            out[m] = up(pre)[m]
        nxt = np.full(out.shape, -1, dtype=np.int16)      # each place's next keyframe's language
        for a, b, m in self.era(t):
            if b is None:
                out[m] = np.asarray(self.cover[a][0])[m]
            else:
                va, vb, S_hi, need, deep = self.pair(a, b, L)
                out[m] = choose(t, va, vb, S_hi, need, deep)[m]
                nxt[m] = vb[m]
        if self.BanFam is not None:     # DJ's word: no such family's speech here before then (migrations.json "not before")
            bf, bu = up(np.asarray(self.BanFam).reshape(H, W)), up(np.asarray(self.BanUntil).reshape(H, W))
            ok = out >= 0
            out[ok & (bf >= 0) & (t < bu) & (L.fam[np.maximum(out, 0)] == bf)] = -1
        if self.Lost is not None:
            # ... else a lost language, in historical times (scripts/lost-languages.py): wherever
            # speech is still unknown, natives waiting for theirs, a colony's peoples before its
            # colonists and land a keyframe leaves grey alike (DJ, 20 Oct 2026: "Use the nearby native")
            lost = up(np.where(t >= np.asarray(self.LostOn), np.asarray(self.Lost), -1).reshape(H, W))
            if self.BanFam is not None:     # nor a lost language of a family DJ's word keeps out
                lost[(lost >= 0) & (bf >= 0) & (t < bu) & (L.fam[np.maximum(lost, 0)] == bf)] = -1
            m = (lost >= 0) & (out < 0)
            out[m] = lost[m]
        out = self._before_colonists(out, st)
        if self.dstd:
            import build_years_dialects as bd
            out = bd.overlay(out, np.asarray(self.dreg), self.dstd, L, t, np.asarray(self.drank),
                             keep=None if self.dkeep is None else np.asarray(self.dkeep), keep_year=self.dkeep_year)
        # a language is spoken only between its birth and death on the chart: past its
        # death its people speak the stage it became (or, if its line ended, a lost
        # language), and before its family's first language anyone there is grey
        at = L.at(t)
        ok = out >= 0
        stage = np.where(ok, at[np.maximum(out, 0)], 0)
        dead = ok & (L.died[stage] <= t)
        if dead.any():
            cont = np.array([continuation(L, k, t) for k in range(L.n)], dtype=np.int64)
            # an old dialect was replaced by its standard, not lost: its last speakers speak that
            for d, s in self.dstd.items():
                if cont[d] < 0:
                    cont[d] = continuation(L, s, t)
            new = cont[out[dead]]
            # a language that died with no successor, where the next keyframe shows a living
            # language, gives way to that (its speakers took up the language that was to be there),
            # rather than leaving grey specks till the keyframe: single places of a keyframe finer
            # than the switching grid were never given a switch year (DJ, 19 Oct 2026)
            nx = nxt[dead]
            fold = (new < 0) & (nx >= 0)
            if fold.any():
                cand = at[nx[fold]]
                okf = (L.born[cand] <= t) & (L.died[cand] > t)
                nf = new[fold]
                nf[okf] = cand[okf]
                new[fold] = nf
            out[dead] = new
        out[ok & (L.born[stage] > t)] = -1
        if self.Lost is not None:
            # the land that rule left grey (its rulers' language not yet born) spoke its lost language too
            lk = np.maximum(lost, 0)
            m = (out < 0) & (lost >= 0) & (L.born[lk] <= t) & (L.died[lk] > t)
            out[m] = lost[m]
        # between keyframes, no salt and pepper (a keyframe stays exactly as painted): lone working-grid
        # pixels (two by two in the picture) and lone picture pixels
        if t not in self.years:
            w = out[::2, ::2]
            w2 = despeckle(w)
            ch = up(w2 != w)
            if ch.any():
                out = np.where(ch, up(w2), out).astype(out.dtype)
            out = despeckle(out)
        return out
