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
import { parseWord } from './features.js';
import { generateInventory } from './phonology/inventory.js';
import { buildPhonotactics, repairHiatus, repairClusters, repairCodas, syllabify } from './phonology/phonotactics.js';
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
import { applyReplacements } from './lexicon/replacement.js';
import { planTherapy } from './lexicon/therapy.js';
import { applyShifts } from './lexicon/semantics.js';
import { erosionReport } from './morphology/erosion.js';
import { applyLevellings } from './morphology/analogy.js';
import { applyGrammaticalisation } from './morphology/grammaticalisation.js';
import { generateSyntax } from './syntax/parameters.js';
import { planSyntaxChange, applySyntaxChanges, coreCaseDistinctness } from './syntax/drift.js';
import { expandClassicalSource, markLearned, dropAlreadyBorrowed } from './lexicon/learned.js';

/**
 * Default configuration for a family. Overridden per project in the sidecar.
 *
 * No laryngeal reconstruction and no vowel count: those were Dahen-Kino's
 * Middle Chinese voicing and a flat five vowels, handed to every family.
 * A family that does not declare them takes them from its evidence
 * (character.js and the mined profile).
 */
export const DEFAULT_CONFIG = {
    seed: 'default/0000',
    vowelLength: false,
    stress: 'penultimate',
    lexiconSize: 600,
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
        morphology: character.morphology, syntax: character.syntax,
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

    /**
     * Paradigm cells join the LEXICON rather than living beside it.
     *
     * They are whole inflected words, so as ordinary entries they get sound
     * changes, derivation histories and phonotactic repair with no new
     * machinery in evolve() at all — and the erosion of the paradigm becomes a
     * consequence of the phonology rather than something anyone scripts.
     */
    const { paradigm, entries: cells } = buildParadigms(entries, phonology, pools, derive(cfg.seed, 'proto', 'paradigms'), cfg);
    if (cells.length) entries = [...entries, ...cells];

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
    const replaced = applyReplacements(entries, changeSet.replacements, parentState.phonotactics);

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
     * The tidy pass, after everything that can add material to the lexicon.
     *
     * Loans, renewed paradigm cells and analogical forms all introduce segments,
     * so the functional-load census that decides what is still a contrast has to
     * see the finished lexicon, not an intermediate one. See tidy.js for what it
     * removes and — as importantly — what it deliberately leaves alone.
     */
    const tidied = tidyLexicon(renewal.entries);
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
    const mergeNote = tidied.merges.length
        ? `marginal contrasts neutralised (${tidied.merges.slice(0, 4).join(', ')}${tidied.merges.length > 4 ? '…' : ''})`
        : 'overlong geminate reduced';
    for (let i = 0; i < renewal.entries.length; i++) {
        const before = renewal.entries[i];
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
    const entriesAfterTherapy = reduceFrequent(repaired).entries;
    // And, as with every other rewrite in here, it has to appear in the
    // derivation. Omitting this left 77,457 words whose recorded history ended
    // on a form the lexicon no longer showed.
    for (let i = 0; i < repaired.length; i++) {
        const before = repaired[i];
        const after = entriesAfterTherapy[i];
        if (before === after) continue;
        const history = historyFor(before);
        pushStep(history, {
            id: `${stageId}-reduce`, stageId, year: changeSet.to,
            label: 'reduction in frequent use',
        }, before.form, after.form, true);
    }

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
    const frozen = opts.orthographyFrozen || parentState.orthographyFrozen;
    const romanisation = frozen ? parentState.romanisation : buildRomanisation(inventory);
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
     * The word spellings inherited from the stage that was written down.
     *
     * Built once, at the first frozen stage — that is the stage whose spelling
     * became the convention — and passed down untouched from there. A word not
     * in the table arrived after the freeze and is spelled by the current
     * mapping, which is why the recent stratum of any deep orthography looks
     * more phonetic than the native one.
     */
    const spellings = frozen
        ? (parentState.spellings ?? freezeSpellings(entriesAfterTherapy, romanisation))
        : null;

    // The paradigm is READ BACK OUT of the evolved lexicon. Its cells travelled
    // through the sound changes as ordinary words; putting them back into a
    // table is what makes the collapse visible.
    const paradigm = paradigmFromEntries(entriesAfterTherapy, parentState.paradigm, renewal.categories);
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
        orthographyFrozenAt: frozen ? (opts.standardisedAt ?? parentState.orthographyFrozenAt ?? null) : null,
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
export function createProject({ tree, names, config, sidecar = {}, borrowings: chartBorrowings = [], evidenceNames = [], resolveExternal = null }) {
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
    const borrowings = [
        ...chartBorrowings,
        ...expandClassicalSource(cfg, tree, { presentYear: cfg.presentYear }),
    ];
    const byId = new Map(tree.map((l) => [l.id, l]));
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
        const kids = children.get(l.id) || [];
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
        if (!node.parentId || !byId.has(node.parentId)) t = { c: cfg.consonantTarget ?? null, v: null };
        else {
            const p = targetsOf(byId.get(node.parentId));
            t = { ...p };
            if (node.relation !== 'stage') {
                const r = derive(cfg.seed, keyOf(node), 'size-targets');
                if (p.c != null) t.c = r.aboutInt(p.c, 2.5, 8, 44);
                if (r.bool(0.3)) t.v = Number(r.pickWeighted(Object.keys(EARTH_VOWELS), (k) => EARTH_VOWELS[k]));
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
    const frozenFor = (node) => {
        if (sidecar.nodes?.[node.id]?.orthographyFrozenAt != null) return true;
        const parentNode = node.parentId ? byId.get(node.parentId) : null;
        return cfg.standardisedAt != null && !!parentNode && parentNode.born >= cfg.standardisedAt;
    };

    /** The language as it stood the year it was named. */
    function foundingOf(node) {
        if (foundingCache.has(node.id)) return foundingCache.get(node.id);
        let st;
        if (!node.parentId) {
            st = applyLocks(buildProto(protoNames, { ...cfg, rootId: node.id }), node, node.born);
        } else {
            const at = lineageAt(byId.get(node.parentId), node.born);
            st = { ...at, langId: node.id, parentId: node.parentId, isProto: false, founding: undefined, changeSet: null };
        }
        st.rate = rateOfNode(node);
        foundingCache.set(node.id, st);
        return st;
    }

    /** The changes over the language's own lifetime. Pinned changesets are only re-timed. */
    function lifeCsOf(node) {
        if (lifeCsCache.has(node.id)) return lifeCsCache.get(node.id);
        const end = lifeEnd(node);
        let cs = null;
        if (end > node.born) {
            const edge = {
                childId: node.id, parentId: node.parentId ?? null, from: node.born, to: end,
                rate: rateOfNode(node), drift: driftOf(node), ruleKey: keyOf(node),
                consonantTarget: targetsOf(node).c, vowelTarget: targetsOf(node).v,
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
                if (donorState.syntax) out.arealSyntax = { from: b.fromId, year: dated.year, donorSyntax: donorState.syntax };
            }
            out.loans = markLearned(makeLoans(donorState, founding, dated, rng), b);
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
        }
        lifeLoansCache.set(cacheKey, res);
        return res;
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
            orthographyFrozen: frozenFor(node),
            standardisedAt: cfg.standardisedAt,
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
                orthographyFrozen: frozenFor(node),
                standardisedAt: cfg.standardisedAt,
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
        rules: upTo(cs.rules),
        replacements: upTo(cs.replacements),
        shifts: upTo(cs.shifts),
        levellings: upTo(cs.levellings),
        grammaticalisations: upTo(cs.grammaticalisations),
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
