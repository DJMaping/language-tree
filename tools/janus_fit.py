# Fit a Robinson projection to DJ's domestication map (Janus) from the country outlines, find the numbered hearth dots, name each one's country.
import json, numpy as np
from PIL import Image, ImageDraw

IMG = r'C:\Users\danny\AppData\Local\Temp\claude\C--Users-danny-Documents-miraheze-local\72b62caf-0982-4f62-b5f7-e56950a006a3\images\1.webp'
J = np.asarray(Image.open(IMG).convert('RGB')).astype(int)
H, W = J.shape[:2]
land = (J.sum(2) < 725) & (J.sum(2) > 500)
# leave the text panels out of the fit
mask = np.zeros_like(land); mask[60:780, 470:1770] = True; mask[560:780, 470:800] = False

shapes = json.load(open('data/canon/country-shapes-coarse.json', encoding='utf8'))['shapes']
# Robinson table (lat 0..90 step 5): X length, Y
T = np.array([[1.0000, 0.0000], [0.9986, 0.0620], [0.9954, 0.1240], [0.9900, 0.1860], [0.9822, 0.2480], [0.9730, 0.3100], [0.9600, 0.3720], [0.9427, 0.4340], [0.9216, 0.4958], [0.8962, 0.5571], [0.8679, 0.6176], [0.8350, 0.6769], [0.7986, 0.7346], [0.7597, 0.7903], [0.7186, 0.8435], [0.6732, 0.8936], [0.6213, 0.9394], [0.5722, 0.9761], [0.5322, 1.0000]])
def robin(lon, lat, lon0):
    a = np.abs(lat) / 5.0; i = np.clip(a.astype(int), 0, 17); f = a - i
    X = T[i, 0] + (T[i + 1, 0] - T[i, 0]) * f; Y = T[i, 1] + (T[i + 1, 1] - T[i, 1]) * f
    d = ((lon - lon0 + 180) % 360) - 180
    return 0.8487 * X * np.radians(d), 1.3523 * Y * np.sign(lat)

polys = [np.array(p, float) for v in shapes.values() for p in (v if isinstance(v[0][0], list) else [v])]
def raster(cx, cy, R, lon0, w=W, h=H, scale=1.0):
    im = Image.new('L', (int(w * scale), int(h * scale)), 0); dr = ImageDraw.Draw(im)
    for p in polys:
        x, y = robin(p[:, 0], p[:, 1], lon0)
        X = (cx + R * x) * scale; Y = (cy - R * y) * scale
        if X.max() - X.min() > w * scale * 0.5: continue  # a shape cut by the edge
        dr.polygon(list(zip(X, Y)), fill=255)
    return np.asarray(im) > 0

def score(cx, cy, R, lon0, s=0.25):
    r = raster(cx, cy, R, lon0, scale=s)
    l = land[::4, ::4][: r.shape[0], : r.shape[1]]; m = mask[::4, ::4][: r.shape[0], : r.shape[1]]
    a = r[: l.shape[0], : l.shape[1]] & m; b = l & m
    return (a & b).sum() / max(1, (a | b).sum())

best = (0,)
for lon0 in range(-180, 180, 15):
    for R in (300, 340, 380):
        for cx in range(900, 1300, 50):
            for cy in range(350, 650, 50):
                sc = score(cx, cy, R, lon0)
                if sc > best[0]: best = (sc, cx, cy, R, lon0)
print('coarse', best)
step = [20, 20, 15, 5]
for it in range(5):
    improved = True
    while improved:
        improved = False
        for k in range(4):
            for sgn in (-1, 1):
                p = list(best[1:]); p[k] += sgn * step[k]
                sc = score(*p)
                if sc > best[0]: best = (sc, *p); improved = True
    step = [max(1, s / 2) for s in step]
print('fit', best)
json.dump({'cx': best[1], 'cy': best[2], 'R': best[3], 'lon0': best[4], 'iou': best[0]}, open('data/canon/janus-fit.json', 'w'))
