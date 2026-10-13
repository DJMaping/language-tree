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

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (rel, fallback) => {
    try { return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8')); } catch { return fallback; }
};

const EVIDENCE = readJson('data/evidence.json', { families: {} }).families || {};
const PINNED = new Set(readJson('data/lang/index.json', { pinned: [] }).pinned || []);
const sidecars = new Map();

export function familyInputs(familyKey) {
    if (PINNED.has(familyKey) && !sidecars.has(familyKey)) {
        sidecars.set(familyKey, readJson(`data/lang/${familyKey}.lang.json`, {}));
    }
    return {
        evidenceNames: EVIDENCE[familyKey]?.cities || [],
        sidecar: sidecars.get(familyKey) || {},
    };
}
