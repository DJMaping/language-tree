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

import { CORRELATES, PRAGMATIC_ALTERNATIVES, coherence, stiffen, BASIC_ORDERS, NEGATION, QUESTION, AFFIXAL } from './parameters.js';
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
        const p = (settle ? 0.12 : 0.06) * (span / 1000) * rate;
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
    const NEG_STEP = { before: [['double', 0.5], ['prefix', 0.5]], double: [['after', 1]], after: [['before', 0.6], ['suffix', 0.4]], prefix: [['before', 1]], suffix: [['before', 0.5], ['after', 0.5]] };
    const NEG_PACE = { before: 0.5, double: 3, after: 1, prefix: 0.7, suffix: 0.7 };
    // an isolating language renews with words, never affixes
    const isolating = parentState.paradigm?.categories?.type === 'isolating';
    const open = (steps) => (steps || []).filter((x) => !isolating || !AFFIXAL.has(x[0]));
    if (current.negation && open(NEG_STEP[current.negation]).length) {
        if (rng.bool(Math.min(0.6, 0.12 * NEG_PACE[current.negation] * (span / 1000) * rate))) {
            const to = rng.pickWeighted(open(NEG_STEP[current.negation]), (x) => x[1])[0];
            events.push({
                year: at(0.55), parameter: 'negation', from: current.negation, to, cause: 'negative-cycle',
                note: `negation moved from ${NEGATION[current.negation].label} to ${NEGATION[to].label}`,
                analogue: 'French: Old French "jeo ne di", Modern "je ne dis pas", colloquial "je dis pas" (Jespersen’s cycle)',
            });
            current = { ...current, negation: to };
        }
    }
    const Q_STEP = { 'particle-final': [['verb-suffix', 0.6], ['intonation', 0.4]], intonation: [['particle-final', 0.6], ['particle-initial', 0.4]],
        'particle-initial': [['intonation', 1]], 'verb-suffix': [['particle-final', 1]], 'particle-second': [['intonation', 1]], inversion: [['intonation', 1]] };
    if (current.polar && open(Q_STEP[current.polar]).length && rng.bool(Math.min(0.4, 0.08 * (span / 1000) * rate))) {
        const to = rng.pickWeighted(open(Q_STEP[current.polar]), (x) => x[1])[0];
        events.push({
            year: at(0.6), parameter: 'polar', from: current.polar, to, cause: 'question-marking',
            note: `yes-no questions moved from ${QUESTION[current.polar].label} to ${QUESTION[to].label}`,
            analogue: 'Spoken Spanish and Portuguese ask by intonation alone; Turkish mı is a particle on its way to an ending',
        });
        current = { ...current, polar: to };
    }

    // ── 2. Areal pressure ──────────────────────────────────────────────────
    for (const a of areal) {
        const pressure = arealOrderPressure(a.donorSyntax, current);
        if (!pressure) continue;
        /**
         * Deliberately unlikely per event. Areal syntactic convergence takes
         * centuries of intense contact — it is the outcome of a sprachbund, not
         * of a trade route — so most areal arrows should transfer nothing here
         * and the ones that do should be conspicuous.
         */
        if (!rng.bool(0.22 * rate)) continue;
        events.push({
            year: a.year ?? at(0.5),
            parameter: 'order',
            from: current.order,
            to: pressure.order,
            cause: 'areal',
            donor: a.from,
            note: pressure.note,
            analogue: pressure.analogue,
        });
        current = { ...current, order: pressure.order, headFinal: pressure.headFinal };
        // One is plenty. A language does not reorganise twice on one edge.
        break;
    }

    // ── 3. Realignment of the correlates ───────────────────────────────────
    /**
     * Runs whether or not the order changed on THIS edge, because the pressure
     * outlasts the change that created it by centuries. A parameter left
     * misaligned by a change three stages ago is still misaligned and still
     * under pressure, which is why realignment shows up as a slow tidying
     * across a lineage rather than as a single event.
     */
    const c = coherence(current);
    for (const m of c.misaligned) {
        /**
         * Probability tracks how strongly the parameter is correlated, so
         * adpositions realign first and adjective order usually never does.
         * Scaled by the length of the edge: this is slow.
         */
        const p = m.strength * 0.30 * (span / 1000) * rate;
        if (!rng.bool(Math.min(0.5, p))) continue;
        events.push({
            year: at(0.3 + rng.next() * 0.6),
            parameter: m.parameter,
            from: m.has,
            to: m.expected,
            cause: 'realignment',
            note: `${CORRELATES[m.parameter].label} realigning with a head-${current.headFinal ? 'final' : 'initial'} grammar`,
            analogue: CORRELATES[m.parameter].note,
        });
        current = { ...current, [m.parameter]: m.expected };
        // At most one realignment per edge. They are separate historical events
        // and bundling them would reproduce exactly the "everything flips at
        // once" picture that the whole module exists to avoid.
        break;
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
