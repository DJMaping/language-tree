/**
 * Therapeutic change — what a language does when sound change breaks it.
 *
 * Sound change is blind. It applies to whatever meets its environment, and it
 * does not care that the output of one merger is a word the language already
 * uses for something else. Left alone, that produces exactly what this corpus
 * produced: 57% of Standard Dahen's entries sharing a form with another word,
 * /rwo/ carrying 39 meanings, and — the failure that matters most — 87% of the
 * 284 languages with two closed-class meanings on one form, including 10% where
 * two PRONOUNS had fallen together. Saestnde used /t͡ɕi˩/ for "where", "he" and
 * "you (sg)" at once. No language does this. A pronoun system that cannot
 * distinguish second person from third is not a pronoun system.
 *
 * The reason no language does it is that homonymic clash is REPAIRED. This is
 * one of the oldest results in historical linguistics — Gilliéron's gat/cattus
 * study, where the Gascon reflexes of "cock" and "cat" fell together and the
 * dialects replaced the word for cock rather than tolerate it. The repair is
 * always lexical, never phonological: the sound change is not undone, a
 * different word is recruited for one of the meanings.
 *
 * Not every collision is repaired, and modelling that is the point. English
 * tolerates bank/bank, light/light, and hundreds more, because:
 *
 *   - they belong to different word classes, or different enough domains, so
 *     context disambiguates them for free;
 *   - or one of them is rare enough that the clash almost never arises.
 *
 * What is NOT tolerated is two frequent words of the same class competing for
 * the same slot, and above all a collision inside a closed class, where the
 * members are maximally frequent, maximally similar in distribution, and
 * genuinely cannot be told apart by context. So the intolerability score here is
 * built from exactly those factors, and only what scores above the threshold is
 * repaired.
 */

/**
 * Word classes whose members cannot be disambiguated by context, because they
 * occur in the same slots as each other and nowhere else. A collision here is
 * always repaired.
 */
const CLOSED_POS = new Set(['pron', 'num', 'dem', 'interrog', 'quant']);

/** Above this, a clash is intolerable and something gives way. */
const REPAIR_THRESHOLD = 6;

/**
 * Share of the lexicon that may be repaired on one edge.
 *
 * Repair is not instant. A clash is tolerated, complained about, and resolved
 * over generations, so an edge spanning a few centuries fixes some of its
 * collisions and passes the rest on. Fixing all of them at every stage would
 * make homophony impossible, which is its own kind of wrong.
 */
const REPAIR_BUDGET = 0.12;

/**
 * How badly does this pair of meanings need separating?
 *
 * Frequency enters through `rank`, which is Zipfian: rank 10 is a word said
 * constantly, rank 500 is one said occasionally. Two rank-500 words colliding is
 * a curiosity; two rank-10 words colliding is a problem the speech community
 * will actually solve.
 */
function intolerability(a, b) {
    const bothClosed = CLOSED_POS.has(a.pos) && CLOSED_POS.has(b.pos);

    /**
     * Different word classes usually disambiguate — English tolerates the noun
     * "bank" beside the verb "bank" without difficulty, because syntax tells
     * you which one you are looking at before the meaning is needed.
     *
     * That exemption does NOT extend to two closed classes. A pronoun and a
     * numeral occupy the same argument slots as each other, so "I saw kʰi" is
     * genuinely ambiguous between "you all" and "five" with no syntactic cue to
     * settle it. Exempting them on a part-of-speech difference is what left
     * /kʰi/ = "you (pl)" = "five" standing across the whole Qai subfamily after
     * the pronoun-on-pronoun clashes had been repaired.
     */
    if (a.pos !== b.pos && !bothClosed) return 0;
    let score = 0;

    if (CLOSED_POS.has(a.pos) || CLOSED_POS.has(b.pos)) score += 10;  // always repaired
    if (a.core && b.core) score += 3;
    if (a.domain && a.domain === b.domain) score += 2;

    // Frequency: both words common ⇒ the clash is met constantly.
    const worst = Math.max(a.rank ?? 999, b.rank ?? 999);
    if (worst < 100) score += 4;
    else if (worst < 250) score += 2;
    else if (worst < 500) score += 1;

    return score;
}

/**
 * Find a modifier to build a compound from.
 *
 * A repair has to produce a word the language could actually have coined, which
 * means it must be built out of material the language already has. Preference
 * order mirrors how compounds are actually formed: something from the same
 * semantic domain first (a "bird" repaired with a "wing"), then any common
 * concrete word. The modifier must be frequent — you compound with words
 * everybody knows — and must not be the victim or its clash partner.
 */
function pickModifier(victim, partner, pool, rng) {
    const usable = (e) => e && !e.retired && e.id !== victim.id && e.id !== partner.id
        && e.form?.length && e.form.length <= 4 && (e.rank ?? 999) < 300;

    const sameDomain = pool.filter((e) => usable(e) && e.domain && e.domain === victim.domain);
    if (sameDomain.length) return rng.pick(sameDomain);

    const common = pool.filter((e) => usable(e) && (e.rank ?? 999) < 150);
    if (common.length) return rng.pick(common);

    const any = pool.filter(usable);
    return any.length ? rng.pick(any) : null;
}

/**
 * Plan the repairs for one edge.
 *
 * Returns events in the shape `applyReplacements` already understands, so the
 * repair reuses the compound-building, retirement and etymology machinery that
 * ordinary lexical replacement uses — a therapeutically coined word is an
 * ordinary word from the moment it exists, and erodes like one.
 */
export function planTherapy(entries, rng, { year, budget = REPAIR_BUDGET } = {}) {
    const live = entries.filter((e) => !e.retired && e.form?.length);
    if (live.length < 2) return [];
    /**
     * Therapy repairs LEXEMES. An inflected form that collides with another
     * word is fixed, if at all, by analogy within its paradigm, not by
     * compounding one cell; and a paradigm cell is not a word a speaker would
     * reach for as the modifier of a new compound either.
     */
    const lexemes = live.filter((e) => !e.paradigm);

    const groups = new Map();
    for (const e of live) {
        const key = e.form.map((p) => p.ipa).join('');
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(e);
    }

    /**
     * Within one collision group the MOST FREQUENT word keeps the form and
     * every other member is a candidate to be rebuilt.
     *
     * Enumerating pairs was the obvious reading of "homonymic clash" and it
     * scales badly in exactly the case that matters. Sianan had 126 words
     * collapsed onto /je/; that is 7,875 pairs, and repairing pairwise can fix
     * at most half a group per edge because both members of a repaired pair are
     * consumed. A pile-up is not a set of independent pairs — it is one slot
     * with too many claimants, and the frequent claimant wins it.
     */
    const cap = Math.max(1, Math.round(live.length * budget));
    const candidates = [];

    for (const [, members] of groups) {
        if (members.length < 2) continue;
        const ordered = [...members].sort((x, y) => (x.rank ?? 999) - (y.rank ?? 999));
        const keeper = ordered[0];
        for (const loser of ordered.slice(1)) {
            if (loser.paradigm) continue;
            // one word with two senses ("she" = "he", one "we" for both, a
            // polysemous word's second sense) is not a clash between two words
            if ((loser.sameWordAs ?? loser.id) === (keeper.sameWordAs ?? keeper.id)) continue;
            const score = intolerability(keeper, loser);
            if (score >= REPAIR_THRESHOLD) candidates.push({ loser, keeper, score });
        }
    }
    if (!candidates.length) return [];

    // Worst first, so a limited budget is spent where it matters.
    candidates.sort((x, y) => y.score - x.score || (x.loser.rank ?? 999) - (y.loser.rank ?? 999));

    const events = [];
    const spent = new Set();

    for (const { loser, keeper } of candidates) {
        if (events.length >= cap) break;
        if (spent.has(loser.id)) continue;

        const modifier = pickModifier(loser, keeper, lexemes, rng);
        if (!modifier) continue;

        spent.add(loser.id);
        events.push({
            from: loser.id,
            meaning: loser.retiredGloss || loser.gloss,
            strategy: 'compound',
            year,
            compound: { head: loser.id, modifier: modifier.id },
            therapeutic: { clashedWith: keeper.gloss, form: loser.ipa },
        });
    }
    return events;
}

/**
 * A human-readable account of what was repaired, for the change log.
 */
export function formatTherapy(events) {
    return events
        .filter((e) => e.therapeutic)
        .map((e) => `/${e.therapeutic.form}/ "${e.meaning}" rebuilt — clashed with "${e.therapeutic.clashedWith}"`);
}

export { CLOSED_POS, REPAIR_THRESHOLD };
