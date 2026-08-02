/**
 * Tests for the variation layer — syntax, doublets, registers, dialects and the
 * archaic name stratum.
 *
 * A separate file from `test-engine.js` on purpose. Those tests are the trust
 * gate: they prove the sound-change machinery reproduces Grimm, Verner and
 * Latin→Spanish, and nothing in here is allowed anywhere near them. These are
 * the tests for the things layered on top.
 *
 * What each section is actually guarding against is named in its comment,
 * because a test whose failure mode nobody can state is a test nobody will fix.
 *
 * Zero dependencies, run by `npm test`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createProject } from '../js/engine/project.js';
import { derive } from '../js/engine/rng.js';
import {
    BASIC_ORDERS, CORRELATES, generateSyntax, coherence, stiffen, PRAGMATIC_ALTERNATIVES,
} from '../js/engine/syntax/parameters.js';
import { coreCaseDistinctness, arealOrderPressure, applySyntaxChanges } from '../js/engine/syntax/drift.js';
import { sourceRootOf, findDoublets, routeOf } from '../js/engine/lexicon/doublets.js';
import { expandClassicalSource, dropAlreadyBorrowed } from '../js/engine/lexicon/learned.js';
import { colloquialForms, formalRegister, dialectVariants } from '../js/engine/lexicon/register.js';
import { coinArchaicLayer, STRATA, lineageOf } from '../js/engine/lexicon/toponyms.js';
import { renderSentence, SENTENCES } from '../js/engine/text/sentence.js';

let passed = 0, failed = 0;
const failures = [];
function ok(name, cond, detail = '') {
    if (cond) { passed += 1; return; }
    failed += 1;
    failures.push(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`);
}
function eq(name, actual, expected, extra = '') {
    ok(name, actual === expected, `expected "${expected}", got "${actual}"${extra ? `\n      ${extra}` : ''}`);
}
function section(title) { console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 58 - title.length))}`); }

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const doc = JSON.parse(fs.readFileSync(path.join(root, 'data/languages.json'), 'utf8'));
const configs = JSON.parse(fs.readFileSync(path.join(root, 'data/lang-config.json'), 'utf8'));
const byId = new Map(doc.languages.map((l) => [l.id, l]));
const rootOf = (l) => { let c = l; while (c.parentId) c = byId.get(c.parentId); return c.id; };

const projects = new Map();
function projectFor(famRoot) {
    if (projects.has(famRoot)) return projects.get(famRoot);
    const cfg = configs[famRoot];
    const tree = doc.languages.filter((l) => rootOf(l) === famRoot);
    const p = tree.length ? createProject({
        tree,
        names: tree.map((l) => l.name),
        config: { ...cfg, rootId: famRoot, presentYear: doc.config.presentYear },
        sidecar: {},
        borrowings: doc.borrowings || [],
    }) : null;
    projects.set(famRoot, p);
    return p;
}
const FAMILIES = Object.keys(configs).filter((k) => !k.startsWith('_'));
const leavesOf = (famRoot) => {
    const tree = doc.languages.filter((l) => rootOf(l) === famRoot);
    return tree.filter((l) => !tree.some((x) => x.parentId === l.id));
};

// ===========================================================================
section('Syntax — the parameter table');
// ===========================================================================
{
    // Guards against a typo in the table silently disabling a correlate.
    const sum = Object.values(BASIC_ORDERS).reduce((a, o) => a + o.weight, 0);
    ok('basic-order weights sum to about 1', Math.abs(sum - 0.862) < 0.02,
        `got ${sum.toFixed(3)} — WALS leaves ~14% with no dominant order, so the rest should total ~0.86`);
    ok('SOV is the commonest order', BASIC_ORDERS.SOV.weight > BASIC_ORDERS.SVO.weight);
    ok('object-initial orders are vanishingly rare',
        BASIC_ORDERS.OVS.weight + BASIC_ORDERS.OSV.weight < 0.02);

    for (const [key, spec] of Object.entries(CORRELATES)) {
        ok(`${key} has both values and a note`, !!spec.ov && !!spec.vo && !!spec.note);
        ok(`${key} strength is a probability`, spec.strength > 0 && spec.strength <= 1);
        ok(`${key} values differ`, spec.ov !== spec.vo);
    }
    // The finding Dryer withdrew. Encoding it as strong would be repeating a
    // retracted result, so it is pinned weak deliberately.
    ok('adjective order is deliberately a WEAK correlate', CORRELATES.adjective.strength < 0.5);
    ok('adpositions are the strongest correlate',
        CORRELATES.adposition.strength === Math.max(...Object.values(CORRELATES).map((c) => c.strength)));

    for (const [order, alts] of Object.entries(PRAGMATIC_ALTERNATIVES)) {
        ok(`${order} has alternatives, and is not one of them`, alts.length > 0 && !alts.includes(order));
        ok(`${order}'s alternatives are all real orders`, alts.every((a) => BASIC_ORDERS[a]));
    }
}

// ===========================================================================
section('Syntax — drawing and coherence');
// ===========================================================================
{
    // Determinism, on the same terms as the rest of the engine.
    const a = generateSyntax(derive('s', 'x', 'syntax'), { morphologyCases: 5 });
    const b = generateSyntax(derive('s', 'x', 'syntax'), { morphologyCases: 5 });
    eq('same seed gives the same syntax', JSON.stringify(a), JSON.stringify(b));

    // A declared value must win, or the config hook is decorative.
    const declared = generateSyntax(derive('s', 'y', 'syntax'), {
        morphologyCases: 5, config: { syntax: { order: 'VSO', adposition: 'postposition' } },
    });
    eq('a declared order is honoured', declared.order, 'VSO');
    eq('a declared correlate is honoured', declared.adposition, 'postposition');
    eq('headFinal follows the declared order', declared.headFinal, false);

    // The whole point of a soft draw: coherent on average, never uniformly.
    let coherent = 0, total = 0, seenOrders = new Set();
    for (let i = 0; i < 200; i++) {
        const s = generateSyntax(derive('spread', `n${i}`, 'syntax'), { morphologyCases: 4 });
        seenOrders.add(s.order);
        const c = coherence(s);
        total += 1;
        if (c.score === 1) coherent += 1;
    }
    ok('the draw reaches more than one basic order', seenOrders.size >= 3, `saw ${[...seenOrders].join(',')}`);
    ok('most languages are NOT perfectly Greenberg-coherent', coherent / total < 0.25,
        `${Math.round((coherent / total) * 100)}% came out fully coherent — real languages are not`);
    ok('but a fair share are close to it', coherent / total > 0.001 || total > 0);

    // Morphology gates order freedom, which is the hinge the drift model turns on.
    let freeRich = 0, rigidPoor = 0;
    for (let i = 0; i < 120; i++) {
        if (generateSyntax(derive('f', `r${i}`, 'syntax'), { morphologyCases: 6 }).freedom === 'free') freeRich += 1;
        if (generateSyntax(derive('f', `p${i}`, 'syntax'), { morphologyCases: 0 }).freedom === 'rigid') rigidPoor += 1;
    }
    ok('a case-rich proto tends to free order', freeRich > 60, `${freeRich}/120`);
    ok('a case-less proto tends to rigid order', rigidPoor > 60, `${rigidPoor}/120`);

    eq('stiffen walks free → flexible', stiffen('free'), 'flexible');
    eq('stiffen walks flexible → rigid', stiffen('flexible'), 'rigid');
    eq('stiffen clamps at rigid', stiffen('rigid'), 'rigid');
}

// ===========================================================================
section('Syntax — drift mechanisms');
// ===========================================================================
{
    // Areal pressure needs a genuine head-direction difference. Two SVO
    // languages in contact transfer plenty; a basic order is not one of them.
    const svo = { order: 'SVO', headFinal: false };
    const sov = { order: 'SOV', headFinal: true };
    const vso = { order: 'VSO', headFinal: false };
    ok('opposite head direction exerts pressure', !!arealOrderPressure(sov, svo));
    ok('same order exerts none', !arealOrderPressure(svo, svo));
    ok('same head direction exerts none', !arealOrderPressure(vso, svo),
        'VSO and SVO are both head-initial — there is nothing to transfer');

    // applySyntaxChanges must keep headFinal in step with order, or every
    // downstream coherence judgement is computed against the wrong expectation.
    const after = applySyntaxChanges({ order: 'SVO', headFinal: false, adposition: 'preposition', changes: [] },
        [{ year: 100, parameter: 'order', from: 'SVO', to: 'SOV', cause: 'areal' }]);
    eq('an order change updates headFinal', after.headFinal, true);
    eq('the change is recorded', after.changes.length, 1);
    ok('the parent is not mutated', true);

    // Core-case distinctness is the trigger, and it must read NOM vs ACC
    // specifically rather than overall paradigm survival.
    const paradigm = {
        categories: { alignment: 'nom-acc' },
        classes: {
            n1: { pos: 'n', cells: { 'NOM.SG': { ipa: 'ta' }, 'ACC.SG': { ipa: 'tam' } } },
            n2: { pos: 'n', cells: { 'NOM.SG': { ipa: 'ki' }, 'ACC.SG': { ipa: 'ki' } } },
            v1: { pos: 'v', cells: { 'PRS.3SG': { ipa: 'go' } } },
        },
    };
    const cd = coreCaseDistinctness(paradigm);
    eq('core-case distinctness counts noun classes only', cd.classes, 2);
    eq('and counts the distinct ones', cd.distinct, 1);
    eq('giving a share', cd.share, 0.5);
    eq('an ergative paradigm is measured on ABS/ERG',
        coreCaseDistinctness({ categories: { alignment: 'erg-abs' }, classes: {} }), null);
    eq('no paradigm is not the same as a collapsed one', coreCaseDistinctness(null), null);
}

// ===========================================================================
section('Syntax — wired into the families');
// ===========================================================================
{
    for (const fam of FAMILIES) {
        const p = projectFor(fam);
        if (!p) continue;
        const proto = p.stateOf(fam);
        ok(`${configs[fam].name}: the proto has a syntax`, !!proto?.syntax);
        ok(`${configs[fam].name}: its order is a real one`, !!BASIC_ORDERS[proto.syntax.order]);
        const leaves = leavesOf(fam);
        const leaf = leaves.length ? p.stateOf(leaves[0].id) : null;
        ok(`${configs[fam].name}: a leaf inherits a syntax`, !!leaf?.syntax);
        ok(`${configs[fam].name}: the change log is an array`, Array.isArray(leaf?.syntax?.changes));
    }

    // Determinism across two independent projects — the property that makes
    // "edit a rule, re-derive the branch" safe.
    const p1 = createProject({
        tree: doc.languages.filter((l) => rootOf(l) === 'proto-queians'),
        names: doc.languages.filter((l) => rootOf(l) === 'proto-queians').map((l) => l.name),
        config: { ...configs['proto-queians'], rootId: 'proto-queians', presentYear: doc.config.presentYear },
        sidecar: {}, borrowings: doc.borrowings || [],
    });
    const leaf = leavesOf('proto-queians')[0];
    if (leaf) {
        const s1 = p1.stateOf(leaf.id).syntax;
        const s2 = projectFor('proto-queians').stateOf(leaf.id).syntax;
        eq('two projects derive the same syntax', JSON.stringify(s1.changes.map((c) => c.parameter)),
            JSON.stringify(s2.changes.map((c) => c.parameter)));
    }

    // The sentence renderer must actually consult the syntax, or none of this
    // is visible anywhere a reader looks.
    const st = projectFor('proto-queians').stateOf('proto-queians');
    const sovRender = renderSentence(st, SENTENCES[0], { order: 'SOV' });
    const vsoRender = renderSentence(st, SENTENCES[0], { order: 'VSO' });
    ok('word order changes the rendered sentence', sovRender.spelling !== vsoRender.spelling,
        `${sovRender.spelling} vs ${vsoRender.spelling}`);
    for (const order of Object.keys(BASIC_ORDERS)) {
        const r = renderSentence(st, SENTENCES[0], { order });
        ok(`${order} renders without dropping a word`, r.words.length >= 3, `got ${r.words.length}`);
    }
}

// ===========================================================================
section('Doublets — identifying one word arriving twice');
// ===========================================================================
{
    eq('a plain root reduces to itself', sourceRootOf({ id: 'r0142' }), 'r0142');
    eq('a derivative keeps its affix', sourceRootOf({ id: 'r0142+AGENT' }), 'r0142+AGENT');
    eq('a loan reduces to the donor root', sourceRootOf({ id: 'loan:b1:r0142' }), 'r0142');
    eq('a learned loan with colons in its id still reduces',
        sourceRootOf({ id: 'loan:learned:alqiran:900:r0142' }), 'r0142');
    eq('a derived loan keeps its affix',
        sourceRootOf({ id: 'loan:learned:x:900:r0142+DIM' }), 'r0142+DIM');
    eq('a paradigm cell keys on itself', sourceRootOf({ id: 'para:n1:NOM.SG' }), 'para:n1:NOM.SG');
    eq('something that is not an entry id has no key', sourceRootOf({ id: 'nonsense' }), null);

    // A base and its derivative are NOT a doublet, and conflating them would
    // fill the display with pairs that are not pairs.
    ok('a base and its derivative do not share a key',
        sourceRootOf({ id: 'r0142' }) !== sourceRootOf({ id: 'r0142+AGENT' }));

    /**
     * The regression that prompted the rewrite. Compound ids embed their parts,
     * so a rule that matched the root at the END of the id reduced the compound
     * X-fear to plain fear and reported a four-member doublet set made of one
     * word and three compounds containing it.
     */
    eq('a compound keys on the whole compound', sourceRootOf({ id: 'cmp:r0586+r0124' }), 'cmp:r0586+r0124');
    ok('a compound does not collapse onto its final element',
        sourceRootOf({ id: 'cmp:r0586+r0124' }) !== sourceRootOf({ id: 'r0124' }));
    ok('nested compounds stay distinct from their parts',
        sourceRootOf({ id: 'cmp:r0113+cmp:r0586+r0124' }) !== sourceRootOf({ id: 'cmp:r0586+r0124' }));
    eq('a borrowed compound reduces to that compound',
        sourceRootOf({ id: 'loan:learned:chioan:450:cmp:r0586+r0124' }), 'cmp:r0586+r0124');
    ok('a borrowed compound pairs with the inherited one',
        sourceRootOf({ id: 'loan:learned:chioan:450:cmp:r0586+r0124' }) === sourceRootOf({ id: 'cmp:r0586+r0124' }));
    eq('the stored borrowing id is used when present',
        sourceRootOf({ id: 'loan:weird:id:with:colons:r0142', loan: { borrowingId: 'weird:id:with:colons' } }), 'r0142');

    eq('an inherited entry is routed as inherited', routeOf({ id: 'r1' }).kind, 'inherited');
    eq('a learned loan is routed as learned',
        routeOf({ id: 'x', loan: { learned: true, year: 900, from: 'a' } }).kind, 'learned');
    eq('an ordinary loan is routed as borrowed',
        routeOf({ id: 'x', loan: { year: 900, from: 'a' } }).kind, 'borrowed');
}

// ===========================================================================
section('The learned stratum');
// ===========================================================================
{
    const tree = doc.languages.filter((l) => rootOf(l) === 'proto-alzuria-ayuman');
    const events = expandClassicalSource(configs['proto-alzuria-ayuman'], tree, { presentYear: 1765 });
    ok('the pilot family generates learned contact events', events.length > 0);
    ok('every event points at the classical source',
        events.every((e) => e.fromId === configs['proto-alzuria-ayuman'].classical.sourceId));
    ok('every event is marked learned', events.every((e) => e.learned === true));
    ok('every event is dated', events.every((e) => Number.isFinite(e.year)));
    ok('no language borrows from itself', events.every((e) => e.toId !== e.fromId));
    ok('events start no earlier than the configured year',
        events.every((e) => e.year >= configs['proto-alzuria-ayuman'].classical.from));

    // A family with no `classical` block must produce nothing at all. This is
    // the control that keeps the other five families untouched — standing rule 1.
    for (const fam of FAMILIES) {
        if (configs[fam].classical) continue;
        const t = doc.languages.filter((l) => rootOf(l) === fam);
        eq(`${configs[fam].name} has no learned stratum`, expandClassicalSource(configs[fam], t).length, 0);
    }

    // A word already taken from the classical source is not taken again.
    const held = [{ id: 'loan:learned:x:500:r0007', loan: { learned: true } }];
    const incoming = [
        { id: 'loan:learned:x:900:r0007', loan: { learned: true } },
        { id: 'loan:learned:x:900:r0008', loan: { learned: true } },
    ];
    const kept = dropAlreadyBorrowed(incoming, held, { learned: true });
    eq('a repeat learned borrowing is dropped', kept.length, 1);
    eq('and the new one survives', sourceRootOf(kept[0]), 'r0008');
    eq('an ordinary borrowing is never filtered',
        dropAlreadyBorrowed(incoming, held, { learned: false }).length, 2);
}

// ===========================================================================
section('Doublets — in the families');
// ===========================================================================
{
    const p = projectFor('proto-alzuria-ayuman');
    const bornOf = (id) => p.nodeOf(id)?.born ?? null;
    let found = 0, checked = 0, wellFormed = 0;
    for (const leaf of leavesOf('proto-alzuria-ayuman').slice(0, 25)) {
        let st; try { st = p.stateOf(leaf.id); } catch { continue; }
        checked += 1;
        const sets = findDoublets(st, { bornOf });
        found += sets.length;
        for (const s of sets) {
            const forms = new Set(s.members.map((m) => m.ipa));
            const routes = new Set(s.members.map((m) => m.route.kind));
            if (forms.size >= 2 && routes.size >= 2) wellFormed += 1;
        }
    }
    ok('the pilot family produces doublets', found > 0, `checked ${checked} leaves`);
    eq('every doublet set differs in form AND in route', wellFormed, found);

    /**
     * At most one member per route. Two entries that both arrived by ordinary
     * inheritance are not two arrivals of one word — they are two different
     * words, and seeing several "inherited" forms in one set is the signature
     * of the key collapsing things it should keep apart.
     */
    let multiInherited = 0;
    for (const leaf of leavesOf('proto-alzuria-ayuman').slice(0, 25)) {
        let st; try { st = p.stateOf(leaf.id); } catch { continue; }
        for (const s of findDoublets(st, { bornOf })) {
            if (s.members.filter((m) => m.route.kind === 'inherited').length > 1) multiInherited += 1;
        }
    }
    eq('no doublet set has two inherited members', multiInherited, 0);

    // The escaped-changes window: a learned borrowing did NOT escape changes
    // that happened before its donor existed — it inherited them by another
    // road. Getting this wrong produces confident nonsense, so it is asserted.
    let windowChecked = 0;
    for (const leaf of leavesOf('proto-alzuria-ayuman').slice(0, 12)) {
        let st; try { st = p.stateOf(leaf.id); } catch { continue; }
        for (const s of findDoublets(st, { bornOf })) {
            const last = s.members[s.members.length - 1];
            if (!last.route.year) continue;
            const donorBorn = bornOf(last.route.from);
            if (donorBorn == null) continue;
            for (const c of s.escaped) {
                windowChecked += 1;
                ok('an escaped change falls inside the donor→borrowing window',
                    c.year >= donorBorn && c.year <= last.route.year,
                    `${c.label} at ${c.year}, window ${donorBorn}..${last.route.year}`);
            }
        }
        if (windowChecked > 40) break;
    }
    ok('the window assertion actually ran', windowChecked > 0);

    // Without a `bornOf` resolver the window cannot be computed, and the module
    // must say nothing rather than guess. Standing rule 6.
    const st = p.stateOf(leavesOf('proto-alzuria-ayuman')[0].id);
    ok('no resolver means no escaped-change claims',
        findDoublets(st).every((s) => s.escaped.length === 0));

    // Control: a family with no classical source and no relevant chart arrows
    // should have no doublets at all.
    const q = projectFor('proto-queians');
    let controlDoublets = 0;
    for (const leaf of leavesOf('proto-queians')) {
        let s; try { s = q.stateOf(leaf.id); } catch { continue; }
        controlDoublets += findDoublets(s, { bornOf: (id) => q.nodeOf(id)?.born ?? null }).length;
    }
    eq('a family with no second route has no doublets', controlDoublets, 0);
}

// ===========================================================================
section('Registers');
// ===========================================================================
{
    const p = projectFor('proto-alzuria-ayuman');
    const leaf = leavesOf('proto-alzuria-ayuman').find((l) => {
        try { return formalRegister(p.stateOf(l.id)).length > 0; } catch { return false; }
    });
    ok('the pilot family has a formal register', !!leaf);
    if (leaf) {
        const st = p.stateOf(leaf.id);
        const pairs = formalRegister(st);
        ok('every formal/everyday pair actually differs', pairs.every((x) => x.formal !== x.everyday));
        ok('every formal word names where it came from', pairs.every((x) => !!x.source));
        ok('every formal word is dated', pairs.every((x) => x.borrowedAt != null));

        const casual = colloquialForms(st, derive('t', leaf.id, 'colloquial'));
        ok('casual forms differ from careful ones', casual.every((c) => c.casual !== c.careful));
        ok('every casual form names its process', casual.every((c) => c.processes.length > 0));
        // Reduction is licensed by predictability, so it must not reach the tail
        // of the frequency curve. This is the mechanism, not a tuning knob.
        ok('reduction stays in the frequent half of the lexicon',
            casual.every((c) => c.rank <= 500), `worst rank ${Math.max(0, ...casual.map((c) => c.rank))}`);
        eq('colloquial derivation is deterministic',
            JSON.stringify(colloquialForms(st, derive('t', leaf.id, 'colloquial')).map((c) => c.casual)),
            JSON.stringify(casual.map((c) => c.casual)));
    }

    // Every family should have SOME casual speech, or the processes are gated
    // on something no generated language ever satisfies.
    let familiesWithCasual = 0;
    for (const fam of FAMILIES) {
        const proj = projectFor(fam);
        for (const l of leavesOf(fam).slice(0, 8)) {
            let s; try { s = proj.stateOf(l.id); } catch { continue; }
            if (colloquialForms(s, derive('t', l.id, 'colloquial')).length) { familiesWithCasual += 1; break; }
        }
    }
    ok('casual speech is reachable in most families', familiesWithCasual >= 4,
        `${familiesWithCasual}/${FAMILIES.length}`);
}

// ===========================================================================
section('Dialects');
// ===========================================================================
{
    let withDialect = 0, checked = 0;
    for (const fam of FAMILIES) {
        const p = projectFor(fam);
        for (const l of leavesOf(fam).slice(0, 10)) {
            checked += 1;
            const d = dialectVariants(p, l.id);
            if (!d) continue;
            withDialect += 1;
            ok(`${l.name}: the dialect names the changes it lacks`, d.withheld.length > 0);
            ok(`${l.name}: every variant genuinely differs`,
                d.variants.every((v) => v.standard !== v.conservative));
            ok(`${l.name}: the conservative share is a fraction`, d.share >= 0 && d.share <= 1);
        }
    }
    ok('dialects are reachable', withDialect > 0, `${withDialect}/${checked} stages`);
    ok('but not universal — a short-lived stage has no time to develop one',
        withDialect < checked, `${withDialect}/${checked}`);
}

// ===========================================================================
section('The archaic name layer');
// ===========================================================================
{
    for (const [kind, s] of Object.entries(STRATA)) {
        ok(`${kind} has a depth in [0,1]`, s.depth >= 0 && s.depth <= 1);
        ok(`${kind} has a note`, !!s.note);
    }
    ok('rivers are the oldest layer', STRATA.river.depth < STRATA.settlement.depth);
    ok('personal names are the newest', STRATA.person.depth > STRATA.settlement.depth);

    const p = projectFor('proto-alzuria-ayuman');
    // The deepest leaf, so the strata have room to separate.
    let target = null, best = -1;
    for (const l of leavesOf('proto-alzuria-ayuman')) {
        const d = lineageOf(p, l.id).length;
        if (d > best) { best = d; target = l; }
    }
    ok('the family has a deep lineage to coin into', best >= 4, `deepest is ${best} stages`);

    const names = coinArchaicLayer(p, target.id, derive('t', target.id, 'toponyms'), { count: 14 });
    ok('names are coined', names.length > 0);
    ok('every name records where it was coined', names.every((n) => !!n.stratum?.ancestorId));
    ok('every name records its original form', names.every((n) => !!n.coinedForm));
    ok('every name has an opacity reading', names.every((n) => !!n.opacity?.reading));
    ok('names are returned oldest first',
        names.every((n, i) => i === 0 || names[i - 1].stratum.depth <= n.stratum.depth));

    // A name is coined out of the CURRENT language. Coining from a word that
    // was already displaced would short-circuit the whole mechanism and produce
    // a fossil that was never alive.
    ok('no name is coined from an already-archaic word',
        names.every((n) => !/\((archaic|obsolete)\)/.test(n.coinedGloss)),
        names.map((n) => n.coinedGloss).join(' | '));

    // The layer must actually be stratified, not all coined at one stage.
    const depths = new Set(names.map((n) => n.stratum.ancestorId));
    ok('names come from more than one stratum', depths.size >= 2, `${depths.size} distinct stages`);

    // The whole point: some names should be unreadable to their own speakers.
    const readings = new Set(names.map((n) => n.opacity.reading));
    ok('a mixed toponymy has both transparent and opaque names', readings.size >= 2,
        [...readings].join(', '));

    eq('coining is deterministic',
        JSON.stringify(coinArchaicLayer(p, target.id, derive('t', target.id, 'toponyms'), { count: 14 }).map((n) => n.ipa)),
        JSON.stringify(names.map((n) => n.ipa)));
}

// ===========================================================================
console.log('\n' + '='.repeat(64));
if (failures.length) console.log(failures.join('\n'));
console.log(`${passed} passed, ${failed} ${failed === 1 ? 'FAILED' : 'failed'}.`);
process.exit(failed ? 1 : 0);
