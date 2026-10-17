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
import { hashString } from '../rng.js';

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
            /**
             * THE MINIMAL WORD CONSTRAINT.
             *
             * A sound change never reduces a word to nothing. No language
             * tolerates a zero-segment word, and languages that get close put
             * up an explicit floor: minimality requirements are well attested —
             * Lardil augments sub-bimoraic stems, and English has no content
             * word shorter than a syllable. Where a change would empty a word,
             * it simply fails to apply to that word.
             *
             * Blocking is the right shape rather than repairing. Repair would
             * mean inventing segments; blocking leaves an exception behind,
             * which is exactly what a minimality constraint produces in a real
             * language. Without it, a one-segment paradigm cell that met a
             * deletion rule became a word with no sounds in it, which then
             * propagated through levelling to every cell that copied it.
             */
            if (!res.segments.length && before.length) continue;
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
/**
 * INHIBITED SOUND CHANGE.
 *
 * A regular change can fail in the one word where it would make that word
 * sound exactly like another. Blevins & Wedel (2009) gathered the cases:
 * Estonian lost final *-n everywhere except where losing it would have merged
 * two forms that had to stay apart, and the same pattern turns up wherever a
 * change threatens contrasts speakers rely on. It is a bias, not a law. The
 * pressure is strongest between words of the same part of speech, which
 * compete for the same slot in a sentence.
 *
 * Without it nothing resisted homophony at the level of the word: sound
 * change made about 42 new homophones per edge, and by the present a third or
 * more of every living language's basic words shared a form with another word.
 * The cost is honest irregularity: a word that escaped this way is a lexical
 * exception, and the comparative method sees it as one.
 *
 * Inflected forms take no part, either as the word that would change or as
 * the word it would collide with: syncretism by sound change is how case
 * systems wear away, and it is meant to happen.
 */
const INHIBIT_SAME_POS = 0.6;
const INHIBIT_OTHER_POS = 0.25;

/**
 * A change that takes a sound out of the language everywhere (h is lost, b
 * merges into p) is not inhibited. Blevins & Wedel's cases are changes in one
 * position, which spare a word and leave the sound where it was elsewhere;
 * sparing words from a total merger kept the lost sound alive in a few
 * stray words (one language kept [kʰ] in 3 words of a thousand, [h] in 17
 * after losing it twice), so every merger left a marginal phoneme behind and
 * inventories only grew. Homophones a merger makes are left to therapy
 * (lexicon/therapy.js), as on Earth: Latin lost /h/ in every word.
 */
function isMerger(rule) {
    if (rule.probability != null && rule.probability < 1) return false;
    return !rule.env || (!rule.env.before?.length && !rule.env.after?.length);
}
const plainKey = (form) => wordToIpa(form).replace(/[ˈˌ]/gu, '');

/**
 * The ruleset runs RULE BY RULE over the whole lexicon, not word by word, so
 * that each change can see what the other words sound like at the moment it
 * applies. Without inhibition the two orders give identical results, because
 * a rule's effect on a word depends only on that word.
 */
export function evolveLexicon(entries, rules, opts = {}) {
    const { phonotactics, stageId, histories = new Map() } = opts;
    const newHistories = new Map();
    const stats = { changed: 0, unchanged: 0, sites: 0, byRule: new Map() };

    const words = entries.map((entry) => ({
        entry,
        competes: !entry.paradigm && !entry.retired,
        form: phonotactics ? markStress(entry.form, phonotactics) : entry.form,
        history: histories.get(entry.id) ? forkHistory(histories.get(entry.id)) : newHistory(entry.id, entry.form, stageId),
        ctx: {
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
        },
    }));

    // Which parts of speech currently own each form, among competing words.
    const owners = new Map();
    const own = (key, pos, d) => {
        if (!owners.has(key)) owners.set(key, new Map());
        const m = owners.get(key);
        m.set(pos, (m.get(pos) || 0) + d);
    };
    for (const w of words) if (w.competes) own(plainKey(w.form), w.entry.pos, 1);

    for (const rule of rules) {
        const step = { ...rule, stageId: rule.stageId ?? stageId };
        const merger = isMerger(rule);
        for (const w of words) {
            // A loanword only undergoes the changes that happened after it
            // arrived; see evolveWord.
            if (w.ctx.enteredAt != null && rule.year != null && rule.year < w.ctx.enteredAt) continue;
            const before = w.form;
            const res = applyRule(before, rule, w.ctx);
            if (res.applied) {
                // The minimal word constraint; see evolveWord.
                if (!res.segments.length && before.length) continue;
                if (w.competes) {
                    const from = plainKey(before);
                    const to = plainKey(res.segments);
                    const rivals = to !== from && !merger ? owners.get(to) : null;
                    if (rivals) {
                        const samePos = (rivals.get(w.entry.pos) || 0) > 0;
                        const anyPos = [...rivals.values()].some((n) => n > 0);
                        const p = samePos ? INHIBIT_SAME_POS : anyPos ? INHIBIT_OTHER_POS : 0;
                        if (p > 0 && (hashString(`inhibit|${rule.id}|${w.entry.id}`) % 100000) / 100000 < p) {
                            pushStep(w.history, { ...step, label: `${rule.label ?? rule.id} (blocked: would merge with an existing word)` }, before, before, false);
                            continue;
                        }
                    }
                    own(from, w.entry.pos, -1);
                    own(to, w.entry.pos, 1);
                }
                w.form = res.segments;
                pushStep(w.history, step, before, w.form, true);
            } else if (res.skipped === 'diffusion') {
                pushStep(w.history, step, before, before, false);
            }
        }
    }

    const out = [];
    for (const w of words) {
        const ipa = wordToIpa(w.form);
        if (ipa !== wordToIpa(w.entry.form)) stats.changed += 1; else stats.unchanged += 1;
        newHistories.set(w.entry.id, w.history);
        out.push({ ...w.entry, form: w.form, ipa });
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
