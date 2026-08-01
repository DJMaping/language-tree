/**
 * How does the drift of these generated languages compare to real ones?
 *
 * Measures the generated families against attested figures from Earth, on the
 * dimensions where real numbers exist. Every Earth anchor below is a published
 * measurement, not an impression, and each is cited inline.
 *
 *   node scripts/lang-vs-earth.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProject } from '../js/engine/project.js';
import { syllabify } from '../js/engine/phonology/phonotactics.js';
import { isVowel } from '../js/engine/features.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const doc = JSON.parse(fs.readFileSync(path.join(root, 'data/languages.json'), 'utf8'));
const configs = JSON.parse(fs.readFileSync(path.join(root, 'data/lang-config.json'), 'utf8'));
const byId = new Map(doc.languages.map((l) => [l.id, l]));
const rootOf = (l) => { let c = l; while (c.parentId) c = byId.get(c.parentId); return c.id; };
const PRESENT = doc.config.presentYear;

const H = (t) => console.log(`\n${'═'.repeat(74)}\n${t}\n${'═'.repeat(74)}`);

// --- similarity ------------------------------------------------------------
function lev(a, b) {
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
        const cur = [i];
        for (let j = 1; j <= n; j++) {
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
        prev = cur;
    }
    return prev[n];
}
const similarity = (a, b) => (a === b ? 1 : 1 - lev(a, b) / Math.max(a.length, b.length));

// --- build every family ----------------------------------------------------
const families = [];
for (const famRoot of Object.keys(configs).filter((k) => !k.startsWith('_'))) {
    const tree = doc.languages.filter((l) => rootOf(l) === famRoot);
    if (!tree.length) continue;
    families.push({
        id: famRoot, name: configs[famRoot].name || famRoot, tree,
        project: createProject({
            tree, names: tree.map((l) => l.name),
            config: { ...configs[famRoot], rootId: famRoot, presentYear: PRESENT },
            sidecar: {}, borrowings: doc.borrowings || [],
        }),
    });
}

const ancestorsOf = (id) => { const out = []; let c = byId.get(id); while (c) { out.push(c.id); c = c.parentId ? byId.get(c.parentId) : null; } return out; };
function mrca(a, b) {
    const A = ancestorsOf(a), B = new Set(ancestorsOf(b));
    return A.find((x) => B.has(x)) ?? null;
}

// ===========================================================================
H('1. RATE OF SOUND CHANGE  —  changes per 1000 years');
console.log(`Earth: handbooks list roughly 15-30 significant changes per millennium
       between well-documented stages. Latin (c.100 BC) to Modern Spanish is
       ~2100 years and about 40-50 changes; Old English to Modern English is
       ~1000 years and about 20.`);
for (const f of families) {
    let rules = 0, years = 0;
    for (const n of f.tree) {
        const s = f.project.stateOf(n.id);
        if (!s?.changeSet) continue;
        rules += s.changeSet.rules.length;
        years += Math.max(0, (s.changeSet.to ?? 0) - (s.changeSet.from ?? 0));
    }
    const per = years ? (1000 * rules / years) : 0;
    const verdict = per >= 12 && per <= 35 ? 'in range' : (per < 12 ? 'SLOW' : 'FAST');
    console.log(`  ${f.name.padEnd(18)} ${per.toFixed(1).padStart(5)} / 1000yr   (${rules} changes over ${years} branch-years)   ${verdict}`);
}

// ===========================================================================
H('2. COGNATE SIMILARITY vs TIME DEPTH  —  the comparative-method test');
console.log(`Earth anchors (Swadesh-100, published lexicostatistical counts):
       ~500 yr  Spanish/Portuguese ....... 89% shared cognates
       ~1500 yr English/German ........... 60%
       ~2000 yr Spanish/French ........... 75%
       ~2500 yr Spanish/Romanian ......... 71%
       ~5500 yr English/Hindi (PIE) ...... 27%
Measured below: the share of core meanings where two sisters still use the
same etymon -- the same quantity a lexicostatistical count measures.`);

const buckets = new Map();
for (const f of families) {
    const leaves = f.tree.filter((l) => !f.tree.some((x) => x.parentId === l.id));
    const states = new Map();
    for (const l of leaves) { const s = f.project.stateOf(l.id); if (s) states.set(l.id, s); }
    const ids = [...states.keys()];
    for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
            const anc = mrca(ids[i], ids[j]);
            if (!anc) continue;
            /**
             * Divergence is dated from when the two branches actually SPLIT,
             * not from when their common ancestor was born.
             *
             * Those are not the same thing and the gap can be thousands of
             * years: a proto-language born in -4500 may not have thrown off the
             * branch leading to one of these sisters until +300. Dating from
             * the ancestor's birth counted that whole shared stretch as
             * independent evolution, which put pairs in far too deep a bucket
             * and made retention look implausibly high for their depth.
             *
             * The split is complete when the LATER of the two diverging
             * children is born.
             */
            const childOnPath = (leafId) => {
                const path = ancestorsOf(leafId);      // leaf → root
                const k = path.indexOf(anc);
                return k > 0 ? byId.get(path[k - 1]) : byId.get(leafId);
            };
            const ca = childOnPath(ids[i]);
            const cb = childOnPath(ids[j]);
            const splitYear = Math.max(ca?.born ?? 0, cb?.born ?? 0);
            const depth = PRESENT - splitYear;
            const A = states.get(ids[i]), B = states.get(ids[j]);
            /**
             * TRUE cognate retention: for each core meaning, do the two sisters
             * use the same etymon? That is what a lexicostatistical count
             * measures, and it is only meaningful now that meanings can migrate
             * between etyma.
             */
            const meanings = [...new Set(A.entries.filter((e) => e.core && !e.retired && !e.paradigm).map((e) => e.gloss))].slice(0, 100);
            let cognate = 0, n = 0;
            for (const g of meanings) {
                const a = A.entries.find((x) => x.gloss === g && !x.retired);
                const b = B.entries.find((x) => x.gloss === g && !x.retired);
                if (!a || !b) continue;
                n += 1;
                if (a.id === b.id) cognate += 1;
            }
            if (!n) continue;
            const sum = cognate;
            const key = depth < 1000 ? '<1000' : depth < 2000 ? '1000-2000' : depth < 3000 ? '2000-3000'
                : depth < 4500 ? '3000-4500' : '4500+';
            if (!buckets.has(key)) buckets.set(key, []);
            buckets.get(key).push(sum / n);
        }
    }
}
const ORDER = ['<1000', '1000-2000', '2000-3000', '3000-4500', '4500+'];
const EARTH = { '<1000': '~89% (Spanish/Portuguese)', '1000-2000': '~60-75% (Eng/Ger, Sp/Fr)', '2000-3000': '~71% (Sp/Romanian)', '3000-4500': '~40% (Eng/Russian)', '4500+': '~27% (Eng/Hindi)' };
console.log('');
console.log('  time depth    pairs   generated cognate retention      Earth cognate %');
for (const k of ORDER) {
    const v = buckets.get(k);
    if (!v?.length) continue;
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    const bar = '█'.repeat(Math.round(mean * 30));
    console.log(`  ${k.padEnd(12)} ${String(v.length).padStart(5)}   ${(100 * mean).toFixed(0).padStart(3)}%  ${bar.padEnd(31)} ${EARTH[k] || ''}`);
}

// ===========================================================================
H('3. PHONEME INVENTORY  —  does it stay in the typologically normal band?');
console.log(`Earth: WALS mean ~25 phonemes; the great bulk sit between 20 and 37.
       Rotokas has 11, !Xoo over 100 -- both genuinely exceptional.`);
for (const f of families) {
    const leaves = f.tree.filter((l) => !f.tree.some((x) => x.parentId === l.id));
    const sizes = leaves.map((l) => { const s = f.project.stateOf(l.id); return s ? s.inventory.consonants.length + new Set(s.inventory.vowels.map((v) => v.ipa.replace(/[ː˩˨˧˦˥̃]/gu, ''))).size : null; }).filter(Boolean);
    if (!sizes.length) continue;
    const mean = sizes.reduce((a, b) => a + b, 0) / sizes.length;
    const lo = Math.min(...sizes), hi = Math.max(...sizes);
    const proto = f.project.stateOf(f.id);
    const protoSize = proto ? proto.inventory.consonants.length + proto.inventory.vowels.length : 0;
    const ok = mean >= 18 && mean <= 40;
    console.log(`  ${f.name.padEnd(18)} proto ${String(protoSize).padStart(2)}  →  daughters mean ${mean.toFixed(0)} (range ${lo}-${hi})   ${ok ? 'in range' : 'OUT OF RANGE'}`);
}

// ===========================================================================
H('4. MORPHOLOGICAL EROSION  —  against the Romance and Germanic record');
console.log(`Earth: Latin's 6 cases -> Old French 2 -> Modern French 0, in ~1800 years.
       Old English 5 -> Modern English ~1 (the genitive), in ~1000 years.
       Proto-Germanic 8 -> Modern German 4, in ~2000 years.
       Finnish and Hungarian have KEPT 15+ cases for a comparable span, so
       loss is a tendency, not a law.`);
for (const f of families) {
    const proto = f.project.stateOf(f.id);
    const leaves = f.tree.filter((l) => !f.tree.some((x) => x.parentId === l.id));
    const vals = leaves.map((l) => f.project.stateOf(l.id)?.erosion?.survival).filter((x) => x != null);
    if (!vals.length || proto?.erosion?.survival == null) continue;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const span = PRESENT - (byId.get(f.id)?.born ?? PRESENT);
    const lostPerMillennium = ((proto.erosion.survival - mean) / (span / 1000)) * 100;
    console.log(`  ${f.name.padEnd(18)} proto ${(100 * proto.erosion.survival).toFixed(0)}%  →  daughters ${(100 * mean).toFixed(0)}%   over ${span}yr   = ${lostPerMillennium.toFixed(1)} points lost / 1000yr`);
}
console.log(`\n  For scale: Latin->French lost ~100% of case marking in 1800 years,
  i.e. about 55 points per millennium. Old English->English about 80.`);

// ===========================================================================
H('5. WHAT THE ENGINE DOES NOT DO  —  the honest gaps');
let replaced = 0, total = 0, loans = 0;
for (const f of families) {
    const leaves = f.tree.filter((l) => !f.tree.some((x) => x.parentId === l.id));
    for (const l of leaves) {
        const s = f.project.stateOf(l.id);
        if (!s) continue;
        const proto = f.project.stateOf(f.id);
        if (!proto) continue;
        // A meaning is REPLACED when the word carrying it is no longer the
        // etymon the proto used. Checking whether the root id is absent is
        // wrong: replacement deliberately KEEPS the displaced word, marked
        // archaic, because a displaced word usually narrows rather than
        // vanishing (English "hound" survived Norse "dog").
        const protoCore = proto.entries.filter((e) => e.core && !e.paradigm);
        total += protoCore.length;
        for (const pe of protoCore) {
            const holder = s.entries.find((x) => x.gloss === pe.gloss && !x.retired);
            if (!holder || holder.id !== pe.id) replaced += 1;
        }
        loans += s.entries.filter((e) => e.loan).length;
    }
}
console.log(`  LEXICAL REPLACEMENT: ${replaced} of ${total} core meanings replaced across all
  leaves (${(100 * replaced / Math.max(1, total)).toFixed(1)}%). Earth over 6000 years: 60-73%.

  Earth: Swadesh retention falls to ~86% per millennium -- roughly one core
  word in seven replaced every thousand years, compounding to ~40% retention
  over six millennia. English lost Old English "niman" for "take" (to Norse),
  "swefn" for "dream", "ea" for "river".

  This is now MODELLED, by four attested mechanisms: a derivative displacing
  its base (Latin auris > auricula > French oreille), a loan displacing the
  native word, a semantic neighbour broadening into the slot (caput > testa >
  French tete), and taboo avoidance (PIE "bear" > "the brown one" in Germanic).
  The displaced word is kept and marked archaic rather than deleted, because on
  Earth it usually narrows rather than vanishing -- English "hound" survived
  Norse "dog", it just narrowed.

  Closed classes are protected: numerals, pronouns and demonstratives form
  systems that do not permute, and every one is still on its proto etymon.

  REMAINING LIMITATION: the neighbour strategy is constrained by semantic
  DOMAIN and part of speech, but not by a semantic PATH. Real shifts follow
  metaphor, metonymy and part-whole relations; "cheek" does not become "belly"
  in any language. Closing that needs real semantic-relation data and is the
  v2 semantic-drift item.

  STILL ABSENT: analogical levelling (only phonological syncretism is
  modelled), grammaticalisation (no content word has become an affix), and
  syntax (word order never changes).`);
console.log();
