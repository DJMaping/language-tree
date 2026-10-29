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
 *   COMPOUND     a transparent two-word compound displaces the simplex.
 *                Mandarin 目 mù "eye" gave way to 眼睛 yǎnjīng and 虎 hǔ "tiger"
 *                to 老虎 lǎohǔ; German builds *Handschuh* rather than borrowing
 *                a word for glove, and Icelandic coins *tölva* rather than
 *                taking "computer". This is the mechanism that carries most
 *                replacement in a language that does not borrow much — and
 *                until it was added, 41% of core meanings in this engine had no
 *                available replacement at all, because a Swadesh meaning very
 *                rarely has a licensed neighbour (which is the whole reason
 *                Swadesh chose those meanings) and half of them have no
 *                derivative either.
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
import { shiftsInto } from './semantics.js';
import { wordToIpa, parseWord } from '../features.js';
import { repairHiatus, syllabify } from '../phonology/phonotactics.js';
import { isIrregularClass } from '../morphology/paradigm.js';
import { classOf } from './roots.js';

/** A word's class for a new word built on it: never another word's own paradigm. */
const regularClass = (e) => (e.class && isIrregularClass(e.class) ? (e.baseClass ?? classOf(e.form, e.pos)) : e.class);

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
 * 18% per millennium — and the reason it is not the textbook 14% is worth
 * stating, because it is the interesting part.
 *
 * Glottochronology's constant is ~86% retention per millennium, i.e. 14%
 * replaced. At exactly that figure this engine produced 54% retention at 4,500
 * years, which is precisely what the constant predicts (0.86^4.5 = 0.50). The
 * implementation was correct; the constant is what does not fit.
 *
 * The attested pairs decay faster than it predicts, and inconsistently:
 *   English/Hindi   ~5500 yr   27%   implies ~21% replaced per millennium
 *   English/German  ~1500 yr   60%   implies ~30%
 *   Spanish/French  ~2000 yr   75%   implies ~14%
 * No single constant fits all three — which is exactly why glottochronology
 * failed as a DATING method even though the retention measurements themselves
 * stand. Rate of lexical replacement depends on contact, on prestige, on
 * literacy, on how many neighbours a language has.
 *
 * 18% is the best single compromise across the anchors. The per-branch `rate`
 * then supplies the variation the constant cannot, so a sheltered lineage keeps
 * its vocabulary and a contact-zone one loses it — which is the real mechanism
 * the constant was averaging over.
 */
export function replacementCount(coreCount, years, rate = 1) {
    return Math.max(0, Math.round(coreCount * REPLACEMENT_RATE * (years / 1000) * rate));
}

/**
 * 24% since 17 Oct 2026. The 18% above was tuned while replacement was
 * starved of material (a 2,700-year edge found words for 10 of its 125), so
 * part of it was making up for replacements that never happened. Once a noun
 * could give way to a diminutive coined at the time, the families kept their
 * sisters about 0.85 alike per thousand years at every depth, where Earth's
 * deep pairs fall faster (English/Russian 40% at about 4,000 years,
 * English/Hindi 27% at 5,500: about 0.79). The frequent words still resist
 * (the weighting below), which is why the rate asked for is above the
 * Swadesh-100 rate it produces.
 */
const REPLACEMENT_RATE = 0.24;
/**
 * How much slower the closed classes go: half the rate before frequency, so
 * with their high frequency a pronoun or numeral keeps about 96% a
 * millennium (Pagel 2007: half-lives of ten to twenty thousand years). They
 * have fewer ways to be replaced (no semantic neighbour may take them), so
 * the rate asked for is above the rate they show.
 */
const CLOSED_RATE = 0.5;
/** How much likelier a meaning is replaced while a loan for it sits beside the native word. */
const LOAN_PULL = 3;
/** The share of those replacements the loan wins. */
const LOAN_TAKE = 0.6;
/**
 * The share of a language's basic words already loans past which no more
 * are taken, by any road (here, and contact.js makeLoans `displaces`).
 * English, Maltese and Persian, the heaviest borrowers on Earth, still keep
 * most of their basic words; DJ, 22 Oct 2026: "Earth's range".
 */
export const CORE_LOAN_CEILING = 0.2;

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

    const byGloss = new Map();
    for (const e of live) if (!byGloss.has(e.gloss)) byGloss.set(e.gloss, e);

    /**
     * How many other live words share this word's exact form.
     *
     * Sound change destroys contrasts, and nothing in this engine ever repaired
     * the ambiguity that left behind: Dahen-Kino was measured with hundreds of
     * words sharing a form and a mean word length still falling. On Earth
     * erosion and repair run together — Sinitic went disyllabic *because*
     * monosyllables had become ambiguous, so 目 mù "eye" is now 眼睛 yǎnjīng and
     * 虎 hǔ "tiger" is 老虎 lǎohǔ.
     *
     * The repair is not a new mechanism and deliberately so. A rule saying "if
     * ambiguity exceeds N, compound" would be a decree about the output, and
     * this engine's standing rule is to bias the process instead. So ambiguity
     * simply WEIGHTS the derivative strategy that already exists: a word with
     * four homophones is likelier to give way to its own transparent derivative
     * than a word with none, and the derivative is longer by construction. The
     * disyllabification falls out as a consequence rather than being aimed at.
     */
    // homophones are distinct WORDS sharing a form: one word with two senses
    // (sameWordAs) counts once
    const formWords = new Map();
    for (const e of live) {
        if (!formWords.has(e.ipa)) formWords.set(e.ipa, new Set());
        formWords.get(e.ipa).add(e.sameWordAs ?? e.id);
    }
    const ambiguityOf = (e) => Math.max(0, (formWords.get(e.ipa)?.size || 1) - 1);

    const derivativesOf = new Map();
    for (const e of live) {
        if (!e.derivedFrom) continue;
        if (!derivativesOf.has(e.derivedFrom.base)) derivativesOf.set(e.derivedFrom.base, []);
        derivativesOf.get(e.derivedFrom.base).push(e);
    }
    /**
     * A loan is a candidate to take over a meaning only if it is not already
     * doing a core job. Otherwise one borrowed word was drafted into a second
     * core meaning, leaving the first with no word at all (103 core meanings
     * with no carrier in Alzuria-Ayuman's living languages).
     */
    const loans = live.filter((e) => e.loan && !e.core && !e.replaced);
    /**
     * A borrowed word for a meaning the language already has a native word
     * for is a standing threat to it: Norse egg, sky, skin and they each sat
     * beside an English word for the same thing and won within a few
     * centuries. Such a meaning is likelier to be replaced (LOAN_PULL), and
     * then most often by the loan (LOAN_TAKE).
     */
    const borrowedFor = new Set(loans.map((e) => `${e.gloss}|${e.pos}`));
    const sharedWords = new Set(live.filter((e) => e.sameWordAs).map((e) => e.sameWordAs));
    // and fewer, the more of the basic words are loans already (CORE_LOAN_CEILING)
    const coreNow = live.filter((e) => e.core && !e.paradigm && !e.sameWordAs);
    const room = Math.max(0, 1 - (coreNow.length ? coreNow.filter((e) => e.loan).length / coreNow.length : 0) / CORE_LOAN_CEILING);
    const shapes = affixShapes(live);

    const events = [];
    const used = new Set();
    const span = Math.max(1, (to ?? from) - from);

    /**
     * WHICH meanings are replaced: each by a rate of its own (Pagel, Atkinson
     * & Meade 2007, across the Indo-European Swadesh list: "two", "three",
     * "who" and "I" have half-lives of ten thousand years and more, "dirty",
     * "push" and "turn" under a thousand, and frequency explains about half of
     * the difference). The commonest core words are the most stable, which is
     * why "I", "two" and "eye" survive across whole families and the
     * comparative method works at all.
     *
     * A fixed quota per stretch, shared out by those weights, did not do
     * this: the closed classes, weighted at 6%, were almost never chosen, so
     * the quota fell on the rest, and Dahen-Kino's languages kept 93-99% of
     * their pronouns, numerals and question words since their founding and
     * 1% of their nouns. Earth's keep some of both. Each meaning now has its
     * own chance in each stretch, and the stretch replaces however many come
     * up.
     */
    const hazard = (e) => {
        let h = REPLACEMENT_RATE * Math.max(0.15, 1 - zipfWeight(e.rank) * 2.2);
        // Closed-class items are the last vocabulary to be replaced.
        if (CLOSED_CLASS.has(e.pos)) h *= CLOSED_RATE;
        // An ambiguous word is under pressure that an unambiguous one is
        // not. Capped, because past a handful of homophones the pressure
        // stops rising — speakers have already found other ways to cope.
        // (not a meaning the language says with another's word: a borrowed "blue" beside the one
        // word for green and blue splits them at the ordinary rate only, or contact unmade most
        // colexifications: green vs. blue went from 32% of branches to 41%, Earth's 25%)
        if (borrowedFor.has(`${e.gloss}|${e.pos}`) && !e.sameWordAs && !sharedWords.has(e.id)) h *= 1 + (LOAN_PULL - 1) * room;
        return h * (1 + 0.55 * Math.min(4, ambiguityOf(e)));
    };
    let queue;
    if (count != null) {
        // an explicit number (tests): the likeliest, drawn without repeats
        queue = [];
        const pool = [...core];
        while (queue.length < count && pool.length) {
            const t = rng.pickWeighted(pool, hazard);
            if (!t) break;
            queue.push(t);
            pool.splice(pool.indexOf(t), 1);
        }
    } else {
        queue = core.filter((e) => rng.bool(1 - Math.exp(-hazard(e) * (span / 1000) * rate)));
    }
    const n = queue.length;
    if (n <= 0) return [];

    for (const target of queue) {
        if (used.has(target.id)) continue;

        // Try the mechanisms in rough order of how often they operate.
        /**
         * Only a derivative that can MEAN the same thing: of the same part of
         * speech, made with an affix that leaves the meaning standing (a
         * diminutive or an augmentative, as auricula "little ear" took over
         * from auris "ear"). Any derivative would do before, so a verb's
         * meaning went to its agent noun and an adjective's to its abstract
         * noun: in Emaran "see" was carried by "one who sees", "give" by
         * "thing for giving", "child" by an adjective "without ...", each with
         * a noun's endings. Found by the translator, which tried to conjugate
         * them.
         */
        const derivs = (derivativesOf.get(target.id) || []).filter((d) => !used.has(d.id) && !d.core
            && d.pos === target.pos && SAME_MEANING_AFFIXES.has(d.derivedFrom?.affix));
        /**
         * A semantic neighbour must have travelled a LICENSED PATH into this
         * meaning — one of the attested shifts in semantics.js.
         *
         * This used to be "any word in the same domain with the same part of
         * speech", which let "cheek" take over "belly" and "wing" take over
         * "guts". Meaning does not move like that. It moves along a small set of
         * relations that recur across unrelated families, and a shift with no
         * attested parallel is a fabrication however plausible it sounds.
         *
         * The source stays non-core. A core word that abandoned its own meaning
         * would leave the comparative set with a hole in it — the meaning would
         * survive only as this entry's secondary sense, which no lexicostatistical
         * count would find. Latin *testa* "pot" displacing *caput* "head" is
         * exactly the non-core → core shape this permits.
         */
        const neighbours = CLOSED_CLASS.has(target.pos) ? [] : shiftsInto(target.gloss)
            .map((path) => ({ path, entry: byGloss.get(path.from) }))
            .filter(({ entry }) => entry && entry.id !== target.id && !used.has(entry.id)
                && !entry.core && !CLOSED_CLASS.has(entry.pos) && entry.pos === target.pos);
        /**
         * A borrowed word takes over the meaning it had in the language it
         * came from (Norse taka "take" displaced niman "take"), or one a
         * licensed path leads to from there, like any other neighbour. Any
         * loan of the same part of speech would do before, so Ealdorii's
         * "give" was Arten's ten-syllable "trade salt", and a language's word
         * for "eat" could be a loan that had meant "sew".
         */
        const paths = new Set(shiftsInto(target.gloss).map((p) => p.from));
        const availableLoans = !rng.bool(room) ? [] : loans.filter((e) => !used.has(e.id) && e.pos === target.pos
            && (e.gloss === target.gloss || paths.has(e.gloss)));

        /**
         * A compound partner: a content word from the same semantic field, or
         * one linked to the target by a licensed path.
         *
         * The target's own word stays as the HEAD and the partner modifies it,
         * which is the endocentric shape nearly every compound takes — 老虎 is
         * still a tiger, *Handschuh* is still a shoe-shaped thing for the hand.
         * The result is longer than the simplex, which is also why this repairs
         * homophony rather than adding to it.
         *
         * Same part of speech and same semantic field means the two are NEAR
         * SYNONYMS, and a near-synonym compound is not a fallback shape — it is
         * the dominant one in exactly the languages this mechanism is modelled
         * on. Mandarin 道路 dào-lù is "road-road", 朋友 péng-yǒu is
         * "friend-friend", 语言 yǔ-yán is "speech-speech". Pairing across parts
         * of speech produced compounds like "sleep-rub", which is not a word in
         * any language.
         */
        /**
         * A compound may not take itself, or anything built from itself, as its
         * own member.
         *
         * `e.id !== target.id` excluded the word itself and nothing else, so a
         * compound could take a partner whose id already CONTAINED the target —
         * and the result went straight back into `live` to be compounded again.
         * Core vocabulary grew into 8-13 syllable monsters with visibly
         * repeating phonology: Hujan "heavy" came out as
         * /ʃõ̞ntozmmaramarat͡ʃrt͡ʃa˩lɳt͡ɕe˩ʃõ̞ntozmmara/, whose id contains the
         * substring `cmp:cmp:r0199+r0032+cmp:r0035+r0049` twice.
         *
         * It landed on exactly the wrong words. Compounding repairs ambiguity,
         * ambiguity concentrates in the short frequent words, so the damage
         * fell on core vocabulary: Swadesh items averaged 2.0 syllables against
         * 1.5 for the rest, with 15% of them at four or more. That is Zipf's law
         * of abbreviation running backwards.
         *
         * Ids are structured (`cmp:M+H`), so membership is a component test
         * rather than a substring hack.
         */
        const componentsOf = (id) => String(id).split(/[:+]/).filter((x) => x && x !== 'cmp');
        const targetParts = new Set(componentsOf(target.id));
        const disjoint = (e) => {
            const parts = componentsOf(e.id);
            return !parts.some((x) => targetParts.has(x));
        };
        /**
         * And a brake on length, SCALED BY FREQUENCY.
         *
         * Compounds settle at two morphemes in the languages this is modelled on
         * — 老虎, Handschuh, 眼睛 — and they do not recurse. A flat cap of four
         * syllables enforced that, but it applied the same budget to "eye" as to
         * "gravel", and compounding is drawn towards ambiguity while ambiguity
         * concentrates in the short frequent words. The result was that 62% of
         * Standard Dahen's 206 commonest words were compounds averaging 5.63
         * segments, while the plain roots among them averaged 2.30 — so the
         * language's own core vocabulary was its longest, which is Zipf's law of
         * abbreviation running backwards.
         *
         * A word said constantly can afford almost no extra length: English
         * built "goodbye" out of a whole clause and then wore it down to two
         * syllables. So the budget tightens towards the top of the frequency
         * curve, and when nothing fits it, the replacement simply does not
         * happen — which is itself correct. High frequency resists replacement;
         * it is the entire reason a Swadesh list works.
         *
         * AMBIGUITY BUYS THE LENGTH BACK. Compounding is also how a language
         * repairs a collision, and tightening the budget on frequency alone took
         * that repair away from exactly the words that need it most:
         * Alzuria-Ayuman's worst collision went from 61 words to 134. So a word
         * already sharing its form with others is allowed the extra syllable it
         * needs. That is not a compromise between two rules — it is the actual
         * history. Mandarin disyllabified its commonest words *because* they had
         * become ambiguous, and not before.
         */
        /** How many other words in this language already share this form. */
        const amb = ambiguityOf(target);
        const rank = target.rank ?? 999;
        const baseBudget = rank < 100 ? 2 : rank < 300 ? 3 : 4;
        const maxCompoundSyllables = baseBudget + (amb >= 8 ? 2 : amb >= 3 ? 1 : 0);

        /**
         * Closed-class items are excluded from semantic-neighbour and loan
         * replacement, rightly — a language does not repurpose "ten" to mean
         * "five". But they were excluded from PHONOLOGICAL REINFORCEMENT too,
         * and that is a different thing: a pronoun or numeral that has collided
         * with a dozen other words gets lengthened, everywhere, constantly.
         * Latin *hic ille* gave French *celui*, English says "this here", and
         * Mandarin built 那個 out of a demonstrative that was one syllable.
         *
         * That exclusion is why "two", "you (sg)", "he" and "that" were all
         * sitting inside the same 109-way collision with no way out.
         */
        const reinforceable = !CLOSED_CLASS.has(target.pos) || amb >= 1;
        const partners = !reinforceable ? [] : live.filter((e) => (
            e.id !== target.id && e.pos === target.pos
            && !e.derivedFrom && !e.retired
            && disjoint(e)
            && ((e.syllables ?? 1) + (target.syllables ?? 1)) <= maxCompoundSyllables
            && (e.domain === target.domain || shiftsInto(target.gloss).some((p) => p.from === e.gloss))
        ));

        let strategy = null, source = null, path = null, partner = null;
        const roll = rng.next();
        /**
         * Ambiguity tilts the roll towards the strategies that LENGTHEN a word,
         * and the tilt is no longer capped.
         *
         * It used to stop at four homophones, so a form carrying 109 meanings
         * got exactly the same nudge as one carrying four — and one Marame form
         * did carry 109, with 68% of that language homophonous. The sample
         * sentences degenerated accordingly: "Gi ni siɸz di dooz ni ji", where
         * `ni` is simultaneously fly.PST.3SG, man.NOM.SG and "not".
         *
         * The window now asymptotes towards certainty, so a large collision is
         * near-certain to be repaired within a millennium while a two-way one
         * is barely touched. That is the right shape: homophony is tolerated
         * everywhere until it starts costing comprehension, and Mandarin
         * disyllabified precisely when it began to.
         */
        const pDerivative = 0.34 + 0.62 * (1 - Math.exp(-amb / 6));
        // a diminutive (or augmentative) coined now, where the language has the affix
        // (never a diminutive of a diminutive: the second would only stack)
        // a noun by its diminutive (now and then its augmentative), a verb by
        // its frequentative (cantare), an adjective by its diminutive (vetulus)
        const fresh = !derivs.length && !FRESH_AFFIXES.includes(target.derivedFrom?.affix)
            ? (target.pos === 'n' ? (shapes.get(rng.bool(0.85) ? 'DIM' : 'AUG') || shapes.get('DIM') || null)
                : target.pos === 'v' ? shapes.get('INTENS') || null
                    : target.pos === 'adj' ? shapes.get('ADJDIM') || null : null)
            : null;
        const ownLoans = target.sameWordAs || sharedWords.has(target.id) ? [] : availableLoans.filter((e) => e.gloss === target.gloss);
        if (ownLoans.length && roll < LOAN_TAKE) { strategy = 'loan'; source = rng.pick(ownLoans); }
        else if (derivs.length && roll < pDerivative) { strategy = 'derivative'; source = rng.pick(derivs); }
        else if (fresh && roll < pDerivative * 0.5) { strategy = 'fresh'; }
        else if (availableLoans.length && roll < pDerivative + 0.21) { strategy = 'loan'; source = rng.pick(availableLoans); }
        else if (TABOO_PRONE.has(target.gloss) && derivs.length) { strategy = 'taboo'; source = rng.pick(derivs); }
        else if (neighbours.length) {
            const choice = rng.pick(neighbours);
            strategy = 'neighbour'; source = choice.entry; path = choice.path;
        } else if (derivs.length) { strategy = 'derivative'; source = rng.pick(derivs); }
        else if (fresh && rng.bool(0.6)) { strategy = 'fresh'; }
        else if (partners.length) {
            /**
             * The fallback that makes the rate reachable at all.
             *
             * Weighted towards a FREQUENT partner, because the modifier in a
             * real compound is nearly always a very common word — 老 lǎo "old"
             * in 老虎, "hand" in Handschuh, "eye" in 眼睛. A compound built from
             * two rare words is not how anybody talks.
             */
            strategy = 'compound';
            partner = rng.pickWeighted(partners, (e) => zipfWeight(e.rank));
        }
        if (!source && !partner && strategy !== 'fresh') continue;

        used.add(target.id);
        if (source) used.add(source.id);
        events.push({
            year: Math.round(from + ((events.length + 0.5) / n) * span),
            meaning: target.gloss,
            from: target.id,
            to: source ? source.id : null,
            // A compound does not yet exist; applyReplacements builds it from
            // the two evolved forms, after the sound changes have run.
            compound: partner ? { head: target.id, modifier: partner.id } : null,
            fresh: strategy === 'fresh' ? { affix: fresh.key, position: fresh.position, morph: wordToIpa(fresh.morph) } : null,
            strategy,
            // A neighbour shift carries the relation it travelled and the real
            // example that licenses it, so the panel can print both.
            shift: path ? { type: path.type, from: path.from, attested: path.attested } : null,
            ambiguity: ambiguityOf(target) || undefined,
            note: NOTES[strategy],
        });
    }
    return events;
}

/**
 * The shape a living affix has NOW, read off the language's own derivatives.
 *
 * A derivative replacing its base used to need a derivative built at the
 * proto stage, and those run out: a 2,700-year edge in Alzuria-Ayuman wanted
 * 125 core replacements and found material for 10, so its languages kept 96%
 * of their basic vocabulary per millennium where Earth's keep about 86%.
 * Real languages go on coining. Romance replaced its nouns with diminutives
 * made at the time (auris by auricula, sol by soliculum, avis by aucellus:
 * French oreille, soleil, oiseau), with the diminutive as it was then said.
 * So the current shape of each evaluative affix is taken from the derivatives
 * the language still has (the part of the derivative beyond its base), and a
 * noun with nothing else to give way to can give way to a diminutive (or now
 * and then an augmentative) of itself, coined there and then.
 */
const FRESH_AFFIXES = ['DIM', 'AUG', 'INTENS', 'ADJDIM'];
export function affixShapes(entries) {
    const byId = new Map(entries.map((e) => [e.id, e]));
    const tally = new Map();
    for (const d of entries) {
        const key = d.derivedFrom?.affix;
        // the wider vocabulary (lexicon/wider.js) is not counted, so adding it moves no older word's affix
        if (!FRESH_AFFIXES.includes(key) || d.retired || d.wider) continue;
        const base = byId.get(d.derivedFrom.base);
        if (!base || base.form.length >= d.form.length) continue;
        const same = (a, b) => a.length === b.length && a.every((x, k) => x.ipa === b[k].ipa);
        let position = null, morph = null;
        if (same(d.form.slice(0, base.form.length), base.form)) { position = 'suffix'; morph = d.form.slice(base.form.length); }
        else if (same(d.form.slice(d.form.length - base.form.length), base.form)) { position = 'prefix'; morph = d.form.slice(0, d.form.length - base.form.length); }
        if (!morph?.length || !morph.some((x) => x.type === 'V')) continue;
        const k = `${key}|${position}|${wordToIpa(morph)}`;
        const t = tally.get(k) || { key, position, morph, n: 0 };
        t.n++;
        tally.set(k, t);
    }
    const out = new Map();
    for (const t of [...tally.values()].sort((a, b) => b.n - a.n)) if (t.n >= 2 && !out.has(t.key)) out.set(t.key, t);
    return out;
}

/** Affixes whose derivative can carry its base's meaning (see derivs). */
const SAME_MEANING_AFFIXES = new Set(['DIM', 'AUG', 'COLL', 'INTENS', 'ADJDIM']);

const NOTES = {
    fresh: 'a diminutive coined from the word displaced it — Latin auris "ear" by auricula "little ear", sol "sun" by soliculum (French oreille, soleil)',
    compound: 'a transparent compound displaced the simplex — Mandarin 目 mù "eye" gave way to 眼睛 yǎnjīng; German builds Handschuh rather than borrowing a word for glove',
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
export function applyReplacements(entries, events, phonotactics) {
    if (!events?.length) return entries;
    const byId = new Map(entries.map((e) => [e.id, e]));
    const out = entries.map((e) => e);

    for (const ev of events) {
        const fromEntry = byId.get(ev.from);

        /**
         * A compound is BUILT here rather than chosen, because it does not
         * exist until this moment — and it is built from the two forms as they
         * stand AFTER this edge's sound changes, which is right: a compound
         * coined in 1200 is made of the words as they were pronounced in 1200,
         * and from then on it erodes as a single word. That is why English
         * *cupboard* is /ˈkʌbəd/ and no longer sounds like cup + board.
         */
        if (ev.strategy === 'compound' && ev.compound) {
            const head = byId.get(ev.compound.head);
            const modifier = byId.get(ev.compound.modifier);
            if (!head || !modifier || !fromEntry) continue;
            const form = phonotactics
                ? repairHiatus([...modifier.form, ...head.form], phonotactics)
                : [...modifier.form, ...head.form];
            const made = {
                id: `cmp:${ev.compound.modifier}+${ev.compound.head}`,
                form,
                ipa: wordToIpa(form),
                gloss: ev.meaning,
                pos: head.pos,
                domain: head.domain,
                core: true,
                rank: head.rank,
                zipf: 0,
                // a common word's own paradigm stays with it (morphology/irregular.js)
                class: regularClass(head),
                syllables: phonotactics ? syllabify(form, phonotactics).length : (head.syllables ?? 1),
                irregular: false,
                derivedFrom: null,
                compoundOf: {
                    head: ev.compound.head, headGloss: head.gloss,
                    modifier: ev.compound.modifier, modifierGloss: modifier.gloss,
                    year: ev.year,
                },
                replaced: { of: ev.from, strategy: 'compound', year: ev.year },
            };
            const i = out.indexOf(fromEntry);
            if (i < 0) continue;
            out[i] = {
                ...fromEntry,
                gloss: `${ev.meaning} (archaic)`,
                retired: true,
                retiredGloss: ev.meaning,
                replacedBy: made.id,
                rank: Math.max(fromEntry.rank, 400),
            };
            byId.set(ev.from, out[i]);
            // a word coined for a wider meaning (lexicon/wider.js) is wider too
            if (fromEntry.wider) made.wider = true;
            out.push(made);
            byId.set(made.id, made);
            continue;
        }

        /**
         * A fresh diminutive is built here, like a compound: from the word as
         * it stands after this edge's sound changes, with the affix as the
         * language's diminutives now show it.
         */
        if (ev.strategy === 'fresh' && ev.fresh) {
            if (!fromEntry) continue;
            const now = affixShapes(out).get(ev.fresh.affix);
            const morph = now && now.position === ev.fresh.position ? now.morph : parseWord(ev.fresh.morph);
            const joined = ev.fresh.position === 'prefix' ? [...morph, ...fromEntry.form] : [...fromEntry.form, ...morph];
            const form = phonotactics ? repairHiatus(joined, phonotactics) : joined;
            const made = {
                id: `${ev.from}+${ev.fresh.affix}@${ev.year}`,
                form,
                ipa: wordToIpa(form),
                gloss: ev.meaning,
                pos: fromEntry.pos,
                domain: fromEntry.domain,
                core: true,
                rank: fromEntry.rank,
                zipf: 0,
                class: regularClass(fromEntry),
                syllables: phonotactics ? syllabify(form, phonotactics).length : (fromEntry.syllables ?? 1),
                irregular: false,
                derivedFrom: { base: ev.from, affix: ev.fresh.affix, year: ev.year },
                replaced: { of: ev.from, strategy: 'fresh', year: ev.year },
            };
            const i = out.indexOf(fromEntry);
            if (i < 0) continue;
            out[i] = {
                ...fromEntry,
                gloss: `${ev.meaning} (archaic)`,
                retired: true,
                retiredGloss: ev.meaning,
                replacedBy: made.id,
                rank: Math.max(fromEntry.rank, 400),
            };
            byId.set(ev.from, out[i]);
            // a word coined for a wider meaning (lexicon/wider.js) is wider too
            if (fromEntry.wider) made.wider = true;
            out.push(made);
            byId.set(made.id, made);
            continue;
        }

        const toEntry = byId.get(ev.to);
        if (!fromEntry || !toEntry) continue;

        const i = out.indexOf(fromEntry);
        let j = out.indexOf(toEntry);
        if (i < 0 || j < 0) continue;
        /**
         * A neighbour broadening into the slot keeps its own meaning too
         * where nothing else carries it (testa still meant "pot" in Latin
         * while it came to mean "head"): the slot is filled by a second entry
         * of the same word, and the neighbour's old meaning is not left
         * without a word (see applyShifts, semantics.js).
         */
        let to = ev.to;
        // a wider meaning (lexicon/wider.js) only ever takes a second sense of the older word, never the older word itself
        const widerSense = fromEntry.wider && !toEntry.wider;
        if (ev.strategy === 'neighbour' && (widerSense || !out.some((x) => x !== toEntry && !x.retired && !x.paradigm && x.gloss === toEntry.gloss))) {
            to = `${toEntry.id}~${ev.meaning}`;
            if (byId.has(to)) continue;
            out.push({ ...toEntry, id: to, sameWordAs: toEntry.id });
            j = out.length - 1;
        }

        out[i] = {
            ...fromEntry,
            gloss: `${ev.meaning} (archaic)`,
            retired: true,
            retiredGloss: ev.meaning,
            replacedBy: to,
            // A word nobody uses for its core sense drops down the frequency
            // curve, which is what makes it a candidate for eventual loss.
            rank: Math.max(fromEntry.rank, 400),
        };
        const base = out[j];
        out[j] = {
            ...base,
            gloss: ev.meaning,
            core: true,
            formerGloss: toEntry.gloss,
            // A neighbour that broadened keeps its old sense alongside the new
            // one; a derivative or a loan simply takes over.
            alsoMeans: ev.strategy === 'neighbour' ? toEntry.gloss : undefined,
            replaced: { of: ev.from, strategy: ev.strategy, year: ev.year },
            /**
             * The meaning chain, appended to rather than overwritten, so a word
             * that has moved twice can show both moves. This is what lets the
             * panel print "'enemy', formerly 'stranger' (pejoration, c. 340),
             * formerly 'guest' (pejoration, c. −900)" — an etymological
             * dictionary entry rather than a gloss.
             */
            glossHistory: ev.shift
                ? [...(toEntry.glossHistory || []), { gloss: toEntry.gloss, until: ev.year, type: ev.shift.type, attested: ev.shift.attested }]
                : toEntry.glossHistory,
            shifted: ev.shift ? { from: toEntry.gloss, type: ev.shift.type, year: ev.year, attested: ev.shift.attested } : toEntry.shifted,
            rank: Math.min(toEntry.rank, fromEntry.rank),
            ...(widerSense ? { wider: true, core: fromEntry.core, rank: fromEntry.rank } : {}),
            // a wider word taking a wider meaning stays as core as the word it replaced (lexicon/wider.js)
            ...(!widerSense && fromEntry.wider ? { core: fromEntry.core } : {}),
        };
        byId.set(ev.from, out[i]);
        byId.set(to, out[j]);
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
