/**
 * Derivation history — the etymology chain.
 *
 * This is the structure that lets the tool say
 *
 *     *ph₂tḗr → *fadēr → fæder → father
 *
 * and name the rule responsible for each arrow. It is deliberately a plain,
 * append-only record: every time a rule changes a word, one step is pushed. No
 * step is ever rewritten, so the chain is a faithful account of what happened
 * rather than a reconstruction after the fact.
 *
 * Two design points worth stating.
 *
 * **Steps record before AND after.** Storing only the output would make the
 * chain unreadable once a segment has merged away — you could see that /b/
 * became /p/ but not which /p/ used to be a /b/. Since mergers are the
 * commonest kind of sound change, that would gut the display almost
 * immediately.
 *
 * **Rules that didn't apply are not recorded.** A word that a rule skipped has
 * nothing interesting to say about it. The exception is a PROBABILISTIC rule
 * (lexical diffusion): there, "this word was eligible and was not affected" is
 * genuinely informative, because it's why the word is now an exception. Those
 * are recorded with `applied: false`.
 */

import { wordToIpa } from '../features.js';

/** Start a fresh history for a word at the proto stage. */
export function newHistory(rootId, form, stageId) {
    return {
        rootId,
        protoForm: wordToIpa(form),
        protoStage: stageId,
        steps: [],
    };
}

/**
 * Record one rule application.
 *
 * @param history  the chain being extended
 * @param rule     the rule that fired
 * @param before   phoneme array before
 * @param after    phoneme array after
 * @param applied  false when an eligible word was skipped by a probabilistic rule
 */
export function pushStep(history, rule, before, after, applied = true) {
    const from = wordToIpa(before);
    const to = wordToIpa(after);
    if (applied && from === to) return history; // nothing observable happened
    history.steps.push({
        ruleId: rule.id,
        stageId: rule.stageId ?? null,
        year: rule.year ?? null,
        label: rule.label ?? rule.template ?? rule.category ?? rule.id,
        /**
         * Carried so that a merger can be attributed to the RIGHT KIND of
         * change. A paradigm cell that fell together because a sound change
         * made it homophonous and one that fell together because speakers
         * regularised it are different historical events, and reporting the
         * second as the first would be a lie about where the change came from.
         */
        category: rule.category ?? null,
        from,
        to,
        applied,
    });
    return history;
}

/** Fork a history for a daughter branch — daughters must not share step arrays. */
export function forkHistory(history) {
    return { ...history, steps: history.steps.slice() };
}

/** The form at the end of the chain. */
export function currentForm(history) {
    for (let i = history.steps.length - 1; i >= 0; i--) {
        if (history.steps[i].applied) return history.steps[i].to;
    }
    return history.protoForm;
}

/**
 * Collapse the chain to one line per STAGE rather than per rule.
 *
 * A 6,000-year branch accumulates a hundred rules, and nobody wants to read a
 * hundred arrows. The stage-level view is the one a historical grammar would
 * print: *ph₂tḗr → *fadēr → fæder → father, with the rule detail available
 * underneath.
 */
export function byStage(history) {
    const out = [];
    let current = history.protoForm;
    let stage = history.protoStage;
    for (const step of history.steps) {
        if (!step.applied) continue;
        if (step.stageId !== stage) {
            out.push({ stageId: stage, form: current });
            stage = step.stageId;
        }
        current = step.to;
    }
    out.push({ stageId: stage, form: current });
    return out;
}

/** One-line summary: *proto → … → modern */
export function formatChain(history, { stageNames = {}, arrow = ' → ' } = {}) {
    const stages = byStage(history);
    return stages
        .map((s, i) => (i === 0 ? '*' : '') + s.form + (stageNames[s.stageId] ? ` (${stageNames[s.stageId]})` : ''))
        .join(arrow);
}

/** Full detail: every rule that touched this word, with the change it made. */
export function formatDerivation(history, { stageNames = {} } = {}) {
    const L = [`*${history.protoForm}`];
    for (const step of history.steps) {
        const where = stageNames[step.stageId] || step.stageId || '';
        const when = step.year != null ? `c. ${step.year}` : '';
        if (step.applied) {
            L.push(`  ${step.from} > ${step.to}   ${step.label}${where ? `  [${where}${when ? ', ' + when : ''}]` : ''}`);
        } else {
            L.push(`  ${step.from} —      ${step.label} did not apply (lexical diffusion)${where ? `  [${where}]` : ''}`);
        }
    }
    return L.join('\n');
}

/**
 * Build a comparative cognate row: one proto-root, its reflex in each daughter.
 *
 * This is the comparative method's own output format, and it's the display that
 * makes a family look like a family. Where a daughter has lost the root
 * entirely, the cell is marked rather than left blank — loss is data.
 */
export function cognateRow(rootId, gloss, protoForm, reflexes) {
    return {
        rootId,
        gloss,
        proto: protoForm,
        cells: reflexes.map((r) => ({
            stageId: r.stageId,
            form: r.form ?? null,
            lost: r.form == null,
            // Which rules separate this reflex from the proto — the "sound laws"
            // column of a real comparative table.
            laws: r.laws || [],
        })),
    };
}

/**
 * Find FALSE FRIENDS between two daughters: same proto-root, meanings that have
 * drifted apart. English "hound" and German "Hund" are the classic pair —
 * cognate, but one narrowed to a hunting dog and the other stayed general.
 */
export function falseFriends(rowsA, rowsB) {
    const byRoot = new Map(rowsB.map((r) => [r.rootId, r]));
    const out = [];
    for (const a of rowsA) {
        const b = byRoot.get(a.rootId);
        if (!b || !a.form || !b.form) continue;
        if (a.gloss !== b.gloss) {
            out.push({ rootId: a.rootId, a: { form: a.form, gloss: a.gloss }, b: { form: b.form, gloss: b.gloss } });
        }
    }
    return out;
}
