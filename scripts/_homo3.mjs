import fs from 'node:fs';
import { createProject } from '../js/engine/project.js';
import { familyInputs } from './world.js';
const doc = JSON.parse(fs.readFileSync('data/languages.json', 'utf8'));
const configs = JSON.parse(fs.readFileSync('data/lang-config.json', 'utf8'));
const by = new Map(doc.languages.map((l) => [l.id, l]));
const kids = new Set(doc.languages.map((l) => l.parentId));
const rootOf = (l) => { let c = l; while (c.parentId) c = by.get(c.parentId); return c.id; };
const seeds = (process.argv[2] || ',/2').split(',');
const fams = Object.keys(configs).filter((k) => !k.startsWith('_') && doc.languages.some((l) => rootOf(l) === k && l.died == null && !kids.has(l.id) && !l.generated));
let core = [], all = [], syl = [];
for (const sd of seeds) for (const fam of fams) {
  const tree = doc.languages.filter((l) => rootOf(l) === fam);
  const p = createProject({ tree, names: tree.map((l) => l.name), config: { ...configs[fam], rootId: fam, presentYear: 1765, seed: configs[fam].seed + sd }, ...familyInputs(fam), borrowings: doc.borrowings || [] });
  let n = 0, h = 0, lex = 0, lh = 0, s = 0;
  for (const leaf of tree.filter((l) => l.died == null && !kids.has(l.id) && !l.generated).slice(0, 6)) {
    const st = p.stateOf(leaf.id);
    const live = st.entries.filter((e) => !e.retired && !e.paradigm);
    const words = new Map(); for (const e of live) { if (!words.has(e.ipa)) words.set(e.ipa, new Set()); words.get(e.ipa).add(e.sameWordAs ?? e.id); }
    for (const e of live) { lex++; if (words.get(e.ipa).size > 1) lh++; if (e.core) { n++; s += e.form.filter((x) => x.type === 'V').length; if (words.get(e.ipa).size > 1) h++; } }
  }
  core.push(100 * h / n); all.push(100 * lh / lex); syl.push(s / n);
}
const avg = (a) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
console.log('families', fams.length, 'x seeds', seeds.length, '| core homophony', avg(core) + '%', 'all words', avg(all) + '%', 'syllables per core word', avg(syl));
