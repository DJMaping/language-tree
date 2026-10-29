/**
 * Vowel marks for an abugida (DJ's plan, step 6: "vowel marks"): each vowel
 * after a consonant is written as a mark on it, made from that vowel's own
 * letter cut down to a stroke or two, as the Brahmi matras were cut from
 * the vowel letters (the Devanagari i-mark from the letter i, the u-mark
 * hung under the consonant). Front vowels ride above the consonant (i, e),
 * rounded back vowels hang below it (u, o), the open and middle vowels
 * follow it (a, ə), as Devanagari's ā and Thai's long a stand after theirs.
 * A vowel with no letter of its own takes the nearest vowel's mark turned
 * the other way. The inherent vowel has no mark.
 */


const FRONT = /[ieɛæyøœɪ]/u;
const BACK = /[uoɔʊɒɯɤ]/u;
const base = (v) => v.replace(/[ʲʷʰʼ̃ːˑ˥˦˧˨˩]/gu, '');

/** Where a vowel's mark sits. */
export const markPlace = (v) => (FRONT.test(base(v)) ? 'above' : BACK.test(base(v)) ? 'below' : 'after');

/** A glyph's strokes fitted into a box. */
function into(strokes, [x0, y0, x1, y1]) {
    const pts = strokes.flatMap((t) => t.pts);
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const ax = Math.min(...xs), bx = Math.max(...xs), ay = Math.min(...ys), by = Math.max(...ys);
    const k = Math.min((x1 - x0) / Math.max(0.05, bx - ax), (y1 - y0) / Math.max(0.05, by - ay));
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, mx = (ax + bx) / 2, my = (ay + by) / 2;
    return strokes.map((t) => ({ ...t, pts: t.pts.map(([x, y]) => [cx + (x - mx) * k, cy + (y - my) * k]) }));
}
const ZONE = { above: [0.3, 0.0, 0.7, 0.1], below: [0.32, 0.88, 0.68, 0.99], after: [0.9, 0.3, 1.06, 0.72] };

/**
 * The marks for every vowel the language has, keyed by its sound. `vowels`
 * are the language's vowel sounds; the stage's vowel letters give the
 * shapes; `rngFor(v)` a stream per vowel.
 */
export function vowelMarks(stage, vowels, rngFor) {
    const letters = stage.signs.filter((s) => s.value?.kind === 'V' && s.glyph?.strokes?.length);
    if (!letters.length) return null;
    const marks = {};
    for (const v of vowels) {
        if (base(v) === base(stage.inherent || 'a')) continue;
        const own = letters.find((s) => base(s.value.sound) === base(v));
        const near = own || letters.find((s) => markPlace(s.value.sound) === markPlace(v)) || letters[0];
        // the letter's longest stroke, cut to a curve of three points: a mark is one quick stroke of the pen (a heavier one blots at its size)
        const main = near.glyph.strokes.filter((t) => !t.mark && !t.headline && !(t.pts.length === 2 && Math.abs(t.pts[0][1] - t.pts[1][1]) < 0.02 && Math.abs(t.pts[0][1] - 0.12) < 0.06)).map((t) => ({ t, len: t.pts.slice(1).reduce((n, p, i) => n + Math.hypot(p[0] - t.pts[i][0], p[1] - t.pts[i][1]), 0) })).sort((x, y) => y.len - x.len)[0]?.t;
        if (!main) continue;
        const pts = main.pts.length >= 3 ? [main.pts[0], main.pts[Math.floor(main.pts.length / 2)], main.pts[main.pts.length - 1]] : main.pts;
        const at = markPlace(v);
        // a script hung from a headline keeps its marks above clear of it (Devanagari's i and e marks ride over the line)
        const zone = at === 'above' && stage.style?.headline ? [0.36, 0.0, 0.64, 0.06] : ZONE[at];
        let strokes = into([{ pts, curve: pts.length >= 3, closed: false }], zone);
        // a vowel with no letter of its own: the nearest vowel's mark, turned the other way
        if (!own) strokes = strokes.map((t) => ({ ...t, pts: t.pts.map(([x, y]) => [zone[0] + zone[2] - x, y]) }));
        // two vowels whose letters share their main stroke would share a mark: the second is turned over, the third gets a tick
        const key = (st) => JSON.stringify(st.map((t) => t.pts.map(([x, y]) => [Math.round(x * 50), Math.round(y * 50)])));
        const taken = new Set(Object.values(marks).filter((m) => m.at === at).map((m) => key(m.glyph.strokes)));
        if (taken.has(key(strokes))) strokes = strokes.map((t) => ({ ...t, pts: t.pts.map(([x, y]) => [x, zone[1] + zone[3] - y]) }));
        if (taken.has(key(strokes))) strokes = [...strokes, { pts: [[zone[2] + 0.02, zone[1]], [zone[2] + 0.05, zone[3]]], curve: false, closed: false }];
        marks[v] = { at, from: near.id, glyph: { strokes: strokes.map((t) => ({ ...t, vowelMark: true })) } };
    }
    return marks;
}
