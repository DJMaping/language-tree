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
import { familyInputs } from './world.js';
import { syllabify } from '../js/engine/phonology/phonotactics.js';
import { isVowel } from '../js/engine/features.js';
import { SWADESH_207 } from '../js/engine/lexicon/swadesh.js';
import { falseFriends } from '../js/engine/lexicon/semantics.js';
import { orthographicDepth } from '../js/engine/phonology/romanise.js';
import { inventoryCounts } from './measures.js';

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
            ...familyInputs(famRoot), borrowings: doc.borrowings || [],
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
       ~1000 years and about 20.

       But that band describes an AVERAGE, and the spread around it is the
       more interesting figure. Icelandic changed so little in a thousand
       years that modern speakers read the sagas; English over the same span
       was demolished. Both are Germanic. A family below the band is not
       necessarily wrong — it may be conservative, and conservatism is
       heritable, which is why whole lineages are slow rather than odd
       individual languages.

       So this section reports the SPREAD, and flags a family only when it
       sits outside what the branch-rate machinery can produce. Testing each
       family against one band would assert the uniformity that per-branch
       rates were built to destroy, and would report a false positive every
       time the draw did its job.`);

/**
 * The rate multiplier is drawn log-normally and clamped to [0.4, 2.2] in
 * `project.js`, on top of an interval drawn uniform(40,110). So the reachable
 * band for a whole family, once the per-edge draws average out, is roughly
 * 1000/(110/0.4) = 3.6 at the conservative end and 1000/(40/2.2) = 55 at the
 * fast end. Anything inside that is the machinery working; anything outside it
 * is a bug.
 */
const REACHABLE = [3.6, 55];
const rates = [];
for (const f of families) {
    let rules = 0, years = 0, rateSum = 0, edges = 0;
    for (const n of f.tree) {
        const s = f.project.stateOf(n.id);
        if (!s?.changeSet) continue;
        rules += s.changeSet.rules.length;
        years += Math.max(0, (s.changeSet.to ?? 0) - (s.changeSet.from ?? 0));
        rateSum += s.changeSet.rate ?? 1;
        edges += 1;
    }
    const per = years ? (1000 * rules / years) : 0;
    const branchRate = edges ? rateSum / edges : 1;
    rates.push({ name: f.name, per, branchRate });
    const verdict = per < REACHABLE[0] ? 'OUT OF REACH — too slow for the rate clamp'
        : per > REACHABLE[1] ? 'OUT OF REACH — too fast for the rate clamp'
            : branchRate < 0.8 ? 'conservative lineage'
                : branchRate > 1.3 ? 'innovating lineage'
                    : 'typical';
    console.log(`  ${f.name.padEnd(18)} ${per.toFixed(1).padStart(5)} / 1000yr   (${rules} changes over ${years} branch-years)`
        + `   mean branch rate ${branchRate.toFixed(2)}   ${verdict}`);
}

/**
 * The figure that actually matters: how wide the spread is.
 *
 * Earth's fastest well-documented lineage runs roughly three times its slowest
 * over a comparable span. A generated world where every family sits within a
 * few points of the mean has no conservative branches and no innovating ones,
 * which was precisely the defect realism plan 1 item 2 was written to fix.
 */
{
    const per = rates.map((r) => r.per).sort((a, b) => a - b);
    const ratio = per[0] > 0 ? per[per.length - 1] / per[0] : Infinity;
    console.log(`\n  Spread: ${per[0].toFixed(1)} to ${per[per.length - 1].toFixed(1)}`
        + `  =  ${ratio.toFixed(1)}x between the slowest and fastest family.`);
    console.log(ratio < 1.6
        ? '  TOO UNIFORM. Earth shows about 3x between Icelandic and English within one\n'
          + '  family; six families ought to spread at least that far. Branch-rate\n'
          + '  variation is not reaching the output.'
        : ratio > 8
            ? '  TOO WIDE — one family is an outlier rather than a conservative lineage.'
            : '  in range — the families have different characters, which is the point.');
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

/**
 * The meaning set every pair is measured on.
 *
 * Previously each pair was scored over "the first 100 core glosses in A's
 * entry array", which is a DIFFERENT hundred meanings for every pair once
 * replacement starts reordering what counts as core. Two pairs then had two
 * different denominators and their retention figures were not comparable — and
 * comparing them across depth buckets was the whole point of the section.
 *
 * A lexicostatistical count is defined on a fixed list. This is that list: the
 * Swadesh-100, the traditional first hundred, which is the subset the published
 * anchors below were actually counted over.
 */
const SWADESH_100 = SWADESH_207.slice(0, 100).map(([gloss]) => gloss);

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
             * Divergence depth, measured the way the ENGINE now works: every
             * language changes over its own LIFETIME, from its birth to its
             * death (or the present), and a daughter starts as her parent
             * stood in her birth year.
             *
             * So two lineages share history until the first of the common
             * ancestor's two daughters on their paths is born; from then on
             * one is that daughter and the other is still the ancestor, and
             * they change apart. Each then changes until its own end. Dating
             * the split to the common ancestor's BIRTH (right when changes ran
             * on the edges to a child's birth) put Alzuria-Ayuman's pairs at
             * 7,000 years when they had been apart 3,000 to 5,000, and made the
             * deep buckets look as if far too much had been kept.
             */
            const childOn = (id) => { let c = byId.get(id); while (c && c.parentId !== anc) c = byId.get(c.parentId); return c; };
            const splitYear = Math.min(childOn(ids[i])?.born ?? 0, childOn(ids[j])?.born ?? 0);
            const endOf = (id) => Math.min(byId.get(id).died ?? PRESENT, PRESENT);
            const depth = ((endOf(ids[i]) - splitYear) + (endOf(ids[j]) - splitYear)) / 2;
            if (depth <= 0) continue;
            const A = states.get(ids[i]), B = states.get(ids[j]);
            /**
             * TRUE cognate retention: for each core meaning, do the two sisters
             * use the same etymon? That is what a lexicostatistical count
             * measures, and it is only meaningful now that meanings can migrate
             * between etyma.
             */
            let cognate = 0, n = 0;
            for (const g of SWADESH_100) {
                const a = A.entries.find((x) => x.gloss === g && !x.retired);
                const b = B.entries.find((x) => x.gloss === g && !x.retired);
                if (!a || !b) continue;
                n += 1;
                if (a.id === b.id) cognate += 1;
            }
            if (n < 40) continue;   // too few meanings survive in both to be a count
            const key = depth < 1000 ? '<1000' : depth < 2000 ? '1000-2000' : depth < 3000 ? '2000-3000'
                : depth < 4500 ? '3000-4500' : '4500+';
            if (!buckets.has(key)) buckets.set(key, new Map());
            const perFamily = buckets.get(key);
            if (!perFamily.has(f.id)) perFamily.set(f.id, []);
            perFamily.get(f.id).push(cognate / n);
        }
    }
}
const ORDER = ['<1000', '1000-2000', '2000-3000', '3000-4500', '4500+'];
const EARTH = { '<1000': '~89% (Spanish/Portuguese)', '1000-2000': '~60-75% (Eng/Ger, Sp/Fr)', '2000-3000': '~71% (Sp/Romanian)', '3000-4500': '~40% (Eng/Russian)', '4500+': '~27% (Eng/Hindi)' };
console.log(`
Each bucket averages WITHIN each family first and then across families, so a
600-leaf family and a 3-leaf one count equally. Weighting by raw pair count let
whichever family happened to occupy a depth band dictate that band's figure,
which is what made the curve rise between two adjacent buckets.`);
console.log('');
console.log('  time depth    pairs fam   generated cognate retention     Earth cognate %');
for (const k of ORDER) {
    const perFamily = buckets.get(k);
    if (!perFamily?.size) continue;
    const famMeans = [...perFamily.values()].map((v) => v.reduce((a, b) => a + b, 0) / v.length);
    const pairs = [...perFamily.values()].reduce((a, v) => a + v.length, 0);
    const mean = famMeans.reduce((a, b) => a + b, 0) / famMeans.length;
    const bar = '█'.repeat(Math.round(mean * 30));
    console.log(`  ${k.padEnd(12)} ${String(pairs).padStart(5)} ${String(perFamily.size).padStart(3)}   ${(100 * mean).toFixed(0).padStart(3)}%  ${bar.padEnd(31)} ${EARTH[k] || ''}`);
}

// ===========================================================================
H('3. PHONEME INVENTORY  —  does it stay in the typologically normal band?');
console.log(`Earth: WALS mean ~25 phonemes; the great bulk sit between 20 and 37.
       Rotokas has 11, !Xoo over 100 -- both genuinely exceptional.`);
for (const f of families) {
    const leaves = f.tree.filter((l) => !f.tree.some((x) => x.parentId === l.id));
    /**
     * The proto and its daughters on ONE ruler (scripts/measures.js). This used
     * to count the proto's vowels raw, every toned and long variant a vowel of
     * its own, and the daughters' as stripped qualities, so the comparison
     * between them measured the ruler as much as the languages.
     */
    const counts = leaves.map((l) => { const s = f.project.stateOf(l.id); return s ? inventoryCounts(s.inventory, s.entries) : null; }).filter(Boolean);
    if (!counts.length) continue;
    const sizes = counts.map((c) => c.walsSize);
    const mean = sizes.reduce((a, b) => a + b, 0) / sizes.length;
    const lo = Math.min(...sizes), hi = Math.max(...sizes);
    const phoible = counts.reduce((a, c) => a + c.phoibleSize, 0) / counts.length;
    const proto = f.project.stateOf(f.id);
    const pc = proto ? inventoryCounts(proto.inventory, proto.entries) : { walsSize: 0, phoibleSize: 0 };
    const ok = mean >= 18 && mean <= 40;
    console.log(`  ${f.name.padEnd(18)} proto ${String(pc.walsSize).padStart(2)}  →  daughters mean ${mean.toFixed(0)} (range ${lo}-${hi})   ${ok ? 'in range' : 'OUT OF RANGE'}   PHOIBLE-style ${pc.phoibleSize} → ${phoible.toFixed(0)}`);
}

// ===========================================================================
H('4. MORPHOLOGICAL EROSION  —  against the Romance and Germanic record');
console.log(`Earth: Latin's 6 cases -> Old French 2 -> Modern French 0, in ~1800 years.
       Old English 5 -> Modern English ~1 (the genitive), in ~1000 years.
       Proto-Germanic 8 -> Modern German 4, in ~2000 years.
       Finnish and Hungarian have KEPT 15+ cases for a comparable span, so
       loss is a tendency, not a law.`);
/**
 * Reported per BRANCH as well as per family, because the family mean is the
 * wrong statistic for the question being asked.
 *
 * Earth's signal is not that languages erode at some average rate — it is that
 * Icelandic and English, over the same thousand years and from the same
 * ancestor, went to opposite extremes. A family average of nine points a
 * millennium is compatible with every branch moving at nine, which is the
 * failure this measurement exists to catch. What matters is the SPREAD.
 *
 * Each leaf's rate is measured against its own age, not the family's, since a
 * daughter born in 1400 has had four centuries to erode and one born in −200
 * has had two millennia.
 */
for (const f of families) {
    const proto = f.project.stateOf(f.id);
    const leaves = f.tree.filter((l) => !f.tree.some((x) => x.parentId === l.id));
    if (proto?.erosion?.survival == null) continue;
    const rates = [];
    for (const l of leaves) {
        const s = f.project.stateOf(l.id)?.erosion?.survival;
        const age = l.born - (byId.get(f.id)?.born ?? l.born);
        if (s == null || age < 500) continue;
        rates.push({ name: l.name, rate: ((proto.erosion.survival - s) / (age / 1000)) * 100, survival: s });
    }
    if (!rates.length) continue;
    rates.sort((a, b) => a.rate - b.rate);
    const mean = rates.reduce((a, r) => a + r.rate, 0) / rates.length;
    const slow = rates[0], fast = rates[rates.length - 1];

    /**
     * The steepest WINDOW anywhere in the family, which is the figure that is
     * actually comparable to the Earth anchors.
     *
     * Latin to French is one 1,800-year stretch, not the whole six thousand
     * years since PIE. Averaging a leaf's total loss over its full descent from
     * the proto cannot produce 55 points per millennium no matter what the
     * engine does — survival starts near 90% and floors near 10%, so eighty
     * points spread over six millennia is arithmetically capped at about
     * thirteen. The old figure was measuring the tree's depth, not its speed.
     *
     * So: for every node, look back to the nearest ancestor at least 1,200
     * years earlier and measure the drop across that window.
     */
    let steepest = null;
    for (const n of f.tree) {
        const here = f.project.stateOf(n.id)?.erosion?.survival;
        if (here == null) continue;
        let anc = n.parentId ? byId.get(n.parentId) : null;
        while (anc && n.born - anc.born < 1200 && anc.parentId) anc = byId.get(anc.parentId);
        if (!anc) continue;
        const gap = n.born - anc.born;
        if (gap < 1200) continue;
        const there = f.project.stateOf(anc.id)?.erosion?.survival;
        if (there == null) continue;
        const r = ((there - here) / (gap / 1000)) * 100;
        if (!steepest || r > steepest.rate) steepest = { rate: r, name: n.name, from: anc.name, gap };
    }

    console.log(`  ${f.name.padEnd(18)} proto ${(100 * proto.erosion.survival).toFixed(0)}%   mean ${mean.toFixed(1)} pts/1000yr since the proto`);
    console.log(`  ${' '.repeat(18)}   slowest lineage ${slow.rate.toFixed(1)} (${slow.name})   fastest ${fast.rate.toFixed(1)} (${fast.name})`);
    if (steepest) {
        console.log(`  ${' '.repeat(18)}   steepest ${Math.round(steepest.gap)}yr window: ${steepest.rate.toFixed(1)} pts/1000yr  (${steepest.from} → ${steepest.name})`);
    }
}
console.log(`\n  For scale: Latin->French lost ~100% of case marking in 1800 years,
  i.e. about 55 points per millennium. Old English->English about 80. Finnish
  and Hungarian are near zero over a comparable span. BOTH ends are the target;
  a family whose branches all sit at one figure has no internal character.`);

// ===========================================================================
H('5. LEXICAL REPLACEMENT  —  does a meaning change which word carries it?');
let replaced = 0, total = 0, loans = 0;
for (const f of families) {
    const leaves = f.tree.filter((l) => !f.tree.some((x) => x.parentId === l.id));
    const proto = f.project.stateOf(f.id);
    if (!proto) continue;
    for (const l of leaves) {
        const s = f.project.stateOf(l.id);
        if (!s) continue;
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
console.log(`  ${replaced} of ${total} core meanings replaced across all leaves
  (${(100 * replaced / Math.max(1, total)).toFixed(1)}%). Earth over 6000 years: 60-73%.

  Four attested mechanisms: a derivative displacing its base (Latin auris >
  auricula > French oreille), a loan displacing the native word, a semantic
  neighbour broadening into the slot (caput > testa > French tete), and taboo
  avoidance (PIE "bear" > "the brown one" in Germanic). The displaced word is
  kept and marked archaic rather than deleted, because on Earth it usually
  narrows rather than vanishing.

  Closed classes are protected: numerals, pronouns and demonstratives form
  systems that do not permute. ${loans} loanwords are in place across all leaves.`);

// ===========================================================================
H('6. SEMANTIC CHANGE  —  false friends, and whether shifts follow real paths');
console.log(`Earth: German Gift "poison" and English gift are the same word. Latin hostis
       meant "stranger" and came to mean "enemy". Old English deor "animal"
       narrowed to deer. Meaning does not wander at random -- it runs along a
       small set of relations (metaphor, metonymy, broadening, narrowing,
       pejoration, amelioration, bleaching) that recur across unrelated
       families, which is why a table of licensed paths can be short and still
       cover most of what happens.

Measured: cognate pairs -- the same etymon in two sisters -- whose glosses have
diverged. A pair whose FORMS also still match is the striking kind.`);
console.log('');
let ffTotal = 0, ffMatching = 0, shiftTotal = 0;
const shiftTypes = new Map();
const bestExamples = [];
for (const f of families) {
    const leaves = f.tree.filter((l) => !f.tree.some((x) => x.parentId === l.id));
    const states = leaves.map((l) => f.project.stateOf(l.id)).filter(Boolean);
    for (const s of states) {
        for (const e of s.entries) {
            if (!e.shifted) continue;
            shiftTotal += 1;
            shiftTypes.set(e.shifted.type, (shiftTypes.get(e.shifted.type) || 0) + 1);
        }
    }
    // Sisters only: comparing across families would be meaningless, since two
    // families share no etyma at all and every pair would count as divergent.
    let famPairs = 0, famFF = 0;
    for (let i = 0; i < states.length && famPairs < 40; i++) {
        for (let j = i + 1; j < states.length && famPairs < 40; j++) {
            famPairs += 1;
            const ff = falseFriends(states[i], states[j], { limit: 400 });
            famFF += ff.length;
            ffTotal += ff.length;
            ffMatching += ff.filter((x) => x.formsMatch).length;
            for (const x of ff) {
                /**
                 * For DISPLAY, prefer a pair where at least one side records a
                 * semantic shift.
                 *
                 * The count above includes every divergent-meaning cognate,
                 * which is correct — a derivative that displaced its base is a
                 * genuine one. But "bite" against "cause to bite" is a dull
                 * example of a striking phenomenon, and the striking ones are
                 * where a meaning travelled a licensed path.
                 */
                if (x.formsMatch && (x.a.shifted || x.b.shifted) && bestExamples.length < 400) {
                    bestExamples.push({ fam: f.name, a: states[i].node?.name, b: states[j].node?.name, x });
                }
            }
        }
    }
    console.log(`  ${f.name.padEnd(18)} ${String(famFF).padStart(5)} divergent-meaning cognate pairs over ${famPairs} sister pairs`);
}
console.log(`\n  ${ffTotal} in total, of which ${ffMatching} still share an identical form.`);
console.log(`  ${shiftTotal} words carry a recorded semantic shift: ` +
    [...shiftTypes.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '));
if (bestExamples.length) {
    console.log('\n  A few, with the form identical in both:');
    const step = Math.max(1, Math.floor(bestExamples.length / 6));
    for (let i = 0; i < bestExamples.length; i += step) {
        const b = bestExamples[i];
        console.log(`    ${b.fam}: /${b.x.a.ipa}/  "${b.x.a.gloss}" in ${b.a}  vs  "${b.x.b.gloss}" in ${b.b}`);
    }
}

// ===========================================================================
H('7. GRAMMATICAL RENEWAL  —  can a daughter have a category its proto lacked?');
console.log(`Earth: Latin lost its case system and simultaneously grew a definite article
       from a demonstrative, a perfect from "to have", and a future from an
       infinitive plus "to have" (cantare habeo > chanterai). Loss and renewal
       run at once. A model with only the first produces daughters that are the
       proto minus whatever fell off, which is what this engine did until now.`);
console.log('');
for (const f of families) {
    const proto = f.project.stateOf(f.id);
    if (!proto?.paradigm) continue;
    const protoCats = new Set([...(proto.paradigm.categories.cases || []), ...(proto.paradigm.categories.tenses || [])]);
    const leaves = f.tree.filter((l) => !f.tree.some((x) => x.parentId === l.id));
    let gained = 0, lost = 0, changedLeaves = 0;
    const clines = new Set();
    for (const n of f.tree) {
        for (const g of f.project.stateOf(n.id)?.grammaticalisations || []) {
            if (g.kind === 'category-loss') lost += 1;
            else { gained += 1; clines.add(g.cline); }
        }
    }
    let example = null;
    for (const l of leaves) {
        const c = f.project.stateOf(l.id)?.paradigm?.categories;
        if (!c) continue;
        const mine = [...(c.cases || []), ...(c.tenses || [])];
        const novel = mine.filter((x) => !protoCats.has(x));
        const gone = [...protoCats].filter((x) => !mine.includes(x));
        if (novel.length || gone.length) {
            changedLeaves += 1;
            if (!example && novel.length) example = { name: l.name, novel, gone, mine };
        }
    }
    console.log(`  ${f.name.padEnd(18)} ${String(gained).padStart(3)} categories grammaticalised, ${String(lost).padStart(3)} abandoned` +
        `   ${changedLeaves}/${leaves.length} leaves differ from the proto`);
    if (clines.size) console.log(`  ${' '.repeat(18)}   clines: ${[...clines].join(', ')}`);
    if (example) {
        console.log(`  ${' '.repeat(18)}   e.g. ${example.name}: gained ${example.novel.join(', ')}` +
            `${example.gone.length ? `, lost ${example.gone.join(', ')}` : ''}`);
    }
}

// ===========================================================================
H('8. ORTHOGRAPHIC DEPTH  —  how far spelling has drifted from speech');
console.log(`Earth: English fixed its spelling around 1450 and then ran the Great Vowel
       Shift underneath it, which is why knight is /naIt/ and eaux is /o/.
       Finnish, Turkish and Spanish are near-transparent; English and French
       are deep; Tibetan and Irish deeper still. NO literate culture spells
       itself perfectly phonemically for long, and every stage in this engine
       used to.

Measured: the share of a language's words that its inherited spelling now
writes differently from how a spelling reform would write them today.`);
console.log('');
for (const f of families) {
    const leaves = f.tree.filter((l) => !f.tree.some((x) => x.parentId === l.id));
    const rows = [];
    for (const l of leaves) {
        const s = f.project.stateOf(l.id);
        const d = s ? orthographicDepth(s) : null;
        if (d && s.orthographyFrozen) rows.push({ name: l.name, born: l.born, ...d });
    }
    if (!rows.length) { console.log(`  ${f.name.padEnd(18)} no leaf has passed its standardisation year yet`); continue; }
    rows.sort((a, b) => b.depth - a.depth);
    const mean = rows.reduce((a, r) => a + r.depth, 0) / rows.length;
    console.log(`  ${f.name.padEnd(18)} ${rows.length} written leaves, mean depth ${(100 * mean).toFixed(0)}%   deepest ${(100 * rows[0].depth).toFixed(0)}% (${rows[0].name})`);
    for (const e of rows[0].examples.slice(0, 2)) {
        console.log(`  ${' '.repeat(18)}   written <${e.written}>, said /${e.ipa}/ — "${e.gloss}"`);
    }
}

// ===========================================================================
H('9. WHAT THE ENGINE STILL DOES NOT DO  —  the honest gaps');
/**
 * The two figures this section used to assert without measuring. Both are now
 * computed, because a hand-written list of gaps rots the moment one is closed —
 * and this one had: it claimed word order never changes for some time after
 * `syntax/drift.js` had started changing it.
 */
/**
 * Every language owns one edge, its own lifetime, so the question is which
 * living languages have an edge that stops short of the present. That used to be read off
 * `changeSet.to === born`, which is true of EVERY node, because the founding
 * edge always ends on the birth year; so the report said all living leaves were
 * frozen when none were. Diverged protos are excluded: they did not go on
 * being spoken, they turned into their daughters.
 */
const gapFacts = (() => {
    let living = 0, frozenAtBirth = 0, unmodelledYears = 0, oldest = null, leavesWithLife = 0, livingLeaves = 0;
    for (const f of families) {
        for (const l of f.tree) {
            if (l.died != null || l.diverged || !l.parentId) continue;
            let st; try { st = f.project.stateOf(l.id); } catch { continue; }
            if (!st) continue;
            living += 1;
            const isLeaf = !f.tree.some((x) => x.parentId === l.id);
            const reachesNow = st.changeSet?.to >= (doc.config.presentYear ?? l.born);
            if (isLeaf) { livingLeaves += 1; if (reachesNow) leavesWithLife += 1; }
            if (reachesNow) continue;
            frozenAtBirth += 1;
            const gap = (doc.config.presentYear ?? l.born) - l.born;
            unmodelledYears += gap;
            if (!oldest || gap > oldest.gap) oldest = { name: l.name, born: l.born, gap };
        }
    }
    return { living, livingLeaves, leavesWithLife, frozenAtBirth, unmodelledYears, oldest };
})();

console.log(gapFacts.frozenAtBirth ? `  A LIVING LANGUAGE WITH DAUGHTERS STOPS CHANGING THE DAY IT IS BORN.
  ${gapFacts.leavesWithLife} of the ${gapFacts.livingLeaves} living leaves have an edge over their own lifetime, but
  ${gapFacts.frozenAtBirth} living languages with daughters do not: their sound history ends on their
  birth year, a mean ${Math.round(gapFacts.unmodelledYears / gapFacts.frozenAtBirth)} years before the present.${gapFacts.oldest ? `
  ${gapFacts.oldest.name} was born in ${gapFacts.oldest.born} and is still spoken: ${gapFacts.oldest.gap} years of its
  history are not modelled.` : ''} Closing it means letting such a language run to the
  present and deriving each daughter from its parent AS IT STOOD AT THE SPLIT.
` : `  Every one of the ${gapFacts.living} living languages changes over its own lifetime, and each
  daughter branches from its parent as it stood at the split.
`);
console.log(`
  SEMANTIC PATHS ARE A FIXED TABLE. Every shift is licensed by a hand-curated
  list of attested relations, which is the right constraint but a finite one: a
  shift that is perfectly ordinary and simply absent from the table cannot
  happen. Widening it is data work, not engine work.

  DIALECT CONTINUA. The tree is a tree. Real relatedness is often a wave across
  a continuum, where a feature spreads over an area regardless of ancestry, and
  no node here can be partly one thing and partly another.

  SUPPLETION IS INHERITED, NEVER CREATED. A handful of high-frequency lexemes
  are marked irregular at the proto and stay immune to levelling, which is
  right; but no new suppletion ever arises from two lexemes collapsing into one
  paradigm the way go/went did.

  WRITING IS ONE SYSTEM. Orthography freezes and drifts, but there are no
  spelling reforms, no competing orthographies, and no script changes.

  A CREOLE IS NOT A CREOLE. The chart lets a node have two parents and draws the
  second as a dashed line; \`secondaryParentId\` is read nowhere in js/engine, so
  Atirhan Dahen — a creole of Standard Dahen and Emaran — is derived as an
  ordinary daughter of Standard Dahen with no trace of its other parent. That is
  the one place where a display asserts something the engine has not modelled.`);
console.log();
