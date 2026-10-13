/**
 * Phase 3 of the overhaul: rebuild the chart to DJ's canon.
 *
 *   node scripts/build-skeleton.js            write data/languages.json
 *   node scripts/build-skeleton.js --dry      report what would change, write nothing
 *
 * Reads the canon in data/canon/ (the People Atlas extract of DJ's family map,
 * and the wiki's native-speaker list) and brings the chart into line with it:
 *
 *   - all 14 map families, each with its map branches as subgroups;
 *   - every canon language (the 35 ranked and the 70 named only on country
 *     pages) as a node, under its branch; existing nodes are kept and linked;
 *   - map spellings for families and branches (DJ, 13 Oct 2026: Saetnde,
 *     Surtan, Quaians, Eserign, Ankusano-Elaian); renamed nodes keep their old
 *     id as `uid`, so the engine does not re-roll them;
 *   - Seljan moved to Tainabide (DJ: "fix family membership");
 *   - Lastnu as a constructed language with lines to its sources;
 *   - 1765 speakers and the states each language and branch is spoken in, with
 *     official languages over another family's majority marked colonial;
 *   - a `families` registry at the top level.
 *
 * Every new node's dates are PLACEHOLDERS (the chart needs a year to draw a
 * box); dates become canon only when Phase 5 anchors them to history and DJ
 * approves. Idempotent: running it twice changes nothing the second time.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDoc } from '../js/validate.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(root, 'data/languages.json');
const CONFIG = path.join(root, 'data/lang-config.json');
const doc = JSON.parse(fs.readFileSync(DATA, 'utf8'));
const config = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
const atlas = JSON.parse(fs.readFileSync(path.join(root, 'data/canon/people-atlas-languages.json'), 'utf8'));
const wikiList = JSON.parse(fs.readFileSync(path.join(root, 'data/canon/wiki-native-speakers.json'), 'utf8')).languages;
const DRY = process.argv.includes('--dry');

const L = doc.languages;
const byId = () => new Map(L.map((l) => [l.id, l]));
const norm = (s) => String(s).normalize('NFKD').toLowerCase().replace(/[^a-z]/g, '');
const findByName = (name) => L.find((l) => norm(l.name) === norm(name));
const log = [];
const configRenames = [];

/** The app's slugify (js/forms.js), mirrored so ids come out the same. */
function slugify(name, taken) {
    let s = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (!s) s = 'lang';
    let id = s, n = 2;
    while (taken.has(id)) id = `${s}-${n++}`;
    return id;
}

/** Rename a node the way the app does: reslug, cascade, keep the old id as uid. */
function rename(id, name) {
    // On a re-run the node is already renamed: find it by the uid it kept.
    const l = byId().get(id) ?? L.find((x) => x.uid === id);
    if (!l) return id;
    if (l.name === name) return l.id;
    const taken = new Set(L.filter((x) => x.id !== id).map((x) => x.id));
    const newId = slugify(name, taken);
    log.push(`rename ${l.name} -> ${name}`);
    l.name = name;
    if (newId === id) return id;
    if (!l.uid) l.uid = id;
    l.id = newId;
    for (const x of L) {
        if (x.parentId === id) x.parentId = newId;
        if (x.secondaryParentId === id) x.secondaryParentId = newId;
        for (const ep of x.extraParents || []) if (ep.id === id) ep.id = newId;
    }
    for (const b of doc.borrowings || []) {
        if (b.fromId === id) b.fromId = newId;
        if (b.toId === id) b.toId = newId;
    }
    if (config[id]) configRenames.push([id, newId]); // the family's config follows its root
    return newId;
}

/** Add a node unless one with this name exists; returns its id either way. */
function ensure(name, fields) {
    const have = findByName(name);
    if (have) return have.id;
    const id = slugify(name, new Set(L.map((l) => l.id)));
    L.push({ id, name, ...fields });
    log.push(`add ${name} (${fields.parentId ? `under ${byId().get(fields.parentId)?.name}` : 'root'})`);
    return id;
}

// ---------------------------------------------------------------------------
// 1. Spellings: the map's, for families and branches (DJ, 13 Oct 2026)
// ---------------------------------------------------------------------------
rename('saestnde', 'Saetnde');
rename('surtian', 'Surtan');
rename('esereign', 'Eserign');
const quaiansRoot = rename('proto-queians', 'Proto-Quaians');
for (const g of doc.groups || []) if (g.id === 'surtian' && g.name === 'Surtian') { g.name = 'Surtan'; log.push('group Surtian -> Surtan'); }
doc.config.title = 'Languages of Andah';

// ---------------------------------------------------------------------------
// 2. Seljan belongs to Tainabide (the map's Mintarchesee branch, beside Ikzen)
// ---------------------------------------------------------------------------
{
    const oldSeljan = byId().get('old-seljan');
    if (oldSeljan && oldSeljan.parentId !== 'mintarchesee') {
        log.push(`move Old Seljan from ${oldSeljan.parentId} to Mintarchesee (Tainabide)`);
        oldSeljan.parentId = 'mintarchesee';
    }
}

// ---------------------------------------------------------------------------
// 3. Families and branches
// ---------------------------------------------------------------------------
const PLACEHOLDER = { root: -3000, branch: -2000, language: 800, colonial: 1650 };
const proto = (fields) => ({ reconstructed: true, diverged: true, bornCirca: true, ...fields });

/** Existing branch nodes, by map branch name. */
const BRANCH_NODE = {
    Nasucisan: 'nasucisan', Alzurian: 'proto-alzurian', Saetnde: 'saetnde', Surtan: 'surtan',
    Passonin: 'passonin', Veruni: 'veruni',
    Dahen: 'dahen', Kino: 'proto-kino', Kaastini: 'proto-kaastini',
    Mintarchesee: 'mintarchesee', Eserign: 'eserign',
    Amnant: 'proto-amnant', Quaians: quaiansRoot,
};
const FAMILY_ROOT = {
    'Alzuria-Ayuman': 'proto-alzuria-ayuman', 'Dahen-Kino': 'proto-dahen-kino', Tainabide: 'proto-tainabide',
    Amnant: 'proto-amnant', Quaians: quaiansRoot, Arten: 'proto-arten',
};

for (const [family, branches] of Object.entries(atlas.fams)) {
    if (!FAMILY_ROOT[family]) {
        FAMILY_ROOT[family] = ensure(`Proto-${family}`, proto({ born: PLACEHOLDER.root }));
    }
    const rootId = FAMILY_ROOT[family];
    // A family whose map shows one branch IS that branch.
    if (branches.length === 1) { BRANCH_NODE[branches[0]] ??= rootId; continue; }
    for (const b of branches) {
        if (BRANCH_NODE[b]) continue;
        if (family === 'Arten' && b === 'Arten') {
            // The Arten branch is the Arten macrolanguage itself, still spoken.
            BRANCH_NODE[b] = ensure('Arten', { born: -500, bornCirca: true, parentId: rootId, relation: 'branch', status: 'macrolanguage' });
            continue;
        }
        BRANCH_NODE[b] = ensure(b, proto({ born: family === 'Arten' ? -1500 : PLACEHOLDER.branch, parentId: rootId, relation: 'branch' }));
    }
}
// Sub-branches the wiki list names below the map's branches.
BRANCH_NODE.Tabber = ensure('Tabber', proto({ born: PLACEHOLDER.branch + 500, parentId: FAMILY_ROOT['Tabber-Nij'], relation: 'branch' }));
BRANCH_NODE.Casn = BRANCH_NODE.Casan;           // the list's spelling of the map's Casan
BRANCH_NODE.Cenryi = BRANCH_NODE.Huan;          // Lierin's "branch": Cenryi sits in Huan
for (const k of ['Dorimian', 'Vayvelean', 'Ocunese']) BRANCH_NODE[k] = FAMILY_ROOT[k === 'Dorimian' ? 'Pyrru-Kanqer' : 'Kuhn'];
const famAlias = (f) => ({ 'Ankuano-Elaian': 'Ankusano-Elaian', Queians: 'Quaians' }[f] || f);

// ---------------------------------------------------------------------------
// 4. Canon languages
// ---------------------------------------------------------------------------
const S = atlas.states;
const mapFamilyOf = (state) => { const fs_ = S[state]?.fs || {}; return Object.keys(fs_).sort((a, b) => fs_[b] - fs_[a])[0]; };
const branchFamily = Object.fromEntries(Object.entries(atlas.fams).flatMap(([f, bs]) => bs.map((b) => [b, f])));

/** The states a language is official in, colonial where the map shows another family. */
function areasOf(name, family) {
    const out = [];
    for (const [state, s] of Object.entries(S)) {
        if (!(s.off || []).some((o) => norm(o[0]) === norm(name))) continue;
        out.push({ state, continent: s.c, role: mapFamilyOf(state) === family ? 'official' : 'colonial' });
    }
    return out;
}

/** The map branch a page-only language belongs to, weighted by population. */
function branchFromStates(name, family) {
    const w = new Map();
    for (const [state, s] of Object.entries(S)) {
        if (!(s.off || []).some((o) => norm(o[0]) === norm(name))) continue;
        if (mapFamilyOf(state) !== family) continue;
        for (const [b, share] of s.br || []) if (branchFamily[b] === family) w.set(b, (w.get(b) || 0) + share * s.pop1765);
    }
    return [...w].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

const atlasLang = new Map(atlas.langs.map((l) => [norm(l.name), l]));
/** Where the wiki list's name differs from the chart's or the Atlas's. */
const WIKI_NAME = { Shie: 'Shie Dahen', Qai: 'Qai Dahen' };
const NODE_FOR = { 'Shie Dahen': 'shie', 'Qai Dahen': 'qai', Fravalan: 'fravala' };
const ATLAS_NAME = { Fravalan: 'Praesian' };

function linkCanon(id, { family, l1, l2, wikiName }) {
    const l = byId().get(id);
    const areas = areasOf(wikiName || l.name, family);
    if (areas.length) l.areas = areas;
    if (l1 != null) l.speakers = { year: 1765, l1, ...(l2 != null ? { l2 } : {}), source: 'wiki: List of languages by number of native speakers' };
    if (wikiName && norm(wikiName) !== norm(l.name)) l.canonName = wikiName;
}

// The ranked list: family and branch as the wiki gives them.
for (const row of wikiList) {
    const family = famAlias(row.family);
    if (family === 'Conlang') continue; // Lastnu, below
    const wikiName = WIKI_NAME[row.name] ?? row.name;
    const a = atlasLang.get(norm(ATLAS_NAME[wikiName] ?? wikiName));
    let id = NODE_FOR[wikiName] ?? findByName(wikiName)?.id;
    if (!id) {
        const parentId = BRANCH_NODE[row.branch] ?? FAMILY_ROOT[family];
        const parent = byId().get(parentId);
        id = ensure(wikiName, { born: Math.max(PLACEHOLDER.language, parent.born + 100), bornCirca: true, parentId, relation: 'branch' });
    }
    linkCanon(id, { family, l1: row.l1, l2: a?.l2 ?? null, wikiName });
    if (['dahen', 'qai', 'shie'].includes(id)) byId().get(id).status = 'macrolanguage';
}

// Languages named only as a country's official language.
const VARIETY_OF = { 'Metndrian Alqiran': 'alqiran', 'Rkmepuii Emaran': 'emaran' };
for (const [name, states] of atlas.pageonly) {
    const fam = (() => {
        const w = new Map();
        for (const st of states) for (const o of S[st]?.off || []) if (norm(o[0]) === norm(name)) w.set(o[1], (w.get(o[1]) || 0) + (S[st].pop1765 || 0));
        return [...w].sort((a, b) => b[1] - a[1])[0]?.[0];
    })();
    const family = famAlias(fam);
    let id = findByName(name)?.id;
    if (!id) {
        let parentId, born, extra = {};
        if (VARIETY_OF[name]) {
            parentId = VARIETY_OF[name];
            born = Math.max(PLACEHOLDER.colonial, byId().get(parentId).born + 50);
        } else {
            const branch = branchFromStates(name, family);
            parentId = BRANCH_NODE[branch] ?? FAMILY_ROOT[family];
            born = Math.max(PLACEHOLDER.language, byId().get(parentId).born + 100);
        }
        if (/creole/i.test(name)) { extra = { kind: 'creole' }; born = Math.max(born, 1700); }
        id = ensure(name, { born, bornCirca: true, parentId, relation: 'branch', ...extra });
    }
    linkCanon(id, { family, l1: null, l2: null, wikiName: name });
}

// ---------------------------------------------------------------------------
// 5. Lastnu: constructed, drawn with lines to its sources (DJ, 13 Oct 2026)
// ---------------------------------------------------------------------------
{
    const row = wikiList.find((r) => r.name === 'Lastnu');
    const a = atlasLang.get('lastnu');
    let id = findByName('Lastnu')?.id;
    if (!id) id = ensure('Lastnu', { born: 1700, bornCirca: true, kind: 'constructed' });
    const l = byId().get(id);
    // Mostly Emaran, Lycroan and Alzurian (DJ: Ukhdari and Ealdorii both);
    // partly Estijan and Arten; minor Dahen and Alqiran. Which "smaller
    // Alzuria-Ayuman languages" are minor sources is still DJ's to name.
    const SOURCES = [['emaran', 3], ['lycroan', 3], ['ukhdari', 3], ['ealdorii', 3], ['estijan', 2], [BRANCH_NODE.Arten, 2], ['dahen', 1], ['alqiran', 1]];
    l.extraParents = SOURCES.filter(([sid]) => byId().has(sid)).map(([sid, weight]) => ({ id: sid, role: 'source', weight }));
    l.speakers = { year: 1765, l1: row.l1, l2: a?.l2 ?? null, source: 'wiki: List of languages by number of native speakers' };
    l.areas = (a?.states || []).map((state) => ({ state, continent: S[state]?.c, role: 'official' }));
}

// A map branch with no named language yet (Asturian) is one language, not an
// empty subgroup: a diverged box needs daughters to diverge into.
for (const l of L) {
    if (!l.diverged || L.some((x) => x.parentId === l.id) || l.died != null) continue;
    delete l.diverged; delete l.reconstructed;
    log.push(`${l.name}: a map branch with no named language, kept as one language`);
}

// ---------------------------------------------------------------------------
// 6. Where each branch is the majority (the map's shares), and the registry
// ---------------------------------------------------------------------------
for (const [branch, nodeId] of Object.entries(BRANCH_NODE)) {
    if (!atlas.fams[branchFamily[branch]]?.includes(branch)) continue;
    const node = byId().get(nodeId);
    const areas = [];
    for (const [state, s] of Object.entries(S)) {
        const share = (s.br || []).find(([b]) => b === branch)?.[1];
        if (share >= 0.2) areas.push({ state, continent: s.c, role: 'majority', share: Math.round(share * 100) / 100 });
    }
    if (areas.length) node.mapAreas = areas.sort((a, b) => b.share - a.share);
}

doc.families = Object.entries(atlas.fams).map(([family, branches]) => ({
    id: slugify(family, new Set()),
    name: family,
    kind: 'family',
    rootId: FAMILY_ROOT[family],
    branches: branches.map((b) => ({ name: b, nodeId: BRANCH_NODE[b] })),
    population1765: atlas.famland1765[family] ?? null,
    source: "DJ's map of the major language families (People Atlas)",
}));
// DJ's own Western Arten line (Bayudaiar) is Arten's seventh branch (DJ, 13 Oct 2026).
const arten = doc.families.find((f) => f.name === 'Arten');
if (arten && byId().has('western-arten')) arten.branches.push({ name: 'Western Arten', nodeId: 'western-arten', source: 'DJ' });
doc.families.push({ id: 'lastnu', name: 'Lastnu', kind: 'constructed', rootId: findByName('Lastnu').id, branches: [], population1765: null, source: 'wiki' });

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------
const errors = validateDoc(doc);
if (errors.length) {
    console.error('The rebuilt chart does not validate:');
    for (const e of errors.slice(0, 20)) console.error(`  ${e.path}: ${e.message}`);
    process.exit(1);
}
console.log(log.join('\n'));
console.log(`\n${L.length} languages, ${doc.families.length} families.`);
if (!DRY) {
    fs.writeFileSync(DATA, `${JSON.stringify(doc, null, 2)}\n`);
    // Surgical, so the hand-written config keeps its layout and notes.
    let text = fs.readFileSync(CONFIG, 'utf8');
    for (const [from, to] of configRenames) text = text.replace(`"${from}": {`, `"${to}": {`);
    text = text.replace('"name": "Queians"', '"name": "Quaians"');
    fs.writeFileSync(CONFIG, text);
    console.log('Wrote data/languages.json and data/lang-config.json.');
}
