import json, numpy as np
from PIL import Image
from scipy import ndimage
exec(open('tools/janus_fit.py').read().split('best = (0,)')[0])
f = json.load(open('data/canon/janus-fit.json'))
r, g, b = J[..., 0], J[..., 1], J[..., 2]
blue = (b > 170) & (b - r > 50) & (g > 120) & (g < b)
lab, n = ndimage.label(blue)
dots = []
for i, sl in enumerate(ndimage.find_objects(lab), 1):
    h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
    if not (9 <= h <= 22 and 9 <= w <= 22): continue
    cy, cx = (sl[0].start + sl[0].stop) / 2, (sl[1].start + sl[1].stop) / 2
    if cy > 780 or cx > 1770 or cx < 380: continue
    fill = (lab[sl] == i).mean()
    if fill < 0.4: continue
    dots.append((cx, cy))
# my reading of where each number sits (full-frame pixels)
EST = {1: (895, 290), 2: (912, 342), 3: (1003, 287), 4: (925, 322), 5: (864, 612), 6: (849, 577), 7: (887, 404), 8: (1547, 532), 9: (1488, 560), 10: (1037, 589), 11: (1121, 642), 12: (816, 275), 13: (998, 444), 14: (902, 187), 15: (1118, 548), 16: (479, 355), 17: (886, 442), 18: (1281, 537), 19: (935, 435), 20: (1000, 352), 21: (772, 573), 22: (428, 484), 23: (1696, 630), 24: (1592, 528), 25: (1470, 645), 26: (979, 687), 27: (1066, 424)}
# inverse Robinson: y -> lat by the table, then lon
def inv(px, py):
    x = (px - f['cx']) / f['R']; y = (f['cy'] - py) / f['R']
    Yt = 1.3523 * T[:, 1]; a = np.abs(y)
    k = np.clip(np.searchsorted(Yt, a) - 1, 0, 17); fr = (a - Yt[k]) / (Yt[k + 1] - Yt[k])
    lat = np.sign(y) * 5 * (k + fr); X = T[k, 0] + (T[k + 1, 0] - T[k, 0]) * fr
    lon = ((np.degrees(x / (0.8487 * X)) + f['lon0'] + 180) % 360) - 180
    return float(lon), float(lat)
def inside(pt, poly):
    x, y = pt; c = False; n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]; x2, y2 = poly[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1: c = not c
    return c
def country(lon, lat):
    for name, v in shapes.items():
        for p in (v if isinstance(v[0][0], list) else [v]):
            if inside((lon, lat), p): return name, 0
    best = None
    for name, v in shapes.items():
        for p in (v if isinstance(v[0][0], list) else [v]):
            d = min((q[0] - lon) ** 2 + (q[1] - lat) ** 2 for q in p)
            if best is None or d < best[1]: best = (name, d)
    return best[0], round(best[1] ** 0.5, 1)
out = {}
used = set()
for num, (ex, ey) in EST.items():
    cand = sorted(dots, key=lambda d: (d[0] - ex) ** 2 + (d[1] - ey) ** 2)
    d = cand[0] if cand and ((cand[0][0] - ex) ** 2 + (cand[0][1] - ey) ** 2) ** 0.5 < 25 else (ex, ey)
    lon, lat = inv(*d)
    c, dist = country(lon, lat)
    out[num] = {'px': [round(d[0]), round(d[1])], 'snapped': d != (ex, ey), 'lon': round(lon, 1), 'lat': round(lat, 1), 'country': c, 'off_deg': dist}
    print(num, out[num])
json.dump(out, open('data/canon/janus-hearths.json', 'w'), indent=1)
print(len(dots), 'dots found')
