/**
 * Name generator — the worldbuilding tool.
 *
 *   node scripts/lang-names.js "Qai"                     20 settlement names
 *   node scripts/lang-names.js "Qai" --kind river -n 12
 *   node scripts/lang-names.js "Dahen" --kind person
 *   node scripts/lang-names.js "Dahen" --all            a few of every kind
 *
 *   # names that fossilise: coined in an ancestor, inherited into the modern
 *   # language, so they look archaic in their own tongue
 *   node scripts/lang-names.js "Standard Dahen" --coined-in "Old Dahen"
 *
 *   # the reverse — which language does an existing name look like?
 *   node scripts/lang-names.js --identify Zayliabao
 *   node scripts/lang-names.js --identify Kaastini --family proto-dahen-kino
 *
 * Kinds: settlement, river, mountain, region, person.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProject } from '../js/engine/project.js';
import { familyInputs } from './world.js';
import { generateNames, coinAt, identifyLanguage, NAME_SOURCES } from '../js/engine/lexicon/names.js';
import { derive } from '../js/engine/rng.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const doc = JSON.parse(fs.readFileSync(path.join(root, 'data/languages.json'), 'utf8'));
const configs = JSON.parse(fs.readFileSync(path.join(root, 'data/lang-config.json'), 'utf8'));
const byId = new Map(doc.languages.map((l) => [l.id, l]));
const rootOf = (l) => { let c = l; while (c.parentId) c = byId.get(c.parentId); return c.id; };

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const val = (n, d) => { const i = args.indexOf(`--${n}`); return i === -1 ? d : args[i + 1]; };
const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && !['--all'].includes(args[i - 1])));

const projectCache = new Map();
function projectForFamily(famRoot) {
    if (projectCache.has(famRoot)) return projectCache.get(famRoot);
    const tree = doc.languages.filter((l) => rootOf(l) === famRoot);
    const p = createProject({
        tree, names: tree.map((l) => l.name),
        config: { ...configs[famRoot], rootId: famRoot, presentYear: doc.config.presentYear },
        ...familyInputs(famRoot), borrowings: doc.borrowings || [],
    });
    projectCache.set(famRoot, p);
    return p;
}

function findLanguage(nameOrId) {
    const l = doc.languages.find((x) => x.id === nameOrId || x.name.toLowerCase() === String(nameOrId).toLowerCase());
    if (!l) return null;
    const famRoot = rootOf(l);
    if (!configs[famRoot]) return null;
    return { node: l, famRoot, project: projectForFamily(famRoot) };
}

// ---------------------------------------------------------------------------
// --identify : which language does this name look like?
// ---------------------------------------------------------------------------
if (flag('identify')) {
    const text = val('identify');
    if (!text) { console.error('Usage: --identify <name> [--family <root-id>]'); process.exit(1); }

    const famFilter = val('family');
    const candidates = [];
    for (const famRoot of Object.keys(configs).filter((k) => !k.startsWith('_'))) {
        if (famFilter && famRoot !== famFilter) continue;
        const project = projectForFamily(famRoot);
        const tree = doc.languages.filter((l) => rootOf(l) === famRoot);
        // Living leaves only — a name is compared against languages people speak.
        for (const l of tree.filter((x) => !tree.some((y) => y.parentId === x.id))) {
            candidates.push({ id: l.id, project });
        }
    }

    console.log(`\nWhich language could have produced "${text}"?\n${'─'.repeat(64)}`);
    const perProject = new Map();
    for (const c of candidates) {
        if (!perProject.has(c.project)) perProject.set(c.project, []);
        perProject.get(c.project).push(c.id);
    }
    const all = [];
    for (const [project, ids] of perProject) all.push(...identifyLanguage(text, project, ids).ranked);
    all.sort((a, b) => b.score - a.score);

    for (const r of all.slice(0, 10)) {
        const bar = '█'.repeat(Math.round(r.score * 30));
        console.log(`  ${(r.score).toFixed(3)}  ${String(r.name).padEnd(22)} /${r.ipa}/`);
        if (bar) console.log(`         ${bar}`);
        if (r.reasons.length) console.log(`         ${r.reasons.join('; ')}`);
    }
    const best = all[0];
    console.log(`\n${!best || best.score < 0.12
        ? 'VERDICT: no language here produces this natively — it looks borrowed, or\n         inherited from a substrate this family displaced.'
        : `VERDICT: best fit is ${best.name} (${best.score.toFixed(3)}).`}\n`);
    process.exit(0);
}

// ---------------------------------------------------------------------------
// Name generation
// ---------------------------------------------------------------------------
const target = positional[0] || 'Standard Dahen';
const found = findLanguage(target);
if (!found) {
    console.error(`No language "${target}" in a configured family.`);
    console.error(`Configured families: ${Object.keys(configs).filter((k) => !k.startsWith('_')).join(', ')}`);
    process.exit(1);
}

const state = found.project.stateOf(found.node.id);
const seedTag = val('seed', 'names');
const count = Number(val('n', 20));

console.log(`\n${found.node.name}   (${found.node.born}${found.node.died != null ? `–${found.node.died}` : '–now'})`);
console.log('═'.repeat(70));

const coinedIn = val('coined-in');
if (coinedIn) {
    // ── Fossilised names ───────────────────────────────────────────────────
    const ancestor = doc.languages.find((x) => x.name.toLowerCase() === coinedIn.toLowerCase() || x.id === coinedIn);
    if (!ancestor) { console.error(`No ancestor "${coinedIn}".`); process.exit(1); }

    console.log(`Names coined in ${ancestor.name} and inherited into ${found.node.name}.`);
    console.log('A place name is coined once and then passed down: it undergoes every');
    console.log('later sound change but is never re-coined, so it preserves a shape the');
    console.log('living language has lost. This is why English has Winchester and Grimsby.\n');

    const rng = derive(seedTag, found.node.id, `coined-${ancestor.id}`);
    let shown = 0;
    for (let i = 0; i < count * 6 && shown < count; i++) {
        const n = coinAt(found.project, found.node.id, ancestor.id, rng, { kind: val('kind', 'settlement') });
        if (!n) continue;
        shown += 1;
        console.log(`  ${n.spelling.padEnd(18)} /${n.ipa}/`);
        console.log(`      < ${ancestor.name} *${n.coinedForm}  "${n.etymology}"`);
        if (n.steps.length) {
            console.log(`      ${[n.coinedForm, ...n.steps.map((s) => s.to)].join(' > ')}`);
        }
        if (n.opaque) console.log('      (opaque — a speaker could no longer see the words it is made of)');
    }
    console.log();
    process.exit(0);
}

const kinds = flag('all') ? Object.keys(NAME_SOURCES) : [val('kind', 'settlement')];
for (const kind of kinds) {
    const rng = derive(seedTag, found.node.id, kind);
    const names = generateNames(state, rng, { kind, count: flag('all') ? 6 : count });
    if (!names.length) { console.log(`\n${kind}: (no suitable name elements in this lexicon)`); continue; }
    console.log(`\n${kind.toUpperCase()}  — ${NAME_SOURCES[kind]?.note ?? ''}`);
    console.log('─'.repeat(70));
    for (const n of names) {
        console.log(`  ${n.spelling.padEnd(18)} /${n.ipa}/`.padEnd(46) + `${n.etymology}`);
    }
}
console.log();
