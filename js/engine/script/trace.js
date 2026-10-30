/**
 * A drawing traced into strokes (docs/writing-systems-plan.md, step 6: "upload
 * your own drawing and have it traced into strokes"). A scan or a photo of a
 * sign drawn on paper, or a Paint.NET file, becomes the strokes every other
 * sign is made of, so it inks in any ductus and evolves down the tree like
 * the engine's own.
 *
 * The road is the one a font tool's centre-line trace takes: the ink thinned
 * to a line one pixel wide (Zhang and Suen 1984), the line followed from end
 * to end and from fork to fork, each run cut to its corners (Douglas and
 * Peucker 1973), and a run that bends smoothly kept as a curve. A blot too
 * small to be a stroke is a dot.
 */

import { fit } from './strokes.js';
import { peucker } from './evolve.js';

/** Thin the ink (1) to a skeleton one pixel wide, in place. */
export function thin(ink, w, h) {
    const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : ink[y * w + x]);
    let changed = true;
    const kill = [];
    while (changed) {
        changed = false;
        for (const pass of [0, 1]) {
            kill.length = 0;
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                if (!ink[y * w + x]) continue;
                // p2..p9 clockwise from north
                const p = [at(x, y - 1), at(x + 1, y - 1), at(x + 1, y), at(x + 1, y + 1), at(x, y + 1), at(x - 1, y + 1), at(x - 1, y), at(x - 1, y - 1)];
                const B = p.reduce((a, b) => a + b, 0);
                if (B < 2 || B > 6) continue;
                let A = 0;
                for (let i = 0; i < 8; i++) if (!p[i] && p[(i + 1) % 8]) A++;
                if (A !== 1) continue;
                if (pass === 0 ? (p[0] * p[2] * p[4] || p[2] * p[4] * p[6]) : (p[0] * p[2] * p[6] || p[0] * p[4] * p[6])) continue;
                kill.push(y * w + x);
            }
            for (const i of kill) ink[i] = 0;
            if (kill.length) changed = true;
        }
    }
    return ink;
}

const N8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

/**
 * The skeleton's runs: from every end and every fork to the next, then the
 * rings that have neither. Pixel coordinates.
 */
export function runs(ink, w, h) {
    const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && ink[y * w + x];
    // m-adjacency: a diagonal neighbour reached through a straight one is not a neighbour of its own, so a staircase is a line, not a row of forks
    const nbrs = (i) => {
        const x = i % w, y = (i / w) | 0; const out = [];
        for (const [dx, dy] of N8) if (on(x + dx, y + dy) && !(dx && dy && (on(x + dx, y) || on(x, y + dy)))) out.push((y + dy) * w + x + dx);
        return out;
    };
    const deg = new Map();
    for (let i = 0; i < ink.length; i++) if (ink[i]) deg.set(i, nbrs(i).length);
    const used = new Set();
    const edge = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);
    const node = (i) => deg.get(i) !== 2;
    const out = [];
    const follow = (start, next) => {
        const path = [start];
        let prev = start, cur = next;
        used.add(edge(prev, cur));
        for (;;) {
            path.push(cur);
            if (node(cur)) break;
            const step = nbrs(cur).find((n) => n !== prev && !used.has(edge(cur, n)));
            if (step == null) break;
            used.add(edge(cur, step));
            prev = cur; cur = step;
            if (cur === start) { path.push(cur); break; }
        }
        return path;
    };
    for (const [i, d] of deg) if (d !== 2) for (const n of nbrs(i)) if (!used.has(edge(i, n))) out.push(follow(i, n));
    for (const [i] of deg) for (const n of nbrs(i)) if (!used.has(edge(i, n))) out.push(follow(i, n));
    // a lone pixel is a dot
    for (const [i, d] of deg) if (d === 0) out.push([i]);
    return out.map((p) => p.map((i) => [i % w, (i / w) | 0]));
}

/**
 * Runs that meet at a fork and go on straight through it are one stroke, as
 * a pen drew them: the two arms of a cross, the stem of a T. Each fork pairs
 * its most nearly opposite runs while they turn by less than about 35
 * degrees.
 */
export function joinThrough(paths, skip = 2) {
    let ps = paths.map((p) => p.slice());
    const k = (q) => `${q[0]},${q[1]}`;
    // the way a run leaves its end, measured past the fork, where the thinning bends every arm toward the others
    const away = (p, atStart) => {
        const n = p.length - 1, i = Math.min(skip, n), j = Math.min(skip + 10, n);
        const a = atStart ? p[i === j ? 0 : i] : p[n - (i === j ? 0 : i)];
        const b = atStart ? p[j] : p[n - j];
        const v = [b[0] - a[0], b[1] - a[1]], m = Math.hypot(...v) || 1;
        return [v[0] / m, v[1] / m];
    };
    for (;;) {
        const at = new Map();
        ps.forEach((p, i) => {
            if (p.length < 2 || k(p[0]) === k(p[p.length - 1])) return;
            for (const s of [true, false]) { const key = k(s ? p[0] : p[p.length - 1]); if (!at.has(key)) at.set(key, []); at.get(key).push({ i, s }); }
        });
        let best = null;
        for (const list of at.values()) {
            if (list.length < 2) continue;
            for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
                if (list[a].i === list[b].i) continue;
                const u = away(ps[list[a].i], list[a].s), v = away(ps[list[b].i], list[b].s);
                const cos = u[0] * v[0] + u[1] * v[1];
                if (cos < -0.82 && (!best || cos < best.cos)) best = { cos, a: list[a], b: list[b] };
            }
        }
        if (!best) return ps;
        // the first run to end at the fork, the second to start there
        const A = best.a.s ? ps[best.a.i].slice().reverse() : ps[best.a.i];
        const B = best.b.s ? ps[best.b.i] : ps[best.b.i].slice().reverse();
        const joined = [...A, ...B.slice(1)];
        ps = ps.filter((_, i) => i !== best.a.i && i !== best.b.i);
        ps.push(joined);
    }
}

const turnAt = (a, b, c) => {
    const u = [b[0] - a[0], b[1] - a[1]], v = [c[0] - b[0], c[1] - b[1]];
    const nu = Math.hypot(...u), nv = Math.hypot(...v);
    return nu && nv ? Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (nu * nv)))) : 0;
};

/**
 * Ink (a 0/1 array, w by h) to a glyph in the unit box. `spur` is the
 * shortest run kept where it hangs off a fork (the thinning leaves whiskers
 * at corners), as a share of the drawing's size.
 */
export function traceInk(ink, w, h, { tolerance = 0.012, spur = 0.05 } = {}) {
    const size = Math.max(w, h);
    const sk = thin(Uint8Array.from(ink), w, h);
    // how thick the pen was: the ink over its centre line
    const inkN = ink.reduce((a, b) => a + b, 0), skN = sk.reduce((a, b) => a + b, 0);
    const pen = skN ? inkN / skN : 1;
    const len = (p) => p.reduce((L, q, i) => (i ? L + Math.hypot(q[0] - p[i - 1][0], q[1] - p[i - 1][1]) : 0), 0);
    const ends = new Map();
    const pix = runs(sk, w, h);
    for (const p of pix) for (const q of [p[0], p[p.length - 1]]) { const k = `${q[0]},${q[1]}`; ends.set(k, (ends.get(k) || 0) + 1); }
    const loose = (q) => ends.get(`${q[0]},${q[1]}`) === 1;
    // whiskers (short, loose at one end only: the thinning leaves them at a pointed corner, about a pen's width long) and the little runs between the pixels of one fork go first
    const kept = pix.filter((p) => {
        if (p.length === 1) return true;
        const L = len(p);
        if (L < Math.max(spur * size, 1.6 * pen) && loose(p[0]) !== loose(p[p.length - 1])) return false;
        return !(L < 0.03 * size && !loose(p[0]) && !loose(p[p.length - 1]));
    });
    const raw = joinThrough(kept, Math.max(2, Math.round(pen))).map((p) => p.map(([x, y]) => [(x + 0.5) / size, (y + 0.5) / size]));
    const strokes = [];
    for (const p of raw) {
        const L = len(p);
        // a blot too small to be a stroke is a dot
        if (p.length === 1 || L < 0.03) { const c = p[(p.length / 2) | 0]; strokes.push({ pts: [[c[0] - 0.01, c[1]], [c[0] + 0.01, c[1]]], curve: false, closed: false, mark: true }); continue; }
        const closed = p.length > 4 && Math.hypot(p[0][0] - p[p.length - 1][0], p[0][1] - p[p.length - 1][1]) < 2.5 / size;
        const line = closed ? p.slice(0, -1) : p;
        // the run's shape at a coarse grain, which a pen's wobble does not reach; and no point within a pen's width of
        // either end, where the thinning hooks a stroke toward the fork or the corner it meets
        const reach = (1.2 * pen) / size;
        const trim = (pts) => (closed ? pts : pts.filter((q, i) => i === 0 || i === pts.length - 1 || (Math.hypot(q[0] - pts[0][0], q[1] - pts[0][1]) > reach && Math.hypot(q[0] - pts[pts.length - 1][0], q[1] - pts[pts.length - 1][1]) > reach)));
        const coarse = trim(peucker(line, tolerance * 2.5));
        if (coarse.length === 2 && !closed) { strokes.push({ pts: coarse, curve: false, closed: false }); continue; }
        // a corner is a sharp turn over a short way (a pen's width or so either side); a curve turns as far, but slowly
        const w = Math.max(2, Math.round(1.5 * pen));
        const sharp = coarse.slice(1, -1).some((q) => { const i = line.indexOf(q); return i > 0 && turnAt(line[Math.max(0, i - w)], q, line[Math.min(line.length - 1, i + w)]) > 1.0; });
        const pts = sharp ? trim(peucker(line, tolerance * 1.5)) : coarse;
        strokes.push({ pts, curve: !sharp && pts.length >= 3, closed: closed && pts.length >= 3 });
    }
    return strokes.length ? fit({ strokes }, 0.12, 0.88) : { strokes: [] };
}

/**
 * The browser side: an image (a loaded <img> or ImageBitmap) to ink. Drawn
 * small, each pixel's darkness weighed against the image's own threshold
 * (Otsu 1979), white-on-black flipped, and cropped to the ink.
 */
export function imageToInk(img, size = 160) {
    const k = size / Math.max(img.width, img.height);
    const w = Math.max(1, Math.round(img.width * k)), h = Math.max(1, Math.round(img.height * k));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h);
    cx.drawImage(img, 0, 0, w, h);
    const { data } = cx.getImageData(0, 0, w, h);
    const grey = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
        const a = data[i * 4 + 3] / 255;
        grey[i] = Math.round((0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) * a + 255 * (1 - a));
    }
    const t = otsu(grey);
    let ink = grey.map((v) => (v < t ? 1 : 0));
    // ink is the lesser part of a drawing: if most of it is "ink", it was light on dark
    if (ink.reduce((a, b) => a + b, 0) > ink.length / 2) ink = ink.map((v) => 1 - v);
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (ink[y * w + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    if (x1 < 0) return { ink: new Uint8Array(0), w: 0, h: 0 };
    const m = 2, cw = x1 - x0 + 1 + 2 * m, ch = y1 - y0 + 1 + 2 * m;
    const out = new Uint8Array(cw * ch);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out[(y - y0 + m) * cw + (x - x0 + m)] = ink[y * w + x];
    return { ink: out, w: cw, h: ch };
}

/** The grey level that best parts ink from paper (Otsu's method). */
export function otsu(grey) {
    const hist = new Array(256).fill(0);
    for (const v of grey) hist[v]++;
    const total = grey.length;
    let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumB = 0, wB = 0, best = 0, t = 128;
    for (let i = 0; i < 256; i++) {
        wB += hist[i]; if (!wB) continue;
        const wF = total - wB; if (!wF) break;
        sumB += i * hist[i];
        const mB = sumB / wB, mF = (sum - sumB) / wF;
        const between = wB * wF * (mB - mF) ** 2;
        if (between > best) { best = between; t = i + 0.5; }
    }
    return t;
}
