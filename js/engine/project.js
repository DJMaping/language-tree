/**
 * The project: building a proto-language and folding it down the tree.
 *
 * This is where `evolve(parentState, changeSet) → childState` actually runs.
 *
 * Two properties are load-bearing and everything else here exists to protect
 * them:
 *
 * **Purity.** A child state is always fully derivable from its parent plus its
 * changeset. Nothing mutates a parent; nothing is stored that could drift out of
 * step with what generated it. That is what makes "edit a rule and watch every
 * downstream node update" a two-line operation rather than a cache-invalidation
 * nightmare.
 *
 * **Derivation on demand.** 112 nodes × 600 roots is around 67,000 word-forms.
 * None of them are written to disk. They are recomputed from the proto spec and
 * the pinned rulesets, and memoised in memory. The sidecar on disk holds the
 * seed, the proto configuration, the rulesets and any hand overrides — a few
 * hundred kilobytes, not a hundred megabytes.
 *
 * No filesystem, no DOM, no fetch. Callers hand in plain data and get plain data
 * back, so the same code runs in Node, in the browser, and in a worker.
 */

import { derive } from './rng.js';
import { mineProfile } from './phonology/profile.js';
import { inferCharacter } from './character.js';
import { colexifyProto } from './lexicon/colexify.js';
import { parseWord, applyDelta } from './features.js';
import { applyRule } from './soundchange/rule.js';
import { generateInventory } from './phonology/inventory.js';
import { buildPhonotactics, repairHiatus, repairClusters, repairCodas, syllabify, STRESS_RULES } from './phonology/phonotactics.js';
import { tidyLexicon, reduceFrequent } from './phonology/tidy.js';
import { buildRomanisation, freezeSpellings, spellEntry } from './phonology/romanise.js';
import { conceptList } from './lexicon/swadesh.js';
import { generateLexicon, buildPools } from './lexicon/roots.js';
import { generateAffixes, deriveLexemes } from './lexicon/derivation.js';
import { evolveLexicon, inventoryFromLexicon, diffInventories } from './soundchange/apply.js';
import { generateChangeSet, retime, rateWarning, EARTH_VOWELS } from './soundchange/generate.js';
import { CATALOGUE } from './soundchange/catalogue.js';
import { pushStep, newHistory, forkHistory } from './lexicon/etymology.js';
import { makeLoans, arealFeatures } from './contact.js';
import { buildParadigms, paradigmFromEntries } from './morphology/paradigm.js';
import { applyReplacements, CORE_LOAN_CEILING } from './lexicon/replacement.js';
import { planTherapy } from './lexicon/therapy.js';
import { applyShifts } from './lexicon/semantics.js';
import { erosionReport } from './morphology/erosion.js';
import { applyLevellings } from './morphology/analogy.js';
import { applyGrammaticalisation } from './morphology/grammaticalisation.js';
import { incorporate } from './morphology/incorporation.js';
import { assignGenders, pronounGender } from './morphology/gender.js';
import { buildClassifierSystem, applyClassifiers } from './morphology/classifiers.js';
import { buildPronounSystem, applyPronouns } from './morphology/pronouns.js';
import { markIrregulars, applySuppletion, renewIrregulars } from './morphology/irregular.js';
import { buildArticleSystem, applyArticles } from './morphology/articles.js';
import { buildMoodSystem, applyMoods } from './morphology/moods.js';
import { buildEvidentialSystem, applyEvidentials, evidentialState } from './morphology/evidentials.js';
import { MODERN, coinModern, internationalism } from './lexicon/modern.js';
import { generateSyntax } from './syntax/parameters.js';
import { planSyntaxChange, applySyntaxChanges, coreCaseDistinctness, contactWeight } from './syntax/drift.js';
import { expandClassicalSource, markLearned, dropAlreadyBorrowed } from './lexicon/learned.js';

/**
 * Default configuration for a family. Overridden per project in the sidecar.
 *
 * No laryngeal reconstruction and no vowel count: those were Dahen-Kino's
 * Middle Chinese voicing and a flat five vowels, handed to every family.
 * A family that does not declare them takes them from its evidence
 * (character.js and the mined profile).
 */
/** How often a lineage turns to open syllables, per thousand years of its life (targetsOf). */
const OPEN_RATE = 0.1;
/** And how often one turns to heavy clusters (generate.js CLOSING): Slavic after the weak vowels, Georgian, Salish. */
const CLOSED_RATE = 0.1;

export const DEFAULT_CONFIG = {
    seed: 'default/0000',
    vowelLength: false,
    // no default stress: a family that does not declare one draws it from Earth's spread (character.js)
    lexiconSize: 800,
    marginalCutoff: 2,
    withhold: [],
    deriveFrom: {},
    derivation: true,
};

/**
 * The largest onset any language in this world can end up licensing.
 *
 * Georgian /brt͡skʰ-/ and Polish /vzgl-/ are the outer edge of what is attested
 * as a productive onset, and both are famous for it. Sound change alone will
 * happily stack more — the corpus contained five-consonant onsets — because
 * deletion rules do not consult the syllable canon before they fire.
 */
export const ONSET_MAX_CEILING = 4;

/**
 * And for codas. English /-ksts/ in "sixths" is four and is the usual example
 * of the outer limit; three is where ordinary languages stop.
 */
export const CODA_MAX_CEILING = 3;

// ---------------------------------------------------------------------------
// The proto-language
// ---------------------------------------------------------------------------

/**
 * Build the root stage from a corpus of names plus a configuration.
 *
 * The names are evidence, not decoration — see phonology/profile.js. The rest
 * of the configuration is the set of judgements a human made at the review
 * gates: which laryngeal system to reconstruct, which segments to withhold as
 * later innovations, where the stress falls.
 */
export function buildProto(names, config = {}) {
    const declared = { ...DEFAULT_CONFIG, ...config };
    const profile = mineProfile(names, { reading: declared.reading });
    // What the evidence says the family is like, where its config is silent.
    const character = inferCharacter(profile, derive(declared.seed, 'proto', 'character'), config);
    const cfg = {
        ...declared, laryngeal: character.laryngeal, vowelCount: character.vowelCount,
        morphology: character.morphology, syntax: character.syntax, stress: character.stress,
    };

    const inventory = generateInventory(profile, derive(cfg.seed, 'proto', 'inventory'), {
        laryngeal: cfg.laryngeal,
        vowelCount: cfg.vowelCount,
        vowelLength: cfg.vowelLength,
        marginalCutoff: cfg.marginalCutoff,
        withhold: cfg.withhold,
        deriveFrom: cfg.deriveFrom,
        consonantTarget: cfg.consonantTarget ?? null,
    });

    const phonotactics = buildPhonotactics(profile, derive(cfg.seed, 'proto', 'phonotactics'), {
        stress: cfg.stress,
        vowelLength: cfg.vowelLength,
        segmentMap: inventory.segmentMap,
        inventory,
    });

    const romanisation = buildRomanisation(inventory);
    const phonology = { inventory, phonotactics, profile, segmentMap: inventory.segmentMap };

    /**
     * An ISOLATING family builds its roots about one syllable long whatever
     * its names average: in an isolating language the morpheme is the
     * syllable (Old Chinese, Vietnamese, Thai), and longer words are
     * compounds of them. Names like "Qai Qi" are exactly that.
     */
    const lexPhonology = character.morphology.type === 'isolating'
        ? { ...phonology, profile: { ...profile, meanSyllablesPerWord: Math.min(profile.meanSyllablesPerWord || 2, 1.3) } }
        : phonology;
    const lex = generateLexicon(conceptList(cfg.lexiconSize), lexPhonology, derive(cfg.seed, 'proto', 'lexicon'), {
        streamFor: (gloss) => derive(cfg.seed, 'proto', 'lexicon', gloss),
    });

    let entries = lex.roots;
    let affixes = [];
    const pools = buildPools(inventory, profile, inventory.segmentMap);
    if (cfg.derivation) {
        affixes = generateAffixes(phonology, pools, derive(cfg.seed, 'proto', 'affixes'), { suffixShare: character.suffixShare });
        const derived = deriveLexemes(lex.roots, affixes, phonology, derive(cfg.seed, 'proto', 'derived'));
        entries = [...lex.roots, ...derived];
    }

    // A polysynthetic family builds its habitual objects into its verbs.
    if (character.morphology.type === 'polysynthetic') {
        entries = [...entries, ...incorporate(lex.roots, phonology, derive(cfg.seed, 'proto', 'incorporation'))];
    }

    // Every noun its gender, and he, she and it as one word or several
    // (morphology/gender.js).
    entries = assignGenders(entries, character.morphology.gender, character.morphology.genders, { classPrefix: !!character.morphology.nounClassPrefix });
    entries = pronounGender(entries, character.morphology.gender, derive(cfg.seed, 'proto', 'pronoun-gender'));
    // two words for "we" or one, a polite "you" or none (morphology/pronouns.js)
    const pronouns = buildPronounSystem(entries, character.morphology.pronouns, derive(cfg.seed, 'proto', 'pronouns'));
    entries = pronouns.entries;
    // hand and arm, green and blue: one word or two, as often as on Earth (lexicon/colexify.js)
    entries = colexifyProto(entries, derive(cfg.seed, 'proto', 'colexify'));
    // the commonest verbs and nouns get paradigms of their own, which is how
    // they come to be irregular (morphology/irregular.js)
    // (an isolating language has no paradigms to be irregular in)
    if (character.morphology.type !== 'isolating') entries = markIrregulars(entries);
    // "the" and "a", where the proto has them (morphology/articles.js)
    const articles = buildArticleSystem(entries, character.morphology.articles, phonotactics);
    entries = articles.entries;

    /**
     * Paradigm cells join the LEXICON rather than living beside it.
     *
     * They are whole inflected words, so as ordinary entries they get sound
     * changes, derivation histories and phonotactic repair with no new
     * machinery in evolve() at all — and the erosion of the paradigm becomes a
     * consequence of the phonology rather than something anyone scripts.
     */
    const { paradigm, entries: cells, morphs } = buildParadigms(entries, phonology, pools, derive(cfg.seed, 'proto', 'paradigms'), cfg);
    if (cells.length) entries = [...entries, ...cells];

    // Numeral classifiers, grown from the proto's own nouns (morphology/classifiers.js).
    const clf = buildClassifierSystem(entries, character.morphology.classifiers, phonotactics,
        derive(cfg.seed, 'proto', 'classifiers'), { seed: `${cfg.seed}:proto` });
    if (clf.entries.length) entries = [...entries, ...clf.entries];
    paradigm.categories = { ...paradigm.categories, classifiers: clf.system, pronouns: pronouns.system, articles: articles.system };
    // commands, "don't" and wishes (morphology/moods.js), from the paradigm just built
    const md = buildMoodSystem(entries, paradigm, character.morphology.moods,
        { pools, phonotactics, type: character.morphology.type, morphs, rng: derive(cfg.seed, 'proto', 'moods') });
    entries = md.entries;
    paradigm.categories = { ...paradigm.categories, moods: md.system };
    // how the speaker knows (morphology/evidentials.js)
    const ev = buildEvidentialSystem(entries, paradigm, character.morphology.evidentials,
        { pools, phonotactics, type: character.morphology.type, morphs, headFinal: character.headFinal, rng: derive(cfg.seed, 'proto', 'evidentials') });
    entries = ev.entries;
    paradigm.categories = { ...paradigm.categories, evidentials: ev.system };

    /**
     * Word order and the parameters that correlate with it.
     *
     * Drawn AFTER the paradigms, because how free the order can be depends on
     * whether anything else marks the arguments. A language with six cases can
     * scramble its constituents and a language with none cannot, and that
     * dependency is the hinge the whole drift model turns on — see
     * `syntax/drift.js`.
     */
    const syntax = generateSyntax(derive(cfg.seed, 'proto', 'syntax'), {
        morphologyCases: paradigm?.categories?.cases?.length ?? 0,
        config: cfg,
    });

    return {
        langId: config.rootId || 'proto',
        isProto: true,
        inventory,
        phonotactics,
        romanisation,
        profile,
        affixes,
        entries,
        histories: new Map(),
        changeSet: null,
        stats: lex.stats,
        character,
        paradigm,
        syntax,
        erosion: paradigm ? erosionReport(paradigm, new Map(), null) : null,
    };
}

// ---------------------------------------------------------------------------
// evolve()
// ---------------------------------------------------------------------------

/**
 * Articles and evidentials a contact passes on (DJ, 22 Oct 2026: grammar
 * through contact, "you pick"): where the language has no "the" and a
 * strong contact's language has one, "that" may come to be used for "the"
 * (the Balkan languages share theirs across four families); a "one" for "a"
 * likewise; where it has no evidentials and the contact's language marks
 * hearsay or inference, a "they say" particle may grow (Turkish -miş lent its
 * hearsay sense to Balkan Slavic and Albanian). Only where this stretch's
 * own plan has no change of that kind, at the contact's own year, the
 * likelier the stronger it is (syntax/drift.js contactWeight).
 */
function contactGrammar(changeSet, parentState, areal) {
    const out = { articles: changeSet.articles || [], evidentials: changeSet.evidentials || [] };
    const cats = parentState.paradigm?.categories;
    if (!cats || !areal.length) return out;
    const rng = derive(changeSet.seed || changeSet.childId || 'stage', 'contact-grammar');
    const hasDef = cats.definite || (cats.articles?.definite && cats.articles.definite !== 'none');
    const hasIndef = cats.articles?.indefinite && cats.articles.indefinite !== 'none';
    const planned = (k) => out.articles.some((e) => e.article === k);
    const add = { articles: [], evidentials: [] };
    let def = !!hasDef || planned('definite'), indef = !!hasIndef || planned('indefinite');
    let evid = evidentialState(cats.evidentials) !== '0' || out.evidentials.length > 0;
    const within = (y) => Math.max(changeSet.from, Math.min(changeSet.to, y ?? changeSet.from));
    for (const a of [...areal].sort((x, y) => (x.year ?? 0) - (y.year ?? 0))) {
        const g = a.donorGrammar;
        if (!g) continue;
        const w = contactWeight(a, changeSet.rate ?? 1);
        if (!def && g.definite && g.definite !== 'none' && rng.bool(Math.min(0.3, 0.08 * w))) {
            add.articles.push({ kind: 'article', article: 'definite', step: 'demonstrative', from: 'none', year: within(a.year), donor: a.from,
                note: '"that" came to be used to mean "the", as the language it lived beside had a "the"', attested: 'Albanian, Bulgarian, Macedonian and Romanian all put "the" after the noun, across three branches: the Balkan sprachbund' });
            def = true;
        }
        if (def && !indef && g.indefinite && g.indefinite !== 'none' && rng.bool(Math.min(0.2, 0.04 * w))) {
            add.articles.push({ kind: 'article', article: 'indefinite', step: 'one', from: 'none', year: within(a.year) + 1, donor: a.from,
                note: '"one" came to be used to mean "a", as the language it lived beside had an "a"', attested: 'The Balkan languages use "one" as "a" alike; so do the Western European ones' });
            indef = true;
        }
        if (!evid && g.evidential && g.evidential !== '0' && rng.bool(Math.min(0.5, 0.2 * w))) {
            add.evidentials.push({ kind: 'evidential', step: 'rise', from: '0', to: 'Ip', term: g.rep ? 'REP' : 'INFR', year: within(a.year), donor: a.from,
                note: 'a particle for what one has only heard or worked out grew, as the language it lived beside marked how the speaker knows', attested: 'Turkish -miş lent its hearsay sense to Balkan Slavic and Albanian (Friedman); Tariana took its evidentials from Tucano' });
            evid = true;
        }
    }
    if (add.articles.length) out.articles = [...out.articles, ...add.articles].sort((x, y) => x.year - y.year);
    if (add.evidentials.length) out.evidentials = [...out.evidentials, ...add.evidentials].sort((x, y) => x.year - y.year);
    return out;
}

/**
 * The pure function at the heart of the engine.
 *
 * Everything a child stage is — its lexicon, its inventory, its romanisation —
 * falls out of running the changeset over the parent. The inventory in
 * particular is not carried over and edited; it is re-observed from the
 * resulting lexicon, which is why mergers happen without anybody deleting a
 * phoneme.
 */
export function evolve(parentState, changeSet, opts = {}) {
    const stageId = changeSet.childId;

    /**
     * Loanwords enter HERE, before the ruleset runs, each carrying the year it
     * arrived. evolveWord then skips every rule dated earlier, so a late loan
     * escapes the changes an inherited word underwent — which is what makes the
     * strata datable and visible.
     */
    const incoming = opts.loans || [];

    /**
     * A daughter inherits the parent AS IT WAS WHEN SHE SPLIT OFF.
     *
     * A living parent goes on receiving loanwords for as long as it is spoken —
     * `stateOf` adds every contact event dated inside its lifetime — and those
     * words then sat in `parentState.entries` for every daughter to inherit,
     * including daughters that had separated centuries before the word arrived.
     *
     * That is a shared innovation postdating the split, which is precisely the
     * thing the comparative method exists to rule out. English cannot have
     * inherited a word Frisian borrowed in 1600; the two had not been one
     * language for a thousand years. Left alone it also quietly corrupts
     * subgrouping, because `diffStages` counts shared material as evidence of
     * common descent.
     *
     * The symptom that surfaced it was smaller and stranger: three sound
     * changes in the change log that changed no word at all. Every word they
     * could have applied to was a loan that arrived after the rule had run,
     * and `evolveWord` correctly skipped all of them — so the rule was real,
     * its conditioning environment was real, and the only words carrying that
     * environment were words from the future.
     */
    const inherited = parentState.entries.filter((e) => e.enteredAt == null || e.enteredAt <= changeSet.to);
    const startingEntries = incoming.length ? [...inherited, ...incoming] : inherited;

    const evolved = evolveLexicon(startingEntries, changeSet.rules, {
        phonotactics: parentState.phonotactics,
        stageId,
        histories: parentState.histories,
    });
    const { histories, stats } = evolved;

    // Repair the vowel hiatus that elision leaves behind, before the inventory
    // is re-observed — otherwise the language accumulates sequences it does not
    // license and stops resembling itself. See repairHiatus() for why this sits
    // outside the ordered ruleset.
    /**
     * The canon repair is measured against — which is the CEILING, not the
     * parent's declared maximum.
     *
     * A language tolerates more than it licenses. English "sixths" is not a
     * legal coda anywhere and English says it anyway, and a language whose
     * surface never violates its own canon is itself unrealistic. Sound change
     * legitimately creates clusters: delete an unstressed vowel and /tara/
     * becomes /tra/ whether the canon licensed it or not, and that is how
     * languages acquire syllable structure in the first place.
     *
     * Repairing back to the parent's declared maximum every stage was tried and
     * was badly wrong. It fires on every word in the lexicon rather than on the
     * outliers, and in `deletion` mode every firing destroys a segment: it drove
     * homophony from 37% to 65% in Amnant and 57% to 72% in Queians, because
     * both protos declared `coda.max: 0` and so every coda in the language was
     * stripped at every stage for six thousand years.
     *
     * So repair fires only on what is genuinely impossible — a cluster past the
     * ceiling, or one that violates sonority sequencing or the OCP. What sits
     * between the declared canon and the ceiling is simply what the language
     * tolerates, and `observePhonotactics` will report it honestly afterwards.
     */
    const parentPt = parentState.phonotactics;
    const repairPt = {
        ...parentPt,
        onset: { ...parentPt.onset, max: ONSET_MAX_CEILING },
        coda: { ...parentPt.coda, max: Math.max(parentPt.coda?.max || 0, CODA_MAX_CEILING) },
    };

    const entries = evolved.entries.map((e) => {
        // Hiatus first, then clusters, then codas: a cluster repair that inserts
        // a vowel must not then be re-examined as hiatus, and a coda trim has to
        // see the syllable structure the cluster repair settled on.
        const afterHiatus = repairHiatus(e.form, parentPt);
        const afterOnsets = repairClusters(afterHiatus, repairPt);
        const fixed = repairCodas(afterOnsets, repairPt);
        if (fixed === e.form) return e;
        // The repair has to appear in the derivation history like any other
        // change. Otherwise the etymology chain ends on a form the lexicon
        // doesn't show, and the one display the whole history machinery exists
        // to produce quietly lies.
        const history = histories.get(e.id);
        if (history) {
            pushStep(history, {
                id: `${stageId}-hiatus`, stageId, year: changeSet.to,
                label: 'phonotactic repair (hiatus / illegal onset)',
            }, e.form, fixed, true);
        }
        return { ...e, form: fixed, ipa: fixed.map((p) => p.ipa).join('') };
    });

    /**
     * Lexical replacement, after the sound changes.
     *
     * A meaning migrates to a different etymon; the displaced word is kept and
     * marked archaic. Cognate gaps then fall out for free -- cognateSet looks up
     * by root id, so if one sister's "river" is r0300 and another's is r0142,
     * the comparative table shows a gap without any extra machinery.
     */
    const planned = applyReplacements(entries, changeSet.replacements, parentState.phonotactics);
    /**
     * A loan for a basic meaning that won at once (contact.js makeLoans
     * `displaces`): the word that carried the meaning retires, as Old English
     * ey gave way to Norse egg within the contact itself. One loan per
     * meaning: a second contact's word for it waits its turn.
     */
    const takeovers = [];
    const taken = new Set();
    // and never past the ceiling, counting every contact of this lifetime together
    const basic = planned.filter((e) => e.core && !e.retired && !e.paradigm && !e.sameWordAs);
    let loanedNow = basic.filter((e) => e.loan).length;
    // a word that also carries another meaning (green and blue in one) is not taken over by a loan
    // for one of them: the other would be left on the old word, and contact split most colexifications
    const shared = new Set(planned.filter((e) => e.sameWordAs && !e.retired).map((e) => e.sameWordAs));
    for (const l of [...incoming].sort((x, y) => (x.enteredAt ?? 0) - (y.enteredAt ?? 0))) {
        if (!l.loan?.displaces || (l.enteredAt ?? -Infinity) > changeSet.to || taken.has(`${l.gloss}|${l.pos}`)) continue;
        if (loanedNow >= CORE_LOAN_CEILING * basic.length) break;
        const carrier = planned.find((e) => !e.retired && !e.paradigm && !e.sameWordAs && e.core && e.gloss === l.gloss && e.pos === l.pos && e.id !== l.id);
        if (!carrier || shared.has(carrier.id) || !planned.some((e) => e.id === l.id && !e.retired)) continue;
        taken.add(`${l.gloss}|${l.pos}`);
        loanedNow += carrier.loan ? 0 : 1;
        takeovers.push({ year: l.enteredAt, meaning: l.gloss, from: carrier.id, to: l.id, strategy: 'loan', note: `a word of ${l.loan.label || 'the contact'} displaced the native one, as Norse egg did Old English ey` });
    }
    const replaced = takeovers.length ? applyReplacements(planned, takeovers, parentState.phonotactics) : planned;

    /**
     * Free semantic drift, after replacement.
     *
     * Ordering matters: replacement decides which etymon carries a core
     * meaning, and drift then moves non-core meanings around underneath it. The
     * other order would let a word drift out of a slot that replacement was
     * about to fill, and the event log would read as two changes where one
     * happened.
     */
    const shifted = applyShifts(replaced, changeSet.shifts);
    // a second entry of the same word (a new sense beside the old) shares its etymology
    for (const e of shifted) {
        if (e.sameWordAs && !histories.has(e.id) && histories.has(e.sameWordAs)) histories.set(e.id, forkHistory(histories.get(e.sameWordAs)));
    }

    /**
     * Analogical levelling, last of all.
     *
     * It has to come after the ruleset, because it is a REACTION to what the
     * ruleset did to the paradigm: an alternation has to exist before speakers
     * can regularise it away. The events themselves were decided when the
     * changeset was built, against a projection of these same rules; here they
     * are applied to the forms that actually resulted, and any whose condition
     * no longer holds is skipped.
     */
    const levelling = applyLevellings(shifted, changeSet.levellings, { histories, stageId });

    /**
     * Renewal, last.
     *
     * New paradigm cells are built AFTER the ruleset has run, because a morph
     * that bonded during this stage cannot have undergone the changes that
     * preceded it — exactly the same logic that dates a loanword. From the next
     * edge onward it is an ordinary string and erodes like everything else,
     * which is what makes the cycle a cycle rather than a one-off.
     */
    const renewal = applyGrammaticalisation(levelling.entries, changeSet.grammaticalisations, {
        phonotactics: parentState.phonotactics,
        paradigm: parentState.paradigm,
    });
    /**
     * Numeral classifiers arising, growing, wearing and fading
     * (morphology/classifiers.js), on the same footing: a new classifier is
     * its noun as that noun now sounds.
     */
    const classified = applyClassifiers(renewal.entries, changeSet.classifiers, {
        phonotactics: parentState.phonotactics,
        categories: renewal.categories ?? parentState.paradigm?.categories,
    });
    // and pronouns: a polite "you" or an inclusive "we" arising or going (morphology/pronouns.js)
    const pronounsNow = applyPronouns(classified.entries, changeSet.pronouns, {
        phonotactics: parentState.phonotactics,
        categories: classified.categories ?? renewal.categories ?? parentState.paradigm?.categories,
    });
    // and suppletion: a tense of a common verb taken from another (morphology/irregular.js)
    const suppleted = applySuppletion(pronounsNow.entries, changeSet.suppletions, {
        phonotactics: parentState.phonotactics,
        paradigm: parentState.paradigm,
    });
    // grammar a contact passes on beside its words (contactGrammar below)
    const fromContact = contactGrammar(changeSet, parentState, opts.arealSyntax || []);
    // and articles: "that" becoming "the", "one" becoming "a" (morphology/articles.js)
    const articled = applyArticles(suppleted.entries, fromContact.articles, {
        phonotactics: parentState.phonotactics,
        categories: pronounsNow.categories ?? classified.categories ?? renewal.categories ?? parentState.paradigm?.categories,
    });
    // and moods: commands, "don't" and wishes arising, wearing and renewing (morphology/moods.js)
    const mooded = applyMoods(articled.entries, changeSet.moods, {
        phonotactics: parentState.phonotactics,
        paradigm: parentState.paradigm,
        categories: articled.categories ?? pronounsNow.categories ?? classified.categories ?? renewal.categories ?? parentState.paradigm?.categories,
    });
    /**
     * Anything the grammar made on this edge (a classifier, an article, a
     * "don't", a mood cell) starts a derivation of its own, even where it
     * reuses the id of one lost earlier: otherwise it inherits that word's
     * history and the etymology ends on a form the lexicon does not show.
     */
    // and evidentials: how the speaker knows (morphology/evidentials.js)
    const evidenced = applyEvidentials(mooded.entries, fromContact.evidentials, {
        phonotactics: parentState.phonotactics,
        syntax: parentState.syntax,
        categories: mooded.categories ?? articled.categories ?? pronounsNow.categories ?? classified.categories ?? renewal.categories ?? parentState.paradigm?.categories,
    });
    const beforeGrammar = new Set(renewal.entries.map((e) => e.id));
    for (const e of evidenced.entries) if (!beforeGrammar.has(e.id)) histories.delete(e.id);
    // and a mood cell dropped and made again on the same edge, or an article made anew from "that"
    // or "one" where the language had one already (it reuses the old one's id)
    for (const id of [...(articled.made || []), ...(mooded.made || []), ...(evidenced.made || [])]) histories.delete(id);
    const classifying = { ...classified, entries: evidenced.entries, categories: evidenced.categories ?? mooded.categories ?? articled.categories ?? pronounsNow.categories ?? classified.categories };
    /**
     * The tidy pass, after everything that can add material to the lexicon.
     *
     * Loans, renewed paradigm cells and analogical forms all introduce segments,
     * so the functional-load census that decides what is still a contrast has to
     * see the finished lexicon, not an intermediate one. See tidy.js for what it
     * removes and — as importantly — what it deliberately leaves alone.
     */
    const tidied = tidyLexicon(classifying.entries);
    const entriesAfterReplacement = tidied.entries;
    /**
     * A word coined on THIS edge (a compound built by replacement or therapy)
     * has no derivation history yet: `evolveLexicon` only opens one at the start
     * of the next edge. Its first change therefore went unrecorded (2,567
     * reductions across the corpus), and its etymology began on a form it never
     * had. The history starts at coinage instead, with the form as coined.
     */
    const historyFor = (entry) => {
        if (!histories.has(entry.id)) histories.set(entry.id, newHistory(entry.id, entry.form, stageId));
        return histories.get(entry.id);
    };
    /**
     * Same obligation as the hiatus repair above: a form the lexicon shows has
     * to be reachable from the etymology, so the sweep is a dated step in the
     * derivation like any other change.
     *
     * The loop is driven by whether the ENTRY changed, not by whether any
     * phonemes were merged. Degemination changes a form all on its own — /wwwo/
     * to /wwo/ — and gating the history push on `merges.length` left 24 words
     * across the corpus whose recorded derivation ended on a form the lexicon
     * did not show. lang-check catches exactly that, and it was right to.
     */
    // A classifier that fused onto the numeral kept only its first syllable:
    // a dated step in its derivation like any other change.
    // a pronoun that took another word's form: a dated step in its derivation
    // (not for a word a later step of the edge made anew: a subjunctive the moods dropped and
    // made again after a subject clitic fused onto it begins its history at coinage)
    const afterGrammar = new Set(classifying.entries.map((e) => e.id));
    const remade = new Set([...(mooded.made || []), ...(evidenced.made || [])]);
    for (const ch of [...pronounsNow.changed, ...suppleted.changed]) {
        if (remade.has(ch.id) || !afterGrammar.has(ch.id)) continue;
        pushStep(historyFor({ id: ch.id, form: ch.before }), { id: `${stageId}-pronoun`, stageId, year: ch.year ?? changeSet.to, label: ch.label }, ch.before, ch.after, true);
    }
    if (classifying.applied.some((ev) => ev.step === 'bound')) {
        const was = new Map(renewal.entries.map((e) => [e.id, e]));
        const at = classifying.applied.find((ev) => ev.step === 'bound').year;
        for (const e of classifying.entries) {
            const prev = e.classifier ? was.get(e.id) : null;
            if (prev && prev.form !== e.form) {
                pushStep(historyFor(prev), { id: `${stageId}-clf-bound`, stageId, year: at, label: 'fused onto the numeral as an ending' }, prev.form, e.form, true);
            }
        }
    }
    const mergeNote = tidied.merges.length
        ? `marginal contrasts neutralised (${tidied.merges.slice(0, 4).join(', ')}${tidied.merges.length > 4 ? '…' : ''})`
        : 'overlong geminate or doubled glide reduced';
    for (let i = 0; i < classifying.entries.length; i++) {
        const before = classifying.entries[i];
        const after = entriesAfterReplacement[i];
        if (before === after) continue;
        const history = historyFor(before);
        pushStep(history, {
            id: `${stageId}-tidy`, stageId, year: changeSet.to, label: mergeNote,
        }, before.form, after.form, true);
    }

    /**
     * Therapeutic repair of homonymic clash, last of everything lexical.
     *
     * It has to see the FINAL forms — after the ruleset, after replacement,
     * after levelling, after the tidy sweep — because a clash is a fact about
     * what two words sound like when the dust has settled, and any of those
     * stages can create one or resolve one. See lexicon/therapy.js for which
     * collisions a language tolerates and which it will not.
     */
    const therapyEvents = planTherapy(entriesAfterReplacement, derive(changeSet.seed || stageId, 'therapy'), {
        year: changeSet.to,
    });
    const repaired = therapyEvents.length
        ? applyReplacements(entriesAfterReplacement, therapyEvents, parentPt)
        : entriesAfterReplacement;

    /**
     * Reduction at the frequent end, after therapy has coined whatever compounds
     * it needed — those compounds are the main thing it has to work on. See
     * tidy.js: paradigm cells are excluded, so this cannot touch morphology.
     */
    // new nouns (loans, compounds, coinages) take a gender by the language's own rules
    const cats0 = parentState.paradigm?.categories;
    const entriesReduced = assignGenders(reduceFrequent(repaired).entries, cats0?.gender, cats0?.genders || [], { classPrefix: !!cats0?.nounClassPrefix });
    // And, as with every other rewrite in here, it has to appear in the
    // derivation. Omitting this left 77,457 words whose recorded history ended
    // on a form the lexicon no longer showed.
    for (let i = 0; i < repaired.length; i++) {
        const before = repaired[i];
        const after = entriesReduced[i];
        if (before === after) continue;
        const history = historyFor(before);
        pushStep(history, {
            id: `${stageId}-reduce`, stageId, year: changeSet.to,
            label: 'reduction in frequent use',
        }, before.form, after.form, true);
    }
    /**
     * The commonest meanings keep paradigms of their own whichever word now
     * carries them (morphology/irregular.js). Last of the lexical steps,
     * because therapy can still replace a common word.
     */
    const renewedIrregulars = renewIrregulars(entriesReduced, { paradigm: parentState.paradigm, phonotactics: parentState.phonotactics });
    const entriesAfterTherapy = renewedIrregulars.entries;

    const inventory = inventoryFromLexicon(entriesAfterTherapy);
    const delta = diffInventories(parentState.inventory, inventory);

    /**
     * Phonotactics are RE-OBSERVED from the child, not inherited from the parent.
     *
     * This was previously a filter over the parent's list, which meant the
     * proto's syllable canon bound every descendant for six thousand years —
     * the one thing that certainly does not happen. Middle Chinese licensed
     * *-p *-t *-k *-m; Mandarin licenses only /n ŋ/. Latin licensed obstruent
     * codas; Italian licenses none.
     *
     * It also had a concrete cost. `codas()` in the catalogue intersects the
     * DECLARED list with the inventory, so any coda a sound change created
     * (/ŋ/ from nasal assimilation, /j w/ from vocalisation) was invisible to
     * final-consonant-loss, compensatory lengthening and tonogenesis — while
     * segments long gone from the language sat in the list keeping their gates
     * open on nothing.
     */
    const observed = observePhonotactics(entriesAfterTherapy, parentState.phonotactics);
    const phonotactics = { ...parentState.phonotactics, ...observed };

    // Spelling either tracks the pronunciation or is frozen at a standardisation
    // year. Once frozen, sound change carries on underneath it and the gap
    // between spelling and speech starts to open — which is the entire reason
    // English orthography looks the way it does.
    const frozen = !opts.ignoreFrozen && !!(opts.orthographyFrozen || parentState.orthographyFrozen);
    /**
     * The convention in force, when this stage set one: the language as it
     * was said the year it was written down, or the year it reformed its
     * spelling (createProject spellingOpts). Otherwise it inherits its
     * parent's.
     */
    const convention = frozen ? opts.spellingsFrom ?? null : null;
    const romanisation = !frozen ? buildRomanisation(inventory) : convention ? convention.romanisation : parentState.romanisation;
    /**
     * What a spelling reform WOULD produce, kept alongside the real one.
     *
     * This is not used to spell anything; it exists so the gap can be measured.
     * Orthographic depth is the distance between how a language is written and
     * how it is said, and you cannot state that distance without a transparent
     * orthography for the current pronunciation to compare against.
     */
    const phonemicRomanisation = frozen ? buildRomanisation(inventory) : romanisation;

    /**
     * The word spellings of the convention: fixed the year it was set and
     * passed down untouched from there. A word not in the table arrived after
     * and is spelled by the current mapping, which is why the recent stratum
     * of any deep orthography looks more phonetic than the native one.
     */
    const spellings = !frozen ? null
        : convention ? convention.spellings
            : (parentState.spellings ?? freezeSpellings(entriesAfterTherapy, romanisation));

    // The paradigm is READ BACK OUT of the evolved lexicon. Its cells travelled
    // through the sound changes as ordinary words; putting them back into a
    // table is what makes the collapse visible.
    const paradigm = paradigmFromEntries(entriesAfterTherapy, parentState.paradigm, classifying.categories ?? renewal.categories);
    const erosion = paradigm ? erosionReport(paradigm, histories, parentState.paradigm) : null;

    /**
     * Syntax, LAST, because it reacts to what the morphology has just become.
     *
     * Specifically it needs the child's paradigm, which does not exist until the
     * sound changes have run — the whole trigger is whether the nominative and
     * accusative have fallen together *on this edge*. So unlike the ruleset and
     * the replacements, syntactic change is not pinned into the ChangeSet ahead
     * of time; it is derived here from a stream seeded on the family and the
     * node, which keeps it deterministic and re-derivable without pretending it
     * could have been decided before the phonology ran.
     *
     * That is the right dependency. Re-date an edge and its sound changes are
     * re-spread; if that changes whether the case system survived, it SHOULD
     * change whether the word order rigidified, because on Earth one caused the
     * other.
     */
    let syntax = parentState.syntax || null;
    let syntaxChanges = [];
    if (syntax && opts.syntaxRng) {
        syntaxChanges = planSyntaxChange(
            parentState,
            coreCaseDistinctness(paradigm),
            opts.syntaxRng,
            { from: changeSet.from, to: changeSet.to, rate: changeSet.rate ?? 1, areal: opts.arealSyntax || [] },
        );
        syntax = applySyntaxChanges(parentState.syntax, syntaxChanges);
    }

    return {
        langId: stageId,
        isProto: false,
        parentId: changeSet.parentId,
        inventory,
        phonotactics,
        romanisation,
        phonemicRomanisation,
        spellings,
        orthographyFrozen: frozen,
        // the year the spelling now in use was fixed
        orthographyFrozenAt: !frozen ? null : convention ? convention.year : (parentState.orthographyFrozenAt ?? opts.standardisedAt ?? null),
        spellingReform: frozen ? opts.spellingReform ?? null : null,
        profile: parentState.profile,
        affixes: parentState.affixes,
        entries: entriesAfterTherapy,
        histories,
        entriesReplaced: (changeSet.replacements || []).length,
        changeSet,
        delta,
        stats,
        paradigm,
        erosion,
        levellings: levelling.applied,
        grammaticalisations: renewal.applied,
        classifierChanges: classifying.applied,
        pronounChanges: pronounsNow.applied,
        suppletions: suppleted.applied,
        articleChanges: articled.applied,
        moodChanges: mooded.applied,
        evidentialChanges: evidenced.applied,
        // common meanings whose own paradigm moved to a new word (morphology/irregular.js)
        irregularRenewals: renewedIrregulars.made.length || renewedIrregulars.dropped?.length
            ? { made: renewedIrregulars.made, dropped: renewedIrregulars.dropped || [] } : null,
        entriesShifted: (changeSet.shifts || []).length,
        syntax,
        syntaxChanges,
        loansReceived: incoming,
        arealFeatures: opts.arealFeatures || [],
    };
}

// ---------------------------------------------------------------------------
// The fold
// ---------------------------------------------------------------------------

/**
 * Derive every stage in a family.
 *
 * `tree` is the plain node list the chart already uses: objects with
 * `{id, name, born, died, parentId, relation}`. Nothing is written back to it.
 *
 * Returns a lazy accessor rather than a fully-populated map: a stage is computed
 * the first time it is asked for, along with every ancestor it needs, and then
 * memoised. Opening the panel on one leaf of a 112-node family therefore costs
 * one chain, not the whole tree.
 */
export function createProject({ tree, names, config, sidecar = {}, borrowings: chartBorrowings = [], evidenceNames = [], resolveExternal = null, lastnu = null, contact = null, contactTypology = null }) {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    /**
     * A STABLE KEY for every random stream and every pinned edge.
     *
     * Renaming a language re-slugs its id, and every stream in the engine was
     * keyed on the id: a one-letter rename re-rolled that language's sound
     * changes, contact, syntax and drift, and through them every descendant.
     * The app now records a renamed language's ORIGINAL id as `uid`, so the
     * key survives any number of renames. A language never renamed has none.
     */
    const keyOf = (node) => node.uid ?? node.id;
    /**
     * The FROZEN EVIDENCE, when the family has been pinned.
     *
     * The proto is mined from the family's language names, so drawing or
     * renaming any box re-mined it and re-rolled the whole family (99% of the
     * Amnant proto for one added name). Once DJ approves a family its evidence
     * is frozen in the pin file (scripts/lang-pin.js) and read from there, so
     * the chart can be edited without touching the proto.
     */
    const evidence = sidecar.evidence || null;
    /**
     * Beyond the chart's own names, the family's EVIDENCE CORPUS: the canon
     * city names of the countries where DJ's map gives it the majority
     * (data/evidence.json). A family drawn with a handful of boxes otherwise
     * had almost nothing to be mined from. A family can keep to its language
     * names with `"evidence": "names"` in its config.
     */
    const cities = cfg.evidence === 'names' ? [] : evidenceNames;
    // Languages the app made itself (old dialects, named after cities or
    // forged by this engine) are not evidence: counting them would let the
    // app's own output reshape every family it touches.
    const madeNames = new Set(tree.filter((l) => l.generated).map((l) => l.name));
    const protoNames = evidence?.names?.length ? evidence.names : [...names.filter((n) => !madeNames.has(n)), ...cities];
    /**
     * A classical stratum is expressed as ordinary contact events pointed
     * BACKWARDS up the tree, so the whole existing borrowing machinery applies
     * to it unchanged — including the part that matters most, which is that
     * `stateAtYear` takes the donor as it stood at the moment of contact. A
     * classical source is exactly a language frozen at the moment it was written
     * down, so that is already the right semantics. See lexicon/learned.js.
     */
    /**
     * Contact weighted by what the maps show (data/history/contact.json, DJ,
     * 22 Oct 2026: "contact into the words"): an arrow lends as much as its
     * rule lasted and covered, where the maps confirm it (a strength set on
     * the arrow itself wins), and long, heavy rule the chart has no arrow for
     * lends too, unless vetoed.
     */
    const weighed = (b) => (b.strength == null && contact?.arrows?.[b.id]
        ? { ...b, strength: contact.arrows[b.id].strength, until: contact.arrows[b.id].to }
        : b);
    const borrowings = [
        ...chartBorrowings.map(weighed),
        ...[...(contact?.map || []), ...(contact?.borders || [])].filter((m) => !m.vetoed && !(contact.veto || []).includes(m.id)).map((m) => ({ ...m, source: 'map' })),
        ...expandClassicalSource(cfg, tree, { presentYear: cfg.presentYear }),
    ];
    const byId = new Map(tree.map((l) => [l.id, l]));
    /**
     * A line the canon keeps isolating (lang-config morphology.isolatingLine:
     * a language, with every ancestor it has in the family): Dahen's, from
     * Dati to Standard Dahen, as Chinese has stayed isolating while its kin
     * grew endings (DJ, 19 Oct 2026: Dahen-Kino's Sinitic goal stands). It
     * grows no first ending by any road; its daughters off the line may.
     */
    const isolatingLine = new Set();
    for (let id = cfg.morphology?.isolatingLine; id && byId.has(id); id = byId.get(id).parentId) isolatingLine.add(id);
    const children = new Map();
    for (const l of tree) {
        if (!l.parentId) continue;
        if (!children.has(l.parentId)) children.set(l.parentId, []);
        children.get(l.parentId).push(l);
    }

    const cache = new Map();
    const changeSets = new Map(Object.entries(sidecar.edges || {}));

    /** The end year of a node — when its own edge to each child begins. */
    const endOf = (l) => {
        if (l.died != null) return l.died;
        const kids = children.get(l.id) || [];
        if (kids.length) return Math.max(...kids.map((k) => k.born));
        return cfg.presentYear ?? l.born;
    };

    /**
     * THE LINEAGE MODEL.
     *
     * Every language owns exactly ONE edge: its own lifetime, from its birth to
     * the year it stopped being itself (it died, handed over to a stage
     * successor, diverged into its daughters, or it is still spoken). A
     * daughter begins as her parent's lineage AS IT STOOD IN HER BIRTH YEAR.
     *
     * Two things follow that the old edge-per-daughter model could not give.
     * Sisters share every change their parent made before the earlier of them
     * split off; that is what a shared innovation is, and subgrouping by the
     * comparative method rests on it (the old model gave sisters no shared
     * change at all, however long they had been one language). And a living
     * language with daughters goes on changing to the present instead of
     * stopping on its birthday, as Standard Dahen did at 1300 and Old Lirali,
     * spoken for 2,065 years, did at -300.
     *
     * Nothing can inherit from its future: a daughter's founding state is her
     * parent's changeset truncated at her birth year.
     */
    const lifeEnd = (l) => {
        if (l.died != null) return l.died;
        // the app's lost branches (scripts/lost-languages.py) do not lengthen their parent's life: one
        // born after its sisters made the proto live on, and redrew the whole family (DJ, 20 Oct 2026)
        const all = children.get(l.id) || [];
        const kids = all.some((k) => !k.lost) ? all.filter((k) => !k.lost) : all;
        if (l.diverged || kids.some((k) => k.relation === 'stage')) {
            return kids.length ? Math.max(...kids.map((k) => k.born)) : (cfg.presentYear ?? l.born);
        }
        return cfg.presentYear ?? l.born;
    };
    const foundingCache = new Map();
    const lifeCsCache = new Map();
    const lifeLoansCache = new Map();
    const atCache = new Map();
    const rateCache = new Map();
    const resolving = new Set();

    /**
     * How fast this branch changes, drawn per branch and INHERITED.
     *
     * Real families are not uniform: Icelandic barely moved in a thousand
     * years while English was demolished, and both are Germanic. The draw is
     * log-normal (a rate cannot be negative, and twice as fast should be as
     * likely as half as fast) and multiplies the PARENT's rate, so a
     * conservative lineage tends to stay conservative: Sapir's drift.
     */
    function rateOfNode(node) {
        if (rateCache.has(node.id)) return rateCache.get(node.id);
        const explicit = sidecar.rates?.[keyOf(node)] ?? sidecar.rates?.[node.id];
        let r;
        if (explicit != null) r = explicit;
        else if (!node.parentId) r = 1;
        else r = Math.max(0.4, Math.min(2.2, rateOfNode(byId.get(node.parentId)) * derive(cfg.seed, keyOf(node), 'rate').lognormal(0.30)));
        rateCache.set(node.id, r);
        return r;
    }

    /**
     * A lineage's own sound-system sizes, drawn per branch and INHERITED.
     *
     * A family's consonant size (lang-config consonantTarget) held for every
     * daughter alike, so 65% of Andah's branches sat at 19-25 consonants
     * against 36% on Earth: real subgroups drift apart (Polynesian ten
     * consonants, its Austronesian cousins twenty and more). Each branch moves
     * its parent's consonant target a little (a stage, the same language
     * renamed, keeps it), and now and then a branch takes a vowel size of its
     * own from Earth's spread (an Arabic three, a Germanic nine); subgroups
     * keep what their parent drew, so they stay alike.
     */
    const targetCache = new Map();
    function targetsOf(node) {
        if (targetCache.has(node.id)) return targetCache.get(node.id);
        let t;
        if (!node.parentId || !byId.has(node.parentId)) {
            // the vowels: the proto's own count of qualities is where its lineages start from
            const vowels = foundingOf(node)?.inventory?.vowels || [];
            const q = new Set(vowels.map((v) => `${v.f.height}|${v.f.back}|${v.f.round}`)).size;
            t = { c: cfg.consonantTarget ?? null, v: q || null, vRaw: q || null, open: false, closed: false };
        }
        else {
            const p = targetsOf(byId.get(node.parentId));
            t = { ...p };
            if (node.relation !== 'stage') {
                const r = derive(cfg.seed, keyOf(node), 'size-targets');
                /**
                 * The consonant size a branch is drawn to drifts from its
                 * parent's in PROPORTION (whole series double or collapse:
                 * Proto-Oceanic about 23 > Proto-Polynesian 13 > Hawaiian 8;
                 * Middle Chinese about 37 initials > Mandarin about 22), and
                 * with TIME rather than with the number of splits: Polynesian
                 * split many times inside a thousand years and every daughter
                 * stayed at 8-13, while the long Oceanic-to-Polynesian branch
                 * carried the drop. Log-normal, as WALS 1A's sizes are (mean
                 * 22.7, a long upper tail: 10% at 34 and more). A fixed step
                 * of 3.5 per split gave a 300-year leaf the jump of a
                 * 3,000-year branch. The unrounded size is carried down.
                 */
                if (p.c != null) {
                    const life = Math.max(0.15, Math.min(4, (lifeEnd(node) - node.born) / 1000));
                    const s = 0.22 * Math.sqrt(life);
                    t.cRaw = Math.max(6, Math.min(80, (p.cRaw ?? p.c) * Math.exp(r.gaussian(-s * s / 2, s))));
                    t.c = Math.round(t.cRaw);
                }
                /**
                 * The vowel qualities the same way: every lineage has a size of
                 * its own, its parent's moved in proportion with time. Before,
                 * three branches in ten drew a fresh size from Earth's spread and
                 * the rest had none, so the gate pulled them all to Earth's
                 * commonest five or six: 67% of Andah against 51% (WALS 2A), 24%
                 * at seven or more against 33%. Arabic's three, Proto-Indo-
                 * European's five and Danish's eleven-odd are family histories,
                 * not draws.
                 */
                if (p.v != null) {
                    const life = Math.max(0.15, Math.min(4, (lifeEnd(node) - node.born) / 1000));
                    const s = 0.12 * Math.sqrt(life);
                    t.vRaw = Math.max(2, Math.min(14, (p.vRaw ?? p.v) * Math.exp(r.gaussian(-s * s / 2, s))));
                    t.v = Math.round(t.vRaw);
                }
                /**
                 * Open syllables as a lineage's drift (generate.js candidateSequence):
                 * a branch turns to (C)V the longer it lives, and its daughters keep
                 * to it, as the Polynesian languages kept losing codas for two
                 * thousand years and never took any back (WALS 12A: 13% of Earth's
                 * languages are (C)V). Repairs alone, at one rate everywhere, left
                 * every Andah language with codas or clusters in a tenth of its
                 * words or more: nothing held a lineage to the open syllables it
                 * had reached.
                 */
                const lifeK = Math.max(0.15, Math.min(4, (lifeEnd(node) - node.born) / 1000));
                t.open = p.open ? !r.bool(0.05) : r.bool(1 - Math.exp(-OPEN_RATE * lifeK));
                // the other way: a lineage drawn to heavy clusters (Common Slavic lost its weak
                // vowels family-wide, leaving Polish zdzblo and Russian vzglyad); never both at once
                const toClosed = r.bool(1 - Math.exp(-CLOSED_RATE * lifeK));
                t.closed = t.open ? false : p.closed ? !r.bool(0.05) : toClosed;
            }
        }
        targetCache.set(node.id, t);
        return t;
    }

    /**
     * DRIFT: which kinds of sound change a lineage leans towards, inherited.
     *
     * Every family drew its changes from one shared rate table, so all of them
     * converged on the same look: the template mix of any two families was as
     * alike as two random draws from one table. Sapir's drift is an inherited
     * tendency instead: Germanic kept weakening its unstressed syllables for
     * two thousand years, Romance kept palatalising. So a family's root draws a
     * multiplier per template and per category (log-normal, so twice as likely
     * is as likely as half), each daughter perturbs her parent's slightly, and a
     * family's config can fix a tendency outright (`drift` in lang-config.json,
     * template id → multiplier) where its character is lore.
     *
     * One tendency is read from the evidence rather than drawn: how readily the
     * family deletes. The names of its LIVING languages are words of those
     * languages, and their length is the best evidence there is of how much a
     * family has eroded. A family whose languages are called Bewilojega and
     * Hozutuxepi (4.4 syllables) did not get there by shedding syllables, yet
     * with one shared deletion rate every family wore down to 1.2-1.5 syllables
     * per core word, 60-78% monosyllables, and then grew tone and homophony
     * because of it. So deletion (and the vowel reduction that feeds it) is
     * scaled by (2 / mean syllables of the living-language names)², clamped:
     * about 0.2 for Amnant, 0.5 for Alzuria-Ayuman, 1 for families whose
     * modern names are two syllables long. A tendency seeded from evidence,
     * not a length the engine steers towards.
     */
    const ERODING = (t) => t.category === 'deletion' || t.id === 'reduction-to-schwa';
    const erosionFromNames = (() => {
        const living = tree.filter((l) => l.died == null && !l.diverged && !l.generated && !children.has(l.id));
        // City names are modern words too, and count as evidence of how far
        // the family has worn down.
        const leafNames = evidence?.living?.length ? evidence.living
            : [...(living.length ? living : tree.filter((l) => !l.generated)).map((l) => l.name), ...cities];
        const syl = mineProfile(leafNames, { reading: cfg.reading }).meanSyllablesPerWord || 2;
        return Math.max(0.15, Math.min(2.5, (2 / syl) ** 2));
    })();
    const driftCache = new Map();
    function driftOf(node) {
        if (driftCache.has(node.id)) return driftCache.get(node.id);
        const out = {};
        if (!node.parentId) {
            const byCategory = {};
            for (const t of CATALOGUE) {
                if (byCategory[t.category] == null) byCategory[t.category] = derive(cfg.seed, 'drift-category', t.category).lognormal(0.6);
                out[t.id] = derive(cfg.seed, 'drift', t.id).lognormal(0.8) * byCategory[t.category]
                    * (ERODING(t) ? erosionFromNames : 1) * (cfg.drift?.[t.id] ?? 1)
                    // A whole category can be leaned on too: "category:deletion".
                    * (cfg.drift?.[`category:${t.category}`] ?? 1);
            }
        } else {
            const parent = driftOf(byId.get(node.parentId));
            for (const [id, m] of Object.entries(parent)) out[id] = m * derive(cfg.seed, keyOf(node), `drift:${id}`).lognormal(0.25);
        }
        driftCache.set(node.id, out);
        return out;
    }

    /**
     * Standardisation: the stage born after the standardisation year is the one
     * that got written down, so it spells itself honestly; everything below it
     * inherits that spelling while its pronunciation carries on.
     */
    /**
     * When the family was first written in a standard form. A date from the
     * wiki in lang-config (Dahen: the Dehlan script standardisation, 207 BFA)
     * stands; otherwise the engine draws one from the family's own record
     * (DJ, 17 Oct 2026: "engine draws per family"), as on Earth: a family
     * with a classical written language behind it standardises its
     * vernaculars early (Latin behind the Romance standards of the 1400s and
     * 1500s), a large family of states early too, and a small one in the
     * modern centuries, when most of Earth's languages were first written by
     * schools, missions and new states. Every family sat at a placeholder
     * 700 before.
     */
    const standardisedAt = (() => {
        if (cfg.standardisedAt !== undefined) return cfg.standardisedAt;
        const size = tree.filter((l) => !l.generated).length;
        const r = derive(cfg.seed, 'writing');
        const [lo, hi] = cfg.classical ? [1050, 1350] : size >= 40 ? [900, 1400] : size >= 10 ? [1300, 1600] : [1500, 1720];
        return Math.round(r.float(lo, hi) / 5) * 5;
    })();
    const frozenFor = (node) => {
        if (sidecar.nodes?.[node.id]?.orthographyFrozenAt != null) return true;
        return standardisedAt != null && lifeEnd(node) > standardisedAt;
    };
    /**
     * The year a language living through the standardisation year was
     * written down: that year, so its spelling is how it was said THEN and
     * the rest of its life opens the gap. It was frozen at the end of the
     * first written stage's life, so a language spoken from before
     * standardisation to the present spelled 1765 perfectly: 176 of 190
     * living languages had a phonemic spelling.
     */
    const writtenFrom = (node) => (standardisedAt != null && node.born < standardisedAt
        && lifeEnd(node) > standardisedAt ? standardisedAt : null);
    const conventionCache = new Map();
    /** The spelling convention set in a year: the language as said then. */
    function conventionAt(node, year) {
        const key = `${node.id}@${year}`;
        if (conventionCache.has(key)) return conventionCache.get(key);
        const cs = lifeCsOf(node);
        const founding = foundingOf(node);
        let st = founding;
        if (cs && year > node.born) {
            const L = lifeLoansOf(node, year);
            st = evolve(founding, truncateChangeSet(cs, year), {
                ignoreFrozen: true,
                loans: L.loans.filter((e) => (e.enteredAt ?? -Infinity) <= year),
            });
        }
        const romanisation = buildRomanisation(st.inventory);
        const out = { year, romanisation, spellings: freezeSpellings(st.entries, romanisation) };
        conventionCache.set(key, out);
        return out;
    }
    /** How this language is written up to `year`: evolve()'s spelling options. */
    function spellingOpts(node, cs, year = Infinity) {
        if (!frozenFor(node)) return { orthographyFrozen: false };
        const reform = reformOf(node, cs);
        if (reform != null && reform <= year) return { orthographyFrozen: true, spellingsFrom: conventionAt(node, reform), spellingReform: reform };
        const w = writtenFrom(node);
        if (w != null) return w <= year ? { orthographyFrozen: true, spellingsFrom: conventionAt(node, w) } : { orthographyFrozen: false };
        return { orthographyFrozen: true };
    }

    /**
     * How readily a written lineage reforms its spelling: drawn at the root,
     * inherited with a little drift, so reform runs in families (the Iberian
     * and Scandinavian standards keep reforming; English and French keep
     * their spellings). About one and a half reforms a millennium at the
     * median, after standardisation only, since only a written language has
     * a spelling to reform.
     */
    const REFORM_RATE = 1.5;
    const MODERN_ERA = 1450;
    const reformismCache = new Map();
    function reformismOf(node) {
        if (reformismCache.has(node.id)) return reformismCache.get(node.id);
        const parent = node.parentId ? byId.get(node.parentId) : null;
        const v = parent
            ? reformismOf(parent) * derive(cfg.seed, keyOf(node), 'reformism').lognormal(0.35)
            : derive(cfg.seed, 'reformism').lognormal(0.9);
        reformismCache.set(node.id, v);
        return v;
    }
    /** The year this language reformed its spelling, or null. */
    function reformOf(node, cs) {
        if (!cs || !frozenFor(node)) return null;
        const from = Math.max(node.born, standardisedAt ?? node.born);
        const years = cs.to - from;
        if (years <= 0) return null;
        const r = derive(cfg.seed, keyOf(node), 'spelling-reform');
        // The modern centuries count double: printing, nation states and
        // schooling made most of Earth's reforms (after 1700 there; 1450 here).
        const modern = Math.max(0, cs.to - Math.max(from, MODERN_ERA));
        if (!r.bool(1 - Math.exp(-REFORM_RATE * reformismOf(node) * (years + modern) / 1000))) return null;
        // when: a modern year is twice as likely as an older one
        const u = r.float(0, years + modern);
        const old = years - modern;
        return Math.round(u < old ? from + u : Math.max(from, MODERN_ERA) + (u - old) / 2);
    }

    /**
     * STRESS SHIFTS. A family's stress rule was fixed for ever at its proto,
     * and the stress rule is what decides which syllables erode (initial
     * stress wears suffixes away, final stress the syllables before it). On
     * Earth lineages shift it, and the shift is one of the things that makes
     * branches of one family look so different: Germanic fixed the stress on
     * the first syllable where its relatives kept the free accent, Irish and
     * Czech did the same, Latin moved to its weight rule, French ended with
     * final stress once its endings had gone, Polish moved to the penult. So
     * a daughter may start with a new rule, and her daughters keep it: one
     * branch in about ten (a renamed stage, the same language later, half as
     * often), the new rule drawn as often as each is innovated on Earth,
     * fixed initial stress most often.
     */
    // the new rule drawn as Earth's rules are spread (WALS 14A, as character.js draws a family's):
    // weighted to fixed initial stress, shifts pulled Andah to 22% initial against 18% and left 35%
    // with no fixed stress against 44%
    const SHIFT_TO = { moraicTrochee: 0.29, iambic: 0.15, penultimate: 0.22, initial: 0.18, final: 0.10, antepenultimate: 0.03 };
    function stressShiftOf(node, from) {
        if (!from || cfg.stressShifts === false) return null;
        const r = derive(cfg.seed, keyOf(node), 'stress-shift');
        if (!r.bool(node.relation === 'stage' ? 0.05 : 0.1)) return null;
        const options = Object.keys(SHIFT_TO).filter((k) => k !== from && STRESS_RULES[k]);
        if (!options.length) return null;
        const to = r.pickWeighted(options, (k) => SHIFT_TO[k]);
        return { from, to, year: node.born };
    }

    /** The language as it stood the year it was named. */
    function foundingOf(node) {
        if (foundingCache.has(node.id)) return foundingCache.get(node.id);
        let st;
        if (!node.parentId) {
            st = applyLocks(buildProto(protoNames, { ...cfg, rootId: node.id }), node, node.born);
        } else {
            const at = lineageAt(byId.get(node.parentId), node.born);
            st = { ...at, langId: node.id, parentId: node.parentId, isProto: false, founding: undefined, changeSet: null };
            const shift = stressShiftOf(node, at.phonotactics?.stress?.rule);
            if (shift) {
                const rule = STRESS_RULES[shift.to];
                st.phonotactics = { ...at.phonotactics, stress: { ...at.phonotactics.stress, rule: shift.to, label: rule.label, note: rule.note } };
                st.stressShift = shift;
            }
        }
        st.rate = rateOfNode(node);
        foundingCache.set(node.id, st);
        return st;
    }

    /**
     * What this language's contacts press on its own changes (DJ, 22 Oct
     * 2026: grammar through contact, "you pick"): tone and counting words
     * spread to it from languages that have them, the longer and stronger the
     * contact the more (mainland South-East Asia's tones and classifiers
     * cross four families), and its endings wear faster the more adults
     * learned it (English after the Norse, Afrikaans): most where a people
     * shifted into it, least from rulers. The contacts' grammar is read from
     * the last views build (data/history/contact-typology.json), since this
     * language's changes are planned before its contact is worked out; each
     * pressure runs 0 to 1. Null where nothing is known.
     */
    const SIMPLIFY = { substrate: 1, loan: 0.6, superstrate: 0.4, areal: 0.2 };
    /**
     * A lost people's shift lands on the language of the line that took them
     * in AS IT WAS when they did (contact.json `lost`: "took up Ealdorii by
     * 310" falls to Ealdorii's ancestor of 310).
     */
    const lostShifts = new Map();
    for (const m of contact?.lost || []) {
        if (m.vetoed || (contact.veto || []).includes(m.id)) continue;
        let n = byId.get(m.toId);
        while (n && n.born > m.year && n.parentId && byId.has(n.parentId)) n = byId.get(n.parentId);
        if (!n) continue;
        if (!lostShifts.has(n.id)) lostShifts.set(n.id, []);
        lostShifts.get(n.id).push({ ...m, fromId: m.like });
    }
    function contactPressureOf(node, end) {
        if (!contactTypology) return null;
        const parent = node.parentId ? byId.get(node.parentId) : null;
        const lo = parent ? parent.born : node.born;
        let tone = 0, clf = 0, wear = 0;
        const sounds = {}, lacks = {};
        for (const b of [...borrowings, ...(lostShifts.get(node.id) || [])]) {
            if (b.toId !== node.id && !(b.id || '').startsWith('map:lost:')) continue;
            if (b.year != null && (b.year < lo || b.year > end)) continue;
            const kind = b.kind || 'loan';
            if (!(kind in SIMPLIFY)) continue;
            const w = contactWeight({ kind, strength: b.strength ?? 1 });
            const d = contactTypology[b.fromId];
            if (d?.tone) tone += w;
            if (d?.classifiers) clf += w * (d.classifiers === 'obligatory' ? 1 : 0.5);
            for (const k of d?.sounds || []) sounds[k] = (sounds[k] || 0) + w;
            if (d) for (const k of Object.keys(SOUND_LOSS)) if (!(d.sounds || []).includes(k)) lacks[k] = (lacks[k] || 0) + w;
            wear += w * SIMPLIFY[kind];
        }
        if (!tone && !clf && !wear && !Object.keys(sounds).length && !Object.keys(lacks).length) return null;
        const r = (x, k) => Math.round(100 * Math.min(1, x / k)) / 100;
        const rs = (o) => Object.fromEntries(Object.entries(o).map(([k, x]) => [k, r(x, 2)]));
        return { tone: r(tone, 2), classifiers: r(clf, 2), wear: r(wear, 3), sounds: rs(sounds), lacks: rs(lacks) };
    }
    /**
     * The changes that make each kind of sound (soundchange/catalogue.js), for
     * contactDrift: a kind of sound its contacts have is likelier to arise.
     */
    const SOUND_TEMPLATES = {
        retroflex: ['retroflexion'], uvular: ['uvularisation', 'uvular-spirantisation'], pharyngeal: ['pharyngealisation'],
        ejective: ['glottalisation'], implosive: ['implosivisation'], labialVelar: ['labial-velarisation'],
        lateralFricative: ['lateral-fricativisation'], aspirated: ['aspiration-split'], palatalised: ['secondary-palatalisation', 'palatalisation'],
        nasalVowels: ['vowel-nasalisation'], frontRounded: ['umlaut'],
    };
    /**
     * And the changes that unmake the common kinds, for contacts that lack
     * them: contact draws a language TOWARDS its neighbours, both ways. Gain
     * alone, nasal vowels (in nearly half of Andah's inventories) spread
     * until 37% of branches had them against Earth's 26%.
     */
    const SOUND_LOSS = { nasalVowels: ['denasalisation'], frontRounded: ['unrounding'] };
    /**
     * Tonal neighbours make tone likelier to arise and slower to go
     * (soundchange/catalogue.js): the kinds that split a vowel's pitch by its
     * onset or its accent. Not the kind that comes as the final consonants
     * go, which wears the endings away with them: boosted as well, it made
     * a tenth more of Andah isolating and without tense endings.
     */
    function contactDrift(drift, pressure) {
        if (!pressure?.tone && !Object.keys(pressure?.sounds || {}).length && !Object.keys(pressure?.lacks || {}).length) return drift;
        const out = { ...(drift || {}) };
        if (pressure.tone) {
            for (const id of ['tonogenesis-voicing', 'tonogenesis-accent']) out[id] = (out[id] ?? 1) * (1 + 3 * pressure.tone);
            out['tone-loss'] = (out['tone-loss'] ?? 1) / (1 + 2 * pressure.tone);
        }
        // the sounds of its contacts, a shifted people's above all (Indic retroflexes from Dravidian)
        for (const [k, x] of Object.entries(pressure.sounds || {})) for (const id of SOUND_TEMPLATES[k] || []) out[id] = (out[id] ?? 1) * (1 + 3 * x);
        for (const [k, x] of Object.entries(pressure.lacks || {})) for (const id of SOUND_LOSS[k] || []) out[id] = (out[id] ?? 1) * (1 + 3 * x);
        return out;
    }

    /** The changes over the language's own lifetime. Pinned changesets are only re-timed. */
    function lifeCsOf(node) {
        if (lifeCsCache.has(node.id)) return lifeCsCache.get(node.id);
        const end = lifeEnd(node);
        let cs = null;
        if (end > node.born) {
            const pressure = contactPressureOf(node, end);
            const edge = {
                childId: node.id, parentId: node.parentId ?? null, from: node.born, to: end,
                rate: rateOfNode(node), drift: contactDrift(driftOf(node), pressure), ruleKey: keyOf(node), keepIsolating: isolatingLine.has(node.id),
                contact: pressure,
                consonantTarget: targetsOf(node).c, vowelTarget: targetsOf(node).v, openSyllables: targetsOf(node).open, closedSyllables: targetsOf(node).closed,
            };
            cs = changeSets.get(keyOf(node));
            if (!cs) {
                cs = generateChangeSet(edge, foundingOf(node), derive(cfg.seed, keyOf(node), 'lifetime'));
                changeSets.set(keyOf(node), cs);
            } else if (cs.from !== edge.from || cs.to !== edge.to) {
                cs = retime(cs, edge.from, edge.to);
            }
        }
        lifeCsCache.set(node.id, cs);
        return cs;
    }

    /**
     * Contact during a language's lifetime.
     *
     * The donor is taken as it stood at the moment of contact, not as it stands
     * today: borrowing from a language is borrowing from the language it was.
     * An arrow dated BEFORE the recipient's birth (but after its parent's) is
     * clamped to the birth year: it is aimed at this language, so it must not
     * leak into the lineage its sisters share. Undated contact sits at the
     * midpoint of the lifetime, the least-committed reading.
     */
    /**
     * One contact event's raw result, cached on its own: the loans (before the
     * learned-loan dedupe, which depends on order and is done on assembly) and
     * the areal features. Keyed per event so a state part-way through a
     * lifetime can take only the events dated by then.
     */
    const eventCache = new Map();
    /**
     * The borrower in the year of contact: its sounds when founded, less what
     * its own mergers had removed by then, and the syllables its words then
     * had. Adapting every loan to the founding sounds gave back what the
     * language had already lost: a language that merged l into r took /l/
     * again with its next loans, and heavy contact undid its mergers wholesale
     * (lateral-less languages fell from 13% to 9%, small inventories from 12%
     * to 7%). Unconditioned changes are read (u > o, k merges into ʔ, l
     * merges into r), which is where a sound leaves a language.
     */
    function soundsAt(node, founding, year) {
        const cs = lifeCsOf(node);
        const moves = (cs?.rules || []).filter((r) => r.year != null && r.year <= year && !r.a?.stress && !r.a?.seq
            && !r.env?.before?.length && !r.env?.after?.length && r.b && (r.b.set !== undefined || r.b.delta));
        let inv = founding.inventory;
        for (const r of moves) {
            const next = { vowels: new Map(), consonants: new Map() };
            for (const ph of [...inv.vowels, ...inv.consonants]) {
                let out = [ph];
                try { out = applyRule([ph], r).segments; } catch { out = [ph]; }
                for (const x of out) (x.type === 'V' ? next.vowels : next.consonants).set(x.ipa, x);
            }
            inv = { ...inv, vowels: [...next.vowels.values()], consonants: [...next.consonants.values()] };
        }
        return inv === founding.inventory ? { ...founding, shape: shapeOf_(founding) } : { ...founding, inventory: inv, shape: shapeOf_(founding) };
    }
    /** The longest onset and coda a twentieth of the borrower's own words have (contact.js adapt). */
    const shapeCache = new Map();
    function shapeOf_(st) {
        if (shapeCache.has(st)) return shapeCache.get(st);
        const on = new Map(), co = new Map();
        let n = 0;
        for (const e of st.entries) {
            if (e.loan || e.paradigm || e.retired || !e.form?.length) continue;
            n += 1;
            let o = 0, c = 0;
            for (const x of syllabify(e.form, st.phonotactics)) { o = Math.max(o, x.onset.length); c = Math.max(c, x.coda.length); }
            on.set(o, (on.get(o) || 0) + 1);
            co.set(c, (co.get(c) || 0) + 1);
        }
        const top = (m) => { let k = 0; for (const [len, cnt] of m) if (cnt >= n / 20 && len > k) k = len; return k; };
        const out = n ? { onset: top(on), coda: top(co) } : null;
        shapeCache.set(st, out);
        return out;
    }

    function contactEvent(node, b, founding, yearOf) {
        const key = `${node.id}|${b.id}`;
        if (eventCache.has(key)) return eventCache.get(key);
        // Mutual borrowing is normal (English and French have done it for 900
        // years); the second direction of a cycle is skipped rather than
        // recursing forever.
        if (resolving.has(b.fromId)) return null;
        resolving.add(node.id);
        let donorState = null;
        /**
         * A donor in ANOTHER family is asked of the world (`resolveExternal`),
         * as it stood in the year of contact. Each family is derived in its own
         * project, and a donor that project did not hold used to resolve to
         * nothing: an Emaran superstrate on a Dahen-Kino language delivered 0
         * words where the same arrow inside one family delivered 232.
         */
        try {
            donorState = byId.has(b.fromId)
                ? stateAtYear(api, b.fromId, yearOf(b))
                : (resolveExternal ? resolveExternal(b.fromId, yearOf(b)) : null);
        } catch { donorState = null; }
        resolving.delete(node.id);
        const out = { b, year: yearOf(b), loans: [], areal: [], arealSyntax: null };
        if (donorState) {
            const rng = derive(cfg.seed, keyOf(node), `contact:${b.id}`);
            const dated = { ...b, year: out.year };
            if ((b.kind || 'loan') === 'areal') {
                out.areal = arealFeatures(donorState, founding).map((f) => ({ ...f, from: b.fromId, year: dated.year }));
            }
            /**
             * Every contact pulls on grammar, not only a sprachbund's: how hard
             * by its kind and strength (syntax/drift.js planSyntaxChange). A
             * long border between families lends grammar and no words.
             */
            const dc = donorState.paradigm?.categories;
            if (donorState.syntax) out.arealSyntax = { from: b.fromId, year: dated.year, donorSyntax: donorState.syntax, strength: b.strength ?? 1, kind: b.kind || 'loan',
                // what contactGrammar() reads: the donor's articles and evidentials
                donorGrammar: dc ? { definite: dc.articles?.definite ?? (dc.definite ? 'affix' : null), indefinite: dc.articles?.indefinite ?? null,
                    evidential: evidentialState(dc.evidentials), rep: !!dc.evidentials?.terms?.REP } : null };
            if (!b.grammarOnly) out.loans = markLearned(makeLoans(donorState, soundsAt(node, founding, out.year), dated, rng), b);
        }
        eventCache.set(key, out);
        return out;
    }

    /**
     * Contact during a language's lifetime, up to a given year.
     *
     * The donor is taken as it stood at the moment of contact, not as it stands
     * today: borrowing from a language is borrowing from the language it was.
     * An arrow dated BEFORE the recipient's birth (but after its parent's) is
     * clamped to the birth year: it is aimed at this language, so it must not
     * leak into the lineage its sisters share. Undated contact sits at the
     * midpoint of the lifetime, the least-committed reading.
     *
     * Only events dated by `upTo` are resolved. A daughter is founded from her
     * parent as it stood in her birth year, and that must not wait on contact
     * her parent had later: when the Yethrans, a daughter of Old Kaalsite,
     * conquered Alzuria in 650, founding Yethran (400) asked for Old Kaalsite's
     * contact in 650, which asked for Yethran, and one language took 38 seconds.
     */
    function lifeLoansOf(node, upTo = Infinity) {
        const cacheKey = upTo === Infinity ? node.id : `${node.id}@${upTo}`;
        if (lifeLoansCache.has(cacheKey)) return lifeLoansCache.get(cacheKey);
        const cs = lifeCsOf(node);
        const res = { loans: [], areal: [], arealSyntax: [] };
        if (cs) {
            const founding = foundingOf(node);
            const parent = node.parentId ? byId.get(node.parentId) : null;
            const lo = parent ? parent.born : node.born;
            const midpoint = Math.round((cs.from + cs.to) / 2);
            const yearOf = (b) => Math.max(node.born, b.year != null ? b.year : midpoint);
            const events = borrowings.filter((b) => b.toId === node.id
                && (b.year == null || (b.year >= lo && b.year <= cs.to))
                && yearOf(b) <= upTo);
            for (const b of events) {
                const ev = contactEvent(node, b, founding, yearOf);
                if (!ev) continue;
                res.areal.push(...ev.areal);
                if (ev.arealSyntax) res.arealSyntax.push(ev.arealSyntax);
                res.loans.push(...dropAlreadyBorrowed(ev.loans, [...founding.entries, ...res.loans], b));
            }
            res.loans.push(...modernOf(node, cs, founding, upTo));
        }
        lifeLoansCache.set(cacheKey, res);
        return res;
    }

    /**
     * Words for modern things (lexicon/modern.js), coined or borrowed in the
     * year each thing arrives, if the language is spoken then. How readily it
     * borrows from Lastnu is the language's own draw.
     */
    function modernOf(node, cs, founding, upTo) {
        const out = [];
        const open = derive(cfg.seed, keyOf(node), 'modern-openness').float(0, 1);
        for (const m of MODERN) {
            const rng = derive(cfg.seed, keyOf(node), 'modern', m.gloss);
            const now = { ...founding, entries: [...founding.entries, ...out] };
            if (m.year > node.born && m.year <= cs.to && m.year <= upTo) {
                const w = coinModern(m, now, node, { open, lastnu, rng });
                if (w) { out.push(w); continue; }
            }
            const w = internationalism(m, now, node, { open, lastnu, rng, end: cs.to });
            if (w && w.enteredAt <= upTo) out.push(w);
        }
        return out;
    }

    /** One language part-way through its own lifetime. */
    function lineageAt(node, year) {
        const cs = lifeCsOf(node);
        const founding = foundingOf(node);
        if (!cs || year <= node.born) return founding;
        if (year >= cs.to) return stateOf(node.id);
        const key = `${node.id}@${year}`;
        if (atCache.has(key)) return atCache.get(key);
        const L = lifeLoansOf(node, year);
        const st = evolve(founding, truncateChangeSet(cs, year), {
            ...spellingOpts(node, cs, year),
            standardisedAt,
            loans: L.loans.filter((e) => (e.enteredAt ?? -Infinity) <= year),
            arealFeatures: L.areal.filter((x) => x.year == null || x.year <= year),
            syntaxRng: derive(cfg.seed, keyOf(node), 'syntax-lifetime'),
            arealSyntax: L.arealSyntax.filter((x) => x.year == null || x.year <= year),
        });
        st.langId = node.id; st.parentId = node.parentId; st.node = node; st.rate = cs.rate;
        atCache.set(key, st);
        return st;
    }

    function stateOf(langId) {
        if (cache.has(langId)) return cache.get(langId);
        const node = byId.get(langId);
        if (!node) return null;
        const founding = foundingOf(node);
        const cs = lifeCsOf(node);
        let state;
        if (cs) {
            const L = lifeLoansOf(node);
            const life = evolve(founding, cs, {
                ...spellingOpts(node, cs),
                standardisedAt,
                loans: L.loans,
                arealFeatures: L.areal,
                syntaxRng: derive(cfg.seed, keyOf(node), 'syntax-lifetime'),
                arealSyntax: L.arealSyntax,
            });
            state = {
                ...life,
                langId: node.id,
                parentId: node.parentId,
                // A root is the reconstructed proto: as it stood at its
                // break-up, which is the language the comparative method
                // recovers. `founding` keeps it as it was generated.
                isProto: !node.parentId,
                changeSet: cs,
                founding,
                stillSpoken: node.died == null && !node.diverged,
            };
        } else {
            state = { ...founding, changeSet: null, founding };
        }
        state = applyLocks(state, node, cs?.to ?? node.born);
        state.node = node;
        state.rate = cs?.rate ?? rateOfNode(node);
        state.warning = cs ? rateWarning(cs) : null;
        applyOverrides(state, sidecar.nodes?.[keyOf(node)] ?? sidecar.nodes?.[langId]);
        cache.set(langId, state);
        return state;
    }

    /** The lineage containing `langId` as it stood in `year`: before its birth, an ancestor. */
    function lineageAtYear(langId, year) {
        let n = byId.get(langId);
        if (!n) return null;
        while (year < n.born && n.parentId) n = byId.get(n.parentId);
        return lineageAt(n, year);
    }

    /** Drop a node and everything downstream of it — used after a rule edit. */
    function invalidate(langId) {
        const stack = [langId];
        while (stack.length) {
            const id = stack.pop();
            cache.delete(id);
            foundingCache.delete(id);
            lifeCsCache.delete(id);
            for (const k of [...lifeLoansCache.keys()]) if (k === id || k.startsWith(`${id}@`)) lifeLoansCache.delete(k);
            for (const k of [...eventCache.keys()]) if (k.startsWith(`${id}|`)) eventCache.delete(k);
            rateCache.delete(id);
            driftCache.delete(id);
            reformismCache.delete(id);
            for (const k of [...conventionCache.keys()]) if (k.startsWith(`${id}@`)) conventionCache.delete(k);
            for (const k of [...atCache.keys()]) if (k.startsWith(`${id}@`)) atCache.delete(k);
            for (const kid of children.get(id) || []) stack.push(kid.id);
        }
    }

    const api = {
        config: cfg,
        stateOf,
        invalidate,
        lineageAtYear,
        foundingOf: (id) => (byId.get(id) ? foundingOf(byId.get(id)) : null),
        // the sizes and canon a lineage is drawn to (consonants, vowels, open syllables)
        targetsOf: (id) => (byId.get(id) ? targetsOf(byId.get(id)) : null),
        changeSetOf: (id) => changeSets.get(byId.has(id) ? keyOf(byId.get(id)) : id) || null,
        setChangeSet(id, cs) { changeSets.set(byId.has(id) ? keyOf(byId.get(id)) : id, { ...cs, generated: false }); invalidate(id); },
        endOf,
        childrenOf: (id) => children.get(id) || [],
        nodeOf: (id) => byId.get(id),
        /** Everything needed to write the sidecar back out. */
        serialise() {
            const livingNames = tree.filter((l) => l.died == null && !l.diverged && !l.generated && !children.has(l.id)).map((l) => l.name);
            return {
                schemaVersion: 1,
                // What the proto was mined from, so a pin can freeze it.
                evidence: evidence ?? { names: protoNames, living: [...livingNames, ...cities] },
                rootId: tree.find((l) => !l.parentId)?.id,
                seed: cfg.seed,
                config: cfg,
                edges: Object.fromEntries([...changeSets].map(([k, v]) => [k, serialiseChangeSet(v)])),
                nodes: sidecar.nodes || {},
                rates: sidecar.rates || {},
            };
        },
    };
    return api;
}

/**
 * Read a stage's syllable canon off its own lexicon.
 *
 * Same principle as `inventoryFromLexicon`: a constraint is not a declaration,
 * it is an observation. A segment is a licensed coda if words end syllables
 * with it; a vowel sequence is a diphthong if it recurs often enough to be one
 * rather than an accident of two words.
 *
 * Cutoffs mirror the ones used when mining the original name corpus, so the
 * proto and its daughters are measured by the same yardstick.
 */
function observePhonotactics(entries, parentPt, { codaCutoff = 2, diphthongCutoff = 3 } = {}) {
    const codaCounts = new Map();
    const seqCounts = new Map();
    let maxOnset = 1;

    for (const e of entries) {
        for (const s of syllabify(e.form, parentPt)) {
            for (const c of s.coda) codaCounts.set(c.ipa, (codaCounts.get(c.ipa) || 0) + 1);
            /**
             * The appendix counts towards the onset maximum.
             *
             * syllabify() parks any word-initial consonant it cannot fit into
             * the onset in an extrasyllabic appendix, so reading `s.onset.length`
             * alone reported a two-consonant maximum for a word that began with
             * five. The declared canon then disagreed with the language's own
             * lexicon in 306 words, and every check that trusted the canon —
             * cluster repair included — was consulting a figure that could not
             * see the problem it existed to catch.
             */
            maxOnset = Math.max(maxOnset, (s.appendix?.length || 0) + s.onset.length);
        }
        for (let i = 1; i < e.form.length; i++) {
            const a = e.form[i - 1]; const b = e.form[i];
            if (a.type === 'V' && b.type === 'V') {
                const k = a.ipa + b.ipa;
                seqCounts.set(k, (seqCounts.get(k) || 0) + 1);
            }
        }
    }

    const allowed = [...codaCounts.entries()].filter(([, n]) => n >= codaCutoff).map(([k]) => k);
    // Diphthongs the parent licensed stay licensed if they still occur at all —
    // a contrast is not lost merely because it became rare — and new sequences
    // join once they are frequent enough to be a pattern.
    const inherited = (parentPt.nucleus?.diphthongs || []).filter((d) => seqCounts.has(d));
    const fresh = [...seqCounts.entries()].filter(([, n]) => n >= diphthongCutoff).map(([k]) => k);
    const diphthongs = [...new Set([...inherited, ...fresh])];

    return {
        coda: { ...parentPt.coda, max: allowed.length ? Math.max(1, parentPt.coda.max || 1) : 0, allowed },
        nucleus: { ...parentPt.nucleus, diphthongs },
        // Capped, because the observation is only as trustworthy as the repair
        // that ran before it: a stray unrepairable word must not license a
        // five-consonant onset for the whole language.
        onset: {
            ...parentPt.onset,
            max: Math.min(Math.max(parentPt.onset.max, maxOnset), ONSET_MAX_CEILING),
        },
    };
}

/**
 * LOCKS: words DJ has approved, which never change.
 *
 * Stored on the language itself in languages.json (`locks: {gloss: ipa}`), so
 * they are saved, validated, backed up and undoable with every other edit,
 * and survive renames. A lock fixes the word as the language stood at the end
 * of its life: the present for a living language, the hand-over for a stage,
 * the break-up for a proto. Anything founded from that state (a stage
 * successor, the daughters of a proto) inherits the locked form and carries
 * on changing it; daughters that split off earlier never had it.
 *
 * The change is recorded in the word's derivation like any other step, so the
 * etymology still ends on the form the lexicon shows. Copies are made rather
 * than edits in place, because a founding state is shared with the lineage it
 * came from. A lock whose meaning has no word any more is listed in
 * `lockMisses` for the panel to show.
 */
function applyLocks(state, node, year) {
    const locks = node?.locks;
    if (!locks || !Object.keys(locks).length) return state;
    const histories = new Map(state.histories || []);
    const misses = [];
    let entries = state.entries;
    for (const [gloss, ipa] of Object.entries(locks)) {
        const i = entries.findIndex((e) => e.gloss === gloss && !e.retired && !e.paradigm);
        if (i < 0) { misses.push(gloss); continue; }
        const entry = entries[i];
        if (entry.ipa === ipa && entry.locked) continue;
        let form;
        try { form = parseWord(ipa); } catch { misses.push(gloss); continue; }
        const old = histories.get(entry.id);
        const history = old ? forkHistory(old) : newHistory(entry.id, entry.form, node.id);
        pushStep(history, { id: `${node.id}-lock`, stageId: node.id, year, label: 'form fixed by DJ (locked)' }, entry.form, form, true);
        histories.set(entry.id, history);
        if (entries === state.entries) entries = entries.slice();
        entries[i] = { ...entry, form, ipa, locked: true };
    }
    return { ...state, entries, histories, lockMisses: misses };
}

/**
 * Hand overrides are applied AFTER evolution, never before.
 *
 * That ordering is what lets a hand-fixed form survive a rule edit upstream:
 * the derivation is recomputed from scratch, and then the override is laid back
 * over the top. The alternative — editing the lexicon in place — would lose the
 * override the moment anything upstream changed.
 */
function applyOverrides(state, overlay) {
    if (!overlay) return;
    if (overlay.overrides) {
        state.entries = state.entries.map((e) => {
            const o = overlay.overrides[e.id];
            return o ? { ...e, form: o.form, ipa: o.ipa ?? e.ipa, overridden: true, overrideReason: o.reason } : e;
        });
    }
    if (overlay.glossOverrides) {
        state.entries = state.entries.map((e) => (
            overlay.glossOverrides[e.id] ? { ...e, gloss: overlay.glossOverrides[e.id], glossOverridden: true } : e
        ));
    }
    if (overlay.orthographyFrozenAt != null) state.orthographyFrozenAt = overlay.orthographyFrozenAt;
}

/** Rules hold live phoneme objects; strip to something JSON-safe. */
function serialiseChangeSet(cs) {
    return {
        childId: cs.childId, parentId: cs.parentId, from: cs.from, to: cs.to,
        rate: cs.rate, interval: cs.interval, generated: cs.generated, seed: cs.seed,
        /**
         * Everything speakers did, not only what the phonology did.
         *
         * Only `rules` holds live phoneme objects and needs the mapping below;
         * these four carry ids, glosses, years and strings, so they are already
         * JSON-safe. Omitting them meant a sidecar round-trip silently deleted
         * every replacement, sense shift, levelling and grammaticalisation on
         * the edge — a rebuilt Qai Qi came back with 156 retired words gone to
         * zero, 64 compounds gone to zero, and 72 fewer entries, while
         * `npm run check` passed because its round-trip invariant only asserted
         * that `rules` was still an array.
         */
        replacements: cs.replacements || [],
        shifts: cs.shifts || [],
        levellings: cs.levellings || [],
        grammaticalisations: cs.grammaticalisations || [],
        classifiers: cs.classifiers || [],
        pronouns: cs.pronouns || [],
        suppletions: cs.suppletions || [],
        articles: cs.articles || [],
        moods: cs.moods || [],
        evidentials: cs.evidentials || [],
        rules: cs.rules.map((r) => ({
            id: r.id, year: r.year, category: r.category, template: r.template,
            label: r.label, a: r.a, b: r.b, env: r.env,
            probability: r.probability, conditions: r.conditions,
            analogue: r.analogue, note: r.note,
        })),
    };
}

// ---------------------------------------------------------------------------
// Views over a derived stage
// ---------------------------------------------------------------------------

/**
 * The lexicon at an intermediate YEAR inside an edge.
 *
 * Each rule carries the year it applied, so a stage part-way through its own
 * edge is just the parent with the rules dated on or before that year. This is
 * what the time scrubber drags through — without per-rule dates it could only
 * snap between whole nodes.
 */
/**
 * A changeset truncated to the changes that had happened by a given year.
 *
 * ALL FIVE event lists, not just the rules. Every one of them carries a `year`
 * assigned in generate.js and re-spread by retime(), and truncating only the
 * rules meant that scrubbing to the first day of an edge already showed you
 * every replacement, sense shift, levelling and grammaticalisation the edge
 * would ever contain — 69 replacements applied at a year before the first of
 * them was dated.
 *
 * That is worse than a cosmetic scrubber fault, because `lifeLoansOf` borrows from
 * a donor via `stateAtYear`: a word taken from a neighbour in 1300 was taken
 * from a neighbour that had already undergone its 1370 vocabulary.
 */
function truncateChangeSet(cs, year) {
    const upTo = (list) => (list || []).filter((e) => e.year == null || e.year <= year);
    return {
        ...cs,
        /**
         * The cut is the stage's end. A daughter founded in -3500 from a proto
         * that lived on to -1000 carried the proto's end-of-life repairs dated
         * -1000 in the middle of its own history, and the syntax drift of the
         * proto's whole life, of which it had lived a third.
         */
        to: Math.min(cs.to ?? year, year),
        rules: upTo(cs.rules),
        replacements: upTo(cs.replacements),
        shifts: upTo(cs.shifts),
        levellings: upTo(cs.levellings),
        grammaticalisations: upTo(cs.grammaticalisations),
        classifiers: upTo(cs.classifiers),
        pronouns: upTo(cs.pronouns),
        suppletions: upTo(cs.suppletions),
        articles: upTo(cs.articles),
        moods: upTo(cs.moods),
        evidentials: upTo(cs.evidentials),
    };
}

/**
 * A language as it stood in a given year: part-way through its own lifetime,
 * or, before its birth, the ancestor it was then still part of. `lifeLoansOf`
 * relies on this to borrow from a donor as it WAS at the moment of contact.
 */
export function stateAtYear(project, langId, year) {
    return project.lineageAtYear ? project.lineageAtYear(langId, year) : null;
}

/** One root's reflex in each of several stages — a comparative table row. */
export function cognateSet(project, rootId, langIds) {
    const cells = langIds.map((id) => {
        const st = project.stateOf(id);
        const entry = st?.entries.find((e) => e.id === rootId);
        const history = st?.histories.get(rootId);
        return {
            langId: id,
            name: st?.node?.name ?? id,
            form: entry?.ipa ?? null,
            spelling: entry && st ? spellEntry(st, entry) : null,
            gloss: entry?.gloss ?? null,
            laws: history ? history.steps.filter((s) => s.applied).map((s) => s.label) : [],
        };
    });
    return { rootId, cells };
}

/**
 * Shared innovations vs shared retentions between two stages.
 *
 * The distinction is the backbone of the comparative method. Two languages
 * agreeing on something they both inherited tells you nothing about how closely
 * related they are — everyone inherited it. Two languages agreeing on a CHANGE
 * is evidence they made it together, before they split. Only shared innovations
 * subgroup a family.
 */
export function diffStages(project, aId, bId) {
    const a = project.stateOf(aId);
    const b = project.stateOf(bId);
    if (!a || !b) return null;

    const rulesOf = (state) => {
        const out = [];
        let cur = state;
        let until = Infinity;
        while (cur?.changeSet) {
            out.unshift(...cur.changeSet.rules
                .filter((r) => r.year == null || r.year <= until)
                .map((r) => ({ id: r.template || r.id, label: r.label, stage: cur.langId })));
            until = cur.node?.born ?? until;
            cur = project.stateOf(cur.parentId);
        }
        return out;
    };

    const ra = rulesOf(a);
    const rb = rulesOf(b);
    const setA = new Set(ra.map((r) => r.id));
    const setB = new Set(rb.map((r) => r.id));

    return {
        sharedInnovations: ra.filter((r) => setB.has(r.id)),
        onlyA: ra.filter((r) => !setB.has(r.id)),
        onlyB: rb.filter((r) => !setA.has(r.id)),
        inventoryA: a.inventory,
        inventoryB: b.inventory,
        divergentForms: a.entries.map((e, i) => {
            const other = b.entries.find((x) => x.id === e.id);
            return other && other.ipa !== e.ipa ? { id: e.id, gloss: e.gloss, a: e.ipa, b: other.ipa } : null;
        }).filter(Boolean),
    };
}
