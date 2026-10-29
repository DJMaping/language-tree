/**
 * The tidy pass — what a language does to itself between sound changes.
 *
 * The ordered ruleset is the interesting part of diachrony, but it is not the
 * whole of it. A ruleset applies each change to whatever happens to meet its
 * environment, and over a few thousand years that leaves three kinds of debris
 * behind that no attested language actually carries:
 *
 *   1. STRANDED SEGMENTS. A merger conditioned by an environment that had
 *      already mostly disappeared leaves one or two words behind, and the
 *      inventory census — which reads the inventory off the lexicon, correctly —
 *      then reports a phoneme with a functional load of 0.02%. Standard Dahen
 *      had /u/ surviving in exactly one word out of 1410, 4000 years after "u
 *      merges into o". That is not a phoneme; it is a rounding error with an
 *      IPA symbol. Real languages finish their mergers, because a contrast that
 *      distinguishes nothing is not learnable and not transmitted.
 *
 *   2. CROSS-PRODUCT INVENTORIES. Length, nasality and tone each arrive from a
 *      different change at a different date, and because nothing ever prunes,
 *      they multiply: 9 vowel qualities became 48 vowel phonemes in
 *      Proto-Ukhdari, and 100 of 284 languages carried 25 or more. The largest
 *      attested vowel systems are around two dozen and they are considered
 *      remarkable. A system cannot grow without bound because the listener has
 *      to be able to tell the members apart.
 *
 *   3. TRIPLE SEGMENTS. Affixation, compounding and deletion can each put two
 *      identical segments next to each other, and doing it twice produces
 *      /hhho/, /nnna/, /wwwa/ — 226 words across the corpus. A geminate is a
 *      real contrast; a triple is not phonetically producible in any language.
 *
 * None of this is a defect of the rules. It is the absence of the counter-
 * pressure that runs alongside them, and this module is that pressure.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: it does not impose symmetry. A vowel
 * system with length on the peripheral qualities and not the central ones is
 * ordinary — Latin, Japanese and Finnish all distribute a marked feature
 * unevenly, and forcing a full cross-product would be as wrong in the other
 * direction. The test applied here is functional load, not tidiness.
 */

import { absorbGlides } from './phonotactics.js';
import { vowel, consonant, isVowel } from '../features.js';

/**
 * A segment carrying this share of the corpus or less is treated as merger
 * residue rather than as a contrast.
 *
 * Deliberately low. English /ʒ/ sits near 0.1% of tokens and is unquestionably
 * a phoneme, so the floor has to be well below that or the sweep starts eating
 * real contrasts. What it catches is the 0.0x% tail: segments surviving in one
 * or two words out of well over a thousand.
 */
const LOAD_FLOOR = 0.0006;
const ABSOLUTE_FLOOR = 2;

/**
 * Ceiling on distinct vowel phonemes, counting length, nasality and tone as
 * separate phonemes (the convention PHOIBLE and this engine's own census use).
 *
 * 24 is generous: it is above Danish, which is usually cited as the extreme
 * among well-described systems. It exists to stop the cross-product, not to
 * legislate a preferred size, so it should almost never bind on a language
 * whose marked features arrived one at a time.
 */
const VOWEL_CEILING = 24;

/**
 * How much new homophony a single merger may introduce, as a share of the
 * lexicon, before the contrast is judged to be carrying its weight after all.
 *
 * The first version of this pass had no such test and merged on token count
 * alone. It did remove the residue it was built for, but it also drove
 * homophony from 37% to 65% in Amnant and from 57% to 72% in Queians, and took
 * inflection down with it — because a merger that collapses two paradigm cells
 * destroys a distinction just as surely as one that collapses two words.
 * A contrast that would cost this much is not marginal, whatever its token
 * count says.
 */
const COLLISION_BUDGET = 0.002;

/** A collision between two core-vocabulary words counts for this many. */
const CORE_COLLISION_WEIGHT = 25;

/** Marked features, stripped in this order when looking for a merger target. */
const V_MARKED = ['tone', 'long', 'nasal'];
const C_MARKED = ['long', 'aspirated', 'glottalised'];

const PLACE_ORDER = [
    'bilabial', 'labiodental', 'dental', 'alveolar', 'postalveolar',
    'retroflex', 'alveolopalatal', 'palatal', 'velar', 'labiovelar',
    'uvular', 'pharyngeal', 'glottal',
];
const MANNER_ORDER = ['stop', 'affricate', 'fricative', 'nasal', 'trill', 'tap', 'approximant'];

/** Rebuild a phoneme with one marked feature removed. */
function unmark(ph, feat) {
    const f = { ...ph.f };
    if (feat === 'tone') f.tone = null; else f[feat] = false;
    try {
        return isVowel(ph) ? vowel(f) : consonant(f);
    } catch { return null; }
}

/**
 * Distance between two segments of the same type, for the fallback when no
 * unmarked relative survives. Height and place move a vowel or consonant a
 * short way; changing manner, or laterality, or nasality, moves it a long way,
 * because those are the distinctions a listener is least likely to confuse.
 */
function distance(a, b) {
    if (isVowel(a)) {
        return Math.abs(a.f.height - b.f.height)
            + 1.5 * Math.abs(a.f.back - b.f.back)
            + (a.f.round === b.f.round ? 0 : 1)
            + (a.f.nasal === b.f.nasal ? 0 : 2)
            + (a.f.long === b.f.long ? 0 : 1.5)
            + ((a.f.tone ?? 0) === (b.f.tone ?? 0) ? 0 : 1.5);
    }
    return Math.abs(PLACE_ORDER.indexOf(a.f.place) - PLACE_ORDER.indexOf(b.f.place))
        + 1.5 * Math.abs(MANNER_ORDER.indexOf(a.f.manner) - MANNER_ORDER.indexOf(b.f.manner))
        + (a.f.voice === b.f.voice ? 0 : 1)
        + (a.f.nasal === b.f.nasal ? 0 : 3)
        + (a.f.lateral === b.f.lateral ? 0 : 3)
        + (a.f.aspirated === b.f.aspirated ? 0 : 1);
}

/**
 * Where does a doomed segment go?
 *
 * First choice is always the same segment minus a marked feature: a stranded
 * /øː/ merges into /ø/, a stranded /ĩ˩/ into /ĩ/ or /i/. That is what
 * neutralisation of a marginal contrast looks like, and it keeps the word
 * recognisable. Only if no unmarked relative has survived does it fall back to
 * the nearest surviving segment by feature distance.
 */
function mergeTarget(ph, survivors) {
    const marked = isVowel(ph) ? V_MARKED : C_MARKED;
    const has = (p) => p && survivors.has(p.ipa);

    // Strip one marked feature at a time, then combinations, cheapest first.
    for (const feat of marked) {
        const t = unmark(ph, feat);
        if (has(t)) return t;
    }
    for (const a of marked) {
        for (const b of marked) {
            if (a === b) continue;
            const t1 = unmark(ph, a);
            const t = t1 && unmark(t1, b);
            if (has(t)) return t;
        }
    }
    // Strip everything marked; if that lands on a survivor, take it.
    let bare = ph;
    for (const feat of marked) bare = unmark(bare, feat) || bare;
    if (has(bare) && bare.ipa !== ph.ipa) return bare;

    // Fallback: nearest survivor of the same type.
    let best = null, bestD = Infinity;
    for (const cand of survivors.values()) {
        if (cand.type !== ph.type || cand.ipa === ph.ipa) continue;
        const d = distance(ph, cand);
        if (d < bestD) { bestD = d; best = cand; }
    }
    return best;
}

/**
 * How many words a proposed merger would make homophonous.
 *
 * THIS is functional load, properly defined. Counting tokens is a proxy for it
 * and a bad one: a segment occurring twice in the whole lexicon looks like
 * residue by token count, but if those two words are "you (pl)" and "five" then
 * the contrast between them is the only thing keeping the pronoun system apart,
 * and a language will not give it up. Minimal pairs are what a listener
 * actually loses, so minimal pairs are what gets counted.
 *
 * Core vocabulary is weighted heavily. Collapsing two rare compounds is a thing
 * languages do constantly and barely notice; collapsing two Swadesh items is
 * the thing they actively repair.
 */
function collisionCost(entries, from, to, formIndex) {
    let cost = 0;
    for (const e of entries) {
        if (e.retired) continue;
        let touched = false;
        let key = '';
        for (const ph of e.form) {
            if (ph.ipa === from) { touched = true; key += to.ipa; } else key += ph.ipa;
        }
        if (!touched) continue;
        const clash = formIndex.get(key);
        if (!clash || clash === e.id) continue;
        cost += e.core ? CORE_COLLISION_WEIGHT : 1;
    }
    return cost;
}

/**
 * Decide which segments the language can no longer support, and what each one
 * becomes. Returns a Map from doomed IPA to its replacement phoneme.
 */
export function planPruning(entries) {
    const counts = new Map();
    const byIpa = new Map();
    let total = 0;
    for (const e of entries) {
        for (const ph of e.form) {
            counts.set(ph.ipa, (counts.get(ph.ipa) || 0) + 1);
            if (!byIpa.has(ph.ipa)) byIpa.set(ph.ipa, ph);
            total += 1;
        }
    }
    if (!total) return new Map();

    // Current surface forms, for the minimal-pair test. First writer wins; the
    // test only needs to know that SOME other word already owns the string.
    const formIndex = new Map();
    for (const e of entries) {
        if (e.retired) continue;
        const key = e.form.map((p) => p.ipa).join('');
        if (!formIndex.has(key)) formIndex.set(key, e.id);
    }

    const floor = Math.max(ABSOLUTE_FLOOR, Math.round(total * LOAD_FLOOR));
    const candidates = [];
    for (const [ipa, n] of counts) if (n <= floor) candidates.push(ipa);

    /**
     * The vowel ceiling, applied after the load floor and only if the floor was
     * not enough. Least-used first, so the system offers up its most marginal
     * contrast rather than an arbitrary one — which is the order in which a real
     * system sheds them too. These are only CANDIDATES: a vowel that turns out
     * to be carrying real contrast is kept, and the language simply stays large.
     * Some languages genuinely are.
     */
    const vowelKeys = [...counts.keys()].filter((k) => byIpa.get(k).type === 'V');
    if (vowelKeys.length > VOWEL_CEILING) {
        const spare = vowelKeys
            .filter((k) => !candidates.includes(k))
            .sort((a, b) => counts.get(a) - counts.get(b));
        for (const ipa of spare) {
            if (vowelKeys.length - candidates.filter((c) => byIpa.get(c).type === 'V').length <= VOWEL_CEILING) break;
            candidates.push(ipa);
        }
    }
    if (!candidates.length) return new Map();

    /**
     * Merge cheapest-first, re-checking as we go.
     *
     * Order matters: two doomed segments can both want to merge into the same
     * survivor, and taking them one at a time against an updated survivor set
     * stops a chain of merges from quietly collapsing three contrasts into one.
     */
    candidates.sort((a, b) => counts.get(a) - counts.get(b));
    const doomed = new Set();
    const plan = new Map();
    const budget = Math.max(1, Math.round(entries.length * COLLISION_BUDGET));

    for (const ipa of candidates) {
        const survivors = new Map();
        for (const [k, ph] of byIpa) if (!doomed.has(k) && k !== ipa) survivors.set(k, ph);
        // Never strand the language without a vowel (or without consonants).
        const ph = byIpa.get(ipa);
        if (![...survivors.values()].some((p) => p.type === ph.type)) continue;

        const target = mergeTarget(ph, survivors);
        if (!target) continue;
        if (collisionCost(entries, ipa, target, formIndex) > budget) continue;

        doomed.add(ipa);
        plan.set(ipa, target);
    }
    return plan;
}

/**
 * Collapse a run of three or more identical adjacent segments to two.
 *
 * Two is a geminate and a real contrast in plenty of languages. Three is not
 * articulable anywhere: there is no way to hold a closure "more than long" and
 * have a listener recover a third unit from it.
 */
export function capGeminates(form) {
    // a long consonant has no place to begin a word: /ʔʔa/ is /ʔa/
    if (form.length > 2 && form[0].type === 'C' && form[0].ipa === form[1].ipa) form = form.slice(1);
    let run = 1, needed = false;
    for (let i = 1; i < form.length; i++) {
        run = form[i].ipa === form[i - 1].ipa ? run + 1 : 1;
        if (run >= 3) { needed = true; break; }
    }
    if (!needed) return form;

    const out = [];
    for (const ph of form) {
        const n = out.length;
        if (n >= 2 && out[n - 1].ipa === ph.ipa && out[n - 2].ipa === ph.ipa) continue;
        out.push(ph);
    }
    return out;
}

/**
 * Reduction in the frequent end of the lexicon.
 *
 * Zipf's law of abbreviation is applied correctly when roots are generated (see
 * roots.js) and then quietly inverted by everything downstream. Lexical
 * replacement targets CORE meanings, which are by definition the frequent ones,
 * and rebuilds them as compounds roughly twice the length; therapy does the same
 * for a clash. Nothing shortens them again, so by the leaves the relationship had
 * turned upside down — Standard Dahen's fifty commonest words averaged 4.93
 * segments against 3.67 for its rank 300-600 band. In every language that has
 * been measured, the commonest words are the shortest.
 *
 * The missing half of the cycle is that frequent words wear down fastest.
 * "auricula" did replace "auris" — and then reduced to "oreille". English has
 * "goodbye" from "God be with ye". Frequency is what buys a word the redundancy
 * to survive losing a syllable.
 *
 * THREE GUARDS, each of which the first version of this got wrong:
 *
 *   - PARADIGM CELLS ARE EXCLUDED. They are ordinary entries in this engine, so
 *     reducing them rewrote morphology as a side effect of a lexical process:
 *     measured inflection retention swung 12 to 23 points and syncretic cells
 *     came back to life. Morphology erodes through the ruleset, not through here.
 *   - DECIDED PER FORM, not per entry, so two words that sound the same still
 *     sound the same afterwards. Reduction cannot un-merge a merger.
 *   - COLLISION-GUARDED, so it can never manufacture a homophone.
 */
export function reduceFrequent(entries, { rankCutoff = 300, maxSteps = 2 } = {}) {
    const eligible = (e) => !e.retired && !e.paradigm;
    /**
     * Only COMPOUNDS are eroded here.
     *
     * Irregular reduction in frequent use is real, but on Earth it is
     * overwhelmingly the fate of words that were once two: *lord* < hlāf-weard,
     * *lady* < hlǣf-dīge, *cupboard*, *breakfast*, *Wednesday*, *goodbye*. A
     * simplex word in daily use goes through the regular sound changes like
     * every other word, which is the whole basis of the comparative method.
     * Applied to every frequent word, this pass made half of all irregular
     * correspondences in both large families (blind regularity 47.7% and 23%,
     * against 80-90% on Earth); restricted to compounds, irregular words fell
     * from 26% to 12% and common words stayed shorter than rare ones.
     */
    // the wider vocabulary (lexicon/wider.js) neither counts nor is reduced, so adding it moves no older word
    const reducible = (e) => eligible(e) && e.compoundOf != null && !e.wider;
    const lengths = entries.filter((e) => eligible(e) && !e.wider).map((e) => e.form.length);
    if (lengths.length < 20) return { entries, reduced: 0 };
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;

    // Every form in use, paradigm cells included — a reduction must not collide
    // with an inflected form either.
    const taken = new Set();
    for (const e of entries) if (!e.wider) taken.add(e.form.map((p) => p.ipa).join(''));

    /**
     * The length a word of this rank should be tending towards. Scaled by rank
     * rather than compared to a flat cutoff: the claim is not "no word may be
     * long", it is "the commonest words are shorter than average".
     */
    const targetFor = (rank) => mean * (0.72 + 0.28 * Math.min(1, rank / rankCutoff));

    const bestRank = new Map();
    for (const e of entries) {
        if (!eligible(e)) continue;
        const key = e.form.map((p) => p.ipa).join('');
        const r = e.rank ?? 999;
        if (!bestRank.has(key) || r < bestRank.get(key)) bestRank.set(key, r);
    }

    let reduced = 0;
    const decided = new Map();
    const reduceForm = (key0, form0, rank) => {
        if (decided.has(key0)) return decided.get(key0);
        let form = form0;
        const target = targetFor(rank);
        for (let step = 0; step < maxSteps && form.length > target; step++) {
            /**
             * Drop one interior vowel — syncope. Never the first or last
             * segment: apocope and aphaeresis are separate changes with their
             * own conditioning, and doing them here would be inventing sound
             * change rather than modelling a frequency effect.
             */
            let applied = false;
            for (let i = 1; i < form.length - 1; i++) {
                if (!isVowel(form[i])) continue;
                const candidate = [...form.slice(0, i), ...form.slice(i + 1)];
                /**
                 * Never delete a word's LAST vowel. Syncope shortens a word; it
                 * does not leave a consonant cluster carrying a meaning. Without
                 * this guard the pass made 87% of the vowelless core words in the
                 * world (6.7% of all core words; Arten *sun* = *moon* = *stone*).
                 */
                if (!candidate.some(isVowel)) continue;
                // Never leave three consonants in a row: that is a cluster the
                // language would then have to repair, and chaining two repairs
                // is how words turn to mush.
                let run = 0, bad = false;
                for (const ph of candidate) {
                    run = ph.type === 'C' ? run + 1 : 0;
                    if (run >= 3) { bad = true; break; }
                }
                if (bad) continue;
                const key = candidate.map((p) => p.ipa).join('');
                if (taken.has(key)) continue;
                taken.add(key);
                form = candidate;
                reduced += 1;
                applied = true;
                break;
            }
            if (!applied) break;
        }
        decided.set(key0, form);
        return form;
    };

    const out = entries.map((e) => {
        if (!reducible(e)) return e;
        const key = e.form.map((p) => p.ipa).join('');
        // A string is as frequent as the most frequent thing it spells.
        const rank = bestRank.get(key) ?? 999;
        if (rank >= rankCutoff) return e;
        const form = reduceForm(key, e.form, rank);
        if (form === e.form) return e;
        return { ...e, form, ipa: form.map((p) => p.ipa).join('') };
    });

    return { entries: out, reduced };
}

/**
 * Run the whole tidy over a lexicon.
 *
 * Returns the new entries plus a description of what changed, so the caller can
 * push it into the derivation history: a form the lexicon shows must always be
 * reachable from the etymology, and a silent rewrite here would break that the
 * same way a silent hiatus repair would.
 */
export function tidyLexicon(entries) {
    // the census counts the older words only (the wider vocabulary, lexicon/wider.js, must move no older word); the merges reach all
    const plan = planPruning(entries.filter((e) => !e.wider));
    const merges = [...plan.entries()].map(([from, to]) => `${from} > ${to.ipa}`);

    const out = entries.map((e) => {
        let form = e.form;
        if (plan.size) {
            let touched = false;
            const mapped = form.map((ph) => {
                const t = plan.get(ph.ipa);
                if (!t) return ph;
                touched = true;
                return t;
            });
            if (touched) form = mapped;
        }
        // and what no sound change keeps apart (phonotactics.js absorbGlides): this sweep runs
        // after the loans, compounds and grammar of the edge, which the hiatus repair does not see
        const capped = absorbGlides(capGeminates(form));
        if (capped === form && form === e.form) return e;
        return { ...e, form: capped, ipa: capped.map((p) => p.ipa).join('') };
    });

    return { entries: out, merges };
}
