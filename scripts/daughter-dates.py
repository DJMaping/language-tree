"""
daughter-dates.py - a proto's daughters born where Earth's would have split: about
SPLIT_YEARS after the proto's people reached the daughter's land (DJ, 21 Oct 2026:
"Earlier daughter dates", "About 600 years", "Only unsourced, earlier only"). On
Earth a proto's daughters drift apart some 400-800 years after its speakers spread
out (Slavic about 400, Germanic about 700, Latin into Romance about 800); the tree's
unsourced daughters were mostly born at a flat 800 AFA, so their protos stayed one
language over millions of km2 for thousands of years on Through time.

Only a daughter whose date has no source and is given as circa (or one this
script set) moves, only ever earlier, never before its parent has stood
MIN_PARENT years, and never after its own children. A stage (Old to Middle) is a
change in time, not a split, and keeps its date.

    python scripts/daughter-dates.py          show the moves
    python scripts/daughter-dates.py apply    write them to data/languages.json
    then python scripts/build-years.py languages

Reads the last build's schedule (data/cache/years/kf/schedule).
"""

import hashlib
import json
import os
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'scripts'))
import build_years_commoners as bc  # noqa: E402

SPLIT_YEARS = 600      # after the proto's people reached the land (DJ's pick of Earth's middle)
SPLIT_SPREAD = 0.15    # varied by this share either way per daughter (some split sooner, some later)
MIN_PARENT = 200       # a parent stands at least this long before a daughter splits off
MARK = 'split: '       # the dateSource this script writes, so a rerun may move its own dates again
H, W = bc.H, bc.W


def unsourced(l):
    """No source, and given as circa (an exact year without a source may still be history's)."""
    src = l.get('dateSource') or ''
    return src.startswith(MARK) or (not l.get('dateBasis') and not src and bool(l.get('bornCirca')))


def main():
    from build_years_languages import Tree
    apply = 'apply' in sys.argv
    p = os.path.join(ROOT, 'data', 'languages.json')
    raw = open(p, encoding='utf-8', newline='').read()
    doc = json.loads(raw)
    by_id = {l['id']: l for l in doc['languages']}
    ids = [l['id'] for l in doc['languages']]
    L = bc.Lines(Tree(doc), ids, {i: '#808080' for i in ids})
    s = bc.Schedule(os.path.join(ROOT, 'data', 'cache', 'years', 'kf', 'schedule')).load()
    built = s.meta.get('ids')
    if not built:
        raise SystemExit('The schedule has no language order: run scripts/build-years.py languages first.')
    now = np.array([L.idx.get(i, -1) for i in built] + [-1], dtype=np.int32)
    T = np.asarray(s.T0)[::2, ::2].ravel()
    T = np.where(T >= 0, now[np.where(T >= 0, T, len(built))], -1)
    Nat = np.asarray(s.Nat).ravel()
    came = np.where(Nat, np.asarray(s.Arr).ravel(), np.asarray(s.S).ravel()).astype(np.float64)
    came[(came <= -bc.NEVER) | (came >= bc.NEVER)] = np.nan
    ok = T >= 0
    kids = {}
    for l in doc['languages']:
        if l.get('parentId'):
            kids.setdefault(l['parentId'], []).append(l)
    moves = []
    TIME = ('old-', 'middle-', 'ancient-', 'classical-', 'early-', 'late-', 'upper-', 'low-', 'archaic-', 'modern-', 'new-')

    def reached(par, land):
        """When the parent's people had each place of the land: the family's coming, but not before
        the parent itself was spoken (a branch born later took its land from its forebear there)."""
        a = came[land]
        a = np.maximum(a[np.isfinite(a)], par['born'])
        return a

    breakup = {}
    # parents before children, so a daughter's new date can bound its own daughters'
    for i in ids:
        l = by_id[i]
        par = by_id.get(l.get('parentId'))
        if (par is None or l.get('lost') or par.get('lost') or l.get('relation') == 'stage' or l.get('born') is None
                or par.get('born') is None or not unsourced(l)):
            continue
        # Old Agai to Agai is a change in time, not a split, whatever the tree calls it; and Mihkose
        # Sursian, named for Sursian, comes after it
        if any(par['id'] == t + i or i == t + par['id'] for t in TIME) or \
                any(i.endswith('-' + o) and o != par['id'] for o in by_id):
            continue
        k = L.idx[i]
        arr = reached(par, ok & L.anc[np.maximum(T, 0), k])
        if len(arr) < 20:
            continue
        # no daughter splits off before the parent has spread over half its land (the homeland's own
        # branch becomes distinct as the others drift away, not at the proto's birth)
        if par['id'] not in breakup:
            pa = reached(par, ok & L.anc[np.maximum(T, 0), L.idx[par['id']]])
            breakup[par['id']] = float(np.median(pa)) if len(pa) else par['born']
        u = int(hashlib.sha1(i.encode()).hexdigest()[:8], 16) / 0xffffffff * 2 - 1
        new = max(float(np.median(arr)), breakup[par['id']]) + SPLIT_YEARS * (1 + SPLIT_SPREAD * u)
        new = max(new, par['born'] + MIN_PARENT)
        later = [c['born'] for c in kids.get(i, []) if c.get('born') is not None]
        if later:
            new = min(new, min(later) - 50)
        new = int(round(new / 5.0) * 5)
        if new >= l['born'] or new <= par['born']:
            continue
        moves.append((i, l['born'], new, par['id'], int(np.median(arr)), len(arr)))
        if apply:
            l['born'] = new
            l['bornCirca'] = True
            l['dateBasis'] = 'estimate'
            l['dateSource'] = (f"{MARK}{par.get('name', par['id'])}'s people reached its land about "
                               f"{int(np.median(arr))}; daughters split some {SPLIT_YEARS} years after (DJ, 21 Oct 2026)")
    for i, a, b, par, arr, n in sorted(moves, key=lambda m: m[3]):
        print(f'  {i:26s} {a:>6} -> {b:>6}   (from {par}, reached ~{arr}, {n} cells)')
    print(f'{len(moves)} daughters {"moved" if apply else "to move"} earlier.')
    if apply:
        open(p, 'w', encoding='utf-8', newline='').write(json.dumps(doc, indent=2, ensure_ascii=False) + '\n')


if __name__ == '__main__':
    main()
