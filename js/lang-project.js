/**
 * Browser-side glue between the chart and the language engine.
 *
 * Owns one engine project per family root, built lazily and cached. The engine
 * itself (js/engine/) knows nothing about the DOM, fetch or the chart's data
 * format — this module is the only place the two meet.
 *
 * Derivation is lazy all the way down: opening the panel on one leaf computes
 * that leaf and its ancestors, and nothing else. A whole 112-node family takes
 * about a second and a half, but you only ever pay for the chain you look at.
 */

import { createProject, stateAtYear, cognateSet, diffStages } from './engine/project.js';

let CONFIGS = {};
let configsLoaded = false;

/**
 * Projects are keyed by the MODEL OBJECT, not by an id or a revision number.
 *
 * main.js rebuilds the model from scratch on every document change, so model
 * identity is already an exact "has anything changed?" test — and a WeakMap
 * means the derived languages for an old model are collected along with it.
 * No stamps to keep in sync, no stale tree served after an edit.
 */
const projects = new WeakMap(); // model → Map(rootId → project)

/**
 * Load the per-family configuration. Missing or unreadable is not an error —
 * it just means no family has languages yet, and the panel says so.
 */
export async function loadLangConfigs() {
    try {
        const res = await fetch('data/lang-config.json', { cache: 'no-store' });
        if (res.ok) {
            const json = await res.json();
            CONFIGS = Object.fromEntries(Object.entries(json).filter(([k]) => !k.startsWith('_')));
        }
    } catch { /* no config: languages are simply switched off */ }
    configsLoaded = true;
    return CONFIGS;
}

export const configsAreLoaded = () => configsLoaded;
export const configFor = (rootId) => CONFIGS[rootId] || null;
export const configuredFamilies = () => Object.keys(CONFIGS);

/** Walk to the family root of a language. (model.familyRootOf is a Map of the same.) */
export function familyRootOf(model, langId) {
    const cached = model.familyRootOf?.get(langId);
    if (cached) return cached;
    let cur = model.byId.get(langId);
    let guard = 0;
    while (cur?.parentId && guard++ < 500) cur = model.byId.get(cur.parentId);
    return cur?.id ?? null;
}

/**
 * The engine project for whichever family this language belongs to, or null if
 * that family has no configuration.
 *
 * Projects are cached against the identity of the doc, so an edit to the chart
 * (a new node, a moved date) rebuilds them rather than serving a stale tree.
 */
export function projectFor(model, langId, presentYear) {
    const rootId = familyRootOf(model, langId);
    if (!rootId) return null;
    const config = CONFIGS[rootId];
    if (!config) return null;

    let perModel = projects.get(model);
    if (!perModel) { perModel = new Map(); projects.set(model, perModel); }
    if (perModel.has(rootId)) return perModel.get(rootId);

    const tree = model.languages.filter((l) => familyRootOf(model, l.id) === rootId);
    const project = createProject({
        tree,
        names: tree.map((l) => l.name),
        config: { ...config, rootId, presentYear },
        sidecar: {},
    });
    perModel.set(rootId, project);
    return project;
}

export { stateAtYear, cognateSet, diffStages };

/**
 * Living sister languages to compare a stage against.
 *
 * "Sisters" here means the other leaves of the family, not literal siblings:
 * the comparative table is most informative across the widest spread of
 * daughters, which is exactly how a real comparative table is built.
 */
export function comparisonSet(model, langId, limit = 5) {
    const rootId = familyRootOf(model, langId);
    if (!rootId) return [];
    const isLeaf = (l) => !model.languages.some((x) => x.parentId === l.id);
    const leaves = model.languages
        .filter((l) => familyRootOf(model, l.id) === rootId && isLeaf(l) && l.id !== langId)
        .sort((a, b) => (b.born ?? 0) - (a.born ?? 0));
    return [langId, ...leaves.slice(0, limit).map((l) => l.id)];
}
