/**
 * DJ's own hand in the scripts (docs/writing-systems-plan.md, step 6: "your
 * tools"). A sign he draws, or a hand he picks from the pick-one sheet, is
 * kept in data/scripts-own.json and always wins: over the engine, and over
 * the lock (data/scripts-lock.json), which only freezes what the engine drew.
 *
 * A sign is known by what it writes (`lockKey`), as the lock knows it, since
 * its id shifts when a language gains or loses a sound. The same helpers run
 * in the browser (the editor and the pick-one sheet) and in Node
 * (scripts/build-scripts.js, scripts/lock-scripts.js, server.js), so the two
 * sides always agree on which sign is which.
 */

import { applyStyle, finish } from './evolve.js';
import { bbox } from './strokes.js';

/** What a sign writes, as its key in the lock and in DJ's own file. */
export const lockKey = (sign) => {
    const v = sign.value || {};
    return v.sound != null ? `s:${v.sound}` : v.syllable != null ? `y:${v.syllable}` : v.word != null ? `w:${v.word}` : v.mark != null ? `m:${v.mark}` : `i:${sign.id}`;
};

/** Every sign of a stage with its key; a second sign writing the same thing is told apart by its id, as the lock does. */
export function stageKeys(signs) {
    const seen = new Set(), out = new Map();
    for (const x of signs) {
        let k = lockKey(x);
        if (seen.has(k)) k = `${k}#${x.id}`;
        seen.add(k);
        out.set(x.id, k);
    }
    return out;
}

/**
 * The signs that came down from one sign: every later stage's sign whose
 * line of descent (`from`, stage by stage up `parent`) reaches it. These are
 * what the engine redraws when DJ carries a drawing down.
 */
export function descendantsOf(stages, stageId, signId) {
    const byId = new Map(stages.map((s) => [s.id, s]));
    const out = [];
    const walk = (parentId, fromIds) => {
        for (const st of stages) {
            if (st.parent !== parentId) continue;
            const keys = stageKeys(st.signs);
            const mine = st.signs.filter((x) => fromIds.has(x.from));
            // a letter split off one of them in the same stage (a new sound's letter made from an old one) came from it too
            const split = new Set(mine.map((x) => x.id));
            mine.push(...st.signs.filter((x) => x.splitFrom && split.has(x.splitFrom) && !split.has(x.id)));
            for (const x of mine) out.push({ stage: st.id, sign: x.id, key: keys.get(x.id) });
            if (mine.length) walk(st.id, new Set(mine.map((x) => x.id)));
        }
    };
    if (byId.has(stageId)) walk(stageId, new Set([signId]));
    return out;
}

/** Every stage below one, nearest first. */
export function stagesBelow(stages, stageId) {
    const out = [];
    const walk = (id) => { for (const st of stages) if (st.parent === id) { out.push(st); walk(st.id); } };
    walk(stageId);
    return out;
}

/** The body of a glyph: its own strokes, not the dots that tell it from a twin nor a headline. */
const bodyBox = (g) => bbox({ strokes: g.strokes.filter((t) => !t.mark && !t.headline) });

/**
 * A glyph moved from one hand to another (evolve.js applyStyle), kept in its
 * place on the line: the letter keeps its height and its centre, so a short
 * letter stays short and a descender still descends, and only its width,
 * lean, roundness and headline change. A printed face stands upright and
 * gets the type designer's pass (evolve.js finish), as the build gives it.
 */
export function restyle(g, from, to, { typed = false } = {}) {
    if (!g?.strokes?.length) return g;
    const target = typed ? { ...to, slant: 0 } : to;
    const before = bodyBox(g);
    let out = applyStyle(g, target, from);
    const after = bodyBox(out);
    if (after.h > 0.02 && before.h > 0.02) {
        const k = before.h / after.h;
        const cx0 = (after.x0 + after.x1) / 2, cx1 = (before.x0 + before.x1) / 2;
        out = { strokes: out.strokes.map((t) => (t.headline ? t : { ...t, pts: t.pts.map(([x, y]) => [cx1 + (x - cx0) * k, before.y0 + (y - after.y0) * k]) })) };
    }
    if (typed) out = finish(out);
    return out;
}

/** How one hand differs from another, in words (as the build names a new hand). */
export function handWords(st, ps = { aspect: 1, slant: 0, round: 0, headline: false }) {
    return [st.aspect > ps.aspect + 0.08 ? 'wider' : st.aspect < ps.aspect - 0.08 ? 'narrower' : null,
        st.slant > ps.slant + 0.03 ? 'leaning more' : st.slant < ps.slant - 0.03 ? 'more upright' : null,
        st.round > ps.round + 0.25 ? 'rounder' : st.round < ps.round - 0.25 ? 'more angular' : null,
        st.headline && !ps.headline ? 'hung from a line' : !st.headline && ps.headline ? 'cut loose from the line' : null].filter(Boolean);
}

/** The change a stage records when DJ picked its hand (the build and scripts/patch-own.js both write it). */
export const OWN_CHANGE = (year) => ({ year, kind: 'own hand', note: 'the hand DJ picked from the pick-one sheet', analogue: 'a type designer or a scribal school choosing a house style' });

/** Strokes to two places, as data/scripts.json keeps them. */
export const round2 = (strokes) => strokes.map((t) => ({ ...t, pts: t.pts.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]) }));
