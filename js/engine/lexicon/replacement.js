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
import { wordToIpa } from '../features.js';
import { repairHiatus, syllabify } from '../phonology/phonotactics.js';

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
    return Math.max(0, Math.round(coreCount * 0.18 * (years / 1000) * rate));
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
    const formCount = new Map();
    for (const e of live) formCount.set(e.ipa, (formCount.get(e.ipa) || 0) + 1);
    const ambiguityOf = (e) => Math.max(0, (formCount.get(e.ipa) || 1) - 1);

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
            // An ambiguous word is under pressure that an unambiguous one is
            // not. Capped, because past a handful of homophones the pressure
            // stops rising — speakers have already found other ways to cope.
            w *= 1 + 0.55 * Math.min(4, ambiguityOf(e));
            return Math.max(0, w);
        });
        if (!target || used.has(target.id)) continue;

        // Try the mechanisms in rough order of how often they operate.
        const derivs = (derivativesOf.get(target.id) || []).filter((d) => !used.has(d.id) && !d.core);
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
        const availableLoans = loans.filter((e) => !used.has(e.id));

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
        const reinforceable = !CLOSED_CLASS.has(target.pos) || amb >= 3;
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
        if (derivs.length && roll < pDerivative) { strategy = 'derivative'; source = rng.pick(derivs); }
        else if (availableLoans.length && roll < pDerivative + 0.21) { strategy = 'loan'; source = rng.pick(availableLoans); }
        else if (TABOO_PRONE.has(target.gloss) && derivs.length) { strategy = 'taboo'; source = rng.pick(derivs); }
        else if (neighbours.length) {
            const choice = rng.pick(neighbours);
            strategy = 'neighbour'; source = choice.entry; path = choice.path;
        } else if (derivs.length) { strategy = 'derivative'; source = rng.pick(derivs); }
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
        if (!source && !partner) continue;

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

const NOTES = {
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
                class: head.class,
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
            out.push(made);
            byId.set(made.id, made);
            continue;
        }

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
