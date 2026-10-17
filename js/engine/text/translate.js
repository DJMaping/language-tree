/**
 * The translator (DJ, 17 Oct 2026: "would it be possible to add a
 * translator? I can add a sentence and get the translated results").
 *
 * Two halves, and nothing in either is written per language:
 *
 *   ANALYSE  an English sentence into what it means grammatically: clauses,
 *            each with a verb (tense, negation, question), a subject, an
 *            object and obliques, each noun phrase with its number, its
 *            determiner, adjectives, numeral and possessor. English is only
 *            the way in; what comes out is the same glossed structure the
 *            sample sentences use (text/sentence.js).
 *   RENDER   that structure in any language as it stands: its own words (a
 *            meaning it has replaced comes out in its new word), its own
 *            endings (the cells that travelled through its sound changes),
 *            its own word order, adjective and possessor order, prepositions
 *            or postpositions where it has no case for the job, its own way
 *            of saying "not" and of asking a yes-no question, its future,
 *            perfect and progressive where it has grown them, its incorporated
 *            verbs where it is polysynthetic, and the modern words it coined
 *            or borrowed.
 *
 * So a translation is a reading of the model, and stays right as the model
 * changes. A word the language has no meaning for comes through in English
 * in angle brackets and is listed, which is also a list of what the
 * lexicon lacks.
 *
 * Deliberately a small grammar of English: simple and compound sentences,
 * statements, yes-no and wh-questions, commands, negation, the tenses with
 * their auxiliaries, copulas, possessives, numerals, coordination. No
 * relative clauses or reported speech beyond "X said: ...".
 */

import { conceptList } from '../lexicon/swadesh.js';
import { MODERN } from '../lexicon/modern.js';
import { wordToIpa } from '../features.js';
import { repairHiatus } from '../phonology/phonotactics.js';
import { spellEntry } from '../phonology/romanise.js';
import { inflect } from './sentence.js';

// ---------------------------------------------------------------------------
// English: the lexicon
// ---------------------------------------------------------------------------

/** Glosses with a parenthesis: which reading plain English means by default. */
const DEFAULT_SENSE = {
    man: 'man (human)', you: 'you (sg)', lie: 'lie (down)', right: 'right (side)', left: 'left (side)',
    spring: 'spring (season)', rope: 'rope', heavy: 'heavy', light: 'light',
};
const IRREGULAR_VERBS = {
    was: ['be', 'PST'], were: ['be', 'PST'], been: ['be', 'PRF'], am: ['be', 'PRS'], is: ['be', 'PRS'], are: ['be', 'PRS'], being: ['be', 'PROG'],
    had: ['have', 'PST'], has: ['have', 'PRS'], did: ['do', 'PST'], does: ['do', 'PRS'], done: ['do', 'PRF'],
    went: ['go', 'PST'], gone: ['go', 'PRF'], came: ['come', 'PST'], saw: ['see', 'PST'], seen: ['see', 'PRF'],
    gave: ['give', 'PST'], given: ['give', 'PRF'], took: ['take', 'PST'], taken: ['take', 'PRF'], made: ['make', 'PST'],
    said: ['say', 'PST'], knew: ['know', 'PST'], known: ['know', 'PRF'], thought: ['think', 'PST'], told: ['tell', 'PST'],
    found: ['find', 'PST'], ate: ['eat', 'PST'], eaten: ['eat', 'PRF'], drank: ['drink', 'PST'], drunk: ['drink', 'PRF'],
    slept: ['sleep', 'PST'], fell: ['fall', 'PST'], fallen: ['fall', 'PRF'], flew: ['fly', 'PST'], flown: ['fly', 'PRF'],
    swam: ['swim', 'PST'], sang: ['sing', 'PST'], sung: ['sing', 'PRF'], ran: ['run', 'PST'], sat: ['sit', 'PST'],
    stood: ['stand', 'PST'], lay: ['lie', 'PST'], brought: ['bring', 'PST'], bought: ['buy', 'PST'], fought: ['fight', 'PST'],
    taught: ['teach', 'PST'], sought: ['seek', 'PST'], sold: ['sell', 'PST'], sent: ['send', 'PST'], built: ['build', 'PST'],
    held: ['hold', 'PST'], kept: ['keep', 'PST'], left: ['leave', 'PST'], lost: ['lose', 'PST'], met: ['meet', 'PST'],
    paid: ['pay', 'PST'], wrote: ['write', 'PST'], written: ['write', 'PRF'], spoke: ['speak', 'PST'], spoken: ['speak', 'PRF'],
    broke: ['break', 'PST'], broken: ['break', 'PRF'], chose: ['choose', 'PST'], chosen: ['choose', 'PRF'],
    forgot: ['forget', 'PST'], forgotten: ['forget', 'PRF'], froze: ['freeze', 'PST'], stole: ['steal', 'PST'],
    woke: ['wake', 'PST'], bit: ['bite', 'PST'], hid: ['hide', 'PST'], rose: ['rise', 'PST'], risen: ['rise', 'PRF'],
    grew: ['grow', 'PST'], grown: ['grow', 'PRF'], threw: ['throw', 'PST'], thrown: ['throw', 'PRF'], blew: ['blow', 'PST'],
    began: ['begin', 'PST'], begun: ['begin', 'PRF'], won: ['win', 'PST'], felt: ['feel', 'PST'], led: ['lead', 'PST'],
    heard: ['hear', 'PST'], became: ['become', 'PST'], dug: ['dig', 'PST'], spat: ['spit', 'PST'], struck: ['hit', 'PST'],
    understood: ['understand', 'PST'], killed: ['kill', 'PST'], caught: ['catch', 'PST'], read: ['read', 'PRS'],
    cut: ['cut', 'PRS'], hit: ['hit', 'PRS'], put: ['put', 'PRS'], split: ['split', 'PRS'], wept: ['weep', 'PST'],
    taught_: ['teach', 'PST'], swelled: ['swell', 'PST'], dreamt: ['dream', 'PST'], learnt: ['learn', 'PST'], burnt: ['burn', 'PST'],
};
const IRREGULAR_PLURALS = {
    men: 'man', women: 'woman', children: 'child', feet: 'foot', teeth: 'tooth', mice: 'mouse', geese: 'goose',
    lice: 'louse', wives: 'wife', knives: 'knife', leaves: 'leaf', wolves: 'wolf', lives: 'life', halves: 'half',
    oxen: 'cow', thieves: 'thief', shelves: 'shelf', hooves: 'hoof',
};
const SAME_PLURAL = new Set(['sheep', 'deer', 'fish', 'people']);
const PRONOUNS = {
    i: ['I', '1SG', 'subj'], me: ['I', '1SG', 'obj'], my: ['I', '1SG', 'poss'], mine: ['I', '1SG', 'poss'],
    you: ['you (sg)', '2SG', 'any'], your: ['you (sg)', '2SG', 'poss'], yours: ['you (sg)', '2SG', 'poss'],
    he: ['he', '3SG', 'subj'], him: ['he', '3SG', 'obj'], his: ['he', '3SG', 'poss'],
    she: ['she', '3SG', 'subj'], her: ['she', '3SG', 'objposs'], hers: ['she', '3SG', 'poss'],
    it: ['it', '3SG', 'any'], its: ['it', '3SG', 'poss'],
    we: ['we', '1PL', 'subj'], us: ['we', '1PL', 'obj'], our: ['we', '1PL', 'poss'], ours: ['we', '1PL', 'poss'],
    they: ['they', '3PL', 'subj'], them: ['they', '3PL', 'obj'], their: ['they', '3PL', 'poss'], theirs: ['they', '3PL', 'poss'],
    yall: ['you (pl)', '2PL', 'any'],
};
/** English prepositions: the case that does the job, else the language's adposition for it. */
const PREPS = {
    to: { cases: ['DAT', 'ALL', 'LOC'], adp: 'towards', motionCases: ['ALL', 'DAT', 'LOC'] },
    towards: { cases: ['ALL', 'DAT'], adp: 'towards' },
    into: { cases: ['ILL', 'ALL', 'LOC'], adp: 'in' },
    in: { cases: ['LOC', 'ESS', 'ILL'], adp: 'in' },
    inside: { cases: ['LOC'], adp: 'inside' },
    at: { cases: ['LOC'], adp: 'at' },
    on: { cases: ['LOC'], adp: 'at' },
    from: { cases: ['ABL', 'ELA'], adp: 'from' },
    out: { cases: ['ELA', 'ABL'], adp: 'from' },
    with: { cases: ['COM', 'INS'], adp: 'with' },
    by: { cases: ['INS'], adp: 'with' },
    of: { cases: ['GEN'], adp: null },
    for: { cases: ['DAT'], adp: 'for' },
    about: { cases: [], adp: 'about' },
    through: { cases: [], adp: 'through' },
    above: { cases: [], adp: 'above' }, over: { cases: [], adp: 'above' },
    below: { cases: [], adp: 'below' }, under: { cases: [], adp: 'below' },
    between: { cases: [], adp: 'between' }, around: { cases: [], adp: 'around' },
    behind: { cases: [], adp: 'behind' }, before: { cases: [], adp: 'before' }, after: { cases: [], adp: 'behind' },
    outside: { cases: [], adp: 'outside' }, near: { cases: ['LOC'], adp: 'near' },
};
const MOTION = new Set(['go', 'come', 'walk', 'run', 'fly', 'swim', 'travel', 'return', 'send', 'bring', 'carry', 'flee', 'climb', 'arrive', 'enter', 'move', 'throw', 'fall', 'lead', 'follow']);
const SPEECH_TO = new Set(['give', 'say', 'tell', 'speak', 'talk', 'show', 'send', 'pay', 'sell', 'teach', 'call', 'answer', 'bring', 'write', 'sing']);
const TIME_WORDS = new Set(['today', 'tomorrow', 'yesterday', 'now', 'always', 'never', 'often', 'soon', 'again', 'already', 'still', 'here', 'there', 'then', 'also', 'only', 'very', 'perhaps']);
const CONJ = new Set(['and', 'but', 'or', 'because', 'if', 'when', 'then']);
const WH = { who: 'who', whom: 'who', what: 'what', where: 'where', when: 'when', how: 'how', why: 'why', which: 'which' };
const NUMBERS = { one: 'one', two: 'two', three: 'three', four: 'four', five: 'five', six: 'six', seven: 'seven', eight: 'eight', nine: 'nine', ten: 'ten', hundred: 'hundred', thousand: 'thousand' };
const QUANT = { all: 'all', every: 'every', each: 'each', some: 'some', many: 'many', few: 'few', much: 'much', more: 'more', less: 'less', both: 'both', no: 'none', none: 'none', enough: 'enough' };
const INTERJ = { hello: 'hello', hi: 'hello', thanks: 'thanks', thank: 'thanks', 'thank you': 'thanks', please: 'please', goodbye: 'goodbye', bye: 'goodbye', yes: 'yes', no: 'no' };

let LEX = null;
/** English word -> the concepts it can name, by part of speech. */
function lexicon() {
    if (LEX) return LEX;
    LEX = new Map();
    const add = (word, gloss, pos) => {
        if (!LEX.has(word)) LEX.set(word, []);
        if (!LEX.get(word).some((c) => c.gloss === gloss && c.pos === pos)) LEX.get(word).push({ gloss, pos });
    };
    const all = conceptList(5000);
    // the plain word and the default sense first, so "man" is "man (human)"
    for (const c of all) {
        const base = c.gloss.replace(/\s*\(.*\)$/, '').toLowerCase();
        if (base === c.gloss.toLowerCase() || DEFAULT_SENSE[base] === c.gloss) add(base, c.gloss, c.pos);
    }
    for (const c of all) {
        const base = c.gloss.replace(/\s*\(.*\)$/, '').toLowerCase();
        if (!LEX.has(base)) add(base, c.gloss, c.pos);
    }
    for (const m of MODERN) add(m.gloss, m.gloss, 'n');
    return LEX;
}
/** Words of more than one English word, read as one (multi-word modern things, "thank you"). */
const PHRASES = () => [...MODERN.map((m) => m.gloss).filter((g) => /\s/.test(g)), 'thank you', 'out of', 'each other'];

/**
 * English words with no concept of their own, read as the nearest one: the
 * lexicon is built from meanings, and English has several words for many.
 */
const SYNONYMS = {
    little: 'small', tiny: 'small', large: 'big', huge: 'big', great: 'big', kid: 'child', kids: 'child', mum: 'mother', mom: 'mother',
    mommy: 'mother', dad: 'father', daddy: 'father', lady: 'woman', ladies: 'woman', guy: 'man', ocean: 'sea', woods: 'forest',
    rock: 'stone', rocks: 'stone', wealthy: 'rich', quick: 'fast', rapid: 'fast', glad: 'happy', joyful: 'happy', unhappy: 'sad',
    stupid: 'foolish', clever: 'wise', smart: 'wise', pretty: 'beautiful', lovely: 'beautiful', handsome: 'beautiful', terrible: 'bad',
    awful: 'bad', nice: 'good', fine: 'good', chat: 'talk', reply: 'answer', shout: 'shout', yell: 'shout',
    start: 'begin', look: 'see',
    watch: 'see', listen: 'hear', grab: 'take', toss: 'throw',
    sprint: 'run', stroll: 'walk', journey: 'travel', voyage: 'travel', wed: 'marry', infant: 'baby',
    nation: 'country', kingdom: 'country', realm: 'country', capital: 'city',
    boulder: 'stone', seat: 'chair', couch: 'chair', supper: 'meal', dinner: 'meal', breakfast: 'meal',
    lunch: 'meal', cash: 'money', coin: 'money', coins: 'money', ruler: 'king', emperor: 'king', empress: 'queen', princess: 'daughter',
    prince: 'son', fighter: 'warrior', battle: 'war',
};
const candidates = (w) => lexicon().get(w) || (SYNONYMS[w] ? lexicon().get(SYNONYMS[w]) : null) || [];
const ofPos = (w, pos) => candidates(w).find((c) => c.pos === pos) || null;

/** A noun's lemma and number. */
function nounOf(w) {
    if (ofPos(w, 'n')) return { gloss: ofPos(w, 'n').gloss, plural: false };
    if (IRREGULAR_PLURALS[w] && ofPos(IRREGULAR_PLURALS[w], 'n')) return { gloss: ofPos(IRREGULAR_PLURALS[w], 'n').gloss, plural: true };
    const tries = [];
    if (w.endsWith('ies')) tries.push(`${w.slice(0, -3)}y`);
    if (w.endsWith('ves')) tries.push(`${w.slice(0, -3)}f`, `${w.slice(0, -3)}fe`);
    if (w.endsWith('es')) tries.push(w.slice(0, -2));
    if (w.endsWith('s')) tries.push(w.slice(0, -1));
    for (const t of tries) if (ofPos(t, 'n')) return { gloss: ofPos(t, 'n').gloss, plural: true };
    return null;
}
/** A verb's lemma and the tense its form says. */
function verbOf(w) {
    if (IRREGULAR_VERBS[w]) return { gloss: ofPos(IRREGULAR_VERBS[w][0], 'v')?.gloss ?? IRREGULAR_VERBS[w][0], tense: IRREGULAR_VERBS[w][1] };
    if (ofPos(w, 'v')) return { gloss: ofPos(w, 'v').gloss, tense: 'PRS' };
    const tries = [];
    if (w.endsWith('ies')) tries.push([`${w.slice(0, -3)}y`, 'PRS']);
    if (w.endsWith('es')) tries.push([w.slice(0, -2), 'PRS']);
    if (w.endsWith('s')) tries.push([w.slice(0, -1), 'PRS']);
    if (w.endsWith('ied')) tries.push([`${w.slice(0, -3)}y`, 'PST']);
    if (w.endsWith('ed')) tries.push([w.slice(0, -2), 'PST'], [w.slice(0, -1), 'PST'], [w.slice(0, -3), 'PST']);
    if (w.endsWith('ing')) tries.push([w.slice(0, -3), 'PROG'], [`${w.slice(0, -3)}e`, 'PROG'], [w.slice(0, -4), 'PROG']);
    for (const [t, tense] of tries) if (ofPos(t, 'v')) return { gloss: ofPos(t, 'v').gloss, tense };
    return null;
}
const adjOf = (w) => ofPos(w, 'adj')?.gloss ?? null;

// ---------------------------------------------------------------------------
// English: the analysis
// ---------------------------------------------------------------------------

function tokenise(sentence) {
    let s = ` ${sentence.toLowerCase()} `
        .replace(/\b(it|he|she|that|what|where|who|there|here|how|this)[’']s\b/g, '$1 is')
        .replace(/[’']s\b/g, ' \'s')
        .replace(/n[’']t\b/g, ' not')
        .replace(/\bcan not\b/g, 'can not')
        .replace(/\bwo not\b/g, 'will not')
        .replace(/[’']ll\b/g, ' will')
        .replace(/[’']re\b/g, ' are')
        .replace(/[’']m\b/g, ' am')
        .replace(/[’']ve\b/g, ' have')
        .replace(/[’']d\b/g, ' would');
    for (const p of PHRASES()) s = s.replace(new RegExp(`\\b${p}\\b`, 'g'), p.replace(/\s/g, '_'));
    const raw = sentence.match(/[A-Za-zÀ-ɏ'’-]+|[.,!?;:]/g) || [];
    const caps = new Set(raw.filter((t, i) => i > 0 && /^[A-Z]/.test(t)).map((t) => t.toLowerCase()));
    return s.match(/[a-zÀ-ɏ_'-]+|[.,!?;:]/g)?.map((t) => ({ w: t.replace(/_/g, ' '), proper: caps.has(t) })) || [];
}

/** Split a sentence into clauses at a conjunction or comma that starts a new subject and verb. */
function splitClauses(tokens) {
    const out = [];
    let cur = [];
    const hasVerb = (toks) => toks.some((t) => verbOf(t.w) || ['will', 'can', 'must'].includes(t.w));
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if ((CONJ.has(t.w) || t.w === ',' || t.w === ':' || t.w === ';') && hasVerb(cur)) {
            const rest = tokens.slice(i + 1);
            const until = rest.findIndex((x) => CONJ.has(x.w) || [',', ':', ';'].includes(x.w));
            const next = until < 0 ? rest : rest.slice(0, until);
            if (hasVerb(next.filter((x) => !CONJ.has(x.w)))) {
                out.push(cur);
                cur = CONJ.has(t.w) ? [t] : [];
                continue;
            }
        }
        if (![',', ':', ';'].includes(t.w)) cur.push(t);
    }
    if (cur.length) out.push(cur);
    return out;
}

/** One noun phrase, from position i: -> [np, next index]. */
function readNP(toks, i, missing) {
    const np = { det: null, num: null, quant: null, adjs: [], head: null, pron: null, possessor: null, plural: false, and: null, proper: null };
    let any = false;
    for (; i < toks.length; i++) {
        const { w, proper } = toks[i];
        if (w === 'the') { np.det = 'def'; any = true; continue; }
        if (w === 'a' || w === 'an') { np.det = 'indef'; any = true; continue; }
        if ((w === 'this' || w === 'that' || w === 'these' || w === 'those') && !np.head) { np.dem = w === 'this' || w === 'these' ? 'this' : 'that'; if (w === 'these' || w === 'those') np.plural = true; any = true; continue; }
        if (NUMBERS[w] && !np.head) { np.num = NUMBERS[w]; if (w !== 'one') np.plural = true; any = true; continue; }
        if (QUANT[w] && !np.head && !(w === 'no' && !any && toks[i + 1] && !nounOf(toks[i + 1].w))) { np.quant = QUANT[w]; any = true; continue; }
        if (PRONOUNS[w] && !np.head && !np.pron) {
            const [gloss, person, kind] = PRONOUNS[w];
            if (kind === 'poss' || (kind === 'objposs' && toks[i + 1] && (nounOf(toks[i + 1].w) || adjOf(toks[i + 1].w)))) { np.possessor = { pron: { gloss, person } }; any = true; continue; }
            if (any) break;
            np.pron = { gloss, person };
            return [np, i + 1];
        }
        if (w === '\'s' && (np.head || np.proper)) {
            // "the man's house": what came so far is the possessor
            const owner = { ...np };
            Object.assign(np, { det: null, num: null, quant: null, adjs: [], head: null, pron: null, possessor: owner, plural: false, proper: null });
            continue;
        }
        if (adjOf(w) && !np.head && !(nounOf(w) && !(toks[i + 1] && (nounOf(toks[i + 1].w) || adjOf(toks[i + 1].w))))) { np.adjs.push(adjOf(w)); any = true; continue; }
        const n = nounOf(w);
        if (n && !np.head) {
            np.head = n.gloss; if (n.plural) np.plural = true; any = true;
            // "a house of stone", "the king of Emara"
            if (toks[i + 1]?.w === 'of' && toks[i + 2] && !verbOf(toks[i + 2].w)) {
                const [owner, j] = readNP(toks, i + 2, missing);
                if (owner) { np.possessor = owner; i = j - 1; }
            }
            continue;
        }
        if (proper && !np.head && !np.pron) { np.proper = toks[i].w; np.head = null; any = true; continue; }
        if (!np.head && !np.pron && !np.proper && /^[a-z]+$/.test(w) && !verbOf(w) && !PREPS[w] && !TIME_WORDS.has(w) && !CONJ.has(w) && !WH[w] && !INTERJ[w] && !['not', 'will', 'do', 'does', 'did', 'can', 'must', 'to'].includes(w) && (any || toks[i + 1]?.w === undefined || verbOf(toks[i + 1]?.w ?? '') || PREPS[toks[i + 1]?.w])) {
            // an English word with no meaning in the lexicon: before a noun a
            // modifier, else in the noun's place
            missing.add(w); any = true;
            const next = toks[i + 1]?.w;
            if (next && (nounOf(next) || adjOf(next))) { np.adjs.push(w); continue; }
            np.head = null; np.unknown = w; continue;
        }
        break;
    }
    if (!any) return [null, i];
    if (toks[i]?.w === 'and' && toks[i + 1] && !verbOf(toks[i + 1].w)) {
        const [other, j] = readNP(toks, i + 1, missing);
        // the pair is plural for the verb; each noun keeps its own number
        if (other && !(toks[j] && verbOf(toks[j].w) && other.pron)) { np.and = other; return [np, j]; }
    }
    return [np, i];
}

/** One clause: -> { verb, tense, neg, question, subject, object, recipient, obliques, adverbs, link }. */
function readClause(toks, missing, sentenceQuestion) {
    const c = { link: null, subject: null, object: null, recipient: null, predicate: null, obliques: [], adverbs: [], verb: null, tense: 'PRS', neg: false, question: false, wh: null, imperative: false, interjections: [], complement: null };
    let i = 0;
    if (toks[0] && CONJ.has(toks[0].w)) { c.link = toks[0].w; i = 1; }
    while (toks[i] && INTERJ[toks[i].w] && !(toks[i].w === 'no' && toks[i + 1] && nounOf(toks[i + 1].w))) { c.interjections.push(INTERJ[toks[i].w]); i++; }
    const auxes = [];
    // wh-word first
    if (toks[i] && WH[toks[i].w]) { c.wh = WH[toks[i].w]; i++; }
    // inverted auxiliary: "do you...?", "is he...?", "will they...?"
    const isAux = (w) => ['do', 'does', 'did', 'will', 'shall', 'can', 'must', 'would', 'am', 'is', 'are', 'was', 'were', 'have', 'has', 'had'].includes(w);
    if (toks[i] && isAux(toks[i].w) && (sentenceQuestion || c.wh)) { auxes.push(toks[i].w); i++; c.question = !c.wh; }
    if (toks[i]?.w === 'not') { c.neg = true; i++; }
    // the subject, unless the clause starts with its verb (a command). A word
    // that is both ("rain", "fear") is a subject when a verb follows it.
    const verbNext = toks[i + 1] && (verbOf(toks[i + 1].w) || isAux(toks[i + 1].w));
    if (toks[i] && (!verbOf(toks[i].w) || PRONOUNS[toks[i].w] || (nounOf(toks[i].w) && verbNext))) {
        const [np, j] = readNP(toks, i, missing);
        if (np) { c.subject = np; i = j; }
    }
    // auxiliaries and negation before the main verb
    while (toks[i] && (isAux(toks[i].w) || toks[i].w === 'not' || TIME_WORDS.has(toks[i].w) || toks[i].w === 'going')) {
        const w = toks[i].w;
        if (w === 'not') c.neg = true;
        else if (TIME_WORDS.has(w)) c.adverbs.push(w);
        else if (w === 'going' && toks[i + 1]?.w === 'to') { auxes.push('will'); i++; }
        else auxes.push(w);
        i++;
    }
    // the main verb
    let v = toks[i] ? verbOf(toks[i].w) : null;
    if (v) { c.verb = v.gloss; c.tense = v.tense; i++; }
    // tense from the auxiliaries
    const has = (...ws) => auxes.some((a) => ws.includes(a));
    if (has('will', 'shall')) c.tense = 'FUT';
    else if (has('did')) c.tense = 'PST';
    else if (has('do', 'does')) c.tense = 'PRS';
    else if (has('have', 'has') && v && (v.tense === 'PST' || v.tense === 'PRF')) c.tense = 'PRF';
    else if (has('had') && v) c.tense = 'PST';
    else if (has('was', 'were') && v?.tense === 'PROG') c.tense = 'PST';
    else if (has('am', 'is', 'are') && v?.tense === 'PROG') c.tense = 'PROG';
    else if (v?.tense === 'PRF') c.tense = 'PST';
    if (has('can')) { c.modal = 'can'; }
    if (has('must')) { c.modal = 'must'; }
    // a copula: "the man is old", "she was a queen", "where is the river?"
    if (!c.verb) {
        const cop = auxes.find((a) => ['am', 'is', 'are', 'was', 'were'].includes(a));
        if (cop) { c.verb = 'be'; c.tense = ['was', 'were'].includes(cop) ? 'PST' : c.tense === 'FUT' ? 'FUT' : 'PRS'; }
        else if (auxes.includes('have') || auxes.includes('has') || auxes.includes('had')) { c.verb = 'have'; c.tense = auxes.includes('had') ? 'PST' : 'PRS'; }
        else if (auxes.includes('do') || auxes.includes('did') || auxes.includes('does')) { c.verb = 'do'; }
    }
    if (!c.subject && c.verb && !c.wh && !c.question) c.imperative = true;
    // "I want to go": a second verb
    if (toks[i]?.w === 'to' && toks[i + 1] && verbOf(toks[i + 1].w)) { c.complement = verbOf(toks[i + 1].w).gloss; i += 2; }
    else if (c.modal && c.verb) { c.complement = c.verb; c.verb = c.modal; }
    // what follows the verb
    while (i < toks.length) {
        const w = toks[i].w;
        if (['.', '!', '?'].includes(w)) { i++; continue; }
        if (w === 'not') { c.neg = true; i++; continue; }
        if (TIME_WORDS.has(w)) { c.adverbs.push(w); i++; continue; }
        if (PREPS[w] || w === 'out of') {
            const prep = w === 'out of' ? 'from' : w;
            const [np, j] = readNP(toks, i + 1, missing);
            if (np) { c.obliques.push({ prep, np }); i = j; continue; }
            i++; continue;
        }
        if (c.verb === 'be' && !c.predicate) {
            const a = adjOf(w);
            if (a && !(nounOf(w) && toks[i + 1] && !['.', '!', '?'].includes(toks[i + 1].w))) { c.predicate = { adj: a }; i++; continue; }
        }
        const [np, j] = readNP(toks, i, missing);
        if (np) {
            if (c.verb === 'be' && !c.predicate) c.predicate = { np };
            else if (!c.object) c.object = np;
            else if (!c.recipient) { c.recipient = c.object; c.object = np; }   // "give the child water"
            else c.obliques.push({ prep: 'with', np });
            i = j;
            continue;
        }
        if (!/^[.,!?]$/.test(w) && /^[a-z]/.test(w)) missing.add(w);
        i++;
    }
    if (c.recipient && !SPEECH_TO.has(c.verb)) { c.obliques.unshift({ prep: 'to', np: c.recipient }); c.recipient = null; }
    return c;
}

/** English text -> sentences of clauses. */
export function analyseEnglish(text) {
    const missing = new Set();
    const sentences = [];
    const parts = String(text).match(/[^.!?]+[.!?]?/g) || [];
    for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        const question = trimmed.endsWith('?');
        const toks = tokenise(trimmed);
        const clauses = splitClauses(toks).map((t, k) => readClause(t, missing, question && k === 0));
        // "I eat meat and drink water": the second verb shares the first's subject
        for (let k = 1; k < clauses.length; k++) {
            const c = clauses[k], prev = clauses[k - 1];
            if (c.imperative && c.link && prev.subject && !prev.imperative) {
                c.imperative = false; c.subject = prev.subject; c.subjectShared = true;
            }
        }
        // a question mark makes the last clause the question when nothing else did
        if (question && !clauses.some((c) => c.question || c.wh)) clauses[clauses.length - 1].question = true;
        sentences.push({ english: trimmed, question, clauses });
    }
    return { sentences, missing: [...missing] };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const PERSON_OF = { I: '1SG', 'you (sg)': '2SG', he: '3SG', she: '3SG', it: '3SG', we: '1PL', 'you (pl)': '2PL', they: '3PL' };

function lookup(state, gloss) {
    return state.entries.find((e) => e.gloss === gloss && !e.retired && !e.paradigm)
        || state.entries.find((e) => e.gloss === gloss && !e.paradigm)
        || null;
}

/**
 * The inflection class a word follows. Its own where the paradigm has it;
 * else the commonest class of its kind, as a language puts a new or borrowed
 * word into its productive declension (English -s, German -s for loans); a
 * pronoun, where the language has cases at all, takes the noun endings.
 */
function classFor(state, entry) {
    const classes = state.paradigm?.classes || {};
    if (!entry) return null;
    if (classes[entry.class]) return entry.class;
    const kind = entry.pos === 'v' ? 'v' : ['n', 'pron'].includes(entry.pos) ? 'n' : null;
    if (!kind) return null;
    let best = null;
    for (const [k, c] of Object.entries(classes)) {
        if (k[0] !== kind) continue;
        if (!best || (c.members ?? 0) > (classes[best].members ?? 0)) best = k;
    }
    return best;
}

/** The cell names a word's class actually has. */
function cellsOf(state, entry) {
    return new Set(Object.keys(state.paradigm?.classes?.[classFor(state, entry)]?.cells || {}));
}

/**
 * One word, inflected for a cell where it has one. The gloss marks the cell
 * the Leipzig way: "-" where an ending shows, "." where it has worn to
 * nothing (give.PRS.3SG: the third person singular present that has no
 * ending, like Latin's lost -t in Romance).
 */
function makeWord(state, entry, cell, gloss, extra = {}) {
    const known = cell && cellsOf(state, entry).has(cell);
    const form = known ? inflect({ ...entry, class: classFor(state, entry) }, cell, state) : entry.form;
    const inflected = !!(known && form && wordToIpa(form) !== entry.ipa);
    return {
        form,
        ipa: wordToIpa(form),
        spelling: inflected ? state.romanisation.spell(form) : (spellEntry(state, entry) || state.romanisation.spell(form)),
        gloss: known ? `${gloss}${inflected ? '-' : '.'}${cell}` : gloss,
        entryId: entry.id,
        ...extra,
    };
}
const foreign = (w) => ({ form: null, ipa: `⟨${w}⟩`, spelling: `⟨${w}⟩`, gloss: `⟨${w}⟩`, missing: true });
const proper = (w) => ({ form: null, ipa: w, spelling: w[0].toUpperCase() + w.slice(1), gloss: w[0].toUpperCase() + w.slice(1), proper: true });

/** Fuse two forms into one word (an affix): "not" + verb, verb + question. */
function fuse(state, a, b, gloss) {
    const form = repairHiatus([...a.form, ...b.form], state.phonotactics);
    return { ...b, form, ipa: wordToIpa(form), spelling: state.romanisation.spell(form), gloss };
}

/**
 * The case for a relation, if this language has it in this word's class;
 * else null (an adposition does the job).
 */
function caseFor(state, entry, wanted, number) {
    const cells = cellsOf(state, entry);
    for (const c of wanted) if (cells.has(`${c}.${number}`)) return `${c}.${number}`;
    return null;
}

/** A noun phrase in a role: -> words, in order. */
function renderNP(state, np, role, opts) {
    const syntax = state.syntax || {};
    const missing = opts.missing;
    if (!np) return [];
    const erg = state.paradigm?.categories?.alignment === 'erg-abs';
    const numbers = state.paradigm?.categories?.numbers || ['SG'];
    const number = np.plural ? (np.num === 'two' && numbers.includes('DU') ? 'DU' : numbers.includes('PL') ? 'PL' : 'SG') : 'SG';
    // which case the role wants, most specific first
    const wanted = {
        subject: erg ? (opts.transitive ? ['ERG'] : ['ABS']) : ['NOM'],
        object: erg ? ['ABS'] : ['ACC'],
        recipient: ['DAT'],
        possessor: ['GEN'],
        predicate: erg ? ['ABS'] : ['NOM'],
    }[role] || opts.cases || [];

    let words = [];
    // the head: a noun, or a pronoun (declined like the commonest nouns where
    // the language has cases, as Turkish ben, ben-i, ben-im "I, me, my")
    const headGloss = np.pron ? np.pron.gloss : np.head;
    const headNumber = np.pron ? (/PL$/.test(np.pron.person) && numbers.includes('PL') ? 'PL' : 'SG') : number;
    if (np.proper) {
        words.push(proper(np.proper));
    } else if (np.unknown) {
        words.push(foreign(np.unknown));
    } else if (headGloss) {
        const e = lookup(state, headGloss);
        if (!e) { missing.add(headGloss); words.push(foreign(headGloss)); }
        else {
            let cell = caseFor(state, e, wanted, headNumber);
            // no case for it: the plain form (nominative or absolutive) and an adposition
            const adpNeeded = !cell && opts.adp;
            if (!cell) cell = caseFor(state, e, erg ? ['ABS'] : ['NOM'], headNumber);
            // a grown definite article (Romanian lupul) where the noun takes no other ending
            if (!np.pron && np.det === 'def' && state.paradigm?.categories?.definite && (!cell || /^(NOM|ABS)\./.test(cell))) {
                const def = cellsOf(state, e).has(`DEF.${headNumber}`) ? `DEF.${headNumber}` : null;
                if (def) cell = def;
            }
            words.push({ ...makeWord(state, e, cell, headGloss), head: true, adpNeeded });
        }
    }
    const head = words[0];
    // the head noun's gender, where the language has one (morphology/gender.js)
    const genders = state.paradigm?.categories?.genders || [];
    const headEntry = head?.entryId ? state.entries.find((x) => x.id === head.entryId) : null;
    const gender = genders.length && headEntry?.gender && genders.includes(headEntry.gender) ? headEntry.gender : null;
    if (gender && head && !np.pron) head.gloss = head.gloss.replace(/^([^-.]+)/, `$1(${gender})`);
    // adjectives, numerals, quantifiers, demonstratives around the head; an
    // adjective agrees with the noun's gender and number
    const mods = [];
    for (const a of np.adjs || []) {
        const e = lookup(state, a);
        const agree = gender ? `${gender}.${headNumber}` : null;
        mods.push(e ? makeWord(state, e, agree, a) : (missing.add(a), foreign(a)));
    }
    const pre = [];
    for (const g of [np.quant, np.num, np.dem]) {
        if (!g) continue;
        const e = lookup(state, g);
        pre.push(e ? makeWord(state, e, null, g) : (missing.add(g), foreign(g)));
    }
    const adjAfter = syntax.adjective === 'NAdj';
    words = adjAfter ? [...pre, head, ...mods] : [...pre, ...mods, head];
    // the possessor: before the noun or after it, as the language orders them
    if (np.possessor) {
        const owner = renderNP(state, np.possessor, 'possessor', { ...opts, adp: false });
        words = syntax.genitive === 'NGen' ? [...words, ...owner] : [...owner, ...words];
    }
    if (np.and) {
        const andE = lookup(state, 'and');
        const other = renderNP(state, np.and, role, opts);
        words = [...words, ...(andE ? [makeWord(state, andE, null, 'and')] : []), ...other];
    }
    // an adposition where no case did the job
    if (head?.adpNeeded && opts.adp) {
        const e = lookup(state, opts.adp);
        if (e) {
            const adp = makeWord(state, e, null, opts.adp);
            words = syntax.adposition === 'postposition' ? [...words, adp] : [adp, ...words];
        }
    }
    return words;
}

/** The verb, inflected for tense and person, with its negation and question marking. */
function renderVerb(state, c, opts) {
    const syntax = state.syntax || {};
    const missing = opts.missing;
    const words = [];
    let gloss = c.verb;
    if (!gloss) return { words, verbAt: -1 };
    let e = lookup(state, gloss);
    // a polysynthetic language says "eat meat" in one verb where it has one
    let incorporated = false;
    if (e && c.object?.head && !c.object.adjs.length && !c.object.possessor && !c.object.num) {
        const objE = lookup(state, c.object.head);
        const inc = objE && state.entries.find((x) => x.compoundOf?.incorporated && x.compoundOf.head === e.id && x.compoundOf.modifier === objE.id && !x.retired);
        if (inc) { e = inc; gloss = inc.gloss.replace(/\s+/g, '.'); incorporated = true; }
    }
    if (!e) { missing.add(gloss); return { words: [foreign(gloss)], verbAt: 0, incorporated }; }
    const tenses = new Set(state.paradigm?.categories?.tenses || []);
    const tense = c.tense === 'FUT' ? (tenses.has('FUT') ? 'FUT' : 'PRS')
        : c.tense === 'PRF' ? (tenses.has('PRF') ? 'PRF' : tenses.has('PFV') ? 'PFV' : tenses.has('PST') ? 'PST' : 'PRS')
            : c.tense === 'PROG' ? (tenses.has('PROG') ? 'PROG' : 'PRS')
                : c.tense === 'PST' ? (tenses.has('PST') ? 'PST' : 'PRS') : 'PRS';
    const subjPerson = c.imperative ? '2SG'
        : c.subject?.pron ? (PERSON_OF[c.subject.pron.gloss] || '3SG')
            : c.subject?.plural || c.subject?.and ? '3PL' : '3SG';
    const objPerson = c.object?.pron ? (PERSON_OF[c.object.pron.gloss] || '3SG') : c.object ? '3SG' : null;
    const cells = cellsOf(state, e);
    let cell = null;
    // polysynthetic: subject and object on the verb
    const trans = objPerson && !incorporated ? `${tense}.${subjPerson.replace(/PL$/, 'SG')}>${objPerson.replace(/PL$/, 'SG')}` : null;
    if (trans && cells.has(trans)) cell = trans;
    else if (cells.has(`${tense}.${subjPerson}`)) cell = `${tense}.${subjPerson}`;
    else if (cells.has(`PRS.${subjPerson}`)) cell = `PRS.${subjPerson}`;
    let verb = makeWord(state, e, cell, gloss, { verb: true });
    if (cell && cell.includes('>')) verb.objectOnVerb = true;
    // A tense cell that fell together with the present (as English "put" is
    // both) is the present's form, but it still says the past: gloss it so.
    if (cell === `PRS.${subjPerson}` && tense !== 'PRS') verb.gloss = verb.gloss.replace(`PRS.${subjPerson}`, `${tense}.${subjPerson}`);
    // negation
    const notE = c.neg ? lookup(state, 'not') : null;
    const not = notE ? makeWord(state, notE, null, 'not') : null;
    const neg = c.neg ? syntax.negation || 'before' : null;
    if (c.neg && !not) missing.add('not');
    if (not && neg === 'prefix') verb = fuse(state, not, verb, `NEG-${verb.gloss}`);
    if (not && neg === 'suffix') verb = fuse(state, verb, not, `${verb.gloss}-NEG`);
    // a question ending on the verb
    const qE = c.question ? lookup(state, 'question particle') : null;
    if (qE && syntax.polar === 'verb-suffix') verb = fuse(state, verb, makeWord(state, qE, null, 'Q'), `${verb.gloss}-Q`);
    if (not && neg === 'before') words.push(not);
    if (not && neg === 'double') words.push(not);
    words.push(verb);
    if (not && neg === 'after') words.push(not);
    if (not && neg === 'double') {
        const nothing = lookup(state, 'nothing');
        if (nothing) words.push(makeWord(state, nothing, null, 'NEG2'));
    }
    // "I want to go", "I can see": the second verb, bare
    if (c.complement) {
        const ce = lookup(state, c.complement);
        words.push(ce ? makeWord(state, ce, null, c.complement) : (missing.add(c.complement), foreign(c.complement)));
    }
    return { words, verbAt: words.indexOf(verb), incorporated, objectOnVerb: !!verb.objectOnVerb };
}

const SLOTS = {
    SVO: ['S', 'V', 'O', 'X'], SOV: ['S', 'O', 'X', 'V'], VSO: ['V', 'S', 'O', 'X'],
    VOS: ['V', 'O', 'X', 'S'], OVS: ['O', 'X', 'V', 'S'], OSV: ['O', 'X', 'S', 'V'],
};

/** One clause in one language: -> words in order. */
function renderClause(state, c, opts) {
    const syntax = state.syntax || {};
    const transitive = !!c.object;
    const v = renderVerb(state, c, opts);
    // a subject shared with the clause before is not said again
    const S = c.imperative || c.subjectShared ? [] : renderNP(state, c.subject, 'subject', { ...opts, transitive });
    // an object built into the verb is not said again
    const O = v.incorporated ? [] : renderNP(state, c.object, 'object', opts);
    let P = [];
    if (c.predicate?.adj) {
        const e = lookup(state, c.predicate.adj);
        P = [e ? makeWord(state, e, null, c.predicate.adj) : (opts.missing.add(c.predicate.adj), foreign(c.predicate.adj))];
    } else if (c.predicate?.np) P = renderNP(state, c.predicate.np, 'predicate', opts);
    const X = [];
    if (c.recipient) X.push(...renderNP(state, c.recipient, 'oblique', { ...opts, cases: ['DAT', 'ALL'], adp: 'towards' }));
    for (const { prep, np } of c.obliques) {
        const p = PREPS[prep] || { cases: [], adp: prep };
        const cases = prep === 'to' && MOTION.has(c.verb) ? p.motionCases : prep === 'with' && np.pron ? ['COM', 'INS'] : p.cases;
        X.push(...renderNP(state, np, 'oblique', { ...opts, cases, adp: p.adp }));
    }
    const adverbs = c.adverbs.map((w) => {
        const e = lookup(state, w);
        return e ? makeWord(state, e, null, w) : (opts.missing.add(w), foreign(w));
    });
    // the order
    const order = SLOTS[syntax.order] || SLOTS.SVO;
    const slot = { S, V: v.words, O: [...O, ...P], X };
    // in a verb-final language the obliques come before the verb (already in
    // the SOV/OSV patterns); in the rest after the object
    let words = [];
    for (const k of order) words.push(...slot[k]);
    // a wh-word: at the front where questions front it (syntax.question
    // 'initial'), else in its place
    if (c.wh) {
        const whE = lookup(state, c.wh);
        const wh = whE ? makeWord(state, whE, null, c.wh) : (opts.missing.add(c.wh), foreign(c.wh));
        if (syntax.question === 'final') words = [...words, wh];
        else words = [wh, ...words];
    }
    words = [...adverbs, ...words];
    // a yes-no question
    if (c.question) {
        const qE = lookup(state, 'question particle');
        const q = qE ? makeWord(state, qE, null, 'Q') : null;
        if (syntax.polar === 'particle-final' && q) words = [...words, q];
        else if (syntax.polar === 'particle-initial' && q) words = [q, ...words];
        else if (syntax.polar === 'particle-second' && q) words = [...words.slice(0, 1), q, ...words.slice(1)];
        else if (syntax.polar === 'inversion') {
            const vi = words.findIndex((w) => w.verb);
            if (vi > 0) words = [words[vi], ...words.slice(0, vi), ...words.slice(vi + 1)];
        }
    }
    // the clause's link word, and any greeting
    const pre = [];
    for (const g of c.interjections) {
        const e = lookup(state, g);
        pre.push(e ? makeWord(state, e, null, g) : (opts.missing.add(g), foreign(g)));
    }
    if (c.link) {
        const e = lookup(state, c.link === 'then' ? 'then' : c.link);
        if (e) pre.push(makeWord(state, e, null, c.link));
    }
    return [...pre, ...words];
}

/**
 * Translate English into one language as it stands in `state`.
 * -> { sentences: [{ english, spelling, ipa, gloss, words }], missing }.
 */
export function translate(state, englishOrAnalysis) {
    const analysis = typeof englishOrAnalysis === 'string' ? analyseEnglish(englishOrAnalysis) : englishOrAnalysis;
    const missing = new Set(analysis.missing);
    const sentences = analysis.sentences.map((s) => {
        const clauses = s.clauses.map((c) => renderClause(state, c, { missing }));
        const words = clauses.flat();
        const spelling = clauses.map((ws) => ws.map((w) => w.spelling).join(' ')).filter(Boolean).join(', ');
        return {
            english: s.english,
            spelling: spelling ? `${spelling[0].toUpperCase()}${spelling.slice(1)}${s.question ? '?' : s.english.endsWith('!') ? '!' : '.'}` : '',
            ipa: clauses.map((ws) => ws.map((w) => w.ipa).join(' ')).join(' | '),
            gloss: clauses.map((ws) => ws.map((w) => w.gloss).join(' ')).join(' | '),
            words,
        };
    });
    return { sentences, missing: [...missing].filter((w) => !/^[A-Z]/.test(w)) };
}

/** How this language does the things a translation shows, for the panel. */
export function grammarNotes(state) {
    const s = state.syntax || {};
    const cats = state.paradigm?.categories || {};
    const notes = [];
    notes.push(`word order ${s.dominant === false ? `free (${s.order} commonest)` : s.order}`);
    notes.push(s.adjective === 'NAdj' ? 'adjectives after the noun' : 'adjectives before the noun');
    notes.push(s.genitive === 'NGen' ? 'possessor after the noun' : 'possessor before the noun');
    notes.push(cats.cases?.length ? `${cats.cases.length} cases (${cats.cases.join(', ')})` : 'no cases');
    notes.push(s.adposition === 'postposition' ? 'postpositions' : 'prepositions');
    if (cats.tenses?.length) notes.push(`verb forms: ${cats.tenses.join(', ')}`);
    else notes.push('no verb endings');
    if (cats.definite) notes.push('a definite article on the noun');
    return notes;
}
