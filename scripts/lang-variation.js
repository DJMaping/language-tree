/**
 * The variation report — what a language looks like when it is not one thing.
 *
 *   node scripts/lang-variation.js                  # every family, summary
 *   node scripts/lang-variation.js "Alqiran"        # one language, in full
 *   node scripts/lang-variation.js --measure        # the numbers, against Earth
 *
 * Four layers, none of which the engine had before, and each of which is a
 * different answer to "why does this not read like a real language":
 *
 *   SYNTAX      word order, its correlates, and every change in the lineage
 *   DOUBLETS    the same word arriving twice, and the changes that date the
 *               second arrival
 *   REGISTER    the formal stratum against the everyday one, and casual speech
 *               against careful
 *   NAMES       a stratified toponymy, oldest first, each name labelled with
 *               why its own speakers can or cannot read it
 *
 * The `--measure` mode is the one that matters for tuning. Everything else here
 * is for reading.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createProject } from '../js/engine/project.js';
import { derive } from '../js/engine/rng.js';
import { describeSyntax, formatSyntax, coherence, generateSyntax, BASIC_ORDERS } from '../js/engine/syntax/parameters.js';
import { formatSyntaxChanges } from '../js/engine/syntax/drift.js';
import { findDoublets, formatDoublets } from '../js/engine/lexicon/doublets.js';
import { colloquialForms, formalRegister, dialectVariants, formatRegisters } from '../js/engine/lexicon/register.js';
import { coinArchaicLayer, formatNameLayer } from '../js/engine/lexicon/toponyms.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const doc = JSON.parse(fs.readFileSync(path.join(root, 'data/languages.json'), 'utf8'));
const configs = JSON.parse(fs.readFileSync(path.join(root, 'data/lang-config.json'), 'utf8'));

const byId = new Map(doc.languages.map((l) => [l.id, l]));
const rootOf = (l) => { let c = l; while (c.parentId) c = byId.get(c.parentId); return c.id; };
const FAMILIES = Object.keys(configs).filter((k) => !k.startsWith('_'));

const args = process.argv.slice(2);
const MEASURE = args.includes('--measure');
const target = args.find((a) => !a.startsWith('--'));

const projects = new Map();
function projectFor(fam) {
    if (projects.has(fam)) return projects.get(fam);
    const tree = doc.languages.filter((l) => rootOf(l) === fam);
    const p = tree.length ? createProject({
        tree,
        names: tree.map((l) => l.name),
        config: { ...configs[fam], rootId: fam, presentYear: doc.config.presentYear },
        sidecar: {},
        borrowings: doc.borrowings || [],
    }) : null;
    projects.set(fam, p);
    return p;
}
const leavesOf = (fam) => {
    const tree = doc.languages.filter((l) => rootOf(l) === fam);
    return tree.filter((l) => !tree.some((x) => x.parentId === l.id));
};
const rule = (t) => console.log('\n' + '═'.repeat(74) + `\n${t}\n` + '═'.repeat(74));

// ---------------------------------------------------------------------------
// One language, in full
// ---------------------------------------------------------------------------

function detail(name) {
    const node = doc.languages.find((l) => l.name.toLowerCase() === name.toLowerCase() || l.id === name);
    if (!node) { console.log(`No language called "${name}".`); process.exit(1); }
    const fam = rootOf(node);
    const project = projectFor(fam);
    const state = project.stateOf(node.id);
    if (!state) { console.log(`${node.name} has no generated language — its family has no config entry.`); process.exit(1); }

    rule(`${node.name}   (${configs[fam].name}, ${node.born} → ${node.died ?? 'living'})`);

    console.log('\n── Syntax ' + '─'.repeat(60));
    console.log(formatSyntax(state.syntax));
    const changes = state.syntax?.changes || [];
    if (changes.length) {
        console.log('\n   How it got there:');
        console.log(formatSyntaxChanges(changes).split('\n').map((l) => '  ' + l).join('\n'));
    } else {
        console.log('\n   No syntactic change in this lineage — which is the common outcome.');
    }

    console.log('\n── Doublets ' + '─'.repeat(58));
    const sets = findDoublets(state, { bornOf: (id) => project.nodeOf(id)?.born ?? null });
    console.log(formatDoublets(sets, { limit: 8 }));

    console.log('\n── Register ' + '─'.repeat(58));
    console.log(formatRegisters(
        colloquialForms(state, derive(configs[fam].seed, node.id, 'colloquial')),
        formalRegister(state), { limit: 8 },
    ));

    const dial = dialectVariants(project, node.id);
    console.log('\n── Dialect ' + '─'.repeat(59));
    if (!dial || !dial.variants.length) {
        console.log('   No conservative area — this stage is too short-lived for one to have formed.');
    } else {
        console.log(`   A conservative area that did not take: ${dial.withheld.map((r) => r.label).join(', ')}`);
        console.log(`   ${dial.variants.length} words differ (${Math.round(dial.share * 100)}% of those checked)`);
        for (const v of dial.variants.slice(0, 8)) {
            console.log(`     "${v.gloss}"   standard ${v.standard}   conservative ${v.conservative}`);
        }
    }

    console.log('\n── Names ' + '─'.repeat(61));
    const names = coinArchaicLayer(project, node.id, derive(configs[fam].seed, node.id, 'toponyms'), { count: 12 });
    console.log(formatNameLayer(names));
    console.log('');
}

// ---------------------------------------------------------------------------
// Every family, summary
// ---------------------------------------------------------------------------

function summary() {
    rule('VARIATION — what each family has that a single idiolect does not');
    for (const fam of FAMILIES) {
        const project = projectFor(fam);
        if (!project) continue;
        const proto = project.stateOf(fam);
        const leaves = leavesOf(fam);

        let doublets = 0, formal = 0, casual = 0, dialects = 0, syntaxChanges = 0, orderChanges = 0;
        const orders = new Map();
        for (const l of leaves) {
            let st; try { st = project.stateOf(l.id); } catch { continue; }
            doublets += findDoublets(st, { bornOf: (id) => project.nodeOf(id)?.born ?? null }).length;
            formal += formalRegister(st).length;
            casual += colloquialForms(st, derive(configs[fam].seed, l.id, 'colloquial')).length;
            if (dialectVariants(project, l.id)?.variants.length) dialects += 1;
            const ch = st.syntax?.changes || [];
            syntaxChanges += ch.length;
            orderChanges += ch.filter((c) => c.parameter === 'order').length;
            const k = `${st.syntax?.order}/${st.syntax?.freedom}`;
            orders.set(k, (orders.get(k) || 0) + 1);
        }

        console.log(`\n${configs[fam].name}  —  ${leaves.length} modern languages`);
        console.log(`  proto syntax   ${describeSyntax(proto?.syntax).split('\n')[0]}`);
        console.log(`  today          ${[...orders].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}×${n}`).join('  ')}`);
        console.log(`  syntax changes ${syntaxChanges} (${orderChanges} of them to the basic order)`);
        console.log(`  doublets       ${doublets}`);
        console.log(`  register       ${formal} formal/everyday pairs, ${casual} words with a casual form`);
        console.log(`  dialects       ${dialects}/${leaves.length} stages have a conservative area`);
    }
    console.log('\nRun with a language name for the full picture, or --measure for the figures.\n');
}

// ---------------------------------------------------------------------------
// The measurements
// ---------------------------------------------------------------------------

function measure() {
    rule('1. WORD ORDER  —  is the distribution the one Earth shows?');
    console.log('Earth (WALS ch.81, 1377 languages): SOV 41%, SVO 35%, VSO 7%, VOS 2%,');
    console.log('       OVS 0.8%, OSV 0.3%. Order change is RARE: PIE to English is one');
    console.log('       change in 5,500 years.\n');
    /**
     * Counted per FAMILY, not per language.
     *
     * A per-language tally is not a measure of the draw at all: an order is
     * drawn once, at the proto, and then inherited by every descendant, so a
     * family with 62 leaves votes 62 times for one draw. Reading that as a
     * distribution says the engine produces 45% OVS when what it actually did
     * was roll OVS once for a large family. Standing rule 6 — fix the ruler
     * before trusting the reading.
     *
     * Six families is far too small a sample to compare against WALS anyway, so
     * the honest presentation is the family list itself, plus a separate
     * large-sample check of the draw underneath it.
     */
    let leaves = 0, orderChanges = 0, lineagesChanged = 0, totalSpan = 0;
    console.log('  Drawn per family (six draws is not a distribution — it is six draws):');
    for (const fam of FAMILIES) {
        const project = projectFor(fam);
        if (!project) continue;
        const proto = project.stateOf(fam);
        const ls = leavesOf(fam);
        const modern = new Map();
        for (const l of ls) {
            let st; try { st = project.stateOf(l.id); } catch { continue; }
            if (!st.syntax) continue;
            leaves += 1;
            modern.set(st.syntax.order, (modern.get(st.syntax.order) || 0) + 1);
            const oc = (st.syntax.changes || []).filter((c) => c.parameter === 'order').length;
            orderChanges += oc;
            if (oc) lineagesChanged += 1;
            const rootNode = doc.languages.find((x) => x.id === fam);
            totalSpan += (l.died ?? doc.config.presentYear) - (rootNode?.born ?? 0);
        }
        const earth = (BASIC_ORDERS[proto?.syntax?.order]?.weight ?? 0) * 100;
        const flag = earth < 2 ? '   ← a genuinely rare order for a family this size; set config.syntax.order to override' : '';
        console.log(`    ${(configs[fam].name).padEnd(18)} proto ${String(proto?.syntax?.order).padEnd(4)} (Earth ${earth.toFixed(1)}%)`
            + `   today ${[...modern].map(([k, n]) => `${k}×${n}`).join(' ')}${flag}`);
    }

    // The draw itself, over a sample big enough to mean something.
    const sample = new Map();
    const N = 2000;
    for (let i = 0; i < N; i++) {
        const s = generateSyntax(derive('measure', `draw${i}`, 'syntax'), { morphologyCases: 4 });
        sample.set(s.order, (sample.get(s.order) || 0) + 1);
    }
    /**
     * Compared against the RENORMALISED Earth figures.
     *
     * WALS leaves ~14% of languages with no dominant order, and the engine does
     * not model that category — every language it makes has one. So the draw is
     * over the 86% that do, and comparing it against the raw WALS percentages
     * would report every row as uniformly too high and flag a bias that is
     * really just the missing category.
     */
    const totalWeight = Object.values(BASIC_ORDERS).reduce((a, o) => a + o.weight, 0);
    console.log(`\n  The underlying draw, over ${N} samples, against WALS renormalised over`);
    console.log('  the languages that HAVE a dominant order (the engine models no other kind):');
    for (const [order, spec] of Object.entries(BASIC_ORDERS)) {
        const got = ((sample.get(order) || 0) / N) * 100;
        const want = (spec.weight / totalWeight) * 100;
        const off = Math.abs(got - want) > Math.max(1.5, want * 0.25) ? '  OFF' : '';
        console.log(`    ${order.padEnd(5)} ${got.toFixed(1).padStart(5)}%   Earth ${want.toFixed(1).padStart(5)}%${off}   ${'█'.repeat(Math.round(got / 2))}`);
    }
    const perMillennium = totalSpan ? (orderChanges / (totalSpan / 1000)) : 0;
    console.log(`\n  ${orderChanges} basic-order changes across ${leaves} lineages (${lineagesChanged} lineages affected)`);
    console.log(`  = ${perMillennium.toFixed(3)} per lineage-millennium.  Earth is roughly 0.1-0.3.`);
    console.log(perMillennium < 0.05
        ? '  BELOW BAND. The trigger is core-case collapse, and morphology currently\n'
          + '  erodes an order of magnitude too slowly — see docs/realism-plan-2.md item 9.\n'
          + '  This measure should be re-read once analogical levelling lands.'
        : perMillennium > 0.5 ? '  ABOVE BAND — order is changing too readily.' : '  in range');

    rule('2. GREENBERGIAN COHERENCE  —  is anything mid-transition?');
    console.log('Earth: no language is perfectly consistent. German is verb-final in');
    console.log('       subordinate clauses and verb-second in main ones; Mandarin is SVO');
    console.log('       with postpositions and prenominal relatives; Persian is SOV with');
    console.log('       prepositions. A generator emitting 100% coherence is emitting an');
    console.log('       idealisation nobody has recorded.\n');
    const buckets = { '100%': 0, '80-99%': 0, '60-79%': 0, 'under 60%': 0 };
    for (const fam of FAMILIES) {
        const project = projectFor(fam);
        if (!project) continue;
        for (const l of leavesOf(fam)) {
            let st; try { st = project.stateOf(l.id); } catch { continue; }
            const c = coherence(st.syntax);
            if (c.score == null) continue;
            if (c.score >= 0.999) buckets['100%'] += 1;
            else if (c.score >= 0.8) buckets['80-99%'] += 1;
            else if (c.score >= 0.6) buckets['60-79%'] += 1;
            else buckets['under 60%'] += 1;
        }
    }
    for (const [k, v] of Object.entries(buckets)) {
        console.log(`  ${k.padEnd(11)} ${String(v).padStart(4)}   ${'█'.repeat(Math.round((v / Math.max(1, leaves)) * 50))}`);
    }
    console.log(buckets['100%'] / Math.max(1, leaves) > 0.4
        ? '  TOO TIDY — most languages should be carrying at least one misaligned parameter.'
        : '  in range — most languages carry a misaligned parameter, as real ones do.');

    rule('3. DOUBLETS  —  the same word arriving twice');
    console.log('Earth: English has hundreds (chief/chef, cattle/chattel, warranty/guarantee),');
    console.log('       and they exist because it had two French sources at two dates. A');
    console.log('       language with no prestige ancestor and no heavy contact has almost');
    console.log('       none, so the right answer varies enormously by family history.\n');
    for (const fam of FAMILIES) {
        const project = projectFor(fam);
        if (!project) continue;
        let n = 0, withAny = 0, spanSum = 0, spanN = 0;
        const ls = leavesOf(fam);
        for (const l of ls) {
            let st; try { st = project.stateOf(l.id); } catch { continue; }
            const sets = findDoublets(st, { bornOf: (id) => project.nodeOf(id)?.born ?? null });
            n += sets.length;
            if (sets.length) withAny += 1;
            for (const s of sets) {
                if (s.escaped.length) { spanSum += s.escaped.length; spanN += 1; }
            }
        }
        const classical = configs[fam].classical ? `classical source: ${configs[fam].classical.sourceId}` : 'no classical source';
        console.log(`  ${(configs[fam].name).padEnd(18)} ${String(n).padStart(5)} sets in ${withAny}/${ls.length} languages`
            + `   ${spanN ? `mean ${(spanSum / spanN).toFixed(1)} changes apart` : ''}   (${classical})`);
    }

    rule('4. REGISTER AND DIALECT  —  is the language one thing?');
    console.log('Earth: every living language has a formal/colloquial split and internal');
    console.log('       geographic variation. A stage with neither is an idiolect, not a');
    console.log('       language.\n');
    for (const fam of FAMILIES) {
        const project = projectFor(fam);
        if (!project) continue;
        const ls = leavesOf(fam);
        let formal = 0, casual = 0, dial = 0;
        for (const l of ls) {
            let st; try { st = project.stateOf(l.id); } catch { continue; }
            formal += formalRegister(st).length;
            casual += colloquialForms(st, derive(configs[fam].seed, l.id, 'colloquial')).length;
            if (dialectVariants(project, l.id)?.variants.length) dial += 1;
        }
        console.log(`  ${(configs[fam].name).padEnd(18)} formal pairs ${String(formal).padStart(5)}`
            + `   casual forms ${String(casual).padStart(5)}   dialect areas ${dial}/${ls.length}`);
    }

    rule('5. TOPONYMY  —  is the map older than the language on it?');
    console.log('Earth: English place names are stratified across four languages. The rivers');
    console.log('       are pre-Celtic (Thames, Avon), the forts Roman (-chester), the towns');
    console.log('       Old English (-ton, -ham) and Norse (-by, -thorpe). Most are opaque to');
    console.log('       their own speakers. A map where every name is readable has no past.\n');
    for (const fam of FAMILIES) {
        const project = projectFor(fam);
        if (!project) continue;
        const ls = leavesOf(fam);
        const readings = new Map();
        let strata = 0, sampled = 0;
        for (const l of ls.slice(0, 12)) {
            const names = coinArchaicLayer(project, l.id, derive(configs[fam].seed, l.id, 'toponyms'), { count: 10 });
            if (!names.length) continue;
            sampled += 1;
            strata += new Set(names.map((n) => n.stratum.ancestorId)).size;
            for (const n of names) readings.set(n.opacity.reading, (readings.get(n.opacity.reading) || 0) + 1);
        }
        const total = [...readings.values()].reduce((a, b) => a + b, 0) || 1;
        const opaque = total - (readings.get('transparent') || 0);
        console.log(`  ${(configs[fam].name).padEnd(18)} ${Math.round((opaque / total) * 100)}% opaque`
            + `   mean ${sampled ? (strata / sampled).toFixed(1) : 0} strata per map`);
        for (const [k, v] of [...readings].sort((a, b) => b[1] - a[1])) {
            console.log(`      ${k.padEnd(24)} ${String(v).padStart(4)}`);
        }
    }
    console.log('');
}

if (target) detail(target);
else if (MEASURE) measure();
else summary();
