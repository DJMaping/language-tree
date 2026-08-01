/**
 * Probe 2: project a synthetic 6-case x 2-number paradigm down each family and
 * measure NOT just "cells still distinct" but the things that decide whether the
 * result is a language: stem allomorphy, exponence uniformity within a class,
 * and whether the syncretisms that do occur are typologically shaped.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createProject } from './js/engine/project.js';
import { evolveWord } from './js/engine/soundchange/apply.js';
import { markStress, repairHiatus, repairClusters, syllabify } from './js/engine/phonology/phonotactics.js';
import { wordToIpa, wordToIpaStressed, isVowel, parseWord } from './js/engine/features.js';
import { derive } from './js/engine/rng.js';

const root = 'C:/Users/danny/Desktop/Andah games/language-tree';
const doc = JSON.parse(fs.readFileSync(path.join(root, 'data/languages.json'), 'utf8'));
const configs = JSON.parse(fs.readFileSync(path.join(root, 'data/lang-config.json'), 'utf8'));
const byId = new Map(doc.languages.map((l) => [l.id, l]));
const rootOf = (l) => { let c = l; while (c.parentId) c = byId.get(c.parentId); return c.id; };

const CELLS = ['NOM.SG', 'ACC.SG', 'GEN.SG', 'DAT.SG', 'LOC.SG', 'INS.SG',
               'NOM.PL', 'ACC.PL', 'GEN.PL', 'DAT.PL', 'LOC.PL', 'INS.PL'];

/** Deterministic 12 endings from the proto's own segments. NOM.SG is zero. */
function makeEndings(proto, rng) {
    const cons = proto.inventory.consonants.filter((c) => ['stop', 'nasal', 'fricative', 'trill', 'lateral'].includes(c.f.manner));
    const vows = proto.inventory.vowels.filter((v) => !v.f.long);
    const used = new Set(['']);
    const out = new Map([['NOM.SG', []]]);
    for (const cell of CELLS.slice(1)) {
        for (let i = 0; i < 200; i++) {
            const c = rng.pick(cons); const v = rng.pick(vows);
            const cand = rng.bool(0.75) ? [c, v] : [v];
            const key = wordToIpa(cand);
            if (used.has(key)) continue;
            used.add(key); out.set(cell, cand); break;
        }
        if (!out.has(cell)) out.set(cell, [rng.pick(cons), rng.pick(vows)]);
    }
    return out;
}

/** Plain concatenation (no repairJoin) so the experiment measures sound change only. */
function inflect(stem, ending, pt) {
    return markStress([...stem, ...ending], pt);
}

function lineageOf(project, leafId) {
    const chain = [];
    let node = project.nodeOf(leafId);
    while (node?.parentId) { chain.unshift(node.id); node = project.nodeOf(node.parentId); }
    return chain;
}

function project12(project, protoState, chain, stem, endings) {
    const pt0 = protoState.phonotactics;
    const forms = new Map();
    for (const cell of CELLS) {
        let cur = inflect(stem, endings.get(cell), pt0);
        let pt = pt0;
        for (const stageId of chain) {
            const cs = project.changeSetOf(stageId);
            if (!cs) continue;
            const res = evolveWord(cur, cs.rules, { rootId: 'X', rank: 300, pos: 'n', domain: 'x' });
            cur = repairClusters(repairHiatus(res.segments, pt), pt);
            const st = project.stateOf(stageId);
            pt = st.phonotactics;
        }
        forms.set(cell, wordToIpa(cur));
    }
    return forms;
}

/** Longest common prefix over the 12 realised forms = the surviving stem. */
function stemAllomorphs(forms, endings) {
    // Approximate: strip the realised NOM.SG (zero-ending) form's material where possible.
    const vals = [...forms.values()];
    let lcp = vals[0];
    for (const v of vals) { let i = 0; while (i < lcp.length && i < v.length && lcp[i] === v[i]) i++; lcp = lcp.slice(0, i); }
    const stems = new Set();
    for (const v of vals) stems.add(lcp);
    // Better measure: per-cell prefix that is shared with NOM.SG
    const base = forms.get('NOM.SG');
    const shapes = new Set();
    for (const [, v] of forms) {
        let i = 0; while (i < base.length && i < v.length && base[i] === v[i]) i++;
        shapes.add(base.slice(0, i));
    }
    return { lcp, distinctSharedPrefixes: shapes.size };
}

const REPORT = [];

for (const [famRoot, cfg] of Object.entries(configs)) {
    if (famRoot.startsWith('_')) continue;
    const tree = doc.languages.filter((l) => rootOf(l) === famRoot);
    if (!tree.length) continue;
    const project = createProject({
        tree, names: tree.map((l) => l.name),
        config: { ...cfg, rootId: famRoot, presentYear: doc.config.presentYear }, sidecar: {},
    });
    const proto = project.stateOf(famRoot);
    const rng = derive(cfg.seed || 'x', 'probe', 'endings');
    const endings = makeEndings(proto, rng);

    // deepest leaf
    const depthOf = (l) => { let d = 0, c = l; while (c.parentId) { d++; c = byId.get(c.parentId); } return d; };
    const leaves = tree.filter((l) => !tree.some((x) => x.parentId === l.id));
    const leaf = leaves.sort((a, b) => depthOf(b) - depthOf(a))[0];
    const chain = lineageOf(project, leaf.id);
    // force generation of every changeset on the chain
    project.stateOf(leaf.id);

    const nouns = proto.entries.filter((e) => e.pos === 'n' && e.class);
    const byClass = new Map();
    for (const n of nouns) { if (!byClass.has(n.class)) byClass.set(n.class, []); byClass.get(n.class).push(n); }

    const lines = [];
    for (const [cls, list] of [...byClass].sort()) {
        const sample = list.slice(0, 20);
        if (sample.length < 5) continue;
        let distinctSum = 0;
        const patterns = new Set();
        const endingSetsPerCell = new Map(CELLS.map((c) => [c, new Set()]));
        let prefixShapesSum = 0;
        let nonContiguous = 0, totalMergers = 0, crossNumberMergers = 0;
        for (const st of sample) {
            const forms = project12(project, proto, chain, st.form, endings);
            const vals = [...forms.values()];
            distinctSum += new Set(vals).size;
            // syncretism partition signature
            const groups = new Map();
            CELLS.forEach((c, i) => { const v = forms.get(c); if (!groups.has(v)) groups.set(v, []); groups.get(v).push(c); });
            patterns.add([...groups.values()].map((g) => g.join('=')).sort().join('|'));
            for (const g of groups.values()) {
                if (g.length < 2) continue;
                totalMergers += g.length - 1;
                const numbers = new Set(g.map((c) => c.split('.')[1]));
                if (numbers.size > 1) crossNumberMergers += g.length - 1;
            }
            // exponence: what remains after stripping the shared prefix with NOM.SG
            const base = forms.get('NOM.SG');
            for (const c of CELLS) {
                const v = forms.get(c);
                let i = 0; while (i < base.length && i < v.length && base[i] === v[i]) i++;
                endingSetsPerCell.get(c).add(v.slice(i));
            }
            prefixShapesSum += stemAllomorphs(forms, endings).distinctSharedPrefixes;
        }
        const n = sample.length;
        const meanDistinct = distinctSum / n;
        // exponence uniformity: mean number of distinct surface exponents per cell across the class
        const exponents = CELLS.map((c) => endingSetsPerCell.get(c).size);
        const meanExponents = exponents.reduce((a, b) => a + b, 0) / CELLS.length;
        lines.push(`   ${cls}  n=${n}  distinct ${meanDistinct.toFixed(2)}/12  patterns ${patterns.size}  exponents/cell ${meanExponents.toFixed(1)} (max ${Math.max(...exponents)})  stem-shapes/lexeme ${(prefixShapesSum / n).toFixed(1)}  mergers ${totalMergers} of which cross-number ${crossNumberMergers}`);
    }
    REPORT.push(`\n${cfg.name || famRoot}  (${cfg.stress || 'penultimate'}, leaf "${leaf.name}", ${chain.length} edges)\n   endings: ${CELLS.map((c) => `${c}=-${wordToIpa(endings.get(c)) || '∅'}`).join(' ')}\n${lines.join('\n')}`);
}

console.log(REPORT.join('\n'));
