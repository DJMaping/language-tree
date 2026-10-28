/**
 * How the shapes of signs change down a script's tree.
 *
 * Earth's letters are worn pictures. The Phoenician ox head turned on its
 * side in Greek and upside down in Latin, and is A; the Egyptian owl lost
 * its feathers in hieratic and its body in demotic; the Chinese sun, a
 * circle with a dot, became a box with a bar once the brush replaced the
 * knife. Each stage of a script is the last stage's shapes under a few
 * changes, dated and named like a language's sound changes:
 *
 *   straighten   a knife or chisel takes the curves out (oracle bone, runes)
 *   simplify     fewer strokes, the small ones first (every cursive hand)
 *   cursivise    strokes join and corners round when a pen writes fast
 *                (hieratic from hieroglyphs, hiragana from Chinese)
 *   rotate       signs turn with the writing (cuneiform turned a quarter
 *                when the tablet did; Mongolian turned the Uyghur letters)
 *   mirror       signs flip when the direction of writing flips (Greek,
 *                reading left to right, mirrored the Phoenician letters)
 *   standardise  a state fixes the forms: even size, even weight, every
 *                sign told apart from every other (the Qin reform of
 *                221 BC, Charlemagne's minuscule)
 *   drift        the small unplanned wandering of every generation of hands
 *
 * Every change takes the family's random stream, so a script is as
 * repeatable as a language.
 */

import { glyph, fit, map, rotate as turn, mirror as flip, symmetric, similarity, strokeLength, dist } from './strokes.js';

/** A little wandering of every point: the hands of one generation. */
export function drift(g, rng, amount = 0.025) {
    return fit({ strokes: g.strokes.map((s) => ({ ...s, pts: s.pts.map(([x, y]) => [x + rng.float(-amount, amount), y + rng.float(-amount, amount)]) })) });
}

/** Fewer points on each stroke (Douglas-Peucker), fewer strokes, the small ones first. */
export function simplify(g, rng, { maxStrokes = 4, tolerance = 0.06, keep = 0.5 } = {}) {
    let strokes = g.strokes.map((s) => ({ ...s, pts: s.closed ? s.pts : peucker(s.pts, tolerance) }));
    // join a stroke to one that starts where it ends
    strokes = joinTouching(strokes, 0.05);
    // drop the shortest strokes beyond the cap, each with a draw, so sister
    // scripts do not all drop the same ones
    while (strokes.filter((s) => !s.headline).length > maxStrokes) {
        const byLen = strokes.map((s, i) => [strokeLength(s) * (s.closed ? 1.5 : 1) + (s.headline ? 9 : 0), i]).sort((a, b) => a[0] - b[0]);
        const victim = rng.bool(keep) ? byLen[0][1] : (byLen[1] || byLen[0])[1];
        strokes = strokes.filter((_, i) => i !== victim);
    }
    return fit({ strokes });
}

/** The curves taken out, directions snapped to the knife's eight (chisel) or straightened only (incised). */
export function straighten(g, rng, { snap = 45 } = {}) {
    const strokes = g.strokes.map((s) => {
        const pts = s.curve ? thin(s.pts, s.closed ? 4 : 3) : s.pts;
        if (!snap) return { ...s, pts, curve: false };
        const out = [pts[0]];
        for (let i = 1; i < pts.length; i++) {
            const [x0, y0] = out[i - 1];
            const dx = pts[i][0] - x0, dy = pts[i][1] - y0;
            const L = Math.hypot(dx, dy);
            const a = Math.round((Math.atan2(dy, dx) * 180) / Math.PI / snap) * snap * (Math.PI / 180);
            out.push([x0 + L * Math.cos(a), y0 + L * Math.sin(a)]);
        }
        return { ...s, pts: out, curve: false };
    });
    return fit({ strokes });
}

/** Strokes join and corners round: the fast hand with a pen. */
export function cursivise(g, rng, { slant = 0.1, join = 0.22 } = {}) {
    let strokes = joinTouching(g.strokes, join);
    strokes = strokes.map((s) => ({ ...s, curve: s.pts.length >= 3 ? true : s.curve, pts: s.pts.map(([x, y]) => [x + slant * (0.5 - y), y]) }));
    // a loop where a stroke doubles back on itself
    strokes = strokes.map((s) => {
        if (s.closed || s.pts.length < 3 || !rng.bool(0.3)) return s;
        const i = rng.int(1, s.pts.length - 2);
        const [x, y] = s.pts[i];
        return { ...s, curve: true, pts: [...s.pts.slice(0, i), [x - 0.05, y - 0.05], [x + 0.05, y - 0.05], ...s.pts.slice(i)] };
    });
    return fit({ strokes });
}

export const rotate = (g, degrees) => turn(g, degrees);
/** Mirrored, unless the shape is the same mirrored (a cross, a circle, a bar). */
export const mirror = (g) => (symmetric(g) ? g : flip(g));

/** Even size, points evenly spaced: the state's standard. */
export function standardise(g) {
    return fit({ strokes: g.strokes.map((s) => ({ ...s, pts: s.pts.filter((p, i, a) => i === 0 || dist(p, a[i - 1]) > 0.03) })) }, 0.12, 0.88);
}

/**
 * Every sign told from every other. Where two have come to look alike, one
 * takes a mark: a dot, a bar, or a second stroke. (The Arabic letters b, t,
 * th, n and y had become one shape by the 7th century; the dots were added
 * to tell them apart. Hebrew's shin and sin are one letter with a dot.)
 */
export function distinguish(signs, rng, threshold = 0.78) {
    const out = signs.map((s) => ({ ...s }));
    const dot = (cx, cy) => ({ pts: [[cx - 0.035, cy], [cx, cy - 0.035], [cx + 0.035, cy], [cx, cy + 0.035]], curve: true, closed: true });
    const marks = [
        (g) => glyph([...g.strokes, dot(0.5, 0.06)]),                                                 // a dot above
        (g) => glyph([...g.strokes, dot(0.5, 0.94)]),                                                 // a dot below
        (g) => glyph([...g.strokes, { pts: [[0.2, 0.95], [0.8, 0.95]] }]),                          // a bar below
        (g) => glyph([...g.strokes, { pts: [[0.8, 0.25], [0.95, 0.45]] }]),                          // a tick
    ];
    // a pair told apart once stays told apart: a sign that carries a mark, or
    // whose twin does, takes no second one at the next stage
    for (let i = 0; i < out.length; i++) {
        if (out[i].marked) continue;
        for (let j = 0; j < i; j++) {
            if (out[j].marked || similarity(out[i].glyph, out[j].glyph) < threshold) continue;
            out[i] = { ...out[i], glyph: rng.pick(marks)(out[i].glyph), marked: (out[i].marked || 0) + 1, markedAt: 'now' };
            break;
        }
    }
    return out;
}

// ---------------------------------------------------------------------------
// The house style of a branch, and print
// ---------------------------------------------------------------------------

/**
 * A branch's own hand, applied to every sign alike: how wide the letters
 * are, how much they lean, whether they are round or angular, whether they
 * hang from a line. These are what tell Devanagari from Bengali, Gujarati
 * and the southern scripts, all children of Brahmi: Devanagari and Bengali
 * hang from a headline, Gujarati dropped it, the southern scripts went
 * round on palm leaves; Textura is narrow and angular where the humanist
 * hand is wide and round. Drawn at each branch from the family's stream,
 * most of it inherited, a little of it new.
 */
export function houseStyle(rng, parent = null, fresh = 0.35) {
    const base = parent || { aspect: 1, slant: 0, round: 0, headline: false, tall: 0 };
    const mix = (a, lo, hi) => Math.max(lo, Math.min(hi, a + rng.float(-fresh, fresh) * (hi - lo)));
    return {
        aspect: mix(base.aspect, 0.8, 1.25),          // narrow to wide
        slant: mix(base.slant, 0, 0.14),              // upright to leaning
        round: mix(base.round, -1, 1),                // angular to round
        headline: rng.bool(fresh * 0.4) ? !base.headline : base.headline,
        tall: mix(base.tall, 0, 0.3),                 // how far ascenders and descenders reach
    };
}

/**
 * A glyph moved from its parent's house style to this stage's: only the
 * difference is applied, since the parent's shapes already wear its style
 * (applying the whole of it again at every stage compounded the width and
 * the lean, and stacked a new headline on the old one each time).
 */
export function applyStyle(g, style, from = null) {
    if (!style) return g;
    const base = from || { aspect: 1, slant: 0, round: 0, headline: false };
    // the headline off first, so the sign itself is what the style works on
    let out = { strokes: g.strokes.filter((s) => !s.headline) };
    if (base.headline && !style.headline) out = fit(out, 0.12, 0.88);
    out = map(out, ([x, y]) => [0.5 + (x - 0.5) * (style.aspect / base.aspect), y]);
    out = map(out, ([x, y]) => [x + (style.slant - base.slant) * (0.5 - y), y]);
    if (style.round > 0.35 && base.round <= 0.35) out = { strokes: out.strokes.map((s) => ({ ...s, curve: s.pts.length >= 3 ? true : s.curve })) };
    if (style.round < -0.35 && base.round >= -0.35) out = { strokes: out.strokes.map((s) => ({ ...s, curve: false, pts: s.curve && s.pts.length > 4 ? s.pts.filter((_, i, a) => i % 2 === 0 || i === a.length - 1) : s.pts })) };
    out = fit(out, 0.12, 0.88);
    if (style.headline) {
        // the sign hangs from a line across its top (Devanagari, Bengali)
        out = { strokes: [...map(out, ([x, y]) => [x, 0.22 + (y - 0.12) * 0.86]).strokes, { pts: [[0.06, 0.12], [0.94, 0.12]], headline: true }] };
    }
    return out;
}

/**
 * Print: the forms set in type. Every stroke to the grid, near-upright
 * strokes made upright and near-level ones level, curves cleaned to a few
 * points, the smallest strokes dropped, the lean taken out, every sign in
 * the same frame. This is what print did to every script it reached: the
 * roman type of the 1470s, the Song typeface for Chinese, the civil script
 * for Russian (1708), the Naskh founts for Arabic; and what the reforms
 * that followed print did again (the simplified Chinese characters of
 * 1956 cut the commonest signs to a few strokes).
 */
export function typeset(g, { grid = 16, maxStrokes = 4, snapDeg = 10, square = false } = {}) {
    let strokes = g.strokes.map((s) => ({ ...s, pts: s.curve ? thin(s.pts, s.closed ? (square ? 5 : 6) : (square ? 4 : 5)) : s.pts }));
    // a square face: the curves broken into corners, as square Kufic and the square Hebrew did
    if (square) strokes = strokes.map((s) => ({ ...s, curve: false }));
    strokes = joinTouching(strokes, 0.06);
    while (strokes.filter((s) => !s.headline).length > maxStrokes) {
        const byLen = strokes.map((s, i) => [strokeLength(s) * (s.closed ? 1.5 : 1) + (s.headline ? 9 : 0), i]).sort((a, b) => a[0] - b[0]);
        strokes = strokes.filter((_, i) => i !== byLen[0][1]);
    }
    strokes = strokes.filter((s) => s.closed || s.headline || strokeLength(s) > 0.05);
    const snap = (v) => Math.round(v * grid) / grid;
    strokes = strokes.map((s) => {
        if (s.curve) return { ...s, pts: s.pts.map(([x, y]) => [snap(x), snap(y)]) };
        const pts = [[snap(s.pts[0][0]), snap(s.pts[0][1])]];
        for (let i = 1; i < s.pts.length; i++) {
            let [x, y] = [snap(s.pts[i][0]), snap(s.pts[i][1])];
            const [x0, y0] = pts[pts.length - 1];
            const a = Math.abs((Math.atan2(y - y0, x - x0) * 180) / Math.PI);
            const long = Math.hypot(x - x0, y - y0) > 0.12;
            if (long && (a < snapDeg || a > 180 - snapDeg)) y = y0;           // level
            else if (long && Math.abs(a - 90) < snapDeg) x = x0;             // upright
            else if (square && Math.hypot(x - x0, y - y0) > 0.08) pts.push([x, y0]);   // a diagonal broken into a corner (square Kufic)
            pts.push([x, y]);
        }
        return { ...s, pts };
    });
    return fit({ strokes }, 0.12, 0.88);
}

function peucker(pts, tol) {
    if (pts.length < 3) return pts;
    let maxD = 0, idx = 0;
    const [a, b] = [pts[0], pts[pts.length - 1]];
    for (let i = 1; i < pts.length - 1; i++) {
        const d = lineDist(pts[i], a, b);
        if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD <= tol) return [a, b];
    return [...peucker(pts.slice(0, idx + 1), tol).slice(0, -1), ...peucker(pts.slice(idx), tol)];
}
function lineDist(p, a, b) {
    const L2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
    if (!L2) return dist(p, a);
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / L2));
    return dist(p, [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
}
/** Keep n evenly chosen points of a curve. */
function thin(pts, n) {
    if (pts.length <= n) return pts;
    return Array.from({ length: n }, (_, i) => pts[Math.round((i * (pts.length - 1)) / (n - 1))]);
}
function joinTouching(strokes, eps) {
    const out = strokes.map((s) => ({ ...s, pts: s.pts.slice() }));
    for (let i = 0; i < out.length; i++) {
        if (out[i].closed) continue;
        for (let j = 0; j < out.length; j++) {
            if (i === j || out[j].closed) continue;
            const end = out[i].pts[out[i].pts.length - 1], start = out[j].pts[0];
            if (dist(end, start) <= eps) {
                out[i] = { ...out[i], pts: [...out[i].pts, ...out[j].pts.slice(1)], curve: out[i].curve || out[j].curve };
                out.splice(j, 1);
                if (j < i) i -= 1;
                j = -1;
            }
        }
    }
    return out;
}

export { map };
