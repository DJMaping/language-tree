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
import { estimateUnseen, generateInventory, CONSONANT_PRIOR } from '../js/engine/phonology/inventory.js';
import { conceptList } from '../js/engine/lexicon/swadesh.js';
import { ALL_PATHS, SHIFT_TYPES, validatePaths, shiftBetween, planShifts, applyShifts, falseFriends } from '../js/engine/lexicon/semantics.js';
import { analyseStem, planLevellings, applyLevellings } from '../js/engine/morphology/analogy.js';
import { CLINES, reduce, applyGrammaticalisation, planCategoryLoss } from '../js/engine/morphology/grammaticalisation.js';
import { CLASSIFIER_CLASSES, classifierOf, applyClassifiers, planClassifiers } from '../js/engine/morphology/classifiers.js';
import { buildPronounSystem, applyPronouns, planPronouns } from '../js/engine/morphology/pronouns.js';
import { markIrregulars, applySuppletion, renewIrregulars, isIrregularClass, SUPPLETION_SOURCES, hasSuppletion } from '../js/engine/morphology/irregular.js';
import { planTherapy } from '../js/engine/lexicon/therapy.js';
import { inflect } from '../js/engine/text/sentence.js';
import { buildArticleSystem, applyArticles, planArticles } from '../js/engine/morphology/articles.js';
import { drawMoodSpec, applyMoods, imperativeValue, prohibitiveValue, makeMoodWord } from '../js/engine/morphology/moods.js';
import { isMoodCell } from '../js/engine/morphology/paradigm.js';
import { drawEvidentialSpec, buildEvidentialSystem, applyEvidentials, evidentialValues, chooseTerm } from '../js/engine/morphology/evidentials.js';
import { weakened as weakenedForm } from '../js/engine/morphology/articles.js';
import { byId as templateById } from '../js/engine/soundchange/catalogue.js';
import { syllableStructure, soundTypology } from './measures.js';
import { readerSafe, READER_ALPHABET } from '../js/engine/text/sentence.js';
import { colexifyProto, planColexification, colexValues } from '../js/engine/lexicon/colexify.js';
import { applyReplacements } from '../js/engine/lexicon/replacement.js';
import { splitAround, paradigmSplit, splitForm } from '../js/engine/morphology/paradigm.js';
import { analyseStemRight } from '../js/engine/morphology/analogy.js';
import { morphologyChapters } from '../js/engine/morphology/type-measure.js';
import { inferCharacter } from '../js/engine/character.js';
import { fuseSubject } from '../js/engine/morphology/pronouns.js';

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

    // The minimal word constraint: no change ever leaves a word with no sounds.
    const wipe = makeRule({ id: 'x8', a: { type: 'V' }, b: { empty: true } });
    const oneVowel = evolveWord(parseWord('a'), [wipe], {});
    eq('a change that would empty a word does not apply', wordToIpa(oneVowel.segments), 'a');
    ok('  ...and the blocked change is not recorded as having happened',
        oneVowel.history.steps.filter((s) => s.applied).length === 0);
    eq('  ...but it still applies where something is left', wordToIpa(evolveWord(parseWord('ta'), [wipe], {}).segments), 't');

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
section('Semantic paths');
// ===========================================================================
{
    const concepts = conceptList(600);
    const report = validatePaths(concepts);
    ok('every licensed path is well-formed', report.problems.length === 0, report.problems.slice(0, 6).join('\n      '));
    ok('every licensed path is reachable in a 600-word lexicon',
        report.unreachable.length === 0,
        `unreachable: ${report.unreachable.slice(0, 8).join(', ')}`);
    ok('every path carries an attested example', ALL_PATHS.every((p) => p.attested && p.attested.length > 20));
    ok('every path names a known shift type', ALL_PATHS.every((p) => SHIFT_TYPES[p.type]));

    // The specific constraint the table exists to impose.
    ok('"head" can become "chief"', !!shiftBetween('head', 'chief'));
    ok('"stranger" can become "enemy"', !!shiftBetween('stranger', 'enemy'));
    ok('"cheek" cannot become "belly"', !shiftBetween('cheek', 'belly'),
        'the old domain-bucket neighbour rule allowed exactly this');
    ok('"wing" cannot become "guts"', !shiftBetween('wing', 'guts'));
    ok('paths are directional — "enemy" does not become "stranger"',
        !shiftBetween('enemy', 'stranger') && !!shiftBetween('stranger', 'enemy'));

    // Free drift must never touch the comparative set.
    const entries = [
        { id: 'a', gloss: 'stranger', pos: 'n', domain: 'society', core: false, rank: 300, ipa: 'x' },
        { id: 'b', gloss: 'enemy', pos: 'n', domain: 'society', core: true, rank: 120, ipa: 'y' },
    ];
    const planned = planShifts({ entries }, derive('test', 'shifts'), { from: 0, to: 4000, count: 1 });
    eq('free drift refuses to evict a core meaning', planned.length, 0);

    const entries2 = entries.map((e) => ({ ...e, core: false }));
    const planned2 = planShifts({ entries: entries2 }, derive('test', 'shifts2'), { from: 0, to: 4000, count: 1 });
    ok('…but will move a non-core one', planned2.length === 1 && planned2[0].toGloss === 'enemy',
        JSON.stringify(planned2));
    const after = applyShifts(entries2, planned2);
    const sense = after.find((e) => (e.sameWordAs ?? e.id) === 'a' && e.gloss === 'enemy');
    ok('the drifter takes the new meaning, as a second sense of the same word', !!sense && sense.sameWordAs === 'a');
    eq('…and keeps its old one while no other word carries it', after.find((e) => e.id === 'a').gloss, 'stranger');
    ok('the displaced word is retired, not deleted', after.find((e) => e.id === 'b').retired === true);
    ok('the meaning chain is kept', sense?.glossHistory?.[0]?.gloss === 'stranger');
    // with another word for "stranger", the drift is a full move
    const withOther = [...entries2, { id: 'c', gloss: 'stranger', pos: 'n', domain: 'society', core: false, rank: 310, ipa: 'z' }];
    const moved = applyShifts(withOther, planned2);
    eq('where another word carries the old meaning, the drifter moves outright', moved.find((e) => e.id === 'a').gloss, 'enemy');

    // False friends: same etymon, divergent gloss.
    const ff = falseFriends({ entries: after }, { entries: entries2 });
    ok('a divergent gloss on a shared etymon is a false friend',
        ff.some((x) => x.id === 'a' && x.a.gloss === 'enemy' && x.b.gloss === 'stranger'));
}

// ===========================================================================
section('Analogical levelling');
// ===========================================================================
{
    const PT = { onset: { max: 2, licensedExceptions: [] }, coda: { max: 2, allowed: null }, nucleus: { diphthongs: [] }, stress: { rule: 'final' } };
    const cell = (cls, name, ipa, extra = {}) => ({
        id: `para:${cls}:${name}`, form: parseWord(ipa), ipa, rank: 900, class: cls,
        paradigm: { cls, cell: name, stem: 'r1', stemGloss: 'x' }, ...extra,
    });

    // A class whose ACC.SG stem was altered by a conditioned change, while the
    // other three cells agree. Analogy should extend the majority stem.
    const cellMap = new Map([
        ['NOM.SG', cell('n1', 'NOM.SG', 'kuram')],
        ['ACC.SG', cell('n1', 'ACC.SG', 'kiran')],   // the outlier: a raised stem vowel
        ['GEN.SG', cell('n1', 'GEN.SG', 'kuras')],
        ['DAT.SG', cell('n1', 'DAT.SG', 'kurat')],
    ]);
    const analysis = analyseStem(cellMap);
    ok('the dominant stem is found', analysis && wordToIpa(analysis.stem) === 'kura',
        analysis ? wordToIpa(analysis.stem) : 'null');
    eq('the altered cell is the only outlier', analysis.outliers.join(','), 'ACC.SG');

    const entries = [...cellMap.values()];
    const stemEvent = [{ id: 'lev-1', year: 100, kind: 'stem', cls: 'n1', cells: ['ACC.SG'], model: 'NOM.SG', note: '' }];
    const levelled = applyLevellings(entries, stemEvent, { histories: new Map(), stageId: 's' });
    eq('the outlier is rebuilt on the dominant stem',
        levelled.entries.find((e) => e.id === 'para:n1:ACC.SG').ipa, 'kuran');

    /**
     * The anti-goal from the plan, asserted directly: analogy is not tidiness.
     * A levelling that could only ever make tables prettier would be a script
     * with a linguistic name on it, so it has to be able to LOSE a contrast.
     */
    const distinct = [
        cell('n2', 'NOM.SG', 'tara'),
        cell('n2', 'ACC.SG', 'taris'),
        cell('n2', 'GEN.SG', 'taras'),
    ];
    const beforeN = new Set(distinct.map((e) => e.ipa)).size;
    const syncEvent = [{ id: 'lev-2', year: 100, kind: 'syncretism', cls: 'n2', cells: ['ACC.SG'], model: 'GEN.SG', note: '' }];
    const after = applyLevellings(distinct, syncEvent, { histories: new Map(), stageId: 's' });
    const afterN = new Set(after.entries.map((e) => e.ipa)).size;
    ok('levelling can destroy a distinction, not only tidy one',
        afterN < beforeN, `${beforeN} distinct before, ${afterN} after`);

    // Suppletive lexemes are immune — that is what suppletion IS.
    const irregular = [...cellMap.values()].map((e) => ({ ...e, irregular: true }));
    const planned = planLevellings(
        { entries: irregular, phonotactics: PT, langId: 'x', paradigm: { classes: { n1: {} } } },
        [], derive('test', 'analogy-irregular'), { from: 0, to: 6000, rate: 2 },
    );
    eq('a suppletive paradigm is never levelled', planned.length, 0);
}

// ===========================================================================
section('Grammaticalisation');
// ===========================================================================
{
    const PT = { onset: { max: 2, licensedExceptions: [] }, coda: { max: 2, allowed: null }, nucleus: { diphthongs: [] }, stress: { rule: 'final' } };

    ok('every cline carries an attested example', CLINES.every((c) => c.attested && c.attested.length > 30));
    ok('every cline names at least one source gloss', CLINES.every((c) => c.sources.length));
    const concepts = new Set(conceptList(600).map((c) => `${c.gloss}|${c.pos}`));
    const missing = CLINES.flatMap((c) => c.sources.filter((g) => !concepts.has(`${g}|${c.pos}`)).map((g) => `${g}(${c.pos})`));
    ok('every cline source exists in the concept list at the right part of speech',
        missing.length === 0, `missing: ${missing.join(', ')}`);

    // Reduction: a bound morph is shorter than the word it came from, because
    // grammatical material is more frequent and Zipf's law of abbreviation bites.
    const src = parseWord('kanatu');
    const suf = reduce(src, PT, 'suffix');
    ok('a grammaticalised morph is shorter than its source', suf.length < src.length,
        `${wordToIpa(src)} → ${wordToIpa(suf)}`);
    ok('  …and keeps the edge that will face the stem', wordToIpa(src).endsWith(wordToIpa(suf)));
    ok('  …and contains a vowel', suf.some((p) => p.type === 'V'));

    // Layering: the lexeme survives its own grammaticalisation.
    const entries = [
        { id: 'r1', gloss: 'go', pos: 'v', form: parseWord('kanatu'), ipa: 'kanatu', rank: 12 },
        { id: 'para:v1:PRS.3SG', gloss: 'go.PRS.3SG', pos: 'v', form: parseWord('kanat'), ipa: 'kanat', rank: 12,
          class: 'v1', paradigm: { cls: 'v1', cell: 'PRS.3SG', stem: 'r1', stemGloss: 'go' } },
    ];
    const ev = [{ id: 'g1', year: 500, kind: 'grammaticalisation', cline: 'future-from-motion', cell: 'FUT',
        label: 'future tense', axis: 'verbal', sourceId: 'r1', sourceGloss: 'go', attested: 'x', note: 'x' }];
    const res = applyGrammaticalisation(entries, ev, { phonotactics: PT, paradigm: { categories: { cases: [], tenses: ['PRS'] } } });
    ok('the source lexeme survives — Hopper layering', res.entries.some((e) => e.id === 'r1' && e.gloss === 'go'));
    ok('a new paradigm cell appears', res.entries.some((e) => e.id === 'para:v1:FUT.3SG'));
    const made = res.entries.find((e) => e.id === 'para:v1:FUT.3SG');
    ok('  …built on the existing inflected form', made && made.ipa.startsWith('kanat'), made?.ipa);
    ok('  …and remembers where it came from', made?.grammaticalisedFrom?.gloss === 'go');
    ok('the declared categories move with it', res.categories?.tenses?.includes('FUT'));

    // Category loss: a slot that marks nothing anywhere may be dropped.
    const cellsOf = (cls, pairs) => pairs.map(([name, ipa]) => ({
        id: `para:${cls}:${name}`, form: parseWord(ipa), ipa, rank: 900, class: cls,
        paradigm: { cls, cell: name, stem: 'r1', stemGloss: 'x' },
    }));
    const collapsed = [
        ...cellsOf('n1', [['NOM.SG', 'tara'], ['ACC.SG', 'taras'], ['GEN.SG', 'taras'], ['DAT.SG', 'taram']]),
        ...cellsOf('n2', [['NOM.SG', 'miro'], ['ACC.SG', 'miros'], ['GEN.SG', 'miros'], ['DAT.SG', 'mirom']]),
    ];
    const loss = planCategoryLoss(
        { entries: collapsed, phonotactics: PT, langId: 'x' },
        [], derive('test', 'loss'), { from: 0, to: 6000, rate: 2 },
    );
    ok('a slot identical to another in every class can be abandoned',
        loss.some((e) => e.cell === 'GEN.SG' && e.mergedWith === 'ACC.SG'),
        JSON.stringify(loss.map((e) => `${e.cell}<-${e.mergedWith}`)));
    const dropped = applyGrammaticalisation(collapsed, loss.filter((e) => e.cell === 'GEN.SG'), { phonotactics: PT });
    ok('  …and dropping it removes the cell from every class',
        !dropped.entries.some((e) => e.id.endsWith(':GEN.SG')));

    // A distinction surviving anywhere is a distinction.
    const partial = [
        ...cellsOf('n1', [['NOM.SG', 'tara'], ['ACC.SG', 'taras'], ['GEN.SG', 'taras'], ['DAT.SG', 'taram']]),
        ...cellsOf('n2', [['NOM.SG', 'miro'], ['ACC.SG', 'miros'], ['GEN.SG', 'mirok'], ['DAT.SG', 'mirom']]),
    ];
    const noLoss = planCategoryLoss(
        { entries: partial, phonotactics: PT, langId: 'x' },
        [], derive('test', 'loss2'), { from: 0, to: 6000, rate: 2 },
    );
    ok('a slot still distinct in one class is never abandoned',
        !noLoss.some((e) => e.cell === 'GEN.SG'), JSON.stringify(noLoss.map((e) => e.cell)));
}

// ===========================================================================
section('Numeral classifiers');
// ===========================================================================
{
    const PT = { onset: { max: 2, licensedExceptions: [] }, coda: { max: 2, allowed: null }, nucleus: { diphthongs: [] }, stress: { rule: 'penultimate' } };
    const concepts = new Set(conceptList(800).map((c) => c.gloss));
    const missingSrc = Object.entries(CLASSIFIER_CLASSES).flatMap(([c, v]) => v.sources.filter((g) => !concepts.has(g)).map((g) => `${c}:${g}`));
    ok('every classifier source is in the concept list', missingSrc.length === 0, missingSrc.join(', '));
    ok('every class carries an attested example', Object.values(CLASSIFIER_CLASSES).every((c) => c.attested?.length > 30));

    const n = (id, gloss, domain, form) => ({ id, gloss, pos: 'n', domain, form: parseWord(form), ipa: form, rank: 50 });
    const lex = [n('r1', 'thing', 'cognition', 'kato'), n('r2', 'person', 'society', 'mana'), n('r3', 'tail', 'body', 'sipa'),
        n('r4', 'dog', 'animal', 'wuro'), n('r5', 'fish', 'animal', 'iku'), n('r6', 'day', 'time', 'hari'),
        n('r7', 'idea', 'cognition', 'pikir'), n('r8', 'branch', 'plant', 'tanka')];
    const steps = [
        { kind: 'classifier', step: 'rise', year: 100, use: 'optional', order: 'num-clf', bound: false, seed: 's',
            classes: [{ cls: 'GEN', sourceId: 'r1', sourceGloss: 'thing' }, { cls: 'HUM', sourceId: 'r2', sourceGloss: 'person' }] },
        { kind: 'classifier', step: 'new-class', year: 200, cls: 'ANI', sourceId: 'r3', sourceGloss: 'tail' },
        { kind: 'classifier', step: 'obligatory', year: 300 },
    ];
    const res = applyClassifiers(lex, steps, { phonotactics: PT, categories: { type: 'isolating', cases: [], tenses: [] } });
    const sys = res.categories?.classifiers;
    ok('a classifier system arises around a general classifier', sys?.classes.includes('GEN') && sys.use === 'obligatory', JSON.stringify(sys));
    eq('  …each classifier is its noun, bleached (Thai tua "body")', res.entries.find((e) => e.classifier === 'ANI')?.ipa, 'sipa');
    ok('  …and the noun lives on beside it, as layering has it', res.entries.some((e) => e.id === 'r3' && e.gloss === 'tail'));
    ok('  …marked as grammar, so lexical change passes it by', res.entries.filter((e) => e.classifier).every((e) => e.paradigm && e.pos === 'clf'));
    const byId = new Map(res.entries.map((e) => [e.id, e]));
    eq('a dog is counted as an animal', classifierOf(byId.get('r4'), sys, byId), 'ANI');
    eq('a day is counted bare (Mandarin sān tiān)', classifierOf(byId.get('r6'), sys, byId), 'SELF');
    eq('an idea takes the general classifier', classifierOf(byId.get('r7'), sys, byId), 'GEN');
    eq('a branch, with no classifier for long things yet, takes the general one', classifierOf(byId.get('r8'), sys, byId), 'GEN');
    // a fish is an animal in Thai (tua) and a long thing in Mandarin (tiáo)
    const withLong = { ...sys, classes: [...sys.classes, 'LONG'] };
    const fishes = new Set(Array.from({ length: 40 }, (_, i) => classifierOf(byId.get('r5'), { ...withLong, seed: `s${i}` }, byId)));
    ok('a borderline noun is settled differently by different systems', fishes.has('ANI') && fishes.has('LONG'), [...fishes].join(','));
    const worn = { ...sys, erosion: { ANI: 0.7 } };
    const beasts = Array.from({ length: 80 }, (_, i) => n(`a${i}`, `beast${i}`, 'animal', 'pa'));
    const toGen = beasts.filter((e) => classifierOf(e, worn, byId) === 'GEN').length / beasts.length;
    ok('as the general classifier spreads, a class loses nouns to it', toGen > 0.2 && toGen < 0.7, toGen.toFixed(2));
    const faded = applyClassifiers(res.entries, [{ kind: 'classifier', step: 'lost', year: 900 }], { phonotactics: PT, categories: res.categories });
    ok('a system that fades takes its words with it', !faded.entries.some((e) => e.classifier) && faded.categories.classifiers === null);

    const iso = { entries: lex, paradigm: { categories: { type: 'isolating', numbers: ['SG'], genders: [], cases: [], tenses: [] } } };
    const grew = Array.from({ length: 40 }, (_, i) => planClassifiers(iso, derive('clf', String(i)), { from: 0, to: 5000, key: 'k' }))
        .filter((evs) => evs.some((e) => e.step === 'rise')).length;
    ok('an isolating language usually grows classifiers in five millennia', grew >= 18, `${grew}/40`);
    const fus = { entries: lex, paradigm: { categories: { type: 'fusional', numbers: ['SG', 'PL'], genders: ['M', 'F'], cases: ['NOM'], tenses: ['PRS'] } } };
    const fusGrew = Array.from({ length: 40 }, (_, i) => planClassifiers(fus, derive('clf', String(i)), { from: 0, to: 5000, key: 'k' }))
        .filter((evs) => evs.some((e) => e.step === 'rise')).length;
    ok('a fusional language with gender and a plural almost never does', fusGrew <= 3, `${fusGrew}/40`);
    // a whole planned history applies in order without contradiction
    const plan = planClassifiers({ ...iso, paradigm: { categories: { ...iso.paradigm.categories, classifiers: sys } }, entries: res.entries },
        derive('clf', 'long'), { from: 0, to: 6000, key: 'k' });
    const after = applyClassifiers(res.entries, plan, { phonotactics: PT, categories: res.categories });
    const live = after.categories ? after.categories.classifiers : sys;
    const words = after.entries.filter((e) => e.classifier).map((e) => e.classifier).sort().join(',');
    ok('every class the system lists has its word, and no word outlives its class',
        live === null ? !words : words === [...live.classes].sort().join(','), `${words} vs ${live?.classes}`);
}

// ===========================================================================
section('Pronouns: two kinds of "we", and a polite "you"');
// ===========================================================================
{
    const PT = { onset: { max: 2, licensedExceptions: [] }, coda: { max: 2, allowed: null }, nucleus: { diphthongs: [] }, stress: { rule: 'penultimate' } };
    const concepts = new Set(conceptList(800).map((c) => c.gloss));
    ok('both pronouns are in the concept list', concepts.has('we (inclusive)') && concepts.has('you (polite)'));
    const pr = (id, gloss, form) => ({ id, gloss, pos: 'pron', domain: 'person', form: parseWord(form), ipa: form, rank: 5 });
    const lex = [pr('r0', 'I', 'mi'), pr('r1', 'you (sg)', 'tu'), pr('r2', 'he', 'ka'), pr('r3', 'we', 'nos'), pr('r4', 'you (pl)', 'vos'),
        pr('r5', 'they', 'ila'), pr('r6', 'she', 'ela'), pr('r7', 'we (inclusive)', 'kita'), pr('r8', 'you (polite)', 'usa'),
        { id: 'r9', gloss: 'lord', pos: 'n', domain: 'society', form: parseWord('pana'), ipa: 'pana', rank: 80 }];
    const word = (st, g) => st.entries.find((e) => e.gloss === g && !e.retired)?.ipa;
    const plain = buildPronounSystem(lex, { clusivity: false, polite: null }, derive('pron', '1'));
    eq('one "we": the inclusive is the same word', word(plain, 'we (inclusive)'), 'nos');
    eq('no polite "you": the polite is the same word as "you"', word(plain, 'you (polite)'), 'tu');
    const vous = buildPronounSystem(lex, { clusivity: true, polite: 'plural' }, derive('pron', '2'));
    eq('two "we"s keep two words (Malay kita, kami)', word(vous, 'we (inclusive)'), 'kita');
    eq('a polite "you" from the plural (French vous)', word(vous, 'you (polite)'), 'vos');
    eq('  …which takes the plural verb', vous.system.polite.person, '2PL');
    const sie = buildPronounSystem(lex, { clusivity: false, polite: 'they' }, derive('pron', '3'));
    eq('a polite "you" from "they" takes the third plural (German Sie)', sie.system.polite.person, '3PL');
    const usted = buildPronounSystem(lex, { clusivity: false, polite: 'noun' }, derive('pron', '4'));
    eq('a polite "you" from a noun of respect (Spanish usted, Polish pan)', word(usted, 'you (polite)'), 'pana');
    const english = applyPronouns(vous.entries, [{ kind: 'pronoun', step: 'polite-generalised', year: 10 }], { phonotactics: PT, categories: { pronouns: vous.system } });
    eq('English: the polite "you" becomes the only "you"', word(english, 'you (sg)'), 'vos');
    ok('  …the distinction is gone', english.categories.pronouns.polite === null);
    ok('  …and the change is a step in the word\'s derivation', english.changed.length === 1 && english.changed[0].after !== english.changed[0].before);
    const swedish = applyPronouns(vous.entries, [{ kind: 'pronoun', step: 'polite-dropped', year: 10 }], { phonotactics: PT, categories: { pronouns: vous.system } });
    eq('Swedish du: the familiar "you" comes to be used to everyone', word(swedish, 'you (polite)'), 'tu');
    const yumi = applyPronouns(plain.entries, [{ kind: 'pronoun', step: 'inclusive-rise', year: 5 }], { phonotactics: PT, categories: { pronouns: plain.system } });
    eq('Tok Pisin yumi: "you" and "I" fuse into a "we" with the listener', word(yumi, 'we (inclusive)'), 'tumi');
    ok('  …and the language now has two', yumi.categories.pronouns.clusivity === true);
    const kita = applyPronouns(vous.entries, [{ kind: 'pronoun', step: 'inclusive-lost', year: 5, keep: 'inclusive' }], { phonotactics: PT, categories: { pronouns: vous.system } });
    eq('Indonesian kita: the inclusive "we" comes to mean any "we"', word(kita, 'we'), 'kita');
    // a planned history applies cleanly, and the rates leave most lineages without one for millennia
    let rose = 0, consistent = true;
    for (let i = 0; i < 40; i++) {
        const st = { entries: plain.entries, paradigm: { categories: { pronouns: plain.system } } };
        const plan = planPronouns(st, derive('pron-plan', String(i)), { from: 0, to: 3000 });
        if (plan.some((e) => e.step === 'polite-rise')) rose += 1;
        const res = applyPronouns(plain.entries, plan, { phonotactics: PT, categories: { pronouns: plain.system } });
        const sys = res.categories?.pronouns ?? plain.system;
        if (!!sys.polite !== (word(res, 'you (polite)') !== word(res, 'you (sg)'))) consistent = false;
    }
    ok('a polite "you" arises in some lineages in three thousand years, not in most', rose > 0 && rose < 20, `${rose}/40`);
    ok('the polite word and the system always agree', consistent);
}

// ===========================================================================
section('Irregular verbs and nouns, and suppletion');
// ===========================================================================
{
    const PT = { onset: { max: 2, licensedExceptions: [] }, coda: { max: 2, allowed: null }, nucleus: { diphthongs: [] }, stress: { rule: 'penultimate' } };
    const w = (id, gloss, pos, form, cls, rank = 20) => ({ id, gloss, pos, form: parseWord(form), ipa: form, class: cls, rank, domain: 'action' });
    const lex = [w('r1', 'go', 'v', 'ira', 'v1', 3), w('r2', 'walk', 'v', 'bada', 'v1', 40), w('r3', 'sing', 'v', 'kana', 'v1', 90), w('r4', 'eye', 'n', 'oku', 'n3', 8)];
    const marked = markIrregulars(lex);
    const go = marked.find((e) => e.id === 'r1');
    ok('the commonest verbs get a paradigm of their own', isIrregularClass(go.class) && go.baseClass === 'v1' && go.irregular, JSON.stringify(go.class));
    ok('  …and so do the commonest nouns', isIrregularClass(marked.find((e) => e.id === 'r4').class));
    ok('  …while the rest keep their classes', marked.find((e) => e.id === 'r3').class === 'v1');
    // a paradigm: the regular class, and "go" with its own cells
    const cell = (cls, c, form, stem, stemGloss) => ({ id: `para:${cls}:${c}`, form: parseWord(form), ipa: form, pos: 'v', class: cls, rank: 5,
        paradigm: { cls, cell: c, stem, stemGloss } });
    const entries = [...marked,
        cell('v1', 'PRS.3SG', 'badat', 'r2', 'walk'), cell('v1', 'PST.3SG', 'badasi', 'r2', 'walk'),
        cell(go.class, 'PRS.3SG', 'irat', 'r1', 'go'), cell(go.class, 'PST.3SG', 'ersi', 'r1', 'go')];
    const paradigm = { categories: { tenses: ['PRS', 'PST'] }, classes: {
        v1: { pos: 'v', exemplarId: 'r2', cells: { 'PRS.3SG': { form: parseWord('badat') }, 'PST.3SG': { form: parseWord('badasi') } } },
        [go.class]: { pos: 'v', exemplarId: 'r1', irregular: true, cells: { 'PRS.3SG': { form: parseWord('irat') }, 'PST.3SG': { form: parseWord('ersi') } } } } };
    const st = { paradigm, entries, phonotactics: PT };
    eq('an irregular verb says what its own cells say (sound change made "ersi", not *"irasi")', wordToIpa(inflect(go, 'PST.3SG', st)), 'ersi');
    eq('a regular verb takes its class ending', wordToIpa(inflect(entries.find((e) => e.id === 'r3'), 'PST.3SG', st)), 'kanasi');
    const went = applySuppletion(entries, [{ kind: 'suppletion', year: 100, cls: go.class, slot: 'PST', lexeme: 'r1', gloss: 'go', donor: 'r2', donorGloss: 'walk' }], { phonotactics: PT, paradigm });
    eq('suppletion: "go" takes its past from "walk" (English went, from wend)', went.entries.find((e) => e.id === `para:${go.class}:PST.3SG`)?.ipa, 'badasi');
    ok('  …the present is untouched', went.entries.find((e) => e.id === `para:${go.class}:PRS.3SG`)?.ipa === 'irat');
    ok('  …and the change is a step in the derivation', went.changed.length === 1 && went.changed[0].label.includes('walk'));
    ok('every suppletion source carries an attested example', Object.values(SUPPLETION_SOURCES).every((s) => s.attested.length > 30));
    const concepts = new Set(conceptList(800).map((c) => c.gloss));
    const missing = Object.entries(SUPPLETION_SOURCES).flatMap(([g, s]) => [g, ...s.from].filter((x) => !concepts.has(x)));
    ok('every suppletive meaning and donor is in the concept list', !missing.length, missing.join(', '));
    // a new word for "go": it inherits the slot, and the old paradigm goes
    const replaced = entries.map((e) => (e.id === 'r1' ? { ...e, retired: true } : e));
    const newGo = { ...w('r9', 'go', 'v', 'tuma', 'v1', 3) };
    const renewed = renewIrregulars([...replaced, newGo], { paradigm, phonotactics: PT });
    const carrier = renewed.entries.find((e) => e.id === 'r9');
    ok('a new word for a common meaning gets a paradigm of its own', isIrregularClass(carrier.class) && carrier.class !== go.class, carrier.class);
    eq('  …regular to begin with', renewed.entries.find((e) => e.id === `para:${carrier.class}:PST.3SG`)?.ipa, 'tumasi');
    ok('  …and the replaced word\'s own paradigm is dropped', !renewed.entries.some((e) => e.id.startsWith(`para:${go.class}:`)));
}

// ===========================================================================
section('Articles: "the" from "that", "a" from "one"');
// ===========================================================================
{
    const PT = { onset: { max: 2, licensedExceptions: [] }, coda: { max: 2, allowed: null }, nucleus: { diphthongs: [] }, stress: { rule: 'penultimate' } };
    const lex = [{ id: 'r1', gloss: 'that', pos: 'dem', form: parseWord('dat'), ipa: 'dat', rank: 4 },
        { id: 'r2', gloss: 'one', pos: 'num', form: parseWord('ana'), ipa: 'ana', rank: 6 }];
    const both = buildArticleSystem(lex, { definite: 'word', indefinite: 'word' }, PT);
    eq('a definite article worn down from "that" (that > the)', both.entries.find((e) => e.article === 'DEF')?.ipa, 'da');
    eq('an indefinite article worn down from "one" (ān > a)', both.entries.find((e) => e.article === 'INDF')?.ipa, 'a');
    ok('  …marked as grammar, so lexical change passes them by', both.entries.filter((e) => e.article).every((e) => e.paradigm && e.pos === 'art'));
    const none = buildArticleSystem(lex, { definite: null, indefinite: 'one' }, PT);
    ok('"one" used as "a" needs no word of its own (German ein)', !none.entries.some((e) => e.article) && none.system.indefinite === 'one');
    const cats = { articles: none.system };
    const cycle = applyArticles(none.entries, [
        { kind: 'article', article: 'definite', step: 'demonstrative', year: 10 },
        { kind: 'article', article: 'definite', step: 'word', year: 20 },
        { kind: 'article', article: 'indefinite', step: 'lost', year: 30 }], { phonotactics: PT, categories: cats });
    ok('the definiteness cycle: "that" used as "the", then a word of its own', cycle.categories.articles.definite === 'word' && cycle.entries.some((e) => e.article === 'DEF'));
    ok('  …and an article can fade out', cycle.categories.articles.indefinite === null);
    const romanian = applyArticles(cycle.entries, [], { phonotactics: PT, categories: { ...cycle.categories, definite: true } });
    ok('a definite ending takes over from the free article (Romanian lupul)', romanian.categories.articles.definite === 'affix' && !romanian.entries.some((e) => e.article === 'DEF'));
    let grew = 0;
    for (let i = 0; i < 40; i++) {
        const plan = planArticles({ entries: lex, paradigm: { categories: { articles: { definite: null, indefinite: null } } } }, derive('art', String(i)), { from: 0, to: 4000 });
        if (plan.some((e) => e.article === 'definite')) grew += 1;
    }
    ok('a language without articles often grows one in four millennia, not always', grew > 5 && grew < 38, `${grew}/40`);
}

// ===========================================================================
section('Moods: commands, "don\'t" and wishes');
// ===========================================================================
{
    const PT = { onset: { max: 2, licensedExceptions: [] }, coda: { max: 2, allowed: null }, nucleus: { diphthongs: [] }, stress: { rule: 'penultimate' } };
    // a small verb system: one class, present and past, 2nd persons
    const stateOf = (cells, moods, extra = []) => {
        const stem = { id: 'r1', gloss: 'sing', pos: 'v', form: parseWord('kan'), ipa: 'kan', class: 'v1', rank: 10 };
        const entries = [stem, ...extra, ...Object.entries(cells).map(([c, f]) => ({ id: `para:v1:${c}`, form: parseWord(f), ipa: f, pos: 'v', class: 'v1', rank: 10, paradigm: { cls: 'v1', cell: c, stem: 'r1', stemGloss: 'sing' } }))];
        const paradigm = { categories: { type: 'agglutinative', persons: ['2SG', '2PL', '3SG', '1PL'], tenses: ['PRS', 'PST'], moods },
            classes: { v1: { pos: 'v', exemplarId: 'r1', members: 20, cells: Object.fromEntries(Object.entries(cells).map(([c, f]) => [c, { form: parseWord(f) }])) } } };
        return { entries, paradigm, syntax: { negation: 'before' } };
    };
    const base = { 'PRS.2SG': 'kanu', 'PRS.2PL': 'kante', 'PRS.3SG': 'kana', 'PRS.1PL': 'kanmo', 'PST.2SG': 'kanisu', 'PST.2PL': 'kanite' };
    const both = { imperative: { sg: 'own', pl: 'own' }, prohibitive: { neg: 'normal', verb: 'imperative' }, irrealis: { series: null, hortative: null } };
    eq('Latin canta, cantate: commands for one and for several', imperativeValue(stateOf({ ...base, 'IMP.2SG': 'kan', 'IMP.2PL': 'kante2'.replace('2', 'i') }, both)), 'second singular and plural');
    eq('English: the "command" is the present, so there is none', imperativeValue(stateOf({ ...base, 'IMP.2SG': 'kanu' }, { ...both, imperative: { sg: 'own', pl: 'indicative' } })), 'none');
    eq('German sing!, singt!: the plural command is the present', imperativeValue(stateOf({ ...base, 'IMP.2SG': 'kan' }, { ...both, imperative: { sg: 'own', pl: 'indicative' } })), 'second singular only');
    eq('Swedish kom!: one form for one or several', imperativeValue(stateOf({ ...base, 'IMP.2SG': 'kan' }, { ...both, imperative: { sg: 'own', pl: 'sg' } })), 'number-neutral');
    eq('Spanish canta = 3rd singular present: still a command form of its own (D1)', imperativeValue(stateOf({ ...base, 'PRS.3SG': 'kan', 'IMP.2SG': 'kan', 'IMP.2PL': 'kanad' }, both)), 'second singular and plural');
    // the draws: three, whatever is declared
    const r1 = derive('mood', 'draw'), r2 = derive('mood', 'draw');
    drawMoodSpec(r1, { type: 'agglutinative', order: 'SOV' }, {});
    drawMoodSpec(r2, { type: 'agglutinative', order: 'SOV' }, { imperative: 'none', irrealis: 'optative' });
    ok('a declared mood moves no other draw', r1.next() === r2.next());
    // "don't" with a verb of its own: a special negative (Welsh paid, Finnish älä)
    const stop = { id: 'r9', gloss: 'stop', pos: 'v', form: parseWord('pai'), ipa: 'pai', rank: 30 };
    const aux = stateOf({ ...base, 'IMP.2SG': 'kan', 'IMP.2PL': 'kani' }, { ...both, prohibitive: { neg: 'auxiliary', marker: 'mood:PROH:r9', verb: 'imperative' } },
        [stop, { ...makeMoodWord('PROH', parseWord('pai'), [stop], PT), id: 'mood:PROH:r9' }]);
    eq('"don\'t" with a verb of its own reads as a special negative', prohibitiveValue(aux), 'normal imperative + special negative');
    // changes, and what sound change undoes
    const st = stateOf({ ...base, 'IMP.2SG': 'kan', 'IMP.2PL': 'kani' }, both);
    const lev = applyMoods(st.entries, [{ kind: 'mood', system: 'imperative', step: 'plural-levelled', from: 'B', to: 'N', year: 10 }], { phonotactics: PT, paradigm: st.paradigm, categories: st.paradigm.categories });
    ok('Swedish: the plural command goes, one form serves for both', !lev.entries.some((e) => e.id === 'para:v1:IMP.2PL') && lev.categories.moods.imperative.pl === 'sg');
    const worn = stateOf({ ...base, 'IMP.2SG': 'kanu', 'IMP.2PL': 'kani' }, both);
    const syncd = applyMoods(worn.entries, [], { phonotactics: PT, paradigm: worn.paradigm, categories: worn.paradigm.categories });
    ok('a command worn into the present by sound change is gone (English)', !syncd.entries.some((e) => e.id === 'para:v1:IMP.2SG') && syncd.categories.moods.imperative.sg === 'indicative');
    const let_ = { id: 'r7', gloss: 'leave', pos: 'v', form: parseWord('lasa'), ipa: 'lasa', rank: 40 };
    const hort = stateOf(base, { ...both, irrealis: { series: null, hortative: 'mood:HORT:r7' } }, [let_, { ...makeMoodWord('HORT', parseWord('la'), [let_], PT), id: 'mood:HORT:r7' }]);
    const bonded = applyMoods(hort.entries, [{ kind: 'mood', system: 'irrealis', step: 'irr-bond', from: 'H', to: 'O', year: 20 }], { phonotactics: PT, paradigm: hort.paradigm, categories: hort.paradigm.categories });
    const irr = bonded.entries.find((e) => e.id === 'para:v1:IRR.2SG');
    ok('the "let" word bonds to the verb: an optative (Turkish -(y)A)', irr && bonded.categories.moods.irrealis.series === 'OPT' && !bonded.entries.some((e) => e.mood === 'HORT'), irr?.ipa);
    ok('  …built on the present, and dated', irr?.ipa.startsWith('kanu') && irr.grammaticalisedFrom?.year === 20);
    ok('  …without touching the parent\'s entries', !hort.entries.some((e) => e.grammaticalisedFrom && e.id.includes('IRR')));
    eq('the mood cells are moods, not tenses', isMoodCell('IRR.2SG') && !isMoodCell('PST.2SG'), true);
}

// ===========================================================================
section('Evidentials: how the speaker knows');
// ===========================================================================
{
    const PT = { onset: { max: 2, licensedExceptions: [] }, coda: { max: 2, allowed: null }, nucleus: { diphthongs: [] }, stress: { rule: 'penultimate' } };
    const v = (id, gloss, form) => ({ id, gloss, pos: 'v', form: parseWord(form), ipa: form, class: 'v1', rank: 20 });
    const lex = [v('r1', 'say', 'zera'), v('r2', 'seem', 'mira'), v('r3', 'see', 'tona'), v('r4', 'die', 'kaba')];
    const paradigm = { categories: { type: 'agglutinative', persons: ['3SG'], tenses: ['PRS', 'PST'] }, classes: {} };
    const a = derive('ev', 'draw'), b = derive('ev', 'draw');
    drawEvidentialSpec(a, { type: 'agglutinative', order: 'SOV' }, {});
    drawEvidentialSpec(b, { type: 'agglutinative', order: 'SOV' }, { evidentials: 'none' });
    ok('a declared evidential system moves no other draw', a.next() === b.next());
    const built = buildEvidentialSystem(lex, paradigm, { state: 'Ip', terms: ['REP'] }, { phonotactics: PT, type: 'agglutinative', headFinal: true });
    const rep = built.entries.find((e) => e.evidential === 'REP');
    ok('a reportative particle worn down from "say" (Tibetan zer)', rep && rep.ipa === wordToIpa(weakenedForm(parseWord('zera'), PT)) && rep.paradigm && rep.pos === 'part', rep?.ipa);
    const st = { entries: built.entries, paradigm: { ...paradigm, categories: { ...paradigm.categories, evidentials: built.system } } };
    eq('  …reads as a separate particle, indirect only (WALS 78A, 77A)', JSON.stringify(evidentialValues(st)), JSON.stringify({ evidentials: 'indirect only', evidentialCoding: 'separate particle' }));
    const bonded = applyEvidentials(st.entries, [{ kind: 'evidential', step: 'bond', from: 'Ip', to: 'Ia', year: 50 }], { phonotactics: PT, categories: st.paradigm.categories });
    eq('a particle bonds to the verb as an ending (Quechua -si)', evidentialValues({ entries: bonded.entries, paradigm: { categories: bonded.categories } }).evidentialCoding, 'affix or clitic');
    const dir = applyEvidentials(bonded.entries, [{ kind: 'evidential', step: 'dir-rise', from: 'Ia', to: 'Da', year: 60 }], { phonotactics: PT, categories: bonded.categories });
    eq('a direct marker from "see" makes the system direct and indirect (Quechua -mi)', evidentialValues({ entries: dir.entries, paradigm: { categories: dir.categories } }).evidentials, 'direct and indirect');
    const lostInd = { ...dir.categories, evidentials: { terms: { DIR: dir.categories.evidentials.terms.DIR } } };
    const synced = applyEvidentials(dir.entries, [], { phonotactics: PT, categories: lostInd });
    ok('a direct marker never stands alone', synced.categories && synced.categories.evidentials === null);
    const noPerf = applyEvidentials(lex, [{ kind: 'evidential', step: 'reanalyse-perfect', from: '0', to: 'Dt', slot: 'PRF', year: 70 }], { phonotactics: PT, categories: paradigm.categories });
    ok('a perfect cannot turn non-firsthand where there is no perfect', !noPerf.categories?.evidentials);
    const prf = [...lex, { id: 'para:v1:PRF.3SG', form: parseWord('kabaso'), ipa: 'kabaso', pos: 'v', class: 'v1', paradigm: { cls: 'v1', cell: 'PRF.3SG', stem: 'r4' } }];
    const turk = applyEvidentials(prf, [{ kind: 'evidential', step: 'reanalyse-perfect', from: '0', to: 'Dt', slot: 'PRF', year: 70 }], { phonotactics: PT, categories: paradigm.categories });
    eq('Turkish -miş: the perfect turns non-firsthand, the plain past first-hand by contrast', JSON.stringify(evidentialValues({ entries: turk.entries, paradigm: { categories: turk.categories } })), JSON.stringify({ evidentials: 'direct and indirect', evidentialCoding: 'part of the tense system' }));
    eq('"they say" takes the reportative, else the non-firsthand past', chooseTerm(turk.categories, 'reported')?.term, 'NFH');
}

// ===========================================================================
section('Review fixes, 17 Oct 2026');
// ===========================================================================
{
    const PT = { onset: { max: 2, licensedExceptions: [] }, coda: { max: 2, allowed: null }, nucleus: { diphthongs: [] }, stress: { rule: 'penultimate' } };
    // one word with two senses is not a homophone clash
    const we = { id: 'r3', gloss: 'we', pos: 'pron', domain: 'person', form: parseWord('nos'), ipa: 'nos', rank: 5 };
    const incl = { ...we, id: 'r747', gloss: 'we (inclusive)', rank: 700, sameWordAs: 'r3' };
    ok('therapy leaves one word with two senses alone ("we" serving both)', planTherapy([we, incl], derive('t', '1'), { year: 0 }).length === 0);
    // a replaced or copied word left in another word's own class goes back to a regular one
    const owner = { id: 'r1', gloss: 'go', pos: 'v', form: parseWord('ira'), ipa: 'ira', class: 'vx1', baseClass: 'v1', retired: true, rank: 3 };
    const heir = { id: 'r9', gloss: 'go', pos: 'v', form: parseWord('tuma'), ipa: 'tuma', class: 'vx1', rank: 3 };
    const cells = [{ id: 'para:vx1:PST.3SG', form: parseWord('ersi'), ipa: 'ersi', pos: 'v', class: 'vx1', paradigm: { cls: 'vx1', cell: 'PST.3SG', stem: 'r1' } },
        { id: 'para:v1:PST.3SG', form: parseWord('badasi'), ipa: 'badasi', pos: 'v', class: 'v1', paradigm: { cls: 'v1', cell: 'PST.3SG', stem: 'r2' } },
        { id: 'r2', gloss: 'walk', pos: 'v', form: parseWord('bada'), ipa: 'bada', class: 'v1', rank: 40 }];
    const paradigm = { classes: { v1: { pos: 'v', exemplarId: 'r2', cells: {} }, vx1: { pos: 'v', exemplarId: 'r1', irregular: true, cells: {} } } };
    const renewed = renewIrregulars([owner, heir, ...cells], { paradigm, phonotactics: PT });
    const heirNow = renewed.entries.find((e) => e.id === 'r9');
    ok('a new word that took a replaced word\'s own class gets a fresh one of its own', isIrregularClass(heirNow.class) && heirNow.class !== 'vx1', heirNow.class);
    eq('  …regular to begin with', renewed.entries.find((e) => e.id === `para:${heirNow.class}:PST.3SG`)?.ipa, 'tumasi');
    // WALS 79A counts tense and aspect only
    const plural = [{ id: 'para:nx1:NOM.PL', pos: 'n', suppletive: { from: 'people', slot: 'PL' }, form: [] }];
    ok('suppletion of a plural is not tense suppletion (WALS 79A)', hasSuppletion(plural) && !hasSuppletion(plural, 'tense'));
    // a "you" with no polite distinction stays one word when "you" is replaced
    const you = { id: 'r1', gloss: 'you (sg)', pos: 'pron', form: parseWord('ka'), ipa: 'ka', rank: 2 };
    const pol = { id: 'r748', gloss: 'you (polite)', pos: 'pron', form: parseWord('tu'), ipa: 'tu', rank: 700, sameWordAs: 'r0' };
    const synced = applyPronouns([you, pol], [], { phonotactics: PT, categories: { pronouns: { clusivity: false, polite: null } } });
    eq('with no polite "you", the alias follows a replaced "you"', synced.entries.find((e) => e.gloss === 'you (polite)').ipa, 'ka');
}

// ===========================================================================
section('An isolating language grows its first ending');
// ===========================================================================
{
    const PT = { onset: { max: 2, licensedExceptions: [] }, coda: { max: 1, allowed: null }, nucleus: { diphthongs: [] }, stress: { rule: 'initial' } };
    const v = (id, gloss, form, rank) => ({ id, gloss, pos: 'v', class: 'v1', form: parseWord(form), ipa: form, rank, syllables: 1 });
    const words = [v('r1', 'go', 'ku', 10), v('r2', 'eat', 'ma', 20), v('r3', 'see', 'pa', 30)];
    const paradigm = { classes: {}, categories: { type: 'isolating', tenses: [], persons: [] } };
    const ev = { id: 'gram-first-future-from-motion', year: 500, kind: 'grammaticalisation', first: true, cline: 'future-from-motion', cell: 'FUT', label: 'future tense', axis: 'verbal', sourceId: 'r1', sourceGloss: 'go' };
    const r = applyGrammaticalisation(words, [ev], { phonotactics: PT, paradigm });
    const cells = r.entries.filter((e) => e.paradigm);
    ok('the first ending lays out a verb paradigm from nothing', cells.length === 12, `${cells.length} cells`);
    eq('  the bare verb is its present', cells.find((e) => e.paradigm.cell === 'PRS.3SG')?.ipa, 'ku');
    ok('  and the bonded "go" marks the future', cells.find((e) => e.paradigm.cell === 'FUT.3SG')?.ipa?.length > 2);
    eq('the language now counts as agglutinating', r.categories?.type, 'agglutinative');
    eq('  and remembers it was isolating', r.categories?.typeFrom?.type, 'isolating');
    ok('one ending alone leaves no person agreement', new Set(cells.filter((e) => e.paradigm.cell.startsWith('FUT.')).map((e) => e.ipa)).size === 1);
}

// ===========================================================================
section('Sound systems, 18 Oct 2026: WALS 4A-19A');
// ===========================================================================
{
    // implosives have symbols of their own, and read back as voiced glottalised stops
    eq('a voiced glottalised bilabial stop is written ɓ', consonant({ place: 'bilabial', manner: 'stop', voice: true, glottalised: true }).ipa, 'ɓ');
    const d = fromIpa('ɗ');
    ok('ɗ reads back as a voiced glottalised alveolar stop', d && d.f.voice && d.f.glottalised && d.f.place === 'alveolar' && d.f.manner === 'stop');
    // the devoicing partner of tonogenesis takes the fricatives too (Mandarin kept no voiced obstruent)
    const dev = templateById('devoicing-after-tonogenesis').build();
    const rule = makeRule({ id: 't', template: 'devoicing-after-tonogenesis', ...dev });
    eq('after tonogenesis z devoices with b', wordToIpa(applyRule(parseWord('zaba'), rule).segments), 'sapa');
    // WALS 12A, read as WALS reads it
    const w = (s) => ({ id: s, form: parseWord(s) });
    const cv = ['pata', 'kina', 'mosu', 'lela', 'tapu', 'nimo', 'kasa', 'sipo', 'muna', 'rako'].map(w);
    eq('words of (C)V syllables: simple', syllableStructure(cv), 'simple');
    eq('a doubled consonant is one long one: still simple', syllableStructure([...cv, w('patta'), w('kinna')].slice(2)), 'simple');
    eq('a final cluster: complex', syllableStructure([...cv.slice(5), w('pantam'), w('kosta'), w('lemp'), w('tika')]), 'complex');
    eq('a coda, and C + liquid onsets: moderately complex', syllableStructure([...cv.slice(4), w('patan'), w('plako'), w('sinta'), w('kamu')]), 'moderately complex');
    // and the inventory chapters off the consonant phonemes
    const t = soundTypology({ vowels: [] }, ['pata', 'bada', 'safa', 'lika', 'ŋaka', 'kana', 'nala', 'naŋa'].map(w), { stress: { rule: 'initial' } });
    eq('p/b and no voiced fricative: voicing in plosives alone', t.voicing, 'in plosives alone');
    eq('ŋ at the start of a word', t.velarNasal, 'word-initially too');
    eq('fixed initial stress', t.stress, 'initial');
    // every sound added that day can be read aloud (the panel's reader IPA)
    const fresh = ['ɓ', 'ɗ', 'ᶑ', 'ʄ', 'ɠ', 'ʛ', 'k͡p', 'ɡ͡b', 'ħ', 'ʕ', 'ɬ', 'ɮ'];
    const unvoiced = fresh.filter((s) => [...readerSafe(`a${s}a`)].some((ch) => !READER_ALPHABET.has(ch)));
    ok('implosives, labial-velars, pharyngeals and lateral fricatives all read aloud', unvoiced.length === 0, unvoiced.join(' '));
    // the syllable changes: closing (Slavic) and opening (Pali, Romance, Hawaiian)
    const SPT = { onset: { max: 2, licensedExceptions: [] }, coda: { max: 2, allowed: null }, nucleus: { diphthongs: [] }, stress: { rule: 'final' } };
    const run = (id, word, built) => wordToIpa(applyRule(markStress(parseWord(word), SPT), makeRule({ id: 't', template: id, ...(built || templateById(id).build()) })).segments);
    eq('pretonic syncope: *dъva > dva', run('pretonic-syncope', 'dəva'), 'dva');
    eq('cluster assimilation: karma > kamma', run('cluster-assimilation', 'karma'), 'kamma');
    eq('  an onset cluster is left alone', run('cluster-assimilation', 'apra'), 'apra');
    const ginv = { consonants: ['n', 'j', 'p'].map(fromIpa), vowels: ['a'].map(fromIpa) };
    eq('glide coalescence: nj > nʲ', run('glide-coalescence', 'nja', templateById('glide-coalescence').build(ginv, derive('t', 'g'), SPT, { probe: [{ form: parseWord('nja') }] })), 'nʲa');
    const pinv = { consonants: ['t'].map(fromIpa), vowels: ['a'].map(fromIpa) };
    eq('paragoge: a vowel after a final consonant', run('paragoge', 'pat', templateById('paragoge').build(pinv, derive('t', 'p'))), 'pata');
    // a glide after a consonant goes (yod-dropping): the open lineages' repair of nja, ʃwo
    const gl = templateById('glide-loss').build({ consonants: ['n', 'j', 't'].map(fromIpa), vowels: ['a'].map(fromIpa) }, derive('t', 'gl'), SPT, { probe: [{ form: parseWord('nja') }] });
    eq('glide loss: nja > na', run('glide-loss', 'nja', gl), 'na');
    eq('  and a j after a vowel is left (aja)', run('glide-loss', 'aja', gl), 'aja');
    // a uvular stop goes fricative between vowels and stays a stop elsewhere (Kazakh q, [χ] between vowels)
    const qinv = { consonants: ['q', 't'].map(fromIpa), vowels: ['a'].map(fromIpa) };
    const uv = templateById('uvular-spirantisation').build(qinv, derive('t', 'q'));
    eq('uvular spirantisation: aqa > aχa', run('uvular-spirantisation', 'aqa', uv), 'aχa');
    eq('  and qat keeps its q', run('uvular-spirantisation', 'qat', uv), 'qat');
    eq('  never where the language has a uvular fricative already', templateById('uvular-spirantisation').build({ consonants: ['q', 'χ'].map(fromIpa), vowels: ['a'].map(fromIpa) }, derive('t', 'q2')), null);
}

// ===========================================================================
section('Colexification: one word for two meanings (WALS 129A-135A)');
// ===========================================================================
{
    const n = (id, gloss, ipa, pos = 'n') => ({ id, gloss, pos, form: parseWord(ipa), ipa, rank: 50, syllables: 2 });
    const lex = [n('r1', 'hand', 'kama'), n('r2', 'arm', 'tiru'), n('r3', 'finger', 'pesu'), n('r4', 'green', 'wola', 'adj'), n('r5', 'blue', 'suni', 'adj'), n('r6', 'red', 'rata', 'adj'), n('r7', 'yellow', 'jelo', 'adj'), n('r8', 'sky', 'loma')];
    const always = { bool: () => true, float: (a) => a, next: () => 0 };
    const joined = colexifyProto(lex, always);
    eq('at the proto a pair can be one word: arm takes the word for hand', joined.find((e) => e.gloss === 'arm').ipa, 'kama');
    eq('  and is the same word, not a homophone', joined.find((e) => e.gloss === 'arm').sameWordAs, 'r1');
    eq('the measure reads it back (WALS 129A)', colexValues(joined).handArm, 'identical');
    eq('  and blue with green (134A)', colexValues(joined).greenBlue, 'green/blue');
    eq('kept apart, they are different', colexValues(lex).handArm, 'different');
    // a merge, planned over a long time so that it surely comes
    const merges = planColexification({ entries: lex }, derive('t', 'colex'), { from: 0, to: 100000 });
    const m = merges.find((e) => e.colex === 'hand-arm');
    ok('a lineage can merge a pair: the word for hand spreads to the arm', m && m.strategy === 'neighbour' && m.to === 'r1', JSON.stringify(m));
    const after = applyReplacements(lex, [m]);
    eq('  and replacement builds it: "arm" is now the word for "hand"', after.find((e) => !e.retired && e.gloss === 'arm')?.ipa, 'kama');
    // a split of a joined pair coins a word of its own
    const splits = planColexification({ entries: joined }, derive('t', 'colex2'), { from: 0, to: 100000 });
    const s = splits.find((e) => e.colex === 'green-blue');
    ok('a joined pair can split: blue gets a word of its own ("sky-green")', s && s.strategy === 'compound' && s.compound.modifier === 'r8', JSON.stringify(s));
    // a dark-cool term: black, green and blue one word (WALS 134A's "other")
    const lex3 = [...lex, n('r9', 'black', 'duma', 'adj'), n('r10', 'night', 'nesu')];
    const dark = colexifyProto(lex3, always);
    eq('where green and blue are one word, black can be the same word (a "dark-cool" term)', [dark.find((e) => e.gloss === 'green').ipa, dark.find((e) => e.gloss === 'blue').ipa].join(), 'duma,duma');
    eq('  and the measure reads it as WALS\'s "other"', colexValues(dark).greenBlue, 'other');
    const divide = planColexification({ entries: dark }, derive('t', 'colex3'), { from: 0, to: 100000 });
    const b = divide.find((e) => e.colex === 'black-grue');
    ok('a dark-cool term divides with black getting a word of its own ("night-dark")', b && b.meaning === 'black' && b.strategy === 'compound' && b.compound.modifier === 'r10', JSON.stringify(b));
    ok('  before green and blue part', !divide.some((e) => e.colex === 'green-blue'), JSON.stringify(divide.map((e) => e.colex)));
    // (green and blue alone with black, so nothing else can claim them first)
    const grueOnly = colexifyProto([n('r4', 'green', 'wola', 'adj'), n('r5', 'blue', 'suni', 'adj')], always).concat([n('r9', 'black', 'duma', 'adj')]);
    const grue = planColexification({ entries: grueOnly }, derive('t', 'colex4'), { from: 0, to: 100000 });
    const spread = grue.filter((e) => e.colex === 'black-grue');
    ok('  and a grue can take the word for black: green and blue both', spread.length === 2 && spread.every((e) => e.to === 'r9' && e.strategy === 'neighbour'), JSON.stringify(spread));
}

// ===========================================================================
section('Persons before the stem: prefixing paradigms (WALS 26A)');
// ===========================================================================
{
    const w = parseWord;
    const cut = (stem, form) => { const a = splitAround(w(stem), w(form)); return a.found ? `${wordToIpa(a.pre)}|${wordToIpa(a.post)}` : null; };
    eq('an ending language: the stem at the front, the rest the ending', cut('soma', 'somana'), '|na');
    eq('persons before the stem: the stem found inside the form (ni-soma-na)', cut('soma', 'nisomana'), 'ni|na');
    eq('  though a sound of it changed inside the form (ni-lazoma-na beside lasoma)', cut('lasoma', 'nilazomana'), 'ni|na');
    eq('  but not where it is not there at all', cut('lasoma', 'nikutepa'), null);
    // split by the paradigm, where the stem inside the forms has gone its own way
    const cells = Object.fromEntries([['PRS.1SG', 'nalʲaʂa'], ['PRS.2SG', 'urlalʲaʂa'], ['PRS.3SG', 'alʲaʂa'], ['PRS.1PL', 'tulʲaʂa'],
        ['PST.1SG', 'nalʲaʂana'], ['PST.2SG', 'urlalʲaʂana'], ['PST.3SG', 'alʲaʂana'], ['PST.1PL', 'tulʲaʂana']].map(([k, v]) => [k, { form: w(v) }]));
    const ps = paradigmSplit(cells, 'PST.2SG');
    eq('a form split by its paradigm: the person before what the persons share, the tense after what the tenses share', ps && `${wordToIpa(ps.pre)}|${wordToIpa(ps.post)}`, 'url|na');
    // tense before the stem as well, after the person (Swahili ni-li-soma)
    const sw = Object.fromEntries([['PRS.1SG', 'nisoma'], ['PRS.2SG', 'usoma'], ['PRS.3SG', 'asoma'], ['PST.1SG', 'nilisoma'], ['PST.2SG', 'ulisoma'], ['PST.3SG', 'alisoma']].map(([k, v]) => [k, { form: w(v) }]));
    const sp = paradigmSplit(sw, 'PST.2SG');
    eq('  and where tense comes before the stem too, person and tense together before it (u-li-soma)', sp && `${wordToIpa(sp.pre)}|${wordToIpa(sp.post)}`, 'uli|');
    // the persons of a tense levelled from the right: the person marker kept
    const tense = new Map([['PRS.1SG', 'nisoma'], ['PRS.2SG', 'usoma'], ['PRS.3SG', 'asoma'], ['PRS.1PL', 'tusema']].map(([k, v]) => [k, { form: w(v) }]));
    const right = analyseStemRight(tense);
    ok('the persons of a tense share their right-hand part, and the one a sound change altered is the outlier',
        right && wordToIpa(right.right) === 'soma' && right.outliers.join() === 'PRS.1PL', JSON.stringify(right && { r: wordToIpa(right.right), o: right.outliers }));

    // a whole family with persons before the stem, through the engine
    const { createProject } = await import('../js/engine/project.js');
    const tree = [
        { id: 'p', name: 'Proto-Swaru', born: -1200, diverged: true },
        { id: 'a', name: 'Swaru', born: 400, parentId: 'p', relation: 'branch' },
    ];
    const cfg = { name: 'Test', seed: 'prefix/1', lexiconSize: 120, derivation: false, rootId: 'p', presentYear: 1765,
        morphology: { type: 'agglutinative', personPosition: 'prefix', objectAgreement: false, tenses: ['PRS', 'PST'] } };
    const pr = createProject({ tree, names: tree.map((l) => l.name), config: cfg, borrowings: [] });
    const proto = pr.stateOf('p');
    const v = Object.entries(proto.paradigm.classes).find(([k, c]) => c.pos === 'v' && !isIrregularClass(k));
    const stemOf = (st, c) => st.entries.find((e) => e.id === c.exemplarId).form;
    // read as the engine reads them: the stem found inside, else the form split by its paradigm
    const both = v ? Object.keys(v[1].cells).filter((k) => k.startsWith('PST.')).filter((k) => {
        const c = splitForm(stemOf(proto, v[1]), v[1].cells, k);
        return c && c.pre.length && c.post.length;
    }).length : 0;
    ok('the proto builds its verbs person + stem + tense (Swahili ni-li-soma)', both >= 4,
        JSON.stringify(v && { stem: wordToIpa(stemOf(proto, v[1])), cells: Object.fromEntries(Object.entries(v[1].cells).map(([k, x]) => [k, wordToIpa(x.form)])) }));
    const leaf = pr.stateOf('a');
    const lv = leaf.paradigm.classes[v[0]];
    const member = leaf.entries.find((e) => e.class === v[0] && !e.paradigm && !e.retired && e.id !== lv.exemplarId && e.form?.length >= 2);
    const f1 = member && inflect(member, 'PST.1SG', leaf);
    // (the junction repaired: u-wumja-e is uwumje)
    ok('a member verb takes the person before it and the tense after it', !!f1 && wordToIpa(f1).includes(wordToIpa(member.form.slice(0, -1))) && !wordToIpa(f1).startsWith(wordToIpa(member.form.slice(0, 2))),
        member && `${wordToIpa(member.form)} → ${f1 && wordToIpa(f1)}; exemplar ${wordToIpa(stemOf(leaf, lv))} PST.1SG ${wordToIpa(lv.cells['PST.1SG']?.form || [])}`);
    const ch = morphologyChapters(leaf);
    ok('the measure counts both sides: not strongly suffixing (WALS 26A)', ch.affixation !== 'strongly suffixing' && ch.affixation !== 'little affixation', ch.affixation);
    eq('  and its tenses are still suffixes (69A)', ch.tensePosition, 'suffixes');
    // and a family with tense before the stem as well
    const pr2 = createProject({ tree, names: tree.map((l) => l.name), config: { ...cfg, seed: 'prefix/2', morphology: { ...cfg.morphology, tensePosition: 'prefix' } }, borrowings: [] });
    const leaf2 = pr2.stateOf('a');
    const ch2 = morphologyChapters(leaf2);
    // (or mixed, where sound change has worn a tense prefix into the stem: a-ke-dana, ajana)
    ok('a family with person and tense before the stem: tense prefixes (69A)', ['prefixes', 'mixed'].includes(ch2.tensePosition), ch2.tensePosition);
    ok('  and the verb is prefixing (26A)', /prefixing/.test(ch2.affixation), ch2.affixation);
    const v2 = Object.entries(leaf2.paradigm.classes).find(([k, c]) => c.pos === 'v' && !isIrregularClass(k));
    const m2 = leaf2.entries.find((e) => e.class === v2[0] && !e.paradigm && !e.retired && e.id !== v2[1].exemplarId && e.form?.length >= 2);
    const g2 = m2 && inflect(m2, 'PST.1SG', leaf2);
    ok('  and a member verb takes both before it', !!g2 && wordToIpa(g2).endsWith(wordToIpa(m2.form.slice(1))) && wordToIpa(g2).length > wordToIpa(m2.form).length,
        m2 && `${wordToIpa(m2.form)} → ${g2 && wordToIpa(g2)}; exemplar PST.1SG ${wordToIpa(v2[1].cells['PST.1SG']?.form || [])}`);
}

// ===========================================================================
section('A recent past and a remote past (WALS 66A)');
// ===========================================================================
{
    const st = (cells) => ({ entries: [{ id: 'r1', form: parseWord('soma') }],
        paradigm: { categories: { type: 'agglutinative', tenses: Object.keys(cells).map((k) => k.split('.')[0]) },
            classes: { v1: { pos: 'v', members: 10, exemplarId: 'r1', cells: Object.fromEntries(Object.entries(cells).map(([k, v]) => [k, { form: parseWord(v) }])) } } } });
    eq('a recent past and a remote past, apart from each other: 2-3 degrees',
        morphologyChapters(st({ 'PRS.3SG': 'soma', 'PST.3SG': 'somana', 'REM.3SG': 'somaka' })).pastTense, 'present, 2-3 remoteness distinctions');
    eq('  fallen together: a past with no degrees', morphologyChapters(st({ 'PRS.3SG': 'soma', 'PST.3SG': 'somana', 'REM.3SG': 'somana' })).pastTense, 'present, no remoteness distinctions');
    eq('  and the remote past alone, where the recent one is gone, is a past', morphologyChapters(st({ 'PRS.3SG': 'soma', 'REM.3SG': 'somaka' })).pastTense, 'present, no remoteness distinctions');
    // drawn at the proto, never where lang-config sets the tenses
    let drawn = 0;
    for (let i = 0; i < 200; i++) {
        const ch = inferCharacter({ meanSyllablesPerWord: 2.6 }, derive(`rem/${i}`, 'c'), { morphology: { type: 'agglutinative' } });
        if (ch.morphology.tenses?.includes('REM')) drawn += 1;
    }
    ok('a family draws a remote past about three times in ten', drawn > 40 && drawn < 80, String(drawn));
    const set = inferCharacter({ meanSyllablesPerWord: 2.6 }, derive('rem/x', 'c'), { morphology: { type: 'agglutinative', tenses: ['PRS', 'PST'] } });
    eq('  never where lang-config sets the tenses', set.morphology.tenses.join(), 'PRS,PST');
}

// ===========================================================================
section('The agreement cycle: pronouns into person markers (WALS 101A)');
// ===========================================================================
{
    const PT = { onset: { max: 2, licensedExceptions: [] }, coda: { max: 1, allowed: null }, nucleus: { diphthongs: [] }, stress: { rule: 'penultimate' } };
    const w = (id, gloss, pos, form, cls = null, rank = 20) => ({ id, gloss, pos, form: parseWord(form), ipa: form, class: cls, rank, syllables: 2, domain: 'x' });
    const lex = [w('p1', 'I', 'pron', 'nimi'), w('p2', 'you (sg)', 'pron', 'wewe'), w('p3', 'he', 'pron', 'jeje'), w('p4', 'we', 'pron', 'sisi'),
        w('p5', 'you (pl)', 'pron', 'nunu'), w('p6', 'they', 'pron', 'wao'), w('v1', 'read', 'v', 'soma', 'v1', 30), w('v2', 'see', 'v', 'ona', 'v1', 50)];
    const f = fuseSubject(lex, { position: 'prefix', year: 1000, attested: '' }, PT);
    const cell = (c) => f && wordToIpa(f.entries.find((e) => e.id === `para:v1:${c}`)?.form || []);
    eq('a language without endings: the subject clitics fuse into a present of six (ni-soma, we-soma)', [cell('PRS.1SG'), cell('PRS.2SG')].join(), 'nisoma,wesoma');
    // a language with worn endings: the old forms take the new marker
    const worn = [...lex, { id: 'para:v1:PRS.1SG', form: parseWord('somat'), ipa: 'somat', pos: 'v', class: 'v1', paradigm: { cls: 'v1', cell: 'PRS.1SG', stem: 'v1' } },
        { id: 'para:v1:IMP.2SG', form: parseWord('soma'), ipa: 'soma', pos: 'v', class: 'v1', paradigm: { cls: 'v1', cell: 'IMP.2SG', stem: 'v1' } }];
    const g = fuseSubject(worn, { position: 'suffix', year: 1000, attested: '' }, PT);
    eq('  a worn ending takes the new marker after it (du liebst, its -st an old "thou")', wordToIpa(g.entries.find((e) => e.id === 'para:v1:PRS.1SG').form), 'somatni');
    eq('  and a command, which has no subject, is left alone', wordToIpa(g.entries.find((e) => e.id === 'para:v1:IMP.2SG').form), 'soma');
    // the measure reads the clitic stage
    const st = (host) => ({ entries: [], syntax: {}, paradigm: { categories: { type: 'isolating', pronouns: { subject: { stage: 'clitic', host } } }, classes: {} } });
    eq('clitics after the first word of the clause are WALS\u2019s "subject clitics"', morphologyChapters(st('second')).subjectExpression, 'subject clitics');
    eq('  on the tense word before the verb, "pronouns in another position"', morphologyChapters(st('aux')).subjectExpression, 'pronouns in another position');
    eq('  on the verb, obligatory pronouns still (French je)', morphologyChapters(st('verb')).subjectExpression, 'obligatory pronouns');
    // a verb agreeing with the absolutive (Avar, Chechen): it marks the object of a transitive verb, not its subject
    const absSt = (agreement) => ({ entries: [{ id: 'r1', form: parseWord('soma') }], syntax: {},
        paradigm: { categories: { type: 'agglutinative', agreement, tenses: ['PRS'] }, classes: { v1: { pos: 'v', members: 10, exemplarId: 'r1',
            cells: Object.fromEntries(['1SG', '2SG', '3SG', '1PL', '2PL', '3PL'].map((p, i) => [`PRS.${p}`, { form: parseWord(`soma${['n', 's', 't', 'mi', 'si', 'ti'][i]}`) }])) } } } });
    eq('absolutive agreement: WALS 102A\u2019s "only the P argument"', morphologyChapters(absSt('absolutive')).personMarking, 'only the P argument');
    eq('  and its pronoun subjects "mixed" (101A): an intransitive subject on the verb, a transitive one not', morphologyChapters(absSt('absolutive')).subjectExpression, 'mixed');
    eq('  where the verb agrees with its subject, only the A argument', morphologyChapters(absSt('subject')).personMarking, 'only the A argument');
    // a whole family without endings, over a long time: the cycle runs
    const { createProject } = await import('../js/engine/project.js');
    const tree = [{ id: 'p', name: 'Proto-Kemu', born: -3000, diverged: true }, { id: 'a', name: 'Kemu', born: 1700, parentId: 'p', relation: 'branch' }];
    let clitics = 0, fused = 0;
    for (let i = 1; i <= 6; i++) {
        const pr = createProject({ tree, names: tree.map((l) => l.name), borrowings: [],
            config: { name: 'Test', seed: `cycle/${i}`, lexiconSize: 120, derivation: false, rootId: 'p', presentYear: 1765, morphology: { type: 'isolating' }, syntax: { order: 'SVO' } } });
        const s = pr.stateOf('a');
        if (s.paradigm?.categories?.pronouns?.subject?.stage === 'clitic') clitics += 1;
        if (s.paradigm?.categories?.typeFrom?.cline === 'agreement-from-pronoun') fused += 1;
    }
    ok('over 4,700 years some languages without endings have subject clitics or have fused them', clitics + fused >= 1, `${clitics} with clitics, ${fused} fused`);
}

// ===========================================================================
section('Inventory — what the corpus failed to show');
// ===========================================================================
{
    /**
     * A proto-inventory is mined from its daughters' NAMES, and families differ
     * enormously in how many names there are — 139 against six. Six words
     * cannot contain twenty-five consonants, so a raw reading of the evidence
     * gave one family a ten-phoneme proto, below Rotokas, which is famous for
     * being the smallest inventory ever recorded. That is a fact about the
     * chart, not about the language.
     */
    const allOnce = estimateUnseen([1, 1, 1, 1, 1, 1]);
    ok('a corpus of only-once segments implies a lot is missing', allOnce.unseen > 5, JSON.stringify(allOnce));
    const allMany = estimateUnseen([40, 33, 28, 25, 19, 12, 9, 7, 5, 4, 3]);
    eq('a corpus with no hapaxes implies nothing is missing', allMany.unseen, 0);

    // More singletons for the same observed richness must mean more unseen.
    const few = estimateUnseen([10, 9, 8, 7, 2, 2, 1]);
    const many = estimateUnseen([10, 9, 1, 1, 2, 2, 1]);
    ok('more once-only segments implies more unseen', many.unseen > few.unseen,
        `${many.unseen} vs ${few.unseen}`);

    // f2 = 0 makes the plain estimator undefined; the bias-corrected form is used.
    const noDoubletons = estimateUnseen([9, 8, 1, 1, 1]);
    ok('a corpus with no doubletons still yields a finite estimate',
        Number.isFinite(noDoubletons.unseen) && noDoubletons.unseen > 0, JSON.stringify(noDoubletons));
    ok('every estimate explains itself', !!allOnce.note && !!allMany.note);

    /**
     * The estimator must never overrule a judgement made at a review gate.
     * Dahen-Kino withholds /ʂ/ as a later innovation and reconstructs /ɻ/ as
     * *r; silently restoring either would undo a decision a human made about
     * how the family is reconstructed, which is worse than an austere proto.
     */
    const thin = {
        consonants: [{ ipa: 'k', total: 1, onset: 1, coda: 0 }, { ipa: 't', total: 1, onset: 1, coda: 0 },
            { ipa: 'n', total: 1, onset: 1, coda: 0 }, { ipa: 'ʂ', total: 4, onset: 4, coda: 0 }],
        vowels: [{ ipa: 'a', count: 6 }, { ipa: 'i', count: 4 }],
        syllableShapes: [{ key: 'CV', count: 10 }],
        meanSyllablesPerWord: 2,
    };
    const held = generateInventory(thin, derive('t', 'held', 'inv'), {
        laryngeal: 'asIs', vowelCount: 5, marginalCutoff: 2, withhold: ['ʂ'], deriveFrom: { 'ɻ': 'r' },
    });
    ok('a withheld segment is not restored by the estimator',
        !held.consonants.some((c) => c.ipa === 'ʂ'), held.consonants.map((c) => c.ipa).join(' '));
    ok('a deriveFrom source is not restored either',
        !held.consonants.some((c) => c.ipa === 'ɻ'), held.consonants.map((c) => c.ipa).join(' '));

    ok('a thin corpus gets segments supplied', held.inferred.length > 0);
    ok('supplied segments are marked as inferred rather than attested',
        held.consonants.filter((c) => c.inferred).length > 0,
        'a reconstruction that cannot say which segments are evidence is not a reconstruction');
    ok('the supplied segments are common ones',
        held.inferred.every((ipa) => CONSONANT_PRIOR.some(([p]) => p === ipa)),
        held.inferred.join(' '));
    ok('no inventory comes out below the smallest ever recorded',
        held.consonants.length + held.vowels.length >= 11,
        `got ${held.consonants.length + held.vowels.length}, Rotokas has 11`);

    /**
     * The control, and the point of the whole design: a family whose corpus is
     * genuinely rich must be left alone. If a well-attested inventory also gets
     * topped up, the mechanism is not estimating anything — it is decreeing a
     * size, which is the thing standing rule 3 forbids.
     */
    const rich = {
        consonants: 'p t k b d ɡ m n s l r j w f h ŋ'.split(' ').map((ipa, i) => ({ ipa, total: 30 - i, onset: 20, coda: 4 })),
        vowels: [{ ipa: 'a', count: 90 }, { ipa: 'i', count: 70 }, { ipa: 'u', count: 60 }],
        syllableShapes: [{ key: 'CV', count: 200 }, { key: 'CVC', count: 90 }],
        meanSyllablesPerWord: 2.1,
    };
    const richInv = generateInventory(rich, derive('t', 'rich', 'inv'), { laryngeal: 'asIs', vowelCount: 5, marginalCutoff: 2 });
    eq('a well-attested corpus has nothing supplied', richInv.inferred.length, 0);

    // The prior is a ranking, and the ranking is the load-bearing part.
    ok('the prior is ordered commonest first',
        CONSONANT_PRIOR.every(([, share], i) => i === 0 || share <= CONSONANT_PRIOR[i - 1][1]));
    ok('the prior starts with the near-universal consonants',
        ['m', 'k', 'j', 'p'].every((x) => CONSONANT_PRIOR.slice(0, 6).some(([p]) => p === x)));
}

// ===========================================================================
section('Stability: renames, new boxes, drags and locks');
// ===========================================================================
/**
 * The authoring guarantees of Phase 2. With the family PINNED (frozen evidence
 * and pinned edges, as scripts/lang-pin.js writes), renaming a language or
 * drawing a new one must change no existing word, and a drag only re-times.
 * A lock must hold, end the word's history on the locked form, and a proto
 * lock must be inherited. Uses a small in-memory family so it runs fast.
 */
{
    const { createProject } = await import('../js/engine/project.js');
    const tree = [
        { id: 'p', name: 'Proto-Tamaru', born: -1500, diverged: true },
        { id: 'a', name: 'Tamaru', born: -600, parentId: 'p', relation: 'branch' },
        { id: 'b', name: 'Kesolin', born: -500, parentId: 'p', relation: 'branch' },
        { id: 'a1', name: 'Tamarese', born: 900, parentId: 'a', relation: 'branch' },
        { id: 'b1', name: 'Kesoline', born: 1100, parentId: 'b', relation: 'branch' },
    ];
    const cfg = { name: 'Test', seed: 'stability/1', lexiconSize: 120, derivation: false, rootId: 'p', presentYear: 1765 };
    const mk = (t, sidecar = {}) => createProject({ tree: t, names: t.map((l) => l.name), config: cfg, sidecar, borrowings: [] });
    const words = (pr, t, map = (x) => x) => {
        const m = new Map();
        for (const l of t) for (const e of pr.stateOf(l.id).entries) if (!e.paradigm && !e.retired) m.set(`${map(l.id)}|${e.id}`, e.ipa);
        return m;
    };
    const changed = (x, y) => { let d = 0; for (const [k, v] of x) if (y.get(k) !== v) d += 1; return d; };

    const free = mk(tree);
    const pin = {
        ...free.serialise(),
        evidence: { names: tree.map((l) => l.name), living: ['Tamarese', 'Kesoline'] },
    };
    for (const l of tree) free.stateOf(l.id);
    const pinnedSide = { ...free.serialise(), evidence: pin.evidence };
    const before = words(mk(tree, pinnedSide), tree);

    const renamed = tree.map((l) => (l.id === 'a' ? { ...l, id: 'a-renamed', uid: 'a', name: 'Tamarux' }
        : l.parentId === 'a' ? { ...l, parentId: 'a-renamed' } : l));
    eq('pinned: renaming a language changes no word', changed(before, words(mk(renamed, pinnedSide), renamed, (x) => (x === 'a-renamed' ? 'a' : x))), 0);

    const added = [...tree, { id: 'c', name: 'Pelunatsi', born: 1300, parentId: 'b', relation: 'branch' }];
    eq('pinned: drawing a new language changes no existing word', changed(before, words(mk(added, pinnedSide), tree)), 0);

    // Evidence frozen but sound changes NOT pinned: the rules are regenerated,
    // and come out the same because every stream is keyed on uid ?? id.
    const evidenceOnly = { evidence: pin.evidence };
    const regenerated = mk(renamed, evidenceOnly);
    const original = mk(tree, evidenceOnly);
    regenerated.stateOf('a1'); original.stateOf('a1');
    ok('a renamed language regenerates the same sound changes, keyed on its uid',
        regenerated.changeSetOf('a-renamed')?.rules.map((r) => r.template).join() === original.changeSetOf('a')?.rules.map((r) => r.template).join());

    const leafState = free.stateOf('a1');
    const target = leafState.entries.find((e) => e.core && !e.paradigm && !e.retired);
    const locked = tree.map((l) => (l.id === 'a1' ? { ...l, locks: { [target.gloss]: 'tamuke' } } : l));
    const ls = mk(locked).stateOf('a1');
    const le = ls.entries.find((e) => e.gloss === target.gloss && !e.retired && !e.paradigm);
    eq('a locked word has the locked form', le?.ipa, 'tamuke');
    eq('its derivation ends on the locked form', ls.histories.get(le.id)?.steps.at(-1)?.to, 'tamuke');
    eq('a lock leaves every other language alone', changed(words(free, tree.filter((l) => l.id !== 'a1')), words(mk(locked), tree.filter((l) => l.id !== 'a1'))), 0);

    const protoLocked = tree.map((l) => (l.id === 'p' ? { ...l, locks: { [target.gloss]: 'tamukesa' } } : l));
    const pp = mk(protoLocked);
    eq('a proto lock holds in the proto', pp.stateOf('p').entries.find((e) => e.gloss === target.gloss && !e.retired && !e.paradigm)?.ipa, 'tamukesa');
    const daughterForm = pp.stateOf('a').founding.entries.find((e) => e.gloss === target.gloss && !e.retired && !e.paradigm)?.ipa;
    ok('and is inherited: the daughters start from the locked form, not the generated one',
        daughterForm != null && daughterForm !== free.stateOf('a').founding.entries.find((e) => e.gloss === target.gloss && !e.retired && !e.paradigm)?.ipa,
        `daughter founding form ${daughterForm}`);
}

// ===========================================================================
console.log(`\n${'='.repeat(64)}`);
if (failures.length) {
    console.log(failures.join('\n'));
    console.log(`\n${passed} passed, ${failed} FAILED.`);
    process.exit(1);
}
console.log(`${passed} passed, 0 failed.`);
