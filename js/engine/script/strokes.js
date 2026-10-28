/**
 * Glyphs as strokes, and the pens that write them.
 *
 * A glyph is a list of strokes in a unit box (x to the right, y down), each a
 * polyline or a smooth curve through its points. Every change a script makes
 * to its shapes down the tree is a transform on these strokes (evolve.js), and
 * every look a script has is a way of inking them (`DUCTUS`), which is how one
 * set of shapes reads as scratched into bone, pressed into clay, brushed, or
 * written with a reed pen.
 *
 * The tool shaped Earth's scripts as much as the language did. Cuneiform's
 * wedges are what a reed stylus leaves in wet clay; Chinese's thick-and-thin
 * strokes are the brush; the runes have no curves and no horizontals because
 * a knife on wood follows the grain and a chisel on stone likes straight
 * cuts; the round scripts of south India and Burma are round because a
 * straight stroke on a palm leaf splits it along the vein; the broad-nibbed
 * reed and quill give Latin and Arabic their thick downstrokes and thin
 * hairlines.
 */

// ---------------------------------------------------------------------------
// Making and measuring
// ---------------------------------------------------------------------------

export const stroke = (pts, opts = {}) => ({ pts: pts.map(([x, y]) => [x, y]), curve: !!opts.curve, closed: !!opts.closed });
export const glyph = (strokes) => ({ strokes: strokes.map((s) => stroke(s.pts, s)) });
export const clone = (g) => glyph(g.strokes);

export function bbox(g) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of g.strokes) for (const [x, y] of s.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return Number.isFinite(x0) ? { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 } : { x0: 0, y0: 0, x1: 1, y1: 1, w: 1, h: 1 };
}

/** Fit the glyph into the box from `lo` to `hi`, keeping its proportions. */
export function fit(g, lo = 0.12, hi = 0.88) {
    const b = bbox(g);
    const span = Math.max(b.w, b.h, 1e-6);
    const k = (hi - lo) / span;
    const dx = lo + ((hi - lo) - b.w * k) / 2 - b.x0 * k;
    const dy = lo + ((hi - lo) - b.h * k) / 2 - b.y0 * k;
    return map(g, ([x, y]) => [x * k + dx, y * k + dy]);
}

export const map = (g, f) => ({ strokes: g.strokes.map((s) => ({ ...s, pts: s.pts.map(f) })) });

export function rotate(g, degrees) {
    const a = (degrees * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    return fit(map(g, ([x, y]) => [0.5 + (x - 0.5) * c - (y - 0.5) * s, 0.5 + (x - 0.5) * s + (y - 0.5) * c]));
}
export const mirror = (g) => map(g, ([x, y]) => [1 - x, y]);
export const flipY = (g) => map(g, ([x, y]) => [x, 1 - y]);

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const length = (s) => { let L = 0; for (let i = 1; i < s.pts.length; i++) L += dist(s.pts[i - 1], s.pts[i]); return L; };

/** Is the shape the same when mirrored? (Letters that are keep their shape when the writing direction turns.) */
export function symmetric(g) {
    const a = raster(g), b = raster(mirror(g));
    let same = 0, all = 0;
    for (let i = 0; i < a.length; i++) { if (a[i] || b[i]) { all += 1; if (a[i] && b[i]) same += 1; } }
    return all ? same / all > 0.8 : true;
}

/** How alike two glyphs are, 0 to 1, by the ink they share on a coarse grid. */
export function similarity(g1, g2) {
    const a = raster(g1), b = raster(g2);
    let both = 0, either = 0;
    for (let i = 0; i < a.length; i++) { if (a[i] || b[i]) { either += 1; if (a[i] && b[i]) both += 1; } }
    return either ? both / either : 1;
}

const RASTER = 14;
function raster(g) {
    const grid = new Uint8Array(RASTER * RASTER);
    for (const s of sampled(fit(g, 0.08, 0.92), 60)) {
        for (let i = 1; i < s.length; i++) {
            const n = Math.max(2, Math.ceil(dist(s[i - 1], s[i]) * RASTER * 2));
            for (let k = 0; k <= n; k++) {
                const t = k / n;
                const x = Math.floor((s[i - 1][0] + (s[i][0] - s[i - 1][0]) * t) * RASTER);
                const y = Math.floor((s[i - 1][1] + (s[i][1] - s[i - 1][1]) * t) * RASTER);
                if (x >= 0 && y >= 0 && x < RASTER && y < RASTER) {
                    grid[y * RASTER + x] = 1;
                    // a little thickness, so near-misses count as shared ink
                    if (x + 1 < RASTER) grid[y * RASTER + x + 1] = 1;
                    if (y + 1 < RASTER) grid[(y + 1) * RASTER + x] = 1;
                }
            }
        }
    }
    return grid;
}

// ---------------------------------------------------------------------------
// Curves
// ---------------------------------------------------------------------------

/** Each stroke as a dense polyline, curves smoothed through their points (Catmull-Rom). */
export function sampled(g, perSegment = 8) {
    return g.strokes.map((s) => {
        const P = s.closed ? [...s.pts, s.pts[0]] : s.pts;
        if (!s.curve || P.length < 3) return P.map((p) => [p[0], p[1]]);
        const out = [];
        for (let i = 0; i < P.length - 1; i++) {
            const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
            for (let k = 0; k < perSegment; k++) {
                const t = k / perSegment, t2 = t * t, t3 = t2 * t;
                out.push([
                    0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
                    0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
                ]);
            }
        }
        out.push([P[P.length - 1][0], P[P.length - 1][1]]);
        return out;
    });
}

// ---------------------------------------------------------------------------
// The pens
// ---------------------------------------------------------------------------

/**
 * How each writing tool inks a stroke: its width along the stroke (`profile`),
 * whether curves survive, and how corners and ends are cut.
 *
 *   incised   a knife or point on bone, wood or stone: thin, even, straight
 *   chisel    stone monuments: even, straight, with small serifs at the ends
 *   stylus    a reed pressed into clay: each segment a wedge, head first
 *   brush     thick in the middle, pointed ends, soft curves
 *   pen       a broad reed or quill: thick across the nib, thin along it
 *   leaf      a point on a palm leaf: thin, even, and all curves
 *   painted   the first pictures, a finger or a reed brush: even and soft
 */
export const DUCTUS = {
    painted: { label: 'painted', width: 0.055, profile: 'even', curves: true, note: 'the first signs were pictures, drawn and painted before anyone cut them' },
    incised: { label: 'incised on bone', width: 0.035, profile: 'even', curves: false, note: 'a point on bone or wood cuts straight lines; curves become angles (Chinese oracle bone script, the runes)' },
    chisel: { label: 'cut in stone', width: 0.05, profile: 'even', curves: false, serif: true, note: 'a chisel likes straight cuts and leaves a small foot at each end (Roman capitals, early Greek)' },
    stylus: { label: 'pressed into clay', width: 0.11, profile: 'wedge', curves: false, note: 'a reed stylus pressed into wet clay leaves a wedge at each push (cuneiform)' },
    brush: { label: 'brushed', width: 0.1, profile: 'brush', curves: true, note: 'a brush thickens as it presses and thins as it lifts (Chinese regular script)' },
    pen: { label: 'reed pen', width: 0.085, profile: 'nib', nib: 30, curves: true, note: 'a broad nib is thick across its edge and thin along it (Latin, Greek, Arabic hands)' },
    leaf: { label: 'on palm leaf', width: 0.04, profile: 'even', curves: true, round: true, note: 'a point on a palm leaf must curve: a straight stroke splits the leaf (the round scripts of south India, Burma, Java)' },
    /**
     * Print. A typeface is not a hand: every stroke the same weight, every
     * curve a clean arc, every letter on the same line and in the same
     * frame. The roman of the 1470s kept the pen's thick and thin and the
     * chisel's feet; the grotesques of the 1800s and the geometric faces of
     * the 1900s dropped both for one even line.
     */
    roman: { label: 'printed, with serifs', width: 0.08, profile: 'nib', nib: 25, curves: true, serif: true, note: "the printed roman of the 1470s (Jenson): the pen's thick and thin made regular, with the chisel's feet" },
    type: { label: 'printed, sans-serif', width: 0.075, profile: 'even', curves: true, note: 'the grotesque and geometric faces of the 1800s and 1900s: one even line, no feet' },
};

/**
 * The glyph as an SVG path of filled ribbons, one per stroke, inked with the
 * given ductus and scaled to `size`.
 */
export function toPath(g, ductusKey = 'pen', size = 100) {
    const d = DUCTUS[ductusKey] || DUCTUS.pen;
    let shown = g;
    if (!d.curves) shown = { strokes: g.strokes.map((s) => ({ ...s, curve: false })) };
    if (d.round) shown = { strokes: g.strokes.map((s) => ({ ...s, curve: true })) };
    const parts = [];
    for (const pts of sampled(shown, 10)) {
        if (pts.length < 2) continue;
        if (d.profile === 'wedge') { parts.push(...wedges(pts, d.width, size)); continue; }
        parts.push(ribbon(pts, d, size));
        // feet on the long stems only, as a roman face has them: not on every short stroke or curve
        if (d.serif && pts.length <= 3 && dist(pts[0], pts[pts.length - 1]) > 0.35) parts.push(...serifs(pts, d.width, size));
    }
    return parts.join(' ');
}

/** A filled ribbon along a polyline whose width follows the pen's profile. */
function ribbon(pts, d, size) {
    const total = pts.reduce((L, p, i) => L + (i ? dist(pts[i - 1], p) : 0), 0) || 1e-6;
    const left = [], right = [];
    let along = 0;
    for (let i = 0; i < pts.length; i++) {
        const prev = pts[Math.max(0, i - 1)], next = pts[Math.min(pts.length - 1, i + 1)];
        if (i) along += dist(pts[i - 1], pts[i]);
        const tx = next[0] - prev[0], ty = next[1] - prev[1];
        const len = Math.hypot(tx, ty) || 1e-6;
        const nx = -ty / len, ny = tx / len;
        const t = along / total;
        let w = d.width;
        if (d.profile === 'brush') w = d.width * (0.25 + 0.75 * Math.sin(Math.PI * Math.min(1, Math.max(0, t))) ** 0.6);
        else if (d.profile === 'nib') {
            const theta = Math.atan2(ty, tx), nib = (d.nib * Math.PI) / 180;
            w = d.width * (0.22 + 0.78 * Math.abs(Math.sin(theta - nib)));
        }
        left.push([pts[i][0] + nx * w / 2, pts[i][1] + ny * w / 2]);
        right.push([pts[i][0] - nx * w / 2, pts[i][1] - ny * w / 2]);
    }
    const ring = [...left, ...right.reverse()];
    return `M${ring.map(([x, y]) => `${(x * size).toFixed(1)},${(y * size).toFixed(1)}`).join('L')}Z`;
}

/** Cuneiform: every segment is a wedge, its head at the start of the push. */
function wedges(pts, width, size) {
    const out = [];
    for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const L = dist(a, b);
        if (L < 0.02) continue;
        const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
        const nx = -uy, ny = ux;
        const head = Math.min(width, L * 0.6);
        const ring = [
            [a[0] + nx * width / 2, a[1] + ny * width / 2],
            [a[0] + ux * head * 0.4 + nx * width * 0.12, a[1] + uy * head * 0.4 + ny * width * 0.12],
            [b[0] + nx * 0.006, b[1] + ny * 0.006],
            [b[0] - nx * 0.006, b[1] - ny * 0.006],
            [a[0] + ux * head * 0.4 - nx * width * 0.12, a[1] + uy * head * 0.4 - ny * width * 0.12],
            [a[0] - nx * width / 2, a[1] - ny * width / 2],
        ];
        out.push(`M${ring.map(([x, y]) => `${(x * size).toFixed(1)},${(y * size).toFixed(1)}`).join('L')}Z`);
    }
    return out;
}

/** The chisel's small feet at a stroke's ends. */
function serifs(pts, width, size) {
    const out = [];
    for (const [p, q] of [[pts[0], pts[1]], [pts[pts.length - 1], pts[pts.length - 2]]]) {
        const tx = q[0] - p[0], ty = q[1] - p[1];
        const len = Math.hypot(tx, ty) || 1e-6;
        const nx = -ty / len, ny = tx / len;
        const f = width * 1.1;
        out.push(`M${[[p[0] + nx * f, p[1] + ny * f], [p[0] - nx * f, p[1] - ny * f], [p[0] - nx * f + tx / len * width * 0.5, p[1] - ny * f + ty / len * width * 0.5], [p[0] + nx * f + tx / len * width * 0.5, p[1] + ny * f + ty / len * width * 0.5]].map(([x, y]) => `${(x * size).toFixed(1)},${(y * size).toFixed(1)}`).join('L')}Z`);
    }
    return out;
}

/** The ink's box: where the sign starts and ends, for setting signs side by side at their own widths. */
export const inkBox = (g) => { const b = bbox({ strokes: g.strokes.filter((s) => !s.headline) }); return { x0: +b.x0.toFixed(3), x1: +b.x1.toFixed(3), y0: +b.y0.toFixed(3), y1: +b.y1.toFixed(3) }; };
export const strokeCount = (g) => g.strokes.length;
export { length as strokeLength, dist };
