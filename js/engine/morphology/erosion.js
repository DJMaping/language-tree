/**
 * Erosion: watching a paradigm collapse, and naming what did it.
 *
 * This is the payoff of the whole morphology layer. Nobody writes a rule that
 * merges the accusative with the dative. What happens is that a sound change
 * eats unstressed final syllables, two endings that used to differ stop
 * differing, and the language quietly has one fewer case than it did.
 *
 * Latin had six cases. Old French had two. Modern French has none, and marks
 * the same relations with word order and prepositions instead. Nothing in that
 * sequence was a decision about grammar; it was phonology, and grammar was
 * downstream of it. Old English's five went to Modern English's two; Proto-
 * Germanic's eight went to German's four.
 *
 * So this module does not *cause* anything. It observes the lexicon after the
 * sound changes have run and reports what they cost.
 *
 * ## Two kinds of collapse, which must not be confused
 *
 *   PHONOLOGICAL SYNCRETISM  two cells became homophonous because a sound
 *                            change made them so. Falls out automatically.
 *   ANALOGICAL LEVELLING     speakers replaced one form with another because
 *                            the pattern was irregular. Does NOT fall out of
 *                            the phonology — it is a separate event with a
 *                            different signature.
 *
 * Both are now modelled — `analogy.js` supplies the second — and this module
 * keeps them apart. Every step in a derivation history carries the category of
 * the change that made it, so a merger can be attributed to the right KIND of
 * event, and the report says which. Reporting a levelling as a sound change
 * would be a lie about where the change came from, and the distinction is the
 * whole reason the module was written this way.
 */

import { isParadigmEntry, parseCellId } from './paradigm.js';

/**
 * Find the cells that have fallen together, in each class.
 *
 * A merger is reported per CLASS, not per language, because that is how
 * syncretism actually works: Latin's dative and ablative merge in the first
 * declension (*puellae* is both) and stay distinct in the second (*servō* vs
 * *servō* — well, those merged too, which is rather the point). A language does
 * not lose a case all at once; it loses it one declension at a time.
 */
export function findSyncretism(paradigm) {
    if (!paradigm?.classes) return [];
    const out = [];
    for (const [cls, c] of Object.entries(paradigm.classes)) {
        const byForm = new Map();
        for (const [cell, v] of Object.entries(c.cells || {})) {
            // Stress-aware: two cells are homophonous only if they sound the
            // same, and stress is part of that.
            const k = v.key ?? v.ipa;
            if (!byForm.has(k)) byForm.set(k, []);
            byForm.get(k).push(cell);
        }
        for (const [key, cells] of byForm) {
            if (cells.length > 1) out.push({ cls, ipa: key, cells: cells.slice().sort() });
        }
    }
    return out;
}

/**
 * Attribute a merger to the sound change that caused it.
 *
 * Both cells carry a full derivation history — every (rule, before, after) step
 * since the proto. Walk the two histories in step and find the first point at
 * which their forms coincide. The rule that applied at that point is the one
 * that destroyed the contrast.
 *
 * If they were already identical at the proto stage, the distinction was never
 * made in the first place, which is a different fact and is reported as such.
 */
export function attributeMerger(histories, cellIdA, cellIdB) {
    const a = histories.get(cellIdA);
    const b = histories.get(cellIdB);
    if (!a || !b) return null;
    if (a.protoForm === b.protoForm) {
        return { cause: 'never-distinct', note: 'these cells were identical in the proto-language — the distinction was never made' };
    }

    const stepsA = a.steps.filter((s) => s.applied);
    const stepsB = b.steps.filter((s) => s.applied);

    // Forms after each step, including the starting point.
    const seqA = [a.protoForm, ...stepsA.map((s) => s.to)];
    const seqB = [b.protoForm, ...stepsB.map((s) => s.to)];

    // Walk forward to the first index at which they agree. The two histories can
    // be different lengths — a rule that touched one cell need not have touched
    // the other — so compare on the running form, not on step count.
    let i = 0, j = 0;
    while (i < seqA.length && j < seqB.length) {
        if (seqA[i] === seqB[j]) {
            // Whichever side moved last is the one that closed the gap.
            const lastA = i > 0 ? stepsA[i - 1] : null;
            const lastB = j > 0 ? stepsB[j - 1] : null;
            const culprit = pickLater(lastA, lastB);
            if (!culprit) return { cause: 'never-distinct', note: 'identical from the start' };
            const analogical = culprit.category === 'analogy';
            return {
                cause: analogical ? 'analogy' : 'sound-change',
                ruleId: culprit.ruleId, label: culprit.label, year: culprit.year, stageId: culprit.stageId,
                note: analogical
                    ? `${culprit.label} — speakers levelled the distinction away, not a sound change`
                    : `${culprit.label} made them homophonous`,
            };
        }
        // Advance whichever side is behind in time; if unknown, advance both.
        const ya = i < stepsA.length ? (stepsA[i]?.year ?? Infinity) : Infinity;
        const yb = j < stepsB.length ? (stepsB[j]?.year ?? Infinity) : Infinity;
        if (ya <= yb) i += 1; else j += 1;
        if (ya === Infinity && yb === Infinity) break;
    }
    return { cause: 'unknown', note: 'the two forms coincide but no single change accounts for it' };
}

function pickLater(a, b) {
    if (!a) return b;
    if (!b) return a;
    return (a.year ?? -Infinity) >= (b.year ?? -Infinity) ? a : b;
}

/**
 * Confirm a merger against real class members, not just the exemplar.
 *
 * The known weakness of inflecting one specimen per class: a class holding both
 * short and long stems will not erode uniformly under a stress rule that counts
 * from the end of the word. So before reporting that a class has lost a
 * distinction, re-inflect a sample of its actual members and check the merger
 * holds for them too.
 *
 * `inflect` is supplied by the caller because building an inflected form needs
 * the phonotactics and the stage's rules; this module stays observational.
 */
export function confirmAcrossClass(merger, entries, inflect, sampleSize = 8) {
    if (!inflect) return { confirmed: null, checked: 0 };
    const members = entries.filter((e) => e.class === merger.cls && !isParadigmEntry(e) && !e.derivedFrom);
    if (members.length <= 1) return { confirmed: true, checked: members.length };

    const step = Math.max(1, Math.floor(members.length / sampleSize));
    let checked = 0, held = 0;
    for (let i = 0; i < members.length && checked < sampleSize; i += step) {
        const forms = merger.cells.map((cell) => inflect(members[i], merger.cls, cell));
        if (forms.some((f) => f == null)) continue;
        checked += 1;
        if (new Set(forms).size === 1) held += 1;
    }
    return { confirmed: checked > 0 && held === checked, checked, held };
}

/**
 * The headline number: how much inflection is left.
 *
 * Counts DISTINCT forms against cells, averaged over classes. 1.0 means every
 * cell is still distinct; as endings fall together it drops, and at the floor
 * the language marks nothing on the word at all.
 *
 * This is the measure to track across all six families — a change that quietly
 * destroys everyone's morphology shows up here as a fall in every row.
 */
export function inflectionalSurvival(paradigm) {
    if (!paradigm?.classes) return { survival: null, classes: 0 };
    let cells = 0, distinct = 0, classes = 0, dropped = 0;
    for (const c of Object.values(paradigm.classes)) {
        const names = Object.keys(c.cells || {});
        // An EMPTY class is not an absent one. It marks nothing, which is the
        // most complete loss there is, and it must stay in the denominator or
        // losing everything would score better than losing most of it.
        if (!names.length && !c.baseCells) continue;
        classes += 1;
        /**
         * The denominator is the class's ORIGINAL cell count, not its current
         * one. A language that drops a slot which had stopped marking anything
         * has less inflection than before; measured against the cells it still
         * has, it would score as having more, because the syncretic cell it
         * deleted was the thing dragging the ratio down.
         */
        const base = c.baseCells ?? names.length;
        cells += base;
        dropped += Math.max(0, base - names.length);
        distinct += new Set(names.map((n) => c.cells[n].key ?? c.cells[n].ipa)).size;
    }
    return { survival: cells ? distinct / cells : null, cells, distinct, classes, dropped };
}

/**
 * The full report for one stage: what merged, what caused it, what is left.
 */
export function erosionReport(paradigm, histories, parentParadigm) {
    const mergers = findSyncretism(paradigm).map((m) => {
        const [a, b] = m.cells;
        const cause = attributeMerger(histories, cellId(m.cls, a), cellId(m.cls, b));
        return { ...m, ...(cause || {}) };
    });

    // Which mergers are NEW at this stage — the ones worth announcing.
    const before = parentParadigm ? new Set(findSyncretism(parentParadigm).map((m) => `${m.cls}|${m.cells.join('+')}`)) : new Set();
    for (const m of mergers) m.isNew = !before.has(`${m.cls}|${m.cells.join('+')}`);

    const survival = inflectionalSurvival(paradigm);
    const parentSurvival = parentParadigm ? inflectionalSurvival(parentParadigm) : null;

    return {
        mergers,
        newMergers: mergers.filter((m) => m.isNew),
        ...survival,
        lostSinceParent: parentSurvival && survival.survival != null && parentSurvival.survival != null
            ? +(parentSurvival.survival - survival.survival).toFixed(3) : null,
    };
}

const cellId = (cls, cell) => `para:${cls}:${cell}`;

/** Human-readable summary for the CLI. */
export function formatErosion(report, paradigm) {
    const L = [];
    if (report.survival == null) return '(no inflectional morphology)';
    L.push(`Inflection retained: ${(report.survival * 100).toFixed(0)}%  (${report.distinct}/${report.cells} cells distinct across ${report.classes} classes)`);
    if (report.lostSinceParent) L.push(`Lost since the parent stage: ${(report.lostSinceParent * 100).toFixed(0)} percentage points`);
    if (!report.mergers.length) { L.push('No syncretism yet — every cell is still distinct.'); return L.join('\n'); }

    L.push('');
    L.push('Syncretism:');
    for (const m of report.mergers.slice(0, 14)) {
        L.push(`  ${m.cls}  ${m.cells.join(' = ')}   /${m.ipa}/${m.isNew ? '   ← new here' : ''}`);
        if (m.cause === 'sound-change') L.push(`      caused by: ${m.label}${m.year != null ? ` (c. ${m.year})` : ''}`);
        else if (m.cause === 'analogy') L.push(`      levelled by speakers: ${m.label}${m.year != null ? ` (c. ${m.year})` : ''}`);
        else if (m.note) L.push(`      ${m.note}`);
    }
    const byAnalogy = report.mergers.filter((m) => m.cause === 'analogy').length;
    if (byAnalogy) L.push(`\n  ${byAnalogy} of ${report.mergers.length} mergers are analogical rather than phonological.`);
    if (report.mergers.length > 14) L.push(`  …and ${report.mergers.length - 14} more`);
    return L.join('\n');
}
