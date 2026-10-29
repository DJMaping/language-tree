/**
 * Word-signs: a script that writes words, not sounds, the way Chinese has
 * for three and a half thousand years (DJ, 28 Oct 2026: Dahen stays a
 * script of word-signs "like Chinese").
 *
 * Chinese characters were made four ways, and the shares moved over time
 * (the Shuowen of AD 100 names them; the counts are from the oracle bones
 * on): pictures of things (日 sun, 山 mountain, 木 tree); signs borrowed for
 * a word that sounded like the pictured one (來 "wheat" for "come", 其
 * "basket" for "his"); two meanings put together (休 a person by a tree,
 * "rest"); and above all a meaning part beside a sound part (河 "river" is
 * water 氵 beside 可 kě). About a fifth of the oracle bone signs are of the
 * last kind and some four fifths of the characters by the Han.
 *
 * Here a word that can be drawn is drawn (pictograms.js); a grammar or a
 * counting word borrows the sign of a word that sounds like it; and any
 * other word takes the radical of its domain beside the sign of a word that
 * sounds like it. Compounds are kept as their parts and put together again
 * at every stage, so a radical changes alike in every sign that carries it,
 * as 水 became 氵 in all of them at once. The sounds go on changing under
 * the signs, so the sound parts drift from the words they once matched (工
 * gōng is no longer the sound of 江 jiāng's word).
 */

import { glyph, fit, bbox, strokeLength, sampled, rotate, dist, similarity } from './strokes.js';
import { pictogram, DRAWABLE } from './pictograms.js';
import { simplify, peucker, distinguish } from './evolve.js';

const base = (ipa) => ipa.replace(/[˥-˩ːʰʼ̞̃ʲʷ]/gu, '');

/**
 * The radical each domain's words take: a picture of the thing the class
 * is about, as the Chinese radicals are (氵 water, 扌 hand, 忄 heart, 口
 * mouth, 犭 dog for beasts, 艹 grass, 宀 roof, 貝 the cowrie for trade and
 * money, 示 the altar for the gods, 戈 the halberd for war, 糸 silk for
 * colours and cloth, 禾 grain, 足 foot for going, 目 eye for seeing, 女
 * woman for kin). Grammar and counting words have no class: they borrow.
 */
export const RADICAL = {
    action: 'hand', body: 'bone', quality: 'heart', cognition: 'heart', animal: 'dog', motion: 'foot', society: 'person', person: 'person',
    speech: 'mouth', nature: 'earth', time: 'sun', kinship: 'woman', space: 'road', plant: 'leaf', food: 'pot', tool: 'knife', craft: 'rope',
    dwelling: 'house', weather: 'rain', agriculture: 'grain', trade: 'shell', religion: 'god', war: 'spear', perception: 'eye', colour: 'rope',
};
/**
 * Where a radical stands. Over the sign (雨 rain, 艹 grass, 宀 roof, 竹
 * bamboo); under it, often or now and then (心 heart in 想 思 念, 貝 the
 * cowrie in 貨 貴 買, 土 earth in 坐 型, 女 in 要 妻); round it (門 door
 * in 問 間 開, 囗 the wall in 國 圍); else to its left (氵 扌 亻 木 口).
 */
const TOP = new Set(['rain', 'leaf', 'house']);
const BOTTOM = { heart: 0.5, shell: 0.6, earth: 0.3, woman: 0.2, pot: 0.5 };
const ENCLOSE = new Set(['door', 'wall']);
const layoutFor = (radical, rng) => (TOP.has(radical) ? 'top' : ENCLOSE.has(radical) ? 'enclose' : rng.float(0, 1) < (BOTTOM[radical] || 0) ? 'bottom' : 'left');
const LOANED = new Set(['grammar', 'quantity']);
/** Words of these kinds borrow too, whatever their domain: 我 "I" was a halberd, 其 "his" a basket, 何 "what" a man carrying a load. */
const LOANED_POS = new Set(['pron', 'adv', 'dem', 'interrog', 'quant', 'num', 'neg', 'adp', 'conj', 'part', 'art']);

/**
 * The clerical change: a brush cannot draw a ring cleanly, so the clerks
 * squared every closed curve (日 sun, 口 mouth, 目 eye were rings and ovals
 * on the bones and the bronzes).
 */
export function squareRings(g) {
    return { strokes: g.strokes.map((s) => {
        if (!s.curve || s.mark) return s;
        if (!s.closed) {
            // an arc squared: out from each end to the arc's furthest reach, and across (the top of 口, the sides of 目)
            const a = s.pts[0], z = s.pts[s.pts.length - 1];
            const dx = z[0] - a[0], dy = z[1] - a[1], L = Math.hypot(dx, dy) || 1e-6;
            let far = 0, off = [0, 0];
            for (const p of s.pts) {
                const d = ((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / L;
                if (Math.abs(d) > Math.abs(far)) { far = d; off = [(dy / L) * d, (-dx / L) * d]; }
            }
            if (Math.abs(far) < 0.05) return { ...s, curve: false, pts: [a, z] };
            return { ...s, curve: false, pts: [a, [a[0] + off[0], a[1] + off[1]], [z[0] + off[0], z[1] + off[1]], z] };
        }
        const b = bbox({ strokes: [s] });
        const w = Math.max(b.w, 0.06), h = Math.max(b.h, 0.06), cx = b.x0 + b.w / 2, cy = b.y0 + b.h / 2;
        return { ...s, curve: false, pts: [[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]] };
    }) };
}

// ---------------------------------------------------------------------------
// The changes of the hand, stage by stage. Each is one of China's.
// ---------------------------------------------------------------------------

/** The beasts the bone scribes stood on their tails to fit a column (馬 horse, 犬 dog, 豕 pig, 象 elephant, 虎 tiger). */
export const STANDING = new Set(['horse', 'dog', 'cow', 'bull', 'ox', 'sheep', 'goat', 'pig', 'deer', 'fish', 'snake', 'crab']);
export const standUp = (g) => { const b = bbox(g); return b.w > b.h * 1.15 ? fit(rotate(g, -90)) : g; };

/** The bronze casters' line: every bent stroke a curve, and the frame filled out. */
export const roundOut = (g) => fit({ strokes: g.strokes.map((s) => (s.mark || s.pts.length < 3 ? s : { ...s, curve: true })) }, 0.1, 0.9);

/**
 * The seal script: tall, of one weight, every stroke a smooth curve, the
 * sign fitted to a frame taller than wide (the Qin small seal, 221 BC).
 */
export function sealify(g) {
    const out = { strokes: g.strokes.map((s) => (s.mark ? s : { ...s, curve: s.pts.length >= 3 || s.closed ? true : s.curve })) };
    const f = fit(out, 0.12, 0.88), b = bbox(f);
    return { strokes: f.strokes.map((s) => ({ ...s, pts: s.pts.map(([x, y]) => [0.5 + (x - 0.5) * 0.8, 0.06 + ((y - b.y0) / Math.max(b.h, 0.05)) * 0.88]) })) };
}

/**
 * The clerical change (libian), the great break of Chinese writing: the
 * brush could not draw the seal's pictures, so the clerks rebuilt every sign
 * from a few strokes, each made one way: across (heng), down (shu), falling
 * left (pie), falling right (na), the dot (dian), and the turn (zhe), an
 * across that turns down. Every curve broken at its bends; every piece set
 * to the nearest of those directions and to a coarse grid; pieces that now
 * lie on one another made one; the sign flattened wide. After it the
 * pictures can no longer be seen: 女 woman, a kneeling figure on the bones,
 * is three strokes; 馬 horse is a frame and four dots.
 */
export function libian(g, rng, { maxStrokes = 6, grid = 6, wide = 1.25 } = {}) {
    // 1. every stroke as straight pieces, broken at its bends
    const pieces = [];
    const lines = sampled(g, 4);
    for (let k = 0; k < lines.length; k++) {
        if (g.strokes[k].mark) continue;
        const line = peucker(lines[k], 0.07);
        for (let i = 1; i < line.length; i++) pieces.push([line[i - 1], line[i]]);
    }
    // 2. each piece to its stroke: the nearest of across, down, falling left, falling right, or a dot
    const snap = (v) => Math.round(v * grid) / grid;
    const gap = (a, d) => { const x = Math.abs(a - d) % 180; return Math.min(x, 180 - x); };
    let strokes = [];
    for (const [a, b] of pieces) {
        const L = dist(a, b);
        if (L < 0.05) continue;
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        if (L < 0.13) { strokes.push({ kind: 'dian', pts: [[mx - 0.03, my - 0.035], [mx + 0.025, my + 0.03]] }); continue; }
        let ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
        if (ang < 0) ang += 180;
        const dir = [0, 45, 90, 135].reduce((best, d) => (gap(ang, d) < gap(ang, best) ? d : best), 0);
        const r = (dir * Math.PI) / 180, h = L / 2;
        let p = [snap(mx - Math.cos(r) * h), snap(my - Math.sin(r) * h)], q = [snap(mx + Math.cos(r) * h), snap(my + Math.sin(r) * h)];
        if (dist(p, q) < 0.05) continue;
        if (dir === 0 ? p[0] > q[0] : p[1] > q[1]) [p, q] = [q, p];
        strokes.push({ kind: dir === 0 ? 'heng' : dir === 90 ? 'shu' : dir === 135 ? 'pie' : 'na', pts: [p, q] });
    }
    // 3. strokes lying on one another made one (two pieces of one line on the grid)
    const along = (s, t, i, j) => Math.abs(s.pts[0][j] - t.pts[0][j]) < 0.02 && s.pts[0][i] <= t.pts[1][i] + 0.02 && t.pts[0][i] <= s.pts[1][i] + 0.02;
    const same = (s, t) => s.kind === t.kind && (s.kind === 'heng' ? along(s, t, 0, 1) : s.kind === 'shu' ? along(s, t, 1, 0) : false);
    for (let i = 0; i < strokes.length; i++) {
        for (let j = i + 1; j < strokes.length; j++) {
            if (!same(strokes[i], strokes[j])) continue;
            const ax = strokes[i].kind === 'heng' ? 0 : 1;
            const all = [...strokes[i].pts, ...strokes[j].pts].sort((u, v) => u[ax] - v[ax]);
            strokes[i] = { ...strokes[i], pts: [all[0], all[all.length - 1]] };
            strokes.splice(j, 1);
            j = i;
        }
    }
    // 4. too many strokes: the dots go first, then the shortest
    while (strokes.length > maxStrokes) {
        const order = strokes.map((s, i) => [s.kind === 'dian' ? 0 : dist(s.pts[0], s.pts[1]), i]).sort((a, b) => a[0] - b[0]);
        strokes.splice(order[0][1], 1);
    }
    // 5. the turns: an across whose end meets a down's top is one stroke (zhe)
    // only once per stroke: an across takes at most one down, and a turn turns no further
    let out = strokes.map((s) => ({ pts: s.pts, curve: false, closed: false, kind: s.kind }));
    for (const h of out.filter((x) => x.kind === 'heng')) {
        const v = out.find((x) => x.kind === 'shu' && !x.joined && dist(h.pts[1], x.pts[0]) <= 0.06);
        if (!v) continue;
        h.pts = [h.pts[0], [v.pts[0][0], h.pts[1][1]], v.pts[1]]; h.kind = 'zhe'; v.joined = true;
    }
    out = out.filter((x) => !x.joined);
    // 6. the falling strokes sweep a little, as a brush does, and a long across ripples (the clerical "silkworm head, wild-goose tail")
    out = out.map((s) => {
        if (s.kind === 'heng' && s.pts.length === 2 && dist(s.pts[0], s.pts[1]) > 0.35) {
            const [a, b] = s.pts;
            return { ...s, pts: [a, [a[0] + (b[0] - a[0]) * 0.35, a[1] - 0.02], [a[0] + (b[0] - a[0]) * 0.75, a[1] + 0.012], [b[0], b[1] - 0.03]], curve: true };
        }
        if ((s.kind !== 'pie' && s.kind !== 'na') || s.pts.length !== 2) return s;
        const [a, b] = s.pts, m = [(a[0] + b[0]) / 2 + (s.kind === 'pie' ? 0.025 : -0.025), (a[1] + b[1]) / 2 + 0.02];
        return { ...s, pts: [a, m, b], curve: true };
    });
    const f = fit({ strokes: [...out, ...g.strokes.filter((t) => t.mark)] }, 0.12, 0.88);
    return fit({ strokes: f.strokes.map((s) => ({ ...s, pts: s.pts.map(([x, y]) => [0.5 + (x - 0.5) * wide, 0.5 + (y - 0.5) / wide]) })) }, 0.1, 0.9);
}

/**
 * What makes a written sign look made rather than drawn: no specks, the
 * strokes that run side by side evenly spaced (三 王 目 言), every stroke
 * that ends near another touching it (Chinese strokes meet or cross; they do
 * not float), and the sign filling its square. Applied from the clerical
 * script on, when the brush, not the picture, decides the shape.
 */
export function regularise(g) {
    const marks = g.strokes.filter((t) => t.mark);
    let st = g.strokes.filter((t) => !t.mark).map((t) => ({ ...t, pts: t.pts.map((q) => q.slice()) }));
    // 1. specks: pieces too short to be a stroke go; two dots at most
    let dots = 0;
    st = st.filter((t) => (t.kind === 'dian' ? ++dots <= 2 : strokeLength(t) >= 0.14 || t.closed));
    // 2. strokes side by side evenly spaced
    const flat = (t, ax) => { const a = t.pts[0], z = t.pts[t.pts.length - 1]; return !t.closed && Math.abs(a[1 - ax] - z[1 - ax]) < 0.03 && Math.abs(a[ax] - z[ax]) > 0.2; };
    for (const ax of [0, 1]) {
        const lines = st.filter((t) => flat(t, ax));
        const span = (t) => { const v = t.pts.map((q) => q[ax]); return [Math.min(...v), Math.max(...v)]; };
        const groups = [];
        for (const t of lines) {
            const [a0, a1] = span(t);
            const grp = groups.find((gr) => gr.some((u) => { const [b0, b1] = span(u); return Math.min(a1, b1) - Math.max(a0, b0) >= 0.5 * Math.min(a1 - a0, b1 - b0); }));
            if (grp) grp.push(t); else groups.push([t]);
        }
        for (const grp of groups) {
            if (grp.length < 3) continue;
            grp.sort((a, b) => a.pts[0][1 - ax] - b.pts[0][1 - ax]);
            const lo = grp[0].pts[0][1 - ax], hi = grp[grp.length - 1].pts[0][1 - ax];
            grp.forEach((t, i) => { const v = lo + ((hi - lo) * i) / (grp.length - 1); t.pts = t.pts.map((q) => (ax === 0 ? [q[0], v] : [v, q[1]])); });
        }
    }
    // 3. an end that stops short of another stroke is drawn on to meet it
    const nearestOn = (q, t) => {
        let best = null, bd = Infinity;
        for (let i = 1; i < t.pts.length; i++) {
            const a = t.pts[i - 1], b = t.pts[i], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-9;
            const u = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L2));
            const c = [a[0] + u * dx, a[1] + u * dy], d = dist(q, c);
            if (d < bd) { bd = d; best = c; }
        }
        return [best, bd];
    };
    for (const t of st) {
        if (t.kind === 'dian' || t.closed) continue;
        for (const end of [0, t.pts.length - 1]) {
            let best = null, bd = 0.1;
            for (const u of st) {
                if (u === t || u.kind === 'dian') continue;
                const [c, d] = nearestOn(t.pts[end], u);
                if (d > 0.015 && d < bd) { bd = d; best = c; }
            }
            if (best) t.pts[end] = best;
        }
    }
    // 4. the sign fills its square (a sign much wider or taller than square keeps some of its shape: 一, 丨)
    const out = { strokes: [...st, ...marks] };
    const b = bbox(out);
    const sx = b.w < 0.1 ? 1 : 0.8 / b.w, sy = b.h < 0.1 ? 1 : 0.8 / b.h;
    let fx = sx, fy = sy;
    if (b.w >= 0.1 && b.h >= 0.1) { if (fx > fy * 1.6) fx = fy * 1.6; if (fy > fx * 1.6) fy = fx * 1.6; }
    const cx = b.x0 + b.w / 2, cy = b.y0 + b.h / 2;
    return { strokes: out.strokes.map((t) => ({ ...t, pts: t.pts.map(([x, y]) => [0.5 + (x - cx) * fx, 0.5 + (y - cy) * fy]) })) };
}

/**
 * The regular script (kaishu): the clerical strokes kept, the flat frame
 * squared, the ripple of the across straightened, and a long down-stroke
 * ending in a hook (亅), the mark of the regular hand.
 */
export function kaishu(g) {
    const b = bbox(g);
    const k = b.w / Math.max(b.h, 0.05);
    let out = k > 1.05 ? { strokes: g.strokes.map((s) => ({ ...s, pts: s.pts.map(([x, y]) => [x, b.y0 + (y - b.y0) * Math.min(k, 1.3)]) })) } : g;
    out = { strokes: out.strokes.map((s) => {
        if (s.kind === 'heng' && s.pts.length > 2) return { ...s, pts: [s.pts[0], [s.pts[s.pts.length - 1][0], s.pts[0][1]]], curve: false };
        if (s.kind === 'shu' && s.pts.length === 2 && dist(s.pts[0], s.pts[1]) > 0.4) { const z = s.pts[1]; return { ...s, pts: [s.pts[0], z, [z[0] - 0.07, z[1] - 0.05]] }; }
        return s;
    }) };
    return fit(out, 0.12, 0.88);
}

/**
 * The cursive road to the simplified signs: a sign written fast runs its
 * strokes into one another, and the reform of 1956 took many of those run
 * forms as the standard (馬 to 马, 門 to 门, 東 to 东, 言 to 讠 as a
 * radical). Each stroke joined to the next where they come near, the joined
 * line smoothed, and the whole cut to a few strokes.
 */
export function contract(g, rng, { maxStrokes = 3, reach = 0.3 } = {}) {
    const order = g.strokes.filter((s) => !s.mark).map((s) => ({ ...s, pts: s.closed ? [...s.pts, s.pts[0]] : s.pts.slice(), closed: false }))
        .sort((a, b) => (a.pts[0][1] + a.pts[0][0] * 0.3) - (b.pts[0][1] + b.pts[0][0] * 0.3));
    const runs = [];
    for (const s of order) {
        const last = runs[runs.length - 1];
        if (last && dist(last.pts[last.pts.length - 1], s.pts[0]) <= reach) last.pts.push(...s.pts);
        else runs.push({ ...s, pts: s.pts.slice() });
    }
    let out = runs.map((r) => ({ ...r, pts: peucker(r.pts, 0.05), curve: false }));
    while (out.length > maxStrokes) {
        const byLen = out.map((s, i) => [strokeLength(s), i]).sort((a, b) => a[0] - b[0]);
        out.splice(byLen[0][1], 1);
    }
    return fit({ strokes: [...out, ...g.strokes.filter((t) => t.mark)] }, 0.12, 0.88);
}

/**
 * The signs the affixes are written with: words they grew from, as Chinese
 * writes its small-thing ending with 子 "child", the one who does with 者 or
 * 家 "house(hold)", the place with 場 "open ground", the many with 們, the
 * want-of with 無 "without", the abstract with 性 "nature".
 */
const AFFIX_HOSTS = {
    DIM: ['child', 'small'], ADJDIM: ['small', 'child'], AUG: ['big', 'great'], AGENT: ['person', 'man (male)'], PLACE: ['field', 'house', 'earth'],
    INSTRUMENT: ['hand', 'knife'], ABSTRACT: ['heart'], PRIV: ['not', 'without', 'no'], COLL: ['all', 'many'], CAUS: ['hand', 'make', 'do'],
    ADJZ: ['heart', 'like'], INTENS: ['very', 'big', 'much'],
};

/** The word a language has for a gloss, live and its own. */
export const wordOf = (state, gloss) => state.entries.find((e) => e.gloss === gloss && e.core && !e.retired && !e.paradigm && !e.sameWordAs)
    || state.entries.find((e) => e.gloss === gloss && !e.retired && !e.paradigm);

/** How like each other two words sound, as a scribe hears it: the first consonant, the first vowel, the next consonant, the length. */
export function soundLike(a, b) {
    if (!a || !b) return 0;
    const ca = a.filter((p) => p.type !== 'V').map((p) => base(p.ipa)), cb = b.filter((p) => p.type !== 'V').map((p) => base(p.ipa));
    const va = a.filter((p) => p.type === 'V').map((p) => base(p.ipa)), vb = b.filter((p) => p.type === 'V').map((p) => base(p.ipa));
    const firstA = a[0]?.type === 'V' ? '' : ca[0], firstB = b[0]?.type === 'V' ? '' : cb[0];
    let n = 0;
    if (firstA === firstB) n += 2;
    if (va[0] && va[0] === vb[0]) n += 1.5;
    if (ca[1] && ca[1] === cb[1]) n += 1;
    if (Math.abs(a.length - b.length) <= 1) n += 0.5;
    return n;
}

/** A glyph stretched into a box: the radical squeezed to its column or its band, as in every compound character. */
function place(g, x0, y0, x1, y1) {
    const b = bbox(g);
    // a thin part (a single stroke, a bar) keeps its own thickness, centred, and is not blown up to fill the box
    const thinX = b.w < 0.08, thinY = b.h < 0.08;
    const kx = thinX ? 1 : (x1 - x0) / b.w, ky = thinY ? 1 : (y1 - y0) / b.h;
    const ox = thinX ? (x0 + x1) / 2 - (b.x0 + b.w / 2) : x0 - b.x0 * kx;
    const oy = thinY ? (y0 + y1) / 2 - (b.y0 + b.h / 2) : y0 - b.y0 * ky;
    return { strokes: g.strokes.map((s) => ({ ...s, pts: s.pts.map(([x, y]) => [x * kx + ox, y * ky + oy]) })) };
}

/** A compound put together from its parts' glyphs at this stage. */
export function compose(radical, phonetic, layout) {
    const [r, p] = layout === 'top' ? [place(radical, 0.1, 0.07, 0.9, 0.33), place(phonetic, 0.08, 0.39, 0.92, 0.93)]
        : layout === 'bottom' ? [place(radical, 0.12, 0.66, 0.88, 0.93), place(phonetic, 0.08, 0.07, 0.92, 0.6)]
        : layout === 'enclose' ? [place(radical, 0.07, 0.07, 0.93, 0.93), place(phonetic, 0.3, 0.32, 0.72, 0.84)]
        : [place(radical, 0.07, 0.08, 0.33, 0.92), place(phonetic, 0.39, 0.07, 0.93, 0.93)];
    return glyph([...r.strokes, ...p.strokes]);
}

const strokesOf = (g) => g.strokes.length;

/**
 * One stage of a word-sign script. `parent` is the stage before (null for
 * the first signs), `state` the language then. The signs carried over keep
 * their make-up and take the language's words of the day; the simple ones
 * go through `steps` (evolve.js, as the alphabets do); new words get signs
 * up to `grow` (pictures first, then borrowings, then compounds, the most
 * used words first); and every compound is put together again from its
 * parts. `radicalForms` squeezes each radical to its few-stroke form (the
 * clerical script's 氵 for 水); `simplified` cuts the signs as the 1956
 * reform did, a compound's sound part swapped for a simpler sign that
 * sounds as well (燈 to 灯).
 */
export function logoStage({ id, name, year, parent, state, rng, rngFor = () => rng, steps = [], grow = 0, pictures = DRAWABLE.length, ductus, direction, type = 'logographic', radicalForms = false, simplified = false, picturesOnly = false, stand = false, tellApart = false }) {
    const signs = [];
    const byGloss = new Map();
    const readingOf = (gloss) => wordOf(state, gloss);
    // 1. the signs carried over
    for (const s of parent?.signs || []) {
        const w = readingOf(s.concept);
        const next = { ...s, id: `${id}:${s.key}`, from: s.id, value: { word: s.concept, reading: w?.ipa ?? s.value.reading, archaic: !w || undefined } };
        if (s.kind !== 'compound') next.glyph = steps.reduce((g, f) => f(g, rngFor(s.key)), stand && STANDING.has(s.concept) ? standUp(s.glyph) : s.glyph);
        next.loans = (s.loans || []).slice();
        signs.push(next); byGloss.set(s.concept, next);
    }
    // 2. the pictures still to draw
    let drawn = 0;
    for (const concept of DRAWABLE) {
        if (drawn >= pictures) break;
        if (byGloss.has(concept)) continue;
        const w = readingOf(concept);
        const pic = pictogram(concept);
        if (!w || !pic) continue;
        const key = concept.replace(/[^a-z]/g, '');
        const s = { id: `${id}:${key}`, key, concept, kind: 'picture', value: { word: concept, reading: w.ipa }, glyph: steps.reduce((g, f) => f(g, rngFor(key)), stand && STANDING.has(concept) ? standUp(pic) : pic), from: null, loans: [], origin: `a picture of ${concept}` };
        signs.push(s); byGloss.set(concept, s); drawn += 1;
    }
    // the simple signs that have fallen together tell themselves apart with a dot (大 big, 太 too, 犬 dog; 王 king, 玉 jade)
    if (tellApart) {
        const simple = signs.filter((x) => x.kind !== 'compound');
        const spots = [[[0.74, 0.14], [0.82, 0.24]], [[0.5, 0.06], [0.56, 0.15]], [[0.62, 0.72], [0.7, 0.82]]];
        for (let i = 0; i < simple.length; i++) for (let j = 0; j < i; j++) {
            if (similarity(simple[i].glyph, simple[j].glyph) < 0.93) continue;
            const has = simple[j].glyph.strokes.filter((t) => t.mark).length;
            simple[i].glyph = { strokes: [...simple[i].glyph.strokes, { pts: spots[has % 3], curve: false, closed: false, mark: true, kind: 'dian' }] };
            simple[i].marked = (simple[i].marked || 0) + 1; simple[i].dotted = true;
            break;
        }
    }
    // 3. the words the language uses most that have no sign yet: borrowed or compounded
    const loaned = new Set(signs.flatMap((s) => s.loans || []));
    const formOf = (s) => readingOf(s.concept)?.form ?? null;
    const candidates = picturesOnly ? [] : state.entries
        .filter((e) => !e.retired && !e.paradigm && !e.sameWordAs && !e.derivedFrom && e.form?.length && !byGloss.has(e.gloss) && !loaned.has(e.gloss))
        .sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999))
        .filter((e, i, a) => a.findIndex((x) => x.gloss === e.gloss) === i);
    let made = 0;
    // how many signs each sound part already serves: the families of Chinese (青 in 清 請 情 晴 精)
    const series = new Map();
    for (const x of signs) if (x.kind === 'compound') series.set(x.phonetic, (series.get(x.phonetic) || 0) + 1);
    for (const e of candidates) {
        if (made >= grow) break;
        const hosts = signs.filter((s) => strokesOf(s.glyph) <= 18 && (s.depth || 0) < 3);
        const family = (s) => (series.get(s.concept) || 0);
        const scored = hosts.map((s) => [soundLike(e.form, formOf(s)) + Math.min(1.5, family(s) * 0.5) + (strokesOf(s.glyph) >= 6 ? 0.6 : strokesOf(s.glyph) >= 4 ? 0.3 : 0), s, soundLike(e.form, formOf(s))])
            .filter(([, , n]) => n > 0).sort((a, b) => b[0] - a[0]);
        const best = scored[0];
        const radical = RADICAL[e.domain];
        if (LOANED.has(e.domain) || LOANED_POS.has(e.pos) || !radical) {
            // a grammar word borrows a sign that sounds like it (其, 之, 而)
            if (!best || best[2] < 2) continue;
            best[1].loans.push(e.gloss); loaned.add(e.gloss); made += 1;
            continue;
        }
        let radical2 = radical;
        if (radical === 'house' && byGloss.has('door') && rngFor(`${e.gloss}:door`).float(0, 1) < 0.4) radical2 = 'door';
        const rad = byGloss.get(radical2);
        if (!rad || !best) continue;
        // the sound part is a sign of another class where one sounds as well (a sound part of the same class reads as a second meaning)
        const phon = scored.find(([n, s]) => n >= best[0] - 0.5 && s.concept !== radical2 && s.radical !== radical2)?.[1] ?? best[1];
        series.set(phon.concept, family(phon) + 1);
        const key = `${e.gloss.replace(/[^a-z]/g, '')}${signs.some((s) => s.key === e.gloss.replace(/[^a-z]/g, '')) ? `-${made}` : ''}`;
        const s = { id: `${id}:${key}`, key, concept: e.gloss, kind: 'compound', radical: radical2, phonetic: phon.concept, layout: layoutFor(radical2, rngFor(`${e.gloss}:layout`)), depth: (phon.depth || 0) + 1,
            value: { word: e.gloss, reading: e.ipa }, from: null, loans: [], origin: `${radical2} for its meaning beside ${phon.concept} (${phon.value.reading}) for its sound` };
        s.glyph = compose(rad.glyph, phon.glyph, s.layout);   // for now; put together again from this stage's parts below
        signs.push(s); byGloss.set(e.gloss, s); made += 1;
    }
    // 4. the simplification: a compound's sound part swapped for the simplest sign that sounds as well; the simple signs cut to their fewest strokes
    if (simplified) {
        const used = new Map();
        for (const s of signs) {
            if (s.kind === 'compound') {
                const now = byGloss.get(s.phonetic);
                if (!now || strokesOf(now.glyph) < 9) continue;
                const form = readingOf(s.concept)?.form;
                const was = soundLike(form, formOf(now));
                const simpler = signs.filter((x) => x.kind !== 'compound' && x.concept !== s.radical && x.concept !== s.concept && (used.get(x.concept) || 0) < 3
                    && soundLike(form, formOf(x)) >= was && strokesOf(x.glyph) >= 3 && strokesOf(x.glyph) <= strokesOf(now.glyph) - 4)
                    .sort((a, b) => soundLike(form, formOf(b)) - soundLike(form, formOf(a)) || strokesOf(b.glyph) - strokesOf(a.glyph))[0];
                if (simpler) { s.phonetic = simpler.concept; s.simplifiedFrom = now.concept; used.set(simpler.concept, (used.get(simpler.concept) || 0) + 1); }
            } else if (strokesOf(s.glyph) > 6) s.glyph = contract(s.glyph, rng, { maxStrokes: 5, reach: 0.22 });
        }
    }
    // 5. every compound put together from its parts of this stage
    const radForm = new Map();
    const radicalGlyph = (concept) => {
        if (!radForm.has(concept)) {
            const g = byGloss.get(concept).glyph;
            // a radical's short form: few strokes, and in the simplified signs fewer, run together (言 to 讠, 金 to 钅)
            radForm.set(concept, simplified ? contract(g, rng, { maxStrokes: 3, reach: 0.22 }) : radicalForms ? simplify(g, rng, { maxStrokes: 4, keep: 1, tolerance: 0.03 }) : g);
        }
        return radForm.get(concept);
    };
    // three columns at most: a part that would make a fourth is stacked instead (湖 is 氵 古 月 side by side; nothing is four across)
    const built = new Map();
    const glyphOf = (s, cols = 1) => {
        if (s.kind !== 'compound') return s.glyph;
        const layout = s.layout === 'left' && cols >= 3 ? 'top' : s.layout;
        const key = `${s.concept}|${layout}|${Math.min(cols, 3)}`;
        if (built.has(key)) return built.get(key);
        const ph = byGloss.get(s.phonetic);
        const g = compose(radicalGlyph(s.radical), !ph ? glyph([{ pts: [[0.3, 0.5], [0.7, 0.5]] }]) : glyphOf(ph, layout === 'left' ? cols + 1 : cols), layout);
        built.set(key, g);
        return g;
    };
    for (const s of signs) if (s.kind === 'compound') s.glyph = glyphOf(s);
    // the affixes: each written with the sign of a word it grew from or sounds like, as 子 "child" writes the small-thing ending
    const affixes = {};
    for (const [affix, glosses] of Object.entries(AFFIX_HOSTS)) {
        const host = glosses.map((g) => byGloss.get(g) || signs.find((x) => (x.loans || []).includes(g))).find(Boolean);
        if (host) affixes[affix] = host.concept;
    }
    const byId = new Map(state.entries.map((e) => [e.id, e]));
    const derived = {};
    for (const e of state.entries) {
        if (e.retired || e.paradigm || !e.derivedFrom || byGloss.has(e.gloss)) continue;
        const root = byId.get(e.derivedFrom.base);
        if (root && byGloss.has(root.gloss) && affixes[e.derivedFrom.affix]) derived[e.gloss] = [root.gloss, affixes[e.derivedFrom.affix]];
    }
    const dotted = signs.filter((x) => x.dotted).length;
    signs.forEach((x) => { delete x.dotted; });
    const counts = { dotted, picture: signs.filter((s) => s.kind === 'picture').length, compound: signs.filter((s) => s.kind === 'compound').length, loans: signs.reduce((n, s) => n + (s.loans?.length || 0), 0) };
    counts.derived = Object.keys(derived).length;
    return { id, name, year, language: state.langId, type, direction, ductus, signs, affixes, derived, parent: parent?.id ?? null, invented: !parent, logographic: true, counts, changes: [] };
}

/**
 * Another people takes the word-signs up, as Japan, Korea and Vietnam took
 * the Chinese characters: each sign keeps its meaning and is read with the
 * borrower's own word for it (the Japanese kun reading: 山 read yama, not
 * shān), the donor's reading kept beside it (the on reading). Signs for
 * words it has none for stay, read the donor's way.
 */
export function logoAdopt({ id, name, year, donor, state, ductus, direction }) {
    const signs = donor.signs.map((s) => {
        const w = wordOf(state, s.concept);
        return { ...s, id: `${id}:${s.key}`, from: s.id, value: { word: s.concept, reading: w?.ipa ?? s.value.reading, donorReading: s.value.reading, borrowedReading: !w || undefined }, loans: (s.loans || []).filter((g) => wordOf(state, g)) };
    });
    return { id, name, year, language: state.langId, type: 'logographic', direction, ductus, signs, affixes: donor.affixes, derived: {}, parent: donor.id, invented: false, logographic: true, changes: [] };
}

export { strokeLength };
