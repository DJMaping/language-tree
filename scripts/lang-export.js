/**
 * Export a generated language to the tools DJ already uses.
 *
 *   node scripts/lang-export.js "Standard Dahen"              everything
 *   node scripts/lang-export.js "Qai" --format sketch         just the grammar
 *   node scripts/lang-export.js "Dahen" --out ./exports
 *   node scripts/lang-export.js --family proto-dahen-kino --leaves
 *
 * Formats: sketch (Markdown), csv, pgd (PolyGlot), lsc (Lexurgy), json, all.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProject } from '../js/engine/project.js';
import { lexiconCsv, polyglotPgd, grammarSketch, stageJson } from '../js/engine/export/formats.js';
import { changeSetToLexurgy } from '../js/engine/export/lexurgy.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const doc = JSON.parse(fs.readFileSync(path.join(root, 'data/languages.json'), 'utf8'));
const configs = JSON.parse(fs.readFileSync(path.join(root, 'data/lang-config.json'), 'utf8'));
const byId = new Map(doc.languages.map((l) => [l.id, l]));
const rootOf = (l) => { let c = l; while (c.parentId) c = byId.get(c.parentId); return c.id; };

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const val = (n, d) => { const i = args.indexOf(`--${n}`); return i === -1 ? d : args[i + 1]; };
const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && !['--leaves'].includes(args[i - 1])));

const outDir = path.resolve(val('out', path.join(root, 'exports')));
const format = val('format', 'all');

const projects = new Map();
function projectFor(famRoot) {
    if (projects.has(famRoot)) return projects.get(famRoot);
    const tree = doc.languages.filter((l) => rootOf(l) === famRoot);
    const p = createProject({
        tree, names: tree.map((l) => l.name),
        config: { ...configs[famRoot], rootId: famRoot, presentYear: doc.config.presentYear },
        sidecar: {}, borrowings: doc.borrowings || [],
    });
    projects.set(famRoot, p);
    return p;
}

// Which languages to export.
let targets = [];
const famFlag = val('family');
if (famFlag) {
    const tree = doc.languages.filter((l) => rootOf(l) === famFlag);
    targets = flag('leaves') ? tree.filter((l) => !tree.some((x) => x.parentId === l.id)) : tree;
} else {
    const nameArg = positional[0] || 'Standard Dahen';
    const l = doc.languages.find((x) => x.id === nameArg || x.name.toLowerCase() === String(nameArg).toLowerCase());
    if (!l) { console.error(`No language "${nameArg}".`); process.exit(1); }
    targets = [l];
}
targets = targets.filter((l) => configs[rootOf(l)]);
if (!targets.length) { console.error('Nothing to export — the family has no entry in data/lang-config.json.'); process.exit(1); }

fs.mkdirSync(outDir, { recursive: true });
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const want = (f) => format === 'all' || format === f;
let written = 0;

for (const node of targets) {
    const project = projectFor(rootOf(node));
    let state;
    try { state = project.stateOf(node.id); } catch (err) { console.error(`  ${node.name}: ${err.message}`); continue; }
    if (!state) continue;

    // The line of descent, for the sketch's header.
    const lineage = [];
    for (let s = state; s; s = s.parentId ? project.stateOf(s.parentId) : null) lineage.unshift(s.node?.name ?? s.langId);

    const base = path.join(outDir, slug(node.name));
    const wrote = [];

    if (want('sketch')) {
        fs.writeFileSync(`${base}.md`, grammarSketch(state, { name: node.name, lineage }));
        wrote.push('md');
    }
    if (want('csv')) {
        fs.writeFileSync(`${base}.csv`, lexiconCsv(state, { includeArchaic: true }));
        wrote.push('csv');
    }
    if (want('pgd')) {
        fs.writeFileSync(`${base}.pgd`, Buffer.from(polyglotPgd(state, { name: node.name })));
        wrote.push('pgd');
    }
    if (want('json')) {
        fs.writeFileSync(`${base}.json`, stageJson(state));
        wrote.push('json');
    }
    if (want('lsc') && state.changeSet) {
        const parent = state.founding ?? project.stateOf(state.parentId);
        if (parent) {
            fs.writeFileSync(`${base}.lsc`, changeSetToLexurgy(state.changeSet, parent, { name: node.name }));
            wrote.push('lsc');
        }
    }

    written += 1;
    console.log(`  ${node.name.padEnd(24)} ${wrote.join(', ')}`);
}

console.log(`\n${written} language${written === 1 ? '' : 's'} exported to ${outDir}`);
if (want('pgd')) console.log('Open a .pgd directly in PolyGlot; the .csv also imports there if you prefer.');
if (want('lsc')) console.log('The .lsc runs in Lexurgy against the parent stage\'s lexicon.');
