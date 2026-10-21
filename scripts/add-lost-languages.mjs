// Puts the lost languages of data/history/lost.json (scripts/lost-languages.py) into data/languages.json:
// sister branches under their family's root, isolates as families of one. A lost language already there
// keeps its name (DJ may have named it); its dates and notes follow the file. One no longer in the file is
// left alone (its name may be DJ's) but reported.
//   node scripts/add-lost-languages.mjs [repo root]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.argv[2] || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const p = path.join(root, 'data/languages.json');
const doc = JSON.parse(fs.readFileSync(p, 'utf8'));
// one Through time never showed (lost-languages.py --dates) is not a language of the chart
const lost = JSON.parse(fs.readFileSync(path.join(root, 'data/history/lost.json'), 'utf8')).languages.filter((e) => !e.unseen);
const byId = new Map(doc.languages.map((l) => [l.id, l]));
let added = 0;
let updated = 0;
for (const e of lost) {
    const where = e.countries.length ? e.countries.join(', ') : 'its region';
    const notes = `Engine-made lost language (DJ, 20 Oct 2026: lost languages where Through time would be grey, `
        + `"Lost <Family> A, B, C"): spoken in ${where} until ${e.replacedBy}'s line came. A placeholder name: rename freely. `
        + (e.isolate ? 'An isolate: far from its replacer\'s homeland. ' : `A sister branch of ${e.family}. `)
        + 'Dates from Through time.';
    const have = byId.get(e.id);
    if (have) {
        Object.assign(have, { born: e.born, bornCirca: true, died: e.died, diedCirca: true, generated: true, lost: true, notes });
        if (!e.isolate) have.parentId = e.parentId;
        updated += 1;
        continue;
    }
    // generated: the app's own (project.js): not evidence for its family's proto, so adding or
    // changing lost languages never re-mines and redraws the family they join
    const lang = { id: e.id, name: e.name, born: e.born, bornCirca: true, died: e.died, diedCirca: true, generated: true, lost: true, notes };
    if (!e.isolate) {
        lang.parentId = e.parentId;
        lang.relation = 'branch';
        // after the last of its family in the chart
        const fam = new Set([e.parentId]);
        let at = doc.languages.findIndex((l) => l.id === e.parentId);
        for (let i = at + 1; i < doc.languages.length; i += 1) {
            if (fam.has(doc.languages[i].parentId)) { fam.add(doc.languages[i].id); at = i; }
        }
        doc.languages.splice(at + 1, 0, lang);
    } else {
        doc.languages.push(lang);
        doc.families.push({ id: e.id, name: e.name, kind: 'isolate', rootId: e.id, branches: [], population1765: 0,
            source: 'engine-made lost language (scripts/lost-languages.py)' });
    }
    byId.set(e.id, lang);
    added += 1;
}
// a lost language no longer in the file goes if it still has its placeholder name; one DJ has named stays
const inFile = new Set(lost.map((e) => e.id));
const gone = new Set(doc.languages.filter((l) => l.lost && !inFile.has(l.id) && /^Lost /.test(l.name)).map((l) => l.id));
doc.languages = doc.languages.filter((l) => !gone.has(l.id));
doc.families = doc.families.filter((f) => !gone.has(f.id));
const stale = doc.languages.filter((l) => l.lost && !inFile.has(l.id)).map((l) => l.id);
fs.writeFileSync(p, JSON.stringify(doc, null, 2) + '\n');
console.log(`${added} lost languages added, ${updated} updated, ${gone.size} gone in ${p}` + (stale.length ? `; no longer in lost.json (left as they are): ${stale.join(', ')}` : ''));
