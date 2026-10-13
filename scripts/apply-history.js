/**
 * Phase 5: apply what DJ approved of the history draft (13 Oct 2026).
 *
 *   node scripts/apply-history.js
 *
 * DJ's answers: move the tree to the wiki's dates where they conflict; add the
 * six peoples the wiki's history names as extinct languages (Unwosian and
 * Carth as isolates, the others where the wiki places them, flagged for his
 * check); colonial contact starts 150 years before independence (a
 * placeholder). This script:
 *
 *   1. re-dates the languages the wiki contradicts, pushing ancestors earlier
 *      only where they must be, and marks each date as anchored, with its page;
 *   2. adds the six extinct languages;
 *   3. adds the wars as timeline events;
 *   4. regenerates the draft against the changed tree and turns every ready
 *      contact (conquests, substrates, colonial rule) into a borrowing arrow.
 *
 * Idempotent: languages, events and arrows it has added are recognised by id
 * and not added twice. Every arrow it adds has an id starting "h-".
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateDoc } from '../js/validate.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(root, 'data/languages.json');
const doc = JSON.parse(fs.readFileSync(DATA, 'utf8'));
const L = doc.languages;
const byId = () => new Map(L.map((l) => [l.id, l]));
const byName = (name) => L.find((l) => l.name === name);
const log = [];

/** Move a language's birth earlier, pushing its ancestors earlier only where they must be. */
function setBorn(id, year) {
    const l = byId().get(id);
    if (!l || l.born <= year) return;
    const parent = l.parentId ? byId().get(l.parentId) : null;
    if (parent && (parent.born > year || (l.relation === 'stage' && parent.born >= year))) setBorn(parent.id, year - 100);
    log.push(`${l.name}: born ${l.born} -> ${year}`);
    l.born = year;
}
const anchor = (id, source) => { const l = byId().get(id); if (l) { l.dateBasis = 'anchored'; l.dateSource = source; } };

// ---------------------------------------------------------------- 1. dates
{
    const v = byName('Vestorian');
    if (v) { setBorn(v.id, -200); anchor(v.id, 'wiki: Emara and Ilicuhe (the Vestorian conquests of the 1st century BFA)'); }
    const h = byName('Hadan');
    if (h) { setBorn(h.id, -50); anchor(h.id, 'wiki: Elishara River (a Carthic river word in Hadan)'); }
    const t = byName('Threch');
    if (t) { setBorn(t.id, -200); anchor(t.id, 'wiki: Hkuqo (Ealdorii annexation, 2nd century BFA)'); }
    const e = byName('Ecossian');
    if (e) {
        setBorn(e.id, -900);
        if (e.died !== 100) { e.died = 100; e.diedCirca = true; log.push('Ecossian: spoken until c.100 AFA (the Vestorian conquest of Emara, 1st century BFA)'); }
        anchor(e.id, 'wiki: Easuhura (the Nasucisan settlement of Ecossi, 900 BFA) and Emara');
    }
    const a = byName('Aiisaran');
    const pk = byName('Proto-Kaalsite');
    if (a && pk && a.parentId !== pk.id) {
        log.push(`Aiisaran: moved from ${byId().get(a.parentId)?.name} to Proto-Kaalsite, born -1100 (Old Aiisaran lent Ancient Kaalsite "Tosal" by 1000 BFA)`);
        a.parentId = pk.id;
        a.born = -1100;
        a.relation = 'branch';
        a.bornCirca = true;
        anchor(a.id, 'wiki: Tusil River (Old Aiisaran, the source of Ancient Kaalsite Tosal)');
    }
}

// ---------------------------------------------------------------- 2. extinct languages
const families = doc.families || (doc.families = []);
function addExtinct(name, fields, isolate, note) {
    if (byName(name)) return;
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    L.push({ id, name, ...fields, notes: note });
    log.push(`added ${name}${isolate ? ' (isolate)' : ` under ${byId().get(fields.parentId)?.name}`}`);
    if (isolate) families.push({ id, name, kind: 'isolate', rootId: id, branches: [], population1765: 0, source: 'wiki history (Phase 5)' });
}
addExtinct('Unwosian', { born: -3100, bornCirca: true, died: -500, diedCirca: true }, true,
    'Wiki (Alzuria (region)): the Kaaldari and Unwosians dominated Alzuria from the beginning of recorded history, 3100 BFA, until the Ukhdari conquests of 556 BFA; Tusil River: an Unwosian river name passed into Kaalsite. Extinct isolate and substrate. Death date a placeholder.');
addExtinct('Carth', { born: -2000, bornCirca: true, died: 100, diedCirca: true }, true,
    'Wiki (Emara, Elishara River): the Carth tribes lived in Emara before the Ecossian settlement; Carthic river words survive in Vestorian and Hadan. Extinct isolate and substrate. Dates are placeholders.');
addExtinct('Almaglean', { born: 100, bornCirca: true, died: 800, diedCirca: true }, true,
    'Wiki (Almaglean Empire): the Later Almaglean Tribes (103 AFA) founded the empire that ruled Areoix Lie 189-522, "the first and only foreign imperial dynasty in Arten history". Placed as an isolate because it was foreign to Arten: DJ to check. Death date a placeholder.');
addExtinct('Seniaaii', { born: 1300, bornCirca: true, died: 1700, diedCirca: true }, true,
    'Wiki (Gaeiya, Eldjo): the Seniaaii occupied Emara 1532-1556 (the Seniaaii wars). Origin not stated on the wiki, so placed as an isolate: DJ to check. Dates are placeholders.');
const oldKaalsite = byName('Old Kaalsite');
if (oldKaalsite) addExtinct('Yethran', { born: 400, bornCirca: true, died: 1100, diedCirca: true, parentId: oldKaalsite.id, relation: 'branch' }, false,
    'Wiki (Estijan, Alzuria (region)): the Yethran Empire "originated from Alzuria", conquered it in the 7th century, and in 842 the Uvei adopted something from it. Placed in the Alzurian branch under Old Kaalsite: DJ to check. Dates are placeholders.');
const saetnde = byName('Saetnde');
if (saetnde) addExtinct('Escaran', { born: 300, bornCirca: true, died: 900, diedCirca: true, parentId: saetnde.id, relation: 'branch' }, false,
    'Wiki (Easuhura): the Escarans conquered Easuhura in 524; the Escaran Channel lies between Easuhura and western Emara, so placed in Saetnde, the branch of Emara: DJ to check. Dates are placeholders.');

// ---------------------------------------------------------------- 3. wars as timeline events
const EVENTS = [
    ['ev-backstab-war', 'Backstab War', 1654, 1655, 'wiki: Backstab War. East Atirha and the Mii lands.'],
    ['ev-etirhan-independence-war', 'Etirhan Independence War', 1641, 1647, 'wiki: Etirhan Independence War.'],
    ['ev-laseltshen-independence-war', 'Laseltshen Independence War', 1644, 1647, 'wiki: Laseltshen Independence War. Eastern Atirha.'],
    ['ev-great-imperial-war', 'Great Imperial War', 1661, 1666, 'wiki: Great Imperial War. Lasen Powers victory.'],
    ['ev-red-war', 'Red War', 1688, 1695, 'wiki: Red War. The Accord against the Vanguards; Dahe, Lycroa and Alzuria occupied.'],
];
doc.events ??= [];
for (const [id, label, year, endYear, notes] of EVENTS) {
    if (doc.events.some((e) => e.id === id)) continue;
    doc.events.push({ id, label, year, endYear, notes });
    log.push(`event ${label} ${year}-${endYear}`);
}

// Write the tree changes, then rebuild the draft against them.
let errors = validateDoc(doc);
if (errors.length) { for (const e of errors.slice(0, 15)) console.error(`  ${e.path}: ${e.message}`); process.exit(1); }
fs.writeFileSync(DATA, `${JSON.stringify(doc, null, 2)}\n`);
execFileSync(process.execPath, [path.join(root, 'scripts/build-history-draft.js')], { stdio: 'inherit' });

// ---------------------------------------------------------------- 4. contact arrows
const draft = JSON.parse(fs.readFileSync(path.join(root, 'data/history-draft.json'), 'utf8'));
const fresh = JSON.parse(fs.readFileSync(DATA, 'utf8'));
fresh.borrowings ??= [];
const have = new Set(fresh.borrowings.map((b) => `${b.fromId}>${b.toId}@${b.year}`));
let n = fresh.borrowings.filter((b) => String(b.id).startsWith('h-')).length;
let added = 0;
for (const c of draft.contacts) {
    const key = `${c.fromId}>${c.toId}@${c.year}`;
    if (have.has(key) || c.fromId === c.toId) continue;
    have.add(key);
    n += 1;
    added += 1;
    fresh.borrowings.push({
        id: `h-${String(n).padStart(3, '0')}`,
        fromId: c.fromId, toId: c.toId, year: c.year,
        kind: c.kind === 'substrate' || c.kind === 'superstrate' ? c.kind : 'loan',
        label: `${c.label} (${c.page})`,
    });
}
errors = validateDoc(fresh);
if (errors.length) { for (const e of errors.slice(0, 15)) console.error(`  ${e.path}: ${e.message}`); process.exit(1); }
fs.writeFileSync(DATA, `${JSON.stringify(fresh, null, 2)}\n`);
console.log(log.join('\n'));
console.log(`\n${added} contact arrows added (${fresh.borrowings.length} borrowings in all).`);
