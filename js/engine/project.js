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
import { buildRomanisation } from './phonology/romanise.js';
import { conceptList } from './lexicon/swadesh.js';
import { generateLexicon, buildPools } from './lexicon/roots.js';
import { generateAffixes, deriveLexemes } from './lexicon/derivation.js';
import { evolveLexicon, inventoryFromLexicon, diffInventories } from './soundchange/apply.js';
import { generateChangeSet, retime, rateWarning } from './soundchange/generate.js';
import { pushStep } from './lexicon/etymology.js';
import { makeLoans, arealFeatures } from './contact.js';
import { buildParadigms, paradigmFromEntries } from './morphology/paradigm.js';
import { applyReplacements } from './lexicon/replacement.js';
import { erosionReport } from './morphology/erosion.js';

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
    const startingEntries = incoming.length ? [...parentState.entries, ...incoming] : parentState.entries;

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
    const entriesAfterReplacement = applyReplacements(entries, changeSet.replacements);

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

    // The paradigm is READ BACK OUT of the evolved lexicon. Its cells travelled
    // through the sound changes as ordinary words; putting them back into a
    // table is what makes the collapse visible.
    const paradigm = paradigmFromEntries(entriesAfterReplacement, parentState.paradigm);
    const erosion = paradigm ? erosionReport(paradigm, histories, parentState.paradigm) : null;

    return {
        langId: stageId,
        isProto: false,
        parentId: changeSet.parentId,
        inventory,
        phonotactics,
        romanisation,
        orthographyFrozen: frozen,
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
export function createProject({ tree, names, config, sidecar = {}, borrowings = [] }) {
    const cfg = { ...DEFAULT_CONFIG, ...config };
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
        if (!events.length) return { loans: [], areal: [] };

        const loans = [];
        const areal = [];
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
            }
            loans.push(...makeLoans(donorState, parentState, dated, rng));
        }
        return { loans, areal };
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
            state = evolve(parentState, cs, {
                orthographyFrozen: sidecar.nodes?.[node.id]?.orthographyFrozenAt != null,
                loans: contact.loans,
                arealFeatures: contact.areal,
            });
        }

        /**
         * Contact DURING a language's own lifetime.
         *
         * A borrowing dated after the node was born does not belong to the edge
         * that produced it — the language already existed. There are no further
         * sound changes for the word to undergo at this stage, so it simply
         * joins the lexicon in the shape it was adapted into.
         *
         * Without this, every arrow pointing at a living language silently did
         * nothing, which was two of the three on the chart.
         */
        const lateEvents = borrowings.filter((b) => b.toId === node.id
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
                extra.push(...makeLoans(donorState, state, b, derive(cfg.seed, node.id, `contact-late:${b.id}`)));
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
export function stateAtYear(project, langId, year) {
    const node = project.nodeOf(langId);
    if (!node?.parentId) return project.stateOf(langId);
    const cs = project.changeSetOf(langId);
    if (!cs || year >= (cs.to ?? cs.from)) return project.stateOf(langId);

    const parentState = project.stateOf(node.parentId);
    const partial = { ...cs, rules: cs.rules.filter((r) => r.year <= year) };
    return evolve(parentState, partial);
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
            spelling: entry && st ? st.romanisation.spell(entry.form) : null,
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
