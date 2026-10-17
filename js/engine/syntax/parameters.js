/**
 * Word order, and the features that travel with it.
 *
 * `npm run earth` reports syntax as absent: *"word order never changes"*. Every
 * one of the 284 stages renders its sample sentences in SVO, because
 * `text/sentence.js` reads `state.syntax?.order` and nothing in the engine has
 * ever set `state.syntax`. The hook was left; this is what hangs on it.
 *
 * ## Why word order is not one parameter but a bundle
 *
 * Greenberg's observation in 1963, refined by Dryer's much larger samples since,
 * is that the order of verb and object predicts a long list of other orders far
 * better than chance. A language that puts the object before the verb tends to
 * put the possessor before the noun, the relative clause before the noun, the
 * adposition after its noun, and the complementiser at the end of its clause.
 * A verb-object language tends to the mirror image throughout.
 *
 * The explanation that has held up is Dryer's Branching Direction Theory: what
 * correlates is not "object before verb" as such but whether a phrase's
 * modifiers hang to the left or the right of its head, consistently. Japanese
 * hangs everything left; Thai hangs everything right; and most languages are
 * mostly one or the other.
 *
 * ## Why a fully coherent language would be a mistake
 *
 * *Mostly.* Not entirely, and the exceptions are not rare enough to ignore:
 *
 *   - **German** is verb-second in main clauses and verb-final in subordinate
 *     ones, so it is genuinely both at once.
 *   - **Mandarin** is SVO but has prenominal relative clauses and postpositions,
 *     which is the classic counterexample to a tidy typology.
 *   - **Persian** is SOV with prepositions.
 *   - **Finnish** is SVO with prenominal genitives.
 *
 * A generator that emitted 100% Greenberg-coherent languages would be producing
 * an idealisation nobody has ever recorded — the same failure as a language with
 * no homophones or no irregular verbs. So the proto is drawn ~80% coherent and
 * incoherence is a state the model is content to sit in.
 *
 * Adjective order is deliberately NOT treated as a strong correlate. Greenberg's
 * Universal 17 claimed it was; Dryer's larger sample showed the correlation is
 * weak to non-existent, and English (VO, AdjN) is on the "wrong" side of it
 * along with a great many others. Encoding it as strong would be repeating a
 * finding that was later withdrawn.
 */

/**
 * Basic constituent orders, with the frequencies actually attested.
 *
 * Figures follow WALS chapter 81 (Dryer), over 1,377 languages. The two dominant
 * orders are close to a coin flip and account for three quarters of everything;
 * the object-initial orders together are under 1%, which is why a generator that
 * drew uniformly would produce a world full of languages resembling almost
 * nothing on Earth.
 */
export const BASIC_ORDERS = {
    SOV: { weight: 0.410, label: 'SOV', headFinal: true, note: 'The commonest order on Earth: Japanese, Turkish, Hindi, Korean, Quechua, Basque, Latin.' },
    SVO: { weight: 0.353, label: 'SVO', headFinal: false, note: 'English, Mandarin, Swahili, Indonesian, Russian, and most of Romance.' },
    VSO: { weight: 0.069, label: 'VSO', headFinal: false, note: 'Irish, Welsh, Classical Arabic, Tagalog, Māori.' },
    VOS: { weight: 0.019, label: 'VOS', headFinal: false, note: 'Malagasy, Fijian, and a scatter of Austronesian.' },
    OVS: { weight: 0.008, label: 'OVS', headFinal: true, note: 'Hixkaryana and a handful of Amazonian languages. Genuinely rare.' },
    OSV: { weight: 0.003, label: 'OSV', headFinal: true, note: 'Warao, Nadëb. The rarest order there is, and disputed at that.' },
};

/**
 * The correlating parameters.
 *
 * `ov` is the value a head-final (object-before-verb) language tends to take,
 * `vo` the head-initial one. `strength` is how reliably the correlation holds —
 * used both when drawing a proto and when deciding which parameters realign
 * after the basic order moves.
 */
export const CORRELATES = {
    adposition: {
        ov: 'postposition', vo: 'preposition', strength: 0.94,
        label: 'adpositions',
        note: 'The strongest correlate there is. Japanese and Turkish are postpositional, English and Thai prepositional. Persian is the well-known exception.',
    },
    genitive: {
        ov: 'GenN', vo: 'NGen', strength: 0.80,
        label: 'possessor and noun',
        note: 'Turkish "adam-ın ev-i" (man-GEN house-his) against French "la maison de l\'homme".',
    },
    relative: {
        ov: 'RelN', vo: 'NRel', strength: 0.78,
        label: 'relative clause and noun',
        note: 'Japanese puts the clause first; English puts it second. Mandarin is SVO and puts it first, which is the standard counterexample.',
    },
    complementiser: {
        ov: 'final', vo: 'initial', strength: 0.88,
        label: 'complementiser',
        note: 'Japanese "to" and Korean "-ko" close the clause; English "that" and Arabic "anna" open it.',
    },
    auxiliary: {
        ov: 'VAux', vo: 'AuxV', strength: 0.85,
        label: 'auxiliary and verb',
        note: 'Auxiliaries pattern with the verb they govern, which is why they end up as suffixes in head-final languages and as particles in head-initial ones.',
    },
    comparative: {
        ov: 'standard-marker-adjective', vo: 'adjective-marker-standard', strength: 0.76,
        label: 'comparative',
        note: 'Japanese "Tokyo yori ookii" (Tokyo than big) against English "bigger than Tokyo".',
    },
    question: {
        ov: 'final', vo: 'initial', strength: 0.70,
        label: 'question particle',
        note: 'Japanese "ka" and Mandarin "ma" close the sentence; polar question markers in head-initial languages tend to open it.',
    },
    manner: {
        ov: 'AdvV', vo: 'VAdv', strength: 0.66,
        label: 'manner adverb and verb',
        note: 'A weaker correlate, and one that varies inside families.',
    },
    adjective: {
        ov: 'AdjN', vo: 'NAdj', strength: 0.35,
        label: 'adjective and noun',
        note: 'Deliberately weak. Greenberg\'s Universal 17 claimed a strong correlation and Dryer\'s larger sample did not find one — English is VO with AdjN, as are Mandarin, Russian and German.',
    },
};

/**
 * How free the order is, which is a separate axis from what the order IS.
 *
 * This distinction does most of the work in the drift model. Latin and Russian
 * have (had) a basic order and permit almost any permutation of it, because case
 * endings say who did what to whom and the order is therefore free to carry
 * emphasis instead. English permits almost none, because without case marking
 * the order IS the grammar.
 *
 * So a language does not go from SOV to SVO in one step. It goes from
 * free-with-a-dominant-SOV to rigid-in-whatever-was-dominant, and the second
 * step is the visible one.
 */
export const FREEDOM = {
    free: { label: 'free', note: 'Constituents may be permuted for emphasis; case marking carries the grammatical relations. Latin, Russian, Warlpiri.' },
    flexible: { label: 'flexible', note: 'A clear dominant order with common alternatives, usually pragmatically conditioned. German, Modern Greek.' },
    rigid: { label: 'rigid', note: 'Order carries the grammatical relations and is not freely permuted. English, Mandarin.' },
};

const FREEDOM_SCALE = ['free', 'flexible', 'rigid'];

// ---------------------------------------------------------------------------
// Drawing a proto syntax
// ---------------------------------------------------------------------------

/**
 * Draw the root stage's syntax.
 *
 * Coherence is a probability, not a constraint: each correlate independently
 * takes its expected value with probability `strength`, so a language comes out
 * mostly consistent with a couple of surprises, which is what real ones look
 * like.
 *
 * Order freedom is drawn against the morphology, and that is the only place
 * where one part of the language is allowed to look at another during
 * generation. It is not teleology — nothing is steering towards an outcome. It
 * is the plain observation that a language cannot afford free word order unless
 * something else marks the arguments, and a richly inflected proto therefore
 * starts free while an isolating one cannot.
 */
export function generateSyntax(rng, { morphologyCases = 0, config = {} } = {}) {
    const declared = config.syntax || {};

    const order = declared.order || rng.pickWeighted(
        Object.keys(BASIC_ORDERS), (k) => BASIC_ORDERS[k].weight,
    );
    const headFinal = BASIC_ORDERS[order].headFinal;

    const params = {};
    for (const [key, spec] of Object.entries(CORRELATES)) {
        if (declared[key]) { params[key] = declared[key]; continue; }
        const expected = headFinal ? spec.ov : spec.vo;
        const other = headFinal ? spec.vo : spec.ov;
        params[key] = rng.bool(spec.strength) ? expected : other;
    }

    /**
     * Three or more cases will support free order; one or two will not. The
     * thresholds are soft because the real relationship is — Mandarin has no
     * cases and some order freedom, German has four and not much.
     */
    const freedom = declared.freedom
        || (morphologyCases >= 4 ? (rng.bool(0.75) ? 'free' : 'flexible')
            : morphologyCases >= 2 ? (rng.bool(0.55) ? 'flexible' : 'free')
                : (rng.bool(0.7) ? 'rigid' : 'flexible'));

    /**
     * Whether a free order has a dominant one at all. Latin's free order was
     * still mostly SOV and Russian's is mostly SVO; Warlpiri's, Hungarian's
     * and German's main clauses have none that counts, the order following
     * topic and focus instead (WALS 81A: 14% of languages, "no dominant
     * order"). `order` stays the commonest arrangement either way, which is
     * what the head-direction correlates follow.
     */
    const dominant = freedom === 'free' ? !rng.bool(0.4) : true;

    return { order, headFinal, freedom, dominant, ...params, changes: [] };
}

// ---------------------------------------------------------------------------
// Coherence
// ---------------------------------------------------------------------------

/**
 * Score a syntax against the Greenbergian expectations.
 *
 * Reported, never enforced. A language sitting at 0.6 is not broken; it is
 * German. What the score is FOR is drift: an incoherent parameter is the one
 * most likely to realign at the next opportunity, which is how a family's syntax
 * gradually tidies itself after a basic-order change without anybody tidying it.
 */
export function coherence(syntax) {
    if (!syntax) return { score: null, aligned: [], misaligned: [] };
    const headFinal = syntax.headFinal ?? BASIC_ORDERS[syntax.order]?.headFinal ?? false;
    const aligned = [];
    const misaligned = [];
    let weighted = 0, total = 0;

    for (const [key, spec] of Object.entries(CORRELATES)) {
        const expected = headFinal ? spec.ov : spec.vo;
        total += spec.strength;
        if (syntax[key] === expected) { aligned.push(key); weighted += spec.strength; }
        else {
            misaligned.push({
                parameter: key, has: syntax[key], expected,
                strength: spec.strength, label: spec.label, note: spec.note,
            });
        }
    }
    return {
        score: total ? +(weighted / total).toFixed(3) : null,
        aligned,
        // Most-correlated first: the parameter under the most pressure to move.
        misaligned: misaligned.sort((a, b) => b.strength - a.strength),
    };
}

/** Move one step along free → flexible → rigid, clamped. */
export function stiffen(freedom, steps = 1) {
    const i = FREEDOM_SCALE.indexOf(freedom);
    if (i < 0) return freedom;
    return FREEDOM_SCALE[Math.max(0, Math.min(FREEDOM_SCALE.length - 1, i + steps))];
}

/**
 * The orders a language with this basic order plausibly permutes into.
 *
 * Used when a free-order language rigidifies. It does NOT get to fix on an
 * arbitrary order — it fixes on one it was already using. Latin's basic order
 * was SOV and its pragmatically unmarked alternative was SVO, which is what
 * Romance rigidified into; it did not turn into VSO, because nothing was
 * producing VSO clauses to rigidify around.
 *
 * Subject-first orders are the overwhelming majority everywhere for a reason
 * that is not syntactic — subjects are overwhelmingly topics, and topics come
 * first — so the alternatives keep the subject in front except where the
 * language was already verb-initial.
 */
export const PRAGMATIC_ALTERNATIVES = {
    SOV: ['SVO'],
    SVO: ['SOV', 'VSO'],
    VSO: ['SVO', 'VOS'],
    VOS: ['VSO', 'SVO'],
    OVS: ['SVO', 'OSV'],
    OSV: ['SOV', 'SVO'],
};

/** Human-readable summary for the panel and the CLI. */
export function describeSyntax(syntax) {
    if (!syntax) return '(no syntax)';
    const o = BASIC_ORDERS[syntax.order];
    const c = coherence(syntax);
    const bits = syntax.dominant === false
        ? [`no dominant order (${syntax.order} commonest)`, `${FREEDOM[syntax.freedom]?.label || syntax.freedom} order`]
        : [`${syntax.order}`, `${FREEDOM[syntax.freedom]?.label || syntax.freedom} order`];
    bits.push(syntax.adposition === 'postposition' ? 'postpositions' : 'prepositions');
    bits.push(syntax.genitive === 'GenN' ? 'possessor before noun' : 'possessor after noun');
    bits.push(syntax.relative === 'RelN' ? 'prenominal relative clauses' : 'postnominal relative clauses');
    const tail = c.score != null
        ? `  — ${Math.round(c.score * 100)}% head-${syntax.headFinal ? 'final' : 'initial'} consistency`
        : '';
    return `${bits.join(', ')}${tail}${o ? `\n   ${o.note}` : ''}`;
}

/** Full table for the grammar sketch. */
export function formatSyntax(syntax) {
    if (!syntax) return '(no syntax)';
    const c = coherence(syntax);
    const L = [syntax.dominant === false
        ? `Basic order: none dominant, ${syntax.order} commonest   (${FREEDOM[syntax.freedom]?.label || syntax.freedom})`
        : `Basic order: ${syntax.order}   (${FREEDOM[syntax.freedom]?.label || syntax.freedom})`];
    for (const [key, spec] of Object.entries(CORRELATES)) {
        const expected = (syntax.headFinal ? spec.ov : spec.vo);
        const mark = syntax[key] === expected ? ' ' : '*';
        L.push(`  ${mark} ${spec.label.padEnd(26)} ${syntax[key]}`);
    }
    if (c.misaligned.length) {
        L.push('');
        L.push(`* ${c.misaligned.length} parameter${c.misaligned.length === 1 ? '' : 's'} against the head-direction expectation — normal, and the first to realign.`);
    }
    return L.join('\n');
}
