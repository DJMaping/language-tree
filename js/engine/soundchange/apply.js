/**
 * Running an ordered ruleset over a word or a whole lexicon.
 *
 * ## Why ORDER is the thing
 *
 * A ruleset is not a set. It is a sequence, and the sequence is where the
 * realism lives. Two rules in one order and the other produce different
 * languages, and the four ways they can interact are the standard vocabulary
 * of historical phonology:
 *
 *   FEEDING         A creates new inputs for B.
 *                   Latin: /kt/ > /jt/ then /jt/ > /tʃ/ — the first change is
 *                   what gives the second anything to work on.
 *
 *   BLEEDING        A destroys inputs B would have had.
 *                   If final vowels drop before intervocalic voicing runs, the
 *                   consonants that would have voiced are no longer between
 *                   vowels, and never do.
 *
 *   COUNTERFEEDING  B would have fed A, but runs after it, so the change looks
 *                   half-finished and leaves an exception behind.
 *                   Spanish: intervocalic voicing (t > d) runs BEFORE
 *                   degemination (tt > t). "gutta" therefore gives "gota" with
 *                   a plain /t/ — the new singleton /t/ arrives too late to be
 *                   voiced. Reverse the two and you get *"goda", which is not a
 *                   Spanish word. One ordering decision, one whole class of
 *                   words.
 *
 *   COUNTERBLEEDING A applies, then B removes the environment that conditioned
 *                   it, leaving a result that can no longer be explained by
 *                   anything visible on the surface. This is OPACITY, and it is
 *                   the single biggest source of the "why is this word like
 *                   this" texture that hand-built conlangs never have.
 *
 * Getting all four to fall out of a plain ordered list — rather than being
 * special-cased — is the whole design goal of this module.
 */

import { wordToIpa, wordToIpaStressed } from '../features.js';
import { markStress } from '../phonology/phonotactics.js';
import { applyRule, formatRule, ruleLine } from './rule.js';
import { newHistory, pushStep, forkHistory } from '../lexicon/etymology.js';

/**
 * Run an ordered ruleset over one word.
 *
 * @param segments  starting phoneme array
 * @param rules     ORDERED rules
 * @param ctx       { rootId, rank, domain, pos, phonotactics, history, stageId }
 */
export function evolveWord(segments, rules, ctx = {}) {
    let current = segments;
    const history = ctx.history ? forkHistory(ctx.history) : newHistory(ctx.rootId, segments, ctx.stageId);

    // Assign stress once, at the start, unless the word already carries lexical
    // accent. From here on stress rides on the segments and survives every rule
    // — see markStress() for why that's necessary rather than merely tidy.
    if (ctx.phonotactics) current = markStress(current, ctx.phonotactics);

    for (const rule of rules) {
        /**
         * A LOANWORD only undergoes the changes that happened after it arrived.
         *
         * This is the whole mechanism behind datable loan strata. English
         * borrowed the same French word as "chief" and again, centuries later,
         * as "chef"; the first arrived while French still had /tʃ/ and kept it,
         * the second arrived after French had shifted to /ʃ/. Same source, two
         * dates, and the consonant tells you which is which. Likewise
         * catch/chase, cattle/chattel, warranty/guarantee.
         *
         * Inherited vocabulary has no `enteredAt` and is subject to everything.
         */
        if (ctx.enteredAt != null && rule.year != null && rule.year < ctx.enteredAt) continue;

        const before = current;
        const res = applyRule(current, rule, ctx);
        if (res.applied) {
            current = res.segments;
            pushStep(history, { ...rule, stageId: rule.stageId ?? ctx.stageId }, before, current, true);
        } else if (res.skipped === 'diffusion') {
            // Worth recording: this word was eligible and escaped. That escape
            // is precisely why it will look irregular later.
            pushStep(history, { ...rule, stageId: rule.stageId ?? ctx.stageId }, before, before, false);
        }
    }

    return { segments: current, history, ipa: wordToIpa(current) };
}

/**
 * Run an ordered ruleset over a whole lexicon, carrying each word's history.
 *
 * Returns a new lexicon; the input is never mutated. That purity is what makes
 * `evolve(parent, changeSet) → child` re-runnable: editing a rule and
 * recomputing a branch can never corrupt the parent it was derived from.
 */
export function evolveLexicon(entries, rules, opts = {}) {
    const { phonotactics, stageId, histories = new Map() } = opts;
    const out = [];
    const newHistories = new Map();
    const stats = { changed: 0, unchanged: 0, sites: 0, byRule: new Map() };

    for (const entry of entries) {
        const ctx = {
            rootId: entry.id,
            rank: entry.rank,
            domain: entry.domain,
            pos: entry.pos,
            phonotactics,
            stageId,
            enteredAt: entry.enteredAt,
            // Paradigm cells share their lexeme's diffusion draw — see
            // passesProbability() in rule.js.
            diffusionKey: entry.paradigm?.stem ?? entry.id,
            history: histories.get(entry.id),
        };
        const before = wordToIpa(entry.form);
        const res = evolveWord(entry.form, rules, ctx);
        if (res.ipa !== before) stats.changed += 1; else stats.unchanged += 1;

        newHistories.set(entry.id, res.history);
        out.push({ ...entry, form: res.segments, ipa: res.ipa });
    }

    // Per-rule impact, for the change log: a rule that touched nothing is
    // usually a sign its environment was destroyed by an earlier rule, which is
    // itself worth surfacing.
    for (const rule of rules) {
        let n = 0;
        for (const h of newHistories.values()) n += h.steps.filter((s) => s.ruleId === rule.id && s.applied).length;
        stats.byRule.set(rule.id, n);
    }

    return { entries: out, histories: newHistories, stats };
}

// ---------------------------------------------------------------------------
// Inventory bookkeeping: mergers and splits
// ---------------------------------------------------------------------------

/**
 * Recompute which phonemes a stage actually USES, by scanning its lexicon.
 *
 * A phoneme inventory is not a declaration, it is an observation: a segment is
 * in the inventory if words contain it. So after a ruleset runs, the inventory
 * is whatever survived — and that is how MERGERS happen here. Nobody writes
 * "delete /b/"; /b/ simply stops appearing once every /b/ has become /p/.
 */
export function inventoryFromLexicon(entries) {
    const seen = new Map();
    for (const e of entries) {
        for (const ph of e.form) {
            if (!seen.has(ph.ipa)) seen.set(ph.ipa, { ph, count: 0 });
            seen.get(ph.ipa).count += 1;
        }
    }
    const list = [...seen.values()].sort((a, b) => b.count - a.count);
    return {
        consonants: list.filter((x) => x.ph.type === 'C').map((x) => x.ph),
        vowels: list.filter((x) => x.ph.type === 'V').map((x) => x.ph),
        counts: new Map([...seen].map(([k, v]) => [k, v.count])),
    };
}

/**
 * Compare two inventories and report what happened between them.
 *
 * A MERGER shows up as a segment that was present and is now absent, with its
 * words now spelling some other segment. A SPLIT shows up as a segment that is
 * newly present.
 *
 * The engine never creates a split by fiat, and this is where you can see that.
 * A new phoneme only appears because some rule created a conditioned variant
 * and a LATER rule destroyed the environment that conditioned it. Until that
 * second rule runs, the variant is an allophone and its distribution is
 * predictable; afterwards it is a phoneme, because nothing on the surface
 * explains where it occurs any more. That two-step is what phonemicisation
 * actually is, and it is the reason the results feel earned.
 */
export function diffInventories(before, after) {
    const b = new Set([...before.consonants, ...before.vowels].map((p) => p.ipa));
    const a = new Set([...after.consonants, ...after.vowels].map((p) => p.ipa));
    return {
        lost: [...b].filter((x) => !a.has(x)),
        gained: [...a].filter((x) => !b.has(x)),
        kept: [...b].filter((x) => a.has(x)),
    };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

/** Human-readable change log for an edge. */
export function formatChangeLog(rules, stats, { from, to } = {}) {
    const L = [];
    for (const rule of rules) {
        const n = stats?.byRule?.get(rule.id) ?? null;
        const when = rule.year != null ? `c. ${rule.year}` : (from != null && to != null ? `${from}–${to}` : '');
        L.push(`${ruleLine(rule)}${when ? `   (${when})` : ''}${n != null ? `  — ${n} word${n === 1 ? '' : 's'}` : ''}`);
        if (rule.analogue) L.push(`      cf. ${rule.analogue}`);
        if (n === 0) L.push('      ⚠ no effect — its environment may have been destroyed by an earlier rule');
    }
    return L.join('\n');
}

/** Trace one word through a ruleset, showing every step. Debugging gold. */
export function trace(segments, rules, ctx = {}) {
    let current = ctx.phonotactics ? markStress(segments, ctx.phonotactics) : segments;
    const L = [`      ${wordToIpaStressed(current)}`];
    for (const rule of rules) {
        const res = applyRule(current, rule, ctx);
        if (res.applied) {
            L.push(`  ${ruleLine(rule).padEnd(52)} → ${wordToIpaStressed(res.segments)}`);
            current = res.segments;
        }
    }
    return L.join('\n');
}
