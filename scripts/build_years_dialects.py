"""
Old dialects (DJ, 15 Oct 2026: "dialect continuum ... all those Italian
languages that are now gone but used to exist"): before a standard language
spread, a big language's land spoke a patchwork of regional languages, as
Italy spoke Lombard, Venetian and Neapolitan before Italian. His choices:
real languages on the chart, for big long-lived languages (the app picks, he
vetoes), named after a canon city in their region ("<City> <Language>", as his
own Gyua Dahen; the engine forges a region name where no city fits), fading
mostly 1600-1765 as the standard spreads from its capital, the farthest one or
two surviving to 1765.

    python scripts/build-years.py dialects   1. propose: data/history/dialects.json (who, where, when)
    node scripts/build-dialects.js           2. put them on the chart (names, dates), marked generated
    python scripts/build-years.py languages  3. the maps: each standard's land carved among them

(npm run dialects does all three.) A language already proposed is never
proposed again, so DJ's edits and deletions on the chart stand; remove its
entry from dialects.json to propose it afresh. Dials at the top of the file.

Cities: data/canon/cities.json, the 591 canon cities with positions from
DJ's games (Desktop\\Andah games\\andah_games\\data\\flight-cities-readable.csv,
the same frame as his maps), written by this script when missing.
"""

import csv
import json
import math
import os

import numpy as np

import importlib.util
_spec = importlib.util.spec_from_file_location('by', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'build-years.py'))
by = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(by)

import build_years_commoners as bc   # noqa: E402

ROOT, CACHE, HISTORY, KEYFRAMES = by.ROOT, by.CACHE, by.HISTORY, by.KEYFRAMES
IW, IH = by.IW, by.IH
PATH = os.path.join(HISTORY, 'dialects.json')
CITIES = os.path.join(ROOT, 'data', 'canon', 'cities.json')
FLIGHT = os.path.join(os.path.expanduser('~'), 'Desktop', 'Andah games', 'andah_games', 'data', 'flight-cities-readable.csv')
DIALS = {
    'minAreaKm2': 1_000_000,   # a standard's land in 1765 at least this big
    'minYears': 600,           # and its line on the commoners' map at least this long
    'kmPerDialect': 400,       # how many: the square root of its land (km2) / this ...
    'min': 2, 'max': 6,        # ... kept between these
    'fadeFrom': 1600,          # the standard replaces them from its capital outwards, nearest first ...
    'fadeTo': 1755,            # ... the last of the faded by this year
    'surviveEvery': 3,         # one survivor to 1765 for every this many (at least one) ...
    'surviveMax': 2,           # ... at most this many, the farthest from the capital
    'standardShare': 1.5,      # the standard's own home region, in dialects' worth of land
}


def cities():
    """The canon cities with positions: [{name, nation, continent, pop, capital, x, y}] at picture size."""
    doc = by.read_json(CITIES, None)
    if doc is None:
        if not os.path.exists(FLIGHT):
            return []
        rows = []
        with open(FLIGHT, encoding='utf-8') as f:
            for r in csv.DictReader(f):
                try:
                    rows.append({'name': r['City'], 'nation': r['Nation'], 'continent': r['Continent'],
                                 'pop': float(r['Population (M)'] or 0), 'capital': (r.get('Capital?') or '').strip().lower() == 'yes',
                                 'lat': float(r['Latitude']), 'lon': float(r['Longitude'])})
                except (KeyError, ValueError):
                    continue
        doc = {'_source': "DJ's games: Desktop\\Andah games\\andah_games\\data\\flight-cities-readable.csv (canon cities with positions, "
                          'population in millions, capitals), the same frame as his maps. Written by scripts/build_years_dialects.py.',
               'cities': rows}
        by.write_json(CITIES, doc, indent=1)
    out = []
    for c in doc['cities']:
        out.append({**c, 'x': int((c['lon'] + 180) / 360 * IW) % IW, 'y': min(IH - 1, max(0, int((90 - c['lat']) / 180 * IH)))})
    return out


def read_doc():
    d = by.read_json(PATH, {})
    dials = {**DIALS, **{k: v for k, v in (d.get('dials') or {}).items() if k in DIALS}}
    return {'dials': dials, 'languages': d.get('languages') or {}}


def write_doc(d):
    by.write_json(PATH, {
        '_readme': 'Old regional languages of the big languages (scripts/build_years_dialects.py, DJ 15 Oct 2026). One entry per standard '
                   'language: its home (the capital its standard spread from) and its old dialects, each around a canon city (or a point, '
                   'named by the engine), with the year the standard replaced it (none: it survives to 1765). "id" is its language on the '
                   'chart once added (node scripts/build-dialects.js). Delete an entry to have it proposed again; change dials to change '
                   'the next proposals.',
        'dials': d['dials'], 'languages': d['languages']}, indent=1)


def propose():
    import build_years_languages as bl
    doc = by.read_json(os.path.join(ROOT, 'data', 'languages.json'), None)
    tree = bl.Tree(doc)
    ids = [l['id'] for l in doc['languages']]
    key = by.read_json(os.path.join(KEYFRAMES, 'key.json'), {}).get('languages', {})
    if any(i not in key for i in ids):
        key = bl.key_colours(tree, bl.continuum_colours(tree, {})[0], set())
    L = bc.Lines(tree, ids, key)
    kfs = bc.list_keyframes()
    if not kfs:
        raise SystemExit('No commoners keyframes yet: run  python scripts/build-years.py languages')
    last = max(kfs)
    lang = bc.read_keyframe(os.path.join(KEYFRAMES, kfs[last]), L)[0]
    F = by.read_json(os.path.join(CACHE, 'frames.json'), None)
    d = read_doc()
    k = d['dials']
    # land per language in km2
    lat = 90.0 - (np.arange(IH) + 0.5) * 180.0 / IH
    row = (360.0 / IW * 111.2) * (180.0 / IH * 111.2) * np.cos(np.radians(lat))
    ok = lang >= 0
    km2 = np.bincount(lang[ok].astype(np.int64), weights=np.broadcast_to(row[:, None], lang.shape)[ok], minlength=L.n)
    # when each line first reached the commoners' map
    first_seen = np.full(L.n, 10 ** 7)
    code_id = {int(c): v['id'] for c, v in F['langs'].items()}
    for y in sorted(int(z) for z in F['frames']):
        for c in F['frames'][str(y)].get('common', {}):
            i = code_id.get(int(c))
            if i in L.idx and first_seen[L.idx[i]] > y:
                first_seen[L.idx[i]] = y
    town = cities()
    for c in town:
        c['lang'] = int(lang[c['y'], c['x']])
    official = {}
    for l in doc['languages']:
        for a in l.get('areas') or []:
            if a.get('role') == 'official':
                official.setdefault(l['id'], set()).add(a['state'])
    rng = np.random.default_rng(1765)
    added = 0
    for li in range(L.n):
        i = ids[li]
        l = tree.by_id[i]
        if i in d['languages'] or l.get('died') is not None or l.get('kind') == 'constructed' or l.get('generated'):
            continue
        if km2[li] < k['minAreaKm2']:
            continue
        line = np.nonzero(L.anc[li])[0]           # the language and its ancestors
        if first_seen[line].min() > last - k['minYears']:
            continue
        n = int(min(k['max'], max(k['min'], round(math.sqrt(km2[li]) / k['kmPerDialect']))))
        ys, xs = np.nonzero(lang == li)
        here = [c for c in town if c['lang'] == li]
        here.sort(key=lambda c: -c['pop'])
        caps = [c for c in here if c['capital'] and c['nation'] in official.get(i, ())]
        core = caps[0] if caps else (here[0] if here else None)
        if core:
            cx, cy = core['x'], core['y']
        else:
            j = int(np.argmin((xs - xs.mean()) ** 2 + (ys - ys.mean()) ** 2))
            cx, cy = int(xs[j]), int(ys[j])
        # seeds: big cities far apart (and from the capital), then points of land
        chosen = [(cx, cy)]
        seeds = []
        pool = [c for c in here if c is not core]
        while len(seeds) < n and pool:
            def score(c):
                dd = min(math.hypot(c['x'] - x, c['y'] - y) for x, y in chosen)
                return dd * (max(c['pop'], 0.05) ** 0.25)
            best = max(pool, key=score)
            if min(math.hypot(best['x'] - x, best['y'] - y) for x, y in chosen) < 15:
                break
            pool.remove(best)
            chosen.append((best['x'], best['y']))
            seeds.append({'city': best['name'], 'nation': best['nation'], 'x': best['x'], 'y': best['y']})
        if len(seeds) < n:
            sample = rng.choice(len(xs), size=min(len(xs), 20000), replace=False)
            sx, sy = xs[sample], ys[sample]
            while len(seeds) < n:
                dd = np.min([np.hypot(sx - x, sy - y) for x, y in chosen], axis=0)
                j = int(np.argmax(dd))
                chosen.append((int(sx[j]), int(sy[j])))
                seeds.append({'city': None, 'x': int(sx[j]), 'y': int(sy[j])})
        # the standard spreads from the capital: nearest replaced first, farthest survive
        dist = [math.hypot(s['x'] - cx, s['y'] - cy) for s in seeds]
        order = sorted(range(n), key=lambda j: dist[j])
        keep = min(k['surviveMax'], max(1, round(n / k['surviveEvery'])))
        fading = order[:n - keep]
        for r, j in enumerate(fading):
            t = k['fadeFrom'] + (k['fadeTo'] - k['fadeFrom']) * (r / max(1, len(fading) - 1) if len(fading) > 1 else 0.5)
            seeds[j]['died'] = int(round(t / 5) * 5)
        for j in order[n - keep:]:
            seeds[j]['died'] = None
        d['languages'][i] = {'standard': i, 'name': l['name'], 'areaKm2': int(km2[li]),
                             'home': {'city': core['name'] if core else None, 'x': cx, 'y': cy}, 'dialects': seeds}
        added += 1
    write_doc(d)
    total = sum(len(e['dialects']) for e in d['languages'].values())
    print(f'{added} languages proposed now ({len(d["languages"])} in all, {total} old dialects): {PATH}')
    print('Next: node scripts/build-dialects.js, then python scripts/build-years.py languages')


# --- on the maps ------------------------------------------------------------------------------

def regions(L, lang, d=None):
    """Each standard's land in a commoners' keyframe (its own and its old
    dialects' pixels) carved among them around their seeds: -> a dialect's
    language index per pixel (-1 elsewhere, and in the standard's home), and
    {dialect index: standard index}."""
    d = d or read_doc()
    out = np.full(lang.shape, -1, dtype=np.int16)
    std_of = {}
    for e in d['languages'].values():
        s = e.get('standard')
        ds = [x for x in e.get('dialects') or [] if x.get('id') in L.idx]
        if s not in L.idx or not ds:
            continue
        members = [L.idx[s]] + [L.idx[x['id']] for x in ds]
        ys, xs = np.nonzero(np.isin(lang, members))
        if len(ys) < 10 * len(members):
            continue
        pts = np.column_stack([xs, ys]).astype(np.float64)
        own = np.full(len(pts), L.idx[s], dtype=np.int64)
        h = e['home']
        k = d['dials']['standardShare']
        owner = bc.carve(pts, [(L.idx[s], (h['x'], h['y']), 1.0)], [(x['id'], ('point', (x['x'], x['y'])), 1) for x in ds],
                         own, np.zeros(len(pts), dtype=np.int64), L.idx[s], fixed_share=k / (k + len(ds)))
        for j, x in enumerate(ds, start=1):
            m = owner == j
            out[ys[m], xs[m]] = L.idx[x['id']]
            std_of[L.idx[x['id']]] = L.idx[s]
    return out, std_of


def overlay(lang, reg, std_of, L, year):
    """A keyframe for a year before 1765: where the standard's line is shown
    in an old dialect's region while the dialect was spoken, the dialect."""
    if not std_of:
        return lang
    out = lang.copy()
    m = reg >= 0
    if not m.any():
        return out
    d = reg[m].astype(np.int64)
    std = np.array([std_of.get(int(v), -1) for v in range(L.n)], dtype=np.int64)[d]
    cur = lang[m].astype(np.int64)
    # the standard's line: the standard itself or one of its ancestors (a starter shows the stage spoken then)
    in_line = np.zeros(len(cur), dtype=bool)
    ok = cur >= 0
    in_line[ok] = L.anc[std[ok], cur[ok]]
    alive = (L.born[d] <= year) & (year < L.died[d])
    v = cur.copy()
    v[in_line & alive] = d[in_line & alive]
    out[m] = v
    return out
