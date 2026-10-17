/**
 * The translator from the command line (the app has it as Views > Languages >
 * Translator; the work is js/engine/text/translate.js).
 *
 *   node scripts/lang-translate.js "The woman gives water to the child."
 *   node scripts/lang-translate.js "Do you know my name?" emaran,lycroan,standard-dahen
 *   node scripts/lang-translate.js "Come with us." jathuan --polite --we=inclusive
 *
 * Prints, per language, its grammar in brief, then each sentence spelled,
 * glossed (Leipzig style: "-" for an ending, "." where it has worn to
 * nothing), and the words it has none for.
 */

import fs from 'node:fs';
import { createProject } from '../js/engine/project.js';
import { familyInputs } from './world.js';
import { translate, grammarNotes } from '../js/engine/text/translate.js';
const doc = JSON.parse(fs.readFileSync('data/languages.json', 'utf8'));
const configs = JSON.parse(fs.readFileSync('data/lang-config.json', 'utf8'));
const by = new Map(doc.languages.map((l) => [l.id, l]));
const rootOf = (l) => { let c = l; while (c.parentId) c = by.get(c.parentId); return c.id; };
const projects = new Map();
const stateOf = (id) => {
  const fam = rootOf(by.get(id));
  if (!projects.has(fam)) { const tree = doc.languages.filter((l) => rootOf(l) === fam); projects.set(fam, createProject({ tree, names: tree.map((l) => l.name), config: { ...configs[fam], rootId: fam, presentYear: 1765 }, ...familyInputs(fam), borrowings: doc.borrowings || [] })); }
  return projects.get(fam).stateOf(id);
};
// --polite: the polite "you" where a language has one; --we=inclusive|exclusive: which "we"
const flags = process.argv.filter((a) => a.startsWith('--'));
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const options = { polite: flags.includes('--polite'), we: flags.find((f) => f.startsWith('--we='))?.slice(5) || 'auto', addressee: flags.find((f) => f.startsWith('--addressee='))?.slice(12) || 'auto' };
const text = args[0] || 'The woman gives water to the child. I did not see the old man at the river. Do you know my name? We will go to your house tomorrow.';
for (const id of (args[1] || 'emaran,standard-dahen,arten,jathuan').split(',')) {
  const st = stateOf(id);
  const t = translate(st, text, options);
  console.log(`== ${by.get(id).name}: ${grammarNotes(st).join('; ')}; negation ${st.syntax.negation}; questions ${st.syntax.polar}`);
  for (const s of t.sentences) console.log(`   ${s.spelling}\n      ${s.gloss}`);
  if (t.missing.length) console.log('   missing:', t.missing.join(', '));
}
