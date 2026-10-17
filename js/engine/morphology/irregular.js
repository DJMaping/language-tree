/**
 * Irregular verbs and nouns, and suppletion (17 Oct 2026, DJ: "I do want
 * these to be incredibly complicated like languages").
 *
 * IRREGULARITY IS HISTORY. English sing/sang/sung and foot/feet are what
 * sound change left in a verb and a noun used so often that no speaker ever
 * rebuilt them from the regular pattern; the rarer strong verbs and umlaut
 * plurals were levelled (helped for holp, books for bēc). So the engine gives
 * the commonest verbs and nouns a paradigm of their OWN, their whole
 * inflected forms carried through every sound change like any other cell,
 * starting regular (with the endings of the class they would otherwise
 * belong to) and drifting as stress, length and neighbouring sounds treat
 * them differently from the class exemplar. Frequency makes them immune to
 * levelling (analogy.js), which is why their alternations survive while the
 * regular classes' are smoothed away. Isolating languages have nothing to be
 * irregular in, as Mandarin has none.
 *
 * SUPPLETION is a paradigm patched from two words: English go/went (went was
 * the past of wend), French aller/vais/irai (three verbs), Spanish ser/fue,
 * Russian čelovek/ljudi "person/people". It concentrates in the same few
 * meanings everywhere ("be", "go", "come", "say", "see", "eat"; Veselinova
 * 2006), and about a third of Earth's languages have some in tense or aspect
 * (WALS 79A). Here a tense of an irregular verb, or the plural of
 * "person", is taken over from a neighbour in meaning.
 */

import { wordToIpa } from '../features.js';
import { SUPPLETION_CANDIDATES } from '../lexicon/roots.js';
import { inflect } from '../text/sentence.js';
import { isParadigmEntry, parseCellId, cellIdOf, isIrregularClass } from './paradigm.js';
import { syllabify } from '../phonology/phonotactics.js';

/** The verbs with paradigms of their own: the commonest, as on Earth. */
export const IRREGULAR_VERBS = SUPPLETION_CANDIDATES;
/** And the nouns (English man/men, child/children, foot/feet, tooth/teeth; person/people). */
export const IRREGULAR_NOUNS = ['man (human)', 'woman', 'child', 'person', 'eye', 'tooth', 'foot'];

export { isIrregularClass };

/**
 * Give each common verb and noun its own class. Its old class is kept as
 * `baseClass`, so the paradigm builder can give it that class's endings.
 */
export function markIrregulars(entries) {
    const taken = new Set();
    const assign = (glosses, pos, prefix) => {
        let n = 0;
        const ids = new Map();
        for (const g of glosses) {
            const e = entries.find((x) => x.gloss === g && x.pos === pos && !x.retired && !x.paradigm && x.class && !x.derivedFrom && !taken.has(x.id));
            if (!e) continue;
            taken.add(e.id);
            n += 1;
            ids.set(e.id, `${prefix}x${n}`);
        }
        return ids;
    };
    const own = new Map([...assign(IRREGULAR_VERBS, 'v', 'v'), ...assign(IRREGULAR_NOUNS, 'n', 'n')]);
    if (!own.size) return entries;
    return entries.map((e) => (own.has(e.id) ? { ...e, baseClass: e.class, class: own.get(e.id), irregular: true } : e));
}

/**
 * Where suppletive forms come from: the attested donors for each meaning
 * (Veselinova 2006), commonest first, among the words the lexicon has.
 */
export const SUPPLETION_SOURCES = {
    go: { from: ['walk', 'leave', 'travel', 'be'], attested: 'English went, once the past of wend; French vais from Latin vadere "hurry", irai from ire; Spanish fue, the past of ser "be"' },
    be: { from: ['stand', 'stay', 'live', 'sit', 'become'], attested: 'Spanish estar from Latin stare "stand"; English was from wesan "dwell, remain"; Latin fui from *bʰuH- "grow, become"' },
    come: { from: ['arrive', 'go'], attested: 'the verbs of coming and going lend each other forms (Veselinova): Old Irish tic "comes", tānic "came"' },
    say: { from: ['speak', 'tell', 'talk'], attested: 'Russian govorit\' "say" with its perfective skazat\'; Greek légō "I say", eîpon "I said"' },
    see: { from: ['know'], attested: 'Greek horáō "I see", eîdon "I saw", the root of oîda "I know"' },
    eat: { from: ['bite'], attested: 'Latin edo with comedo; the verbs of eating change root more than most (Veselinova)' },
    give: { from: ['bring'], attested: 'Georgian "give" takes a different root by the person receiving it' },
    do: { from: ['make'], attested: 'Latin facio "make, do" supplied the forms of fio "become, be done"' },
    have: { from: ['hold'], attested: 'Spanish tener "have" from Latin tenere "hold", beside haber' },
    person: { from: ['people'], number: true, attested: 'English person/people, Russian čelovek/ljudi, Latin homo with gentes' },
    'man (human)': { from: ['people'], number: true, attested: 'Russian čelovek "man, person" with ljudi "people"' },
};

/** Per thousand years, scaled by the branch rate. */
const TENSE_SUPPLETION = 0.1;
const NUMBER_SUPPLETION = 0.03;

/**
 * Plan a lifetime's suppletion: now and then a tense of a common verb, or
 * the plural of "person", is taken from a neighbour in meaning. Dated events.
 */
export function planSuppletion(state, rng, { from, to, rate = 1 } = {}) {
    const cats = state.paradigm?.categories;
    const classes = state.paradigm?.classes || {};
    if (!cats || !Object.keys(classes).some(isIrregularClass)) return [];
    const years = Math.max(0, (to ?? from) - from);
    const k = (years / 1000) * rate;
    const live = (state.entries || []).filter((e) => !e.retired && !e.paradigm);
    const byGloss = new Map();
    for (const e of live) if (!byGloss.has(`${e.gloss}|${e.pos}`)) byGloss.set(`${e.gloss}|${e.pos}`, e);
    const events = [];
    const done = new Set((state.entries || []).filter((e) => e.suppletive).map((e) => parseCellId(e.id).cls + '|' + parseCellId(e.id).cell.split('.')[0]));
    const tenses = (cats.tenses || []).slice(1);
    // a tense of a verb
    if (tenses.length && rng.bool(Math.min(0.6, TENSE_SUPPLETION * k))) {
        const verbs = live.filter((e) => e.pos === 'v' && isIrregularClass(e.class) && classes[e.class] && SUPPLETION_SOURCES[e.gloss]);
        if (verbs.length) {
            // "be" and "go" above all (Veselinova)
            const a = rng.pickWeighted(verbs, (e) => (e.gloss === 'be' || e.gloss === 'go' ? 3 : 1));
            const tense = rng.pick(tenses);
            const donors = SUPPLETION_SOURCES[a.gloss].from.map((g) => byGloss.get(`${g}|v`)).filter((e) => e && e.id !== a.id && e.form?.length);
            if (donors.length && !done.has(`${a.class}|${tense}`)) {
                const b = rng.pickWeighted(donors, (x) => 1 / (1 + donors.indexOf(x)));
                events.push({
                    kind: 'suppletion', year: Math.round(from + years * rng.float(0.2, 0.8)), cls: a.class, slot: tense, lexeme: a.id, gloss: a.gloss,
                    donor: b.id, donorGloss: b.gloss, note: `"${a.gloss}" took its ${tense} forms from "${b.gloss}"`, attested: SUPPLETION_SOURCES[a.gloss].attested,
                });
            }
        }
    }
    // the plural of "person"
    if ((cats.numbers || []).includes('PL') && rng.bool(Math.min(0.4, NUMBER_SUPPLETION * k))) {
        const nouns = live.filter((e) => e.pos === 'n' && isIrregularClass(e.class) && classes[e.class] && SUPPLETION_SOURCES[e.gloss]?.number);
        const a = nouns.length ? rng.pick(nouns) : null;
        const b = a ? byGloss.get(`${SUPPLETION_SOURCES[a.gloss].from[0]}|n`) : null;
        if (a && b && b.id !== a.id && !done.has(`${a.class}|PL`)) {
            events.push({
                kind: 'suppletion', year: Math.round(from + years * rng.float(0.2, 0.8)), cls: a.class, slot: 'PL', lexeme: a.id, gloss: a.gloss,
                donor: b.id, donorGloss: b.gloss, note: `"${a.gloss}" took "${b.gloss}" as its plural`, attested: SUPPLETION_SOURCES[a.gloss].attested,
            });
        }
    }
    return events;
}

/**
 * The form a word has in a cell: its own cell where it has a paradigm of its
 * own, else its class's ending on its stem (text/sentence.js inflect).
 */
function formIn(entries, paradigm, entry, cell, phonotactics) {
    const cls = paradigm?.classes?.[entry.class];
    if (!cls) return null;
    const cells = {};
    for (const e of entries) {
        if (!isParadigmEntry(e)) continue;
        const p = parseCellId(e.id);
        if (p.cls === entry.class) cells[p.cell] = { form: e.form };
    }
    if (!cells[cell]) return null;
    return inflect(entry, cell, { paradigm: { classes: { [entry.class]: { ...cls, cells } } }, entries, phonotactics });
}

/**
 * Apply a lifetime's suppletion: the cells of the slot are rewritten with
 * the donor's forms in the same cells (for a noun's plural, the donor's
 * singular). Every rewrite is returned for the derivation.
 */
export function applySuppletion(entries, events, { phonotactics, paradigm } = {}) {
    if (!events?.length) return { entries, applied: [], changed: [] };
    let out = entries.slice();
    const applied = [];
    const changed = [];
    for (const ev of events) {
        const donor = out.find((e) => e.id === ev.donor);
        if (!donor?.form?.length) continue;
        let n = 0;
        out = out.map((e) => {
            if (!isParadigmEntry(e)) return e;
            const { cls, cell } = parseCellId(e.id);
            if (cls !== ev.cls) return e;
            const parts = cell.split('.');
            const inSlot = ev.slot === 'PL' ? parts[parts.length - 1] === 'PL' : parts[0] === ev.slot;
            if (!inSlot) return e;
            const donorCell = ev.slot === 'PL' ? [...parts.slice(0, -1), 'SG'].join('.') : cell;
            const form = formIn(out, paradigm, donor, donorCell, phonotactics);
            if (!form?.length) return e;
            n += 1;
            changed.push({ id: e.id, before: e.form, after: form, label: `suppletion: the form of "${ev.donorGloss}"`, year: ev.year });
            return { ...e, form, ipa: wordToIpa(form), suppletive: { from: ev.donorGloss, year: ev.year } };
        });
        if (n) applied.push({ ...ev, cells: n });
    }
    return { entries: out, applied, changed };
}

/**
 * Keep the irregular set where the frequency is. When another word takes
 * over one of the commonest meanings (lexical replacement, or a sense shift),
 * the old word's own paradigm goes with it, and the new carrier, now as
 * frequent as the old one was, gets a paradigm of its own, regular to begin
 * with: it will drift as the old one did. Without this, every replaced "go"
 * or "eye" left the language one irregular word fewer, and after five
 * thousand years most languages had none.
 */
export function renewIrregulars(entries, { paradigm, phonotactics } = {}) {
    if (!paradigm?.classes) return { entries, made: [] };
    let out = entries;
    const made = [];
    const byId = new Map(out.map((e) => [e.id, e]));
    // the own paradigms of words that no longer carry anything
    const stale = new Set();
    for (const e of out) {
        if (!isParadigmEntry(e)) continue;
        const { cls } = parseCellId(e.id);
        if (!isIrregularClass(cls)) continue;
        const owner = byId.get(e.paradigm?.stem);
        if (!owner || owner.retired) stale.add(cls);
    }
    if (stale.size) out = out.filter((e) => !(isParadigmEntry(e) && stale.has(parseCellId(e.id).cls)));
    const numbers = (prefix) => [...new Set([...out.filter(isParadigmEntry).map((e) => parseCellId(e.id).cls), ...Object.keys(paradigm.classes)])]
        .filter((c) => c.startsWith(`${prefix}x`)).map((c) => Number(c.slice(2))).filter(Number.isFinite);
    for (const [glosses, pos] of [[IRREGULAR_VERBS, 'v'], [IRREGULAR_NOUNS, 'n']]) {
        for (const g of glosses) {
            const carrier = out.find((e) => e.gloss === g && e.pos === pos && !e.retired && !e.paradigm);
            if (!carrier || !carrier.class || isIrregularClass(carrier.class) || !carrier.form?.length) continue;
            const base = carrier.class;
            const cells = out.filter((e) => isParadigmEntry(e) && parseCellId(e.id).cls === base).map((e) => parseCellId(e.id).cell);
            if (!cells.length || !paradigm.classes[base]) continue;
            const n = Math.max(0, ...numbers(pos)) + 1;
            const cls = `${pos}x${n}`;
            const fresh = [];
            for (const cell of cells) {
                const form = formIn(out, paradigm, carrier, cell, phonotactics);
                if (!form?.length) continue;
                fresh.push({
                    id: cellIdOf(cls, cell), form, ipa: wordToIpa(form), gloss: `${carrier.gloss}.${cell}`, pos, domain: 'grammar', core: true,
                    rank: Math.max(1, carrier.rank ?? 1), zipf: 0, class: cls, syllables: syllabify(form, phonotactics).length, irregular: true,
                    derivedFrom: null, paradigm: { cls, cell, stem: carrier.id, stemGloss: carrier.gloss },
                });
            }
            if (!fresh.length) continue;
            out = [...out.map((e) => (e === carrier ? { ...e, class: cls, baseClass: base, irregular: true } : e)), ...fresh];
            made.push({ cls, gloss: g, lexeme: carrier.id, cells: fresh.length });
        }
    }
    return { entries: out, made, dropped: [...stale] };
}

/** Does this language have suppletion anywhere in its live paradigms? */
export const hasSuppletion = (entries) => (entries || []).some((e) => e.suppletive && isParadigmEntry(e));
