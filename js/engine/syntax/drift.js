/**
 * Word order changing, and the three things that make it change.
 *
 * ## The trap this module is built to avoid
 *
 * The obvious implementation is a die roll: every so often, a language swaps its
 * basic order. That would be worse than leaving syntax static, because it would
 * put a *label* on the change without a *reason* for it, and the reasons are the
 * only interesting part. Word order change is rare — Proto-Indo-European to
 * English is one change in five and a half thousand years — and when it happens
 * it happens for causes that are documented and that this engine already
 * computes.
 *
 * So there are exactly three mechanisms here, and a language with none of them
 * operating keeps its syntax forever, which is the correct and common outcome.
 *
 * ## 1. Rigidification, when the case system stops distinguishing the arguments
 *
 * This is the big one and it is the Latin-to-Romance story told properly.
 *
 * The usual summary — "Latin lost its cases and so the order fixed" — is one
 * step too coarse. What mattered was not how many cases there were but whether
 * the *nominative and accusative* were still distinct, because those are the two
 * that say which noun is doing the verb and which is having it done to them.
 * Latin kept an ablative and a genitive long after subject and object had fallen
 * together in most declensions, and it is the nominative/accusative collapse
 * that word order had to compensate for.
 *
 * The engine already builds paradigms as real inflected words and already
 * detects when two cells have become homophonous. So the trigger here is
 * measured, not asserted: the share of noun classes in which NOM.SG and ACC.SG
 * are still distinct forms.
 *
 * **Why this is not the teleology the repo forbids.** Standing rule 3 bans a
 * language that changes *in order to reach* a state. Nothing here reaches for
 * anything. A language with case marking has a licence to scramble its
 * constituents; when the marking goes, the licence goes with it, and what is
 * left is whichever order was already dominant. It is the removal of a freedom,
 * not the pursuit of a goal — and crucially the resulting order is drawn from
 * what the language was already doing (see `PRAGMATIC_ALTERNATIVES`), never
 * chosen because it would work better.
 *
 * ## 2. Areal pressure
 *
 * Word order is the classic areal feature — it spreads between neighbouring
 * languages that are not related. Ethiopian Semitic went SOV surrounded by
 * Cushitic while its Semitic relatives stayed VSO. Akkadian went SOV under
 * Sumerian. The Balkan sprachbund shares a postposed article across four
 * families.
 *
 * `contact.js` already produces areal contact events off the chart's dashed
 * arrows, and already understands that a sprachbund transfers structure rather
 * than vocabulary — it says so, and then lists only tone and syllable canon
 * because the syntax layer did not exist. This is the entry it was waiting for.
 *
 * ## 3. Realignment after a change — Greenberg drift
 *
 * When the basic order moves, the correlated parameters do not move with it.
 * They realign afterwards, one at a time, over centuries, which is why languages
 * are caught mid-transition so often: Mandarin is SVO with prenominal relatives
 * and postpositions because it is part-way through, and has been for a long
 * time. English kept verb-final subordinate order for centuries after main
 * clauses had flipped.
 *
 * So a basic-order change here does not drag its correlates along. It creates
 * *pressure*, and the correlates realign on later edges with a probability
 * proportional to how strongly each one is normally correlated. The strongest
 * correlate — adpositions — moves first and the weakest — adjective order —
 * often never moves at all, which is exactly the observed pattern.
 */

import { CORRELATES, PRAGMATIC_ALTERNATIVES, stiffen, BASIC_ORDERS, NEGATION, QUESTION, AFFIXAL, harmonicP, orderOf } from './parameters.js';
import { isParadigmEntry, parseCellId } from '../morphology/paradigm.js';

/**
 * The share of noun classes still distinguishing subject from object.
 *
 * The measure that licenses free word order. Returns null when the language has
 * no case system to measure, which is a different fact from having one that has
 * collapsed — an isolating proto never had the licence in the first place and
 * nothing about it is changing.
 */
export function coreCaseDistinctness(paradigm) {
    if (!paradigm?.classes) return null;
    const core = paradigm.categories?.alignment === 'erg-abs' ? ['ABS', 'ERG'] : ['NOM', 'ACC'];
    let classes = 0, distinct = 0;

    for (const c of Object.values(paradigm.classes)) {
        // a common noun's own paradigm is a relic, not the system (morphology/irregular.js)
        if (c.pos !== 'n' || c.irregular) continue;
        const cells = c.cells || {};
        const a = cells[`${core[0]}.SG`];
        const b = cells[`${core[1]}.SG`];
        if (!a || !b) continue;
        classes += 1;
        if ((a.key ?? a.ipa) !== (b.key ?? b.ipa)) distinct += 1;
    }
    if (!classes) return null;
    return { share: distinct / classes, classes, distinct, cases: core };
}

/**
 * Does an areal contact exert word-order pressure?
 *
 * Only when the donor and the recipient differ in head direction. Two SVO
 * languages in contact transfer plenty of things; a basic order is not one of
 * them, because there is nothing to transfer.
 */
export function arealOrderPressure(donorSyntax, recipientSyntax) {
    if (!donorSyntax || !recipientSyntax) return null;
    if (donorSyntax.order === recipientSyntax.order) return null;
    if (donorSyntax.headFinal === recipientSyntax.headFinal) {
        // Same branching direction, different order — a weak pressure at most,
        // and not the kind that reorganises a grammar.
        return null;
    }
    return {
        order: donorSyntax.order,
        headFinal: donorSyntax.headFinal,
        note: `contact with a ${donorSyntax.order} language of the opposite head direction`,
        analogue: 'Ethiopian Semitic went SOV surrounded by Cushitic while its relatives stayed VSO; Akkadian went SOV under Sumerian',
    };
}

/** How readily each kind of contact passes grammar on (planSyntaxChange, project.js contactGrammar). */
const CONTACT_GRAMMAR = { superstrate: 0.5, loan: 1, areal: 1, substrate: 1.5 };
/** One contact's pull on grammar: by its kind, rising with its strength (1 at strength 2 for a neighbour). */
export const contactWeight = (a, rate = 1) => (CONTACT_GRAMMAR[a.kind] ?? CONTACT_GRAMMAR.loan) * Math.min(1.6, Math.pow((a.strength ?? 1) / 2, 1.2)) * rate;
/**
 * What contact moves, and how readily at strength 2: the orders inside the
 * noun phrase and the marking of questions and "not" the most, the
 * adposition and the relative clause (which follow the verb) the least.
 */
const CONTACT_PARAMS = [
    ['demonstrative', 0.15], ['numeral', 0.12], ['polar', 0.12], ['adjective', 0.12], ['question', 0.1],
    ['genitive', 0.08], ['negation', 0.08], ['comparative', 0.06], ['adposition', 0.04], ['relative', 0.04],
];
const CONTACT_LABEL = {
    demonstrative: '"this" and "that" now stand', numeral: 'numerals now stand', polar: 'yes-no questions now marked',
    adjective: 'adjectives now stand', question: 'the question particle now stands', genitive: 'the possessor now stands',
    negation: '"not" now stands', comparative: 'comparison now built', adposition: 'adpositions now stand', relative: 'relative clauses now stand',
};
const CONTACT_ANALOGUE = {
    demonstrative: 'demonstrative and numeral orders follow neighbours more than the verb (Dryer)',
    numeral: 'demonstrative and numeral orders follow neighbours more than the verb (Dryer)',
    polar: 'mainland South-East Asia asks with sentence-final particles across four families',
    question: 'mainland South-East Asia asks with sentence-final particles across four families',
    adjective: 'Romanian, Albanian and Greek placed the adjective as their Balkan neighbours did',
    negation: 'where "not" goes clusters by area on the WALS maps (143A), across families',
};

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

/**
 * Plan the syntactic changes on one edge.
 *
 * Returns dated events for the ChangeSet, so syntax is pinned, deterministic and
 * re-timeable exactly like a sound change, a replacement or a sense shift, and
 * shows in the change log beside them.
 *
 * @param parentState  the stage the edge starts from
 * @param childCases   core-case distinctness measured on the CHILD's paradigm,
 *                     i.e. after this edge's sound changes have run
 * @param rng          a stream derived from (familySeed, childId, 'syntax')
 */
export function planSyntaxChange(parentState, childCases, rng, { from, to, rate = 1, areal = [] } = {}) {
    const syntax = parentState.syntax;
    if (!syntax) return [];

    const events = [];
    const span = Math.max(1, (to ?? from) - from);
    const at = (t) => Math.round(from + t * span);
    let current = { ...syntax };

    // ── 1. Rigidification ──────────────────────────────────────────────────
    const parentCases = coreCaseDistinctness(parentState.paradigm);
    if (parentCases && childCases && current.freedom !== 'rigid') {
        const lost = parentCases.share - childCases.share;
        /**
         * The trigger is the FALL, not the level. A language that has been at
         * 40% distinctness for three thousand years has already adjusted to it;
         * what forces a change is the distinction going away during this edge.
         * Scaled by the branch rate, because a fast branch does everything fast.
         */
        const pressure = Math.max(0, lost) * 2.2 + Math.max(0, 0.5 - childCases.share) * 0.8;
        if (rng.bool(Math.min(0.85, pressure * rate))) {
            const next = stiffen(current.freedom, 1);
            if (next !== current.freedom) {
                events.push({
                    year: at(0.45),
                    parameter: 'freedom',
                    from: current.freedom,
                    to: next,
                    cause: 'case-loss',
                    note: `subject and object are distinct in only ${Math.round(childCases.share * 100)}% of noun classes, down from ${Math.round(parentCases.share * 100)}% — word order takes over the work the endings were doing`,
                    analogue: 'Latin\'s nominative and accusative fell together across most declensions, and Romance word order rigidified around what was already the commonest arrangement',
                });
                current = { ...current, freedom: next };
            }
        }

        /**
         * A language that has just become RIGID fixes on whichever order it was
         * already using most. That is where a basic-order change can happen —
         * and only there, because the alternatives are the ones it already had.
         */
        if (current.freedom === 'rigid' && syntax.freedom !== 'rigid') {
            const alternatives = PRAGMATIC_ALTERNATIVES[current.order] || [];
            // Most of the time the dominant order was the basic one all along
            // and rigidifying changes nothing about which order it is.
            if (alternatives.length && rng.bool(0.35)) {
                const next = rng.pick(alternatives);
                events.push({
                    year: at(0.6),
                    parameter: 'order',
                    from: current.order,
                    to: next,
                    cause: 'rigidification',
                    note: `${next} was the pragmatically unmarked alternative while the order was still free; when the case cues went, it was the arrangement left standing`,
                    analogue: 'Latin was basic SOV with SVO as its unmarked alternative, and every Romance language rigidified into SVO rather than into anything else',
                });
                current = { ...current, order: next, headFinal: BASIC_ORDERS[next].headFinal };
            }
        }
    }

    // ── 1b. Dominance within a free order ──────────────────────────────────
    /**
     * A free order can settle on one arrangement as the usual one without
     * stiffening (Russian's SVO), and a free order with a usual one can lose
     * it to topic and focus (Hungarian). Settling is the commoner: about a
     * third of free orders lack a dominant one at any time. Stiffening ends
     * the question (applySyntaxChanges): a flexible or rigid order is
     * dominant by definition.
     */
    if (current.freedom === 'free') {
        const settle = current.dominant === false;
        // losing the usual order to topic and focus 0.06 -> 0.1 (18 Oct 2026): 8% of
        // Andah had no dominant order against WALS 81A's 14%
        const p = (settle ? 0.12 : 0.1) * (span / 1000) * rate;
        if (rng.bool(Math.min(0.5, p))) {
            events.push({
                year: at(0.5),
                parameter: 'dominant',
                from: !settle,
                to: settle,
                cause: settle ? 'conventionalisation' : 'discourse-order',
                note: settle
                    ? `${current.order}, already the commonest arrangement, became the usual one; the others now mark emphasis`
                    : `with the case endings carrying who did what, the order came to follow topic and focus, and ${current.order} stopped being the usual one`,
                analogue: settle
                    ? 'Russian keeps a free order with SVO as its neutral arrangement; Old Russian’s was freer'
                    : 'Hungarian places the focused phrase straight before the verb and the topic first, so no order of subject, verb and object is basic',
            });
            current = { ...current, dominant: settle };
        }
    }

    // ── 1d. Verb fronting ──────────────────────────────────────────────────
    /**
     * Where the verb carries its subject's person, the subject can be left
     * out or put after the verb, and a flexible SVO language can come to put
     * the verb first by default: Insular Celtic made verb-first its basic
     * order (Welsh, Irish), as Classical Arabic and the Berber languages have
     * it. A reason, not a die roll: no agreement, or a rigid order, and it
     * never happens. Without it verb-first came almost only from the proto
     * draws of the small families: 3% of Andah against WALS 81A's 7%.
     */
    const cats = parentState.paradigm?.categories;
    const agrees = (cats?.persons?.length || 0) >= 3 && cats?.type !== 'isolating';
    if (current.order === 'SVO' && current.freedom !== 'rigid' && agrees && !events.some((e) => e.parameter === 'order')
        && rng.bool(Math.min(0.3, 0.07 * (span / 1000) * rate))) {
        events.push({
            year: at(0.5),
            parameter: 'order',
            from: 'SVO',
            to: 'VSO',
            cause: 'verb-fronting',
            note: 'with the verb carrying the subject\'s person, the subject was often left out or put after it, and verb-first became the usual order',
            analogue: 'Welsh and Irish put the verb first (Welsh gwelodd y dyn y ci, "saw the man the dog"), as Classical Arabic and Berber do',
        });
        current = { ...current, order: 'VSO', headFinal: false };
    }

    // ── 1c. Jespersen's cycle, and the question ────────────────────────────
    /**
     * Negation renews itself in a cycle (Jespersen 1917): a particle before
     * the verb wears down and is propped up by a second word after it (Old
     * French "jeo ne di" > "je ne dis pas", "not a step"), then the old one
     * drops away (colloquial "je dis pas"), and a new one may grow in front
     * again. A particle hard by the verb can also fuse into it (Latin "non"
     * as a free word, Slavic ne- a prefix). Slow: a step every two or three
     * thousand years at most. Question marking moves too, more rarely: a
     * final particle wears into a verb ending, an intonation language takes
     * up a particle.
     */
    /**
     * As a cycle with a resting place: a stage like French "ne ... pas" is
     * passed through quickly, a particle before the verb lasts longest, and
     * an affix is renewed by a new particle once it has worn thin. Each state
     * leaves at its own pace (NEG_PACE), which over long histories gives
     * about Earth's mix: half before the verb, a sixth after, a sixth
     * prefixes, a tenth suffixes, a few doubles.
     */
    // a negative verb comes from a "not" before the verb taking the verb's endings (the Uralic *e-), and goes
    // when it stops taking them (Estonian ei, the same for every person) or bonds to the verb as a prefix
    const NEG_STEP = { before: [['double', 0.5], ['prefix', 0.45], ['aux', 0.05]], double: [['after', 1]], after: [['before', 0.6], ['suffix', 0.4]], prefix: [['before', 1]], suffix: [['before', 0.5], ['after', 0.5]], aux: [['before', 0.6], ['prefix', 0.4]] };
    // affixes and the double stage last longer (18 Oct 2026): at 0.7 and 3 the cycle rested at 68%
    // particles, 28% affixes and 4% double against WALS 112A's 49%, 39% and 11%
    const NEG_PACE = { before: 0.5, double: 1, after: 1, prefix: 0.4, suffix: 0.4, aux: 0.3 };
    // an isolating language renews with words, never affixes
    const isolating = parentState.paradigm?.categories?.type === 'isolating';
    const open = (steps) => (steps || []).filter((x) => !isolating || !AFFIXAL.has(x[0]));
    /**
     * A step the language cannot take is not taken, rather than taken as
     * another: an isolating language leaves a particle before the verb only
     * for the double stage, at half the pace (the prefix's half is closed to
     * it). Redirected, it stood in "ne ... pas" a quarter of the time: 15% of
     * Andah had double negation against WALS 112A's 10%.
     */
    const negSteps = open(NEG_STEP[current.negation]);
    const negOpen = negSteps.reduce((s, x) => s + x[1], 0);
    if (current.negation && negSteps.length) {
        if (rng.bool(Math.min(0.6, 0.12 * NEG_PACE[current.negation] * negOpen * (span / 1000) * rate))) {
            const to = rng.pickWeighted(open(NEG_STEP[current.negation]), (x) => x[1])[0];
            events.push({
                year: at(0.55), parameter: 'negation', from: current.negation, to, cause: 'negative-cycle',
                note: `negation moved from ${NEGATION[current.negation].label} to ${NEGATION[to].label}`,
                analogue: 'French: Old French "jeo ne di", Modern "je ne dis pas", colloquial "je dis pas" (Jespersen’s cycle)',
            });
            current = { ...current, negation: to };
        }
    }
    /**
     * Each state leaves at its own pace (Q_PACE): intonation alone and a verb
     * ending are left more readily than a particle, and a particle can move
     * to the other end. Leaving at one pace, the cycle rested at 26% asking
     * by intonation alone, and 50% where an isolating language cannot take
     * an ending (Mandarin asks with ma); now about Earth's mix (WALS 116A:
     * particles 61%, verb endings 17%, intonation alone 18%).
     */
    const Q_STEP = { 'particle-final': [['verb-suffix', 0.6], ['intonation', 0.25], ['particle-initial', 0.15]], intonation: [['particle-final', 0.6], ['particle-initial', 0.4]],
        'particle-initial': [['intonation', 0.4], ['particle-final', 0.6]], 'verb-suffix': [['particle-final', 1]], 'particle-second': [['intonation', 1]], inversion: [['intonation', 1]] };
    const Q_PACE = { intonation: 1.3, 'verb-suffix': 2 };
    if (current.polar && open(Q_STEP[current.polar]).length && rng.bool(Math.min(0.4, 0.08 * (Q_PACE[current.polar] ?? 1) * (span / 1000) * rate))) {
        const to = rng.pickWeighted(open(Q_STEP[current.polar]), (x) => x[1])[0];
        events.push({
            year: at(0.6), parameter: 'polar', from: current.polar, to, cause: 'question-marking',
            note: `yes-no questions moved from ${QUESTION[current.polar].label} to ${QUESTION[to].label}`,
            analogue: 'Spoken Spanish and Portuguese ask by intonation alone; Turkish mı is a particle on its way to an ending',
        });
        current = { ...current, polar: to };
    }

    // ── 2. Contact ─────────────────────────────────────────────────────────
    /**
     * Grammar spreads through contact as well as words (DJ, 22 Oct 2026):
     * along long rule and long borders, the more the stronger the contact
     * (project.js contactEvent passes its kind and strength). The basic
     * order moves only across a difference of head direction, as before, and
     * rarely: Ethiopian Semitic went verb-last among Cushitic, Akkadian under
     * Sumerian. The orders inside the noun phrase, the place of "not" and
     * the way of asking a yes-no question move more readily, since these
     * follow neighbours more than they follow the verb (Dryer): the Balkan
     * languages share a "the" after the noun, mainland South-East Asia its
     * sentence-final question particles. Rulers' grammar passes least (their
     * subjects borrow words before structure), a shifting people's most (it
     * carries its old grammar into its new language), neighbours between.
     * An affix is not swapped for a word or the other way by contact. Each
     * contact moves three things at most on one stretch.
     */
    for (const a of areal) {
        const w = contactWeight(a, rate);
        if (!(w > 0) || !a.donorSyntax) continue;
        let moved = 0;
        const pressure = arealOrderPressure(a.donorSyntax, current);
        if (pressure && rng.bool(Math.min(0.5, 0.15 * w))) {
            events.push({
                year: a.year ?? at(0.5), parameter: 'order', from: current.order, to: pressure.order,
                cause: 'areal', donor: a.from, note: pressure.note, analogue: pressure.analogue,
            });
            current = { ...current, order: pressure.order, headFinal: pressure.headFinal };
            moved += 1;
        }
        for (const [key, p] of CONTACT_PARAMS) {
            if (moved >= 3) break;
            const theirs = a.donorSyntax[key] === 'mixed' ? orderOf(a.donorSyntax, key) : a.donorSyntax[key];
            const ours = current[key];
            if (theirs == null || ours == null || theirs === ours || (ours === 'mixed' && orderOf(current, key) === theirs)) continue;
            if ((key === 'negation' || key === 'polar') && (AFFIXAL.has(theirs) || AFFIXAL.has(ours))) continue;
            if (!rng.bool(Math.min(0.6, p * w))) continue;
            events.push({
                year: a.year ?? at(0.5), parameter: key, from: ours, to: theirs, cause: 'areal', donor: a.from,
                note: `${CONTACT_LABEL[key] || key} as the neighbouring language has it`,
                analogue: CONTACT_ANALOGUE[key] || 'these orders follow neighbours more than the verb (Dryer)',
            });
            current = { ...current, [key]: theirs };
            if (current[`${key}Was`] !== undefined) delete current[`${key}Was`];
            moved += 1;
        }
    }

    // ── 3. Realignment of the correlates ───────────────────────────────────
    /**
     * Runs whether or not the order changed on THIS edge, because the pressure
     * outlasts the change that created it by centuries. A parameter left
     * misaligned by a change three stages ago is still misaligned and still
     * under pressure, which is why realignment shows up as a slow tidying
     * across a lineage rather than as a single event.
     */
    /**
     * Each correlate moves toward Earth's mix for the order, both ways: a
     * value unusual for the order goes the sooner the more unusual it is (an
     * adposition after a flip, first), and a usual one now and then goes the
     * other way, as Mandarin's relative clauses came before the noun. At the
     * rates Earth's shares give (parameters.js harmonicP), so each settles at
     * Earth's mix instead of every language drifting to the harmonic value.
     * Scaled by the length of the edge: this is slow.
     */
    const hf = current.headFinal ?? BASIC_ORDERS[current.order]?.headFinal ?? false;
    const moves = [];
    for (const [key, spec] of Object.entries(CORRELATES)) {
        const has = current[key];
        if (!has || has === 'mixed') continue;
        const expected = hf ? spec.ov : spec.vo, other = hf ? spec.vo : spec.ov;
        const usual = has === expected ? harmonicP(spec, hf) : 1 - harmonicP(spec, hf);
        // where an order can stand both ways for a while, a change starts there (below)
        moves.push({ key, has, to: spec.mixed ? 'mixed' : has === expected ? other : expected, toward: has === expected ? other : expected, realign: has !== expected, p: (1 - usual) * 0.30 * (span / 1000) * rate });
    }
    moves.sort((a, b) => b.p - a.p);
    for (const m of moves) {
        if (!rng.bool(Math.min(0.5, m.p))) continue;
        const label = CORRELATES[m.key].label;
        events.push({
            year: at(0.3 + rng.next() * 0.6),
            parameter: m.key,
            from: m.has,
            to: m.to,
            cause: m.realign ? 'realignment' : 'drift',
            note: m.to === 'mixed'
                ? `${label}: ${m.toward} came into use beside ${m.has}, ${m.realign ? `as a head-${hf ? 'final' : 'initial'} grammar has it` : `against the commoner pattern for a head-${hf ? 'final' : 'initial'} grammar`}; both orders now stand`
                : m.realign
                    ? `${label} realigning with a head-${hf ? 'final' : 'initial'} grammar`
                    : `${label} moved against the commoner pattern for a head-${hf ? 'final' : 'initial'} grammar`,
            analogue: m.to === 'mixed' ? 'Latin adjectives and possessors stood on either side of the noun; Romance settled them after it' : CORRELATES[m.key].note,
        });
        current = { ...current, [m.key]: m.to, ...(m.to === 'mixed' ? { [`${m.key}Was`]: m.has } : {}) };
        // At most one realignment per edge. They are separate historical events
        // and bundling them would reproduce exactly the "everything flips at
        // once" picture that the whole module exists to avoid.
        break;
    }

    /**
     * An order in variation settles, one way or the other, as often each way
     * (which keeps Earth's mix between them), at the rate that leaves each
     * correlate in variation for its share of Earth's languages (`mixed`):
     * with the flow into variation (1 - P) * 0.30 a thousand years from the
     * usual order and P * 0.30 from the other, it settles at
     * 2 * 0.30 * P(1 - P) * (1 - m) / m, halved because a lineage starts at
     * most one change of these orders an edge (measured over ten worlds, 19
     * Oct 2026: at the full rate each stood in variation half as often as on
     * Earth).
     */
    for (const [key, spec] of Object.entries(CORRELATES)) {
        if (current[key] !== 'mixed' || !spec.mixed) continue;
        const P = harmonicP(spec, hf);
        const r = 0.5 * 2 * 0.30 * P * (1 - P) * ((1 - spec.mixed) / spec.mixed) * rate;
        if (!rng.bool(1 - Math.exp(-r * (span / 1000)))) continue;
        const to = rng.bool(0.5) ? spec.ov : spec.vo;
        const was = orderOf(current, key);
        events.push({
            year: at(0.5 + rng.next() * 0.45),
            parameter: key,
            from: 'mixed',
            to,
            cause: 'settled',
            note: `${spec.label}: ${to === was ? `${to} won out again` : `${to} became the usual order, ${was} giving way`}`,
            analogue: spec.note,
        });
        current = { ...current, [key]: to, [`${key}Was`]: null };
    }

    // ── 4. Numeral and demonstrative ───────────────────────────────────────
    /**
     * Slow, and pulled by Universal 18: once the adjective comes before the
     * noun, a numeral or demonstrative after it is under pressure to follow
     * (Amharic and the other Ethiopian Semitic languages put adjective,
     * numeral and demonstrative first under Cushitic, where Ge'ez had them
     * after). Otherwise either moves now and then, as Late Latin's
     * demonstratives settled before the noun.
     */
    for (const key of ['numeral', 'demonstrative']) {
        const has = current[key];
        if (!has) continue;
        const after = key === 'numeral' ? 'NNum' : 'NDem';
        const before = key === 'numeral' ? 'NumN' : 'DemN';
        const pulled = current.adjective === 'AdjN' && has === after;
        if (!rng.bool(Math.min(0.4, (pulled ? 0.25 : 0.03) * (span / 1000) * rate))) continue;
        const to = has === after ? before : after;
        events.push({
            year: at(0.4 + rng.next() * 0.5),
            parameter: key,
            from: has,
            to,
            cause: pulled ? 'realignment' : 'drift',
            note: `the ${key} moved ${to === before ? 'before' : 'after'} the noun${pulled ? ', where the adjective already stood' : ''}`,
            analogue: pulled ? 'Amharic: adjective, numeral and demonstrative all before the noun, where Ge’ez mostly had them after'
                : key === 'demonstrative' && to === before ? 'Late Latin ille settled before the noun on its way to the Romance articles'
                    : 'these orders follow neighbours more than the verb (Dryer): they move slowly, mostly under contact',
        });
        current = { ...current, [key]: to };
    }

    return events.sort((a, b) => a.year - b.year);
}

/** Fold the events onto the parent's syntax to get the child's. */
export function applySyntaxChanges(parentSyntax, events) {
    if (!parentSyntax) return null;
    let out = { ...parentSyntax, changes: [...(parentSyntax.changes || [])] };
    for (const ev of events || []) {
        out[ev.parameter] = ev.to;
        // the order a correlate in variation is changing from, still heard most (parameters.js orderOf)
        if (ev.to === 'mixed') out[`${ev.parameter}Was`] = ev.from;
        else if (ev.from === 'mixed') delete out[`${ev.parameter}Was`];
        if (ev.parameter === 'order') out.headFinal = BASIC_ORDERS[ev.to]?.headFinal ?? out.headFinal;
        // only a free order can lack a dominant one
        if (ev.parameter === 'freedom' && ev.to !== 'free') out.dominant = true;
        out.changes.push(ev);
    }
    return out;
}

/** Readable log for the panel and the CLI. */
export function formatSyntaxChanges(events) {
    if (!events?.length) return '';
    return events.map((ev) => {
        const label = ev.parameter === 'order' ? 'basic order'
            : ev.parameter === 'freedom' ? 'order freedom'
                : ev.parameter === 'dominant' ? 'dominant order'
                    : ev.parameter === 'negation' ? 'negation'
                        : ev.parameter === 'polar' ? 'yes-no questions'
                            : ev.parameter === 'numeral' ? 'numeral and noun'
                                : ev.parameter === 'demonstrative' ? 'demonstrative and noun'
                : CORRELATES[ev.parameter]?.label || ev.parameter;
        return `  c.${String(ev.year).padStart(5)}  ${label}: ${ev.from} → ${ev.to}   (${ev.cause})\n      ${ev.note}`;
    }).join('\n');
}
