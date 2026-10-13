/**
 * The scorecard: the one table every review gate looks at.
 *
 *   node scripts/lang-scorecard.js
 *   node scripts/lang-scorecard.js --save before.json
 *   node scripts/lang-scorecard.js --compare before.json
 *   node scripts/lang-scorecard.js --no-regularity      (skips the slow blind comparative method)
 *
 * Every family is derived once and measured over its LIVING LEAVES, the
 * languages a reader actually meets, against an Earth band or an explicit
 * target. It exists because the overhaul's faults were each found by a
 * different script, and a fix judged by one of them could quietly break what
 * another one watches. Here they sit side by side:
 *
 *   - word shape: vowelless and single-consonant words, homophony, length;
 *   - regularity, two ways. IRREGULAR WORDS is read off the derivations: the
 *     share of inherited core words that went through anything other than
 *     regular sound change (a sporadic change, a word escaping a change that
 *     caught its neighbours, analogy, a frequency reduction, a merger sweep).
 *     The BLIND score is the comparative method run on four leaves
 *     (lang-correspond.js); it needs all four to agree on every slot, and even
 *     with every sporadic process switched off it reaches only about 52%, so it
 *     is reported for information and is not held to the Earth band;
 *   - sound systems: inventory sizes counted with one ruler for proto and
 *     daughters, and the marked series the shared catalogue tends to spread to
 *     every family, with the edges where each series appears and disappears;
 *   - structure and integrity: living languages that stop changing at birth,
 *     cross-family contact that delivers nothing, broken characters, orphaned
 *     meanings, learned loans identical to the native word.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createProject } from '../js/engine/project.js';
import { familyInputs } from './world.js';
import { syllabify } from '../js/engine/phonology/phonotactics.js';
import {
    inventoryCounts, seriesOf, SERIES, isVowelless, isSingleConsonant, isSubMinimal,
    vowelCount, liveLexemes,
} from './measures.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const doc = JSON.parse(fs.readFileSync(path.join(root, 'data/languages.json'), 'utf8'));
const configs = JSON.parse(fs.readFileSync(path.join(root, 'data/lang-config.json'), 'utf8'));

const args = process.argv.slice(2);
const argVal = (n) => { const i = args.indexOf(`--${n}`); return i === -1 ? null : args[i + 1]; };
const withRegularity = !args.includes('--no-regularity');

const byId = new Map(doc.languages.map((l) => [l.id, l]));
const rootOf = (l) => { let c = l; while (c.parentId) c = byId.get(c.parentId); return c.id; };
const pct = (n, d) => (d ? +(100 * n / d).toFixed(1) : 0);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

const families = Object.entries(configs)
    .filter(([id]) => !id.startsWith('_'))
    .map(([id, cfg]) => ({ id, cfg, tree: doc.languages.filter((l) => rootOf(l) === id) }))
    .filter((f) => f.tree.length);

const isLeafIn = (tree, l) => !tree.some((x) => x.parentId === l.id);
const livingLeavesOf = (tree) => tree.filter((l) => isLeafIn(tree, l) && l.died == null && !l.diverged);

// ---------------------------------------------------------------------------
// Regularity runs in child processes while this one derives the families.
// ---------------------------------------------------------------------------

function regularityOf(famId) {
    return new Promise((resolve) => {
        const child = spawn(process.execPath, [path.join(root, 'scripts/lang-correspond.js'), '--family', famId], { cwd: root });
        let out = '';
        child.stdout.on('data', (d) => { out += d; });
        child.on('close', () => {
            const m = out.match(/Regularity: ([\d.]+)%/);
            resolve(m ? Number(m[1]) : null);
        });
        child.on('error', () => resolve(null));
    });
}
const regularity = Object.fromEntries(families.map((f) => [f.id,
    withRegularity && livingLeavesOf(f.tree).length >= 2 ? regularityOf(f.id) : Promise.resolve(null)]));

// ---------------------------------------------------------------------------
// Per-family measurement
// ---------------------------------------------------------------------------

const results = {};
const ratchet = Object.fromEntries(Object.keys(SERIES).map((k) => [k, { appear: 0, disappear: 0 }]));
const started = Date.now();

for (const f of families) {
    const project = createProject({
        tree: f.tree,
        names: f.tree.map((l) => l.name),
        config: { ...f.cfg, rootId: f.id, presentYear: doc.config.presentYear },
        ...familyInputs(f.id), borrowings: doc.borrowings || [],
    });
    const stateOf = (id) => { try { return project.stateOf(id); } catch { return null; } };
    const proto = stateOf(f.id);
    const leaves = livingLeavesOf(f.tree);

    // The concept list as generated: the meanings every language starts out with.
    const coreGlosses = [...new Set((proto.founding ?? proto).entries.filter((e) => e.core && !e.paradigm && !e.derivedFrom && !e.retired).map((e) => e.gloss))];

    const w = { core: 0, noV: 0, oneC: 0, coreHomo: 0, coreHomoSub: 0, lex: 0, lexHomo: 0, worst: 0, syl: [], mono: 0, clusterWords: 0, orphans: 0, inherited: 0, irregular: 0 };

    /** Every rule on every edge of the family, so a history step can be traced to its rule. */
    const ruleById = new Map();
    for (const n of f.tree) {
        const st = stateOf(n.id);
        for (const r of st?.changeSet?.rules || []) ruleById.set(r.id, r);
    }
    const SPORADIC_STEP = /-(tidy|reduce)$/;
    const isIrregularStep = (step) => {
        if (step.applied === false) return true;                  // escaped a change that caught its neighbours
        if (step.category === 'analogy') return true;
        if (SPORADIC_STEP.test(String(step.ruleId))) return true;
        const rule = ruleById.get(step.ruleId);
        return rule != null && rule.probability != null && rule.probability < 1;
    };
    const leafCounts = [];
    const leafSeries = [];
    const toneLevels = new Set();

    for (const leaf of leaves) {
        const st = stateOf(leaf.id);
        if (!st) continue;
        const live = liveLexemes(st);
        const byForm = new Map();
        for (const e of live) byForm.set(e.ipa, (byForm.get(e.ipa) || 0) + 1);
        w.worst = Math.max(w.worst, ...byForm.values());
        w.lex += live.length;
        w.lexHomo += live.filter((e) => byForm.get(e.ipa) > 1).length;
        for (const e of live) {
            const sylls = syllabify(e.form, st.phonotactics);
            if (sylls.some((s) => (s.appendix || []).length + s.onset.length > 1)) w.clusterWords += 1;
        }
        const core = live.filter((e) => e.core);
        w.core += core.length;
        for (const e of core) {
            if (isVowelless(e)) w.noV += 1;
            if (isSingleConsonant(e)) w.oneC += 1;
            if (byForm.get(e.ipa) > 1) { w.coreHomo += 1; if (isSubMinimal(e)) w.coreHomoSub += 1; }
            const v = vowelCount(e);
            w.syl.push(v);
            if (v === 1) w.mono += 1;
        }
        for (const e of core) {
            if (e.loan || e.compoundOf || e.derivedFrom) continue;
            const h = st.histories.get(e.id);
            if (!h) continue;
            w.inherited += 1;
            if (h.steps.some(isIrregularStep)) w.irregular += 1;
        }
        const carriers = new Set(live.map((e) => e.gloss));
        w.orphans += coreGlosses.filter((g) => !carriers.has(g)).length;

        leafCounts.push(inventoryCounts(st.inventory));
        leafSeries.push(seriesOf(st.inventory));
        for (const v of st.inventory.vowels) if (v.f.tone != null && v.f.tone !== 0) toneLevels.add(v.f.tone);
    }

    /**
     * The ratchet: on every edge, does a series appear (the language as it
     * was founded lacks it, the language at the end of its life has it) or
     * disappear? Each language owns one edge, its own lifetime.
     */
    const edgePairs = [];
    for (const n of f.tree) {
        const st = stateOf(n.id);
        if (st?.founding && st.changeSet) edgePairs.push([st.founding, st]);
    }
    for (const [a, b] of edgePairs) {
        const sa = seriesOf(a.inventory), sb = seriesOf(b.inventory);
        for (const k of Object.keys(SERIES)) {
            if (!sa[k] && sb[k]) ratchet[k].appear += 1;
            if (sa[k] && !sb[k]) ratchet[k].disappear += 1;
        }
    }

    // Structure and integrity, over every node.
    let learnedIdentical = 0, frozenLiving = 0;
    const frozenNames = [];
    for (const n of f.tree) {
        const st = stateOf(n.id);
        if (!st) continue;
        const ids = new Map(st.entries.map((e) => [e.id, e]));
        for (const e of st.entries) {
            if (e.loan?.learned) {
                const native = ids.get(String(e.id).split(':').slice(4).join(':'));
                if (native && native.ipa === e.ipa) learnedIdentical += 1;
            }
        }
        const living = n.died == null && !n.diverged;
        if (living && !isLeafIn(f.tree, n) && !(st.changeSet?.to >= doc.config.presentYear)) {
            frozenLiving += 1;
            frozenNames.push(`${n.name} (${doc.config.presentYear - n.born} yrs)`);
        }
    }

    // Contact from outside the family, and how many words it delivered.
    const inFamily = new Set(f.tree.map((l) => l.id));
    const foreign = (doc.borrowings || []).filter((b) => inFamily.has(b.toId) && !inFamily.has(b.fromId));
    const foreignIds = new Set(foreign.map((b) => b.id));
    let foreignWords = 0;
    for (const n of f.tree) {
        const st = stateOf(n.id);
        foreignWords += (st?.entries || []).filter((e) => foreignIds.has(e.loan?.borrowingId)).length;
    }

    const protoCounts = inventoryCounts(proto.inventory);
    results[f.id] = {
        family: f.cfg.name || f.id,
        leaves: leaves.length,
        noV: pct(w.noV, w.core),
        oneC: pct(w.oneC, w.core),
        coreHomo: pct(w.coreHomo, w.core),
        subMinShare: pct(w.coreHomoSub, w.coreHomo),
        lexHomo: pct(w.lexHomo, w.lex),
        worst: w.worst,
        syl: +mean(w.syl).toFixed(2),
        mono: pct(w.mono, w.core),
        clusters: pct(w.clusterWords, w.lex),
        irregular: pct(w.irregular, w.inherited),
        regular: null,
        orphans: w.orphans,
        cProto: protoCounts.consonants,
        cLeaves: +mean(leafCounts.map((c) => c.consonants)).toFixed(1),
        vProto: protoCounts.qualities,
        vLeaves: +mean(leafCounts.map((c) => c.qualities)).toFixed(1),
        phoibleProto: protoCounts.phoibleSize,
        phoibleLeaves: +mean(leafCounts.map((c) => c.phoibleSize)).toFixed(1),
        toneLevels: toneLevels.size,
        series: Object.fromEntries(Object.keys(SERIES).map((k) => [k, pct(leafSeries.filter((s) => s[k]).length, leafSeries.length)])),
        frozenLiving,
        frozenNames,
        learnedIdentical,
        foreignArrows: foreign.length,
        foreignWords,
    };
}
const deriveSecs = ((Date.now() - started) / 1000).toFixed(0);
for (const f of families) results[f.id].regular = await regularity[f.id];

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const compareTo = argVal('compare');
const prev = compareTo && fs.existsSync(compareTo) ? JSON.parse(fs.readFileSync(compareTo, 'utf8')) : null;
const prevOf = (id, k) => (prev?.[id] ? k.split('.').reduce((o, p) => o?.[p], prev[id]) : undefined);
const valOf = (v, k) => k.split('.').reduce((o, p) => o?.[p], v);

function table(title, cols, note) {
    console.log(`\n${title}`);
    console.log('family'.padEnd(16) + cols.map(([, label, w]) => label.padStart(w)).join(''));
    console.log('─'.repeat(16 + cols.reduce((n, [, , w]) => n + w, 0)));
    for (const [id, v] of Object.entries(results)) {
        let line = String(v.family).slice(0, 15).padEnd(16);
        for (const [k, , w] of cols) {
            const now = valOf(v, k);
            const was = prevOf(id, k);
            let cell = now == null ? '-' : String(now);
            if (was != null && now != null && was !== now) cell += now > was ? '↑' : '↓';
            line += cell.padStart(w);
        }
        console.log(line);
    }
    if (note) console.log(note);
}

table('WORDS (core vocabulary of living leaves)', [
    ['leaves', 'leaves', 7], ['noV', 'noV%', 8], ['oneC', '1C%', 7], ['coreHomo', 'cHomo%', 9],
    ['subMinShare', 'subMin%', 9], ['lexHomo', 'lHomo%', 9], ['worst', 'worst', 7],
    ['syl', 'syl/w', 7], ['mono', 'mono%', 8], ['clusters', 'clust%', 8], ['irregular', 'irreg%', 8], ['regular', 'blind%', 8], ['orphans', 'orph', 6],
], `Targets: noV% and 1C% 0 (Earth: vowelless words are rare and never the norm); cHomo% (core words sharing a
form with another word) 15 or less; lHomo% (all words) 20 or less; irreg% (inherited core words touched by
anything but regular sound change) 20 or less; orph (core meanings with no word) 0. blind% = the comparative
method on four leaves, for information (about 52% is its ceiling here). subMin% = share of core homophony
carried by words below CV.`);

table('SOUNDS (proto → mean of living leaves; one ruler for both)', [
    ['cProto', 'C.p', 5], ['cLeaves', 'C.l', 6], ['vProto', 'Vq.p', 6], ['vLeaves', 'Vq.l', 6],
    ['phoibleProto', 'Ph.p', 6], ['phoibleLeaves', 'Ph.l', 6], ['toneLevels', 'tones', 7],
    ...Object.keys(SERIES).map((k) => [`series.${k}`, { aspirates: 'asp%', palatalAffricates: 'tɕ%', schwa: 'ə%', h: 'h%', tone: 'tone%', frontRounded: 'y%' }[k], 7]),
], `Series columns: share of living leaves that have the series. Earth: most families keep some branches without
each marked series, and tonal families have 2+ levels. C/Vq = consonants / vowel qualities; Ph = PHOIBLE-style
(long and nasal vowels as segments, tone counted per level). Earth: WALS mean about 25, bulk 20-37.`);

const cells = Object.values(results).flatMap((v) => Object.values(v.series));
const hot = cells.filter((x) => x >= 80).length;
console.log(`\nFamily × series cells at 80%+ of leaves: ${hot}/${cells.length}   (target: half of the baseline or fewer)`);
console.log('Ratchet, edges where a series appears : disappears   (target: every series can be lost; roughly 0.7-3 : 1)');
for (const [k, r] of Object.entries(ratchet)) {
    const ratio = r.disappear ? (r.appear / r.disappear).toFixed(1) : (r.appear ? '∞' : '-');
    console.log(`  ${k.padEnd(18)} ${String(r.appear).padStart(4)} : ${String(r.disappear).padEnd(4)}  ${ratio}`);
}

console.log('\nSTRUCTURE AND INTEGRITY   (targets: all 0, and cross-family arrows deliver words)');
for (const v of Object.values(results)) {
    const bits = [
        `frozen living parents ${v.frozenLiving}${v.frozenNames.length ? ` [${v.frozenNames.slice(0, 3).join(', ')}${v.frozenNames.length > 3 ? ', …' : ''}]` : ''}`,
        `learned = native ${v.learnedIdentical}`,
        `cross-family arrows ${v.foreignArrows} → ${v.foreignWords} words`,
    ];
    console.log(`  ${String(v.family).padEnd(16)} ${bits.join('   ')}`);
}
console.log(`\nDerived in ${deriveSecs}s${withRegularity ? ' (regularity in parallel)' : ''}.`);
if (prev) console.log('Arrows mark movement against the saved scorecard.');

const save = argVal('save');
if (save) {
    fs.writeFileSync(save, JSON.stringify({ ...results, _ratchet: ratchet }, null, 2));
    console.log(`Saved to ${save}`);
}
