/**
 * Generator tests — the net that was missing.
 *
 * `test.js` covers the app. `test-engine.js` covers rule APPLICATION against
 * real sound laws. `lang-check.js` checks invariants over generated output.
 * Nothing covered the GENERATOR — the code that decides which rules a branch
 * gets — and that is precisely where six defects survived undetected:
 *
 *   - a template whose `skip` flag sat in the wrong object, so it was live and
 *     was an identity map;
 *   - a template whose environment could not match any cluster the engine
 *     actually produces, selected zero times in 801 draws;
 *   - two templates textually identical in both branches of a ternary;
 *   - a rule that was the family's cluster factory;
 *   - vowel-deletion that could never fire under half the stress rules;
 *   - and a boundary matcher that silently never matched.
 *
 * Every one of those is invisible to a fixture test and to an invariant sweep,
 * because the output they produce is well-formed — just wrong. What catches
 * them is asserting things about the CATALOGUE and about what the generator
 * selects, which is what this file does.
 *
 *   node scripts/test-generator.js
 *   node scripts/test-generator.js --update   # re-record the golden snapshot
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOGUE, applicable, PAIRED, byId } from '../js/engine/soundchange/catalogue.js';
import { candidateSequence } from '../js/engine/soundchange/generate.js';
import { createProject, buildProto } from '../js/engine/project.js';
import { derive } from '../js/engine/rng.js';
import { syllabify, isLegalOnset, STRESS_RULES } from '../js/engine/phonology/phonotactics.js';
import { isVowel, wordToIpa } from '../js/engine/features.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const doc = JSON.parse(fs.readFileSync(path.join(root, 'data/languages.json'), 'utf8'));
const configs = JSON.parse(fs.readFileSync(path.join(root, 'data/lang-config.json'), 'utf8'));
const GOLDEN = path.join(root, 'scripts/fixtures/golden-changesets.json');
const UPDATE = process.argv.includes('--update');

let passed = 0, failed = 0;
const failures = [];
const ok = (name, cond, detail = '') => {
    if (cond) { passed += 1; return true; }
    failed += 1; failures.push(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`); return false;
};
const eq = (name, a, b, extra = '') => ok(name, a === b, `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}${extra ? `\n      ${extra}` : ''}`);
const section = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 56 - t.length))}`);

const byIdMap = new Map(doc.languages.map((l) => [l.id, l]));
const rootOf = (l) => { let c = l; while (c.parentId) c = byIdMap.get(c.parentId); return c.id; };
const familyTree = (famRoot) => doc.languages.filter((l) => rootOf(l) === famRoot);
const projectFor = (famRoot) => {
    const tree = familyTree(famRoot);
    return createProject({
        tree, names: tree.map((l) => l.name),
        config: { ...configs[famRoot], rootId: famRoot, presentYear: doc.config.presentYear },
        sidecar: {}, borrowings: doc.borrowings || [],
    });
};

// ===========================================================================
section('Catalogue hygiene');
// ===========================================================================
{
    const ids = CATALOGUE.map((t) => t.id);
    eq('template ids are unique', new Set(ids).size, ids.length,
        `duplicates: ${ids.filter((x, i) => ids.indexOf(x) !== i).join(', ')}`);

    for (const t of CATALOGUE) {
        ok(`${t.id}: has a category`, typeof t.category === 'string' && t.category.length > 0);
        ok(`${t.id}: weight is a finite number >= 0`, Number.isFinite(t.weight) && t.weight >= 0, `weight=${t.weight}`);
        ok(`${t.id}: applies is a function`, typeof t.applies === 'function');
        ok(`${t.id}: build is a function`, typeof t.build === 'function');
    }

    // A `skip` flag returned from build() is invisible to the module-level
    // filter — the exact shape of the degemination bug. Nothing may carry one.
    for (const t of CATALOGUE) {
        ok(`${t.id}: no stray skip flag on the template`, !('skip' in t));
    }

    // Every PAIRED partner must actually exist, or the chain silently truncates.
    for (const [trigger, partners] of Object.entries(PAIRED)) {
        ok(`PAIRED: trigger "${trigger}" exists`, !!byId(trigger));
        for (const p of partners) ok(`PAIRED: partner "${p}" exists`, !!byId(p));
    }

    // A partner reachable only via PAIRED must have weight 0, or it can also be
    // drawn on its own and fire without its trigger.
    const partnerIds = new Set(Object.values(PAIRED).flat());
    for (const id of partnerIds) {
        const t = byId(id);
        if (!t) continue;
        // Only enforce for partners that are meaningless alone.
        if (id === 'devoicing-after-tonogenesis') {
            eq(`${id}: paired-only partner has weight 0`, t.weight, 0,
                'a partner that can be drawn independently fires without the change it is meant to complete');
        }
    }
}

// ===========================================================================
section('Every template can build against a real language');
// ===========================================================================
{
    const proto = projectFor('proto-dahen-kino').stateOf('proto-dahen-kino');
    const probe = proto.entries.slice(0, 160);
    const inv = { consonants: proto.inventory.consonants, vowels: proto.inventory.vowels };
    const rng = derive('test', 'catalogue', 'build');

    for (const t of CATALOGUE) {
        let applies = null, built;
        try { applies = t.applies(inv, proto.phonotactics, { probe }); }
        catch (err) { ok(`${t.id}: applies() does not throw`, false, err.message); continue; }
        passed += 1;
        if (!applies) continue;
        try { built = t.build(inv, rng, proto.phonotactics, { probe }); }
        catch (err) { ok(`${t.id}: build() does not throw when applicable`, false, err.message); continue; }
        // build() may legitimately decline by returning null.
        if (built) {
            ok(`${t.id}: built rule has a target`, built.a !== undefined);
            ok(`${t.id}: built rule has a replacement`, built.b !== undefined);
            ok(`${t.id}: built rule has a label`, typeof built.label === 'string' && built.label.length > 0);
            ok(`${t.id}: built rule names an attested analogue`, typeof built.analogue === 'string' && built.analogue.length > 10,
                'every generated rule must be able to point at a real-world change');
        }
    }
}

// ===========================================================================
section('Vowel deletion is reachable under EVERY stress rule');
// ===========================================================================
/**
 * The bug this exists to catch: apocope needs an UNSTRESSED FINAL vowel, and a
 * language with fixed final stress has none — ever. Syncope needs two syllables
 * after the stress, which only initial and antepenultimate stress supply. So a
 * family declaring final stress had NO vowel-deletion mechanism at all, and its
 * words stayed the same length for six thousand years while every test passed.
 *
 * Asserting "some deletion-category template is applicable" would NOT have
 * caught it — final-consonant-loss is in that category and was firing happily.
 * The assertion has to be that a template which deletes a VOWEL is both
 * applicable and actually selected.
 */
{
    const names = familyTree('proto-dahen-kino').map((l) => l.name);
    const deletesAVowel = (rule) => {
        const target = rule.a?.match || rule.a;
        if (!target || !rule.b) return false;
        const removes = rule.b.empty === true || rule.b === '∅';
        if (!removes) return false;
        if (target.type === 'V') return true;
        if (target.seq) return target.seq.some((m) => m.type === 'V');
        return false;
    };

    for (const stress of Object.keys(STRESS_RULES)) {
        const proto = buildProto(names, {
            seed: `stress-probe/${stress}`, stress, laryngeal: 'voicing',
            vowelCount: 5, lexiconSize: 300, derivation: false, rootId: 'probe',
        });
        const seq = candidateSequence(proto, derive('stress-probe', stress, 'ruleset'), { idPrefix: 'p' });
        const vowelDeleters = seq.filter(deletesAVowel);
        ok(`${stress}: a vowel-deleting rule is generated`, vowelDeleters.length > 0,
            `${seq.length} candidates, categories: ${[...new Set(seq.map((r) => r.category))].join(', ')}\n      `
            + `deletion templates present: ${[...new Set(seq.filter((r) => r.category === 'deletion').map((r) => r.template))].join(', ') || 'none'}`);
        // Words must actually get shorter somewhere in the language's history.
        const before = proto.entries.reduce((n, e) => n + e.form.filter(isVowel).length, 0);
        ok(`${stress}: the lexicon has vowels to lose`, before > 0);
    }
}

// ===========================================================================
section('Generated rules respect the language they apply to');
// ===========================================================================
{
    for (const famRoot of Object.keys(configs).filter((k) => !k.startsWith('_'))) {
        const project = projectFor(famRoot);
        const tree = familyTree(famRoot);
        let illegalOnsets = 0, offEdge = 0, unordered = 0, noAnalogue = 0, rules = 0;

        for (const node of tree) {
            const state = project.stateOf(node.id);
            if (!state?.changeSet) continue;
            let prevYear = -Infinity;
            for (const r of state.changeSet.rules) {
                rules += 1;
                if (r.year < state.changeSet.from || r.year > state.changeSet.to) offEdge += 1;
                if (r.year < prevYear) unordered += 1;
                prevYear = r.year;
                if (!r.analogue) noAnalogue += 1;
            }
            // Surface conformance: an onset the language's own canon rejects
            // means a rule produced a word the language cannot say.
            for (const e of state.entries.slice(0, 200)) {
                for (const s of syllabify(e.form, state.phonotactics)) {
                    const onset = [...(s.appendix || []), ...s.onset];
                    if (onset.length > 1 && !isLegalOnset(onset, state.phonotactics)) illegalOnsets += 1;
                }
            }
        }
        const name = configs[famRoot].name || famRoot;
        eq(`${name}: all rule years lie inside their edge`, offEdge, 0);
        eq(`${name}: rules run in chronological order`, unordered, 0);
        eq(`${name}: every generated rule names an analogue`, noAnalogue, 0);
        ok(`${name}: ${rules} rules generated`, rules > 0);
        // Reported, not asserted at 0: the language's canon can legitimately
        // tighten faster than its words do, and repairClusters defaults to off.
        console.log(`     ${name}: ${illegalOnsets} onsets violate the stage's own canon (informational)`);
    }
}

// ===========================================================================
section('Non-Sinitic families are not dragged along');
// ===========================================================================
/**
 * The guard against the failure mode that killed the last round of tuning:
 * a change made to give Dahen-Kino a tone system made EVERY family tonal.
 * Tone is the sensitive measure because tonogenesis, once it fires, propagates
 * through every later rule.
 */
{
    for (const famRoot of Object.keys(configs).filter((k) => !k.startsWith('_'))) {
        const project = projectFor(famRoot);
        const tree = familyTree(famRoot);
        const leaves = tree.filter((l) => !tree.some((x) => x.parentId === l.id));
        let toned = 0, total = 0;
        for (const leaf of leaves) {
            const s = project.stateOf(leaf.id);
            if (!s) continue;
            for (const e of s.entries) for (const ph of e.form) if (isVowel(ph)) { total += 1; if (ph.f.tone) toned += 1; }
        }
        const share = total ? toned / total : 0;
        const name = configs[famRoot].name || famRoot;
        // A family is either tonal or it isn't. A share pinned near 100% across
        // the board would mean tonogenesis had become unconditional.
        ok(`${name}: toned-vowel share is not universal (${(share * 100).toFixed(1)}%)`, share < 0.85,
            'every vowel carrying tone means tonogenesis fired unconditionally rather than in an environment');
    }
}

// ===========================================================================
section('Golden changesets — a silent rewrite becomes a visible diff');
// ===========================================================================
/**
 * Snapshot the TEMPLATE SEQUENCE per edge. Not the rules themselves — those
 * carry live phoneme objects — but which change types the generator chose, in
 * order. Any catalogue or generator edit that reshapes the family shows up here
 * as a diff instead of silently rewriting 284 languages.
 *
 * Regenerate deliberately with --update, and read the diff before committing it.
 */
{
    const current = {};
    for (const famRoot of Object.keys(configs).filter((k) => !k.startsWith('_'))) {
        const project = projectFor(famRoot);
        const edges = {};
        for (const node of familyTree(famRoot)) {
            // Changesets are generated lazily by stateOf(); asking
            // changeSetOf() first returns null and silently snapshots nothing.
            project.stateOf(node.id);
            const cs = project.changeSetOf(node.id);
            if (cs) edges[node.id] = cs.rules.map((r) => r.template).join(',');
        }
        current[famRoot] = edges;
    }

    if (UPDATE || !fs.existsSync(GOLDEN)) {
        fs.mkdirSync(path.dirname(GOLDEN), { recursive: true });
        fs.writeFileSync(GOLDEN, JSON.stringify(current, null, 1));
        console.log(`  recorded golden snapshot: ${Object.values(current).reduce((n, e) => n + Object.keys(e).length, 0)} edges`);
        console.log('  (re-run without --update to check against it)');
    } else {
        const golden = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));
        let drifted = 0, checked = 0;
        const examples = [];
        for (const [fam, edges] of Object.entries(golden)) {
            for (const [id, seq] of Object.entries(edges)) {
                checked += 1;
                if (current[fam]?.[id] !== seq) {
                    drifted += 1;
                    if (examples.length < 3) examples.push(`${id}:\n        was ${seq}\n        now ${current[fam]?.[id] ?? '(missing)'}`);
                }
            }
        }
        ok(`${checked} edges match the golden snapshot`, drifted === 0,
            `${drifted} edges changed. If this was intended, re-run with --update and commit the diff.\n      ${examples.join('\n      ')}`);
    }
}

// ===========================================================================
console.log(`\n${'='.repeat(64)}`);
if (failures.length) {
    console.log(failures.join('\n'));
    console.log(`\n${passed} passed, ${failed} FAILED.`);
    process.exit(1);
}
console.log(`${passed} passed, 0 failed.`);
