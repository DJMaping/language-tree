/**
 * Precompute what the Views window shows about every language at once.
 *
 *   node scripts/build-views.js        (npm run views; about a minute and a half)
 *   node scripts/build-views.js --seed=2 --out=views-2.json
 *                                       every family re-rolled with another seed, written
 *                                       elsewhere: for judging an engine change over
 *                                       several worlds (npm run typology -- --views=...)
 *
 * The chart and the panel derive one language when it is opened, which is
 * fast. The views compare all 383 at once (maps, the family dashboard, a word
 * across the whole tree, measured relatedness), and deriving every family takes
 * half a minute, too slow to do on opening a tab. So it is done here and saved
 * to data/views.json; the window says when that was and whether the chart has
 * changed since.
 *
 * For every language in a family with an engine:
 *   features  sound system, tone, word order, morphology, word length;
 *   words     its form for each of the 207 Swadesh meanings, with the id of the
 *             word it descends from, so cognates can be coloured together.
 * For every family: its character, and the distances between its living
 * languages measured from those words (shared cognates and sound divergence),
 * with a tree built from them (UPGMA) to set beside the drawn one.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createProject } from '../js/engine/project.js';
import { SWADESH_207 } from '../js/engine/lexicon/swadesh.js';
import { familyInputs } from './world.js';
import { inventoryCounts, seriesOf, vowelCount, soundTypology } from './measures.js';
import { hasSuppletion } from '../js/engine/morphology/irregular.js';
import { articleValues } from '../js/engine/morphology/articles.js';
import { colexValues } from '../js/engine/lexicon/colexify.js';
import { moodValues } from '../js/engine/morphology/moods.js';
import { evidentialValues } from '../js/engine/morphology/evidentials.js';
import { morphologyValue, verbSynthesis } from '../js/engine/morphology/type-measure.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const raw = fs.readFileSync(path.join(root, 'data/languages.json'), 'utf8');
const doc = JSON.parse(raw);
const configs = JSON.parse(fs.readFileSync(path.join(root, 'data/lang-config.json'), 'utf8'));
const byId = new Map(doc.languages.map((l) => [l.id, l]));
const rootOf = (l) => { let c = l; while (c.parentId && byId.has(c.parentId)) c = byId.get(c.parentId); return c.id; };
const GLOSSES = SWADESH_207.map(([g]) => g);
const started = Date.now();

/** Normalised edit distance between two IPA strings, by phoneme. */
function lev(a, b) {
    const A = [...a], B = [...b];
    const d = Array.from({ length: A.length + 1 }, (_, i) => [i, ...Array(B.length).fill(0)]);
    for (let j = 1; j <= B.length; j++) d[0][j] = j;
    for (let i = 1; i <= A.length; i++) for (let j = 1; j <= B.length; j++) {
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1));
    }
    return d[A.length][B.length] / Math.max(1, A.length, B.length);
}

/** UPGMA: the simplest tree a distance matrix implies, which is the point of drawing it. */
function upgma(ids, dist) {
    let clusters = ids.map((id, i) => ({ id, members: [i], height: 0 }));
    const D = (a, b) => {
        let s = 0;
        for (const i of a.members) for (const j of b.members) s += dist[i][j];
        return s / (a.members.length * b.members.length);
    };
    while (clusters.length > 1) {
        let best = null;
        for (let i = 0; i < clusters.length; i++) for (let j = i + 1; j < clusters.length; j++) {
            const v = D(clusters[i], clusters[j]);
            if (!best || v < best.v) best = { i, j, v };
        }
        const a = clusters[best.i], b = clusters[best.j];
        const merged = { children: [a, b], members: [...a.members, ...b.members], height: +(best.v / 2).toFixed(4) };
        clusters = clusters.filter((_, k) => k !== best.i && k !== best.j);
        clusters.push(merged);
    }
    const strip = (c) => (c.children ? { height: c.height, children: c.children.map(strip) } : { id: c.id });
    return strip(clusters[0]);
}

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const SEED = arg('seed'), OUT = arg('out') || 'data/views.json';

const languages = {};
const families = {};
for (const fam of Object.keys(configs).filter((k) => !k.startsWith('_'))) {
    const cfg = configs[fam];
    const tree = doc.languages.filter((l) => rootOf(l) === fam);
    if (!tree.length) continue;
    const project = createProject({
        tree, names: tree.map((l) => l.name),
        config: { ...cfg, rootId: fam, presentYear: doc.config.presentYear, ...(SEED ? { seed: `${cfg.seed}/${SEED}` } : {}) },
        borrowings: doc.borrowings || [], ...familyInputs(fam),
    });
    const character = project.foundingOf(fam)?.character;

    for (const l of tree) {
        let st;
        try { st = project.stateOf(l.id); } catch { continue; }
        if (!st) continue;
        const live = st.entries.filter((e) => !e.retired && !e.paradigm);
        const byGloss = new Map();
        for (const e of live) if (!byGloss.has(e.gloss)) byGloss.set(e.gloss, e);
        const words = GLOSSES.map((g) => byGloss.get(g)?.ipa ?? null);
        const ids = GLOSSES.map((g) => {
            const e = byGloss.get(g);
            if (!e) return null;
            return e.loan ? `loan:${e.loan.from}` : e.compoundOf ? 'compound' : e.id;
        });
        const core = live.filter((e) => e.core);
        const inv = inventoryCounts(st.inventory, st.entries);
        const series = seriesOf(st.inventory);
        languages[l.id] = {
            family: fam,
            features: {
                consonants: inv.consonants,
                vowels: inv.qualities,
                toneLevels: inv.toneLevels,
                aspirates: series.aspirates,
                frontRounded: series.frontRounded,
                order: st.syntax?.order ?? null,
                freedom: st.syntax?.freedom ?? null,
                dominant: st.syntax?.dominant !== false,
                cases: st.paradigm?.categories?.cases?.length ?? 0,
                genders: st.paradigm?.categories?.genders?.length ?? 0,
                classifiers: st.paradigm?.categories?.classifiers?.use ?? 'none',
                clusivity: !!st.paradigm?.categories?.pronouns?.clusivity,
                polite: !!st.paradigm?.categories?.pronouns?.polite,
                suppletion: hasSuppletion(st.entries, 'tense'),
                definiteArticle: articleValues(st.paradigm?.categories).definite,
                indefiniteArticle: articleValues(st.paradigm?.categories).indefinite,
                ...moodValues(st),
                ...evidentialValues(st),
                // the type the language now is, read as WALS reads it (morphology/type-measure.js)
                morphologyMeasured: morphologyValue(st),
                verbSynthesis: verbSynthesis(st),
                numeral: st.syntax?.numeral ?? null,
                demonstrative: st.syntax?.demonstrative ?? null,
                // one word for two meanings (WALS 129A, 130A, 134A, 135A)
                ...colexValues(st.entries),
                // the order chapters (WALS 85A-92A, 112A, 116A)
                adposition: st.syntax?.adposition ?? null,
                genitive: st.syntax?.genitive ?? null,
                adjectiveOrder: st.syntax?.adjective ?? null,
                relativeClause: st.syntax?.relative ?? null,
                negation: st.syntax?.negation ?? null,
                polar: st.syntax?.polar ?? null,
                syllables: +(core.reduce((n, e) => n + vowelCount(e), 0) / Math.max(1, core.length)).toFixed(2),
                // WALS's other sound chapters (4A-19A), measured as WALS defines them (measures.js)
                ...soundTypology(st.inventory, st.entries, st.phonotactics),
                lexicon: live.length,
            },
            // the sounds themselves, for sound maps (consonants, then vowels)
            phonemes: [...st.inventory.consonants, ...st.inventory.vowels].map((ph) => ph.ipa),
            words,
            ids,
        };
    }

    // Measured relatedness among the living leaves.
    const leaves = tree.filter((l) => l.died == null && !l.diverged && !tree.some((x) => x.parentId === l.id) && languages[l.id]);
    let distances = null, computed = null;
    if (leaves.length >= 3) {
        const lexical = leaves.map(() => Array(leaves.length).fill(0));
        const sound = leaves.map(() => Array(leaves.length).fill(0));
        const dist = leaves.map(() => Array(leaves.length).fill(0));
        for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
            const A = languages[leaves[i].id], B = languages[leaves[j].id];
            let both = 0, cognate = 0, phon = 0;
            for (let k = 0; k < GLOSSES.length; k++) {
                if (!A.ids[k] || !B.ids[k]) continue;
                both += 1;
                if (A.ids[k] === B.ids[k] && !A.ids[k].startsWith('compound')) { cognate += 1; phon += lev(A.words[k], B.words[k]); }
            }
            const lx = both ? 1 - cognate / both : 1;
            const ph = cognate ? phon / cognate : 1;
            lexical[i][j] = lexical[j][i] = +lx.toFixed(3);
            sound[i][j] = sound[j][i] = +ph.toFixed(3);
            dist[i][j] = dist[j][i] = +(0.5 * lx + 0.5 * ph).toFixed(3);
        }
        distances = { ids: leaves.map((l) => l.id), lexical, sound, combined: dist };
        computed = upgma(leaves.map((l) => l.id), dist);
    }
    families[fam] = {
        name: cfg.name,
        character: character ? {
            morphology: character.morphology, order: character.syntax?.order, vowelCount: character.vowelCount,
            laryngeal: character.laryngeal, suffixShare: character.suffixShare, reasons: character.reasons,
        } : null,
        distances,
        computedTree: computed,
    };
    console.log(`${String(cfg.name).padEnd(16)} ${tree.length} languages`);
}

const out = {
    _readme: 'Built by scripts/build-views.js (npm run views) for the Views window. Regenerate after editing the chart; the window warns when it is stale.',
    generatedAt: new Date().toISOString(),
    docHash: crypto.createHash('sha1').update(raw).digest('hex').slice(0, 12),
    glosses: GLOSSES,
    languages,
    families,
};
fs.writeFileSync(path.resolve(root, OUT), JSON.stringify(out));
console.log(`Wrote ${OUT} (${Math.round(fs.statSync(path.resolve(root, OUT)).size / 1024)} KB) in ${((Date.now() - started) / 1000).toFixed(0)}s.`);
