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

/**
 * Whether the verb tells its persons apart, and whether well enough to name
 * its subject: three persons in four told apart. One too worn to (German
 * spiele, spielst, spielt, spielen; English -s alone) leaves the pronoun to
 * say who, and WALS counts such a language as one of obligatory pronouns
 * (101A: German, French, English), as Taraldsen's rich agreement predicts;
 * Spanish and Italian, which drop their pronouns, tell all six apart. The
 * agreement cycle (morphology/pronouns.js) starts where it is not rich.
 */
export function subjectAgreement(state) {
    const v = mainClass(state, 'v');
    const prs = Object.entries(v?.c.cells || {}).filter(([k]) => slotOf(k) === 'PRS' && !k.includes('>')).map(([, x]) => key(x.form));
    const distinct = new Set(prs).size;
    return { subject: !!v && distinct > 1, rich: !!v && distinct > 1 && distinct >= 0.75 * prs.length };
}

/** Values of tense (the rest of the non-mood slots are aspects: PRF, PFV, PROG). */
const TENSE_SLOTS = new Set(['PST', 'REM', 'FUT']);

/** The categories one verb form carries (WALS 22A, the engine's coarser set). */
export function verbSynthesis(state) {
    const cats = state.paradigm?.categories || {};
    const syntax = state.syntax || {};
    const v = mainClass(state, 'v');
    let n = 0;
    if (v) {
        const cells = v.c.cells;
        const forms = (pred) => new Set(Object.entries(cells).filter(([k]) => pred(k)).map(([, x]) => key(x.form)));
        /**
         * Tense and aspect, one category each, however many values (Bickel
         * and Nichols count categories, not their values): a past, a remote
         * past and a future are one category, tense; a perfect, completive or
         * progressive another, aspect. Counted per slot, the remote past made
         * a third of Andah polysynthetic against Earth's fifth.
         */
        const formOfSlot = (s) => key(cells[`${s}.3SG`]?.form ?? Object.entries(cells).find(([k]) => slotOf(k) === s)?.[1]?.form);
        const prs = formOfSlot('PRS');
        const slots = [...new Set(Object.keys(cells).filter((k) => !isMoodCell(k)).map(slotOf))].filter((s) => s !== 'PRS');
        const differs = (s) => formOfSlot(s) !== prs;
        if (slots.some((s) => TENSE_SLOTS.has(s) && differs(s))) n += 1;
        if (slots.some((s) => !TENSE_SLOTS.has(s) && differs(s))) n += 1;
        // subject agreement
        if (forms((k) => slotOf(k) === 'PRS' && !k.includes('>')).size > 1) n += 1;
        // object agreement
        if (Object.keys(cells).some((k) => k.includes('>'))) n += 1;
        // mood, once, as WALS counts a category (a command form or an irrealis):
        // counted per form, mood and evidentiality each scored twice, and with
        // object agreement common 40% of Andah came out polysynthetic (WALS 21%)
        if ((cells['IMP.2SG'] && key(cells['IMP.2SG'].form) !== key(cells['PRS.2SG']?.form))
            || Object.keys(cells).some((k) => slotOf(k) === 'IRR')) n += 1;
    }
    // affixes on the verb that are not paradigm cells
    if (syntax.negation === 'prefix' || syntax.negation === 'suffix') n += 1;
    if (syntax.polar === 'verb-suffix') n += 1;
    // evidentiality, once: a non-firsthand tense or an evidential affix
    const ev = cats.evidentials?.terms || {};
    if (Object.keys(v?.c.cells || {}).some((k) => slotOf(k) === 'NFH') || Object.values(ev).some((t) => t.coding === 'affix')) n += 1;
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

/**
 * Where an affix sits, read off a form against what it was built on: after
 * it (the form starts with the base), before it (ends with it), or neither
 * (the base itself changed).
 */
function sideOf(base, form) {
    if (!base?.length || !form?.length || key(base) === key(form)) return null;
    let p = 0;
    while (p < base.length && p < form.length && base[p].ipa === form[p].ipa) p += 1;
    let s = 0;
    while (s < base.length && s < form.length && base[base.length - 1 - s].ipa === form[form.length - 1 - s].ipa) s += 1;
    if (p >= s && p >= Math.ceil(base.length / 2)) return 'suffix';
    if (s > p && s >= Math.ceil(base.length / 2)) return 'prefix';
    return null;
}

/**
 * The morphology chapters of WALS the paradigms answer (18 Oct 2026): 26A
 * prefixing against suffixing, 66A the past tense, 67A the future, 69A where
 * tense and aspect affixes go, 101A how a subject is expressed, 102A whose
 * person the verb marks.
 */
export function morphologyChapters(state) {
    const cats = state.paradigm?.categories || {};
    const v = mainClass(state, 'v'), n = mainClass(state, 'n');

    // the tense slots that are forms of their own, against the present
    const cells = v?.c.cells || {};
    // a tense against the present OF THE SAME PERSON: two persons differ in front where persons are prefixes
    const pairOf = (slot) => {
        for (const p of ['3SG', '1SG', '2SG', '1PL', '2PL', '3PL']) {
            const a = cells[`PRS.${p}`]?.form, b = cells[`${slot}.${p}`]?.form;
            if (a && b) return [a, b];
        }
        return null;
    };
    const slots = [...new Set(Object.keys(cells).filter((k) => !isMoodCell(k) && !k.includes('>')).map(slotOf))].filter((s) => s !== 'PRS');
    const distinct = (s) => { const pr = pairOf(s); return !!pr && key(pr[0]) !== key(pr[1]); };
    const tenseSides = new Set(slots.filter(distinct).map((s) => sideOf(...pairOf(s))).filter(Boolean));
    const pasts = ['PST', 'REM'].filter((s) => slots.includes(s) && distinct(s));
    const tensePosition = !tenseSides.size ? 'none' : tenseSides.size > 1 ? 'mixed' : tenseSides.has('prefix') ? 'prefixes' : 'suffixes';

    const { subject, rich } = subjectAgreement(state);
    // subject pronouns turned clitics (morphology/pronouns.js): after the first word of the clause
    // (WALS 101A's clitics on a variable host), or with the tense word before the verb (another position)
    const clitic = cats.pronouns?.subject?.stage === 'clitic' ? cats.pronouns.subject.host : null;
    const absolutive = cats.agreement === 'absolutive';
    const object = !!v && Object.keys(cells).some((k) => k.includes('>'));
    return {
        affixation: affixationOf(state, v, n, tenseSides),
        // a remote past apart from the recent one as well as from the present (66A's 2-3 degrees)
        pastTense: !pasts.length ? 'no past tense'
            : pasts.length === 2 && pairOf('PST') && pairOf('REM') && key(pairOf('PST')[1]) !== key(pairOf('REM')[1]) ? 'present, 2-3 remoteness distinctions'
                : 'present, no remoteness distinctions',
        futureTense: slots.includes('FUT') && distinct('FUT') ? 'inflectional future' : 'no inflectional future',
        tensePosition,
        // a verb agreeing with the absolutive names an intransitive subject and not a transitive one: WALS 101A's "mixed"
        subjectExpression: clitic === 'second' ? 'subject clitics' : clitic === 'aux' ? 'pronouns in another position'
            : rich ? (absolutive ? 'mixed' : 'subject affixes on verb') : subject || cats.type !== 'isolating' || clitic ? 'obligatory pronouns' : 'optional pronouns',
        personMarking: subject && object ? 'both A and P' : subject ? (absolutive ? 'only the P argument' : 'only the A argument') : object ? 'only the P argument' : 'no person marking',
    };
}

/**
 * WALS 26A as Dryer computed it (19 Oct 2026): not a count of paradigm cells
 * but of the KINDS of inflection a language has and which side each is on.
 * Case, subject person and tense-aspect weigh 2, the rest 1 (plural, object
 * person, a definite affix, a negative, a question affix; possessive and
 * subordinator affixes are not modelled), and a kind with no dominant side
 * gives half to each side. An affixing index of 2 or less is little
 * affixation. Counted by cells, a Dahen-Kino language whose one inflection
 * was a tense prefix grown from an auxiliary read as strongly prefixing, and
 * 36 object-agreement cells outweighed all else a language had.
 */
function affixationOf(state, v, n, tenseSides) {
    const syntax = state.syntax || {};
    let pre = 0, suf = 0;
    const add = (w, side) => {
        if (side === 'prefix') pre += w;
        else if (side === 'suffix') suf += w;
        else if (side === 'mixed') { pre += w / 2; suf += w / 2; }
    };
    const real = (pairs) => pairs.filter(([a, b]) => a?.length && b?.length && key(a) !== key(b));
    // the side a kind's forms differ on: one side for three pairs in four, else neither dominant
    // (a kind marked only by a changed stem is not affixation, and scores nothing)
    const sideAmong = (pairs) => {
        const s = real(pairs).map(([a, b]) => sideOf(a, b)).filter(Boolean);
        if (!s.length) return null;
        const p = s.filter((x) => x === 'prefix').length / s.length;
        return p >= 0.75 ? 'prefix' : p <= 0.25 ? 'suffix' : 'mixed';
    };
    if (n) {
        const nc = n.c.cells;
        const keys = Object.keys(nc).filter((k) => !isMoodCell(k));
        const cases = [...new Set(keys.map((k) => k.split('.')[0]))].filter((c) => c !== 'DEF');
        const nums = [...new Set(keys.map((k) => k.split('.')[1]))];
        const f = (c, x) => nc[`${c}.${x}`]?.form;
        add(2, sideAmong(cases.slice(1).map((c) => [f(cases[0], nums[0]), f(c, nums[0])])));
        add(1, sideAmong(nums.slice(1).map((x) => [f(cases[0], nums[0]), f(cases[0], x)])));
        add(1, sideAmong(nums.map((x) => [f(cases[0], x), f('DEF', x)])));
    }
    if (v) {
        const vc = v.c.cells;
        const prs = Object.keys(vc).filter((k) => slotOf(k) === 'PRS' && !k.includes('>'));
        add(2, sideAmong(prs.slice(1).map((k) => [vc[prs[0]].form, vc[k].form])));
        if (tenseSides.size) add(2, tenseSides.size > 1 ? 'mixed' : [...tenseSides][0]);
        // the object: one subject's forms with different objects
        const trans = Object.keys(vc).filter((k) => slotOf(k) === 'PRS' && k.includes('>'));
        const bySubject = new Map();
        for (const k of trans) { const s = k.split('.')[1].split('>')[0]; if (!bySubject.has(s)) bySubject.set(s, []); bySubject.get(s).push(k); }
        add(1, sideAmong([...bySubject.values()].flatMap((ks) => ks.slice(1).map((k) => [vc[ks[0]].form, vc[k].form]))));
    }
    if (syntax.negation === 'prefix' || syntax.negation === 'suffix') add(1, syntax.negation);
    if (syntax.polar === 'verb-suffix') add(1, 'suffix');
    const total = pre + suf;
    if (total <= 2) return 'little affixation';
    return suf / total > 0.8 ? 'strongly suffixing' : suf / total > 0.6 ? 'weakly suffixing'
        : pre / total > 0.8 ? 'strongly prefixing' : pre / total > 0.6 ? 'weakly prefixing' : 'equal prefixing and suffixing';
}

/** The type WALS would give the language (build-earth.js morphologyOf, read the same way). */
export function morphologyValue(state) {
    const s = verbSynthesis(state);
    if (s <= 1) return 'isolating';
    if (s >= 6) return 'polysynthetic';
    return cumulativeExponence(state) ? 'fusional' : 'agglutinative';
}
