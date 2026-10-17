/**
 * Analogical levelling — the other half of how morphology dies.
 *
 * ## Why this exists
 *
 * `erosion.js` observes paradigms falling apart under sound change and is
 * careful, in its own comments, to label what it finds as PHONOLOGICAL
 * syncretism — because the other kind was not modelled and claiming it would
 * have been a lie about where the change came from. This is the other kind.
 *
 * The measured consequence of its absence was stark. Morphological erosion ran
 * at 3.7 to 11.4 points per millennium across the six families. Latin to French
 * is about 55; Old English to Modern English about 80. The engine had no fast
 * tail at all, and the reason is that phonology on its own is slow: it merges
 * one ending with another in one declension at a time, and a language can lose
 * endings that way for four thousand years and still have a case system.
 *
 * What actually kills a case system is speakers. Sound change merges the dative
 * and the ablative in one declension; speakers then generalise that merger to
 * the other four, because maintaining a distinction that only survives in a
 * minority of nouns is not worth the trouble. Latin's six cases did not decay
 * gently to five and a half. They went to two, and then to none.
 *
 * ## Three mechanisms, in ascending order of destructiveness
 *
 *   STEM LEVELLING       A sound change conditioned by what follows alters the
 *                        stem in some cells and not others, and the paradigm
 *                        acquires an alternation. Speakers extend the dominant
 *                        variant across the whole table. Old English
 *                        *ceosan/curon* (Verner's alternation) was levelled to
 *                        *choose/chose*; almost every English strong verb was
 *                        levelled the same way, and the survivors — *be, go,
 *                        see* — are the high-frequency ones.
 *
 *   CLASS ABSORPTION     A small inflection class adopts a large one's endings.
 *                        Old English had several plural declensions; the *-s* of
 *                        one of them spread to almost every noun, leaving
 *                        *children*, *oxen* and *feet* as the residue. This is
 *                        why irregular plurals are always common words.
 *
 *   SYNCRETISM EXTENSION A merger that holds in most classes is generalised to
 *                        the rest, and the distinction is gone from the language
 *                        rather than from one declension. This is the one that
 *                        collapses case systems, and it is the accelerator the
 *                        erosion measurement was missing.
 *
 * ## What this must NOT be
 *
 * Analogy is not tidiness. It is not a pass that makes paradigm tables prettier,
 * and a levelling implementation that only ever restores regularity is a script
 * with a linguistic name on it. Every mechanism here is able to DESTROY a
 * contrast — stem levelling can make two cells identical that were distinct,
 * and syncretism extension does nothing else. That is the point: analogy
 * removes irregularity, and distinctions are frequently what the irregularity
 * was carrying.
 *
 * ## Frequency is the only thing that resists
 *
 * Not markedness, not "importance", not a hand-kept exception list. High
 * frequency, and nothing else, is why *be/was/were* stayed suppletive while a
 * thousand rarer strong verbs quietly regularised: every speaker hears the
 * irregular form constantly, so it is never reconstructed from the pattern. The
 * engine already has `zipfWeight(rank)` and already uses it for exactly this
 * argument in `replacement.js`.
 */

import { wordToIpa, wordToIpaStressed } from '../features.js';
import { zipfWeight } from '../rng.js';
import { evolveLexicon } from '../soundchange/apply.js';
import { isParadigmEntry, parseCellId, isMoodCellEntry } from './paradigm.js';
import { pushStep } from '../lexicon/etymology.js';

/**
 * How readily a class gives up an irregularity, given how common its lexemes
 * are.
 *
 * `zipfWeight` is near 0.27 at rank 1 and falls away fast, so the top of the
 * lexicon is almost immune and the tail is almost defenceless — which is the
 * observed distribution rather than a chosen one.
 */
function resistance(rank) {
    return Math.min(0.95, zipfWeight(rank) * 3.0);
}

/**
 * Base likelihood that a given candidate levelling happens on this edge.
 *
 * Super-linear in the branch rate, and that exponent is the whole point. Earth
 * has both extremes at once — Icelandic barely moved in a thousand years while
 * English was demolished over the same span, and both are Germanic. A rate that
 * entered linearly would shift every family's mean together and still leave no
 * fast tail, which is precisely what the erosion measurement kept showing.
 *
 * Levelling is also self-reinforcing in a way sound change is not: a community
 * that has already regularised half its paradigms has a stronger productive
 * pattern to regularise the rest towards. Raising rate to 1.5 is the cheapest
 * honest way to say that, and it widens the spread rather than moving the mean.
 */
function pressure(years, rate) {
    return Math.max(0, Math.min(0.9, 0.38 * (years / 1000) * Math.pow(rate, 1.5)));
}

// ---------------------------------------------------------------------------
// Reading a paradigm off a set of forms
// ---------------------------------------------------------------------------

const ipaKey = (form) => wordToIpaStressed(form);

/** How many leading segments two forms share. */
function sharedPrefix(a, b) {
    let i = 0;
    while (i < a.length && i < b.length && a[i].ipa === b[i].ipa) i += 1;
    return i;
}

/**
 * Group evolved paradigm entries into { class → { cell → entry } }.
 *
 * Cells are ordered as the paradigm generated them, which puts the unmarked
 * cell (nominative singular, or the first tense's third person) first. That
 * order is used as a markedness proxy throughout: when two cells merge, the
 * earlier one is the survivor, because the unmarked form is the one speakers
 * generalise FROM.
 */
function tableOf(entries) {
    const classes = new Map();
    for (const e of entries) {
        // the moods are levelled apart from the tenses (morphology/moods.js)
        if (!isParadigmEntry(e) || isMoodCellEntry(e)) continue;
        const { cls, cell } = parseCellId(e.id);
        if (!classes.has(cls)) classes.set(cls, new Map());
        classes.get(cls).set(cell, e);
    }
    return classes;
}

/**
 * The stem the majority of a class's cells agree on, and each cell's remainder.
 *
 * Paradigm cells here are whole inflected words — stem plus ending, carried
 * through the sound changes as one string — so there is no stored boundary to
 * consult, and there should not be. Speakers do not have one either. What a
 * speaker has is a table of surface forms, and the stem is whatever the forms
 * agree on.
 *
 * So: take the unmarked cell as the model, find the longest prefix that at least
 * `quorum` of the cells share with it, and call that the stem. Cells that break
 * from it earlier are the ones a sound change altered — the alternation analogy
 * then goes after.
 */
export function analyseStem(cellMap, { quorum = 0.6 } = {}) {
    const cells = [...cellMap.keys()];
    if (cells.length < 3) return null;
    const model = cellMap.get(cells[0]);
    if (!model) return null;

    const shares = cells.map((c) => sharedPrefix(model.form, cellMap.get(c).form));
    // The largest prefix length that enough cells reach.
    let best = 0;
    for (let k = model.form.length; k >= 1; k--) {
        const n = shares.filter((s) => s >= k).length;
        if (n / cells.length >= quorum) { best = k; break; }
    }
    if (!best) return null;

    const stem = model.form.slice(0, best);
    /**
     * An outlier is a cell that breaks from the dominant stem AND still has an
     * ending left once the stem is imposed on it. A cell no longer than the
     * stem has had its ending eaten already; rebuilding it would invent a form
     * rather than restore one.
     */
    const outliers = cells.filter((c, i) => shares[i] < best && cellMap.get(c).form.length > best);
    return { stem, stemIpa: wordToIpa(stem), outliers, cells };
}

/**
 * What a cell looks like once the dominant stem is extended over it.
 *
 * The replacement is POSITIONAL: the first `stem.length` segments are swapped
 * for the dominant stem and the rest — the ending — is kept. The obvious
 * alternative, splicing at the point where the two forms first diverge, is
 * wrong and was the first version: with a dominant stem of *kura-* and an
 * outlier *kiran*, the forms part company after *k*, so it produced *kurairan*,
 * gluing the whole outlier onto the stem instead of replacing its front.
 *
 * This assumes the sound change altered the stem's QUALITY rather than its
 * length, which is the usual case and the case analogy actually repairs —
 * umlaut, Verner's alternation, a raised vowel before a lost suffix. A change
 * that deleted a segment outright would make the split land one short, so the
 * caller only nominates a cell as levellable when it is at least a segment
 * longer than the stem.
 */
function levelled(stem, form) {
    if (form.length <= stem.length) return stem.slice();
    return [...stem, ...form.slice(stem.length)];
}

/** A class's endings, relative to its own dominant stem. */
function tailsOf(cellMap, stem) {
    const out = new Map();
    for (const [cell, e] of cellMap) {
        const d = sharedPrefix(stem, e.form);
        out.set(cell, e.form.slice(d));
    }
    return out;
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

/**
 * Decide which levellings happen on this edge.
 *
 * Planned against a PROJECTION of the paradigm — the parent's cells run through
 * this edge's rules — because levelling is a reaction to what the sound changes
 * did, and the sound changes have not run yet when the changeset is built. The
 * projection is only used to make the DECISION; the forms are recomputed from
 * the real evolved lexicon when the event is applied, and an event whose
 * condition no longer holds is skipped. Pinned decision, derived result.
 *
 * Returns dated events for the ChangeSet, so a levelling is re-timeable and
 * appears in the change log beside the sound change that provoked it.
 */
export function planLevellings(parentState, rules, rng, { from, to, rate = 1 } = {}) {
    const cellEntries = (parentState.entries || []).filter((e) => isParadigmEntry(e) && !isMoodCellEntry(e));
    if (cellEntries.length < 2) return [];

    const projected = evolveLexicon(cellEntries, rules, {
        phonotactics: parentState.phonotactics,
        stageId: `${parentState.langId}:project`,
    }).entries;

    const classes = tableOf(projected);
    if (!classes.size) return [];

    const years = Math.max(0, (to ?? from) - from);
    const p = pressure(years, rate);
    if (p <= 0) return [];

    const events = [];
    const rankOf = (cellMap) => [...cellMap.values()][0]?.rank ?? 500;
    const immune = (cellMap) => [...cellMap.values()].some((e) => e.irregular);

    // ── 1. Stem levelling ────────────────────────────────────────────────────
    for (const [cls, cellMap] of classes) {
        if (immune(cellMap)) continue;
        const analysis = analyseStem(cellMap);
        if (!analysis || !analysis.outliers.length) continue;
        // A class where nearly everything is an outlier has no dominant stem to
        // extend; that is not an alternation, it is a different paradigm.
        if (analysis.outliers.length > analysis.cells.length * 0.5) continue;
        if (!rng.bool(p * (1 - resistance(rankOf(cellMap))))) continue;
        events.push({
            kind: 'stem',
            cls,
            cells: analysis.outliers,
            model: analysis.cells[0],
            note: `the ${analysis.cells[0]} stem was extended across the paradigm, levelling an alternation sound change had introduced`,
            attested: 'Old English ceosan / curon, an alternation left by Verner\'s Law, was levelled to choose / chose',
        });
    }

    // ── 2. Class absorption ──────────────────────────────────────────────────
    const byPos = new Map();
    for (const [cls, cellMap] of classes) {
        const pos = cls[0] === 'v' ? 'v' : 'n';
        if (!byPos.has(pos)) byPos.set(pos, []);
        byPos.get(pos).push({ cls, cellMap });
    }
    for (const group of byPos.values()) {
        if (group.length < 2) continue;
        // Size is read off the lexicon rather than the paradigm, because the
        // paradigm only holds one exemplar per class.
        const size = (cls) => (parentState.entries || []).filter((e) => e.class === cls && !isParadigmEntry(e)).length;
        const sized = group.map((g) => ({ ...g, n: size(g.cls) })).sort((a, b) => b.n - a.n);
        const dominant = sized[0];
        if (!dominant.n) continue;
        for (const g of sized.slice(1)) {
            if (immune(g.cellMap)) continue;
            if (g.n >= dominant.n * 0.5) continue;      // not small enough to be swallowed
            // Smaller classes are swallowed more readily — that IS the mechanism.
            const bias = 1 - (g.n / dominant.n);
            if (!rng.bool(p * bias * (1 - resistance(rankOf(g.cellMap))))) continue;
            events.push({
                kind: 'class',
                cls: g.cls,
                donorCls: dominant.cls,
                note: `class ${g.cls} (${g.n} members) took over the endings of ${dominant.cls} (${dominant.n} members)`,
                attested: 'The Old English -s plural belonged to one declension and spread to nearly every English noun; children, oxen and feet are what is left of the others',
            });
        }
    }

    // ── 3. Syncretism extension ──────────────────────────────────────────────
    /**
     * The model for a generalisation is the PRODUCTIVE class, not a headcount.
     *
     * Requiring a majority of classes to have merged first was too strict, and
     * strict in the wrong way: analogy does not take a vote. It generalises
     * whatever pattern is productive, and the productive pattern is the one
     * carried by the class with the most members — which is why the English -s
     * plural won despite belonging to a single Old English declension while
     * several others were arrayed against it.
     *
     * So a merger spreads if it holds in the largest class, or if it holds in a
     * substantial minority of classes generally.
     */
    const classSize = new Map([...classes.keys()].map((cls) => [
        cls, (parentState.entries || []).filter((e) => e.class === cls && !isParadigmEntry(e)).length,
    ]));
    const largestOf = (candidates) => candidates.reduce((best, c) => (
        (classSize.get(c) ?? 0) > (classSize.get(best) ?? 0) ? c : best), candidates[0]);

    const cellNames = [...new Set([...classes.values()].flatMap((m) => [...m.keys()]))];
    for (let i = 0; i < cellNames.length; i++) {
        for (let j = i + 1; j < cellNames.length; j++) {
            const a = cellNames[i], b = cellNames[j];
            const merged = [], distinct = [];
            for (const [cls, cellMap] of classes) {
                const ea = cellMap.get(a), eb = cellMap.get(b);
                if (!ea || !eb) continue;
                (ipaKey(ea.form) === ipaKey(eb.form) ? merged : distinct).push(cls);
            }
            if (!merged.length || !distinct.length) continue;
            const all = [...merged, ...distinct];
            const productive = merged.includes(largestOf(all));
            if (!productive && merged.length / all.length < 0.4) continue;
            for (const cls of distinct) {
                const cellMap = classes.get(cls);
                if (immune(cellMap)) continue;
                if (!rng.bool(p * (1 - resistance(rankOf(cellMap))))) continue;
                events.push({
                    kind: 'syncretism',
                    cls,
                    // The EARLIER cell survives: it is the unmarked one, and the
                    // unmarked form is what speakers generalise from.
                    cells: [b],
                    model: a,
                    heldIn: merged.length,
                    outOf: all.length,
                    note: `${a} and ${b} had already fallen together in ${merged.length} of ${all.length} classes${productive ? ', including the largest' : ''}; ${cls} followed`,
                    attested: 'Latin\'s case distinctions survived in some declensions long after they had merged in others, and then went the same way — which is how six cases became none in Romance',
                });
            }
        }
    }

    // Spread across the edge, like every other kind of dated event here.
    const span = Math.max(1, years);
    return events.map((e, i) => ({
        ...e,
        id: `lev-${i + 1}`,
        year: Math.round(from + ((i + 0.5) / events.length) * span),
    }));
}

// ---------------------------------------------------------------------------
// Application
// ---------------------------------------------------------------------------

/**
 * Apply levellings to an evolved lexicon.
 *
 * Rewrites the paradigm entries in place (functionally — a new array is
 * returned) and records a step in each affected cell's derivation history, so
 * the etymology display shows the levelling as an event alongside the sound
 * changes, and `erosion.js` can attribute a resulting merger to analogy rather
 * than to phonology.
 */
export function applyLevellings(entries, events, { histories, stageId } = {}) {
    if (!events?.length) return { entries, applied: [] };

    let out = entries.slice();
    const indexOf = new Map(out.map((e, i) => [e.id, i]));
    const applied = [];

    /** Read the class's current table out of the working array. */
    const classTable = (cls) => {
        const m = new Map();
        for (const e of out) {
            if (!isParadigmEntry(e) || isMoodCellEntry(e)) continue;
            const parsed = parseCellId(e.id);
            if (parsed.cls === cls) m.set(parsed.cell, e);
        }
        return m;
    };

    const rewrite = (id, form, ev, label) => {
        const i = indexOf.get(id);
        if (i == null) return false;
        const before = out[i].form;
        if (ipaKey(before) === ipaKey(form)) return false;
        out[i] = { ...out[i], form, ipa: wordToIpa(form), levelled: { kind: ev.kind, year: ev.year } };
        const h = histories?.get(id);
        if (h) {
            pushStep(h, {
                id: `${stageId}-${ev.id}`, stageId, year: ev.year,
                category: 'analogy', label,
            }, before, form, true);
        }
        return true;
    };

    for (const ev of events) {
        const cellMap = classTable(ev.cls);
        if (!cellMap.size) continue;
        let touched = 0;

        if (ev.kind === 'stem') {
            const analysis = analyseStem(cellMap);
            if (!analysis) continue;
            // Re-derived from the real forms: the projection only chose the
            // event, it does not get to dictate the result.
            for (const cell of analysis.outliers) {
                const e = cellMap.get(cell);
                if (!e) continue;
                if (rewrite(e.id, levelled(analysis.stem, e.form), ev,
                    `analogical levelling — the ${analysis.cells[0]} stem extended to ${cell}`)) touched += 1;
            }
        } else if (ev.kind === 'class') {
            const donor = classTable(ev.donorCls);
            const mine = analyseStem(cellMap);
            const theirs = analyseStem(donor);
            if (!mine || !theirs) continue;
            const donorTails = tailsOf(donor, theirs.stem);
            for (const [cell, e] of cellMap) {
                const tail = donorTails.get(cell);
                if (!tail) continue;
                if (rewrite(e.id, [...mine.stem, ...tail], ev,
                    `analogical levelling — ${ev.cls} took the ${ev.donorCls} ending in ${cell}`)) touched += 1;
            }
        } else if (ev.kind === 'syncretism') {
            const model = cellMap.get(ev.model);
            if (!model) continue;
            for (const cell of ev.cells) {
                const e = cellMap.get(cell);
                if (!e) continue;
                if (rewrite(e.id, model.form, ev,
                    `analogical levelling — ${cell} replaced by ${ev.model}, a merger already general in this language`)) touched += 1;
            }
        }

        if (touched) applied.push({ ...ev, touched });
    }

    return { entries: out, applied };
}

/** Readable log for the panel and the CLI. */
export function formatLevellings(events) {
    if (!events?.length) return '';
    const LABEL = { stem: 'stem levelling', class: 'class absorption', syncretism: 'syncretism generalised' };
    return events.map((ev) => (
        `  c.${String(ev.year).padStart(5)}  ${ev.cls.padEnd(4)} ${LABEL[ev.kind]}\n        ${ev.note}`
    )).join('\n');
}
