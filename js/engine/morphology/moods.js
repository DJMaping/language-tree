/**
 * Moods: commands, "don't", "let's" and wishes (17 Oct 2026, DJ: "I do want
 * these to be incredibly complicated like languages"; designed by a judged
 * panel against the WALS data on disk, data/earth-src/wals).
 *
 * THE IMPERATIVE (WALS 70A, 548 languages). Most languages have a verb form
 * of their own for commands: for one person and for several (292: Latin canta,
 * cantate), for either without telling them apart (89: Swedish kom!), for one
 * only, the plural said with the ordinary present (43: German sing!, but
 * singt!), for several only (2), or none at all, a command being an ordinary
 * verb form (122: English, Mandarin). A command form is very often the bare
 * stem (Latin dic, English go), and it changes as everything does: sound
 * change can wear it into the present ("you sing" and "sing!" falling
 * together in English), a plural can be lost (Swedish kommen! is gone) or
 * rebuilt by adding the plural person ending (Russian idi, idi-te), and a
 * language with none can grow one.
 *
 * THE PROHIBITIVE (WALS 71A, 496 languages). "Don't!" is often not simply "not"
 * plus the command. Many languages have a negative of their own for it (182
 * with the normal command: Mandarin bié, from bù yào "not want"; Latin nōlī,
 * "be unwilling"; Welsh paid, "stop"), some a special verb form (55: Spanish
 * no cantes, with the subjunctive; Latin nē cantēs), many both (146), and
 * some neither (113). The special negator grows from "not want", "not good",
 * "stop" or "leave", and is also what is left when "not" is renewed but the
 * old word stays in prohibitions (Greek mi beside dhen, Hungarian ne beside
 * nem).
 *
 * WISHES (WALS 73A, 319 languages). A few languages have an optative, a verb
 * form for wishes (48: Ancient Greek, Turkish -sA, Japanese -tai's ancestors),
 * most often in verb-final languages, where a word after the verb can bond to
 * it. On its way there is a hortative word ("let", from "leave", "give",
 * "want" or "go": English let's, Russian pust', from "let go"), and an
 * optative can widen into a subjunctive (Greek), which is how Spanish says
 * "don't sing!" and French "long live the king".
 *
 * The forms are paradigm cells (IMP.2SG, IMP.2PL, IRR.<person>) and words
 * ("mood:PROH:...", "mood:HORT:..."), grammar like the rest (paradigm.js
 * MOOD_SLOTS). Each lifetime's changes are planned in the changeset as chains
 * whose stationary shares equal Earth's for the language's type and verb
 * position, and the proto is drawn at those same shares, so at any depth the
 * expected spread is Earth's; how fast they run was fitted to how often
 * sisters in a WALS genus still agree (Earth: 0.56, 0.43, 0.85).
 */

import { wordToIpa, wordToIpaStressed } from '../features.js';
import { repairHiatus, syllabify } from '../phonology/phonotactics.js';
import { isParadigmEntry, parseCellId, cellIdOf, isIrregularClass, isMoodCell, slotOf, makeEnding, stemTail, splitAround, splitForm } from './paradigm.js';
import { reduce, affixPosition } from './grammaticalisation.js';
import { weakened } from './articles.js';

// --- Earth's values --------------------------------------------------------------------

export const IMPERATIVE_VALUES = ['second singular and plural', 'number-neutral', 'second singular only', 'second plural only', 'none'];
export const PROHIBITIVE_VALUES = ['normal imperative + normal negative', 'normal imperative + special negative', 'special imperative + normal negative', 'special imperative + special negative'];

/**
 * The proto draws: Earth's shares by class (WALS 70A, 71A, 73A, counted by
 * verb position and affixation), which are also the stationary shares of the
 * chains below. B both numbers, N number-neutral, S singular only, P plural
 * only, Z none; NN/NS/SN/SS = (special verb?, special negator?); none, H a
 * hortative word, O an optative, J a subjunctive.
 */
const PROTO = {
    imperative: { OV: { B: 0.628, N: 0.199, S: 0.044, P: 0.004, Z: 0.125 }, VO: { B: 0.575, N: 0.126, S: 0.102, P: 0.012, Z: 0.186 } },
    prohibitive: { OV: { NN: 0.23, NS: 0.41, SN: 0.049, SS: 0.311 }, VO: { NN: 0.306, NS: 0.3, SN: 0.14, SS: 0.253 }, isolating: { NN: 0.234, NS: 0.766 } },
    irrealis: { OV: { none: 0.42, H: 0.09, O: 0.22, J: 0.27 }, VO: { none: 0.48, H: 0.32, O: 0.04, J: 0.16 }, isolating: { none: 0.53, H: 0.47 } },
};

/**
 * The chains, per thousand years before the branch rate: from -> [[to, rate]].
 * Sound change also wears command forms into the present on its own (the sync
 * in applyMoods), so the planned levelling into Z is set at two fifths of the
 * design's total and the regrowth from Z half as fast again (measured over
 * five worlds, 17 Oct 2026).
 */
const RATES = {
    imperative: {
        OV: { B: [['N', 0.078], ['S', 0.039], ['Z', 0.023]], N: [['Z', 0.031], ['B', 0.246]], S: [['Z', 0.031], ['B', 0.557]], P: [['Z', 0.031], ['B', 0.612]], Z: [['B', 0.441], ['N', 0.186], ['S', 0.041]] },
        VO: { B: [['N', 0.074], ['S', 0.037], ['Z', 0.022]], N: [['Z', 0.03], ['B', 0.338]], S: [['Z', 0.03], ['B', 0.209]], P: [['Z', 0.03], ['B', 0.177]], Z: [['B', 0.258], ['N', 0.075], ['S', 0.062]] },
    },
    prohibitive: {
        OV: { NN: [['NS', 0.313], ['SN', 0.058]], NS: [['NN', 0.175], ['SS', 0.205]], SN: [['SS', 1.114], ['NN', 0.27]], SS: [['SN', 0.175], ['NS', 0.27]] },
        VO: { NN: [['NS', 0.153], ['SN', 0.11]], NS: [['NN', 0.156], ['SS', 0.202]], SN: [['SS', 0.282], ['NN', 0.24]], SS: [['SN', 0.156], ['NS', 0.24]] },
        isolating: { NN: [['NS', 0.553]], NS: [['NN', 0.169]] },
    },
    irrealis: {
        VAux: { none: [['H', 0.113], ['J', 0.013]], H: [['none', 0.129], ['O', 0.921]], O: [['J', 0.064], ['none', 0.132]], J: [['none', 0.066]] },
        AuxV: { none: [['H', 0.113], ['J', 0.013]], H: [['none', 0.129], ['O', 0.023]], O: [['J', 0.064], ['none', 0.132]], J: [['none', 0.066]] },
        isolating: { none: [['H', 0.113]], H: [['none', 0.129]] },
    },
};
const STEP = 250;
/** How often a renewed "not" leaves the old one behind in prohibitions (Greek mi, Hungarian ne). */
const P_KEEP = 0.5;

/** Where the special "don't" comes from, and "let". */
export const PROHIBITIVE_SOURCES = [
    { key: 'not+want', glosses: ['not', 'want'], weight: 0.4, neg: 'particle', attested: 'Mandarin bié from bù yào "not want"; Latin nōlī "be unwilling"' },
    { key: 'not+good', glosses: ['not', 'good'], weight: 0.15, neg: 'particle', attested: 'a "not good" turned "don\'t" is common in Southeast Asia (Vietnamese đừng beside không)' },
    { key: 'stop', glosses: ['stop'], weight: 0.3, neg: 'auxiliary', attested: 'Welsh paid â "stop", Finnish älä, a negative verb' },
    { key: 'leave', glosses: ['leave'], weight: 0.15, neg: 'auxiliary', attested: 'a verb of leaving or ceasing put before the verb is a common source of prohibitions (van der Auwera)' },
];
export const HORTATIVE_SOURCES = [
    { gloss: 'leave', weight: 0.4, attested: 'English let\'s, from let "leave, allow"; Russian pust\' from "let go"' },
    { gloss: 'give', weight: 0.25, attested: 'Russian davaj "give" in davaj pojdëm "let\'s go"; Breton' },
    { gloss: 'want', weight: 0.2, attested: 'Greek as from áfēse "leave"; a verb of wanting is the other common source' },
    { gloss: 'go', weight: 0.15, attested: 'Spanish vamos a, Hebrew bo, "come, go" used for "let\'s"' },
];

// --- the state, read and labelled -------------------------------------------------------

const verbPersons = (cats) => (cats?.persons || []).filter((p) => !p.includes('>'));
export const moodClass = (cats, syntax) => (cats?.type === 'isolating' ? 'isolating' : syntax?.headFinal ? 'OV' : 'VO');
const auxClass = (cats, syntax) => (cats?.type === 'isolating' ? 'isolating' : syntax?.auxiliary === 'VAux' ? 'VAux' : 'AuxV');
export function imperativeState(imp) {
    if (!imp) return 'Z';
    if (imp.sg === 'own' && imp.pl === 'own') return 'B';
    if (imp.sg === 'own' && imp.pl === 'sg') return 'N';
    if (imp.sg === 'own') return 'S';
    if (imp.pl === 'own') return 'P';
    return 'Z';
}
export const prohibitiveState = (p) => `${p && p.verb && p.verb !== 'imperative' ? 'S' : 'N'}${p && p.neg && p.neg !== 'normal' ? 'S' : 'N'}`;
export const irrealisState = (i) => (i?.series === 'OPT' ? 'O' : i?.series === 'SBJV' ? 'J' : i?.hortative ? 'H' : 'none');

const DECLARED = {
    imperative: { both: 'B', 'number-neutral': 'N', '2sg': 'S', '2pl': 'P', none: 'Z' },
    irrealis: { none: 'none', hortative: 'H', optative: 'O', subjunctive: 'J' },
};

/** The proto's moods: three draws whatever is declared. */
export function drawMoodSpec(rng, { type, order }, declared = {}) {
    const headFinal = /^(SOV|OSV|OVS)$/.test(order || '');
    const cls = type === 'isolating' ? 'isolating' : headFinal ? 'OV' : 'VO';
    const pick = (W) => rng.pickWeighted(Object.keys(W), (k) => W[k]);
    const imp = pick(PROTO.imperative[headFinal ? 'OV' : 'VO']);
    const proh = pick(PROTO.prohibitive[cls]);
    const irr = pick(PROTO.irrealis[cls]);
    const spec = {
        imperative: type === 'isolating' ? 'Z' : DECLARED.imperative[declared.imperative] ?? imp,
        prohibitive: declared.prohibitive ?? (type === 'isolating' && proh[0] === 'S' ? `N${proh[1]}` : proh),
        irrealis: DECLARED.irrealis[declared.irrealis] ?? irr,
    };
    const label = { B: 'commands for one and for several', N: 'one command form for one or several', S: 'a command form for one; several are told with the present', P: 'a command form for several only', Z: 'no command form of its own' };
    const reason = [label[spec.imperative],
        spec.prohibitive[1] === 'S' ? '"don\'t" with a word of its own' : '"don\'t" with the ordinary "not"',
        { none: 'no wish form', H: 'a word for "let"', O: 'an optative', J: 'a subjunctive' }[spec.irrealis]].join('; ');
    return { spec, reason };
}

// --- forms -------------------------------------------------------------------------------

const live = (entries, gloss, pos) => entries.find((e) => e.gloss === gloss && (!pos || e.pos === pos) && !e.retired && !e.paradigm && e.form?.length) || null;

/** The verb classes and their cells, read off the entries. */
function verbTable(entries) {
    const table = new Map();
    for (const e of entries) {
        if (!isParadigmEntry(e)) continue;
        const { cls, cell } = parseCellId(e.id);
        if (cls[0] !== 'v') continue;
        if (!table.has(cls)) table.set(cls, new Map());
        table.get(cls).set(cell, e);
    }
    return table;
}
const sameForm = (a, b) => !!a && !!b && wordToIpaStressed(a) === wordToIpaStressed(b);
/** Does a 2nd-person cell differ from every other cell of the same person and number? (D1) */
function dedicated(cellMap, cell, form) {
    const pn = cell.split('.').slice(1).join('.');
    for (const [name, e] of cellMap) {
        if (name === cell || !name.endsWith(`.${pn}`) || name.includes('>')) continue;
        if (slotOf(name) === slotOf(cell)) continue;
        if (sameForm(e.form, form)) return false;
    }
    return true;
}

function moodCellEntry(cls, cell, form, stem, pt) {
    return {
        id: cellIdOf(cls, cell), form, ipa: wordToIpa(form), gloss: `${stem.gloss}.${cell}`, pos: 'v', domain: 'grammar', core: true,
        rank: Math.max(1, stem.rank ?? 1), zipf: 0, class: cls, syllables: syllabify(form, pt).length, irregular: !!stem.irregular,
        derivedFrom: null, paradigm: { cls, cell, stem: stem.id, stemGloss: stem.gloss },
    };
}

/** A word of the mood system: "don't" or "let". */
export function makeMoodWord(kind, form, sources, pt, year = null, attested = '') {
    const src = sources[sources.length - 1];
    return {
        id: `mood:${kind}:${sources.map((s) => s.id).join('+')}`, form, ipa: wordToIpa(form),
        gloss: kind === 'PROH' ? 'prohibitive ("don\'t")' : 'hortative ("let")', pos: 'part', domain: 'grammar', core: false,
        rank: Math.max(1, src.rank ?? 1), zipf: 0, syllables: syllabify(form, pt).length, irregular: false, derivedFrom: null,
        mood: kind, builtFrom: sources.map((s) => s.gloss),
        paradigm: { cls: 'mood', cell: kind, stem: src.id, stemGloss: src.gloss },
        grammaticalisedFrom: { lexeme: src.id, gloss: sources.map((s) => s.gloss).join(' + '), year, cline: kind === 'PROH' ? 'prohibitive' : 'hortative', attested },
    };
}

function pickProhibitiveSource(entries, rng) {
    const avail = PROHIBITIVE_SOURCES.map((s) => ({ s, words: s.glosses.map((g) => live(entries, g)) })).filter((x) => x.words.every(Boolean));
    if (!avail.length) return null;
    return rng.pickWeighted(avail, (x) => x.s.weight);
}
function prohibitiveWord(choice, pt, year) {
    const { s, words } = choice;
    const form = s.neg === 'particle' ? repairHiatus(words.flatMap((w) => weakened(w.form, pt)), pt) : words[0].form;
    return makeMoodWord('PROH', form, words, pt, year, s.attested);
}
function pickHortativeSource(entries, rng) {
    const avail = HORTATIVE_SOURCES.map((s) => ({ s, word: live(entries, s.gloss, 'v') })).filter((x) => x.word);
    return avail.length ? rng.pickWeighted(avail, (x) => x.s.weight) : null;
}

/**
 * Build the proto's moods from its spec. The command and irrealis cells use
 * the language's own morphology: one shared morph per mood where it stacks
 * morphs (agglutinative, polysynthetic), its own endings per class where it
 * fuses; a class of one takes its base class's.
 */
export function buildMoodSystem(entries, paradigm, spec, { pools, phonotactics: pt, type, morphs, rng } = {}) {
    if (!spec || !paradigm?.categories) return { entries, system: null };
    const cats = paradigm.categories;
    const out = [...entries];
    const byId = new Map(entries.map((e) => [e.id, e]));
    const verbClasses = Object.entries(paradigm.classes || {}).filter(([, c]) => c.pos === 'v');
    const persons = verbPersons(cats);
    const isolating = type === 'isolating' || !verbClasses.length || !persons.length;
    const imp = isolating ? 'Z' : spec.imperative;
    const irr = isolating && (spec.irrealis === 'O' || spec.irrealis === 'J') ? 'H' : spec.irrealis;
    const wantIrr = !isolating && (irr === 'O' || irr === 'J');
    const nonZero = () => makeEnding(pools, rng, { zeroAllowed: false });
    const shared = !!morphs;
    const prefixPersons = cats.personPosition === 'prefix';
    const sets = new Map();
    const setFor = (cls, c) => {
        const ex = byId.get(c.exemplarId);
        const key = shared ? '*' : (isIrregularClass(cls) && ex?.baseClass && sets.has(ex.baseClass) ? ex.baseClass : cls);
        if (sets.has(key)) return sets.get(key);
        const tenseMorphs = new Set(Object.values(morphs?.tense || {}).map((m) => wordToIpa(m)));
        let irrMorph = nonZero();
        for (let t = 0; t < 12 && tenseMorphs.has(wordToIpa(irrMorph)); t++) irrMorph = nonZero();
        const set = {
            impSg: rng.bool(0.65) ? [] : nonZero(),
            impPl: morphs?.person?.['2PL'] && rng.bool(0.5) ? morphs.person['2PL'] : nonZero(),
            irr: irrMorph,
            irrCells: shared ? null : Object.fromEntries(persons.map((p) => [p, nonZero()])),
        };
        sets.set(key, set);
        return set;
    };
    const imperative = isolating ? null : { sg: 'indicative', pl: 'indicative' };
    for (const [cls, c] of verbClasses) {
        const stemE = byId.get(c.exemplarId);
        if (!stemE?.form?.length) continue;
        const stem = stemE.form;
        const set = setFor(cls, c);
        const cellMap = new Map(entries.filter((e) => isParadigmEntry(e) && parseCellId(e.id).cls === cls).map((e) => [parseCellId(e.id).cell, e]));
        const add = (cell, form) => {
            const e = moodCellEntry(cls, cell, form, stemE, pt);
            out.push(e);
            cellMap.set(cell, e);
            const around = prefixPersons ? splitAround(stem, form) : null;
            c.cells[cell] = { ending: around?.pre.length ? `${wordToIpa(around.pre)}-…-${wordToIpa(around.post)}` : wordToIpa(stemTail(stem, form)), form, ipa: e.ipa, key: wordToIpaStressed(form) };
        };
        if (wantIrr) {
            for (const p of persons) {
                const person = morphs?.person?.[p] || [];
                // the person marker on its own side of the stem (persons before it: Swahili)
                const form = set.irrCells ? [...stem, ...set.irrCells[p]]
                    : prefixPersons ? [...person, ...stem, ...set.irr] : [...stem, ...set.irr, ...person];
                add(`IRR.${p}`, repairHiatus(form, pt));
            }
        }
        if (!isolating && imp !== 'Z') {
            // the command form: the bare stem more often than not (Latin dic, English go), else an ending;
            // redrawn while it would equal another form of the same person (D1)
            let sg = repairHiatus([...stem, ...set.impSg], pt);
            for (let t = 0; t < 12 && !dedicated(cellMap, 'IMP.2SG', sg); t++) sg = repairHiatus([...stem, ...nonZero()], pt);
            if (imp !== 'P') add('IMP.2SG', sg);
            if (imp === 'B' || imp === 'P') {
                let pl = repairHiatus(prefixPersons && set.impPl === morphs?.person?.['2PL'] ? [...set.impPl, ...sg] : [...sg, ...set.impPl], pt);
                for (let t = 0; t < 12 && (!dedicated(cellMap, 'IMP.2PL', pl) || sameForm(pl, sg)); t++) pl = repairHiatus([...sg, ...nonZero()], pt);
                add('IMP.2PL', pl);
            }
        }
    }
    if (imperative) {
        imperative.sg = imp === 'B' || imp === 'N' || imp === 'S' ? 'own' : 'indicative';
        imperative.pl = imp === 'B' || imp === 'P' ? 'own' : imp === 'N' ? 'sg' : 'indicative';
    }
    // the prohibitive
    const prohibitive = { neg: 'normal', marker: null, verb: 'imperative', strategy: null };
    if (spec.prohibitive[1] === 'S') {
        const choice = pickProhibitiveSource(out, rng);
        if (choice) {
            const w = prohibitiveWord(choice, pt, null);
            out.push(w);
            prohibitive.neg = choice.s.neg;
            prohibitive.marker = w.id;
        }
    }
    if (spec.prohibitive[0] === 'S' && !isolating) prohibitive.verb = specialVerb(out, paradigm, wantIrr, imperative);
    // the hortative word
    let hortative = null;
    if (irr === 'H') {
        const h = pickHortativeSource(out, rng);
        if (h) { const w = makeMoodWord('HORT', weakened(h.word.form, pt), [h.word], pt, null, h.s.attested); out.push(w); hortative = w.id; }
    }
    return {
        entries: out,
        system: { imperative, prohibitive, irrealis: { series: wantIrr ? (irr === 'O' ? 'OPT' : 'SBJV') : null, hortative } },
    };
}

/**
 * The verb form a "don't" takes where it differs from the command (71A's
 * special imperative): the irrealis where there is one (Spanish no cantes),
 * else the bare stem where the command is not already the bare stem, else the
 * present (Hungarian, Italian non cantare's kin use the infinitive).
 */
function specialVerb(entries, paradigm, hasIrr, imperative) {
    if (hasIrr) return 'irrealis';
    if (!imperative) return 'imperative';   // an isolating verb has one form
    let bareDiffers = 0, total = 0;
    for (const [, c] of Object.entries(paradigm?.classes || {})) {
        if (c.pos !== 'v') continue;
        const stem = entries.find((e) => e.id === c.exemplarId);
        const cmd = c.cells?.['IMP.2SG']?.form;
        if (!stem?.form || !cmd) continue;
        total += 1;
        if (!sameForm(stem.form, cmd)) bareDiffers += 1;
    }
    // where commands use the present, the bare stem is the special form; where they have their own,
    // the bare stem if the command is not already bare, else the present
    if (imperative.sg !== 'own') return 'bare';
    if (total && bareDiffers / total > 0.5) return 'bare';
    return 'indicative';
}

// --- change ------------------------------------------------------------------------------

const NOTE = {
    'plural-levelled': ['the plural command form fell out of use; one form serves for one or several', 'Swedish kommen! has given way to kom! for everyone'],
    'plural-from-indicative': ['several people are told what to do with the ordinary present', 'German singt! is the present "you (pl) sing"'],
    'imp-levelled': ['the command form fell together with the present and is gone', 'English "sing!" is the bare verb, as "you sing" is'],
    'plural-renewed': ['a new plural command was built on the singular', 'Russian idi "go!", idi-te "go! (pl)"'],
    'imp-renewed': ['a command form of its own grew up again', 'Icelandic farðu "go!" from far þú "go you"'],
    'proh-renewed': ['a word of its own came into use for "don\'t"', 'Mandarin bié from bù yào "not want"'],
    'proh-levelled': ['"don\'t" came to be said with the ordinary "not"', 'Late Latin non with the subjunctive replaced nē'],
    'proh-verb': ['the verb in a prohibition changed form', 'Spanish no cantes takes the subjunctive, Latin nē cantēs did too'],
    'proh-retained': ['when "not" was renewed, the old word stayed on in "don\'t"', 'Greek mi beside dhen, Hungarian ne beside nem'],
    'hort-rise': ['a word for "let" came into use', 'English let\'s, Russian pust\''],
    'hort-lost': ['the word for "let" fell out of use', 'a hortative particle can simply be dropped for the plain verb'],
    'irr-bond': ['the "let" word bonded to the verb as an ending: an optative', 'the Turkish optative -(y)A and the Mongolic ones grew from words after the verb'],
    'irr-generalised': ['the optative widened into a subjunctive', 'Greek: the optative gave way to the subjunctive, which took over its wishes'],
    'opt-lost': ['the optative fell out of use', 'the Ancient Greek optative is gone from Modern Greek'],
    'sbjv-lost': ['the subjunctive fell together with the indicative', 'English "if I were" is nearly the last of it'],
    'sbjv-rise': ['a word for "if" or "that" bonded to the verb: a subjunctive', 'Greek na from hína "so that"; Romanian să'],
};

/**
 * Plan a lifetime's mood changes from the language as founded. One draw per
 * system per 250 years, walked through the state's outgoing rates; sub-
 * choices (sources) draw their own. Dated events, in order.
 */
export function planMoods(state, rng, { from, to, rate = 1, replacements = [] } = {}) {
    const cats = state.paradigm?.categories;
    if (!cats?.moods) return [];
    const years = Math.max(0, (to ?? from) - from);
    const syntax = state.syntax || {};
    const mc = moodClass(cats, syntax);
    const ac = auxClass(cats, syntax);
    const isolating = mc === 'isolating';
    const entries = state.entries || [];
    let imp = imperativeState(cats.moods.imperative);
    let proh = prohibitiveState(cats.moods.prohibitive);
    let irr = irrealisState(cats.moods.irrealis);
    const events = [];
    const ev = (system, step, fromS, toS, year, extra = {}) => {
        const [note, attested] = NOTE[step] || ['', ''];
        events.push({ kind: 'mood', system, step, from: fromS, to: toS, year, note, attested, ...extra });
    };
    // when "not" itself is replaced, the old word may stay on in prohibitions (Greek mi, Hungarian ne)
    const notRep = (replacements || []).find((r) => r.gloss === 'not' || r.fromGloss === 'not' || r.meaning === 'not');
    if (notRep && proh[1] === 'N' && rng.bool(P_KEEP)) {
        const old = live(entries, 'not');
        if (old) { ev('prohibitive', 'proh-retained', proh, `${proh[0]}S`, notRep.year ?? Math.round(from + years / 2), { sourceId: old.id }); proh = `${proh[0]}S`; }
    }
    for (let t = 0; t < years; t += STEP) {
        const dt = Math.min(STEP, years - t);
        const k = (dt / 1000) * rate;
        const year = Math.round(from + t + dt * rng.float(0.2, 0.8));
        const walk = (table, now) => {
            const r = rng.next();
            let acc = 0;
            for (const [next, p] of table[now] || []) { acc += p * k; if (r < acc) return next; }
            return null;
        };
        if (!isolating) {
            const next = walk(RATES.imperative[mc], imp);
            if (next) {
                const step = next === 'Z' ? 'imp-levelled' : imp === 'B' ? (next === 'N' ? 'plural-levelled' : 'plural-from-indicative')
                    : (imp === 'N' || imp === 'S') && next === 'B' ? 'plural-renewed' : 'imp-renewed';
                ev('imperative', step, imp, next, year, { via: step === 'plural-renewed' ? (rng.bool(0.6) ? 'person' : 'pronoun') : step === 'imp-levelled' && rng.bool(0.5) ? 'irrealis' : null });
                imp = next;
            }
        }
        {
            const next = walk(RATES.prohibitive[isolating ? 'isolating' : mc], proh);
            if (next) {
                const negChange = next[1] !== proh[1];
                if (negChange && next[1] === 'S') {
                    const choice = pickProhibitiveSource(entries, rng);
                    if (choice) { ev('prohibitive', 'proh-renewed', proh, next, year, { source: choice.s.key, sourceIds: choice.words.map((w) => w.id) }); proh = next; }
                } else if (negChange) { ev('prohibitive', 'proh-levelled', proh, next, year); proh = next; }
                else { ev('prohibitive', 'proh-verb', proh, next, year); proh = next; }
            }
        }
        {
            const next = walk(RATES.irrealis[ac], irr);
            if (next) {
                const step = next === 'H' ? 'hort-rise' : next === 'O' ? 'irr-bond' : next === 'J' ? (irr === 'O' ? 'irr-generalised' : 'sbjv-rise')
                    : irr === 'H' ? 'hort-lost' : irr === 'O' ? 'opt-lost' : 'sbjv-lost';
                const extra = {};
                if (step === 'hort-rise') { const h = pickHortativeSource(entries, rng); if (!h) continue; extra.sourceId = h.word.id; }
                if (step === 'sbjv-rise') { const w = live(entries, 'if'); if (!w) continue; extra.sourceId = w.id; }
                ev('irrealis', step, irr, next, year, extra);
                irr = next;
            }
        }
    }
    return events;
}

/**
 * Apply a lifetime's mood events, then the sync: a command form that sound
 * change has made identical to another form of the same person everywhere is
 * gone, an irrealis identical to the present everywhere is gone, a "don't" or
 * "let" worn to nothing is gone. Returns { entries, applied, changed,
 * categories } (categories null when nothing moved).
 */
export function applyMoods(entries, events, { phonotactics: pt, paradigm, categories } = {}) {
    const moods0 = categories?.moods;
    if (!moods0) return { entries, applied: [], changed: [], made: [], categories: null };
    let out = entries;
    const m = {
        // a language that has begun to inflect (grammaticalisation.js first ending) can grow a command form
        imperative: moods0.imperative ? { ...moods0.imperative } : categories.type !== 'isolating' ? { sg: 'indicative', pl: 'indicative' } : null,
        prohibitive: { ...moods0.prohibitive },
        irrealis: { ...moods0.irrealis },
    };
    const applied = [];
    const changed = [];
    const made = [];
    const persons = verbPersons(categories);
    const exemplar = (cls) => out.find((e) => e.id === paradigm?.classes?.[cls]?.exemplarId) || null;
    const dropCells = (pred) => { out = out.filter((e) => !(isParadigmEntry(e) && parseCellId(e.id).cls[0] === 'v' && pred(parseCellId(e.id).cell))); };
    const addCells = (make, extra = null) => {
        const table = verbTable(out);
        const fresh = [];
        for (const [cls, cellMap] of table) {
            const stem = exemplar(cls);
            if (!stem?.form?.length) continue;
            for (const [cell, form] of make(cls, cellMap, stem)) {
                if (!form?.length || cellMap.has(cell)) continue;
                fresh.push({ ...moodCellEntry(cls, cell, form, stem, pt), ...(extra || {}) });
            }
        }
        out = [...out, ...fresh];
        made.push(...fresh.map((e) => e.id));
        return fresh.length;
    };
    const pronounTail = (gloss) => { const w = live(out, gloss, 'pron'); return w ? reduce(w.form, pt, 'suffix') : []; };
    const bareCommand = (stem, cellMap) => (dedicated(cellMap, 'IMP.2SG', stem.form) ? stem.form : repairHiatus([...stem.form, ...pronounTail('you (sg)')], pt));
    // the plural person marker (Russian idi-te; before the stem where persons go first, Swahili m-),
    // or where it has worn to nothing "you (pl)" itself
    const prefixPersons = categories?.personPosition === 'prefix';
    const marker2PL = (stem, cellMap) => {
        const pl = cellMap.get('PRS.2PL')?.form || stem.form;
        let cut = { pre: [], post: stemTail(stem.form, pl) };
        if (prefixPersons && cellMap.get('PRS.2PL')) cut = splitForm(stem.form, Object.fromEntries(cellMap), 'PRS.2PL') || cut;
        return cut.pre.length || cut.post.length ? cut : { pre: [], post: pronounTail('you (pl)') };
    };
    const plural = (sg, mk) => (mk.pre.length || mk.post.length ? repairHiatus([...mk.pre, ...sg, ...mk.post], pt) : null);
    for (const ev of events || []) {
        let ok = true;
        if (ev.system === 'imperative') {
            if (!m.imperative) continue;
            if (ev.step === 'plural-levelled' || ev.step === 'plural-from-indicative') {
                dropCells((c) => c === 'IMP.2PL');
                m.imperative.pl = ev.step === 'plural-levelled' ? 'sg' : 'indicative';
            } else if (ev.step === 'imp-levelled') {
                dropCells((c) => slotOf(c) === 'IMP');
                const via = ev.via === 'irrealis' && m.irrealis.series === 'SBJV' ? 'irrealis' : 'indicative';
                m.imperative = { sg: via, pl: via };
            } else if (ev.step === 'plural-renewed') {
                const n = addCells((cls, cellMap, stem) => {
                    const sg = cellMap.get('IMP.2SG')?.form;
                    if (!sg) return [];
                    const yp = pronounTail('you (pl)');
                    const mk = ev.via === 'person' || !yp.length ? marker2PL(stem, cellMap) : { pre: [], post: yp };
                    return [['IMP.2PL', plural(sg, mk)]];
                });
                if (!n) ok = false; else m.imperative.pl = 'own';
            } else if (ev.step === 'imp-renewed') {
                const wantSg = ev.to !== 'P';
                const wantPl = ev.to === 'B' || ev.to === 'P';
                const n = addCells((cls, cellMap, stem) => {
                    const sg = cellMap.get('IMP.2SG')?.form || bareCommand(stem, cellMap);
                    const cells = [];
                    if (wantSg) cells.push(['IMP.2SG', sg]);
                    if (wantPl) cells.push(['IMP.2PL', plural(sg, marker2PL(stem, cellMap))]);
                    return cells;
                });
                if (!n) ok = false;
                else {
                    if (wantSg) m.imperative.sg = 'own';
                    m.imperative.pl = wantPl ? 'own' : ev.to === 'N' ? 'sg' : m.imperative.pl === 'own' ? 'own' : 'indicative';
                }
            } else continue;
        } else if (ev.system === 'prohibitive') {
            const p = m.prohibitive;
            if (ev.step === 'proh-renewed') {
                const words = (ev.sourceIds || []).map((id) => out.find((e) => e.id === id)).filter((e) => e?.form?.length);
                const s = PROHIBITIVE_SOURCES.find((x) => x.key === ev.source);
                if (!s || words.length !== s.glosses.length) continue;
                const w = prohibitiveWord({ s, words }, pt, ev.year);
                out = [...out.filter((e) => e.mood !== 'PROH'), w];
                Object.assign(p, { neg: s.neg, marker: w.id });
                made.push(w.id);
            } else if (ev.step === 'proh-retained') {
                const old = out.find((e) => e.id === ev.sourceId);
                if (!old?.form?.length) continue;
                const w = makeMoodWord('PROH', old.form, [old], pt, ev.year, NOTE['proh-retained'][1]);
                out = [...out.filter((e) => e.mood !== 'PROH'), w];
                Object.assign(p, { neg: 'retained', marker: w.id });
                made.push(w.id);
            } else if (ev.step === 'proh-levelled') {
                out = out.filter((e) => e.mood !== 'PROH');
                Object.assign(p, { neg: 'normal', marker: null, strategy: null });
            } else if (ev.step === 'proh-verb') {
                if (ev.to[0] === 'N') p.verb = 'imperative';
                else p.verb = specialVerb(out, paradigm, !!m.irrealis.series, m.imperative);
                if (p.verb === 'imperative') continue;
            } else continue;
        } else if (ev.system === 'irrealis') {
            const i = m.irrealis;
            if (ev.step === 'hort-rise') {
                const src = out.find((e) => e.id === ev.sourceId && !e.retired);
                if (!src?.form?.length) continue;
                const h = HORTATIVE_SOURCES.find((s) => s.gloss === src.gloss);
                const w = makeMoodWord('HORT', weakened(src.form, pt), [src], pt, ev.year, h?.attested || '');
                out = [...out.filter((e) => e.mood !== 'HORT'), w];
                i.hortative = w.id;
                made.push(w.id);
            } else if (ev.step === 'hort-lost') {
                out = out.filter((e) => e.mood !== 'HORT');
                i.hortative = null;
            } else if (ev.step === 'irr-bond' || ev.step === 'sbjv-rise') {
                const src = ev.step === 'irr-bond' ? out.find((e) => e.mood === 'HORT') : out.find((e) => e.id === ev.sourceId);
                if (!src?.form?.length || !persons.length) continue;
                const position = affixPosition(pt);
                const morph = reduce(src.form, pt, position);
                const n = addCells((cls, cellMap) => persons.map((p) => {
                    const base = cellMap.get(`PRS.${p}`)?.form;
                    return [`IRR.${p}`, base ? repairHiatus(position === 'suffix' ? [...base, ...morph] : [...morph, ...base], pt) : null];
                }), { grammaticalisedFrom: { lexeme: src.id, gloss: src.gloss, year: ev.year, cline: ev.step === 'irr-bond' ? 'optative-from-hortative' : 'subjunctive-from-subordinator', attested: ev.attested } });
                if (!n) continue;
                if (ev.step === 'irr-bond') { out = out.filter((e) => e.mood !== 'HORT'); i.hortative = null; }
                i.series = ev.step === 'irr-bond' ? 'OPT' : 'SBJV';
            } else if (ev.step === 'irr-generalised') {
                if (i.series !== 'OPT') continue;
                i.series = 'SBJV';
            } else if (ev.step === 'opt-lost' || ev.step === 'sbjv-lost') {
                dropCells((c) => slotOf(c) === 'IRR');
                i.series = null;
                // "don't" keeps a special verb form: another one takes over
                if (m.prohibitive.verb === 'irrealis') m.prohibitive.verb = specialVerb(out, paradigm, false, m.imperative);
                if (m.imperative && m.imperative.sg === 'irrealis') m.imperative.sg = 'indicative';
                if (m.imperative && m.imperative.pl === 'irrealis') m.imperative.pl = 'indicative';
            } else continue;
        } else continue;
        if (ok) applied.push(ev);
    }
    // --- sync: what sound change has merged away -----------------------------------------
    const year = events?.length ? events[events.length - 1].year : null;
    const merged = (system, note) => applied.push({ kind: 'mood', system, step: 'merged', year, note, attested: 'a form worn into another by sound change is lost' });
    const table = verbTable(out);
    const regular = [...table.entries()].filter(([cls]) => !isIrregularClass(cls));
    const everywhere = (pred) => regular.length > 0 && regular.every(([, cellMap]) => pred(cellMap));
    if (m.imperative) {
        const partnerOf = (cellMap, cell) => {
            const e = cellMap.get(cell);
            if (!e) return null;
            for (const [name, x] of cellMap) if (name !== cell && slotOf(name) !== 'IMP' && name.split('.').slice(1).join('.') === cell.split('.').slice(1).join('.') && sameForm(x.form, e.form)) return slotOf(name);
            return null;
        };
        for (const cell of ['IMP.2SG', 'IMP.2PL']) {
            if (!regular.some(([, cm]) => cm.has(cell))) continue;
            if (everywhere((cm) => !cm.has(cell) || !!partnerOf(cm, cell))) {
                const via = regular.map(([, cm]) => partnerOf(cm, cell)).find(Boolean) === 'IRR' ? 'irrealis' : 'indicative';
                dropCells((c) => c === cell);
                if (cell === 'IMP.2SG') m.imperative.sg = via; else m.imperative.pl = via;
                merged('imperative', `the ${cell === 'IMP.2SG' ? 'singular' : 'plural'} command form fell together with another form`);
            }
        }
        if (regular.some(([, cm]) => cm.has('IMP.2PL')) && everywhere((cm) => !cm.has('IMP.2PL') || sameForm(cm.get('IMP.2PL').form, cm.get('IMP.2SG')?.form))) {
            dropCells((c) => c === 'IMP.2PL');
            m.imperative.pl = 'sg';
            merged('imperative', 'the plural command form fell together with the singular');
        }
    }
    if (m.irrealis.series && everywhere((cm) => persons.every((p) => !cm.has(`IRR.${p}`) || sameForm(cm.get(`IRR.${p}`).form, cm.get(`PRS.${p}`)?.form)))) {
        dropCells((c) => slotOf(c) === 'IRR');
        m.irrealis.series = null;
        if (m.prohibitive.verb === 'irrealis') m.prohibitive.verb = specialVerb(out, paradigm, false, m.imperative);
        merged('irrealis', 'the irrealis fell together with the present');
    }
    for (const [kind, holder] of [['PROH', m.prohibitive], ['HORT', m.irrealis]]) {
        const w = out.find((e) => e.mood === kind);
        if (w && !w.form?.length) {
            out = out.filter((e) => e !== w);
            if (kind === 'PROH') Object.assign(holder, { neg: 'normal', marker: null }); else holder.hortative = null;
            merged(kind === 'PROH' ? 'prohibitive' : 'irrealis', `the ${kind === 'PROH' ? '"don\'t"' : '"let"'} word wore away to nothing`);
        }
    }
    // keep the markers pointing at the words that carry them
    const proh = out.find((e) => e.mood === 'PROH');
    if (proh && m.prohibitive.neg !== 'normal') m.prohibitive.marker = proh.id;
    const hort = out.find((e) => e.mood === 'HORT');
    m.irrealis.hortative = hort ? hort.id : null;
    const same = JSON.stringify(m) === JSON.stringify({ imperative: moods0.imperative, prohibitive: moods0.prohibitive, irrealis: moods0.irrealis });
    if (!applied.length && same && out === entries) return { entries, applied, changed, made, categories: null };
    return { entries: out, applied, changed, made, categories: same ? null : { ...categories, moods: m } };
}

// --- reading the forms (the translator and the measures share these) ----------------------

const cellsOfClass = (state, cls) => state.paradigm?.classes?.[cls]?.cells || {};
/** The largest regular verb class. */
function mainVerbClass(state) {
    let best = null;
    for (const [cls, c] of Object.entries(state.paradigm?.classes || {})) {
        if (c.pos !== 'v' || isIrregularClass(cls)) continue;
        if (!best || (c.members ?? 0) > (state.paradigm.classes[best].members ?? 0)) best = cls;
    }
    return best;
}

/** The cell a command uses: { cell } or null for the bare verb. */
export function commandCell(state, cls, { addressee = 'SG', polite = null } = {}) {
    const m = state.paradigm?.categories?.moods;
    const cells = cellsOfClass(state, cls);
    const has = (c) => !!cells[c];
    // a polite "you" from "he", "she" or "they" takes the jussive: cante usted, singen Sie
    if (polite && /^3/.test(polite.person)) {
        for (const c of [`IRR.${polite.person}`, `PRS.${polite.person}`]) if (has(c)) return c;
    }
    const pl = addressee === 'PL' || (polite && polite.person === '2PL');
    const imp = m?.imperative;
    if (!imp) return has(`PRS.2${pl ? 'PL' : 'SG'}`) ? `PRS.2${pl ? 'PL' : 'SG'}` : null;
    const via = pl ? imp.pl : imp.sg;
    const want = pl ? (via === 'own' ? 'IMP.2PL' : via === 'sg' ? 'IMP.2SG' : via === 'irrealis' ? 'IRR.2PL' : 'PRS.2PL')
        : (via === 'own' ? 'IMP.2SG' : via === 'irrealis' ? 'IRR.2SG' : 'PRS.2SG');
    if (has(want)) return want;
    for (const c of [pl ? 'IMP.2PL' : 'IMP.2SG', pl ? 'PRS.2PL' : 'PRS.2SG']) if (has(c)) return c;
    return null;
}

/** "Don't!": the verb's cell (null for the bare stem) and how "not" is said. */
export function prohibitiveForm(state, cls, opts = {}) {
    const m = state.paradigm?.categories?.moods;
    const p = m?.prohibitive || { neg: 'normal', verb: 'imperative' };
    const cells = cellsOfClass(state, cls);
    const pl = opts.addressee === 'PL';
    const command = commandCell(state, cls, opts);
    /**
     * After a "don't" auxiliary too the verb is in the form the language
     * settled on: its command form (Finnish älä laula beside laula! "sing!"),
     * or a special one (Latin nōlī cantāre, the infinitive), found as below.
     * Always the bare stem, the choice went unseen wherever commands are bare
     * stems, as most are: 24% of Andah's prohibitives had a special verb
     * against WALS 71A's 40%.
     */
    if (p.verb === 'imperative') return { cell: command, neg: p.neg, marker: p.marker, strategy: p.strategy };
    /**
     * A special verb form is special only while it differs from the command:
     * the one the language settled on, else the next that still differs
     * (irrealis, bare stem, present), as a "don't" form sound change has
     * worn into the command is replaced by speakers with another.
     */
    const n = pl ? 'PL' : 'SG';
    const stemForm = (state.entries || []).find((e) => e.id === state.paradigm?.classes?.[cls]?.exemplarId)?.form;
    const formOf = (c) => (c ? cells[c]?.form : stemForm);
    const cmdForm = formOf(command);
    const options = { irrealis: cells[`IRR.2${n}`] ? `IRR.2${n}` : undefined, bare: null, indicative: cells[`PRS.2${n}`] ? `PRS.2${n}` : undefined };
    const order = [p.verb, 'irrealis', 'bare', 'indicative'].filter((k, i, a) => a.indexOf(k) === i && options[k] !== undefined);
    for (const k of order) {
        const f = formOf(options[k]);
        if (f?.length && !sameForm(f, cmdForm)) return { cell: options[k], neg: p.neg, marker: p.marker, strategy: p.strategy, verb: k };
    }
    return { cell: command, neg: p.neg, marker: p.marker, strategy: p.strategy };
}

/** A wish or a "let him": the irrealis cell for a person, where there is one. */
export function irrealisCell(state, cls, person) {
    const c = `IRR.${person}`;
    return cellsOfClass(state, cls)[c] ? c : null;
}

/** The label a gloss gives a mood cell: IMP, OPT.3SG, SBJV.2SG. */
export function cellLabel(cats, cell) {
    const slot = slotOf(cell);
    const rest = cell.split('.').slice(1).join('.');
    if (slot === 'IMP') return cats?.moods?.imperative?.pl === 'sg' ? 'IMP' : rest === '2PL' ? 'IMP.PL' : 'IMP.SG';
    if (slot === 'IRR') return `${cats?.moods?.irrealis?.series === 'OPT' ? 'OPT' : 'SBJV'}.${rest}`;
    return cell;
}

// --- measures (typology: WALS 70A, 71A, 73A) ----------------------------------------------

/** WALS 70A for a language: the commonest value over its regular verb classes, by membership. */
export function imperativeValue(state) {
    const cats = state.paradigm?.categories;
    if (!cats?.moods?.imperative) return 'none';
    const weights = new Map();
    for (const [cls, c] of Object.entries(state.paradigm.classes || {})) {
        if (c.pos !== 'v' || isIrregularClass(cls)) continue;
        const cells = new Map(Object.entries(c.cells || {}).map(([k, v]) => [k, v]));
        const sg = cells.get('IMP.2SG'), pl = cells.get('IMP.2PL');
        const sgD = !!sg && dedicated(cells, 'IMP.2SG', sg.form);
        const plD = !!pl && dedicated(cells, 'IMP.2PL', pl.form) && !sameForm(pl.form, sg?.form);
        const v = sgD && plD ? IMPERATIVE_VALUES[0] : sgD && cats.moods.imperative.pl === 'sg' ? IMPERATIVE_VALUES[1] : sgD ? IMPERATIVE_VALUES[2] : plD ? IMPERATIVE_VALUES[3] : IMPERATIVE_VALUES[4];
        weights.set(v, (weights.get(v) || 0) + Math.max(1, c.members ?? 1));
    }
    if (!weights.size) return 'none';
    return [...weights.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/** WALS 71A for a language. */
export function prohibitiveValue(state) {
    const cats = state.paradigm?.categories;
    const p = cats?.moods?.prohibitive;
    if (!p) return PROHIBITIVE_VALUES[0];
    const entries = state.entries || [];
    const marker = entries.find((e) => e.id === p.marker);
    const not = live(entries, 'not');
    const specialNeg = p.neg !== 'normal' && !!marker?.form?.length && (p.neg === 'retained' || !not || !sameForm(marker.form, not.form));
    let specialVerb = false;
    const cls = mainVerbClass(state);
    // WALS 71A asks whether the verb is in its command form; after a "don't"
    // auxiliary as anywhere else, prohibitiveForm says which form it takes
    if (cls && p.verb !== 'imperative') {
        const cells = cellsOfClass(state, cls);
        const cmd = commandCell(state, cls);
        const cmdForm = cmd ? cells[cmd]?.form : entries.find((e) => e.id === state.paradigm.classes[cls].exemplarId)?.form;
        const pf = prohibitiveForm(state, cls);
        const prForm = pf.cell ? cells[pf.cell]?.form : entries.find((e) => e.id === state.paradigm.classes[cls].exemplarId)?.form;
        specialVerb = !!cmdForm && !!prForm && !sameForm(cmdForm, prForm);
    }
    return PROHIBITIVE_VALUES[(specialVerb ? 2 : 0) + (specialNeg ? 1 : 0)];
}

/** WALS 73A: an optative of the verb's own, apart from the present. */
export function optativeValue(state) {
    const cats = state.paradigm?.categories;
    if (cats?.moods?.irrealis?.series !== 'OPT') return 'absent';
    const cls = mainVerbClass(state);
    const cells = cls ? cellsOfClass(state, cls) : {};
    return verbPersons(cats).some((p) => cells[`IRR.${p}`] && !sameForm(cells[`IRR.${p}`].form, cells[`PRS.${p}`]?.form)) ? 'present' : 'absent';
}

export const moodValues = (state) => ({ imperative: imperativeValue(state), prohibitive: prohibitiveValue(state), optative: optativeValue(state) });

/** One line for notes and the panel. */
export function describeMoods(cats) {
    const m = cats?.moods;
    if (!m) return '';
    const imp = imperativeState(m.imperative);
    const parts = [{ B: 'commands for one and for several', N: 'one command form for one or several', S: 'a command form for one, the present for several', P: 'a command form for several only', Z: 'commands with the ordinary verb' }[imp]];
    parts.push(m.prohibitive.neg === 'normal' ? '"don\'t" with "not"' : m.prohibitive.neg === 'auxiliary' ? '"don\'t" with a verb of its own' : m.prohibitive.neg === 'retained' ? '"don\'t" with the old word for "not"' : '"don\'t" with a word of its own');
    if (m.prohibitive.verb === 'irrealis') parts.push('the subjunctive after "don\'t"');
    if (m.irrealis.series === 'OPT') parts.push('an optative for wishes');
    else if (m.irrealis.series === 'SBJV') parts.push('a subjunctive');
    else if (m.irrealis.hortative) parts.push('a word for "let"');
    return parts.join(', ');
}
