"""
render-years.py - the yearly language map as pictures: one year as a PNG, or
a run of years as an animated GIF, for looking at away from the app.

    python scripts/render-years.py 1765                     exports/languages-1765.png
    python scripts/render-years.py -3000 1765 --frames 120  exports/languages--3000-1765.gif
    options: --colour language|family  --width 1200  --no-names

Reads what scripts/build-years.py wrote to data/cache/years/.
"""

import colorsys
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'data', 'cache', 'years')
SPECIAL = {0: (168, 190, 214), 1: (246, 243, 236), 2: (222, 222, 222), 3: (200, 200, 200), 4: (176, 177, 184)}
FONTS = ['C:/Windows/Fonts/georgia.ttf', 'C:/Windows/Fonts/times.ttf', '/System/Library/Fonts/Supplemental/Georgia.ttf']


def label(y):
    return f'{y} AFA' if y >= 0 else f'{-y:,} BFA'


def font(size):
    for f in FONTS:
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def frame_image(F, year, colour='language', width=1200, names=True):
    W, H = F['meta']['size']
    a = np.asarray(Image.open(os.path.join(CACHE, 'lang', f'{year}.png')).convert('RGB')).astype(np.int64)
    codes = (a[..., 0] << 16) | (a[..., 1] << 8) | a[..., 2]
    u, inv = np.unique(codes, return_inverse=True)
    pal = []
    for c in u:
        c = int(c)
        L = F['langs'].get(str(c))
        if L:
            if colour == 'family':
                h = F['meta']['familyHue'].get(L['family'], 0)
                r, g, b = colorsys.hls_to_rgb(h / 360, 0.55, 0.5)
                pal.append((round(r * 255), round(g * 255), round(b * 255)))
            else:
                pal.append(tuple(int(L['color'][i:i + 2], 16) for i in (1, 3, 5)))
        elif str(c) in F['civs']:
            rgb = F['civs'][str(c)]['rgb']
            pal.append(tuple(round(int(rgb[i:i + 2], 16) * 0.6 + 102) for i in (1, 3, 5)))
        else:
            pal.append(SPECIAL.get(c, (255, 0, 255)))
    rgb = np.array(pal, dtype=np.float64)[inv.reshape(codes.shape)]
    lang = codes >= F['meta']['lang0']
    edge = np.zeros(codes.shape, dtype=bool)
    edge[:, 1:] |= (codes[:, 1:] != codes[:, :-1]) & lang[:, 1:] & lang[:, :-1]
    edge[1:, :] |= (codes[1:, :] != codes[:-1, :]) & lang[1:, :] & lang[:-1, :]
    rgb[edge] *= 0.55
    im = Image.fromarray(rgb.astype(np.uint8)).resize((width, width * H // W), Image.LANCZOS)
    k = width / W
    d = ImageDraw.Draw(im)
    if names:
        for c, (px, x, y, room, _km2) in (F['frames'][str(year)]['areas']).items():
            L = F['langs'].get(c)
            if not L or px < 120:
                continue
            size = min(30, room * 0.9, 2.2 * room / (0.55 * len(L['name']))) * k * 1.0
            if size < 7:
                continue
            f = font(max(7, int(size)))
            d.text((x * k, y * k), L['name'], font=f, fill=(25, 25, 25), anchor='mm', stroke_width=max(1, int(size / 7)), stroke_fill=(255, 255, 255))
    f = font(max(14, width // 40))
    d.text((width - 12, 10), label(year), font=f, fill=(25, 25, 25), anchor='ra', stroke_width=2, stroke_fill=(255, 255, 255))
    return im


def main():
    args = sys.argv[1:]
    opt = lambda n, d=None: args[args.index(n) + 1] if n in args else d
    nums = [int(a) for a in args if a.lstrip('-').isdigit() and (args.index(a) == 0 or args[args.index(a) - 1] not in ('--frames', '--width'))]
    colour = opt('--colour', 'language')
    width = int(opt('--width', 1200))
    names = '--no-names' not in args
    with open(os.path.join(CACHE, 'frames.json'), encoding='utf-8') as fh:
        F = json.load(fh)
    years = F['meta']['years']
    os.makedirs(os.path.join(ROOT, 'exports'), exist_ok=True)
    if len(nums) == 1:
        y = min(years, key=lambda z: abs(z - nums[0]))
        out = os.path.join(ROOT, 'exports', f'languages-{y}.png')
        frame_image(F, y, colour, width, names).save(out)
    else:
        lo, hi = nums[0], nums[1]
        span = [y for y in years if lo <= y <= hi]
        n = int(opt('--frames', 120))
        step = max(1, len(span) // n)
        pick = span[::step]
        if pick[-1] != span[-1]:
            pick.append(span[-1])
        ims = [frame_image(F, y, colour, width, names).convert('P', palette=Image.ADAPTIVE, colors=255) for y in pick]
        out = os.path.join(ROOT, 'exports', f'languages-{lo}-{hi}.gif')
        durations = [180] * (len(ims) - 1) + [2500]
        ims[0].save(out, save_all=True, append_images=ims[1:], duration=durations, loop=0, optimize=True)
    print(f'Wrote {os.path.relpath(out, ROOT)} ({os.path.getsize(out) // 1024} KB)')


if __name__ == '__main__':
    main()
