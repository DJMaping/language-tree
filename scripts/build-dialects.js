/**
 * Old dialects onto the chart (step 2 of `npm run dialects`; see
 * scripts/build_years_dialects.py). For every old dialect in
 * data/history/dialects.json without a language yet: a language on the chart,
 * a branch of its standard's parent (the standard grew out of one of the old
 * regional languages, as Italian out of Tuscan), born a little before the
 * standard and dying when the standard replaced it (none for a survivor).
 * Named "<City> <Language>" after its canon city, as DJ's own Gyua Dahen; a
 * dialect with no city takes a region name the engine forges in the standard
 * (lang-names.js). Marked "generated": "old-dialect", provisional until DJ
 * locks it. A dialect once added is never touched again: DJ's edits and
 * deletions on the chart stand.
 *
 *   node scripts/build-dialects.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProject } from '../js/engine/project.js';
import { familyInputs } from './world.js';
import { generateNames } from '../js/engine/lexicon/names.js';
import { derive } from '../js/engine/rng.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docPath = path.join(root, 'data/languages.json');
const dialPath = path.join(root, 'data/history/dialects.json');
const doc = JSON.parse(fs.readFileSync(docPath, 'utf8'));
const dial = JSON.parse(fs.readFileSync(dialPath, 'utf8'));
const configs = JSON.parse(fs.readFileSync(path.join(root, 'data/lang-config.json'), 'utf8'));
const byId = new Map(doc.languages.map((l) => [l.id, l]));
const rootOf = (l) => { let c = l; while (c.parentId && byId.has(c.parentId)) c = byId.get(c.parentId); return c.id; };
const label = (y) => (y >= 0 ? `${y} AFA` : `${-y} BFA`);

const projects = new Map();
function forge(lang, n, tag) {
    const fam = rootOf(lang);
    if (!configs[fam]) return [];
    if (!projects.has(fam)) {
        const tree = doc.languages.filter((l) => rootOf(l) === fam);
        projects.set(fam, createProject({
            tree, names: tree.map((l) => l.name),
            config: { ...configs[fam], rootId: fam, presentYear: doc.config.presentYear },
            ...familyInputs(fam), borrowings: doc.borrowings || [],
        }));
    }
    const state = projects.get(fam).stateOf(lang.id);
    const names = generateNames(state, derive('old-dialects', lang.id, tag), { kind: 'region', count: n * 6 });
    // short, plain names read best beside the language's own
    return names.map((x) => x.spelling).filter((s) => s.length >= 3 && s.length <= 9);
}

const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const taken = new Set(doc.languages.map((l) => l.id));
const names = new Set(doc.languages.map((l) => l.name.toLowerCase()));
let added = 0;
for (const e of Object.values(dial.languages)) {
    const std = byId.get(e.standard);
    if (!std) continue;
    const todo = e.dialects.filter((d) => !d.id);
    if (!todo.length) continue;
    const parent = std.parentId && byId.has(std.parentId) ? byId.get(std.parentId) : std;
    const born = Math.round(Math.max((parent.born ?? -1e9) + 25, (std.born ?? 0) - 150) / 5) * 5;
    let forged = [];
    if (todo.some((d) => !d.city)) forged = forge(std, todo.length, std.id);
    for (const d of todo) {
        let place = d.city;
        if (!place) {
            place = forged.find((f) => !names.has(`${f} ${std.name}`.toLowerCase()));
            if (!place) continue;
            forged = forged.filter((f) => f !== place);
            d.forged = true;
        }
        const name = `${place} ${std.name}`;
        let id = slug(name);
        for (let k = 2; taken.has(id); k++) id = `${slug(name)}-${k}`;
        const node = {
            id, name, born, bornCirca: true,
            ...(d.died != null ? { died: Math.max(d.died, born + 50), diedCirca: true } : {}),
            parentId: parent.id, relation: 'branch',
            generated: 'old-dialect',
            note: `The app's (provisional): an old regional language of ${std.name} ${d.city ? `around ${d.city}${d.nation ? `, ${d.nation}` : ''}` : `in the region its name gives (forged by the engine)`}, `
                + (d.died != null ? `replaced by the standard by ${label(d.died)}.` : 'still spoken in 1765 beside the standard.'),
        };
        doc.languages.push(node);
        byId.set(id, node);
        taken.add(id);
        names.add(name.toLowerCase());
        d.id = id;
        d.name = name;
        added++;
    }
}
fs.writeFileSync(docPath, JSON.stringify(doc, null, 2) + '\n');
fs.writeFileSync(dialPath, JSON.stringify(dial, null, 1) + '\n');
console.log(`${added} old dialects added to the chart (data/languages.json); next: python scripts/build-years.py languages`);
