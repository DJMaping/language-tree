/**
 * Lexical replacement — a meaning changes which word carries it.
 *
 * Measured against the attested record, this was the engine's single largest
 * gap: zero of 36,983 core meanings had ever been replaced. Every daughter
 * inherited all 600 proto-meanings with the same etymon, and only the FORM
 * drifted.
 *
 * On Earth, Swadesh retention falls to roughly 86% per millennium — a language
 * replaces about one core word in seven every thousand years. Over six thousand
 * years that compounds to ~40% retention, which is why English and Hindi share
 * only about a quarter of their basic vocabulary despite descending from one
 * ancestor.
 *
 * Without this, cognate percentages are 100% by construction: the comparative
 * table has no gaps, there are no false friends, no word whose origin is a
 * mystery, and a six-thousand-year-old family is still trivially relatable at a
 * glance. Replacement is what produces the RESIDUE that makes a real family
 * look old.
 *
 * ## The four mechanisms, all attested, none invented
 *
 *   DERIVATIVE   a derived form displaces its own base. Latin *auris* "ear" was
 *                displaced across Romance by *auricula* "little ear" (French
 *                *oreille*, Spanish *oreja*); *avis* "bird" by *passer*
 *                "sparrow" (Spanish *pájaro*).
 *   LOAN         a borrowed word displaces the native one. Old English *niman*
 *                "take" was displaced by Norse *taka*; *swefn* "dream" by Norse
 *                *draumr*.
 *   NEIGHBOUR    a semantic neighbour broadens into the slot. Latin *caput*
 *                "head" was displaced by *testa* "pot, shell" — French *tête*.
 *   TABOO        the word is avoided and a circumlocution replaces it. PIE's
 *                word for "bear" survives in Latin *ursus* and Greek *arktos*
 *                but was replaced in Germanic by "the brown one" (*bero*) and
 *                in Slavic by "honey-eater" (*medvedь*), because naming the
 *                animal was thought to summon it.
 *
 * Three of the four cost almost nothing here, because the raw material already
 * exists: derivatives carry `derivedFrom`, loans carry `loan`, and every entry
 * carries a semantic `domain`.
 *
 * ## What must NOT happen
 *
 * The displaced word is KEPT, marked archaic, with the meaning it used to
 * carry. On Earth a displaced word usually narrows rather than vanishing —
 * English *hound* survived Norse *dog*, it just narrowed to hunting dogs. The
 * residue is the point. A family where words vanish cleanly is no more
 * realistic than one where nothing ever changes.
 */

import { zipfWeight } from '../rng.js';

/**
 * CLOSED CLASSES, which do not permute.
 *
 * Numerals, pronouns, demonstratives and interrogatives form closed systems.
 * They are replaced only from OUTSIDE the system — English "they" came from
 * Norse, French "on" from Latin *homo* "man" — never by another member of the
 * same set. A language does not repurpose its word for "ten" to mean "five",
 * and letting the neighbour strategy do so produced exactly that.
 *
 * They are also the most replacement-RESISTANT vocabulary there is, which is
 * why they anchor the Swadesh list and why the comparative method works at all.
 */
const CLOSED_CLASS = new Set(['num', 'pron', 'dem', 'interrog', 'quant', 'neg', 'conj', 'part', 'adp']);

/** Concepts whose words get avoided and replaced, across unrelated cultures. */
const TABOO_PRONE = new Set([
    'bear', 'wolf', 'snake', 'die', 'kill', 'blood', 'corpse', 'sickness',
    'left (side)', 'god', 'spirit', 'curse', 'moon', 'fire', 'fear',
]);

/**
 * How many core meanings a stretch of time should replace.
 *
 * 14% per millennium, the complement of the ~86% retention figure measured
 * across documented language pairs. Scaled by the branch's own rate, so a
 * conservative lineage replaces vocabulary slowly for the same reason it
 * changes its sounds slowly.
 */
export function replacementCount(coreCount, years, rate = 1) {
    return Math.max(0, Math.round(coreCount * 0.14 * (years / 1000) * rate));
}

/**
 * Choose the meanings that get a new word, and what replaces them.
 *
 * Returns dated events for the ChangeSet, so replacement is pinned,
 * deterministic and re-timeable exactly like a sound change — and appears in
 * the change log beside them.
 */
export function planReplacements(parentState, rng, { from, to, rate = 1, count } = {}) {
    const entries = parentState.entries || [];
    const live = entries.filter((e) => !e.retired && !e.paradigm);
    const core = live.filter((e) => e.core);
    if (!core.length) return [];

    const n = count ?? replacementCount(core.length, Math.max(0, (to ?? from) - from), rate);
    if (n <= 0) return [];

    const byDomain = new Map();
    for (const e of live) {
        if (!byDomain.has(e.domain)) byDomain.set(e.domain, []);
        byDomain.get(e.domain).push(e);
    }
    const derivativesOf = new Map();
    for (const e of live) {
        if (!e.derivedFrom) continue;
        if (!derivativesOf.has(e.derivedFrom.base)) derivativesOf.set(e.derivedFrom.base, []);
        derivativesOf.get(e.derivedFrom.base).push(e);
    }
    const loans = live.filter((e) => e.loan);

    const events = [];
    const used = new Set();
    const span = Math.max(1, (to ?? from) - from);

    for (let i = 0; i < n * 6 && events.length < n; i++) {
        /**
         * Which meaning is replaced. Weighted AGAINST frequency: the commonest
         * core words are the most stable, which is precisely why "I", "two" and
         * "eye" survive across whole families and why the comparative method
         * works at all. Losing those freely would destroy the signal the rest
         * of the engine depends on.
         */
        const target = rng.pickWeighted(core, (e) => {
            if (used.has(e.id)) return 0;
            let w = 1 - zipfWeight(e.rank) * 2.2;
            // Closed-class items are the last vocabulary to be replaced.
            if (CLOSED_CLASS.has(e.pos)) w *= 0.06;
            return Math.max(0, w);
        });
        if (!target || used.has(target.id)) continue;

        // Try the mechanisms in rough order of how often they operate.
        const derivs = (derivativesOf.get(target.id) || []).filter((d) => !used.has(d.id));
        /**
         * A semantic neighbour must be an OPEN-class content word, and the
         * target must be one too. "Head" can give way to "pot"; "ten" cannot
         * give way to "five".
         */
        const neighbours = CLOSED_CLASS.has(target.pos) ? [] : (byDomain.get(target.domain) || [])
            .filter((e) => e.id !== target.id && !used.has(e.id) && !e.core
                && !CLOSED_CLASS.has(e.pos) && e.pos === target.pos);
        const availableLoans = loans.filter((e) => !used.has(e.id));

        let strategy = null, source = null;
        const roll = rng.next();
        if (derivs.length && roll < 0.34) { strategy = 'derivative'; source = rng.pick(derivs); }
        else if (availableLoans.length && roll < 0.55) { strategy = 'loan'; source = rng.pick(availableLoans); }
        else if (TABOO_PRONE.has(target.gloss) && derivs.length) { strategy = 'taboo'; source = rng.pick(derivs); }
        else if (neighbours.length) { strategy = 'neighbour'; source = rng.pick(neighbours); }
        else if (derivs.length) { strategy = 'derivative'; source = rng.pick(derivs); }
        if (!source) continue;

        used.add(target.id);
        used.add(source.id);
        events.push({
            year: Math.round(from + ((events.length + 0.5) / n) * span),
            meaning: target.gloss,
            from: target.id,
            to: source.id,
            strategy,
            note: NOTES[strategy],
        });
    }
    return events;
}

const NOTES = {
    derivative: 'a derived form displaced its own base — Latin auris "ear" gave way to auricula "little ear" (French oreille)',
    loan: 'a borrowed word displaced the native one — Old English niman "take" gave way to Norse taka',
    neighbour: 'a semantic neighbour broadened into the slot — Latin caput "head" gave way to testa "pot" (French tête)',
    taboo: 'the word was avoided and a circumlocution took over — PIE "bear" became "the brown one" in Germanic, "honey-eater" in Slavic',
};

/**
 * Apply the replacements to a lexicon.
 *
 * The displaced word is kept and marked archaic with the meaning it used to
 * carry, because a displaced word usually narrows rather than vanishing. The
 * replacing word takes the meaning and remembers the one it had, so a neighbour
 * that broadened is visibly polysemous rather than silently swapped.
 */
export function applyReplacements(entries, events) {
    if (!events?.length) return entries;
    const byId = new Map(entries.map((e) => [e.id, e]));
    const out = entries.map((e) => e);

    for (const ev of events) {
        const fromEntry = byId.get(ev.from);
        const toEntry = byId.get(ev.to);
        if (!fromEntry || !toEntry) continue;

        const i = out.indexOf(fromEntry);
        const j = out.indexOf(toEntry);
        if (i < 0 || j < 0) continue;

        out[i] = {
            ...fromEntry,
            gloss: `${ev.meaning} (archaic)`,
            retired: true,
            retiredGloss: ev.meaning,
            replacedBy: ev.to,
            // A word nobody uses for its core sense drops down the frequency
            // curve, which is what makes it a candidate for eventual loss.
            rank: Math.max(fromEntry.rank, 400),
        };
        out[j] = {
            ...toEntry,
            gloss: ev.meaning,
            core: true,
            formerGloss: toEntry.gloss,
            // A neighbour that broadened keeps its old sense alongside the new
            // one; a derivative or a loan simply takes over.
            alsoMeans: ev.strategy === 'neighbour' ? toEntry.gloss : undefined,
            replaced: { of: ev.from, strategy: ev.strategy, year: ev.year },
            rank: Math.min(toEntry.rank, fromEntry.rank),
        };
        byId.set(ev.from, out[i]);
        byId.set(ev.to, out[j]);
    }
    return out;
}

/** Readable log for the panel and the CLI. */
export function formatReplacements(events, entries) {
    if (!events?.length) return '';
    const byId = new Map((entries || []).map((e) => [e.id, e]));
    return events.map((ev) => {
        const to = byId.get(ev.to);
        return `  c.${String(ev.year).padStart(5)}  "${ev.meaning}" → ${to ? to.ipa : ev.to}   (${ev.strategy})`;
    }).join('\n');
}
