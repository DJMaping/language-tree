/**
 * Whole-script hands: the changes that remake every letter of a script
 * together, so that the set comes out with one look. Each is one of
 * Earth's.
 *
 *   rasmScript   the Arabic road: the letters wear down onto a few shared
 *                skeletons on a baseline (the rasm), and dots above and
 *                below tell apart the letters that now share one (ب ت ث ن
 *                ي are one shape). Nabataean Aramaic became Arabic this way
 *                between the 3rd and the 7th centuries.
 *   archScript   the Caucasian road: one scholar makes a script anew from
 *                a borrowed one, every letter from arches, rings and hooks
 *                on one body height with stems rising or falling, each
 *                letter its own combination (Armenian, made by Mesrop
 *                Mashtots in 405 from Greek; the round Georgian Mkhedruli).
 */

import { similarity } from './strokes.js';

const C = (...pts) => ({ pts, curve: true, closed: false });
const L = (...pts) => ({ pts, curve: false, closed: false });
const ringAt = (cx, cy, r, ry = r) => ({ pts: Array.from({ length: 8 }, (_, i) => [cx + r * Math.cos((Math.PI * i) / 4), cy + ry * Math.sin((Math.PI * i) / 4)]), curve: true, closed: true });

/** The skeletons, on a baseline at 0.68: alif, the bowl of ba, the hook of jim, dal, ra, the teeth of sin, sad, ta, ain, fa, lam, mim, nun, waw, ya. */
const RASM = {
    alif: [L([0.5, 0.14], [0.5, 0.68])],
    ba: [C([0.14, 0.52], [0.2, 0.68], [0.8, 0.68], [0.86, 0.52])],
    jim: [C([0.24, 0.42], [0.72, 0.42], [0.3, 0.6], [0.34, 0.86], [0.78, 0.9])],
    dal: [C([0.36, 0.38], [0.62, 0.56], [0.58, 0.68], [0.28, 0.68])],
    ra: [C([0.62, 0.5], [0.56, 0.72], [0.28, 0.9])],
    sin: [L([0.12, 0.56], [0.16, 0.68], [0.34, 0.68], [0.38, 0.56], [0.42, 0.68], [0.6, 0.68], [0.64, 0.56], [0.68, 0.68], [0.88, 0.68])],
    sad: [ringAt(0.58, 0.6, 0.18, 0.09), C([0.4, 0.62], [0.24, 0.84], [0.12, 0.66])],
    ta: [ringAt(0.55, 0.6, 0.2, 0.09), L([0.36, 0.14], [0.36, 0.64])],
    ain: [C([0.66, 0.4], [0.4, 0.38], [0.42, 0.56], [0.66, 0.6], [0.36, 0.76], [0.42, 0.94])],
    fa: [ringAt(0.68, 0.52, 0.09), C([0.66, 0.62], [0.6, 0.68], [0.14, 0.68], [0.12, 0.56])],
    lam: [C([0.62, 0.14], [0.62, 0.7], [0.42, 0.86], [0.2, 0.7])],
    mim: [ringAt(0.52, 0.6, 0.1), L([0.42, 0.66], [0.42, 0.94])],
    nun: [C([0.16, 0.5], [0.2, 0.84], [0.8, 0.84], [0.84, 0.5])],
    waw: [ringAt(0.6, 0.54, 0.1), C([0.68, 0.6], [0.58, 0.8], [0.3, 0.92])],
    ya: [C([0.78, 0.44], [0.5, 0.56], [0.72, 0.74], [0.32, 0.86], [0.14, 0.7])],
};
const DOTS = [[], ['above', 1], ['below', 1], ['above', 2], ['above', 3], ['below', 2], ['below', 3]];
const dot = (x, y) => ({ ...ringAt(x, y, 0.032), mark: true });
function dotted(strokes, [where, n]) {
    if (!where) return strokes;
    const y = where === 'above' ? 0.3 : 0.97, out = [...strokes];
    if (n === 3) { out.push(dot(0.42, y + (where === 'above' ? 0.04 : -0.02)), dot(0.58, y + (where === 'above' ? 0.04 : -0.02)), dot(0.5, y - 0.07)); }
    else for (let i = 0; i < n; i++) out.push(dot(0.5 + (i - (n - 1) / 2) * 0.12, y));
    return out;
}

/**
 * Every sign worn onto the skeleton it is most like, three at most to a
 * skeleton; the letters sharing one take dots, the first none.
 * `shape` adjusts the skeletons to a sister hand (`squat`: Syriac's lower,
 * wider forms).
 */
export function rasmScript(signs, { shape = null } = {}) {
    const names = Object.keys(RASM);
    const tpl = Object.fromEntries(names.map((k) => [k, { strokes: RASM[k] }]));
    const load = new Map(names.map((k) => [k, 0]));
    // the signs most like one skeleton take it first
    const pairs = [];
    for (const [i, s] of signs.entries()) for (const k of names) pairs.push([similarity(s.glyph, tpl[k]), i, k]);
    pairs.sort((a, b) => b[0] - a[0]);
    const chosen = new Map();
    for (const [, i, k] of pairs) {
        if (chosen.has(i) || load.get(k) >= 3) continue;
        chosen.set(i, k); load.set(k, load.get(k) + 1);
    }
    const seen = new Map();
    return signs.map((s, i) => {
        const k = chosen.get(i) || 'ba';
        const n = seen.get(k) || 0; seen.set(k, n + 1);
        let strokes = RASM[k].map((t) => ({ ...t, pts: t.pts.map((q) => q.slice()) }));
        if (shape === 'squat') strokes = strokes.map((t) => ({ ...t, pts: t.pts.map(([x, y]) => [0.5 + (x - 0.5) * 1.1, 0.68 + (y - 0.68) * 0.75]) }));
        return { ...s, glyph: { strokes: dotted(strokes, DOTS[n % DOTS.length]) }, rasm: k, marked: n ? 1 : undefined };
    });
}

/** The arch letters' parts, on a body from 0.42 to 0.78. */
const BODY = {
    arch: [C([0.25, 0.78], [0.25, 0.52], [0.5, 0.4], [0.75, 0.52], [0.75, 0.78])],
    cup: [C([0.25, 0.42], [0.25, 0.68], [0.5, 0.8], [0.75, 0.68], [0.75, 0.42])],
    ring: [ringAt(0.5, 0.6, 0.2, 0.18)],
    arches: [C([0.14, 0.78], [0.14, 0.52], [0.32, 0.42], [0.5, 0.52], [0.5, 0.78]), C([0.5, 0.52], [0.68, 0.42], [0.86, 0.52], [0.86, 0.78])],
    cups: [C([0.14, 0.42], [0.14, 0.68], [0.32, 0.8], [0.5, 0.68], [0.5, 0.42]), C([0.5, 0.68], [0.68, 0.8], [0.86, 0.68], [0.86, 0.42])],
    open: [C([0.74, 0.46], [0.42, 0.4], [0.26, 0.6], [0.42, 0.79], [0.74, 0.76])],
    hook: [C([0.26, 0.46], [0.58, 0.4], [0.74, 0.6], [0.58, 0.79], [0.26, 0.76])],
};
const STEM = {
    none: [], upL: [L([0.25, 0.62], [0.25, 0.1])], upR: [L([0.75, 0.62], [0.75, 0.1])],
    downL: [L([0.25, 0.6], [0.25, 0.96])], downR: [L([0.75, 0.6], [0.75, 0.96])],
};
const CURL = { none: [], top: [C([0.75, 0.1], [0.86, 0.06], [0.92, 0.14])], foot: [C([0.25, 0.96], [0.14, 0.98], [0.08, 0.9])] };

/**
 * Every sign made anew from a body, a stem and a curl, each letter its own
 * combination; the old letter's shape picks the nearest combination still
 * free (a tall letter takes a rising stem, a round one the ring).
 */
export function archScript(signs) {
    const combos = [];
    for (const b of Object.keys(BODY)) for (const st of Object.keys(STEM)) for (const c of Object.keys(CURL)) {
        if (c === 'top' && !st.startsWith('up')) continue;
        if (c === 'foot' && !st.startsWith('down')) continue;
        combos.push([b, st, c]);
    }
    const glyphOf = ([b, st, c]) => ({ strokes: [...BODY[b], ...STEM[st], ...(c === 'top' ? CURL.top.map((t) => (st === 'upL' ? { ...t, pts: t.pts.map(([x, y]) => [x - 0.5, y]) } : t)) : c === 'foot' ? CURL.foot.map((t) => (st === 'downR' ? { ...t, pts: t.pts.map(([x, y]) => [x + 0.5, y]) } : t)) : [])].map((t) => ({ ...t, pts: t.pts.map((q) => q.slice()) })) });
    const tpls = combos.map((c) => ({ c, g: glyphOf(c) }));
    const pairs = [];
    for (const [i, s] of signs.entries()) for (const [j, t] of tpls.entries()) pairs.push([similarity(s.glyph, t.g), i, j]);
    pairs.sort((a, b) => b[0] - a[0]);
    const taken = new Set(), chosen = new Map();
    for (const [, i, j] of pairs) {
        if (chosen.has(i) || taken.has(j)) continue;
        chosen.set(i, j); taken.add(j);
    }
    return signs.map((s, i) => ({ ...s, glyph: tpls[chosen.get(i)].g, arch: tpls[chosen.get(i)].c.join('-') }));
}
