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
import { generateInventory } from './phonology/inventory.js';
import { buildPhonotactics, repairHiatus, repairClusters, syllabify } from './phonology/phonotactics.js';
import { buildRomanisation, freezeSpellings, spellEntry } from './phonology/romanise.js';
import { conceptList } from './lexicon/swadesh.js';
import { generateLexicon, buildPools } from './lexicon/roots.js';
import { generateAffixes, deriveLexemes } from './lexicon/derivation.js';
import { evolveLexicon, inventoryFromLexicon, diffInventories } from './soundchange/apply.js';
import { generateChangeSet, retime, rateWarning } from './soundchange/generate.js';
import { pushStep } from './lexicon/etymology.js';
import { makeLoans, arealFeatures } from './contact.js';
import { buildParadigms, paradigmFromEntries } from './morphology/paradigm.js';
import { applyReplacements } from './lexicon/replacement.js';
import { applyShifts } from './lexicon/semantics.js';
import { erosionReport } from './morphology/erosion.js';
import { applyLevellings } from './morphology/analogy.js';
import { applyGrammaticalisation } from './morphology/grammaticalisation.js';
import { generateSyntax } from './syntax/parameters.js';
import { planSyntaxChange, applySyntaxChanges, coreCaseDistinctness } from './syntax/drift.js';
import { expandClassicalSource, markLearned, dropAlreadyBorrowed } from './lexicon/learned.js';

/** Default configuration for a family. Overridden per project in the sidecar. */
export const DEFAULT_CONFIG = {
    seed: 'default/0000',
    laryngeal: 'voicing',
    vowelCount: 5,
    vowelLength: false,
    stress: 'penultimate',
    lexiconSize: 600,
    marginalCutoff: 2,
    withhold: [],
    deriveFrom: {},
    derivation: true,
};

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
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const profile = mineProfile(names, { reading: cfg.reading });

    const inventory = generateInventory(profile, derive(cfg.seed, 'proto', 'inventory'), {
        laryngeal: cfg.laryngeal,
        vowelCount: cfg.vowelCount,
        vowelLength: cfg.vowelLength,
        marginalCutoff: cfg.marginalCutoff,
        withhold: cfg.withhold,
        deriveFrom: cfg.deriveFrom,
    });

    const phonotactics = buildPhonotactics(profile, derive(cfg.seed, 'proto', 'phonotactics'), {
        stress: cfg.stress,
        vowelLength: cfg.vowelLength,
        segmentMap: inventory.segmentMap,
    });

    const romanisation = buildRomanisation(inventory);
    const phonology = { inventory, phonotactics, profile, segmentMap: inventory.segmentMap };

    const lex = generateLexicon(conceptList(cfg.lexiconSize), phonology, derive(cfg.seed, 'proto', 'lexicon'));

    let entries = lex.roots;
    let affixes = [];
    const pools = buildPools(inventory, profile, inventory.segmentMap);
    if (cfg.derivation) {
        affixes = generateAffixes(phonology, pools, derive(cfg.seed, 'proto', 'affixes'));
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
    const entries = evolved.entries.map((e) => {
        // Hiatus first, then clusters: a cluster repair that inserts a vowel
        // must not then be re-examined as hiatus.
        const afterHiatus = repairHiatus(e.form, parentState.phonotactics);
        const fixed = repairClusters(afterHiatus, parentState.phonotactics);
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
    const entriesAfterReplacement = renewal.entries;

    const inventory = inventoryFromLexicon(entriesAfterReplacement);
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
    const observed = observePhonotactics(entriesAfterReplacement, parentState.phonotactics);
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
        ? (parentState.spellings ?? freezeSpellings(entriesAfterReplacement, romanisation))
        : null;

    // The paradigm is READ BACK OUT of the evolved lexicon. Its cells travelled
    // through the sound changes as ordinary words; putting them back into a
    // table is what makes the collapse visible.
    const paradigm = paradigmFromEntries(entriesAfterReplacement, parentState.paradigm, renewal.categories);
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
        entries: entriesAfterReplacement,
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
export function createProject({ tree, names, config, sidecar = {}, borrowings: chartBorrowings = [] }) {
    const cfg = { ...DEFAULT_CONFIG, ...config };
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

    function changeSetFor(node) {
        const parent = byId.get(node.parentId);
        const edge = {
            childId: node.id,
            parentId: node.parentId,
            // The edge runs from the parent's birth to the child's, which is the
            // window during which the changes separating them accumulated.
            from: parent.born,
            to: node.born,
            rate: sidecar.rates?.[node.id] ?? 1,
        };

        const stored = changeSets.get(node.id);
        if (stored) {
            // Pinned. Only the dates are allowed to move — see generate.js.
            return (stored.from !== edge.from || stored.to !== edge.to)
                ? retime(stored, edge.from, edge.to)
                : stored;
        }
        return null; // generated on demand below, needs the parent state
    }

    /**
     * Contact events landing on this edge.
     *
     * A borrowing arrow on the chart carries a year. The loan enters the
     * recipient at that year, which falls somewhere inside one edge, and from
     * then on behaves like an ordinary word — undergoing every later change and
     * escaping every earlier one.
     *
     * The donor is taken as it stood at the moment of contact, not as it stands
     * today. Borrowing from a language is borrowing from the language it was.
     */
    const resolving = new Set();
    function loansFor(node, changeSet, parentState) {
        /**
         * A contact event with NO year still happened — the chart makes the
         * year optional. Undated contact is placed at the midpoint of the edge,
         * which is the least-committed reading of "at some point between these
         * two languages existing".
         */
        const midpoint = Math.round((changeSet.from + changeSet.to) / 2);
        const yearOf = (b) => (b.year != null ? b.year : midpoint);
        const events = borrowings.filter((b) => b.toId === node.id
            && yearOf(b) >= changeSet.from && yearOf(b) <= changeSet.to);
        if (!events.length) return { loans: [], areal: [], arealSyntax: [] };

        const loans = [];
        const areal = [];
        /**
         * Areal contact carries the donor's SYNTAX alongside its structural
         * features, because word order is the classic areal feature and
         * `arealFeatures()` could not report on it while the syntax layer did
         * not exist. Kept separate from `areal` so the existing display is
         * untouched.
         */
        const arealSyntax = [];
        for (const b of events) {
            /**
             * Guard against a contact cycle. Two languages that borrow from
             * each other would otherwise recurse forever, and mutual borrowing
             * is entirely normal — English and French have done it for 900
             * years. The second direction is skipped rather than failing.
             */
            if (resolving.has(b.fromId)) continue;
            resolving.add(node.id);
            let donorState = null;
            try { donorState = stateAtYear(api, b.fromId, yearOf(b)); } catch { donorState = null; }
            resolving.delete(node.id);
            if (!donorState) continue;

            const rng = derive(cfg.seed, node.id, `contact:${b.id}`);
            const dated = { ...b, year: yearOf(b) };
            if ((b.kind || 'loan') === 'areal') {
                areal.push(...arealFeatures(donorState, parentState).map((f) => ({ ...f, from: b.fromId, year: b.year })));
                if (donorState.syntax) {
                    arealSyntax.push({ from: b.fromId, year: dated.year, donorSyntax: donorState.syntax });
                }
            }
            loans.push(...dropAlreadyBorrowed(
                markLearned(makeLoans(donorState, parentState, dated, rng), b),
                [...parentState.entries, ...loans], b,
            ));
        }
        return { loans, areal, arealSyntax };
    }


    /**
     * How fast this branch changes — drawn per branch and INHERITED.
     *
     * Real families are not uniform. Icelandic barely moved in a thousand
     * years; English was demolished over the same span, and both are Germanic.
     * A single family-wide rate produces daughters with no character, which is
     * exactly what the measurements showed: every branch within 9-12 changes
     * per millennium.
     *
     * The draw is log-normal, because a rate cannot be negative and being twice
     * as fast should be as likely as being half as fast. It is multiplied onto
     * the PARENT's rate rather than drawn fresh, so a conservative lineage tends
     * to stay conservative — that is Sapir's drift, an inherited tendency down a
     * family rather than a coin flip at every node.
     *
     * Seeded per node, so re-rolling one branch cannot disturb a sister.
     */
    function rateFor(node, parentState) {
        const explicit = sidecar.rates?.[node.id];
        if (explicit != null) return explicit;
        const parentRate = parentState?.rate ?? 1;
        const drawn = parentRate * derive(cfg.seed, node.id, 'rate').lognormal(0.30);
        return Math.max(0.4, Math.min(2.2, drawn));
    }

    function stateOf(langId) {
        if (cache.has(langId)) return cache.get(langId);
        const node = byId.get(langId);
        if (!node) return null;

        let state;
        if (!node.parentId) {
            state = buildProto(names, { ...cfg, rootId: node.id });
        } else {
            const parentState = stateOf(node.parentId);
            if (!parentState) return null;
            let cs = changeSetFor(node);
            if (!cs) {
                const parent = byId.get(node.parentId);
                cs = generateChangeSet(
                    { childId: node.id, parentId: node.parentId, from: parent.born, to: node.born, rate: rateFor(node, parentState) },
                    parentState,
                    derive(cfg.seed, node.id, 'ruleset'),
                );
                changeSets.set(node.id, cs);
            }
            const contact = loansFor(node, cs, parentState);
            /**
             * Standardisation: the year this family's spelling stopped moving.
             *
             * The freeze begins one stage LATE on purpose. The stage born just
             * after the standardisation year is the one that got written down,
             * so it spells itself honestly; everything below it inherits that
             * spelling while its pronunciation carries on. Freezing at the
             * stage itself would have fixed the orthography of the language's
             * grandparent, which is nobody's spelling reform.
             */
            const parentNode = byId.get(node.parentId);
            const standardised = cfg.standardisedAt != null && parentNode && parentNode.born >= cfg.standardisedAt;
            state = evolve(parentState, cs, {
                orthographyFrozen: sidecar.nodes?.[node.id]?.orthographyFrozenAt != null || standardised,
                standardisedAt: cfg.standardisedAt,
                loans: contact.loans,
                arealFeatures: contact.areal,
                syntaxRng: derive(cfg.seed, node.id, 'syntax'),
                arealSyntax: contact.arealSyntax,
            });
        }

        /**
         * A LIVING LANGUAGE GOES ON CHANGING AFTER IT IS BORN.
         *
         * Every edge above runs from the parent's birth to the child's, so all
         * of it is change that happened BEFORE the language existed under its
         * own name. Without what follows, a node's history stops on its own
         * birthday: 118 of 118 living leaves ended their sound history there,
         * the mean gap to the present was 687 years, and Acranan — spoken since
         * -400 — was missing 2,165 years of itself. Every "modern" language on
         * the chart was an archaic snapshot.
         *
         * So a living leaf gets one more edge, over its own lifetime. The same
         * machinery: a generated ruleset, contact, replacement, levelling,
         * everything. It is one more application of `evolve`, not a new mode.
         *
         * ## Why leaves only, and why that is safe rather than merely cheap
         *
         * Because nothing inherits from a leaf. An internal node's descendants
         * split off at various dates, so letting IT run to the present would
         * hand every daughter a parent from the future — which is the bug fixed
         * three commits ago, reintroduced structurally. Doing it properly for
         * internal nodes means deriving each child from `stateAtYear(parent,
         * child.born)`, and that is a larger change than this one.
         *
         * A node marked `diverged` should never get this edge in any case: it
         * did not go on being spoken, it turned into its descendants.
         */
        const isLeaf = !(children.get(node.id) || []).length;
        const livesOn = isLeaf && node.died == null && !node.diverged
            && cfg.presentYear != null && cfg.presentYear > node.born;

        if (livesOn) {
            const founding = state;
            const edge = {
                // Keyed distinctly so it can be pinned, re-timed and inspected
                // like any other edge without colliding with the one that
                // produced the language in the first place.
                childId: `${node.id}#modern`,
                parentId: node.id,
                from: node.born,
                to: cfg.presentYear,
                rate: founding.rate ?? founding.changeSet?.rate ?? 1,
            };
            let own = changeSets.get(edge.childId);
            if (!own) {
                own = generateChangeSet(edge, founding, derive(cfg.seed, node.id, 'lifetime'));
                changeSets.set(edge.childId, own);
            } else if (own.from !== edge.from || own.to !== edge.to) {
                own = retime(own, edge.from, edge.to);
            }

            /**
             * Contact during the lifetime now runs THROUGH this edge, so a word
             * borrowed in 1400 undergoes the changes dated after 1400 and
             * escapes the ones before — the datable-strata property that the
             * old append-and-stop path could not give it.
             */
            /**
             * Strictly AFTER the birth year, because the two edges meet there.
             *
             * The founding edge claims contact with `year <= to` and this one
             * claims `year >= from`, and for a node those are the same year —
             * so a borrowing dated exactly on a language's birthday was
             * delivered twice, once by each edge. The duplicate arrived with a
             * derivation chain that started again from the donor form, which is
             * what `npm run check` saw as a broken chain.
             */
            const lateContact = loansFor(node, own, founding);
            lateContact.loans = lateContact.loans.filter((e) => (e.enteredAt ?? -Infinity) > node.born);
            const modern = evolve(founding, own, {
                orthographyFrozen: founding.orthographyFrozen,
                standardisedAt: cfg.standardisedAt,
                loans: lateContact.loans,
                arealFeatures: lateContact.areal,
                syntaxRng: derive(cfg.seed, node.id, 'syntax-lifetime'),
                arealSyntax: lateContact.arealSyntax,
            });

            state = {
                ...modern,
                // It is still the same language. Everything downstream — the
                // panel, cognate sets, the comparative table — keys on this.
                langId: node.id,
                parentId: node.parentId,
                // The edge that produced it from its parent stays `changeSet`,
                // so every existing display reads what it always read. Its own
                // lifetime is a second, separately labelled history.
                changeSet: founding.changeSet,
                ownChangeSet: own,
                /**
                 * Statistics spanning BOTH edges.
                 *
                 * `changeSet` describes how the language got from its parent to
                 * its birth and `ownChangeSet` how it got from there to now, so
                 * a lookup by rule id has to find either. Handing the merged
                 * state the lifetime run's counts alone made it internally
                 * inconsistent — `npm run check` correctly reported a thousand
                 * founding-edge rules as having no effect, because it was
                 * looking them up in a table that only counted the lifetime.
                 */
                stats: mergeStats(founding.stats, modern.stats),
                /**
                 * Speakers' actions from BOTH edges, for the same reason.
                 * `npm run check` asks whether a paradigm that un-merged had an
                 * analogy or a renewal to explain it, and a levelling on the
                 * founding edge is just as good an explanation as one on the
                 * lifetime edge.
                 */
                levellings: [...(founding.levellings || []), ...(modern.levellings || [])],
                grammaticalisations: [...(founding.grammaticalisations || []), ...(modern.grammaticalisations || [])],
                /**
                 * The language as it was when it was named, kept beside the
                 * language as it is now. Both are real and a reader wants both:
                 * the box says "born 100" and the panel can show what that
                 * meant and what it has become.
                 */
                founding,
                stillSpoken: true,
                yearsSinceNamed: cfg.presentYear - node.born,
            };
        }

        /**
         * Contact DURING a language's own lifetime.
         *
         * Only reached now by nodes that did NOT get a lifetime edge above —
         * internal nodes, and languages that are already dead. For those there
         * genuinely are no further sound changes for the word to undergo, so it
         * joins the lexicon in the shape it was adapted into. Without it, every
         * arrow pointing at a living language silently did nothing, which was
         * two of the three on the chart.
         *
         * A leaf that got a lifetime edge must NOT come through here as well:
         * its late contact was already delivered through that edge, where the
         * words could undergo the changes dated after their arrival. Applying
         * it twice would give the language every late loan in two shapes at
         * once, one weathered and one not.
         */
        const lateEvents = livesOn ? [] : borrowings.filter((b) => b.toId === node.id
            && b.year != null && b.year > node.born
            && b.year <= (node.died ?? cfg.presentYear ?? node.born));
        if (lateEvents.length) {
            const extra = [];
            for (const b of lateEvents) {
                if (resolving.has(b.fromId)) continue;
                resolving.add(node.id);
                let donorState = null;
                try { donorState = stateAtYear(api, b.fromId, b.year); } catch { donorState = null; }
                resolving.delete(node.id);
                if (!donorState) continue;
                extra.push(...dropAlreadyBorrowed(
                    markLearned(makeLoans(donorState, state, b, derive(cfg.seed, node.id, `contact-late:${b.id}`)), b),
                    [...state.entries, ...extra], b,
                ));
            }
            if (extra.length) {
                state = { ...state, entries: [...state.entries, ...extra], loansReceived: [...(state.loansReceived || []), ...extra] };
            }
        }

        state.node = node;
        state.rate = state.changeSet?.rate ?? 1;
        state.warning = state.changeSet ? rateWarning(state.changeSet) : null;
        applyOverrides(state, sidecar.nodes?.[langId]);
        cache.set(langId, state);
        return state;
    }

    /** Drop a node and everything downstream of it — used after a rule edit. */
    function invalidate(langId) {
        const stack = [langId];
        while (stack.length) {
            const id = stack.pop();
            cache.delete(id);
            for (const kid of children.get(id) || []) stack.push(kid.id);
        }
    }

    const api = {
        config: cfg,
        stateOf,
        invalidate,
        changeSetOf: (id) => changeSets.get(id) || null,
        setChangeSet(id, cs) { changeSets.set(id, { ...cs, generated: false }); invalidate(id); },
        endOf,
        childrenOf: (id) => children.get(id) || [],
        nodeOf: (id) => byId.get(id),
        /** Everything needed to write the sidecar back out. */
        serialise() {
            return {
                schemaVersion: 1,
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
            maxOnset = Math.max(maxOnset, s.onset.length);
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
        onset: { ...parentPt.onset, max: Math.max(parentPt.onset.max, maxOnset) },
    };
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
        rate: cs.rate, interval: cs.interval, generated: cs.generated,
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
 * Union two stage statistics, so a state produced by more than one edge can
 * still answer "did this rule do anything" for a rule on either of them.
 */
function mergeStats(a, b) {
    if (!a) return b;
    if (!b) return a;
    const byRule = new Map(a.byRule || []);
    for (const [id, n] of (b.byRule || [])) byRule.set(id, (byRule.get(id) || 0) + n);
    return { ...a, ...b, byRule };
}

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
 * That is worse than a cosmetic scrubber fault, because `loansFor` borrows from
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

export function stateAtYear(project, langId, year) {
    const node = project.nodeOf(langId);
    if (!node) return null;
    const full = project.stateOf(langId);
    if (!full) return null;

    /** The language as it stood the year it was named. */
    const atBirth = full.founding ?? full;

    /**
     * AFTER its birth, a living language is part-way through its own lifetime.
     *
     * This half exists because of `loansFor`, not because of the scrubber.
     * Borrowing from a language is borrowing from the language it WAS, and a
     * donor that is a living leaf now has a modern state that is centuries
     * ahead of most contact events pointing at it. Returning that state would
     * hand a 1400 borrowing its donor's 1765 phonology — the same
     * inheriting-from-the-future error that was fixed for daughters, arriving
     * by a different road.
     */
    if (year >= node.born) {
        const own = full.ownChangeSet;
        if (!own) return full;                        // never changed again after its birth
        if (year >= (own.to ?? own.from)) return full;
        return evolve(atBirth, truncateChangeSet(own, year), {
            orthographyFrozen: atBirth.orthographyFrozen,
            syntaxRng: derive(project.config.seed, langId, 'syntax-lifetime'),
        });
    }

    // BEFORE its birth: part-way along the edge that produced it.
    if (!node.parentId) return atBirth;
    const cs = project.changeSetOf(langId);
    if (!cs) return atBirth;

    const parentState = project.stateOf(node.parentId);
    // Same syntax stream as the full derivation, so an intermediate stage is the
    // same language part-way through rather than a differently-ordered one.
    return evolve(parentState, truncateChangeSet(cs, year), {
        syntaxRng: derive(project.config.seed, langId, 'syntax'),
    });
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
        while (cur?.changeSet) {
            out.unshift(...cur.changeSet.rules.map((r) => ({ id: r.template || r.id, label: r.label, stage: cur.langId })));
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
