/**
 * Choosing an ordered ruleset for one edge of the tree.
 *
 * ## Rate of change
 *
 * Roughly one significant sound change per 50–150 years. That figure comes from
 * counting the changes handbooks list between well-documented stages — Latin to
 * Old French, Old English to Modern English, Middle Chinese to Mandarin — and it
 * lands in the same range every time. A 600-year edge therefore gets 4–12
 * changes; a 3,000-year reconstructed gap gets 20–60, and its endpoints are
 * barely recognisable as relatives. That is what a 6,000-year family actually
 * looks like.
 *
 * ## Why the candidate list is longer than the edge needs
 *
 * A rule, once generated, must never silently reroll. DJ drags boxes around the
 * chart constantly, and an edge that regenerated its whole sound history every
 * time its dates moved would be useless.
 *
 * So generation produces a long deterministic CANDIDATE SEQUENCE seeded only by
 * the family seed and the edge identity — never by the dates. The duration then
 * decides only how many of those candidates are taken. Lengthen an edge and it
 * appends changes; shorten it and it truncates. The changes that were already
 * there stay exactly as they were, and only their dates are re-spread.
 *
 * ## Why candidates are chosen against a moving inventory
 *
 * Each rule changes the language, so the next rule has to be chosen against the
 * language as it now is, not as it was. Palatalisation is unavailable once the
 * front vowels are gone; tonogenesis is unavailable once there are no codas
 * left to lose. The generator therefore projects the inventory forward after
 * every pick, which is also what stops it proposing the same change twice.
 */

import { applicable, PAIRED, byId } from './catalogue.js';
import { makeRule, segmentMatches, applyRule } from './rule.js';
import { applyDelta, parseWord, wordToIpa } from '../features.js';
import { markStress } from '../phonology/phonotactics.js';

/** How many candidate rules to generate per edge, regardless of duration. */
const CANDIDATE_DEPTH = 64;

/**
 * How many words to test-fire a candidate rule against.
 *
 * A rule that changes nothing is not a sound change, it is noise in the change
 * log — and the log is meant to be readable history, not a list of things that
 * didn't happen. The commonest cause is a rule whose environment this language
 * cannot supply: apocope needs an UNSTRESSED final vowel, and a language with
 * fixed final stress has none, ever.
 *
 * Testing against a sample rather than the whole lexicon keeps generation fast.
 * A change that affects no word in a 160-word spread across the frequency range
 * affects too few to be worth recording.
 */
const PROBE_SIZE = 160;

/** A deterministic spread across the lexicon, not just the commonest words. */
function probeSet(entries) {
    if (entries.length <= PROBE_SIZE) return entries;
    const step = entries.length / PROBE_SIZE;
    const out = [];
    for (let i = 0; i < PROBE_SIZE; i++) out.push(entries[Math.floor(i * step)]);
    return out;
}

/**
 * Does this rule actually CHANGE anything in this language?
 *
 * Matching is not changing, and the difference is not pedantic. Nasal place
 * assimilation matches every nasal before a stop — including /nt/, where the
 * nasal is already homorganic and the output is identical to the input. A rule
 * that only ever matches already-conforming sequences has no history to record
 * and no business in a change log.
 */
function hasEffect(rule, probe, pt) {
    for (const e of probe) {
        const form = pt ? markStress(e.form, pt) : e.form;
        const res = applyRule(form, rule, { rootId: e.id, rank: e.rank, domain: e.domain, pos: e.pos });
        if (res.applied && wordToIpa(res.segments) !== wordToIpa(form)) return true;
    }
    return false;
}

/**
 * Years per significant change. The band is drawn once per edge and then held,
 * so a branch has a consistent tempo rather than a jittery one — some lineages
 * really are more conservative than others, and that should be a property of
 * the branch rather than of each individual century.
 */
function intervalFor(rng, rate = 1) {
    return rng.float(50, 150) / Math.max(0.1, rate);
}

/**
 * Project an inventory forward through a rule, approximately.
 *
 * Deliberately rough: it ignores environments, so it over-estimates what a
 * conditioned rule changes. That's the right direction to err — the generator
 * uses this only to decide what is still worth proposing, and being slightly
 * pessimistic about what survives keeps it from suggesting the same change
 * twice in a row.
 */
function projectInventory(inv, rule) {
    const target = rule.a?.match || rule.a;
    if (!target || target.seq || target.empty) return inv;

    const unconditioned = !rule.env || (!rule.env.before?.length && !rule.env.after?.length);
    const step = (list) => {
        const out = [];
        for (const ph of list) {
            let hit = false;
            try { hit = segmentMatches(ph, target); } catch { hit = false; }
            if (!hit) { out.push(ph); continue; }
            if (!unconditioned) out.push(ph); // the old segment survives elsewhere
            if (rule.b?.delta) {
                try { out.push(applyDelta(ph, rule.b.delta)); } catch { /* ignore */ }
            } else if (rule.b?.set) {
                try { for (const s of parseWord(rule.b.set)) out.push(s); } catch { /* ignore */ }
            }
        }
        // Deduplicate by IPA.
        const seen = new Map();
        for (const ph of out) if (!seen.has(ph.ipa)) seen.set(ph.ipa, ph);
        return [...seen.values()];
    };

    return {
        ...inv,
        consonants: step(inv.consonants).filter((p) => p.type === 'C'),
        vowels: step(inv.vowels).filter((p) => p.type === 'V'),
    };
}

/**
 * Build the candidate sequence for an edge. Depends ONLY on the seed and the
 * edge identity — never on dates, so re-dating cannot disturb it.
 */
export function candidateSequence(parentState, rng, opts = {}) {
    let inv = { consonants: parentState.inventory.consonants, vowels: parentState.inventory.vowels };
    const pt = parentState.phonotactics;
    const out = [];
    const usedCounts = new Map();
    let guard = 0;

    // The words a candidate is test-fired against. They evolve alongside the
    // ruleset, so a rule is judged against the language as it will be when the
    // rule actually runs — not as it was at the start of the edge.
    let probe = probeSet(parentState.entries || []).map((e) => ({ ...e, form: markStress(e.form, pt) }));

    while (out.length < CANDIDATE_DEPTH && guard++ < CANDIDATE_DEPTH * 8) {
        const pool = applicable(inv, pt, { probe }).filter((t) => {
            const n = usedCounts.get(t.id) || 0;
            // A change type can recur on a long branch — languages do lenite
            // twice — but not immediately, and not endlessly.
            return n < 2 && out[out.length - 1]?.templateId !== t.id;
        });
        if (!pool.length) break;

        const template = rng.pickWeighted(pool, (t) => t.weight);
        let spec = null;
        try { spec = template.build(inv, rng, pt, { probe }); } catch { spec = null; }
        if (!spec) { usedCounts.set(template.id, (usedCounts.get(template.id) || 0) + 1); continue; }

        const rule = makeRule({
            id: `${opts.idPrefix || 'r'}-${String(out.length + 1).padStart(2, '0')}`,
            category: template.category,
            template: template.id,
            label: spec.label,
            a: spec.a, b: spec.b, env: spec.env,
            probability: spec.probability ?? 1,
            conditions: spec.conditions ?? null,
            analogue: spec.analogue ?? null,
            note: spec.note ?? null,
        });
        rule.templateId = template.id;
        usedCounts.set(template.id, (usedCounts.get(template.id) || 0) + 1);

        // Reject a change that does nothing to this language. Counting it as
        // "used" first means the generator moves on instead of proposing the
        // same dead rule again.
        if (probe.length && !hasEffect(rule, probe, null)) continue;

        out.push(rule);
        inv = projectInventory(inv, rule);
        probe = probe.map((e) => {
            const res = applyRule(e.form, rule, { rootId: e.id, rank: e.rank, domain: e.domain, pos: e.pos });
            return res.applied ? { ...e, form: res.segments } : e;
        });

        // Paired changes must follow immediately. Tonogenesis is the case that
        // matters: a pitch difference conditioned by onset voicing is merely
        // allophonic until the voicing contrast is destroyed. Emitting the
        // first without the second gives a language with decorative pitch and
        // no tones at all.
        for (const partnerId of PAIRED[template.id] || []) {
            const partner = byId(partnerId);
            if (!partner || out.length >= CANDIDATE_DEPTH) continue;
            let pSpec = null;
            try { pSpec = partner.build(inv, rng, pt, { probe }); } catch { pSpec = null; }
            if (!pSpec) continue;
            const pRuleCandidate = makeRule({
                id: `${opts.idPrefix || 'r'}-${String(out.length + 1).padStart(2, '0')}`,
                category: partner.category, template: partner.id, label: pSpec.label,
                a: pSpec.a, b: pSpec.b, env: pSpec.env,
                probability: pSpec.probability ?? 1,
                analogue: pSpec.analogue ?? null, note: pSpec.note ?? null,
            });
            pRuleCandidate.templateId = partner.id;
            pRuleCandidate.pairedWith = rule.id;
            if (probe.length && !hasEffect(pRuleCandidate, probe, null)) continue;
            out.push(pRuleCandidate);
            inv = projectInventory(inv, pRuleCandidate);
            probe = probe.map((e) => {
                const res = applyRule(e.form, pRuleCandidate, { rootId: e.id, rank: e.rank, domain: e.domain, pos: e.pos });
                return res.applied ? { ...e, form: res.segments } : e;
            });
        }
    }
    return out;
}

/**
 * Generate the ChangeSet for an edge.
 *
 * @param edge          { childId, parentId, from, to, rate }
 * @param parentState   the parent stage
 * @param rng           a stream derived from (familySeed, childId, 'ruleset')
 */
export function generateChangeSet(edge, parentState, rng, opts = {}) {
    const duration = Math.max(0, (edge.to ?? edge.from) - edge.from);
    const rate = edge.rate ?? 1;
    const interval = intervalFor(rng, rate);

    const candidates = candidateSequence(parentState, rng, { idPrefix: edge.childId });
    const wanted = Math.max(1, Math.min(candidates.length, Math.round(duration / interval)));
    const rules = candidates.slice(0, wanted);

    // Spread the rules evenly across the span and jitter them, so the time
    // scrubber shows change arriving in a plausible dribble rather than all at
    // once. Dates are assigned AFTER selection, which is what lets an edge be
    // re-dated without its rules changing.
    const span = duration || 1;
    rules.forEach((r, i) => {
        const t = (i + 0.5) / rules.length;
        r.year = Math.round(edge.from + t * span);
        r.stageId = edge.childId;
    });

    return {
        childId: edge.childId,
        parentId: edge.parentId,
        from: edge.from,
        to: edge.to,
        rate,
        interval: Math.round(interval),
        generated: true,
        rules,
        candidateDepth: candidates.length,
    };
}

/**
 * Re-time an existing ChangeSet after its edge dates changed.
 *
 * The rules are untouched — only their years move. This is the whole promise of
 * "pinned, not rerolled": drag a box on the chart and the language you already
 * had stays the language you already had.
 */
export function retime(changeSet, from, to) {
    const span = Math.max(1, (to ?? from) - from);
    const rules = changeSet.rules.map((r, i) => ({
        ...r,
        year: Math.round(from + ((i + 0.5) / changeSet.rules.length) * span),
    }));
    return { ...changeSet, from, to, rules };
}

/**
 * Does this ChangeSet still suit its edge's duration?
 *
 * Reported rather than acted on. The panel shows a note; nothing regenerates
 * without being asked.
 */
export function rateWarning(changeSet) {
    const duration = Math.max(0, (changeSet.to ?? changeSet.from) - changeSet.from);
    const expected = duration / (changeSet.interval || 100);
    const actual = changeSet.rules.length;
    if (!duration || !actual) return null;
    const ratio = actual / Math.max(1, expected);
    if (ratio < 0.5) return `${actual} changes over ${duration} years is slow for this branch (about ${Math.round(expected)} expected) — regenerate to add more.`;
    if (ratio > 2) return `${actual} changes over ${duration} years is fast for this branch (about ${Math.round(expected)} expected).`;
    return null;
}
