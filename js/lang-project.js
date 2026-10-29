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

// data/ as the page sees it; from the panel's worker (js/lang-worker.js),
// whose own address is js/, found from this file instead
const IN_WORKER = typeof WorkerGlobalScope !== 'undefined' && typeof document === 'undefined';
const DATA = (p) => (IN_WORKER ? new URL(`../data/${p}`, import.meta.url).href : `data/${p}`);

let CONFIGS = {};
let SIDECARS = {};
let EVIDENCE = {};
let LASTNU = null;
let CONTACT = null;
let CONTACT_TYPOLOGY = null;
// Andah's tamed animals and crops, their hearths and spread (scripts/build-domestication.js)
let DOMESTICATION = null;
// where each language lives (scripts/build-environment.js) and its faith (scripts/build-script-history.js)
let ENVIRONMENT = null;
let FAITHS = null;
let configsLoaded = false;

/**
 * Projects are keyed by WHAT THEIR FAMILY IS: the family's own languages, the
 * borrowings that touch it, and the families it borrows from (DJ, 16 Oct 2026:
 * the app froze for seconds on every edit, because keying by the model object
 * threw every family's derivation away whenever anything at all changed). An
 * edit to one family now rebuilds that family alone; every other family keeps
 * its derived languages. The most recent ones are kept, the oldest dropped.
 */
const projects = new Map(); // signature → project
const PROJECTS_KEPT = 48;
const signatures = new WeakMap(); // model → Map(rootId → signature)
const inFlight = new Set(); // cross-family contact being resolved, so two families cannot ask each other forever

function hash(text) {   // FNV-1a, 52 bits: a short key for a long signature
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i);
        h1 = Math.imul(h1 ^ c, 16777619);
        h2 = Math.imul(h2 ^ c, 2246822519);
    }
    return `${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}:${text.length}`;
}

/** What a family's derivation depends on, as a short key. */
function signatureOf(model, rootId, presentYear, shallow) {
    let perModel = signatures.get(model);
    if (!perModel) { perModel = new Map(); signatures.set(model, perModel); }
    const key = `${rootId}|${presentYear}|${shallow ? 1 : 0}`;
    if (perModel.has(key)) return perModel.get(key);
    const own = model.languages.filter((l) => familyRootOf(model, l.id) === rootId);
    const ids = new Set(own.map((l) => l.id));
    // (the map's own contacts count as arrows here: scripts/contact-strength.js)
    const touching = [...(model.borrowings || []), ...(CONTACT?.map || []), ...(CONTACT?.borders || [])].filter((b) => ids.has(b.toId) || ids.has(b.fromId))
        .map((b) => (CONTACT?.arrows?.[b.id] ? { ...b, weight: CONTACT.arrows[b.id].strength } : b));
    // a family's contact reads its donors as they stood: their families count too
    const donors = shallow ? [] : [...new Set(touching.filter((b) => ids.has(b.toId) && !ids.has(b.fromId))
        .map((b) => familyRootOf(model, b.fromId)).filter(Boolean))].sort();
    const donorText = donors.map((d) => JSON.stringify(model.languages.filter((l) => familyRootOf(model, l.id) === d))).join('|');
    const sig = `${key}|${hash(JSON.stringify(own) + JSON.stringify(touching) + donorText + JSON.stringify(configFor(rootId, model)))}`;
    perModel.set(key, sig);
    return sig;
}

/**
 * Load the per-family configuration. Missing or unreadable is not an error —
 * it just means no family has languages yet, and the panel says so.
 */
export async function loadLangConfigs() {
    try {
        const res = await fetch(DATA('lang-config.json'), { cache: 'no-store' });
        if (res.ok) {
            const json = await res.json();
            CONFIGS = Object.fromEntries(Object.entries(json).filter(([k]) => !k.startsWith('_')));
        }
    } catch { /* no config: languages are simply switched off */ }
    /**
     * A family's pin file, if it has been pinned (scripts/lang-pin.js): its
     * frozen evidence and pinned sound changes. None is the normal case.
     */
    // Each family's evidence corpus (scripts/build-evidence.js).
    try {
        const res = await fetch(DATA('evidence.json'), { cache: 'no-store' });
        if (res.ok) EVIDENCE = (await res.json()).families || {};
    } catch { /* no evidence corpus: families mine their names only */ }
    // Lastnu's words (scripts/build-lastnu.js), which every family may borrow.
    try {
        const res = await fetch(DATA('lastnu.json'), { cache: 'no-store' });
        if (res.ok) LASTNU = await res.json();
    } catch { /* no Lastnu yet: modern words are all coined at home */ }
    // How long and how widely each contact lasted, from the Through-time maps (scripts/contact-strength.js).
    try {
        const res = await fetch(DATA('history/contact.json'), { cache: 'no-store' });
        if (res.ok) CONTACT = await res.json();
    } catch { /* no weights: every arrow lends its typical amount */ }
    // What each language's grammar was like at the last views build (scripts/build-views.js), for its contacts.
    try {
        const res = await fetch(DATA('history/contact-typology.json'), { cache: 'no-store' });
        if (res.ok) CONTACT_TYPOLOGY = (await res.json()).languages || null;
    } catch { /* no donors' typology: contact passes no tone, counting words or wear */ }
    try {
        const res = await fetch(DATA('canon/domestication.json'), { cache: 'no-store' });
        if (res.ok) DOMESTICATION = await res.json();
    } catch { /* no domestication data: no tamed species beyond the word list */ }
    try {
        const res = await fetch(DATA('canon/environment.json'), { cache: 'no-store' });
        if (res.ok) ENVIRONMENT = await res.json();
    } catch { /* no climate data: no fine words of the land */ }
    try {
        const res = await fetch(DATA('history/script-history.json'), { cache: 'no-store' });
        if (res.ok) FAITHS = (await res.json()).faiths || null;
    } catch { /* no faiths: no faith words */ }
    let pinned = [];
    try {
        const res = await fetch(DATA('lang/index.json'), { cache: 'no-store' });
        if (res.ok) pinned = (await res.json()).pinned || [];
    } catch { /* nothing pinned */ }
    await Promise.all(pinned.filter((rootId) => CONFIGS[rootId]).map(async (rootId) => {
        try {
            const res = await fetch(DATA(`lang/${rootId}.lang.json`), { cache: 'no-store' });
            if (res.ok) SIDECARS[rootId] = await res.json();
        } catch { /* unreadable pin: the family regenerates */ }
    }));
    configsLoaded = true;
    return CONFIGS;
}

export const configsAreLoaded = () => configsLoaded;
/**
 * A family's config is keyed by its root's ORIGINAL id, which a renamed root
 * keeps as `uid`; so a rename no longer disconnects the family from its config.
 */
const keyOfRoot = (model, rootId) => model?.byId?.get(rootId)?.uid ?? rootId;
export const configFor = (rootId, model) => CONFIGS[keyOfRoot(model, rootId)] || CONFIGS[rootId] || null;
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
export function projectFor(model, langId, presentYear, { shallow = false } = {}) {
    const rootId = familyRootOf(model, langId);
    if (!rootId) return null;
    const config = configFor(rootId, model);
    if (!config) return null;

    const cacheKey = signatureOf(model, rootId, presentYear, shallow);
    if (projects.has(cacheKey)) {
        const kept = projects.get(cacheKey);
        projects.delete(cacheKey);
        projects.set(cacheKey, kept);   // most recently used last
        return kept;
    }

    const tree = model.languages.filter((l) => familyRootOf(model, l.id) === rootId);
    const project = createProject({
        tree,
        names: tree.map((l) => l.name),
        config: { ...config, rootId, presentYear },
        sidecar: SIDECARS[keyOfRoot(model, rootId)] || {},
        evidenceNames: (EVIDENCE[keyOfRoot(model, rootId)] || EVIDENCE[rootId])?.cities || [],
        lastnu: LASTNU,
        contact: CONTACT,
        contactTypology: CONTACT_TYPOLOGY,
        domestication: DOMESTICATION,
        environment: ENVIRONMENT,
        faiths: FAITHS,
        // Contact from another family: that family's project, as the donor stood
        // then. One step of contact only (see scripts/world.js): a shallow
        // project, the donor's, resolves no foreign contact of its own.
        resolveExternal: shallow ? null : (langId, year) => {
            const flight = `${langId}@${year}`;
            if (inFlight.has(flight) || familyRootOf(model, langId) === rootId) return null;
            inFlight.add(flight);
            try {
                const other = projectFor(model, langId, presentYear, { shallow: true });
                return other ? stateAtYear(other, langId, year) : null;
            } finally {
                inFlight.delete(flight);
            }
        },
        borrowings: model.borrowings || [],
    });
    projects.set(cacheKey, project);
    while (projects.size > PROJECTS_KEPT) projects.delete(projects.keys().next().value);
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
