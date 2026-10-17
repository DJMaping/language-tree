/**
 * The character report: what the engine inferred about a family, and why.
 *
 *   node scripts/lang-character.js proto-kuhn
 *   node scripts/lang-character.js --all
 *
 * The review gate for a family's character (DJ decides the character from the
 * evidence, through the engine). For each family: its evidence, what was mined
 * from it, each inferred setting with its reason (or "set in lang-config"),
 * the proto's sound system, and the same basic words in the proto and in two
 * living languages. Once DJ is happy with a family, `npm run pin` freezes it.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProject } from '../js/engine/project.js';
import { familyInputs } from './world.js';
import { inventoryCounts } from './measures.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const doc = JSON.parse(fs.readFileSync(path.join(root, 'data/languages.json'), 'utf8'));
const configs = JSON.parse(fs.readFileSync(path.join(root, 'data/lang-config.json'), 'utf8'));
const byId = new Map(doc.languages.map((l) => [l.id, l]));
const rootOf = (l) => { let c = l; while (c.parentId && byId.has(c.parentId)) c = byId.get(c.parentId); return c.id; };

const args = process.argv.slice(2);
const families = args.includes('--all') ? Object.keys(configs).filter((k) => !k.startsWith('_')) : args.filter((a) => !a.startsWith('--'));
if (!families.length) { console.error('Name a family root (e.g. proto-kuhn), or pass --all.'); process.exit(1); }

const GLOSSES = ['I', 'you (sg)', 'two', 'water', 'fire', 'sun', 'moon', 'stone', 'mother', 'eat'];

for (const fam of families) {
    const cfg = configs[fam];
    if (!cfg) { console.error(`${fam}: no entry in data/lang-config.json`); continue; }
    const tree = doc.languages.filter((l) => rootOf(l) === fam);
    if (!tree.length) { console.error(`${fam}: no languages in the chart`); continue; }
    const inputs = familyInputs(fam);
    const project = createProject({
        tree, names: tree.map((l) => l.name),
        config: { ...cfg, rootId: fam, presentYear: doc.config.presentYear },
        borrowings: doc.borrowings || [], ...inputs,
    });
    const founding = project.foundingOf(fam);
    const ch = founding.character;
    const p = founding.profile;
    const inv = inventoryCounts(founding.inventory, founding.entries);

    console.log(`\n${'═'.repeat(76)}\n${cfg.name.toUpperCase()}  (${fam})${cfg.provisional ? '  provisional' : ''}\n${'═'.repeat(76)}`);
    const cities = cfg.evidence === 'names' ? 0 : inputs.evidenceNames.length;
    console.log(`Evidence     ${tree.length} language names${cities ? ` + ${cities} city names` : cfg.evidence === 'names' ? ' only (evidence: names)' : ''}`);
    console.log(`Mined        ${p.meanSyllablesPerWord.toFixed(2)} syllables a word, ${Math.round(100 * (p.closedWordRate || 0))}% of words end in a consonant`);
    console.log(`Morphology   ${ch.morphology.type}, ${ch.morphology.alignment}    (${ch.reasons.morphology}; ${ch.reasons.alignment})`);
    console.log(`Word order   ${ch.syntax.order}    (${ch.reasons.order})`);
    console.log(`Affixes      ${ch.reasons.affixes}`);
    if (ch.reasons.cases) console.log(`Cases        ${(ch.morphology.cases || []).join(' ') || 'none'}    (${ch.reasons.cases})`);
    if (ch.reasons.gender) console.log(`Gender       ${ch.reasons.gender}`);
    if (ch.reasons.classifiers) {
        const sys = founding.paradigm?.categories?.classifiers;
        console.log(`Classifiers  ${ch.reasons.classifiers}${sys ? ` [${sys.classes.join(' ')}]${sys.bound ? ', endings on the numeral' : ''}` : ''}`);
    }
    if (ch.reasons.pronouns) console.log(`Pronouns     ${ch.reasons.pronouns}`);
    if (ch.reasons.articles) console.log(`Articles     ${ch.reasons.articles}`);
    if (ch.reasons.moods) console.log(`Moods        ${ch.reasons.moods}`);
    console.log(`Consonants   ${founding.inventory.consonants.map((c) => c.ipa).join(' ')}    (${ch.reasons.laryngeal})`);
    console.log(`Vowels       ${founding.inventory.vowels.map((v) => v.ipa).join(' ')}    (${ch.reasons.vowels}; ${inv.consonants} consonants + ${inv.qualities} vowels)`);
    console.log(`Stress       ${founding.phonotactics.stress?.rule ?? cfg.stress}`);

    const leaves = tree.filter((l) => l.died == null && !l.diverged && !tree.some((x) => x.parentId === l.id));
    const sample = [fam, ...leaves.slice(0, 2).map((l) => l.id)];
    console.log('');
    for (const id of sample) {
        const st = id === fam ? founding : project.stateOf(id);
        const name = id === fam ? `*${byId.get(fam).name}` : byId.get(id).name;
        const words = GLOSSES.map((g) => st.entries.find((e) => e.gloss === g && !e.retired && !e.paradigm)?.ipa ?? '—');
        console.log(`  ${name.padEnd(24)} ${words.join(' · ')}`);
    }
    console.log(`  ${''.padEnd(24)} ${GLOSSES.join(' · ')}`);
}
