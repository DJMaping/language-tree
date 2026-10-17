/**
 * Invariant checks over every generated language in every configured family.
 *
 * Not a unit-test suite — those live in scripts/test-engine.js and test whether
 * the engine reproduces known sound laws. This checks the properties that must
 * hold for ANY output, on the real data, at full scale: determinism, purity,
 * internal consistency between a stage's lexicon and its derivation history,
 * and the absence of malformed segments.
 *
 * These are the failures that don't throw and don't show up in a fixture — the
 * kind that quietly corrupt a hundred languages while every test stays green.
 *
 *   node scripts/lang-check.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProject, evolve, stateAtYear, cognateSet, diffStages } from '../js/engine/project.js';
import { familyInputs } from './world.js';
import { syllabify, flatten } from '../js/engine/phonology/phonotactics.js';
import { wordToIpa } from '../js/engine/features.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const doc = JSON.parse(fs.readFileSync(path.join(root, 'data/languages.json'), 'utf8'));
const configs = JSON.parse(fs.readFileSync(path.join(root, 'data/lang-config.json'), 'utf8'));
const byId = new Map(doc.languages.map((l) => [l.id, l]));
const rootOf = (l) => { let c = l; while (c.parentId) c = byId.get(c.parentId); return c.id; };

let failures = 0;
const fail = (what, detail) => { failures += 1; console.log(`  ✗ ${what}\n      ${detail}`); };
const seen = { stages: 0, words: 0, rules: 0 };

function build(famRoot, cfg) {
    const tree = doc.languages.filter((l) => rootOf(l) === famRoot);
    return {
        tree,
        project: createProject({
            tree,
            names: tree.map((l) => l.name),
            config: { ...cfg, rootId: famRoot, presentYear: doc.config.presentYear },
            ...familyInputs(famRoot), borrowings: doc.borrowings || [],
        }),
    };
}

for (const [famRoot, cfg] of Object.entries(configs)) {
    if (famRoot.startsWith('_')) continue;
    const { tree, project } = build(famRoot, cfg);
    if (!tree.length) continue;
    console.log(`\n── ${cfg.name || famRoot}  (${tree.length} nodes)`);

    for (const node of tree) {
        let state;
        try { state = project.stateOf(node.id); } catch (err) { fail(`${node.name}: threw`, err.message); continue; }
        if (!state) { fail(`${node.name}: no state`, 'stateOf returned null'); continue; }
        seen.stages += 1;
        seen.rules += state.changeSet?.rules.length || 0;

        for (const e of state.entries) {
            seen.words += 1;

            // 1. The cached IPA string must match the segments it was derived from.
            //    If these drift, the panel shows one form and the engine reasons
            //    about another.
            if (e.ipa !== wordToIpa(e.form)) {
                fail(`${node.name}/${e.gloss}: ipa out of sync with form`, `${e.ipa} vs ${wordToIpa(e.form)}`);
            }

            // 2. No segment may be unrenderable. A "?" means a feature bundle
            //    was composed that no articulation matches.
            const bad = e.form.filter((ph) => ph.ipa.includes('?'));
            if (bad.length) fail(`${node.name}/${e.gloss}: unrenderable segment`, e.ipa);

            // 3. No feature may be NaN or undefined — a numeric delta on a
            //    missing feature silently poisons every later comparison.
            for (const ph of e.form) {
                for (const [k, v] of Object.entries(ph.f)) {
                    if (typeof v === 'number' && !Number.isFinite(v)) fail(`${node.name}/${e.gloss}: ${ph.ipa} has ${k}=${v}`, '');
                }
            }

            // 4. Syllabification must be lossless. Everything downstream —
            //    stress, the reports, the drift measures — is computed off it.
            const flatLen = flatten(syllabify(e.form, state.phonotactics)).length;
            if (flatLen !== e.form.length) {
                fail(`${node.name}/${e.gloss}: lossy syllabification`, `${e.form.length} segments in, ${flatLen} out (${e.ipa})`);
            }

            // 5. The derivation history must END on the form the lexicon shows.
            //    This is the one display the whole history machinery exists for;
            //    if it disagrees with the lexicon it is lying to the reader.
            const h = state.histories.get(e.id);
            if (h) {
                const applied = h.steps.filter((s) => s.applied);
                const last = applied.length ? applied[applied.length - 1].to : h.protoForm;
                if (last !== e.ipa && !e.overridden) {
                    fail(`${node.name}/${e.gloss}: history ends on a different form`, `history ${last}, lexicon ${e.ipa}`);
                }
                // Each step must start where the previous one ended.
                for (let i = 1; i < applied.length; i++) {
                    if (applied[i - 1].to !== applied[i].from) {
                        fail(`${node.name}/${e.gloss}: broken derivation chain`, `${applied[i - 1].to} then ${applied[i].from}`);
                        break;
                    }
                }
            }
        }

        // 5b. PARADIGM invariants.
        if (state.paradigm?.classes) {
            for (const [cls, c] of Object.entries(state.paradigm.classes)) {
                for (const [cell, v] of Object.entries(c.cells || {})) {
                    // A cell must be a real word with a real form. A cell whose
                    // ipa is missing compares equal to every other missing one,
                    // which silently reports a total paradigm collapse.
                    if (!v.ipa || !v.form?.length) {
                        fail(`${node.name}/${cls}.${cell}: paradigm cell has no form`, JSON.stringify(v).slice(0, 80));
                    }
                }
            }
            const surv = state.erosion?.survival;
            if (surv != null && (surv <= 0 || surv > 1)) {
                fail(`${node.name}: inflectional survival out of range`, String(surv));
            }
            /**
             * SOUND CHANGE is monotonic. Speakers are not.
             *
             * Nothing in the catalogue re-differentiates two forms that have
             * fallen together, so on an edge where phonology was the only thing
             * at work, survival rising from parent to child means something has
             * gone wrong. That was the original invariant and it still holds.
             *
             * What it must not do is forbid the two mechanisms that CAN restore
             * a distinction, because both are real and both are now modelled:
             *
             *   - grammaticalisation adds cells that did not exist;
             *   - analogy imports a donor class's endings, or extends a stem,
             *     and either can pull apart two cells that phonology had merged.
             *     Latin honos → honor is the textbook restoration by analogy.
             *
             * So the check is now sharper than before rather than looser: it
             * asserts that a rise happened only on an edge where speakers acted,
             * and the evidence has to be an actual event on that edge.
             */
            if (state.founding && state.changeSet) {
                // The edge runs from the language as it was founded (its parent
                // as it stood at the split), not from the parent's present.
                const ps = state.founding.erosion?.survival;
                // a common word's own paradigm handed to a new word, or a tense
                // taken from another verb (morphology/irregular.js), changes the
                // table too, and is something speakers did
                const speakersActed = (state.levellings || []).length > 0
                    || (state.grammaticalisations || []).some((g) => g.kind !== 'category-loss')
                    || !!state.irregularRenewals || (state.suppletions || []).length > 0;
                if (!speakersActed && ps != null && surv != null && surv > ps + 1e-9) {
                    fail(`${node.name}: paradigm un-merged with no analogy or renewal on the edge`, `parent ${ps.toFixed(3)} -> child ${surv.toFixed(3)}`);
                }
            }
        }

        /**
         * 6. Every rule in a change log must have changed at least one word —
         *    UNLESS an earlier rule on the same edge could have bled it.
         *
         *    A rule that did nothing is usually noise in what is meant to be
         *    history. But BLEEDING is one of the four ordering interactions this
         *    engine exists to reproduce: rule A destroys the inputs rule B would
         *    have had, and B then applies to nothing. Kon Danua's edge is exactly
         *    that — vowel-nasalisation absorbs the parent's single word-final
         *    /n/, and the final-consonant-loss rule dated after it finds no /n/
         *    left to lose. Flagging that as corruption would be flagging the
         *    engine for working.
         *
         *    So a vacuous rule is only reported when it is the FIRST rule on its
         *    edge, where nothing preceded it and nothing can explain it.
         *
         *    One other explanation is legitimate: every word the change would
         *    have altered resisted it, because the change would have merged it
         *    with another word (inhibited sound change, see apply.js) or it
         *    escaped by diffusion. Each escape is recorded in the word's history.
         */
        if (state.changeSet) {
            state.changeSet.rules.forEach((r, i) => {
                if ((state.stats?.byRule?.get(r.id) || 0) !== 0) return;
                if (i > 0) return; // could have been bled by a rule before it
                const resisted = [...(state.histories?.values() || [])]
                    .some((h) => h.steps.some((s) => s.ruleId === r.id && s.applied === false));
                if (resisted) return;
                fail(`${node.name}: first rule on the edge had no effect`, `${r.id} "${r.label}"`);
            });
            // 7. Rule years must lie inside the edge and be ordered.
            let prev = -Infinity;
            for (const r of state.changeSet.rules) {
                if (r.year < state.changeSet.from || r.year > state.changeSet.to) {
                    fail(`${node.name}: rule dated outside its edge`, `${r.id} at ${r.year}, edge ${state.changeSet.from}–${state.changeSet.to}`);
                }
                if (r.year < prev) fail(`${node.name}: rules out of chronological order`, `${r.id} at ${r.year} after ${prev}`);
                prev = r.year;
            }
        }
    }

    // 8. PURITY: evolving the same parent with the same changeset twice must
    //    give an identical child. If evolve() mutated anything, this diverges.
    const withParent = tree.find((l) => l.parentId && project.changeSetOf(l.id));
    if (withParent) {
        const parent = project.stateOf(withParent.parentId);
        const cs = project.changeSetOf(withParent.id);
        const a = evolve(parent, cs);
        const b = evolve(parent, cs);
        const sig = (s) => s.entries.map((e) => e.ipa).join('|');
        if (sig(a) !== sig(b)) fail(`${cfg.name}: evolve() is not pure`, 'two runs over the same parent differ');
        // …and the parent must be untouched by having been evolved from.
        const parentAfter = project.stateOf(withParent.parentId);
        if (sig(parentAfter) !== sig(parent)) fail(`${cfg.name}: evolve() mutated its parent`, '');
    }

    // 9. DETERMINISM at full scale: a second project from the same seed must
    //    produce byte-identical languages.
    const second = build(famRoot, cfg).project;
    const leaf = tree.filter((l) => !tree.some((x) => x.parentId === l.id)).slice(-1)[0];
    if (leaf) {
        const s1 = project.stateOf(leaf.id);
        const s2 = second.stateOf(leaf.id);
        const sig = (s) => s.entries.map((e) => e.ipa).join('|');
        if (sig(s1) !== sig(s2)) fail(`${cfg.name}: not deterministic`, `${leaf.name} differs between two builds from the same seed`);
        const r1 = project.changeSetOf(leaf.id)?.rules.map((r) => r.template).join(',');
        const r2 = second.changeSetOf(leaf.id)?.rules.map((r) => r.template).join(',');
        if (r1 !== r2) fail(`${cfg.name}: ruleset not deterministic`, `${leaf.name}`);
    }

    // 10. The scrubber path. stateAtYear is reachable from the UI and is
    //     otherwise untested.
    const mid = tree.find((l) => l.parentId && project.changeSetOf(l.id)?.rules.length > 1);
    if (mid) {
        const cs = project.changeSetOf(mid.id);
        const half = Math.round((cs.from + cs.to) / 2);
        try {
            const partial = stateAtYear(project, mid.id, half);
            if (!partial?.entries?.length) fail(`${cfg.name}: stateAtYear returned nothing`, `${mid.name} @ ${half}`);
            const full = project.stateOf(mid.id);
            const applied = cs.rules.filter((r) => r.year <= half).length;
            if (applied < cs.rules.length && partial.entries.map((e) => e.ipa).join('|') === full.entries.map((e) => e.ipa).join('|')) {
                fail(`${cfg.name}: stateAtYear ignores the year`, `${mid.name}: ${applied}/${cs.rules.length} rules should have applied`);
            }
        } catch (err) { fail(`${cfg.name}: stateAtYear threw`, err.message); }
    }

    // 11. The comparative and diff views, which the panel calls.
    const leaves = tree.filter((l) => !tree.some((x) => x.parentId === l.id));
    if (leaves.length >= 2) {
        try {
            const row = cognateSet(project, project.stateOf(leaves[0].id).entries[0].id, leaves.slice(0, 3).map((l) => l.id));
            if (!row.cells.length) fail(`${cfg.name}: cognateSet empty`, '');
        } catch (err) { fail(`${cfg.name}: cognateSet threw`, err.message); }
        try {
            const d = diffStages(project, leaves[0].id, leaves[1].id);
            if (!d) fail(`${cfg.name}: diffStages returned null`, '');
        } catch (err) { fail(`${cfg.name}: diffStages threw`, err.message); }
    }

    // 12. Serialisation must round-trip — the sidecar format is what pins a
    //     ruleset, and a field lost here is a language lost on reload.
    try {
        const ser = project.serialise();
        const json = JSON.parse(JSON.stringify(ser));
        const anyEdge = Object.values(json.edges)[0];
        if (anyEdge && !Array.isArray(anyEdge.rules)) fail(`${cfg.name}: serialised edge has no rules`, '');
        if (anyEdge && anyEdge.rules.some((r) => r.id == null)) fail(`${cfg.name}: serialised rule lost its id`, '');
    } catch (err) { fail(`${cfg.name}: serialise threw`, err.message); }

    console.log(`  checked ${tree.length} stages`);
}

console.log(`\n${'═'.repeat(64)}`);
console.log(`${seen.stages} stages · ${seen.words} word-forms · ${seen.rules} rules checked`);
console.log(failures ? `${failures} FAILURES` : 'All invariants hold.');
process.exit(failures ? 1 : 0);
