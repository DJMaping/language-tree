/**
 * Pin a family: freeze its evidence and its sound changes.
 *
 *   node scripts/lang-pin.js proto-dahen-kino          pin one family
 *   node scripts/lang-pin.js --all                     pin every configured family
 *   node scripts/lang-pin.js proto-amnant --unpin      remove a family's pin file
 *   node scripts/lang-pin.js --check                   how far each pinned family has drifted
 *
 * Writes data/lang/<root>.lang.json, which the app and the engine read as the
 * family's sidecar:
 *
 *   evidence  the language names the proto was mined from, frozen, so drawing,
 *             renaming or deleting a box no longer re-mines the proto;
 *   edges     every language's pinned sound changes, so dragging a box re-times
 *             them (engine-design: "re-dating re-times, never rerolls");
 *   rates     each lineage's tempo.
 *
 * Pinning is DJ's review gate for a family: run it once a family's mined
 * profile and proto have been approved. Locks on individual words live in
 * languages.json and need no pin. Unpinned families regenerate freely, which is
 * what an unapproved family should do.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProject } from '../js/engine/project.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const doc = JSON.parse(fs.readFileSync(path.join(root, 'data/languages.json'), 'utf8'));
const configs = JSON.parse(fs.readFileSync(path.join(root, 'data/lang-config.json'), 'utf8'));
const pinDir = path.join(root, 'data/lang');
const pinFile = (fam) => path.join(pinDir, `${fam}.lang.json`);
/** data/lang/index.json lists the pinned families, so the app only asks for files that exist. */
function writeIndex() {
    const pinned = fs.existsSync(pinDir)
        ? fs.readdirSync(pinDir).filter((f) => f.endsWith('.lang.json')).map((f) => f.slice(0, -'.lang.json'.length)).sort()
        : [];
    fs.mkdirSync(pinDir, { recursive: true });
    fs.writeFileSync(path.join(pinDir, 'index.json'), `${JSON.stringify({ pinned }, null, 1)}\n`);
}

const byId = new Map(doc.languages.map((l) => [l.id, l]));
const rootOf = (l) => { let c = l; while (c.parentId) c = byId.get(c.parentId); return c; };
const keyOf = (l) => l.uid ?? l.id;
const familyTree = (fam) => doc.languages.filter((l) => keyOf(rootOf(l)) === fam);

const args = process.argv.slice(2);
const families = args.includes('--all') || args.includes('--check')
    ? Object.keys(configs).filter((k) => !k.startsWith('_'))
    : args.filter((a) => !a.startsWith('--'));
if (!families.length) { console.error('Name a family root (e.g. proto-dahen-kino), or pass --all or --check.'); process.exit(1); }

function projectOf(fam, sidecar) {
    const tree = familyTree(fam);
    const rootNode = tree.find((l) => !l.parentId);
    return {
        tree,
        project: createProject({
            tree, names: tree.map((l) => l.name),
            config: { ...configs[fam], rootId: rootNode.id, presentYear: doc.config.presentYear },
            sidecar, borrowings: doc.borrowings || [],
        }),
    };
}

for (const fam of families) {
    if (!configs[fam]) { console.error(`${fam}: no entry in data/lang-config.json`); continue; }
    if (!familyTree(fam).length) { console.error(`${fam}: no languages in the chart`); continue; }

    if (args.includes('--unpin')) {
        if (fs.existsSync(pinFile(fam))) { fs.unlinkSync(pinFile(fam)); console.log(`${fam}: unpinned`); }
        else console.log(`${fam}: was not pinned`);
        continue;
    }

    if (args.includes('--check')) {
        if (!fs.existsSync(pinFile(fam))) { console.log(`${configs[fam].name.padEnd(16)} not pinned`); continue; }
        // The pinned family against what the engine would generate unpinned now.
        const pinned = projectOf(fam, JSON.parse(fs.readFileSync(pinFile(fam), 'utf8')));
        const free = projectOf(fam, {});
        let words = 0, changed = 0;
        for (const l of pinned.tree) {
            const a = pinned.project.stateOf(l.id), b = free.project.stateOf(l.id);
            const other = new Map((b?.entries || []).map((e) => [e.id, e.ipa]));
            for (const e of a?.entries || []) { if (e.paradigm || e.retired) continue; words += 1; if (other.get(e.id) !== e.ipa) changed += 1; }
        }
        console.log(`${configs[fam].name.padEnd(16)} pinned; ${(100 * changed / Math.max(1, words)).toFixed(1)}% of words would differ if it were unpinned`);
        continue;
    }

    const { tree, project } = projectOf(fam, {});
    for (const l of tree) project.stateOf(l.id);
    const living = tree.filter((l) => l.died == null && !l.diverged && !tree.some((x) => x.parentId === l.id));
    const out = {
        _readme: 'Pin file for one family (scripts/lang-pin.js). Frozen evidence and pinned sound changes; delete it, or run lang-pin --unpin, to let the family regenerate.',
        ...project.serialise(),
        pinnedAt: new Date().toISOString().slice(0, 10),
        evidence: { names: tree.map((l) => l.name), living: living.map((l) => l.name) },
    };
    delete out.config;
    fs.mkdirSync(pinDir, { recursive: true });
    fs.writeFileSync(pinFile(fam), JSON.stringify(out, null, 1));
    console.log(`${fam}: pinned ${Object.keys(out.edges).length} edges and ${out.evidence.names.length} evidence names -> data/lang/${fam}.lang.json`);
}
if (!args.includes('--check')) writeIndex();
