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
    while (strokes.filter((s) => !s.headline && !s.mark && !s.head).length > maxStrokes) {
        const byLen = strokes.map((s, i) => [strokeLength(s) * (s.closed ? 1.5 : 1) + (s.headline || s.mark || s.head ? 9 : 0), i]).sort((a, b) => a[0] - b[0]);
        const victim = rng.bool(keep) ? byLen[0][1] : (byLen[1] || byLen[0])[1];
        strokes = strokes.filter((_, i) => i !== victim);
    }
    return fit({ strokes });
}

/** The curves taken out, directions snapped to the knife's eight (chisel) or straightened only (incised). */
export function straighten(g, rng, { snap = 45 } = {}) {
    const strokes = g.strokes.map((s) => {
        if (s.mark) return s;
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
export function distinguish(signs, rng, threshold = 0.9) {
    const out = signs.map((s) => ({ ...s }));
    // a mark is tagged, so that print keeps it (typeset): the dots of Arabic and the cedilla outlived every change of face
    const dot = (cx, cy) => ({ pts: [[cx - 0.035, cy], [cx, cy - 0.035], [cx + 0.035, cy], [cx, cy + 0.035]], curve: true, closed: true, mark: true });
    const marks = [
        (g) => glyph([...g.strokes, dot(0.5, 0.06)]),                                                 // a dot above
        (g) => glyph([...g.strokes, dot(0.5, 0.94)]),                                                 // a dot below
        (g) => glyph([...g.strokes, { pts: [[0.2, 0.95], [0.8, 0.95]], mark: true }]),              // a bar below
        (g) => glyph([...g.strokes, { pts: [[0.84, 0.3], [0.94, 0.42]], mark: true }]),             // a tick
    ];
    // a pair told apart once stays told apart: twins of which one carries a
    // mark and the other none, or each a different one, need nothing more;
    // a sign marked against one twin can still need telling from another
    const kindOf = (g) => {
        const m = g.strokes.filter((t) => t.mark);
        return m.length ? m.map((t) => t.pts.map((q) => q.map((v) => Math.round(v * 4)).join(',')).join(';')).join('|') : '';
    };
    for (let i = 0; i < out.length; i++) {
        for (let j = 0; j < i; j++) {
            if (similarity(out[i].glyph, out[j].glyph) < threshold) continue;
            if (kindOf(out[i].glyph) !== kindOf(out[j].glyph)) continue;
            if (out[i].marked >= 2) break;
            const free = marks.filter((m) => kindOf(m({ strokes: [] })) !== kindOf(out[j].glyph));
            out[i] = { ...out[i], glyph: rng.pick(free)(out[i].glyph), marked: (out[i].marked || 0) + 1, markedAt: 'now' };
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
    if (square) strokes = strokes.map((s) => (s.mark ? s : { ...s, curve: false }));
    strokes = joinTouching(strokes, 0.06);
    while (strokes.filter((s) => !s.headline && !s.mark && !s.head).length > maxStrokes) {
        const byLen = strokes.map((s, i) => [strokeLength(s) * (s.closed ? 1.5 : 1) + (s.headline || s.mark || s.head ? 9 : 0), i]).sort((a, b) => a[0] - b[0]);
        strokes = strokes.filter((_, i) => i !== byLen[0][1]);
    }
    strokes = strokes.filter((s) => s.closed || s.headline || s.mark || strokeLength(s) > 0.05);
    const snap = (v) => Math.round(v * grid) / grid;
    strokes = strokes.map((s) => {
        if (s.mark || s.head) return s;   // a dot (or a letter's head loop) snapped to the grid is no dot
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
        if (out[i].closed || out[i].mark) continue;
        for (let j = 0; j < out.length; j++) {
            if (i === j || out[j].closed || out[j].mark) continue;
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

/**
 * The stone-cutters' letters. When a script is cut in stone for a state,
 * every letter is rebuilt on the same few points, top, middle and foot by
 * left, centre and right, from straight bars between them and round bowls
 * where the letter curved: the Greek and Roman monumental capitals (A E H
 * K M N of bars, B D O P R of bowls, every letter one height), the runes,
 * and the square Hebrew of the Second Temple. It is what makes an alphabet
 * look like one set rather than a heap of worn pictures. Specks go; bars
 * that land on the same two points are one bar; a letter keeps at most
 * `maxStrokes` pieces.
 */
export function lattice(g, rng, { maxStrokes = 4, rows = 3 } = {}) {
    const xs = [0.18, 0.5, 0.82];
    const ys = rows === 5 ? [0.12, 0.31, 0.5, 0.69, 0.88] : [0.12, 0.5, 0.88];
    const f = fit({ strokes: g.strokes.filter((t) => !t.mark && !t.headline) }, 0.12, 0.88);
    const near = (v, arr) => arr.reduce((b, a) => (Math.abs(a - v) < Math.abs(b - v) ? a : b), arr[0]);
    const pieces = [];
    const rings = [];
    for (const t of f.strokes) {
        // a ring stays a ring, spread to the points round it (the Greek O and Θ, the Roman O and Q)
        if (t.closed && t.curve) {
            const b = { x0: Math.min(...t.pts.map((q) => q[0])), x1: Math.max(...t.pts.map((q) => q[0])), y0: Math.min(...t.pts.map((q) => q[1])), y1: Math.max(...t.pts.map((q) => q[1])) };
            let x0 = near(b.x0, xs), x1 = near(b.x1, xs), y0 = near(b.y0, ys), y1 = near(b.y1, ys);
            if (x0 === x1) { x0 = Math.max(xs[0], x0 - 0.16); x1 = Math.min(xs[2], x1 + 0.16); }
            if (y0 === y1) { y0 = Math.max(ys[0], y0 - 0.19); y1 = Math.min(ys[ys.length - 1], y1 + 0.19); }
            const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0) / 2, ry = (y1 - y0) / 2;
            rings.push({ pts: Array.from({ length: 8 }, (_, i) => [cx + rx * Math.cos((Math.PI * i) / 4), cy + ry * Math.sin((Math.PI * i) / 4)]), curve: true, closed: true });
            continue;
        }
        const pts = t.closed ? [...t.pts, t.pts[0]] : t.pts;
        const line = t.curve ? peucker(pts, 0.12) : peucker(pts, 0.06);
        for (let i = 1; i < line.length; i++) {
            const a = line[i - 1], b = line[i];
            if (dist(a, b) < 0.1) continue;
            const p = [near(a[0], xs), near(a[1], ys)], q = [near(b[0], xs), near(b[1], ys)];
            if (p[0] === q[0] && p[1] === q[1]) continue;
            // a curve keeps its bowl: the side it bulged to, out from the chord
            let bulge = 0;
            if (t.curve) {
                const mid = pts[Math.floor(pts.length / 2)], dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy);
                const side = ((mid[0] - p[0]) * dy - (mid[1] - p[1]) * dx) / (L || 1);
                bulge = Math.abs(side) > 0.04 ? Math.sign(side) : 0;
            }
            pieces.push({ p, q, bulge, len: dist(p, q) });
        }
    }
    const key = (x) => [x.p.join(','), x.q.join(',')].sort().join('|');
    const seen = new Set();
    let kept = pieces.filter((x) => (seen.has(key(x)) ? false : (seen.add(key(x)), true)));
    while (kept.length + rings.length > maxStrokes && kept.length) kept.splice(kept.indexOf(kept.reduce((a, b) => (b.len < a.len ? b : a))), 1);
    if (!kept.length && !rings.length) return g;
    const strokes = kept.map(({ p, q, bulge }) => {
        if (!bulge) return { pts: [p, q], curve: false, closed: false };
        const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy), k = 0.22 * L;
        const m = [(p[0] + q[0]) / 2 + (dy / L) * k * bulge, (p[1] + q[1]) / 2 - (dx / L) * k * bulge];
        return { pts: [p, m, q], curve: true, closed: false };
    });
    const marks = g.strokes.filter((t) => t.mark || t.headline);
    return { strokes: [...rings, ...strokes, ...marks] };
}

/**
 * Print's tidying: no specks (a stroke too short to be one, unless it is a
 * mark), and an end that stops just short of another stroke drawn on to
 * meet it, as a punch-cutter would.
 */
export function tidy(g) {
    let st = g.strokes.map((t) => ({ ...t, pts: t.pts.map((q) => q.slice()) }));
    st = st.map((t) => {
        if (t.closed || t.pts.length < 3) return t;
        const pts = [t.pts[0]];
        for (let i = 1; i < t.pts.length; i++) {
            const q = t.pts[i];
            if (pts.length >= 2 && dist(q, pts[pts.length - 2]) < 0.04) { pts.pop(); continue; }   // back over the last piece
            pts.push(q);
        }
        return { ...t, pts };
    });
    st = st.filter((t) => t.mark || t.headline || t.closed || strokeLength(t) >= 0.1);
    for (const t of st) {
        if (t.mark || t.closed) continue;
        for (const end of [0, t.pts.length - 1]) {
            let best = null, bd = 0.08;
            for (const u of st) {
                if (u === t || u.mark) continue;
                for (let i = 1; i < u.pts.length; i++) {
                    const a = u.pts[i - 1], b = u.pts[i], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-9;
                    const w = Math.max(0, Math.min(1, ((t.pts[end][0] - a[0]) * dx + (t.pts[end][1] - a[1]) * dy) / L2));
                    const c = [a[0] + w * dx, a[1] + w * dy], d = dist(t.pts[end], c);
                    if (d > 0.012 && d < bd) { bd = d; best = c; }
                }
            }
            if (best) t.pts[end] = best;
        }
    }
    return { strokes: st };
}

/**
 * The heads of the Thai, Lao and Khmer letters: most letters begin their
 * main stroke from a small loop, the pen's first turn on the leaf (ก ด ถ
 * พ). A loop is set at the start of the sign's longest stroke, on the
 * side it comes from.
 */
export function headLoops(g, rng, { share = 0.8, r = 0.07 } = {}) {
    if (!rng.bool(share)) return g;
    const main = g.strokes.filter((t) => !t.mark && !t.closed && !t.headline).sort((a, b) => strokeLength(b) - strokeLength(a))[0];
    if (!main || strokeLength(main) < 0.25) return g;
    const [a, b] = main.pts;
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    const c = [a[0] - (dx / L) * r + (dy / L) * r * 0.6, a[1] - (dy / L) * r - (dx / L) * r * 0.6];
    const loop = { pts: Array.from({ length: 6 }, (_, i) => [c[0] + r * Math.cos((Math.PI * i) / 3), c[1] + r * Math.sin((Math.PI * i) / 3)]), curve: true, closed: true, head: true };
    return fit({ strokes: [...g.strokes, loop] }, 0.12, 0.88);
}

/**
 * The palm-leaf hand: a point on a leaf must curve, so every stroke goes
 * round and every corner turns in an arc (Burmese is circles, the south
 * Indian scripts arches). Bars become shallow arcs, corners rounded.
 */
export function roundHand(g, rng, { bow = 0.08 } = {}) {
    return { strokes: g.strokes.map((t) => {
        if (t.mark || t.head || t.headline) return t;
        if (t.pts.length === 2) {
            const [a, b] = t.pts, dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
            const side = rng.bool(0.5) ? 1 : -1;
            return { ...t, pts: [a, [(a[0] + b[0]) / 2 + (dy / L) * bow * L * side, (a[1] + b[1]) / 2 - (dx / L) * bow * L * side], b], curve: true };
        }
        return { ...t, curve: true };
    }) };
}

/**
 * The Burmese circle: each letter's body a round, open at one side, told
 * from the others by where it opens and by one small stroke kept from what
 * it was (က ဂ င စ ဎ: circles and parts of circles). The opening faces the
 * side the old letter's weight lay away from.
 */
export function circlise(g, rng) {
    const body = g.strokes.filter((t) => !t.mark && !t.head && !t.headline);
    if (!body.length) return g;
    const all = body.flatMap((t) => t.pts);
    const cx = all.reduce((a, q) => a + q[0], 0) / all.length, cy = all.reduce((a, q) => a + q[1], 0) / all.length;
    const gap = Math.atan2(0.5 - cy, 0.5 - cx);                       // open away from the weight
    const arc = Array.from({ length: 9 }, (_, i) => { const a = gap + 0.55 + (i * (2 * Math.PI - 1.1)) / 8; return [0.5 + 0.34 * Math.cos(a), 0.5 + 0.34 * Math.sin(a)]; });
    // the mark inside: a clean short bar, level or upright as the old letter's second stroke ran
    const keep = body.slice().sort((a, b) => strokeLength(b) - strokeLength(a))[1] || null;
    const inner = keep ? [innerBar(keep)] : [];
    return { strokes: [{ pts: arc, curve: true, closed: false }, ...inner, ...g.strokes.filter((t) => t.mark || t.head || t.headline)] };
}

/** A clean short bar in the middle of a letter, level or upright as the stroke it stands for mostly ran. */
function innerBar(t) {
    const a = t.pts[0], z = t.pts[t.pts.length - 1];
    const level = Math.abs(z[0] - a[0]) >= Math.abs(z[1] - a[1]);
    return level ? { pts: [[0.4, 0.5], [0.6, 0.5]], curve: false, closed: false } : { pts: [[0.5, 0.42], [0.5, 0.6]], curve: false, closed: false };
}

/** The block's frame dropped when the signs become letters: what was inside it is the letter. */
export function unframe(g) {
    const b = (t) => { const xs = t.pts.map((q) => q[0]), ys = t.pts.map((q) => q[1]); return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)); };
    const big = g.strokes.filter((t) => t.closed).sort((x, y) => b(y) - b(x))[0];
    if (!big || b(big) < 0.35 || g.strokes.length < 2) return g;
    return fit({ strokes: g.strokes.filter((t) => t !== big) }, 0.12, 0.88);
}

/**
 * The Thai body: every letter a rounded body of one height sitting on the
 * line, open on one side (ก ข ค ด บ ป พ ฟ), begun from a loop at one
 * corner, with at most one small stroke kept from what it was. Letters
 * are told apart by the side they open to, the corner the loop sits at,
 * and that stroke.
 */
export function thaiBody(g, rng) {
    const body = g.strokes.filter((t) => !t.mark && !t.headline && !t.head);
    if (!body.length) return g;
    const all = body.flatMap((t) => t.pts);
    const cx = all.reduce((a, q) => a + q[0], 0) / all.length, cy = all.reduce((a, q) => a + q[1], 0) / all.length;
    const x0 = 0.22, x1 = 0.78, y0 = 0.38, y1 = 0.86, r = 0.08;
    // the open side: away from the old letter's weight
    const open = Math.abs(cx - 0.5) > Math.abs(cy - 0.5) ? (cx > 0.5 ? 'left' : 'right') : (cy > 0.5 ? 'top' : 'bottom');
    const ring = [[x0 + r, y0], [x1 - r, y0], [x1, y0 + r], [x1, y1 - r], [x1 - r, y1], [x0 + r, y1], [x0, y1 - r], [x0, y0 + r]];
    // walk the ring from the end of the gap round to its start
    const gapAt = { top: 0, right: 2, bottom: 4, left: 6 }[open];
    const path = Array.from({ length: 7 }, (_, i) => ring[(gapAt + 1 + i) % 8]);
    const start = path[0];
    const loop = { pts: Array.from({ length: 6 }, (_, i) => [start[0] + 0.07 * Math.cos((Math.PI * i) / 3), start[1] + 0.07 * Math.sin((Math.PI * i) / 3)]), curve: true, closed: true, head: true };
    const keep = body.slice().sort((a, c) => strokeLength(c) - strokeLength(a))[1] || null;
    const inner = keep ? [{ ...innerBar(keep), pts: innerBar(keep).pts.map(([x, y]) => [x, y + 0.12]) }] : [];
    return { strokes: [{ pts: path, curve: true, closed: false }, loop, ...inner, ...g.strokes.filter((t) => t.mark || t.headline)] };
}

/**
 * The type designer's finishing pass, for the faces people read: what a
 * punch-cutter or a font designer does to drawn letters before they are
 * cut. Lines within a few degrees of level, upright or the diagonal set
 * true; ends that nearly meet welded to one point; an end that stops just
 * short of a stroke, or runs just past it, set on it exactly; strokes that
 * meet end to end drawn as one line, so the corner turns instead of two
 * pieces abutting; strokes that run side by side evenly spaced.
 */
export function finish(g, { snapDeg = 12, weld = 0.055, reach = 0.12, maxStrokes = 4 } = {}) {
    const keep = g.strokes.filter((t) => t.mark || t.head || t.headline).map((t) => {
        if (!t.mark || !t.closed) return t;
        const cx = t.pts.reduce((a, q) => a + q[0], 0) / t.pts.length, cy = t.pts.reduce((a, q) => a + q[1], 0) / t.pts.length;
        return { ...t, curve: true, pts: Array.from({ length: 6 }, (_, i) => [cx + 0.035 * Math.cos((Math.PI * i) / 3), cy + 0.035 * Math.sin((Math.PI * i) / 3)]) };
    });
    let st = g.strokes.filter((t) => !t.mark && !t.head && !t.headline).map((t) => ({ ...t, pts: t.pts.map((q) => q.slice()).filter((q, i, a) => !i || dist(q, a[i - 1]) > 1e-4) })).filter((t) => t.pts.length >= 2);
    const turnAt = (a, b, c) => { const ax = b[0] - a[0], ay = b[1] - a[1], bx = c[0] - b[0], by = c[1] - b[1]; return (Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / ((Math.hypot(ax, ay) * Math.hypot(bx, by)) || 1e-9)))) * 180) / Math.PI; };
    // a closed polygon that turns back on itself is no ring: opened, so the hairpin rule can cut it
    st = st.map((t) => {
        if (!t.closed || t.curve || t.pts.length < 3) return t;
        const seq = [...t.pts, t.pts[0], t.pts[1]];
        for (let i = 1; i < seq.length - 1; i++) if (turnAt(seq[i - 1], seq[i], seq[i + 1]) > 150) return { ...t, closed: false, pts: [...t.pts, t.pts[0]] };
        return t;
    });
    // a curve that comes back almost to its start is a ring, not a stroke that crosses itself
    st = st.map((t) => (t.curve && !t.closed && t.pts.length >= 4 && dist(t.pts[0], t.pts[t.pts.length - 1]) < 0.12 && strokeLength(t) > 0.5 ? { ...t, closed: true } : t));
    // a bowl is a clean oval in the box the curve filled, as a designer draws it (the Roman O and D, the Greek Θ)
    st = st.map((t) => {
        if (!t.closed || !t.curve || t.pts.length < 4) return t;
        const xs = t.pts.map((q) => q[0]), ys = t.pts.map((q) => q[1]);
        const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
        if (x1 - x0 < 0.1 || y1 - y0 < 0.1) {
            const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
            return x1 - x0 >= y1 - y0 ? { ...t, closed: false, curve: false, pts: [[x0, cy], [x1, cy]] } : { ...t, closed: false, curve: false, pts: [[cx, y0], [cx, y1]] };
        }
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0) / 2, ry = (y1 - y0) / 2;
        return { ...t, pts: Array.from({ length: 8 }, (_, i) => [cx + rx * Math.cos((Math.PI * i) / 4), cy + ry * Math.sin((Math.PI * i) / 4)]) };
    });
    // specks go: a stroke too short to be one, unless it is a dot that means something
    st = st.filter((t) => t.closed || t.kind === 'dian' || strokeLength(t) >= 0.08);
    // 0. no hairpins: where a line turns back on itself, a short arm is a flick and goes, a long one is its own stroke
    const split = [];
    for (const t of st) {
        if (t.closed) { split.push(t); continue; }
        let cur = [t.pts[0]];
        for (let i = 1; i < t.pts.length; i++) {
            const prev = cur[cur.length - 1], q = t.pts[i], nxt = t.pts[i + 1];
            cur.push(q);
            if (!nxt) break;
            const ax = q[0] - prev[0], ay = q[1] - prev[1], bx = nxt[0] - q[0], by = nxt[1] - q[1];
            const turn = Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / ((Math.hypot(ax, ay) * Math.hypot(bx, by)) || 1e-9)))) * 180 / Math.PI;
            if (turn > 100) {
                const rest = t.pts.slice(i);
                const restLen = rest.reduce((L, r, k) => L + (k ? dist(rest[k - 1], r) : 0), 0);
                const curLen = cur.reduce((L, r, k) => L + (k ? dist(cur[k - 1], r) : 0), 0);
                if (turn > 150 && restLen < 0.12) { break; }                       // a flick at the end
                if (turn > 150 && curLen < 0.12) { cur = [q]; continue; }           // a flick at the start
                split.push({ ...t, pts: cur }); cur = [q];
            }
        }
        if (cur.length >= 2) split.push({ ...t, pts: cur });
    }
    st = split;
    // 1. angles set true: level, upright, and the two diagonals
    for (const t of st) {
        if (t.curve) continue;
        for (let i = 1; i < t.pts.length; i++) {
            const a = t.pts[i - 1], b = t.pts[i], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
            if (L < 0.08) continue;
            const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
            for (const target of [-180, -135, -90, -45, 0, 45, 90, 135, 180]) {
                if (Math.abs(ang - target) <= snapDeg && Math.abs(ang - target) > 0.01) {
                    // the segment turned about its start, so a polyline stays joined at every corner
                    const r = (target * Math.PI) / 180;
                    t.pts[i] = [a[0] + Math.cos(r) * L, a[1] + Math.sin(r) * L];
                    break;
                }
            }
        }
    }
    // 2. ends that nearly meet welded to one point
    const ends = [];
    st.forEach((t, k) => { if (!t.closed) { ends.push([k, 0]); ends.push([k, t.pts.length - 1]); } });
    for (let i = 0; i < ends.length; i++) {
        const [ki, pi] = ends[i];
        const group = [[ki, pi]];
        for (let j = i + 1; j < ends.length; j++) {
            const [kj, pj] = ends[j];
            if (kj === ki) continue;
            if (dist(st[ki].pts[pi], st[kj].pts[pj]) <= weld) group.push([kj, pj]);
        }
        if (group.length < 2) continue;
        const c = group.reduce((m, [k, p]) => [m[0] + st[k].pts[p][0] / group.length, m[1] + st[k].pts[p][1] / group.length], [0, 0]);
        for (const [k, p] of group) st[k].pts[p] = c.slice();
    }
    // 3. an end just short of a stroke, or just past it, set on it
    const onto = (q, u) => {
        let best = null, bd = Infinity, tAt = 0;
        for (let i = 1; i < u.pts.length; i++) {
            const a = u.pts[i - 1], b = u.pts[i], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-9;
            const w = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L2));
            const c = [a[0] + w * dx, a[1] + w * dy], d = dist(q, c);
            if (d < bd) { bd = d; best = c; tAt = w; }
        }
        return [best, bd];
    };
    for (const t of st) {
        if (t.closed || t.pts.length < 2) continue;
        for (const end of [0, t.pts.length - 1]) {
            const q = t.pts[end], inner = t.pts[end === 0 ? 1 : t.pts.length - 2];
            let best = null, bd = weld;
            for (const u of st) {
                if (u === t) continue;
                const [c, d] = onto(q, u);
                if (d > 0.004 && d < bd) { bd = d; best = c; }
                // overshoot: the stroke crosses u just before its end; cut it at the crossing
                const [c2, d2] = onto(inner, u);
                if (!t.curve && d2 > 0.004 && dist(q, inner) > 0.1) {
                    for (let i = 1; i < u.pts.length; i++) {
                        const x = cross(inner, q, u.pts[i - 1], u.pts[i]);
                        if (x && dist(x, q) < weld * 1.4 && dist(x, q) > 0.004) { bd = 0; best = x; }
                    }
                }
            }
            if (!best && !t.curve) {
                // nothing beside it: look straight ahead, as the designer closes a gap by lengthening the stroke
                const dx = q[0] - inner[0], dy = q[1] - inner[1], L = Math.hypot(dx, dy) || 1e-9;
                const far = [q[0] + (dx / L) * reach, q[1] + (dy / L) * reach];
                let hit = null, hd = Infinity;
                for (const u of st) {
                    if (u === t) continue;
                    for (let i = 1; i < u.pts.length; i++) {
                        const x = cross(q, far, u.pts[i - 1], u.pts[i]);
                        if (x && dist(x, q) < hd) { hd = dist(x, q); hit = x; }
                    }
                }
                if (hit && hd > 0.004) best = hit;
            }
            if (best) t.pts[end] = best;
        }
    }
    // 3b. a stroke lying along another (a curve out and a line back over it) is one stroke: the shorter goes
    {
        const onLine = (q, u) => { let bd = Infinity; for (let i = 1; i < u.pts.length; i++) { const a = u.pts[i - 1], b = u.pts[i], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-9; const w = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L2)); bd = Math.min(bd, dist(q, [a[0] + w * dx, a[1] + w * dy])); } return bd; };
        const samples = (t) => { const out = []; for (let i = 1; i < t.pts.length; i++) for (let k = 0; k <= 4; k++) out.push([t.pts[i - 1][0] + ((t.pts[i][0] - t.pts[i - 1][0]) * k) / 4, t.pts[i - 1][1] + ((t.pts[i][1] - t.pts[i - 1][1]) * k) / 4]); return out; };
        const drop = new Set();
        for (let i = 0; i < st.length; i++) for (let j = 0; j < st.length; j++) {
            if (i === j || drop.has(i) || drop.has(j) || st[i].closed || st[j].closed) continue;
            if (strokeLength(st[i]) > strokeLength(st[j])) continue;
            if (samples(st[i]).every((q) => onLine(q, st[j]) < 0.06)) drop.add(i);
        }
        st = st.filter((_, i) => !drop.has(i));
    }
    // 4. strokes that meet end to end drawn as one line (a straight one and a curve stay apart)
    let merged = true;
    while (merged) {
        merged = false;
        outer: for (let i = 0; i < st.length; i++) for (let j = 0; j < st.length; j++) {
            if (i === j || st[i].closed || st[j].closed || !!st[i].curve !== !!st[j].curve) continue;
            const a = st[i], b = st[j];
            const tail = a.pts[a.pts.length - 1];
            const pick = dist(tail, b.pts[0]) < 0.002 ? b.pts : dist(tail, b.pts[b.pts.length - 1]) < 0.002 ? b.pts.slice().reverse() : null;
            if (!pick) continue;
            // only where nothing else meets at that point: a T or a cross keeps its strokes; and never back on itself
            if (st.some((u, k) => k !== i && k !== j && u.pts.some((q) => dist(q, tail) < 0.002))) continue;
            { const p0 = a.pts[a.pts.length - 2], p2 = pick[1]; const ax = tail[0] - p0[0], ay = tail[1] - p0[1], bx = p2[0] - tail[0], by = p2[1] - tail[1];
              const turn = Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / ((Math.hypot(ax, ay) * Math.hypot(bx, by)) || 1e-9)))) * 180 / Math.PI;
              if (turn > 100) continue; }
            st[i] = { ...a, pts: [...a.pts, ...pick.slice(1)] };
            st.splice(j, 1);
            merged = true;
            break outer;
        }
    }
    while (st.length > maxStrokes) {
        const shortest = st.reduce((a, b) => (strokeLength(b) < strokeLength(a) ? b : a));
        st = st.filter((t) => t !== shortest);
    }
    return { strokes: [...st, ...keep] };
}
function cross(p1, p2, p3, p4) {
    const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
    if (Math.abs(d) < 1e-9) return null;
    const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d;
    const u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])] : null;
}

export { map, peucker, joinTouching };
