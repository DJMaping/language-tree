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

import { glyph, fit, bbox, strokeLength } from './strokes.js';
import { pictogram, DRAWABLE } from './pictograms.js';
import { simplify } from './evolve.js';

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
/** Radicals that stand over the rest of the sign (雨 rain, 艹 grass, 宀 roof); the others stand to its left. */
const TOP = new Set(['rain', 'leaf', 'house']);
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
    const [r, p] = layout === 'top'
        ? [place(radical, 0.14, 0.08, 0.86, 0.36), place(phonetic, 0.12, 0.42, 0.88, 0.92)]
        : [place(radical, 0.08, 0.1, 0.36, 0.9), place(phonetic, 0.42, 0.1, 0.92, 0.9)];
    return fit(glyph([...r.strokes, ...p.strokes]), 0.1, 0.9);
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
export function logoStage({ id, name, year, parent, state, rng, rngFor = () => rng, steps = [], grow = 0, pictures = DRAWABLE.length, ductus, direction, type = 'logographic', radicalForms = false, simplified = false, picturesOnly = false }) {
    const signs = [];
    const byGloss = new Map();
    const readingOf = (gloss) => wordOf(state, gloss);
    // 1. the signs carried over
    for (const s of parent?.signs || []) {
        const w = readingOf(s.concept);
        const next = { ...s, id: `${id}:${s.key}`, from: s.id, value: { word: s.concept, reading: w?.ipa ?? s.value.reading, archaic: !w || undefined } };
        if (s.kind !== 'compound') next.glyph = steps.reduce((g, f) => f(g, rngFor(s.key)), s.glyph);
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
        const s = { id: `${id}:${key}`, key, concept, kind: 'picture', value: { word: concept, reading: w.ipa }, glyph: pic, from: null, loans: [], origin: `a picture of ${concept}` };
        signs.push(s); byGloss.set(concept, s); drawn += 1;
    }
    // 3. the words the language uses most that have no sign yet: borrowed or compounded
    const loaned = new Set(signs.flatMap((s) => s.loans || []));
    const formOf = (s) => readingOf(s.concept)?.form ?? null;
    const candidates = picturesOnly ? [] : state.entries
        .filter((e) => !e.retired && !e.paradigm && !e.sameWordAs && e.form?.length && !byGloss.has(e.gloss) && !loaned.has(e.gloss))
        .sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999))
        .filter((e, i, a) => a.findIndex((x) => x.gloss === e.gloss) === i);
    let made = 0;
    for (const e of candidates) {
        if (made >= grow) break;
        const hosts = signs.filter((s) => s.kind !== 'compound' || strokesOf(s.glyph) <= 9);
        const scored = hosts.map((s) => [soundLike(e.form, formOf(s)), s]).filter(([n]) => n > 0).sort((a, b) => b[0] - a[0] || strokesOf(a[1].glyph) - strokesOf(b[1].glyph));
        const best = scored[0];
        const radical = RADICAL[e.domain];
        if (LOANED.has(e.domain) || LOANED_POS.has(e.pos) || !radical) {
            // a grammar word borrows a sign that sounds like it (其, 之, 而)
            if (!best || best[0] < 2) continue;
            best[1].loans.push(e.gloss); loaned.add(e.gloss); made += 1;
            continue;
        }
        const rad = byGloss.get(radical);
        if (!rad || !best) continue;
        // the sound part is a sign of another class where one sounds as well (a sound part of the same class reads as a second meaning)
        const phon = scored.find(([n, s]) => n >= best[0] - 0.5 && s.concept !== radical && s.radical !== radical)?.[1] ?? best[1];
        const key = `${e.gloss.replace(/[^a-z]/g, '')}${signs.some((s) => s.key === e.gloss.replace(/[^a-z]/g, '')) ? `-${made}` : ''}`;
        const s = { id: `${id}:${key}`, key, concept: e.gloss, kind: 'compound', radical, phonetic: phon.concept, layout: TOP.has(radical) ? 'top' : 'left',
            value: { word: e.gloss, reading: e.ipa }, from: null, loans: [], origin: `${radical} for its meaning beside ${phon.concept} (${phon.value.reading}) for its sound` };
        s.glyph = compose(rad.glyph, phon.glyph, s.layout);   // for now; put together again from this stage's parts below
        signs.push(s); byGloss.set(e.gloss, s); made += 1;
    }
    // 4. the simplification: a compound's sound part swapped for the simplest sign that sounds as well; the simple signs cut to their fewest strokes
    if (simplified) {
        for (const s of signs) {
            if (s.kind === 'compound') {
                const now = byGloss.get(s.phonetic);
                const form = readingOf(s.concept)?.form;
                const was = soundLike(form, formOf(now));
                const simpler = signs.filter((x) => x.kind !== 'compound' && x.concept !== s.radical && x.concept !== s.concept && soundLike(form, formOf(x)) >= was)
                    .sort((a, b) => strokesOf(a.glyph) - strokesOf(b.glyph))[0];
                if (simpler && strokesOf(simpler.glyph) < strokesOf(now.glyph) - 1) { s.phonetic = simpler.concept; s.simplifiedFrom = now.concept; }
            } else s.glyph = simplify(s.glyph, rng, { maxStrokes: 5, keep: 0.8 });
        }
    }
    // 5. every compound put together from its parts of this stage
    const radForm = new Map();
    const radicalGlyph = (concept) => {
        if (!radForm.has(concept)) {
            const g = byGloss.get(concept).glyph;
            radForm.set(concept, radicalForms ? simplify(g, rng, { maxStrokes: 4, keep: 1, tolerance: 0.03 }) : g);
        }
        return radForm.get(concept);
    };
    const built = new Map();
    const glyphOf = (s, depth = 0) => {
        if (s.kind !== 'compound') return s.glyph;
        if (built.has(s.concept)) return built.get(s.concept);
        const ph = byGloss.get(s.phonetic);
        const g = compose(radicalGlyph(s.radical), depth > 3 || !ph ? glyph([{ pts: [[0.3, 0.5], [0.7, 0.5]] }]) : glyphOf(ph, depth + 1), s.layout);
        built.set(s.concept, g);
        return g;
    };
    for (const s of signs) if (s.kind === 'compound') s.glyph = glyphOf(s);
    const counts = { picture: signs.filter((s) => s.kind === 'picture').length, compound: signs.filter((s) => s.kind === 'compound').length, loans: signs.reduce((n, s) => n + (s.loans?.length || 0), 0) };
    return { id, name, year, language: state.langId, type, direction, ductus, signs, parent: parent?.id ?? null, invented: !parent, logographic: true, counts, changes: [] };
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
    return { id, name, year, language: state.langId, type: 'logographic', direction, ductus, signs, parent: donor.id, invented: false, logographic: true, changes: [] };
}

export { strokeLength };
