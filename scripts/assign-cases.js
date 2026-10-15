/**
 * Gives every family a case system so that the world as a whole matches
 * Earth's spread (WALS 49A), and writes it into data/lang-config.json as
 * `morphology.cases`, where DJ can change any of them.
 *
 * Each family drawing on its own at Earth's rates is honest but lumpy: with a
 * dozen families, twelve case systems and no caseless family is a 1-in-70
 * roll, and that is what happened (DJ asked for Earth's spread, 15 Oct 2026).
 * So the draws are stratified: the families are shuffled with a fixed seed,
 * the i-th takes the quantile (i + 0.5) / n of its own type's distribution.
 * Isolating families have no cases whatever happens. A family whose config
 * already sets cases by hand (casesBy missing or not this script) is left
 * alone.
 *
 *   node scripts/assign-cases.js           show the assignment
 *   node scripts/assign-cases.js --write   write it into lang-config.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CASE_RATES, EXTRA_CASES } from '../js/engine/character.js';
import { createProject } from '../js/engine/project.js';
import { familyInputs } from './world.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfgPath = path.join(root, 'data', 'lang-config.json');
const raw = fs.readFileSync(cfgPath, 'utf8');
const configs = JSON.parse(raw);
const doc = JSON.parse(fs.readFileSync(path.join(root, 'data', 'languages.json'), 'utf8'));
const BY = 'scripts/assign-cases.js';

// each family's type, as the engine infers it (cases aside)
const fams = [];
for (const [key, cfg] of Object.entries(configs)) {
    if (key.startsWith('_')) continue;
    const handSet = cfg.morphology?.cases && cfg.morphology?.casesBy !== BY;
    if (handSet) continue;
    const node = doc.languages.find((l) => l.id === key || l.uid === key);
    if (!node) continue;
    const tree = (() => {
        const ids = new Set([node.id]);
        let grew = true;
        while (grew) { grew = false; for (const l of doc.languages) if (l.parentId && ids.has(l.parentId) && !ids.has(l.id)) { ids.add(l.id); grew = true; } }
        return doc.languages.filter((l) => ids.has(l.id));
    })();
    const clean = { ...cfg, morphology: { ...(cfg.morphology || {}) } };
    delete clean.morphology.cases;
    delete clean.morphology.casesBy;
    const p = createProject({ tree, names: tree.map((l) => l.name), config: { ...clean, rootId: node.id, presentYear: doc.config?.presentYear ?? 1765 }, borrowings: [], ...familyInputs(key) });
    fams.push({ key, name: node.name, type: p.stateOf(node.id).paradigm?.categories?.type ?? null });
}

// a fixed shuffle (FNV hash of the key with a seed), then stratified quantiles
const h = (s) => { let x = 2166136261; for (const ch of `cases-1765|${s}`) { x ^= ch.charCodeAt(0); x = Math.imul(x, 16777619) >>> 0; } return x; };
const order = fams.filter((f) => f.type && f.type !== 'isolating').sort((a, b) => h(a.key) - h(b.key));
const pickAt = (W, u) => {
    const keys = Object.keys(W).map(Number).sort((a, b) => a - b);
    const total = keys.reduce((s, k) => s + W[k], 0);
    let acc = 0;
    for (const k of keys) { acc += W[k] / total; if (u <= acc) return k; }
    return keys.at(-1);
};
const out = [];
order.forEach((f, i) => {
    const n = pickAt(CASE_RATES[f.type] || CASE_RATES.agglutinative, (i + 0.5) / order.length);
    out.push({ ...f, n, cases: n ? ['NOM', 'ACC', ...EXTRA_CASES.slice(0, Math.max(0, n - 2))] : [] });
});
for (const f of fams.filter((x) => x.type === 'isolating')) out.push({ ...f, n: 0, cases: [] });
for (const f of out.sort((a, b) => a.name.localeCompare(b.name))) console.log(`${f.name.padEnd(20)} ${String(f.type).padEnd(14)} ${f.n ? `${f.n} cases` : 'no case'}`);
const zero = out.filter((f) => !f.n).length;
console.log(`\n${zero} of ${out.length} families without case (Earth about half).`);

if (process.argv.includes('--write')) {
    for (const f of out) {
        if (f.type === 'isolating') continue;   // isolating needs nothing written
        configs[f.key].morphology = { ...(configs[f.key].morphology || {}), cases: f.cases, casesBy: BY };
    }
    // the file's own layout: one family per block, a blank line between
    const body = Object.entries(configs).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v, null, 2).replace(/\n/g, '\n  ')}`).join(',\n\n');
    fs.writeFileSync(cfgPath, `{\n${body}\n}\n`);
    console.log('Written to data/lang-config.json.');
}
