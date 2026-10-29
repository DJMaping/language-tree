/**
 * Joined letter forms: initial, medial, final and isolated (DJ's plan,
 * 30 Oct 2026, step 5: "joined letter forms ... in the app and the fonts").
 *
 * In a joined script a letter changes with its place in the word, as in
 * Arabic, Syriac and Mongolian: at the start it reaches forward to the next
 * letter, in the middle it is squeezed between two joins with its tail
 * tucked up, at the end it takes the join from the letter before and keeps
 * its tail, and alone it is as it was drawn. Some letters join only to the
 * letter before them and never to the next (Arabic's alif, dal, ra, waw),
 * so a word breaks after them.
 *
 * Horizontal scripts join on their baseline (the rasm skeletons sit at
 * 0.68: hands.js); a script written down the page (Dorimian, the Mongolian
 * manner) hangs its letters on a spine at x 0.5, with a crown on the first
 * letter of a word and a tail on the last.
 */

const BASE = 0.68;
const NON_JOINING = new Set(['alif', 'dal', 'ra', 'waw']);

/** How a letter joins: 'dual' to both sides, or 'right' to the letter before it only. */
export const joinClass = (sign) => (NON_JOINING.has(sign.rasm) ? 'right' : 'dual');

const copy = (strokes) => strokes.map((t) => ({ ...t, pts: t.pts.map((q) => q.slice()) }));
const L = (...pts) => ({ pts, curve: false, closed: false });
const C = (...pts) => ({ pts, curve: true, closed: false });
const ink = (strokes) => strokes.filter((t) => !t.mark).flatMap((t) => t.pts);

/** Tails below the baseline tucked up to it, as a letter inside a word carries them (Arabic ba, nun, ya, ra inside a word). */
function tuck(strokes) {
    return strokes.map((t) => (t.mark ? t : { ...t, pts: t.pts.map(([x, y]) => [x, y > BASE + 0.02 ? BASE + 0.02 + (y - BASE - 0.02) * 0.25 : y]) }));
}
/** Narrowed about the letter's middle, as a medial letter is. */
function narrow(strokes, k) {
    const xs = ink(strokes).map((p) => p[0]);
    const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
    return strokes.map((t) => ({ ...t, pts: t.pts.map(([x, y]) => [mid + (x - mid) * k, y]) }));
}
/** The ink's nearest point to the baseline on one side (left or right). */
function edgeAt(strokes, side) {
    const near = ink(strokes).filter(([, y]) => Math.abs(y - BASE) < 0.08);
    const pts = near.length ? near : ink(strokes);
    return side === 'left' ? Math.min(...pts.map((p) => p[0])) : Math.max(...pts.map((p) => p[0]));
}

/**
 * The four forms of a letter of a joined horizontal script, right to left:
 * the join to the letter before comes in on the right, the join to the next
 * goes out on the left, along the baseline to the letter's edge, so letters
 * set side by side touch.
 */
function horizontalForms(strokes) {
    const toNext = (s) => [...s, L([edgeAt(s, 'left'), BASE], [0, BASE])];
    const fromPrev = (s) => [...s, L([1, BASE], [edgeAt(s, 'right'), BASE])];
    const inner = tuck(strokes);
    return {
        isol: copy(strokes),
        init: toNext(copy(inner)),
        medi: fromPrev(toNext(narrow(copy(inner), 0.78))),
        fina: fromPrev(copy(strokes)),
    };
}

/** The four forms of a letter hung on a spine, top to bottom (Mongolian: a crown to start a word, a tail to end it). */
function verticalForms(strokes) {
    const ys = ink(strokes).map((p) => p[1]);
    const top = Math.min(...ys), bottom = Math.max(...ys);
    const crown = L([0.34, Math.max(0.02, top - 0.06)], [0.5, top]);
    const tail = C([0.5, bottom], [0.56, Math.min(0.98, bottom + 0.08)], [0.72, Math.min(0.98, bottom + 0.05)]);
    return {
        isol: [...copy(strokes), crown, tail],
        init: [...copy(strokes), crown],
        medi: copy(strokes),
        fina: [...copy(strokes), tail],
    };
}

/** A sign's joined forms, or null where its script does not join. */
export function joinForms(sign, stage) {
    if (!stage.joining || !sign.glyph?.strokes?.length) return null;
    const forms = stage.direction === 'ttb' ? verticalForms(sign.glyph.strokes) : horizontalForms(sign.glyph.strokes);
    const joins = stage.direction === 'ttb' ? 'dual' : joinClass(sign);
    // a letter that never joins forward has no initial or medial of its own: it begins and ends as it would alone
    if (joins === 'right') { forms.init = forms.isol; forms.medi = forms.fina; }
    return { joins, forms };
}

/**
 * Which form each letter of a word takes: joined to the one before where
 * that one joins forward, and to the next where it does itself.
 */
export function formsOfWord(signs) {
    return signs.map((s, i) => {
        const prev = i > 0 ? signs[i - 1] : null;
        const next = i < signs.length - 1 ? signs[i + 1] : null;
        const fromPrev = !!prev && (prev.joins ?? 'dual') === 'dual';
        const toNext = !!next && (s.joins ?? 'dual') === 'dual';
        return fromPrev && toNext ? 'medi' : fromPrev ? 'fina' : toNext ? 'init' : 'isol';
    });
}
