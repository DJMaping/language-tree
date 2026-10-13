/**
 * Cross-family audit — the regression net for engine tuning.
 *
 * Prints one line of typological measurements per family, over every leaf
 * language, so a change made to suit one family is immediately visible as
 * damage to the other five.
 *
 *   node scripts/lang-audit.js
 *   node scripts/lang-audit.js --save baseline.json
 *   node scripts/lang-audit.js --compare baseline.json
 *
 * The measures are the ones that go wrong when the shared catalogue is tuned
 * for a single family: schwa share, toned-vowel share, cluster rate, syllable
 * count, inventory size. A "sinitic" fix that makes every family tonal shows up
 * here as a toned-share jump across all six.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProject } from '../js/engine/project.js';
import { familyInputs } from './world.js';
import { syllabify, shapeOf } from '../js/engine/phonology/phonotactics.js';
import { isVowel } from '../js/engine/features.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const doc = JSON.parse(fs.readFileSync(path.join(root, 'data/languages.json'), 'utf8'));
const configs = JSON.parse(fs.readFileSync(path.join(root, 'data/lang-config.json'), 'utf8'));

const byId = new Map(doc.languages.map((l) => [l.id, l]));
const rootOf = (l) => { let c = l; while (c.parentId) c = byId.get(c.parentId); return c.id; };
const args = process.argv.slice(2);
const argVal = (n) => { const i = args.indexOf(`--${n}`); return i === -1 ? null : args[i + 1]; };

const out = {};

for (const [famRoot, cfg] of Object.entries(configs)) {
    if (famRoot.startsWith('_')) continue;
    const tree = doc.languages.filter((l) => rootOf(l) === famRoot);
    if (!tree.length) continue;

    const project = createProject({
        tree,
        names: tree.map((l) => l.name),
        config: { ...cfg, rootId: famRoot, presentYear: doc.config.presentYear },
        ...familyInputs(famRoot), borrowings: doc.borrowings || [],
    });

    // Leaves only: the modern languages are what a reader actually sees.
    const leaves = tree.filter((l) => !tree.some((x) => x.parentId === l.id));
    const m = {
        family: cfg.name || famRoot, nodes: tree.length, leaves: leaves.length,
        vTokens: 0, schwa: 0, toned: 0, nasal: 0, long: 0,
        syl: 0, words: 0, clusterWords: 0, codaTokens: 0,
        rules: 0, edges: 0, voicedObstruents: 0, qualities: new Set(), segLoss: 0,
        homoWorst: 0, homoShareSum: 0, homoN: 0,
        inflSum: 0, inflN: 0,
    };

    for (const leaf of leaves) {
        let state;
        try { state = project.stateOf(leaf.id); } catch { continue; }
        if (!state) continue;

        /**
         * Homophony, which had no column and needed one.
         *
         * Sound change destroys contrasts and compounding repairs them, and
         * with nothing watching the balance one language reached a single form
         * carrying 109 distinct meanings while 68% of its lexicon was
         * homophonous — enough that its sample sentences read as babble. The
         * worst set is the number that matters: a family mean hides it, because
         * one catastrophic collision is invisible in an average.
         */
        {
            const live = state.entries.filter((e) => !e.paradigm && !e.retired);
            const byForm = new Map();
            for (const e of live) byForm.set(e.ipa, (byForm.get(e.ipa) || 0) + 1);
            if (byForm.size) {
                m.homoWorst = Math.max(m.homoWorst, ...byForm.values());
                m.homoShareSum += 1 - (byForm.size / Math.max(1, live.length));
                m.homoN += 1;
            }
        }

        for (const e of state.entries) {
            m.words += 1;
            const sylls = syllabify(e.form, state.phonotactics);
            m.syl += sylls.length;
            // A lossy syllabification silently corrupts every other measure here.
            const flat = sylls.reduce((n, s) => n + (s.appendix || []).length + s.onset.length + s.nucleus.length + s.coda.length, 0);
            if (flat !== e.form.length) m.segLoss += 1;
            if (sylls.some((s) => (s.appendix || []).length + s.onset.length > 1)) m.clusterWords += 1;
            for (const s of sylls) m.codaTokens += s.coda.length;
            for (const ph of e.form) {
                if (!isVowel(ph)) continue;
                m.vTokens += 1;
                const base = ph.ipa.replace(/[ːʰ˩˨˧˦˥̃]/gu, '');
                m.qualities.add(base);
                if (base === 'ə') m.schwa += 1;
                if (ph.f.tone) m.toned += 1;
                if (ph.f.nasal) m.nasal += 1;
                if (ph.f.long) m.long += 1;
            }
        }
        // Inflectional survival: the measure that shows a change quietly
        // destroying every family's morphology at once.
        if (state.erosion?.survival != null) { m.inflSum += state.erosion.survival; m.inflN += 1; }
        m.voicedObstruents = Math.max(m.voicedObstruents,
            state.inventory.consonants.filter((c) => c.f.voice && ['stop', 'affricate', 'fricative'].includes(c.f.manner)).length);
    }
    for (const n of tree) {
        const s = project.stateOf(n.id);
        if (s?.changeSet) { m.edges += 1; m.rules += s.changeSet.rules.length; }
    }

    out[famRoot] = {
        family: m.family,
        leaves: m.leaves,
        schwaPct: +(100 * m.schwa / Math.max(1, m.vTokens)).toFixed(1),
        tonedPct: +(100 * m.toned / Math.max(1, m.vTokens)).toFixed(1),
        nasalPct: +(100 * m.nasal / Math.max(1, m.vTokens)).toFixed(1),
        longPct: +(100 * m.long / Math.max(1, m.vTokens)).toFixed(1),
        clusterPct: +(100 * m.clusterWords / Math.max(1, m.words)).toFixed(1),
        sylPerWord: +(m.syl / Math.max(1, m.words)).toFixed(2),
        codaPerWord: +(m.codaTokens / Math.max(1, m.words)).toFixed(2),
        inflPct: m.inflN ? +(100 * m.inflSum / m.inflN).toFixed(1) : null,
        qualities: m.qualities.size,
        voicedObstruents: m.voicedObstruents,
        rulesPerEdge: +(m.rules / Math.max(1, m.edges)).toFixed(1),
        segmentLossWords: m.segLoss,
        homoWorst: m.homoWorst,
        homoPct: m.homoN ? +(100 * m.homoShareSum / m.homoN).toFixed(1) : null,
    };
}

const KEYS = ['leaves', 'schwaPct', 'tonedPct', 'clusterPct', 'sylPerWord', 'inflPct', 'qualities', 'voicedObstruents', 'rulesPerEdge', 'segmentLossWords', 'homoWorst', 'homoPct'];
const W = 9;

function table(data, prev) {
    console.log('family'.padEnd(18) + KEYS.map((k) => k.slice(0, W - 1).padStart(W)).join(''));
    console.log('─'.repeat(18 + KEYS.length * W));
    for (const [id, v] of Object.entries(data)) {
        let line = String(v.family).slice(0, 17).padEnd(18);
        for (const k of KEYS) {
            const now = v[k];
            const was = prev?.[id]?.[k];
            let cell = String(now);
            if (was != null && was !== now) cell = `${now}${now > was ? '↑' : '↓'}`;
            line += cell.padStart(W);
        }
        console.log(line);
    }
}

const compareTo = argVal('compare');
const prev = compareTo && fs.existsSync(compareTo) ? JSON.parse(fs.readFileSync(compareTo, 'utf8')) : null;
table(out, prev);

if (prev) {
    console.log('\nArrows mark movement against the saved baseline.');
    console.log('Watch for a measure moving the SAME way across all six families — that is a');
    console.log('shared-catalogue change leaking, not a family being tuned.');
}

const save = argVal('save');
if (save) { fs.writeFileSync(save, JSON.stringify(out, null, 2)); console.log(`\nSaved to ${save}`); }
