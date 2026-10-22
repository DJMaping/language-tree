"""
lost-languages.py - the languages nobody remembers: where Through time would
be grey in historical times, the peoples there spoke something, now lost
(DJ, 20 Oct 2026: "there's no versions of, like, Celtic"; lost languages "where
it would be grey", in "historical times only", "Lost <Family> A, B, C"). Each
grey stretch of a later language's land, after PRE_FROM, is cut into regions
about REGION_KM across, and each region gets a lost language: an extinct
sister branch of the family that later took the land (Celtic to Latin), or,
far from that family's homeland, an isolate (Etruscan, Iberian). Their names
are placeholders for DJ to rename (in data/history/lost.json).

    python scripts/lost-languages.py      make data/history/lost.json and lost-regions.png from the last build,
                                          keeping the ids and names of regions it made before
    python scripts/build-years.py languages
    python scripts/lost-languages.py --dates   then their deaths from what the build shows (and build again)

They are the map's own, never on the chart (DJ, 21 Oct 2026: "DONT add the lost languages to the
chart"): the build reads them from lost.json (build_years_languages.read_languages), not from
data/languages.json, and no words are made for them.

Reads the last build's schedule (data/cache/years/kf/schedule).
"""

import json
import math
import os
import string
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'scripts'))
import build_years_commoners as bc  # noqa: E402
import build_years_terrain as bt    # noqa: E402

REGION_KM = 600      # a lost language's region, about this across (Gaulish, Iberian, Thracian)
MIN_KM2 = 60000      # a grey stretch smaller than this is too small for a language of its own
ISOLATE_KM = 2500    # farther than this from its replacer's homeland, a lost language is an isolate
SIZE_SIGMA = 0.7     # how unequal the regions of one stretch are (log-normal shares)
ABSORB_P = 0.5       # the share of lost languages a neighbouring lost people takes over before their land's
                     # own language comes (DJ, 20 Oct 2026: languages should 'fluctuate'): Earth's
                     # unrecorded peoples merged and spread among themselves as well
ABSORB_SPAN = 300    # years the takeover runs across the region, from the shared border
OUT = os.path.join(ROOT, 'data', 'history', 'lost.json')
OUT_PNG = os.path.join(ROOT, 'data', 'history', 'lost-regions.png')
H, W = bc.H, bc.W
KM = 40075.0 / W


def letters(n):
    """A, B, ... Z, AA, AB, ..."""
    out = ''
    n += 1
    while n:
        n, r = divmod(n - 1, 26)
        out = string.ascii_uppercase[r] + out
    return out


def slug(s):
    return ''.join(c.lower() if c.isalnum() else '-' for c in s).strip('-')


def absorb(out, regions):
    """Some lost languages taken over by a neighbouring lost people before their land's own language
    came: each with chance ABSORB_P, by a neighbour that is not itself taken over, at a year between
    its region's coming plus 300 and its end less 200, the same each run for the same languages.
    Written to each entry as absorbedBy / absorbedAt (lost-regions.png keeps the regions)."""
    from scipy import ndimage
    n = len(out)
    if not n:
        return
    touch = set()
    for dy, dx in ((0, 1), (1, 0), (1, 1), (1, -1)):
        a = regions
        b = np.roll(np.roll(regions, -dy, axis=0), -dx, axis=1)
        m = (a > 0) & (b > 0) & (a != b)
        touch |= {(int(x), int(y)) for x, y in set(zip(a[m].tolist(), b[m].tolist()))}
    nbrs = {k: set() for k in range(1, n + 1)}
    for x, y in touch:
        nbrs[x].add(y)
        nbrs[y].add(x)
    rng = np.random.default_rng(1805)
    order = rng.permutation(n) + 1
    taken, takers = set(), set()
    for e in out:
        e.pop('absorbedBy', None)
        e.pop('absorbedAt', None)
    for k in order:
        e = out[k - 1]
        if k in takers or rng.random() >= ABSORB_P:
            continue
        cand = [j for j in sorted(nbrs[k]) if j not in taken]
        if not cand:
            continue
        j = cand[int(rng.integers(len(cand)))]
        start = max(bc.PRE_FROM - bc.PRE_SPAN, e['born']) + 300
        end = e['died'] - 200
        if end <= start:
            continue
        e['absorbedBy'] = out[j - 1]['id']
        e['absorbedAt'] = int(start + rng.random() * (end - start))
        taken.add(k)
        takers.add(j)


FADE = 0.05         # a lost language has died once it holds less than this share of its widest
FADE_KM2 = 2000     # ... or less than this many km2 (its last speakers took up their neighbours' speech)


def dates():
    """After a build: each lost language's death from when Through time stops showing it (the
    commoners' areas per frame in data/cache/years/frames.json), not from the latest arrival
    anywhere in its region, which a single late corner set. One never shown (its land held by
    earlier states' or neighbours' speech the whole time) is marked unseen and leaves the tree."""
    doc = json.load(open(OUT, encoding='utf-8'))
    fr = json.load(open(os.path.join(ROOT, 'data', 'cache', 'years', 'frames.json'), encoding='utf-8'))
    key = {v['id']: k for k, v in fr['langs'].items()}
    years = sorted(fr['frames'], key=int)
    seen = unseen = 0
    for e in doc['languages']:
        k = key.get(e['id'])
        a = np.array([(fr['frames'][y].get('common') or {}).get(k, [0, 0, 0, 0, 0])[4] if k else 0 for y in years], float)
        e.pop('unseen', None)
        if a.max() <= 0:
            e['unseen'] = True
            unseen += 1
            continue
        on = np.nonzero(a > max(FADE * a.max(), FADE_KM2))[0]
        if not len(on):
            on = np.nonzero(a > 0)[0]
        last = on[-1]
        e['died'] = int(years[last + 1]) if last + 1 < len(years) else 1765
        e['peakKm2'] = int(a.max())
        e['peakYear'] = int(years[int(a.argmax())])
        seen += 1
    json.dump(doc, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    d = [e['died'] for e in doc['languages'] if not e.get('unseen')]
    print(f'{seen} lost languages dated from the frames (death median {int(np.median(d))}, '
          f'{sum(1 for x in d if x >= 1765)} still spoken in 1765), {unseen} never shown -> {os.path.relpath(OUT, ROOT)}')


def main():
    from PIL import Image
    from scipy import ndimage
    from build_years_languages import Tree
    from build_years_languages import read_languages
    doc = read_languages()          # the tree and the lost languages made before (the map's own)
    ids = [l['id'] for l in doc['languages']]
    L = bc.Lines(Tree(doc), ids, {i: '#808080' for i in ids})
    by_id = {l['id']: l for l in doc['languages']}
    s = bc.Schedule(os.path.join(ROOT, 'data', 'cache', 'years', 'kf', 'schedule')).load()
    # the schedule's indices are into the language list of the build that made it, not today's
    # languages.json (which gains and loses lost languages between builds)
    built = s.meta.get('ids')
    if not built:
        fr = json.load(open(os.path.join(ROOT, 'data', 'cache', 'years', 'frames.json'), encoding='utf-8'))
        built = [v['id'] for _, v in sorted(fr['langs'].items(), key=lambda kv: int(kv[0]))]
    now = np.array([L.idx.get(i, -1) for i in built] + [-1], dtype=np.int32)
    T = np.asarray(s.T0)[::2, ::2].ravel()
    T = np.where(T >= 0, now[np.where(T >= 0, T, len(built))], -1)
    Arr = np.asarray(s.Arr).ravel()
    Pre = np.asarray(s.Pre).ravel() if s.Pre is not None else np.full(W * H, -1)
    Nat = np.asarray(s.Nat).ravel()
    lost_ids = {i for i in ids if i.startswith('lost-')}
    fam = np.where(T >= 0, L.fam[np.maximum(T, 0)], -1)

    def root_of(i):
        while by_id[i].get('parentId') in by_id:
            i = by_id[i]['parentId']
        return i
    root_born = {}
    for i in ids:
        r = root_of(i)
        root_born[L.fam[L.idx[i]]] = min(root_born.get(L.fam[L.idx[i]], 1e9), by_id[r].get('born') or 0)
    # grey before its own language came, in historical times (a neighbour's speech may come later and
    # take over from it, as Germanic did from Celtic); not the lost languages' own land from a run before
    tl = np.array([i in lost_ids for i in ids])
    land = bt.land().ravel()
    # land empty before its first rulers had no lost people: its settlers' speech is known (DJ, 20 Oct
    # 2026: Atirha "had no humans before")
    ef = s.get('EmptyFirst')
    empty = np.asarray(ef).ravel().astype(bool) if ef is not None else np.zeros(W * H, bool)
    grey = Nat & (T >= 0) & ~tl[np.maximum(T, 0)] & (Arr > bc.PRE_FROM) & (Arr < bc.NEVER) & land & ~empty
    # ... and a colony's land before its colonists (DJ: "Use the nearby native"): its peoples' lost
    # languages are of the nearest native family, never the colonists'
    S = np.asarray(s.S).ravel()
    col = ~Nat & (T >= 0) & land & ~empty & (S > bc.PRE_FROM) & (S < bc.NEVER)
    native = (Nat & (T >= 0)).reshape(H, W)
    _, (iy, ix) = ndimage.distance_transform_edt(~native, return_indices=True)
    near_fam = np.where(T >= 0, L.fam[np.maximum(T, 0)], -1).reshape(H, W)[iy, ix].ravel()
    # ... and land a keyframe leaves grey before its first language (New Ayre's interior on the early
    # maps): the nearest native family's too, till that language came
    first_y = np.full(W * H, bc.NEVER, dtype=np.int64)
    first_l = np.full(W * H, -1, dtype=np.int64)
    for y in sorted(s.years):
        v = np.asarray(s.cover[y][0])[::2, ::2].ravel()
        k = (v >= 0) & (first_y == bc.NEVER)
        first_y[k] = y
        first_l[k] = now[v[k]]
    kgrey = (T < 0) & land & ~empty & (first_y > bc.PRE_FROM) & (first_y < bc.NEVER) & (first_l >= 0)
    fam = np.where(col | kgrey, near_fam, fam)
    grey = grey | col | kgrey
    # a family DJ's word keeps out of a land (migrations.json "not before": no Alzuria-Ayuman in New
    # Ayre before 1000) gives it no lost language, whose speakers would be there long before: the
    # nearest native family of another
    mig = json.load(open(os.path.join(ROOT, 'data', 'history', 'migrations.json'), encoding='utf-8'))
    st_w, names_w = bc.country_raster(W, H)
    Tfam = np.where(T >= 0, L.fam[np.maximum(T, 0)], -1)
    for e in mig.get('not before') or []:
        if e.get('family') not in L.fams:
            continue
        b = L.fams.index(e['family'])
        hit = grey & (fam == b) & np.isin(st_w, [names_w.index(c) for c in e.get('countries', []) if c in names_w]).ravel()
        if hit.any():
            other = native & (Tfam != b).reshape(H, W)
            _, (jy, jx) = ndimage.distance_transform_edt(~other, return_indices=True)
            fam = np.where(hit, Tfam.reshape(H, W)[jy, jx].ravel(), fam)
    until = np.where(col, S, np.where(kgrey, first_y, Arr))       # when its people's lost language gave way
    T_rep = np.where(T >= 0, T, first_l)                           # the language that took its land
    lat = 90.0 - (np.arange(H) + 0.5) * 180.0 / H
    cell_km2 = (KM ** 2) * np.cos(np.radians(lat))[:, None] * np.ones((1, W))
    old = json.load(open(OUT, encoding='utf-8')) if os.path.exists(OUT) else {'languages': []}
    old_png = np.asarray(Image.open(OUT_PNG)).astype(np.int32) if os.path.exists(OUT_PNG) else np.zeros((H, W), np.int32)
    st, names = bc.country_raster(W, H)
    regions = np.zeros((H, W), dtype=np.int32)
    out, used = [], set()
    count = {}
    for f in np.unique(fam[grey]):
        fmask = (grey & (fam == f)).reshape(H, W)
        lab, n = ndimage.label(fmask, structure=np.ones((3, 3)))
        home = ((fam == f) & Nat & (Arr <= root_born.get(f, -1e9) + 1)).reshape(H, W)
        dh = ndimage.distance_transform_edt(~home) * KM if home.any() else np.full((H, W), np.inf)
        for j in range(1, n + 1):
            comp = lab == j
            km2 = float(cell_km2[comp].sum())
            if km2 < MIN_KM2:
                continue
            k = max(1, int(round(km2 / (REGION_KM ** 2))))
            if k == 1:
                parts = [comp]
            else:
                ys, xs = np.nonzero(comp)
                pts = [int(np.argmax((ys - ys.mean()) ** 2 + (xs - xs.mean()) ** 2))]
                while len(pts) < k:
                    d = np.min([(ys - ys[p]) ** 2 + (xs - xs[p]) ** 2 for p in pts], axis=0)
                    pts.append(int(np.argmax(d)))
                # shares unequal, as Earth's languages' are (a few large, many small; even shares tiled
                # the land like a honeycomb), the same each run for the same stretch
                rng = np.random.default_rng(int(f) * 7919 + j)
                # (within limits: uncapped, one lost language of 2.5 million km2 was the world's largest)
                want = np.clip(np.exp(SIZE_SIGMA * rng.standard_normal(k)), 0.4, 2.2)
                owner, _ = bt.carve(comp, [(int(xs[p]), int(ys[p])) for p in pts], list(want), rough_land=True)
                parts = []
                for q in range(k):
                    m = np.zeros((H, W), bool)
                    m[ys[owner == q], xs[owner == q]] = True
                    parts.append(m)
            for part in parts:
                if not part.any() or float(cell_km2[part].sum()) < MIN_KM2 / 2:
                    continue
                far = float(np.median(dh[part]))
                isolate = far > ISOLATE_KM or not home.any()
                # the same region as a lost language made before: keep its id and name (DJ may have named it)
                prev = None
                if old_png.any():
                    v, c = np.unique(old_png[part], return_counts=True)
                    best = [(cc, vv) for vv, cc in zip(v, c) if vv > 0 and cc > 0.5 * part.sum()]
                    if best:
                        e = old['languages'][max(best)[1] - 1]
                        if e['id'] not in used and bool(e.get('isolate')) == isolate:
                            prev = e
                fam_name = L.fams[f]
                key = 'isolate' if isolate else fam_name
                if prev:
                    lid, name = prev['id'], prev['name']
                else:
                    while True:
                        letter = letters(count.get(key, 0))
                        count[key] = count.get(key, 0) + 1
                        lid = f'lost-isolate-{letter.lower()}' if isolate else f'lost-{slug(fam_name)}-{letter.lower()}'
                        if lid not in used and lid not in {e['id'] for e in old['languages']}:
                            break
                    name = f'Lost Isolate {letter}' if isolate else f'Lost {fam_name} {letter}'
                used.add(lid)
                arr = until.reshape(H, W)[part]
                died = int(min(1765, np.max(arr) + 10))
                root = None
                for i in ids:
                    if L.fam[L.idx[i]] == f and by_id[i].get('parentId') not in by_id:
                        root = i
                        break
                rb = int(by_id[root].get('born') or -3000) if root else -3000
                born = -3000 if isolate else int(min(rb + 500, bc.PRE_FROM - 100))
                cs = [names[v] for v, _ in sorted(zip(*np.unique(st[part][st[part] >= 0], return_counts=True)),
                                                  key=lambda t: -t[1])[:4]]
                later = ids[int(np.bincount(T_rep.reshape(H, W)[part]).argmax())]
                out.append({'id': lid, 'name': name, 'isolate': isolate, 'parentId': None if isolate else root,
                            'family': None if isolate else fam_name, 'born': born, 'died': max(died, born + 100),
                            'countries': cs, 'replacedBy': later, 'km2': int(cell_km2[part].sum()),
                            'homelandKm': None if not np.isfinite(far) else int(far)})
                regions[part] = len(out)
    absorb(out, regions)
    doc_out = {
        '_readme': "Lost languages (scripts/lost-languages.py, DJ, 20 Oct 2026): spoken in the land Through time would show grey "
                   "in historical times, before its later language came; names are placeholders, rename them here "
                   "(this file keeps ids and regions between runs); the map\'s own, never on the chart. lost-regions.png: each region's index + 1 on the working grid.",
        'languages': out}
    json.dump(doc_out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    Image.fromarray(regions.astype(np.uint16)).save(OUT_PNG)
    iso = sum(1 for e in out if e['isolate'])
    print(f'{len(out)} lost languages ({len(out) - iso} sister branches, {iso} isolates), '
          f'{sum(e["km2"] for e in out):,} km2 -> {os.path.relpath(OUT, ROOT)}')


if __name__ == '__main__':
    dates() if '--dates' in sys.argv else main()
