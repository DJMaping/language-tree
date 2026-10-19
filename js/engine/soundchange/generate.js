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

import { applicable, PAIRED, PAIR_CHANCE, CONSONANT_EFFECT, byId } from './catalogue.js';
import { makeRule, segmentMatches, applyRule } from './rule.js';
import { applyDelta, parseWord, wordToIpa } from '../features.js';
import { markStress } from '../phonology/phonotactics.js';
import { planReplacements } from '../lexicon/replacement.js';
import { planColexification } from '../lexicon/colexify.js';
import { planShifts } from '../lexicon/semantics.js';
import { planLevellings } from '../morphology/analogy.js';
import { planGrammaticalisation, planCategoryLoss } from '../morphology/grammaticalisation.js';
import { planClassifiers } from '../morphology/classifiers.js';
import { planPronouns } from '../morphology/pronouns.js';
import { planSuppletion } from '../morphology/irregular.js';
import { planArticles } from '../morphology/articles.js';
import { planMoods } from '../morphology/moods.js';
import { planEvidentials } from '../morphology/evidentials.js';
import { derive } from '../rng.js';
import { phonemicConsonants } from '../phonology/phonemes.js';
import { isMoodCellEntry, isMoodWord } from '../morphology/paradigm.js';

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
const PROBE_SIZE = 530;

/**
 * A deterministic spread across the lexicon, not just the commonest words.
 *
 * Words that arrived DURING this edge are excluded, and that is not a detail.
 * A loan carries the year it entered, and `evolveWord` skips every rule dated
 * before it — so a word borrowed half way through an edge is exposed to only
 * half the changes on it. Judging "does this rule do anything" against such a
 * word asks whether it would apply to a word that may not have been there yet.
 *
 * Left unfiltered it produced exactly that: rules whose entire conditioning
 * environment was supplied by loans that arrived after the rule ran, which then
 * sat in the change log having changed nothing. Only words present at the START
 * of the edge are guaranteed to face every rule on it, so only they are
 * evidence.
 */
function probeSet(allEntries, edgeFrom = null) {
    // mood cells and mood words (morphology/moods.js) are left out, so adding them re-rolls nothing
    const entries = allEntries.filter((e) => !isMoodCellEntry(e) && !isMoodWord(e));
    const eligible = edgeFrom == null
        ? entries
        : entries.filter((e) => e.enteredAt == null || e.enteredAt <= edgeFrom);
    // If filtering leaves too little to judge by, fall back rather than
    // generating against nothing.
    const pool = eligible.length >= 20 ? eligible : entries;
    if (pool.length <= PROBE_SIZE) return pool;
    const step = pool.length / PROBE_SIZE;
    const out = [];
    for (let i = 0; i < PROBE_SIZE; i++) out.push(pool[Math.floor(i * step)]);
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
 * FUNCTIONAL LOAD: what a change would cost the lexicon in contrast.
 *
 * The share of the probe's distinct words that would fall together if the
 * rule ran: a merger that wipes out many minimal pairs, or a deletion that
 * leaves many words sounding alike. Wedel, Kaplan & Jackson (2013), across
 * the phoneme mergers of nine languages, found that the more minimal pairs a
 * contrast distinguishes, the less likely it is to merge; a contrast carrying
 * many pairs rarely goes, one carrying none goes freely.
 *
 * Without this the generator chose changes blind to their cost, and nothing
 * pushed back: about 42 new homophones per edge, until half of every living
 * lexicon shared its form with another word (Earth languages sit far lower).
 * Apocope, cluster simplification and final-consonant loss were the largest
 * single sources. They still happen; they are simply less likely to be chosen
 * where they would do the most damage.
 *
 * Inflected forms are left out of the count. Case syncretism by sound change
 * is how case systems collapse, and that collapse is meant to happen.
 */
const FUNCTIONAL_LOAD_SCALE = 0.006;

/**
 * The typology gate (DJ, 15 Oct 2026: tune toward Earth). Measured against
 * WALS, the generated languages ran rich: 91% had seven or more vowel
 * qualities where Earth has 33%, 69% had 26-33 consonants where Earth has
 * 17%, and 41% had complex tone where Earth has 17%. The proto-languages
 * start at Earth-like sizes; the changes after them kept adding.
 *
 * So each proposed change is weighed by how common the system it leads to is
 * on Earth, against how common the current one is (a Metropolis ratio,
 * capped at 1): a change towards a rarer system is proportionally less
 * likely, never forbidden, and a change towards a commoner one passes. The
 * frequencies are WALS's (chapters 1A, 2A, 13A), spread over single counts.
 */
export const EARTH_VOWELS = { 2: 1, 3: 4, 4: 11, 5: 30, 6: 21, 7: 12, 8: 7, 9: 5, 10: 4, 11: 2.5, 12: 1.5, 13: 1, 14: 0.6 };
const earthConsonants = (n) => (n < 6 ? 0.2 : n <= 14 ? 1.8 : n <= 18 ? 5.5 : n <= 25 ? 5.1 : n <= 33 ? 2.1 : n <= 40 ? 1.2 : 0.4);
const EARTH_FRONT_ROUNDED = { false: 93, true: 7 };   // WALS 11A
const TYPOLOGY_PULL = 2;
function systemCounts(inv) {
    const q = new Set(inv.vowels.map((v) => `${v.f.height}|${v.f.back}|${v.f.round}`)).size;
    const t = new Set(inv.vowels.map((v) => v.f.tone).filter((x) => x != null && x !== 0)).size;
    const fr = inv.vowels.some((v) => v.f.round && v.f.back === 1);
    return { v: q, c: inv.consonants.length, t, fr };
}
/**
 * The inventory plus the segments a change creates in the sample words. Only
 * an unconditioned change can remove a segment from the language (a merger);
 * a conditioned one (final vowels lost) leaves it elsewhere, however few
 * sample words happen to show it.
 */
function withProbeDelta(inv, before, after, rule) {
    const seg = (list) => { const m = new Map(); for (const e of list) for (const ph of e.form) if (ph.type === 'C' || ph.type === 'V') m.set(ph.ipa, ph); return m; };
    const b = seg(before), a = seg(after);
    const unconditioned = !rule.env || (!rule.env.before?.length && !rule.env.after?.length);
    const drop = new Set(unconditioned ? [...b.keys()].filter((k) => !a.has(k)) : []);
    const keep = (list) => list.filter((p) => !drop.has(p.ipa));
    const have = new Set([...inv.consonants, ...inv.vowels].map((p) => p.ipa));
    const add = [...a.values()].filter((p) => !b.has(p.ipa) && !have.has(p.ipa));
    return {
        ...inv,
        consonants: [...keep(inv.consonants), ...add.filter((p) => p.type === 'C')],
        vowels: [...keep(inv.vowels), ...add.filter((p) => p.type === 'V')],
    };
}

/**
 * Tone stays out: measured one vote per branch, as WALS samples, Andah's tone
 * already matched Earth's (58% none against 58%), and gating it too pushed it
 * to 77%. Vowels weigh heaviest, being furthest from Earth.
 */
function typicality({ v, c, fr }, consonantTarget = null, vowelTarget = null) {
    return vowelPull(v, vowelTarget) * consonantPull(c, consonantTarget) * EARTH_FRONT_ROUNDED[fr];
}

/**
 * A lineage with a vowel size of its own (project.js targetsOf: some branches
 * draw one from Earth's spread) is drawn to it, free within one of it; one
 * without leans to Earth's commonest sizes. Without per-branch sizes the
 * family's five or six vowels held everywhere: 1% of Andah's branches had a
 * small system (2-4 qualities) against 16% on Earth.
 */
function vowelPull(v, target) {
    if (!target) return Math.pow(EARTH_VOWELS[Math.max(2, Math.min(14, v))] ?? 0.5, 1.5);
    return Math.exp(-Math.max(0, Math.abs(v - target) - 1) / 1.2);
}

/**
 * The size lean (DJ, 17 Oct 2026: "drift further", Polynesian-small or
 * Caucasian-large over the millennia). The gate can only refuse a change, and
 * a branch makes about ten in a thousand years, so a lineage drawn to a size
 * well away from its own never got there: Dahen-Kino's branches, drawn from 9
 * to 44 consonants, all ended between 18 and 28. So the CHOICE leans too: a
 * lineage short of its size picks the splits that leave new consonants
 * behind more often, one over it the mergers (catalogue CONSONANT_EFFECT),
 * up to about three times as often six or more away. Real lineages show the
 * same persistence: Polynesian kept merging for two thousand years, the
 * Caucasus kept splitting.
 */
const SIZE_LEAN = 1.6;
function sizeLean(n, target) {
    if (target == null) return 0;
    return SIZE_LEAN * Math.max(-1, Math.min(1, (target - n) / 6));
}

/**
 * How much more of its change a lineage far from its size spends on getting
 * there: up to half as many size-changing picks again, six or more away, and
 * none extra at its size. Lineages that commit to a size move fast: Proto-
 * Oceanic to Proto-Polynesian lost about ten consonants in 1,000-1,500 years
 * through a run of mergers; Middle Chinese lost its voiced series and a run of
 * initials in a millennium on the way to Mandarin; Russian gained a soft
 * partner for most consonants in a few centuries. Holding the share fixed, the
 * engine's lineages moved 2-3 consonants a millennium even six away.
 */
const SIZE_SHARE = 0.5;

/**
 * Open syllables (project.js targetsOf): in a lineage drawn to (C)V, a
 * change that closes syllables is refused the likelier the more words it
 * closes, and the repairs come the more readily the more words are still
 * closed (up to fifteen times as readily, as the size lean pulls hardest
 * furthest from its size): a lineage that turned open with codas in most of
 * its words kept them for three thousand years when only new codas were
 * refused. The share counted is WALS 12A's: a final consonant or a cluster
 * (a long consonant is one, and a glide after a vowel is a diphthong's).
 */
const OPEN_GATE = 150;
const OPEN_REPAIRS = new Set(['anaptyxis', 'cluster-simplification', 'cluster-assimilation', 'glide-coalescence', 'glide-loss', 'paragoge', 'final-consonant-loss', 'degemination']);
const GLIDES = new Set(['j', 'w', 'ɥ', 'ɰ']);
/**
 * Changes whose forced partner deletes vowels (umlaut and pitch accent,
 * both paired with apocope): in an open-syllable lineage they are not drawn
 * at all, since a partner follows without passing the gates. Through them
 * Irrans, open for three thousand years, lost its final vowels twice.
 */
/** Vowel losses that build clusters, and the repairs that undo them: a closed lineage's weights. */
const CLOSING = new Set(['syncope', 'apocope', 'schwa-syncope', 'reduction-to-schwa', 'pretonic-syncope']);
const closesThroughPartner = (id) => (PAIRED[id] || []).some((p) => p === 'apocope' || p === 'syncope');
function closedShare(list) {
    let words = 0, closed = 0;
    for (const e of list) {
        const f = e.form;
        if (!f?.length || !f.some((ph) => ph.type === 'V')) continue;
        words += 1;
        let run = 0, last = null, seenV = false, hit = false;
        for (const ph of f) {
            if (ph.type === 'V') { if (run >= 2) hit = true; run = 0; last = ph; seenV = true; continue; }
            if (last && last.type === 'C' && last.ipa === ph.ipa) continue;
            if (run === 0 && seenV && GLIDES.has(ph.ipa)) { last = ph; continue; }
            run += 1;
            last = ph;
        }
        if (hit || run >= 1) closed += 1;
    }
    return words ? closed / words : 0;
}

/**
 * Families keep their size class: Polynesian languages are all small,
 * Caucasian ones all large. Left to itself the generator grows any system
 * back towards twenty-odd (a family sized at 13 had daughters at 28), so a
 * family with a size of its own (lang-config consonantTarget, see
 * scripts/assign-consonants.js) is drawn back to it: free within two of it,
 * then less and less likely to drift further. Without one, Earth's spread.
 */
function consonantPull(c, target) {
    if (!target) return earthConsonants(c);
    return Math.exp(-Math.max(0, Math.abs(c - target) - 1) / 1.5);
}
const plainIpa = (form) => wordToIpa(form).replace(/[ˈˌ]/gu, '');

function contrastLoss(probe, results) {
    const before = new Set();
    const after = new Set();
    let n = 0;
    probe.forEach((e, i) => {
        if (e.paradigm) return;
        n++;
        before.add(plainIpa(e.form));
        const res = results[i];
        after.add(plainIpa(res.applied && res.segments.length ? res.segments : e.form));
    });
    if (n < 20) return 0;
    return Math.max(0, before.size - after.size) / before.size;
}

/**
 * Years per significant change. The band is drawn once per edge and then held,
 * so a branch has a consistent tempo rather than a jittery one — some lineages
 * really are more conservative than others, and that should be a property of
 * the branch rather than of each individual century.
 */
function intervalFor(rng, rate = 1) {
    // Measured at uniform(50,150) the families ran at 9-12 changes per
    // millennium against Earth's rough 15-30. uniform(40,110) has a mean near
    // 75 years, i.e. ~13 per millennium at rate 1 -- and with the branch-rate
    // spread the fast lineages reach 25+ while the conservative ones stay
    // under 8, which is the range Earth actually shows.
    return rng.float(40, 110) / Math.max(0.1, rate);
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
    // the language's type: tone layers freely only in isolating languages (catalogue.js mayStack)
    const morphology = parentState.paradigm?.categories?.type ?? null;
    const out = [];
    const usedCounts = new Map();
    let guard = 0;

    // The words a candidate is test-fired against. They evolve alongside the
    // ruleset, so a rule is judged against the language as it will be when the
    // rule actually runs — not as it was at the start of the edge.
    let probe = probeSet(parentState.entries || [], opts.edgeFrom ?? null)
        .map((e) => ({ ...e, form: markStress(e.form, pt) }));

    /**
     * The consonant count the size lean, the crowding and the typology gate
     * steer by: the one the ruler measures (phonemes.js, WALS 1A's phonemes),
     * moved by what the sample words show. The projected inventory counted
     * every conditioned variant as a new consonant and never removed one a
     * conditioned change used up, so by the end of an edge it ran 1.6 high
     * (6 on some lineages): mergers passed as moves towards the target, and
     * lineages near their size drifted down a consonant a millennium
     * (Proto-Dahen-Kino, sized at 25, measured 20 by its end). The sample's
     * distinct consonants, not its phonemic count: a new variant soon
     * contrasts somewhere in the whole lexicon (loans, compounds, levelling).
     */
    const surf = (list) => { const s = new Set(); for (const e of list) for (const ph of e.form) if (ph.type === 'C') s.add(ph.ipa); return s.size; };
    const open = !!opts.openSyllables;
    const heavy = !open && !!opts.closedSyllables;
    let closedNow = open ? closedShare(probe) : 0;
    const offset = phonemicConsonants(parentState.entries || []).consonants.length - surf(probe);
    let cNow = surf(probe) + offset;

    while (out.length < CANDIDATE_DEPTH && guard++ < CANDIDATE_DEPTH * 8) {
        /**
         * A change type can recur on a long branch (languages do lenite
         * twice) but not immediately, and not endlessly: twice, and once more
         * for every sixteen changes the edge has made. A flat two, with every
         * attempt counted, emptied the common changes on the long edges (a
         * proto lifetime of 3,000-4,500 years makes 30-64), and the rest of
         * the edge drew whatever was left whatever its weight: tone births
         * and losses were 0.3% of the first 32 changes of an edge and 22% of
         * changes 48-63, so a family's tone was decided by where its proto's
         * long life ran out, and ejectives, rare by weight, filled the tails.
         */
        const cap = 2 + Math.floor(out.length / 16);
        const pool = applicable(inv, pt, { probe, morphology }).filter((t) => {
            const n = usedCounts.get(t.id) || 0;
            return n < cap && out[out.length - 1]?.templateId !== t.id && !(open && closesThroughPartner(t.id));
        });
        if (!pool.length) break;

        // A template may scale its own weight against the current language --
        // merger pressure rises with a crowded inventory. See crowding().
        const lean = sizeLean(cNow, opts.consonantTarget);
        const base = new Map(pool.map((t) => {
            let w = t.weight * (opts.drift?.[t.id] ?? 1) * (open && OPEN_REPAIRS.has(t.id) ? 3 * (1 + 4 * closedNow) : 1)
                * (heavy ? (CLOSING.has(t.id) ? 3 : OPEN_REPAIRS.has(t.id) ? 0.25 : 1) : 1);
            if (typeof t.dynamicWeight === 'function') {
                try { w *= t.dynamicWeight(inv, pt, { probe, morphology, open, consonantTarget: opts.consonantTarget, consonantCount: cNow }); } catch { /* keep base weight */ }
            }
            return [t, w];
        }));
        // The lean moves choice WITHIN the changes that alter the consonant
        // count; their share of all choices stays as it was, or they crowd
        // out everything else (tone births fell by half when they did).
        let before = 0, after = 0;
        for (const [t, w] of base) if (CONSONANT_EFFECT[t.id]) { before += w; after += w * Math.exp(lean * CONSONANT_EFFECT[t.id]); }
        const norm = after > 0 ? (before / after) * (1 + SIZE_SHARE * Math.abs(lean) / SIZE_LEAN) : 1;
        const template = rng.pickWeighted(pool, (t) => {
            const e = CONSONANT_EFFECT[t.id];
            return e ? base.get(t) * Math.exp(lean * e) * norm : base.get(t);
        });
        let spec = null;
        try { spec = template.build(inv, rng, pt, { probe, morphology, open }); } catch { spec = null; }
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

        // What the change does to real words, once: the gates below and the
        // probe after it all read this one pass.
        const results = probe.map((e) => applyRule(e.form, rule, { rootId: e.id, rank: e.rank, domain: e.domain, pos: e.pos }));

        // The functional-load gate: soft, so a costly change is rarer, not banned.
        // A lineage leaning to a smaller system bears its mergers' homophones
        // more readily (Hawaiian merged t into k and k into ʔ regardless, and
        // its words grew longer to carry the load): up to about four times.
        const loss = probe.length ? contrastLoss(probe, results) : 0;
        const tolerance = CONSONANT_EFFECT[template.id] === -1 ? 1 + 2 * Math.max(0, -lean) : 1;
        if (loss > 0 && rng.float(0, 1) > Math.exp(-loss / (FUNCTIONAL_LOAD_SCALE * tolerance))) continue;

        const nextProbe = probe.map((e, i) => (results[i].applied ? { ...e, form: results[i].segments } : e));
        let closedNext = closedNow;
        if (open && probe.length) {
            closedNext = closedShare(nextProbe);
            if (closedNext > closedNow && rng.float(0, 1) > Math.exp(-(closedNext - closedNow) * OPEN_GATE)) continue;
        }
        // The typology gate: towards rarer systems on Earth, less likely. The
        // inventory it judges is the projected one corrected by what the words
        // show: segments the probe gains or loses. Projection alone is blind to
        // sequence rules (ai > ɛ: a monophthongisation makes a new vowel).
        let next = projectInventory(inv, rule);
        const cNext = surf(nextProbe) + offset;
        const pull = opts.typologyPull ?? TYPOLOGY_PULL;
        if (pull > 0 && probe.length) {
            next = withProbeDelta(next, probe, nextProbe, rule);
            const ratio = typicality({ ...systemCounts(next), c: cNext }, opts.consonantTarget, opts.vowelTarget)
                / Math.max(1e-9, typicality({ ...systemCounts(inv), c: cNow }, opts.consonantTarget, opts.vowelTarget));
            if (ratio < 1 && rng.float(0, 1) > Math.pow(ratio, pull)) continue;
        }

        out.push(rule);
        inv = next;
        probe = nextProbe;
        cNow = cNext;
        closedNow = closedNext;

        // Paired changes must follow immediately. Tonogenesis is the case that
        // matters: a pitch difference conditioned by onset voicing is merely
        // allophonic until the voicing contrast is destroyed. Emitting the
        // first without the second gives a language with decorative pitch and
        // no tones at all.
        for (const partnerId of PAIRED[template.id] || []) {
            const partner = byId(partnerId);
            if (!partner || out.length >= CANDIDATE_DEPTH) continue;
            const pc = PAIR_CHANCE[partnerId];
            const chance = typeof pc === 'function' ? pc(inv, pt, { probe, morphology }) : pc;
            if (chance != null && !rng.bool(chance)) continue;
            let pSpec = null;
            try { pSpec = partner.build(inv, rng, pt, { probe, morphology }); } catch { pSpec = null; }
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
            cNow = surf(probe) + offset;
            if (open) closedNow = closedShare(probe);
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

    /**
     * Plan against the lexicon the child will actually HAVE.
     *
     * `evolve()` drops any inherited entry that reached the parent after this
     * child split off, so planning against the parent's full entry list chose
     * targets that were about to vanish. `applyReplacements` then hit its
     * `if (!fromEntry || !toEntry) continue` guard and skipped without a word:
     * 40 of 163 replacements and 2 of 7 shifts were being silently dropped on
     * affected edges, and one edge lost 9 of its 11.
     *
     * The same predicate as evolve() uses, so planning and application see one
     * lexicon rather than two.
     */
    const inherited = (parentState.entries || [])
        .filter((e) => e.enteredAt == null || e.enteredAt <= (edge.to ?? edge.from));
    const planningState = inherited.length === (parentState.entries || []).length
        ? parentState
        : { ...parentState, entries: inherited };
    const rate = edge.rate ?? 1;
    const interval = intervalFor(rng, rate);

    // Rule ids feed the diffusion and inhibition draws, so they are built from
    // the stable key, not the display id a rename would change.
    const candidates = candidateSequence(parentState, rng, { idPrefix: edge.ruleKey ?? edge.childId, edgeFrom: edge.from, drift: edge.drift, consonantTarget: edge.consonantTarget, vowelTarget: edge.vowelTarget, openSyllables: edge.openSyllables, closedSyllables: edge.closedSyllables });
    const wanted = Math.max(1, Math.min(candidates.length, Math.round(duration / interval)));
    // Never cut a pair: a tonogenesis whose devoicing (or apocope) falls past
    // the cut leaves pitch still predictable from its context, allophonic and
    // not a toneme, yet counted as tone (2 of 23 voicing tonogeneses were).
    // The cut still depends only on the duration, so re-dating stays stable.
    let n = wanted;
    while (n < candidates.length && candidates[n].pairedWith && candidates.slice(0, n).some((r) => r.id === candidates[n].pairedWith)) n += 1;
    const rules = candidates.slice(0, n);

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

    /**
     * Lexical replacement is part of the CHANGESET, not a separate pass — so it
     * is pinned, dated, deterministic and re-timeable exactly like a sound
     * change, and shows in the change log beside them.
     */
    const replacements = [
        ...planReplacements(planningState, derive_(rng), { from: edge.from, to: edge.to, rate }),
    ];
    // one word for two meanings or two (lexicon/colexify.js), never for a meaning replaced anyway
    replacements.push(...planColexification(planningState, derive(rng.seedLabel, 'colexify'), {
        from: edge.from, to: edge.to, rate, exclude: new Set(replacements.flatMap((r) => [r.from, r.to]).filter(Boolean)),
    }));
    replacements.sort((x, y) => x.year - y.year);

    /**
     * Free semantic drift, on the same footing.
     *
     * Distinct from replacement: here a word changes meaning and nothing takes
     * over the one it left, so the language stops having a word for that
     * concept. Confined to non-core vocabulary, where a gap is unremarkable —
     * every language has concepts it does not lexicalise. This is where false
     * friends come from, because the drift happens on one branch and not on its
     * sister.
     */
    const shifts = planShifts(planningState, derive_(rng), { from: edge.from, to: edge.to, rate });

    /**
     * Analogical levelling — a REACTION to the ruleset, so it is planned last
     * and against a projection of what those rules will do to the paradigm.
     *
     * This is where the fast tail of morphological erosion comes from. Sound
     * change merges two endings in one declension; analogy then carries that
     * merger to the others, and a case disappears from the language rather than
     * from one class of nouns.
     */
    const levellings = planLevellings(planningState, rules, derive_(rng), { from: edge.from, to: edge.to, rate });

    /**
     * Renewal and outright category loss — the two halves of grammar changing
     * rather than merely decaying.
     *
     * They are rolled INDEPENDENTLY and that is deliberate. A language that has
     * just lost its dative does not thereby acquire a replacement: coupling the
     * two would make the engine steer towards a target inventory of categories,
     * which is the teleology this whole design forbids. Sometimes a family
     * loses three cases and grows nothing for four thousand years. That is a
     * fact about the family.
     */
    const grammaticalisations = [
        ...planGrammaticalisation(planningState, derive_(rng), { from: edge.from, to: edge.to, rate }),
        ...planCategoryLoss(parentState, rules, derive_(rng), { from: edge.from, to: edge.to, rate }),
    ];

    /**
     * Numeral classifiers (morphology/classifiers.js), planned last so that
     * every draw above stays as it was.
     */
    const classifiers = planClassifiers(planningState, derive_(rng), { from: edge.from, to: edge.to, rate, key: edge.ruleKey ?? edge.childId });
    // and pronouns (morphology/pronouns.js), last of all for the same reason
    const pronouns = planPronouns(planningState, derive_(rng), { from: edge.from, to: edge.to, rate });
    // and suppletion (morphology/irregular.js)
    const suppletions = planSuppletion(planningState, derive_(rng), { from: edge.from, to: edge.to, rate });
    // and articles (morphology/articles.js)
    const articles = planArticles(planningState, derive_(rng), { from: edge.from, to: edge.to, rate });
    // moods (morphology/moods.js), on a stream of their own so they move no other draw
    const moods = planMoods(planningState, derive(rng.seedLabel, 'moods'), { from: edge.from, to: edge.to, rate, replacements });
    // evidentials (morphology/evidentials.js), on their own stream too; a perfect grown on
    // this edge can turn non-firsthand after it arrives
    const evidentials = planEvidentials(planningState, derive(rng.seedLabel, 'evidentials'), { from: edge.from, to: edge.to, rate, pending: grammaticalisations });

    return {
        childId: edge.childId,
        parentId: edge.parentId,
        seed: edge.ruleKey ?? edge.childId,
        from: edge.from,
        to: edge.to,
        rate,
        replacements,
        shifts,
        levellings,
        grammaticalisations,
        classifiers,
        pronouns,
        suppletions,
        articles,
        moods,
        evidentials,
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
/** A branched stream so replacements do not consume the ruleset's draws. */
function derive_(rng) { return rng; }

export function retime(changeSet, from, to) {
    const span = Math.max(1, (to ?? from) - from);
    const rules = changeSet.rules.map((r, i) => ({
        ...r,
        year: Math.round(from + ((i + 0.5) / changeSet.rules.length) * span),
    }));
    // Replacements and semantic shifts are re-timed too; like rules they are
    // never rerolled.
    // a system's steps keep their spacing (rise, then use, then growth)
    const rescale = (list) => (list || []).map((ev) => ({
        ...ev,
        year: Math.round(from + ((ev.year - changeSet.from) / Math.max(1, (changeSet.to ?? changeSet.from) - changeSet.from)) * span),
    }));
    const respread = (list) => (list || []).map((r, i) => ({
        ...r,
        year: Math.round(from + ((i + 0.5) / Math.max(1, list.length)) * span),
    }));
    return {
        ...changeSet, from, to, rules,
        replacements: respread(changeSet.replacements),
        shifts: respread(changeSet.shifts),
        levellings: respread(changeSet.levellings),
        grammaticalisations: respread(changeSet.grammaticalisations),
        classifiers: rescale(changeSet.classifiers),
        pronouns: rescale(changeSet.pronouns),
        suppletions: rescale(changeSet.suppletions),
        articles: rescale(changeSet.articles),
        moods: rescale(changeSet.moods),
        evidentials: rescale(changeSet.evidentials),
    };
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
