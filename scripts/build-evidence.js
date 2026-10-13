/**
 * Build each family's evidence corpus from DJ's canon city names.
 *
 *   node scripts/build-evidence.js
 *
 * Writes data/evidence.json: for every configured family, the cities of the
 * countries where DJ's family map gives that family the majority (50% or more
 * of the country). The engine mines a family's proto from its language names
 * AND these cities (createProject's evidenceNames), because a family drawn
 * with a handful of boxes had almost nothing to be mined from: Arten from two
 * name stems, Quaians from five. A family can opt out with
 * `"evidence": "names"` in lang-config.json (Dahen-Kino does: its phonology
 * passed DJ's review from its language names, and its Massir cities, Gorlatki,
 * Czarnulek, Pavroshka, would pull it away from the Sinitic goal).
 *
 * Names are cleaned the way a reader would: parenthetical notes dropped, the
 * English words some cities carry (New, Port, Saint, Lake...) removed, case
 * folded so a stray capital (HoznikE) is not read as a different letter.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const doc = read('data/languages.json');
const configs = read('data/lang-config.json');
const atlas = read('data/canon/people-atlas-languages.json');
const cities = read('data/canon/cities-by-state.json').states;

const ENGLISH = new Set(['new', 'old', 'port', 'saint', 'st', 'fort', 'east', 'west', 'north', 'south',
    'upper', 'lower', 'lake', 'mount', 'cape', 'bay', 'city', 'island', 'islands', 'the', 'of']);
const clean = (name) => name
    .replace(/\(.*?\)/g, ' ')
    .split(/[\s\-–]+/)
    .map((w) => w.toLowerCase().replace(/[^\p{L}']/gu, ''))
    .filter((w) => w.length > 1 && !ENGLISH.has(w))
    .join(' ');

const byId = new Map(doc.languages.map((l) => [l.id, l]));
const familyByRoot = new Map((doc.families || []).map((f) => [f.rootId, f.name]));
const out = {};
for (const key of Object.keys(configs).filter((k) => !k.startsWith('_'))) {
    const rootNode = byId.get(key) || doc.languages.find((l) => l.uid === key);
    const family = rootNode && familyByRoot.get(rootNode.id);
    if (!family) continue;
    const states = Object.entries(atlas.states)
        .filter(([, s]) => (s.fs?.[family] ?? 0) >= 0.5)
        .map(([state]) => state)
        .sort();
    const names = [...new Set(states.flatMap((st) => (cities[st]?.cities || []).map(clean)).filter(Boolean))];
    out[key] = { family, states, cities: names };
    console.log(`${family.padEnd(16)} ${String(states.length).padStart(3)} countries  ${String(names.length).padStart(4)} city names`);
}

fs.writeFileSync(path.join(root, 'data/evidence.json'), `${JSON.stringify({
    _readme: 'Built by scripts/build-evidence.js from data/canon/: per family, the cleaned city names of the countries where DJ\'s map gives it the majority. Evidence for mining the proto; not shown anywhere as text.',
    families: out,
}, null, 1)}\n`);
console.log('Wrote data/evidence.json');
