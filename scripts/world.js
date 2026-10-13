/**
 * What every script adds to a family's engine project beyond the chart itself:
 * its evidence corpus (data/evidence.json, from DJ's canon city names) and its
 * pin file (data/lang/<family>.lang.json), so the scripts derive exactly what
 * the app derives. js/lang-project.js does the same in the browser.
 *
 *   createProject({ tree, names, config, borrowings, ...familyInputs(familyKey) })
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProject, stateAtYear } from '../js/engine/project.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (rel, fallback) => {
    try { return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8')); } catch { return fallback; }
};

const EVIDENCE = readJson('data/evidence.json', { families: {} }).families || {};
const PINNED = new Set(readJson('data/lang/index.json', { pinned: [] }).pinned || []);
const sidecars = new Map();

function sidecarOf(familyKey) {
    if (PINNED.has(familyKey) && !sidecars.has(familyKey)) {
        sidecars.set(familyKey, readJson(`data/lang/${familyKey}.lang.json`, {}));
    }
    return sidecars.get(familyKey) || {};
}

/**
 * The WORLD: any language in any family, as it stood in a given year. Used as
 * `resolveExternal` so contact between families delivers words. Each family's
 * project is built once, on first use. A guard stops two families that
 * borrowed from each other from asking each other forever.
 */
let world = null;
const inFlight = new Set();
function resolveExternal(langId, year) {
    if (!world) {
        const doc = readJson('data/languages.json', { languages: [] });
        const configs = readJson('data/lang-config.json', {});
        const byId = new Map(doc.languages.map((l) => [l.id, l]));
        const rootOf = (l) => { let c = l; while (c.parentId && byId.has(c.parentId)) c = byId.get(c.parentId); return c; };
        world = { doc, configs, byId, rootOf, projects: new Map() };
    }
    const node = world.byId.get(langId);
    if (!node) return null;
    const rootNode = world.rootOf(node);
    const key = world.configs[rootNode.id] ? rootNode.id : world.configs[rootNode.uid] ? rootNode.uid : null;
    if (!key) return null;
    const flight = `${langId}@${year}`;
    if (inFlight.has(flight)) return null;
    inFlight.add(flight);
    try {
        if (!world.projects.has(key)) {
            const tree = world.doc.languages.filter((l) => world.rootOf(l).id === rootNode.id);
            world.projects.set(key, createProject({
                tree, names: tree.map((l) => l.name),
                config: { ...world.configs[key], rootId: rootNode.id, presentYear: world.doc.config.presentYear },
                borrowings: world.doc.borrowings || [], ...familyInputs(key),
            }));
        }
        return stateAtYear(world.projects.get(key), langId, year);
    } finally {
        inFlight.delete(flight);
    }
}

export function familyInputs(familyKey) {
    return {
        evidenceNames: EVIDENCE[familyKey]?.cities || [],
        sidecar: sidecarOf(familyKey),
        resolveExternal,
    };
}
