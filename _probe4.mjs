/** Probe 4: the Old Chinese route. What happens to *-s and *-h down Standard Dahen? */
import fs from 'node:fs';
import path from 'node:path';
import { createProject } from './js/engine/project.js';
import { evolveWord } from './js/engine/soundchange/apply.js';
import { markStress, repairHiatus, repairClusters } from './js/engine/phonology/phonotactics.js';
import { wordToIpa, parseWord, isVowel } from './js/engine/features.js';

const root = 'C:/Users/danny/Desktop/Andah games/language-tree';
const doc = JSON.parse(fs.readFileSync(path.join(root, 'data/languages.json'), 'utf8'));
const configs = JSON.parse(fs.readFileSync(path.join(root, 'data/lang-config.json'), 'utf8'));
const byId = new Map(doc.languages.map((l) => [l.id, l]));
const rootOf = (l) => { let c = l; while (c.parentId) c = byId.get(c.parentId); return c.id; };

const famRoot = 'proto-dahen-kino';
const cfg = configs[famRoot];
const tree = doc.languages.filter((l) => rootOf(l) === famRoot);
const project = createProject({ tree, names: tree.map((l) => l.name),
    config: { ...cfg, rootId: famRoot, presentYear: doc.config.presentYear }, sidecar: {} });
const proto = project.stateOf(famRoot);

const target = tree.find((l) => l.name === 'Standard Dahen') || tree.find((l) => /Dahen/.test(l.name));
console.log('target:', target.name);
const chain = [];
let n = target; while (n?.parentId) { chain.unshift(n.id); n = byId.get(n.parentId); }
project.stateOf(target.id);
console.log('lineage:', chain.map((id) => byId.get(id).name).join(' > '));

// which edges carry tonogenesis-coda anywhere in the family?
for (const node of tree) {
    const cs = project.changeSetOf(node.id);
    if (cs?.rules.some((r) => r.template === 'tonogenesis-coda')) console.log('  tonogenesis-coda on edge ->', node.name);
}
console.log('  on THIS lineage:', chain.filter((id) => project.changeSetOf(id)?.rules.some((r) => r.template === 'tonogenesis-coda')).map((id) => byId.get(id).name));
console.log('  final-consonant-loss on this lineage:', chain.filter((id) => project.changeSetOf(id)?.rules.some((r) => r.template === 'final-consonant-loss')).map((id) => `${byId.get(id).name}(${project.changeSetOf(id).rules.filter((r)=>r.template==='final-consonant-loss').map((r)=>r.label).join(';')})`));

function fold(segs) {
    let cur = markStress(segs, proto.phonotactics);
    let pt = proto.phonotactics;
    for (const id of chain) {
        const cs = project.changeSetOf(id);
        if (!cs) continue;
        const res = evolveWord(cur, cs.rules, { rootId: 'X', rank: 300, pos: 'n', domain: 'x' });
        cur = repairClusters(repairHiatus(res.segments, pt), pt);
        pt = project.stateOf(id).phonotactics;
    }
    return cur;
}

const stems = proto.entries.filter((e) => e.pos === 'n' && isVowel(e.form[e.form.length - 1])).slice(0, 40);
let sDistinct = 0, sToned = 0, sSegmental = 0, hDistinct = 0, hToned = 0;
const samples = [];
for (const st of stems) {
    const bare = fold(st.form);
    const wS = fold([...st.form, ...parseWord('s')]);
    const wH = fold([...st.form, ...parseWord('h')]);
    const bi = wordToIpa(bare), si = wordToIpa(wS), hi = wordToIpa(wH);
    if (si !== bi) sDistinct++;
    if (hi !== bi) hDistinct++;
    if (wS[wS.length - 1] && !isVowel(wS[wS.length - 1])) sSegmental++;
    if (wS.some((p) => p.f.tone) && !bare.some((p) => p.f.tone)) sToned++;
    if (wH.some((p) => p.f.tone) && !bare.some((p) => p.f.tone)) hToned++;
    if (samples.length < 6) samples.push(`   *${st.ipa} -> ${bi}   *${st.ipa}-s -> ${si}   *${st.ipa}-h -> ${hi}`);
}
console.log(`\n*-s distinct from bare: ${sDistinct}/40; still ends in a consonant: ${sSegmental}/40; gained tone the bare form lacks: ${sToned}/40`);
console.log(`*-h distinct from bare: ${hDistinct}/40; gained tone: ${hToned}/40`);
console.log(samples.join('\n'));
