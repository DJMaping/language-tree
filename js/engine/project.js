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
import { buildPhonotactics, repairHiatus } from './phonology/phonotactics.js';
import { buildRomanisation } from './phonology/romanise.js';
import { conceptList } from './lexicon/swadesh.js';
import { generateLexicon, buildPools } from './lexicon/roots.js';
import { generateAffixes, deriveLexemes } from './lexicon/derivation.js';
import { evolveLexicon, inventoryFromLexicon, diffInventories } from './soundchange/apply.js';
import { generateChangeSet, retime, rateWarning } from './soundchange/generate.js';
import { pushStep } from './lexicon/etymology.js';

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
    if (cfg.derivation) {
        const pools = buildPools(inventory, profile, inventory.segmentMap);
        affixes = generateAffixes(phonology, pools, derive(cfg.seed, 'proto', 'affixes'));
        const derived = deriveLexemes(lex.roots, affixes, phonology, derive(cfg.seed, 'proto', 'derived'));
        entries = [...lex.roots, ...derived];
    }

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
    const evolved = evolveLexicon(parentState.entries, changeSet.rules, {
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
        const fixed = repairHiatus(e.form, parentState.phonotactics);
        if (fixed === e.form) return e;
        // The repair has to appear in the derivation history like any other
        // change. Otherwise the etymology chain ends on a form the lexicon
        // doesn't show, and the one display the whole history machinery exists
        // to produce quietly lies.
        const history = histories.get(e.id);
        if (history) {
            pushStep(history, {
                id: `${stageId}-hiatus`, stageId, year: changeSet.to,
                label: 'hiatus resolution (coalescence or glide insertion)',
            }, e.form, fixed, true);
        }
        return { ...e, form: fixed, ipa: fixed.map((p) => p.ipa).join('') };
    });

    const inventory = inventoryFromLexicon(entries);
    const delta = diffInventories(parentState.inventory, inventory);

    // The phonotactics travel with the language: the coda inventory is whatever
    // still occurs, and stress carries over unless a rule changed it.
    const phonotactics = {
        ...parentState.phonotactics,
        coda: {
            ...parentState.phonotactics.coda,
            allowed: (parentState.phonotactics.coda.allowed || []).filter((x) => inventory.counts.has(x)),
        },
    };

    // Spelling either tracks the pronunciation or is frozen at a standardisation
    // year. Once frozen, sound change carries on underneath it and the gap
    // between spelling and speech starts to open — which is the entire reason
    // English orthography looks the way it does.
    const frozen = opts.orthographyFrozen || parentState.orthographyFrozen;
    const romanisation = frozen ? parentState.romanisation : buildRomanisation(inventory);

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
        entries,
        histories,
        changeSet,
        delta,
        stats,
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
export function createProject({ tree, names, config, sidecar = {} }) {
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
                    { childId: node.id, parentId: node.parentId, from: parent.born, to: node.born, rate: sidecar.rates?.[node.id] ?? 1 },
                    parentState,
                    derive(cfg.seed, node.id, 'ruleset'),
                );
                changeSets.set(node.id, cs);
            }
            state = evolve(parentState, cs, { orthographyFrozen: sidecar.nodes?.[node.id]?.orthographyFrozenAt != null });
        }

        state.node = node;
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

    return {
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
