/**
 * A language's morphological type, measured from what it now is (17 Oct
 * 2026, DJ chose "sound systems" next; this is the first part).
 *
 * WALS has no "morphological type" chapter; the Earth side of the typology
 * maps derives it from three (scripts/build-earth.js morphologyOf): fusion
 * (20A: an isolating language strings free words), exponence (21A: whether
 * one ending carries case and number together, as Latin -īs does, or each
 * its own, as Turkish ev-ler-i does) and the verb's inflectional synthesis
 * (22A: how many categories one verb form carries, 0-1 for Mandarin, 8 and
 * more for Mohawk). Until now Andah's languages were scored by the type their
 * family was founded with, so a daughter that had lost every ending, as
 * English has, still counted as fusional, and one whose stacked suffixes had
 * worn into portmanteaux still counted as agglutinative. This reads the same
 * three things off each language's own paradigm, the same way:
 *
 *   isolating      the verb carries at most one category (WALS 22A: 1)
 *   polysynthetic  it carries six or more of the engine's categories, which
 *                  are coarser than WALS's (tense and aspect count at most
 *                  two, no voice or separate number agreement): WALS counts
 *                  8-9 and up on its finer list (Quechua and Georgian 8-9,
 *                  Turkish 6-7)
 *   fusional       case and number share an ending (WALS 21A: case +
 *                  number); a language with no case is not, as English
 *                  is not (WALS 21A: no case)
 *   agglutinative  the rest: one ending, one meaning
 */

import { wordToIpaStressed } from '../features.js';
import { isIrregularClass, isMoodCell, slotOf, stemTail } from './paradigm.js';

const key = (f) => (f ? wordToIpaStressed(f) : '');

/** The largest regular class of a part of speech, with its exemplar's stem. */
function mainClass(state, pos) {
    let best = null;
    for (const [cls, c] of Object.entries(state.paradigm?.classes || {})) {
        if (c.pos !== pos || isIrregularClass(cls) || !Object.keys(c.cells || {}).length) continue;
        if (!best || (c.members ?? 0) > (best.c.members ?? 0)) best = { cls, c };
    }
    if (!best) return null;
    const stem = (state.entries || []).find((e) => e.id === best.c.exemplarId)?.form || null;
    return stem ? { ...best, stem } : null;
}

/** The categories one verb form carries (WALS 22A, the engine's coarser set). */
export function verbSynthesis(state) {
    const cats = state.paradigm?.categories || {};
    const syntax = state.syntax || {};
    const v = mainClass(state, 'v');
    let n = 0;
    if (v) {
        const cells = v.c.cells;
        const forms = (pred) => new Set(Object.entries(cells).filter(([k]) => pred(k)).map(([, x]) => key(x.form)));
        // tense and aspect: distinct forms across the tense slots, one category per extra slot that still differs
        const slots = [...new Set(Object.keys(cells).filter((k) => !isMoodCell(k)).map(slotOf))];
        const bySlot = slots.map((s) => key(cells[`${s}.3SG`]?.form ?? Object.entries(cells).find(([k]) => slotOf(k) === s)?.[1]?.form));
        const distinctTenses = new Set(bySlot).size;
        n += Math.min(2, Math.max(0, distinctTenses - 1));
        // subject agreement
        if (forms((k) => slotOf(k) === 'PRS' && !k.includes('>')).size > 1) n += 1;
        // object agreement
        if (Object.keys(cells).some((k) => k.includes('>'))) n += 1;
        // moods of the verb's own
        if (cells['IMP.2SG'] && key(cells['IMP.2SG'].form) !== key(cells['PRS.2SG']?.form)) n += 1;
        if (Object.keys(cells).some((k) => slotOf(k) === 'IRR')) n += 1;
        if (Object.keys(cells).some((k) => slotOf(k) === 'NFH')) n += 1;
    }
    // affixes on the verb that are not paradigm cells
    if (syntax.negation === 'prefix' || syntax.negation === 'suffix') n += 1;
    if (syntax.polar === 'verb-suffix') n += 1;
    const ev = cats.evidentials?.terms || {};
    if (Object.values(ev).some((t) => t.coding === 'affix')) n += 1;
    if ((state.entries || []).some((e) => e.compoundOf?.incorporated && !e.retired)) n += 1;
    return n;
}

/**
 * Cumulative exponence (WALS 21A): does one ending carry two categories at
 * once? Read on the nouns (case with number) where they decline, else on the
 * verbs (tense with person): agglutinative where the second category's marker
 * is the same in every cell, fusional where it is not.
 */
export function cumulativeExponence(state) {
    const check = (m, a, b) => {
        // a = the category whose marker should be constant (number, tense); b = the other
        if (!m) return null;
        const cells = m.c.cells;
        const tails = {};
        for (const [k, x] of Object.entries(cells)) {
            if (isMoodCell(k) || k.includes('>')) continue;
            tails[k] = stemTail(m.stem, x.form || []).map((p) => p.ipa).join('');
        }
        const parts = Object.keys(tails).map((k) => k.split('.'));
        const aVals = [...new Set(parts.map((p) => p[a]))], bVals = [...new Set(parts.map((p) => p[b]))];
        if (aVals.length < 2 || bVals.length < 2) return null;
        // for each value of the a-category, is there one marker added to every b-cell?
        let separable = 0, total = 0;
        const base = aVals[0];
        for (const av of aVals.slice(1)) {
            const diffs = new Map();
            for (const bv of bVals) {
                const cellOf = (x) => (a === 0 ? `${x}.${bv}` : `${bv}.${x}`);
                const t0 = tails[cellOf(base)], t1 = tails[cellOf(av)];
                if (t0 == null || t1 == null) continue;
                total += 1;
                // the marker of av is what t1 adds to or puts in place of t0's material: read it as the
                // difference once the shared ending (b's marker) is taken off the end
                let i = 0;
                while (i < t0.length && i < t1.length && t0[t0.length - 1 - i] === t1[t1.length - 1 - i]) i += 1;
                const d = `${t0.slice(0, t0.length - i)}>${t1.slice(0, t1.length - i)}`;
                diffs.set(d, (diffs.get(d) || 0) + 1);
            }
            // one marker in most cells: the odd cell is a repair at the join, not a fused ending
            separable += Math.max(0, ...diffs.values());
        }
        return total ? separable / total < 0.5 : null;
    };
    const n = mainClass(state, 'n');
    // nominal cells are CASE.NUMBER: number (index 1) should carry one marker across the cases (index 0).
    // WALS 21A is about case only: a language with no case is not cumulative, as English is not.
    return n ? !!check(n, 1, 0) : false;
}

/** The type WALS would give the language (build-earth.js morphologyOf, read the same way). */
export function morphologyValue(state) {
    const s = verbSynthesis(state);
    if (s <= 1) return 'isolating';
    if (s >= 6) return 'polysynthetic';
    return cumulativeExponence(state) ? 'fusional' : 'agglutinative';
}
