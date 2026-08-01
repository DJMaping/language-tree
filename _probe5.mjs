/** Probe 5: are the engine's syncretisms typologically shaped? Pairwise, vs chance. */
import fs from 'node:fs';
import path from 'node:path';
import { createProject } from './js/engine/project.js';
import { evolveWord } from './js/engine/soundchange/apply.js';
import { markStress, repairHiatus, repairClusters } from './js/engine/phonology/phonotactics.js';
import { wordToIpa } from './js/engine/features.js';
import { derive } from './js/engine/rng.js';

const root = 'C:/Users/danny/Desktop/Andah games/language-tree';
const doc = JSON.parse(fs.readFileSync(path.join(root, 'data/languages.json'), 'utf8'));
const configs = JSON.parse(fs.readFileSync(path.join(root, 'data/lang-config.json'), 'utf8'));
const byId = new Map(doc.languages.map((l) => [l.id, l]));
const rootOf = (l) => { let c = l; while (c.parentId) c = byId.get(c.parentId); return c.id; };
const CELLS = ['NOM.SG','ACC.SG','GEN.SG','DAT.SG','LOC.SG','INS.SG','NOM.PL','ACC.PL','GEN.PL','DAT.PL','LOC.PL','INS.PL'];
const CASEORDER = { NOM:0, ACC:1, GEN:2, DAT:3, LOC:4, INS:5 };

let crossNum = 0, sameNum = 0, adjacentCase = 0, nonAdjacentCase = 0, totalPairs = 0;
const perFamily = [];

for (const [famRoot, cfg] of Object.entries(configs)) {
    if (famRoot.startsWith('_')) continue;
    const tree = doc.languages.filter((l) => rootOf(l) === famRoot);
    if (!tree.length) continue;
    const project = createProject({ tree, names: tree.map((l) => l.name),
        config: { ...cfg, rootId: famRoot, presentYear: doc.config.presentYear }, sidecar: {} });
    const proto = project.stateOf(famRoot);
    const rng = derive(cfg.seed || 'x', 'probe', 'endings');
    const cons = proto.inventory.consonants.filter((c) => ['stop','nasal','fricative','trill','lateral'].includes(c.f.manner));
    const vows = proto.inventory.vowels.filter((v) => !v.f.long);
    const used = new Set(['']); const endings = new Map([['NOM.SG', []]]);
    for (const cell of CELLS.slice(1)) {
        for (let i = 0; i < 200; i++) {
            const cand = rng.bool(0.75) ? [rng.pick(cons), rng.pick(vows)] : [rng.pick(vows)];
            const k = wordToIpa(cand); if (used.has(k)) continue; used.add(k); endings.set(cell, cand); break;
        }
        if (!endings.has(cell)) endings.set(cell, [rng.pick(cons), rng.pick(vows)]);
    }
    const depthOf = (l) => { let d = 0, c = l; while (c.parentId) { d++; c = byId.get(c.parentId); } return d; };
    const leaves = tree.filter((l) => !tree.some((x) => x.parentId === l.id));
    const leaf = leaves.sort((a, b) => depthOf(b) - depthOf(a))[0];
    project.stateOf(leaf.id);
    const chain = []; { let nn = leaf; while (nn?.parentId) { chain.unshift(nn.id); nn = byId.get(nn.parentId); } }

    let fCross = 0, fSame = 0;
    const nouns = proto.entries.filter((e) => e.pos === 'n' && e.class);
    const byClass = new Map();
    for (const nn of nouns) { if (!byClass.has(nn.class)) byClass.set(nn.class, []); byClass.get(nn.class).push(nn); }
    for (const [, list] of byClass) {
        for (const st of list.slice(0, 20)) {
            const forms = new Map();
            for (const cell of CELLS) {
                let cur = markStress([...st.form, ...endings.get(cell)], proto.phonotactics);
                let pt = proto.phonotactics;
                for (const id of chain) {
                    const cs = project.changeSetOf(id); if (!cs) continue;
                    const res = evolveWord(cur, cs.rules, { rootId: 'X', rank: 300, pos: 'n', domain: 'x' });
                    cur = repairClusters(repairHiatus(res.segments, pt), pt);
                    pt = project.stateOf(id).phonotactics;
                }
                forms.set(cell, wordToIpa(cur));
            }
            for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) {
                if (forms.get(CELLS[i]) !== forms.get(CELLS[j])) continue;
                const [ci, ni] = CELLS[i].split('.'); const [cj, nj] = CELLS[j].split('.');
                totalPairs++;
                if (ni === nj) { sameNum++; fSame++; } else { crossNum++; fCross++; }
                if (Math.abs(CASEORDER[ci] - CASEORDER[cj]) === 1 && ni === nj) adjacentCase++;
                else nonAdjacentCase++;
            }
        }
    }
    perFamily.push(`  ${(cfg.name || famRoot).padEnd(17)} syncretic pairs: same-number ${String(fSame).padStart(4)}  cross-number ${String(fCross).padStart(4)}  (${(100 * fCross / Math.max(1, fCross + fSame)).toFixed(0)}% cross-number)`);
}
console.log(perFamily.join('\n'));
console.log(`\nAll families: ${totalPairs} syncretic cell-pairs; ${(100*crossNum/totalPairs).toFixed(1)}% cross the SG/PL boundary.`);
console.log(`Chance baseline for an arbitrary cell-pair: ${(100*36/66).toFixed(1)}% cross-number.`);
console.log(`Same-number pairs adjacent on NOM>ACC>GEN>DAT>LOC>INS: ${adjacentCase} of ${sameNum} (${(100*adjacentCase/Math.max(1,sameNum)).toFixed(0)}%); chance = ${(100*10/30).toFixed(0)}%.`);
