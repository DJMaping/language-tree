/**
 * Headless report on a derived language stage.
 *
 *   node scripts/lang-report.js "Standard Dahen"
 *   node scripts/lang-report.js standard-dahen --typology
 *   node scripts/lang-report.js dahen --words 40
 *
 * Prints the inventory, phonotactics, syllable statistics, lexicon shape and
 * change log for one stage — everything the panel shows, plus the quantitative
 * measures the panel doesn't, so output quality can be judged against real
 * languages rather than by eye.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProject } from '../js/engine/project.js';
import { syllabify, shapeOf, markStress } from '../js/engine/phonology/phonotactics.js';
import { isVowel } from '../js/engine/features.js';
import { formatParadigm } from '../js/engine/morphology/paradigm.js';
import { formatErosion } from '../js/engine/morphology/erosion.js';
import { spellEntry } from '../js/engine/phonology/romanise.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const doc = JSON.parse(fs.readFileSync(path.join(root, 'data/languages.json'), 'utf8'));
const configs = JSON.parse(fs.readFileSync(path.join(root, 'data/lang-config.json'), 'utf8'));

const byId = new Map(doc.languages.map((l) => [l.id, l]));
const rootOf = (l) => { let c = l; while (c.parentId) c = byId.get(c.parentId); return c.id; };

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith('--')) || 'Standard Dahen';
const flag = (name, dflt) => {
    const i = args.indexOf(`--${name}`);
    return i === -1 ? dflt : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true);
};

const node = doc.languages.find((l) => l.id === target || l.name.toLowerCase() === String(target).toLowerCase());
if (!node) { console.error(`No language "${target}".`); process.exit(1); }

const famRoot = rootOf(node);
const cfg = configs[famRoot];
if (!cfg) { console.error(`Family ${famRoot} has no entry in data/lang-config.json.`); process.exit(1); }

const tree = doc.languages.filter((l) => rootOf(l) === famRoot);
const project = createProject({
    tree,
    names: tree.map((l) => l.name),
    config: { ...cfg, rootId: famRoot, presentYear: doc.config.presentYear },
    sidecar: {}, borrowings: doc.borrowings || [],
});

const state = project.stateOf(node.id);
const chain = [];
for (let c = state; c; c = c.parentId ? project.stateOf(c.parentId) : null) chain.unshift(c);

const H = (t) => console.log(`\n${'═'.repeat(70)}\n${t}\n${'═'.repeat(70)}`);
const pct = (n, d) => `${((100 * n) / Math.max(1, d)).toFixed(1)}%`;

// ---------------------------------------------------------------------------
H(`${node.name}   (${node.born}${node.died != null ? `–${node.died}` : '–now'})`);
console.log(`Lineage: ${chain.map((s) => s.node.name).join(' → ')}`);
console.log(`Family:  ${cfg.name || famRoot}   seed ${cfg.seed}`);

// ---------------------------------------------------------------------------
H('INVENTORY');
const PLACE = ['bilabial', 'labiodental', 'dental', 'alveolar', 'postalveolar', 'retroflex', 'alveolopalatal', 'palatal', 'velar', 'labiovelar', 'uvular', 'pharyngeal', 'glottal'];
const MANNER = ['stop', 'affricate', 'fricative', 'nasal', 'trill', 'tap', 'approximant'];
const places = PLACE.filter((p) => state.inventory.consonants.some((c) => c.f.place === p));
console.log('          ' + places.map((p) => p.slice(0, 7).padEnd(9)).join(''));
for (const m of [...MANNER, 'lateral']) {
    const row = m === 'lateral'
        ? state.inventory.consonants.filter((c) => c.f.lateral)
        : state.inventory.consonants.filter((c) => c.f.manner === m && !c.f.lateral);
    if (!row.length) continue;
    console.log(m.padEnd(10) + places.map((p) => row.filter((c) => c.f.place === p).map((c) => c.ipa).join(' ').padEnd(9)).join(''));
}
console.log(`\n${state.inventory.consonants.length} consonants`);

const voicedObstruents = state.inventory.consonants.filter((c) => c.f.voice && ['stop', 'affricate', 'fricative'].includes(c.f.manner));
const aspirated = state.inventory.consonants.filter((c) => c.f.aspirated);
console.log(`  voiced obstruents: ${voicedObstruents.length ? voicedObstruents.map((c) => c.ipa).join(' ') : 'none'}`);
console.log(`  aspirated:         ${aspirated.length ? aspirated.map((c) => c.ipa).join(' ') : 'none'}`);

// Vowels grouped by base quality.
const vgroups = new Map();
for (const v of state.inventory.vowels) {
    const base = v.ipa.replace(/[ːʰ˩˨˧˦˥̃]/gu, '');
    if (!vgroups.has(base)) vgroups.set(base, []);
    vgroups.get(base).push(v.ipa);
}
console.log(`\n${vgroups.size} vowel qualities (${state.inventory.vowels.length} with modifications):`);
for (const [base, all] of vgroups) console.log(`  ${base.padEnd(4)} ${all.join(' ')}`);
const tones = new Set(state.inventory.vowels.map((v) => v.f.tone).filter(Boolean));
console.log(`  tone: ${tones.size ? `${tones.size} level(s) — ${[...tones].sort().join(', ')}` : 'none'}`);
const nasalV = state.inventory.vowels.filter((v) => v.f.nasal).length;
const longV = state.inventory.vowels.filter((v) => v.f.long).length;
console.log(`  nasalised: ${nasalV}   long: ${longV}`);

// ---------------------------------------------------------------------------
H('SYLLABLE STRUCTURE  (measured over the whole lexicon)');
const pt = state.phonotactics;
const shapes = new Map();
const codaSegs = new Map();
const onsetClusters = new Map();
const sylPerWord = new Map();
let totalSyl = 0, openSyl = 0, clusterOnsets = 0, wordsWithCluster = 0;

for (const e of state.entries) {
    const sylls = syllabify(e.form, pt);
    totalSyl += sylls.length;
    sylPerWord.set(sylls.length, (sylPerWord.get(sylls.length) || 0) + 1);
    let anyCluster = false;
    for (const s of sylls) {
        const sh = shapeOf(s);
        shapes.set(sh, (shapes.get(sh) || 0) + 1);
        if (!s.coda.length) openSyl += 1;
        for (const c of s.coda) codaSegs.set(c.ipa, (codaSegs.get(c.ipa) || 0) + 1);
        if (s.onset.length > 1) {
            clusterOnsets += 1; anyCluster = true;
            const k = s.onset.map((c) => c.ipa).join('');
            onsetClusters.set(k, (onsetClusters.get(k) || 0) + 1);
        }
    }
    if (anyCluster) wordsWithCluster += 1;
}

const top = (m, n = 12) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k || '∅'}×${v}`).join('  ');
console.log(`Words: ${state.entries.length}   syllables: ${totalSyl}   mean ${(totalSyl / state.entries.length).toFixed(2)} syl/word`);
console.log(`Syllables per word: ${[...sylPerWord.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}σ ${pct(v, state.entries.length)}`).join('  ')}`);
console.log(`Shapes:  ${top(shapes)}`);
console.log(`Open syllables: ${pct(openSyl, totalSyl)}`);
console.log(`Coda segments:  ${top(codaSegs) || '(none)'}`);
console.log(`Onset clusters: ${clusterOnsets} occurrences in ${pct(wordsWithCluster, state.entries.length)} of words — ${top(onsetClusters, 10) || '(none)'}`);

// ---------------------------------------------------------------------------
H('VOWEL QUALITY DISTRIBUTION');
const vcount = new Map();
let vtotal = 0;
for (const e of state.entries) for (const ph of e.form) if (isVowel(ph)) { const b = ph.ipa.replace(/[ːʰ˩˨˧˦˥̃]/gu, ''); vcount.set(b, (vcount.get(b) || 0) + 1); vtotal += 1; }
for (const [v, n] of [...vcount.entries()].sort((a, b) => b[1] - a[1])) {
    const bar = '█'.repeat(Math.round((40 * n) / vtotal));
    console.log(`  ${v.padEnd(4)} ${String(n).padStart(5)}  ${pct(n, vtotal).padStart(6)}  ${bar}`);
}

// ---------------------------------------------------------------------------
H('SYLLABLE INVENTORY  (distinct syllables — the Sinitic measure)');
const distinct = new Set();
const distinctToneless = new Set();
for (const e of state.entries) {
    for (const s of syllabify(e.form, pt)) {
        const full = [...s.onset, ...s.nucleus, ...s.coda].map((p) => p.ipa).join('');
        distinct.add(full);
        distinctToneless.add(full.replace(/[˩˨˧˦˥]/gu, ''));
    }
}
console.log(`${distinct.size} distinct syllables (${distinctToneless.size} ignoring tone) across ${totalSyl} tokens`);
console.log(`Mandarin for comparison: ~1300 with tone, ~400 without.`);

// ---------------------------------------------------------------------------
if (flag('typology')) {
    H('TYPOLOGICAL SCORECARD vs MANDARIN');
    const rows = [
        ['tone', tones.size ? `${tones.size} levels` : 'none', '4 tones + neutral', tones.size >= 2],
        ['voiced obstruents', voicedObstruents.length || 'none', 'none (aspiration instead)', voicedObstruents.length === 0],
        ['aspiration contrast', aspirated.length ? `${aspirated.length} segments` : 'none', 'p/pʰ t/tʰ k/kʰ ts/tsʰ tɕ/tɕʰ ʈʂ/ʈʂʰ', aspirated.length >= 3],
        ['onset clusters', `${pct(wordsWithCluster, state.entries.length)} of words`, 'none at all', wordsWithCluster === 0],
        ['codas', [...codaSegs.keys()].join(' ') || 'none', 'n ŋ (and ɻ)', [...codaSegs.keys()].every((c) => ['n', 'ŋ', 'ɻ'].includes(c))],
        ['open syllables', pct(openSyl, totalSyl), '~70%', true],
        ['syl/word', (totalSyl / state.entries.length).toFixed(2), '1–2 (mostly 2 in modern)', totalSyl / state.entries.length <= 2.3],
        ['vowel qualities', vgroups.size, '5 phonemic /a ɤ i u y/', vgroups.size <= 7],
        ['schwa share', pct(vcount.get('ə') || 0, vtotal), 'marginal (allophone only)', (vcount.get('ə') || 0) / vtotal < 0.12],
    ];
    for (const [k, got, want, ok] of rows) {
        console.log(`  ${ok ? '✓' : '✗'} ${String(k).padEnd(20)} ${String(got).padEnd(28)} Mandarin: ${want}`);
    }
    console.log(`\n  ${rows.filter((r) => r[3]).length}/${rows.length} dimensions Mandarin-like`);
}

// ---------------------------------------------------------------------------
H('SAMPLE LEXICON');
const want = ['I', 'you (sg)', 'two', 'three', 'water', 'fire', 'eye', 'hand', 'sun', 'moon', 'dog', 'horse', 'eat', 'see', 'go', 'big', 'name', 'mother', 'mountain', 'rice'];
for (const g of want) {
    const e = state.entries.find((x) => x.gloss === g);
    if (!e) continue;
    console.log(`  ${g.padEnd(10)} ${e.ipa.padEnd(14)} ⟨${spellEntry(state, e)}⟩`);
}

// ---------------------------------------------------------------------------
H('GRAMMAR');
if (state.paradigm?.classes && Object.keys(state.paradigm.classes).length) {
    console.log(formatErosion(state.erosion, state.paradigm));
    console.log();
    for (const cls of Object.keys(state.paradigm.classes).sort().slice(0, 3)) {
        console.log(formatParadigm(state.paradigm, cls));
        console.log();
    }
} else console.log('(no inflectional morphology)');

H('CHANGE LOG FOR THIS EDGE');
if (state.changeSet) {
    console.log(`${state.changeSet.from} → ${state.changeSet.to}, one change per ~${state.changeSet.interval} years`);
    for (const r of state.changeSet.rules) {
        console.log(`  c.${String(r.year).padStart(6)}  ${r.label.padEnd(52)} ${state.stats.byRule.get(r.id) || 0} words`);
    }
} else console.log('(family root — no edge)');

H('WHOLE-LINEAGE CHANGE COUNT');
for (const s of chain) {
    if (!s.changeSet) { console.log(`  ${s.node.name.padEnd(24)} (root)`); continue; }
    const cats = new Map();
    for (const r of s.changeSet.rules) cats.set(r.category, (cats.get(r.category) || 0) + 1);
    console.log(`  ${s.node.name.padEnd(24)} ${String(s.changeSet.rules.length).padStart(3)} rules   ${[...cats.entries()].map(([k, v]) => `${k}:${v}`).join(' ')}`);
}
console.log();
