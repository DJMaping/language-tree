/**
 * Engine tests — the trust gate.
 *
 * The proposition under test: an engine that can reproduce REAL sound laws over
 * REAL attested data can be trusted with invented languages. If Grimm's Law and
 * the Latin→Spanish chain come out right, the machinery is sound; if they don't,
 * nothing generated for Dahen-Kino is worth looking at.
 *
 * Zero dependencies, run by `npm test` alongside the app's own tests.
 */

import { parseWord, wordToIpa, wordToIpaStressed, fromIpa, consonant, vowel, matches, applyDelta } from '../js/engine/features.js';
import { derive, hashString } from '../js/engine/rng.js';
import { markStress, syllabify, assignStress } from '../js/engine/phonology/phonotactics.js';
import { applyRule, makeRule, formatRule } from '../js/engine/soundchange/rule.js';
import { evolveWord, inventoryFromLexicon, diffInventories, trace } from '../js/engine/soundchange/apply.js';
import { GRIMM_VERNER, GRIMM_CASES } from '../js/engine/soundchange/fixtures/grimm.js';
import { LATIN_SPANISH_RULES, LATIN_SPANISH_CASES, ORDERING_PAIRS } from '../js/engine/soundchange/fixtures/latin-spanish.js';

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

// ===========================================================================
section('Features');
// ===========================================================================
{
    const p = consonant({ place: 'bilabial', manner: 'stop', voice: false });
    eq('p renders as /p/', p.ipa, 'p');
    eq('p + voice = b', applyDelta(p, { voice: true }).ipa, 'b');
    eq('p + fricative + voice = β', applyDelta(p, { manner: 'fricative', voice: true }).ipa, 'β');
    eq('IPA round-trip through parseWord', wordToIpa(parseWord('kʰwiːnə')), 'kʰwiːnə');
    eq('affricate parsed as one segment', parseWord('t͡ʃaŋ').length, 3);
    eq('alveolo-palatal /ɕ/ is readable', fromIpa('ɕ')?.f.place, 'alveolopalatal');
    eq('relative height delta raises e to i', applyDelta(vowel({ height: 2, back: 1 }), { height: '-1' }).ipa, 'i');
    ok('feature matcher selects voiceless stops', matches(p, { type: 'C', manner: 'stop', voice: false }));
    ok('feature matcher rejects on one mismatch', !matches(p, { type: 'C', manner: 'stop', voice: true }));
    eq('stress mark is parsed onto the vowel', parseWord('paˈteːr')[3].f.stress, 1);
    eq('stress survives a round-trip', wordToIpaStressed(parseWord('paˈteːr')), 'paˈteːr');
}

// ===========================================================================
section('Determinism');
// ===========================================================================
{
    const a = derive('seed', 'node', 'purpose');
    const b = derive('seed', 'node', 'purpose');
    eq('same path gives the same stream', a.int(0, 1e6), b.int(0, 1e6));

    const x = derive('seed', 'branch-A', 'ruleset');
    const y = derive('seed', 'branch-B', 'ruleset');
    ok('different paths give different streams', x.int(0, 1e6) !== y.int(0, 1e6));

    // The property that actually matters: drawing from one branch must not
    // disturb another. Without per-node derived streams, editing one branch
    // would silently rewrite its sisters.
    const before = derive('seed', 'branch-B', 'ruleset').int(0, 1e6);
    const noise = derive('seed', 'branch-A', 'ruleset');
    for (let i = 0; i < 500; i++) noise.next();
    const after = derive('seed', 'branch-B', 'ruleset').int(0, 1e6);
    eq('exhausting one branch does not disturb a sister', after, before);

    eq('hashString is stable', hashString('dahen-kino'), hashString('dahen-kino'));
}

// ===========================================================================
section('Syllabification and stress');
// ===========================================================================
{
    const pt = { onset: { max: 2, sonorityMinDistance: 1, licensedExceptions: [], forbidden: [] },
                 coda: { max: 2, allowed: null }, nucleus: { diphthongs: [] }, stress: { rule: 'penultimate' } };

    eq('onset maximisation: a.tra not at.ra', syllabify(parseWord('atra'), pt).length, 2);
    eq('  …and the onset is /tr/', syllabify(parseWord('atra'), pt)[1].onset.map((p) => p.ipa).join(''), 'tr');

    // Sonority sequencing: /rp/ cannot be an onset, so it must split.
    const rp = syllabify(parseWord('arpa'), pt);
    eq('sonority blocks *rp- as an onset', rp[0].coda.map((p) => p.ipa).join(''), 'r');

    const dip = { ...pt, nucleus: { diphthongs: ['ia'] } };
    eq('licensed diphthong is one syllable', syllabify(parseWord('kia'), dip).length, 1);
    eq('unlicensed sequence is two', syllabify(parseWord('kio'), dip).length, 2);

    // The Latin rule: penult if heavy, else antepenult.
    const latin = { ...pt, stress: { rule: 'moraicTrochee' } };
    const heavy = markStress(parseWord('amiːkum'), latin);
    eq('Latin rule stresses a heavy penult', wordToIpaStressed(heavy), 'aˈmiːkum');
    const light = markStress(parseWord('kapita'), latin);
    eq('Latin rule stresses the antepenult when the penult is light', wordToIpaStressed(light), 'ˈkapita');

    eq('final stress rule', wordToIpaStressed(markStress(parseWord('dahen'), { ...pt, stress: { rule: 'final' } })), 'daˈhen');
    eq('initial stress rule', wordToIpaStressed(markStress(parseWord('dahen'), { ...pt, stress: { rule: 'initial' } })), 'ˈdahen');
    ok('lexical accent is not overwritten', wordToIpaStressed(markStress(parseWord('paˈteːr'), latin)) === 'paˈteːr');
}

// ===========================================================================
section("Grimm's Law and Verner's Law  (PIE → Proto-Germanic)");
// ===========================================================================
for (const c of GRIMM_CASES) {
    const res = evolveWord(parseWord(c.pie), GRIMM_VERNER, { rootId: c.gloss, rank: 1 });
    const got = wordToIpaStressed(res.segments);
    eq(`${c.gloss}: *${c.pie} → ${c.expect}`, got, c.expect, c.why);
}
{
    // The counterfeeding claim, made explicit: reverse the chain and *déḱm̥
    // comes out with a fricative where Germanic has a stop.
    const reversed = [...GRIMM_VERNER].reverse();
    const wrong = wordToIpaStressed(evolveWord(parseWord('ˈdekam'), reversed, { rootId: 'x', rank: 1 }).segments);
    ok('reversing Grimm\'s chain changes the outcome (proves ordering is real)',
        wrong !== 'ˈtexam', `reversed order still gave "${wrong}"`);
}

// ===========================================================================
section('Latin → Spanish  (20-rule chain, 2000 years)');
// ===========================================================================
const latinPt = {
    onset: { max: 3, sonorityMinDistance: 1, licensedExceptions: ['tr', 'pr', 'kr', 'br', 'dr', 'ɡr', 'pl', 'kl', 'fl', 'sk', 'sp', 'st'], forbidden: [] },
    coda: { max: 2, allowed: null }, nucleus: { diphthongs: [] }, stress: { rule: 'moraicTrochee' },
};
for (const c of LATIN_SPANISH_CASES) {
    const res = evolveWord(parseWord(c.latin), LATIN_SPANISH_RULES, { rootId: c.gloss, rank: 1, phonotactics: latinPt });
    const got = wordToIpa(res.segments);
    eq(`${c.gloss}: ${c.latin.toUpperCase()} → ${c.spanish} /${c.expect}/`, got, c.expect, c.why);
}

// ===========================================================================
section('Rule ordering: feeding, bleeding, counterfeeding, counterbleeding');
// ===========================================================================
{
    const byId = new Map(LATIN_SPANISH_RULES.map((r) => [r.id, r]));
    for (const pair of ORDERING_PAIRS) {
        const run = (ids) => wordToIpa(evolveWord(parseWord(pair.input), ids.map((i) => byId.get(i)).filter(Boolean),
            { rootId: 'x', rank: 1, phonotactics: latinPt }).segments);
        eq(`${pair.name} — correct order`, run(pair.rules), pair.correct, pair.note);
        eq(`${pair.name} — swapped order gives the wrong (but predicted) form`, run(pair.swapped), pair.swappedResult);
        ok(`${pair.name} — the two orders genuinely differ`, pair.correct !== pair.swappedResult);
    }

    // FEEDING, in isolation: rule 1 creates the input rule 2 needs.
    const f1 = makeRule({ id: 'f1', a: { is: 'k' }, b: { set: 'j' }, env: { after: [{ is: 't' }] } });
    const f2 = makeRule({ id: 'f2', a: { seq: [{ is: 'j' }, { is: 't' }] }, b: { set: 't͡ʃ' } });
    eq('feeding: k>j then jt>t͡ʃ', wordToIpa(evolveWord(parseWord('akta'), [f1, f2], {}).segments), 'at͡ʃa');
    eq('  …without the feeder, nothing happens', wordToIpa(evolveWord(parseWord('akta'), [f2], {}).segments), 'akta');

    // BLEEDING: rule 1 removes what rule 2 was going to act on.
    const b1 = makeRule({ id: 'b1', a: { is: 'a' }, b: { set: 'e' }, env: { after: [{ boundary: '#' }] } });
    const b2 = makeRule({ id: 'b2', a: { is: 'a' }, b: { empty: true }, env: { after: [{ boundary: '#' }] } });
    eq('bleeding: a>e / _# bleeds a>∅ / _#', wordToIpa(evolveWord(parseWord('kata'), [b1, b2], {}).segments), 'kate');
    eq('  …reversed, the deletion wins', wordToIpa(evolveWord(parseWord('kata'), [b2, b1], {}).segments), 'kat');

    // COUNTERBLEEDING — opacity. The rule applies, then its own conditioning
    // environment is destroyed, leaving a result nothing on the surface explains.
    const cb1 = makeRule({ id: 'cb1', a: { is: 'n' }, b: { delta: { place: 'velar' } }, env: { after: [{ is: 'k' }] } });
    const cb2 = makeRule({ id: 'cb2', a: { is: 'k' }, b: { empty: true }, env: { before: [{ is: 'ŋ' }] } });
    const opaque = wordToIpa(evolveWord(parseWord('anka'), [cb1, cb2], {}).segments);
    eq('counterbleeding: /n/ velarises, then the conditioning /k/ deletes', opaque, 'aŋa');
    ok('  …the surviving /ŋ/ is now unexplainable from the surface (opacity)', opaque === 'aŋa');
}

// ===========================================================================
section('Mergers, splits and phonemicisation');
// ===========================================================================
{
    // A MERGER: unconditioned devoicing removes /b/ from the inventory. Nobody
    // deleted it — no word contains one any more.
    const lex = [
        { id: 'r1', form: parseWord('aba'), rank: 1 },
        { id: 'r2', form: parseWord('apa'), rank: 2 },
    ];
    const devoice = makeRule({ id: 'm1', a: { type: 'C', manner: 'stop', voice: true }, b: { delta: { voice: false } } });
    const after = lex.map((e) => ({ ...e, form: evolveWord(e.form, [devoice], {}).segments }));
    const inv0 = inventoryFromLexicon(lex);
    const inv1 = inventoryFromLexicon(after);
    const d = diffInventories(inv0, inv1);
    ok('merger removes /b/ from the inventory', d.lost.includes('b'), `lost: ${d.lost.join(',')}`);
    ok('merger neutralises the contrast', wordToIpa(after[0].form) === wordToIpa(after[1].form));

    // A SPLIT, done honestly, in two steps.
    // Step 1 creates a conditioned allophone: /k/ → [t͡ʃ] before front vowels.
    // At this point [t͡ʃ] is NOT a phoneme — its distribution is fully predictable.
    // Step 2 destroys the conditioning environment by backing the vowel.
    // Now nothing on the surface predicts where [t͡ʃ] occurs, so it has become
    // a phoneme. This is phonemicisation, and it is the ONLY way the engine
    // creates one.
    // NOTE the vowels: /u/ vs /i/, not /a/ vs /i/. In this feature system the
    // low vowel /a/ is FRONT (height 5, backness 1), so it is a member of the
    // frontVowel class and would trigger palatalisation too — leaving no
    // contrasting environment and no split to observe.
    const split = [
        { id: 's1', form: parseWord('ki'), rank: 1 },
        { id: 's2', form: parseWord('ku'), rank: 2 },
    ];
    const palatalise = makeRule({ id: 'p1', a: { is: 'k' }, b: { set: 't͡ʃ' }, env: { after: [{ class: 'frontVowel' }] } });
    const backing = makeRule({ id: 'p2', a: { is: 'i' }, b: { set: 'u' } });

    const step1 = split.map((e) => ({ ...e, form: evolveWord(e.form, [palatalise], {}).segments }));
    eq('allophone created before a front vowel', wordToIpa(step1[0].form), 't͡ʃi');
    eq('  …and not elsewhere', wordToIpa(step1[1].form), 'ku');

    const step2 = step1.map((e) => ({ ...e, form: evolveWord(e.form, [backing], {}).segments }));
    eq('conditioning environment destroyed', wordToIpa(step2[0].form), 't͡ʃu');
    ok('split: /t͡ʃ/ and /k/ now contrast in an identical environment',
        wordToIpa(step2[0].form) !== wordToIpa(step2[1].form)
        && step2[0].form[1].ipa === step2[1].form[1].ipa,
        `${wordToIpa(step2[0].form)} vs ${wordToIpa(step2[1].form)}`);

    // Order matters here too: destroy the environment FIRST and the split never
    // happens at all — the allophone is never created.
    const wrongOrder = split.map((e) => ({ ...e, form: evolveWord(e.form, [backing, palatalise], {}).segments }));
    ok('reversing the two prevents the split entirely',
        wordToIpa(wrongOrder[0].form) === wordToIpa(wrongOrder[1].form),
        `${wordToIpa(wrongOrder[0].form)} vs ${wordToIpa(wrongOrder[1].form)}`);
}

// ===========================================================================
section('Rule mechanics');
// ===========================================================================
{
    // Simultaneous application within a rule: it must not feed itself.
    const shift = makeRule({ id: 'x1', a: { is: 'a' }, b: { set: 'e' }, env: { after: [{ is: 't' }] } });
    eq('a rule does not feed itself', wordToIpa(applyRule(parseWord('atat'), shift).segments), 'etet');

    // Nasal place assimilation via feature copying — one rule, every place.
    const nasAssim = makeRule({ id: 'x2', a: { type: 'C', manner: 'nasal' },
        b: { assimilate: { from: 'after', features: ['place'] } }, env: { after: [{ type: 'C', manner: 'stop' }] } });
    eq('assimilation: n before p → m', wordToIpa(applyRule(parseWord('anpa'), nasAssim).segments), 'ampa');
    eq('assimilation: n before k → ŋ', wordToIpa(applyRule(parseWord('anka'), nasAssim).segments), 'aŋka');
    eq('assimilation: n before t is unchanged', wordToIpa(applyRule(parseWord('anta'), nasAssim).segments), 'anta');

    // Metathesis.
    const meta = makeRule({ id: 'x3', a: { seq: [{ type: 'V' }, { class: 'liquid' }] }, b: { swap: true },
        env: { before: [{ boundary: '#' }, { type: 'C' }] } });
    eq('metathesis of vowel + liquid', wordToIpa(applyRule(parseWord('kurta'), meta).segments), 'kruta');

    // Insertion anchored at a word edge.
    const proth = makeRule({ id: 'x4', a: { empty: true }, b: { set: 'e' },
        env: { before: [{ boundary: '#' }], after: [{ is: 's' }, { type: 'C' }] } });
    eq('prothesis before #sC', wordToIpa(applyRule(parseWord('skola'), proth).segments), 'eskola');
    eq('  …and not before #sV', wordToIpa(applyRule(parseWord('sola'), proth).segments), 'sola');

    // Deletion at a word edge.
    const apoc = makeRule({ id: 'x5', a: { type: 'V', stress: 'unstressed' }, b: { empty: true }, env: { after: [{ boundary: '#' }] } });
    const pt = { onset: { max: 2, licensedExceptions: [] }, coda: { max: 2, allowed: null }, nucleus: { diphthongs: [] }, stress: { rule: 'initial' } };
    eq('apocope of an unstressed final vowel', wordToIpa(evolveWord(parseWord('kata'), [apoc], { phonotactics: pt }).segments), 'kat');

    // Lexical diffusion is deterministic per word, not per run.
    const diff = makeRule({ id: 'x6', a: { is: 't' }, b: { set: 'd' }, probability: 0.5 });
    const runs = new Set();
    for (let i = 0; i < 5; i++) runs.add(wordToIpa(applyRule(parseWord('ata'), diff, { rootId: 'r0042' }).segments));
    eq('lexical diffusion is stable for a given word', runs.size, 1);
    const across = new Set();
    for (let i = 0; i < 40; i++) across.add(wordToIpa(applyRule(parseWord('ata'), diff, { rootId: `r${i}` }).segments));
    eq('  …but varies across the lexicon', across.size, 2);

    // Frequency conditioning.
    const freq = makeRule({ id: 'x7', a: { is: 'a' }, b: { set: 'ə' }, conditions: { maxRank: 100 } });
    eq('frequency-conditioned rule hits a common word', wordToIpa(applyRule(parseWord('ata'), freq, { rank: 5 }).segments), 'ətə');
    eq('  …and skips a rare one', wordToIpa(applyRule(parseWord('ata'), freq, { rank: 5000 }).segments), 'ata');
}

// ===========================================================================
section('Derivation history');
// ===========================================================================
{
    const res = evolveWord(parseWord('paˈteːr'), GRIMM_VERNER, { rootId: 'father', rank: 1, stageId: 'pgmc' });
    const applied = res.history.steps.filter((s) => s.applied);
    ok('every change is recorded', applied.length >= 3, `recorded ${applied.length} steps`);
    eq('history remembers the proto-form', res.history.protoForm, 'pateːr');
    ok('each step names the rule that caused it', applied.every((s) => s.ruleId && s.label));
    ok('steps chain: each step starts where the last ended',
        applied.every((s, i) => i === 0 || applied[i - 1].to === s.from));
}

// ===========================================================================
console.log(`\n${'='.repeat(64)}`);
if (failures.length) {
    console.log(failures.join('\n'));
    console.log(`\n${passed} passed, ${failed} FAILED.`);
    process.exit(1);
}
console.log(`${passed} passed, 0 failed.`);
