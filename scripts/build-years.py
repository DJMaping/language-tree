"""
build-years.py - DJ's yearly civilisation maps, as frames the app can play.

    python scripts/build-years.py frames [--src DIR] [--jobs N] [--force]
    python scripts/build-years.py languages
    python scripts/build-years.py starter YEAR
    python scripts/build-years.py all

The source is DJ's folder of yearly maps (Documents/Andah Hisotry/Every Year,
subfolders AFA and BFA: 657 maps, 10000 x 4999, every 5 or 10 years). Each map
shows the civilisations of its year in colour, with a legend naming them, and
four kinds of land without a civilisation:

    white            no people
    light grey  214  Homo sapiens
    grey        173  Advanced Culture
    slate  113,114,121  Embryonic Civilisation

DJ (15 Oct 2026): the greys are "just where humans are; maybe there are
languages but they've been lost". They are not language areas.

STAGE 1, frames (slow, cached; data/cache/years/, not in git):
    col/<year>.png    the map at 2000 x 1000, borders and text removed: each
                      pixel is its area's own colour
    orig/<year>.jpg   the map itself, small, for "your map underneath"
    legend.json       per year, every legend swatch's colour and name (read
                      with Windows' built-in OCR, scripts/ocr.ps1)
  and data/history/civs.json (in git): every civilisation (a colour under one
  legend name) with its years and the language DJ gives it.

STAGE 2, languages (fast, rerun after any change to civs.json, a keyframe or
the chart): which language every pixel speaks in every frame.
    lang/<year>.png   language index per pixel (R*65536 + G*256 + B)
    frames.json       per frame: each language's area, centre and box
    langs.json        index -> language id, name, display colour
    contacts.json     languages that border, or face each other across water,
                      with the years: the suggestions DJ approves
    clashes.json      where the map and the tree disagree on dates

Keyframes (data/language-maps/, in git): DJ's own language maps, painted in
Paint.NET over a starter this script writes (`starter YEAR`), one colour per
language (data/language-maps/key.json). Between keyframes the languages
FOLLOW THEIR CIVILISATIONS: where a pixel's civilisation is the one it had in
the keyframe, it keeps the keyframe's language; elsewhere a civilisation
speaks what it mostly spoke in the keyframe; before any keyframe, what
civs.json says.
"""

import json
import math
import os
import re
import subprocess
import sys
import time
from concurrent.futures import ProcessPoolExecutor

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'data', 'cache', 'years')
HISTORY = os.path.join(ROOT, 'data', 'history')
KEYFRAMES = os.path.join(ROOT, 'data', 'language-maps')
DEFAULT_SRC = os.path.join(os.path.expanduser('~'), 'Documents', 'Andah Hisotry', 'Every Year')

W, H = 2000, 1000          # the working grid: language shift, areas, borders, names
STEP = 5                   # one working pixel is 5 x 5 map pixels
IW, IH = 4000, 2000        # the pictures (col/, lang/, common/): twice as sharp, for zooming
SRC_W, SRC_H = 10000, 4999

SEA = (110, 147, 191)
EMPTY = (255, 255, 255)
SAPIENS = (214, 214, 214)
ADVANCED = (173, 173, 173)
EMBRYONIC = (113, 114, 121)
UI = (127, 127, 127)
BLACK = (0, 0, 0)
NOT_CIVS = {SEA, EMPTY, SAPIENS, ADVANCED, EMBRYONIC, UI, BLACK}
CLASS_NAMES = {SEA: 'sea', EMPTY: 'no people', SAPIENS: 'Homo sapiens', ADVANCED: 'Advanced Culture', EMBRYONIC: 'Embryonic Civilisation'}

# The panels drawn over the ocean: the legend, the key to the greys, the
# population and events box.
PANELS = [(0, 0, 1500, 2490), (1490, 0, 2245, 720), (2560, 4195, 6760, SRC_H)]
# Legend columns: where the swatches sit and where their names are written.
LEGEND_TOP, LEGEND_BOTTOM = 262, 2475
SWATCH_X = [66, 610, 1086]
TEXT_X = [(115, 530), (660, 1010), (1135, 1480)]


def save_indexed(codes, path):
    """A raster of packed values (colours, or language codes written as
    R*65536 + G*256 + B) as a palette PNG: exact, and about a third the size
    of RGB. More than 256 values falls back to RGB. Small values (language
    codes) are indexed by counting, in one pass; colours by sorting."""
    flat = codes.ravel()
    top = int(flat.max()) if flat.size else 0
    if top < (1 << 21):
        present = np.nonzero(np.bincount(flat, minlength=top + 1))[0]
        lut = np.zeros(top + 1, dtype=np.int32)
        lut[present] = np.arange(len(present))
        u, inv = present, lut[flat]
    else:
        u, inv = np.unique(flat, return_inverse=True)
    if len(u) <= 256:
        img = Image.fromarray(inv.reshape(codes.shape).astype(np.uint8), 'P')
        pal = []
        for v in u.tolist():
            pal += [(v >> 16) & 255, (v >> 8) & 255, v & 255]
        img.putpalette(pal)
    else:
        c = codes.astype(np.int64)
        img = Image.fromarray(np.stack([(c >> 16) & 255, (c >> 8) & 255, c & 255], axis=-1).astype(np.uint8))
    img.save(path, optimize=False, compress_level=6)


def read_packed(path):
    """A PNG written by save_indexed (or plain RGB) back as packed ints: a
    palette PNG through its palette, without expanding to RGB first."""
    img = Image.open(path)
    if img.mode == 'P':
        pal = np.array(img.getpalette()[:768], dtype=np.int64).reshape(-1, 3)
        lut = (pal[:, 0] << 16) | (pal[:, 1] << 8) | pal[:, 2]
        return lut[np.asarray(img)]
    return pack(np.asarray(img.convert('RGB'))).astype(np.int64)


def hexof(rgb):
    return '#%02x%02x%02x' % tuple(int(c) for c in rgb)


def pack(a):
    """RGB uint8 array (..., 3) -> one int per pixel."""
    a = a.astype(np.uint32)
    return (a[..., 0] << 16) | (a[..., 1] << 8) | a[..., 2]


def unpack(v):
    return ((v >> 16) & 255, (v >> 8) & 255, v & 255)


def year_of(name):
    m = re.match(r'^([\d,]+)\s*(AFA|BFA)', name)
    if not m:
        return None
    v = int(m.group(1).replace(',', ''))
    return v if m.group(2) == 'AFA' else -v


def label(year):
    return f'{year} AFA' if year >= 0 else f'{-year} BFA'


def sources(src):
    out = {}
    for sub in ('BFA', 'AFA'):
        d = os.path.join(src, sub)
        for f in os.listdir(d):
            y = year_of(f)
            if f.lower().endswith('.png') and y is not None:
                out[y] = os.path.join(d, f)
    return dict(sorted(out.items()))


def read_json(path, fallback):
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return fallback


def write_json(path, obj, indent=None):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(obj, f, ensure_ascii=False, indent=indent, separators=(',', ': ') if indent else (',', ':'))
        f.write('\n')
    os.replace(tmp, path)


# --- stage 1: frames ----------------------------------------------------------

def one_frame(args):
    """Decode one map: the cleaned frame, the thumbnail, the legend swatches and
    the legend's name columns as black-on-white images for OCR."""
    year, path = args
    from scipy import ndimage
    im = Image.open(path)
    if im.size != (SRC_W, SRC_H):
        return {'year': year, 'error': f'size {im.size}'}
    rgb = np.asarray(im.convert('RGB'))

    # Legend swatches: runs of one colour down each column's swatch line.
    swatches = []
    for col, x in enumerate(SWATCH_X):
        line = rgb[LEGEND_TOP:LEGEND_BOTTOM, x]
        y = 0
        while y < len(line):
            c = tuple(int(v) for v in line[y])
            if c in (UI, BLACK):
                y += 1
                continue
            start = y
            while y < len(line) and tuple(int(v) for v in line[y]) == c:
                y += 1
            if y - start >= 40:
                swatches.append({'col': col, 'y': LEGEND_TOP + (start + y) // 2, 'rgb': hexof(c)})
    ocr = []
    os.makedirs(os.path.join(CACHE, 'ocr'), exist_ok=True)
    for col, (x0, x1) in enumerate(TEXT_X):
        mine = [s for s in swatches if s['col'] == col]
        if not mine:
            continue
        # The names start just right of the swatches' black frames, which sit a
        # little differently from map to map: find the frame, start after it,
        # or a capital letter gets clipped ("vian" for "Yvian").
        row = rgb[mine[0]['y'], SWATCH_X[col]:x1]
        k = 0
        while k < len(row) and row[k].sum() != 0:
            k += 1
        while k < len(row) and row[k].sum() == 0:
            k += 1
        x0 = SWATCH_X[col] + k + 3 if k < 120 else x0
        black = rgb[LEGEND_TOP:LEGEND_BOTTOM, x0:x1].sum(axis=2) == 0
        img = np.pad(np.where(black, 0, 255).astype(np.uint8), 40, constant_values=255)
        p = os.path.join(CACHE, 'ocr', f'{year}-{col}.png')
        Image.fromarray(img).save(p)
        ocr.append(p)

    # The frame, at the picture size (IW x IH, a sample every 2.5 map pixels);
    # the panels become sea; borders and text take the nearest area's colour.
    rows = ((np.arange(IH) + 0.5) * SRC_H / IH).astype(int)
    cols = ((np.arange(IW) + 0.5) * SRC_W / IW).astype(int)
    small = rgb[rows][:, cols].copy()
    for x0, y0, x1, y1 in PANELS:
        small[int(y0 * IH / SRC_H):int(np.ceil(y1 * IH / SRC_H)), int(x0 * IW / SRC_W):int(np.ceil(x1 * IW / SRC_W))] = SEA
    p = pack(small)
    ink = (p == 0) | (p == pack(np.array(UI, dtype=np.uint8)))
    if ink.any():
        _, (iy, ix) = ndimage.distance_transform_edt(ink, return_indices=True)
        small = small[iy, ix]
    os.makedirs(os.path.join(CACHE, 'col'), exist_ok=True)
    save_indexed(pack(small).astype(np.int64), os.path.join(CACHE, 'col', f'{year}.png'))

    thumb = Image.fromarray(rgb).reduce(6)
    os.makedirs(os.path.join(CACHE, 'orig'), exist_ok=True)
    thumb.save(os.path.join(CACHE, 'orig', f'{year}.jpg'), quality=82)

    v, n = np.unique(pack(small), return_counts=True)
    colours = {hexof(unpack(int(a))): int(b) for a, b in zip(v, n)}
    return {'year': year, 'swatches': swatches, 'ocr': ocr, 'colours': colours, 'mtime': os.path.getmtime(path)}


def run_ocr(paths):
    """Windows OCR on many images in one PowerShell run."""
    if not paths:
        return {}
    lst = os.path.join(CACHE, 'ocr', '_list.txt')
    with open(lst, 'w', encoding='utf-8') as f:
        f.write('\n'.join(os.path.normpath(p) for p in paths) + '\n')
    out = subprocess.run(['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
                          os.path.join(ROOT, 'scripts', 'ocr.ps1'), '-List', lst],
                         capture_output=True, text=True, encoding='utf-8')
    res = {}
    for line in out.stdout.splitlines():
        line = line.strip()
        if line.startswith('{'):
            d = json.loads(line)
            res[os.path.normcase(os.path.normpath(d['path']))] = d['words'] or []
    return res


def lines_of(words):
    """OCR words -> [(centre y in map pixels, text)], words on one row joined."""
    rows = []
    for w in sorted(words, key=lambda w: (w['y'], w['x'])):
        cy = w['y'] + w['h'] / 2
        for r in rows:
            if abs(r['cy'] - cy) < 22:
                r['words'].append(w)
                break
        else:
            rows.append({'cy': cy, 'words': [w]})
    out = []
    for r in rows:
        ws = sorted(r['words'], key=lambda w: w['x'])
        text = ''
        for i, w in enumerate(ws):
            # A split word ("Y vian") has almost no gap; a real space is wide.
            gap = w['x'] - (ws[i - 1]['x'] + ws[i - 1]['w']) if i else 0
            text += ('' if i == 0 or gap < 14 else ' ') + w['t']
        out.append((LEGEND_TOP - 40 + r['cy'], text.strip()))
    return out


def stage_frames(src, jobs, force):
    srcs = sources(src)
    index = read_json(os.path.join(CACHE, 'legend.json'), {})
    todo = []
    for y, p in srcs.items():
        have = index.get(str(y))
        if force or not have or have.get('mtime') != os.path.getmtime(p) \
                or not os.path.exists(os.path.join(CACHE, 'col', f'{y}.png')):
            todo.append((y, p))
    print(f'{len(srcs)} maps; {len(todo)} to read.', flush=True)
    t0 = time.time()
    done = 0
    results = {}
    # Each map is 10000 x 4999: a worker holds about 400 MB while reading one,
    # so the pool is kept small, and a map that fails (out of memory) is read
    # again on its own at the end rather than losing the run.
    retry = []
    if todo:
        with ProcessPoolExecutor(max_workers=jobs) as ex:
            futures = {ex.submit(one_frame, t): t for t in todo}
            from concurrent.futures import as_completed
            for fut in as_completed(futures):
                done += 1
                try:
                    r = fut.result()
                    results[r['year']] = r
                except Exception as e:  # noqa: BLE001
                    retry.append(futures[fut])
                    print(f'  {label(futures[fut][0])}: {type(e).__name__}, will retry', flush=True)
                if done % 25 == 0 or done == len(todo):
                    print(f'  {done}/{len(todo)} maps, {time.time() - t0:.0f}s', flush=True)
    for t in retry:
        r = one_frame(t)
        results[r['year']] = r
    # Save what was read before the (slower, fallible) OCR, so a failure there
    # does not mean reading every map again.
    for y, r in results.items():
        if not r.get('error'):
            index[str(y)] = {k: r[k] for k in ('swatches', 'colours', 'mtime', 'ocr')}
    write_json(os.path.join(CACHE, 'legend.json'), index)
    errors = [r for r in results.values() if r.get('error')]
    for r in errors:
        print(f'  {label(r["year"])}: {r["error"]}')

    # OCR only legends whose swatches changed since the year before.
    years = sorted(set(int(k) for k in index) | set(results))
    entry = lambda y: results.get(y) or index.get(str(y))
    need, prev_sig = [], None
    for y in years:
        e = entry(y)
        if not e or e.get('error'):
            continue
        sig = tuple((s['col'], s['y'] // 10, s['rgb']) for s in e['swatches'])
        fresh = y in results
        if sig != prev_sig and (fresh or not all(s.get('name') for s in e['swatches'])):
            need.append(y)
        prev_sig = sig
    paths = [p for y in need for p in (entry(y).get('ocr') or [])]
    print(f'Reading {len(need)} legends with OCR...', flush=True)
    words = run_ocr(paths)
    named_before = None
    prev_sig = None
    for y in years:
        e = entry(y)
        if not e or e.get('error'):
            continue
        sig = tuple((s['col'], s['y'] // 10, s['rgb']) for s in e['swatches'])
        if y in need:
            for s in e['swatches']:
                p = next((q for q in e.get('ocr', []) if q.endswith(f'-{s["col"]}.png')), None)
                rows = lines_of(words.get(os.path.normcase(os.path.normpath(p)), [])) if p else []
                best = min(rows, key=lambda r: abs(r[0] - s['y']), default=None)
                s['name'] = best[1] if best and abs(best[0] - s['y']) < 40 else None
        elif sig == prev_sig and named_before:
            for s, t in zip(e['swatches'], named_before['swatches']):
                s['name'] = t.get('name')
        named_before, prev_sig = e, sig
        index[str(y)] = {k: e[k] for k in ('swatches', 'colours', 'mtime')}
        index[str(y)]['ocr'] = e.get('ocr', [])
    write_json(os.path.join(CACHE, 'legend.json'), index)
    update_civs(index)


def norm(s):
    return re.sub(r'[^a-z]', '', (s or '').lower())


_NAMED = None


def named_colours():
    """Every colour some legend names: always a civilisation, however close to
    the sea it looks (Gaeiya's steel blue is 41 away from the sea's)."""
    global _NAMED
    if _NAMED is None:
        idx = read_json(os.path.join(CACHE, 'legend.json'), {})
        _NAMED = {s['rgb'] for e in idx.values() for s in e.get('swatches', []) if s.get('name')}
    return _NAMED


def special_of(rgb):
    """The class of a colour that is not a civilisation, or None. Besides DJ's
    exact colours, near-sea blues (anti-aliased coast) are sea and near-greys
    are the nearest grey class; never a colour a legend names."""
    c = tuple(int(rgb[i:i + 2], 16) for i in (1, 3, 5)) if isinstance(rgb, str) else tuple(rgb)
    if c in NOT_CIVS:
        return c
    if hexof(c) in named_colours():
        return None
    r, g, b = c
    if sum(abs(x - y) for x, y in zip(c, SEA)) < 30:
        return SEA
    if max(c) < 45:
        return EMPTY
    if abs(r - g) < 9 and abs(g - b) < 12:
        lum = (r + g + b) / 3
        return min((EMPTY, SAPIENS, ADVANCED, EMBRYONIC), key=lambda t: abs(sum(t) / 3 - lum))
    return None


def tidy(name):
    return re.sub(r'^[^A-Za-z]+', '', name or '').strip()


def similar(a, b):
    from difflib import SequenceMatcher
    x, y = norm(a), norm(b)
    if not x or not y:
        return False
    if len(x) >= 3 and len(y) >= 3 and (x in y or y in x):
        return True
    return SequenceMatcher(None, x, y).ratio() >= 0.72


def update_civs(index):
    global _NAMED
    _NAMED = {s['rgb'] for e in index.values() for s in e.get('swatches', []) if s.get('name')}
    """data/history/civs.json: a civilisation is a colour under one legend name.
    Built from the legends; DJ's choices (lang, how, note) are kept on every
    rebuild. OCR misreadings of one name ("vian", "{vian" for "Yvian") are
    folded into the commonest clean reading."""
    path = os.path.join(HISTORY, 'civs.json')
    old = read_json(path, {'civs': {}})
    seen = {}      # rgb -> [(year, name or None)]
    # A colour no legend ever names is a fringe: anti-aliasing where a coast
    # meets the sea or two areas meet, sampled at picture size. It takes the
    # nearest colour of its frame that is a named civilisation or a class
    # (sea, the greys), never a civilisation of its own.
    ever_named = {s['rgb'] for e in index.values() for s in e.get('swatches', []) if tidy(s.get('name'))}
    fringe = {}    # year -> {rgb: target rgb}
    rgb3 = lambda h: np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], dtype=float)
    classes = [hexof(c) for c in (SEA, EMPTY, SAPIENS, ADVANCED, EMBRYONIC)]
    for ys in sorted(index, key=int):
        y = int(ys)
        e = index[ys]
        named = {s['rgb']: tidy(s.get('name')) for s in e['swatches'] if tidy(s.get('name'))}
        targets = [c for c in e['colours'] if c in ever_named] + classes
        for rgb, n in e['colours'].items():
            if special_of(rgb) or n < 2:
                continue
            if rgb not in ever_named:
                fringe.setdefault(ys, {})[rgb] = min(targets, key=lambda t: float(((rgb3(t) - rgb3(rgb)) ** 2).sum()))
                continue
            seen.setdefault(rgb, []).append((y, named.get(rgb)))

    civs, civ_of = {}, {}
    for rgb, obs in seen.items():
        counts = {}
        for _, n in obs:
            if n:
                counts[n] = counts.get(n, 0) + 1
        clusters = []   # [canonical, [variants]]
        for n in sorted(counts, key=lambda v: -counts[v]):
            for cl in clusters:
                if similar(n, cl[0]):
                    cl[1].append(n)
                    break
            else:
                clusters.append([n, [n]])
        for cl in clusters:
            clean = [v for v in cl[1] if re.match(r'^[A-Z][A-Za-z\- ]+$', v)]
            cl[0] = max(clean or cl[1], key=lambda v: counts[v])
        canon = {v: cl[0] for cl in clusters for v in cl[1]}
        # years per civilisation; unnamed years go to the nearest named one
        named_years = {}
        for y, n in obs:
            if n:
                named_years.setdefault(canon[n], []).append(y)
        for y, n in obs:
            if n:
                c = canon[n]
            elif named_years:
                c = min(named_years, key=lambda k: min(abs(y - z) for z in named_years[k]))
            else:
                c = None
            key = f'{rgb}|{c}' if c else f'{rgb}|?'
            civ_of.setdefault(str(y), {})[rgb] = key
            civs.setdefault(key, {'name': c or f'unnamed {rgb}', 'rgb': rgb, 'years': []})['years'].append(y)
    for ys, m in fringe.items():
        for rgb, t in m.items():
            civ_of.setdefault(ys, {})[rgb] = civ_of.get(ys, {}).get(t) or f'special:{t}'

    out = {}
    for k, c in sorted(civs.items(), key=lambda kv: (min(kv[1]['years']), kv[0])):
        prev = old['civs'].get(k, {})
        ys = sorted(c['years'])
        out[k] = {'name': c['name'], 'rgb': c['rgb'], 'from': ys[0], 'to': ys[-1], 'frames': len(ys),
                  'lang': prev.get('lang'), 'how': prev.get('how')}
        if prev.get('note'):
            out[k]['note'] = prev['note']
    write_json(path, {
        '_readme': 'Every civilisation on DJ’s yearly maps (a colour under one legend name), built by scripts/build-years.py from the legends. '
                   'lang = the language it speaks (a language id; the app walks back to the ancestor alive in each year). how = "auto" (matched by name), "dj" (DJ chose), "lost" (no recorded language). '
                   'Rebuilds keep lang, how and note.',
        'civs': out,
    }, indent=1)
    write_json(os.path.join(CACHE, 'civ_of.json'), civ_of)
    unnamed = sum(1 for c in out.values() if c['name'].startswith('unnamed'))
    print(f'{len(out)} civilisations ({unnamed} never named in a legend) -> data/history/civs.json')


# --- main ---------------------------------------------------------------------

def main():
    args = sys.argv[1:]
    cmd = args[0] if args else 'all'
    opt = lambda name, d=None: args[args.index(name) + 1] if name in args else d
    src = opt('--src', DEFAULT_SRC)
    jobs = int(opt('--jobs', min(4, max(1, (os.cpu_count() or 4) - 1))))
    if cmd in ('frames', 'all'):
        stage_frames(src, jobs, '--force' in args)
    if cmd == 'civs':
        update_civs(read_json(os.path.join(CACHE, 'legend.json'), {}))
    if cmd in ('languages', 'all'):
        import build_years_languages as L  # noqa: E402  (stage 2, scripts/build_years_languages.py)
        L.run()
    if cmd == 'starter':
        import build_years_languages as L  # noqa: E402
        L.starter(int(args[1]), src, args[2] if len(args) > 2 and not args[2].startswith('--') else 'commoners')


if __name__ == '__main__':
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    main()
