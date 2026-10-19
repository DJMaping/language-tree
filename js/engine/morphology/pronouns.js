/**
 * Two kinds of "we", and a polite "you" (17 Oct 2026, DJ: "I do want these to
 * be incredibly complicated like languages").
 *
 * INCLUSIVE AND EXCLUSIVE. About a third of Earth's languages have two words
 * for "we" (WALS 39A, Cysouw: 68 of 200): one that takes in the person spoken
 * to ("you and I": Tagalog tayo, Malay kita, Tamil nām, northern Mandarin
 * zánmen) and one that leaves them out ("they and I": kami, kami, nāṅkaḷ,
 * wǒmen). The distinction is old where it is found (Austronesian, Dravidian,
 * Australia, much of the Americas) and new ones are built from "you" and "I":
 * Tok Pisin says yumi beside mipela. It can be lost too, by one word taking
 * both senses, as colloquial Indonesian kita has.
 *
 * A POLITE "YOU". About a third of Earth's languages have one (WALS 45A,
 * Helmbrecht: 71 of 207), and it is nearly always borrowed from elsewhere
 * (Brown and Gilman 1960): the plural (French vous, Russian vy, Turkish siz),
 * "they" (German Sie), "she" (Italian Lei, once "Your Lordship"), or a noun of
 * respect worn into a pronoun (Spanish usted from vuestra merced "your grace",
 * Portuguese você, Polish pan "lord", Thai khun). A polite word takes the verb
 * of the person it came from: vous venez, Sie kommen, usted viene. These
 * systems come and go within centuries. English gave up the distinction by
 * making the polite you the only one; Swedes gave up ni for du in the 1960s;
 * Spanish vos, once polite, sank to a familiar form, usted (vuestra merced)
 * took its place, and vos lives on as the familiar "you" in much of the
 * Americas.
 *
 * Both are kept as words in the lexicon ("we (inclusive)", "you (polite)").
 * Where a language makes no such distinction the word is the same word as
 * "we" or "you" (sameWordAs), as "she" is the same word as "he" in a language
 * without gender (gender.js). The settings sit in
 * paradigm.categories.pronouns.
 */

import { wordToIpa } from '../features.js';
import { repairHiatus, syllabify } from '../phonology/phonotactics.js';
import { isParadigmEntry, parseCellId, cellIdOf } from './paradigm.js';
import { reduce } from './grammaticalisation.js';
import { subjectAgreement } from './type-measure.js';

/** Where a polite "you" comes from, how often (Helmbrecht's sample, roughly) and the verb it takes. */
export const POLITE_STRATEGIES = {
    plural: { label: 'the plural "you"', from: 'you (pl)', person: '2PL', weight: 0.45, attested: 'French vous, Russian вы, Turkish siz, Finnish te' },
    noun: { label: 'a noun of respect', from: null, person: '3SG', weight: 0.3, attested: 'Spanish usted from vuestra merced "your grace", Portuguese você, Polish pan "lord", Thai khun' },
    they: { label: '"they"', from: 'they', person: '3PL', weight: 0.15, attested: 'German Sie, Danish De' },
    she: { label: '"she"', from: 'she', person: '3SG', weight: 0.1, attested: 'Italian Lei, once "Your Lordship" (Vostra Signoria)' },
};
/** The nouns a polite pronoun grows from, commonest first. */
const RESPECT_NOUNS = ['lord', 'honour', 'elder', 'teacher', 'chief', 'guest'];

const live = (entries, gloss) => entries.find((e) => e.gloss === gloss && !e.retired && !e.paradigm) || null;

/** The proto's pronoun system: drawn, or declared in lang-config. */
export function drawPronounSpec(rng, declared = {}) {
    const clusivity = declared.clusivity ?? rng.bool(0.33);
    const drawn = rng.bool(0.3) ? rng.pickWeighted(Object.keys(POLITE_STRATEGIES), (k) => POLITE_STRATEGIES[k].weight) : null;
    const polite = declared.polite === undefined ? drawn : declared.polite === 'none' ? null : declared.polite;
    const reasons = [
        clusivity ? 'two words for "we", with and without the listener, as a third of Earth\'s languages have' : 'one "we"',
        polite ? `a polite "you" from ${POLITE_STRATEGIES[polite].label}` : 'no polite "you"',
    ];
    return { spec: { clusivity, polite }, reason: `${reasons.join('; ')}${declared.clusivity != null || declared.polite !== undefined ? ' (set in lang-config)' : ''}` };
}

/** `entry` made into the same word as `src`. */
const same = (entry, src) => ({ ...entry, form: src.form, ipa: src.ipa, syllables: src.syllables, sameWordAs: src.sameWordAs ?? src.id, class: src.class, builtFrom: null, grammaticalisedFrom: null });

/** A noun worn into a pronoun (usted, pan, khun). */
const fromNoun = (entry, noun, year) => ({
    ...entry, form: noun.form, ipa: noun.ipa, syllables: noun.syllables, sameWordAs: null, builtFrom: null,
    grammaticalisedFrom: { lexeme: noun.id, gloss: noun.gloss, year, cline: 'polite-pronoun', attested: POLITE_STRATEGIES.noun.attested },
});

/** "You and I" fused into an inclusive "we" (Tok Pisin yumi). */
function inclusiveFrom(entry, you, me, pt) {
    const form = repairHiatus([...you.form, ...me.form], pt);
    return { ...entry, form, ipa: wordToIpa(form), syllables: syllabify(form, pt).length, sameWordAs: null, builtFrom: [you.gloss, me.gloss], grammaticalisedFrom: null };
}

/** The noun a polite pronoun grows from in this lexicon, if any. */
function respectNoun(entries, rng) {
    const avail = RESPECT_NOUNS.map((g) => entries.find((e) => e.gloss === g && e.pos === 'n' && !e.retired && !e.paradigm && e.form?.length)).filter(Boolean);
    return avail.length ? rng.pickWeighted(avail, (x) => 1 / (1 + avail.indexOf(x))) : null;
}

/**
 * Set the proto's pronouns to its spec: "we (inclusive)" a word of its own or
 * the same word as "we", "you (polite)" the same word as its source or as
 * "you (sg)". Returns { entries, system }.
 */
export function buildPronounSystem(entries, spec, rng) {
    if (!spec) return { entries, system: null };
    const we = live(entries, 'we'), incl = live(entries, 'we (inclusive)');
    const you = live(entries, 'you (sg)'), pol = live(entries, 'you (polite)');
    let strategy = spec.polite;
    let noun = null;
    if (strategy === 'noun') { noun = respectNoun(entries, rng); if (!noun) strategy = 'plural'; }
    const source = strategy && strategy !== 'noun' ? live(entries, POLITE_STRATEGIES[strategy].from) : null;
    if (strategy && strategy !== 'noun' && !source) strategy = null;
    const out = entries.map((e) => {
        if (e === incl && we && !spec.clusivity) return same(e, we);
        if (e === pol) {
            if (strategy === 'noun') return fromNoun(e, noun, null);
            if (strategy) return same(e, source);
            if (you) return same(e, you);
        }
        return e;
    });
    return {
        entries: out,
        system: {
            clusivity: !!(spec.clusivity && incl),
            polite: strategy && pol ? { strategy, person: POLITE_STRATEGIES[strategy].person, sourceGloss: noun?.gloss ?? POLITE_STRATEGIES[strategy].from, since: null } : null,
        },
    };
}

// --- the agreement cycle -----------------------------------------------------------------

/**
 * THE AGREEMENT CYCLE (Givón 1976: today's morphology is yesterday's
 * syntax). Where the verb no longer says who its subject is (an isolating
 * language, or one whose person endings wore down: Old French had six,
 * spoken French has three), the unstressed subject pronouns lean on a
 * neighbour and become clitics: on the verb (French je, tu, il), on the
 * tense word before it (Hausa naa "I.PERF", kaa "you.PERF", the subject
 * markers of Oceanic and Kwa: WALS 101A's pronouns "in another position",
 * 9% of Earth), or after the first word of the clause wherever the order is
 * free (Warlpiri, Polish -śmy, Uto-Aztecan: clitics "on a variable host",
 * 5%). Clitics on the verb, and in time those on a tense word, fuse with it
 * into new person markers: before the stem where the pronoun stood before
 * the verb (the Bantu subject prefixes, French j'parle on its way), after
 * it where it followed (German du liebst, whose -st is an old "thou").
 * Andah's person endings wore away with nothing to renew them: a third of
 * its languages could not tell their persons apart.
 */
export const SUBJECT_HOSTS = {
    verb: { label: 'on the verb', attested: 'French je, tu, il, unstressed and never apart from the verb' },
    aux: { label: 'on the tense word before the verb', attested: 'Hausa naa "I (perfective)", kaa "you"; the subject markers of the Oceanic and Kwa languages' },
    second: { label: 'after the first word of the clause', attested: 'Warlpiri ngaju ka-rna "I (present)-1SG"; Polish my-śmy byli; the second-position clitics of Uto-Aztecan' },
};
/**
 * Per thousand years. A matter of centuries where endings wore away: French
 * pronouns turned obligatory clitics in the 1300s and 1400s, as the endings
 * went, and are fusing now; German's -st took a few hundred years. Rare
 * where the language never had endings (Chinese kept its free pronouns), and
 * slow on a tense word (the Bantu subject and tense prefixes) or in second
 * position (Polish -śmy is becoming an ending). At 0.35 and 0.4, 22% of
 * Andah was left with worn agreement and obligatory pronouns (Earth 12%).
 */
const CLITIC_RISE = { worn: 0.8, isolating: 0.12 };
const CLITIC_FUSE = { verb: 0.8, aux: 0.05, second: 0.15 };
const CLITIC_LOST = 0.05;
const PERSON_GLOSS = { '1SG': 'I', '2SG': 'you (sg)', '3SG': 'he', '1PL': 'we', '2PL': 'you (pl)', '3PL': 'they' };

/** What a subject pronoun leans on: the first word where the order is free, else the verb or, without endings, the tense word. */
function hostFor(state, rng) {
    const s = state.syntax || {};
    if (s.dominant === false || s.freedom === 'free') return 'second';
    if (s.headFinal && rng.bool(0.5)) return 'second';
    return state.paradigm?.categories?.type === 'isolating' ? 'aux' : 'verb';
}

/** Which side a fused subject clitic ends up: where the pronoun stood (before the verb in SVO), a tense word's side, or after the verb from second position (Polish byli-śmy). */
const fusedSide = (host, order) => (host === 'second' ? 'suffix' : host === 'aux' || order === 'SVO' || order === 'OSV' ? 'prefix' : 'suffix');

/**
 * Subject clitics fused with the verb: every verb form of every class takes
 * its person's marker, the pronoun reduced, on the side the pronoun stood (a
 * command, which has no subject to mark, is left as it is); a verb class
 * with no forms yet, in a language without endings, gets a present of six.
 */
export function fuseSubject(entries, { position, year, attested }, pt) {
    const markers = {};
    for (const [p, g] of Object.entries(PERSON_GLOSS)) {
        const w = live(entries, g);
        markers[p] = w?.form?.length ? reduce(w.form, pt, 'prefix') : [];
    }
    if (!Object.values(markers).some((m) => m.length)) return null;
    const join = (form, p) => {
        const m = markers[p] || [];
        return m.length ? repairHiatus(position === 'prefix' ? [...m, ...form] : [...form, ...m], pt) : form;
    };
    const from = (p) => ({ lexeme: live(entries, PERSON_GLOSS[p])?.id ?? null, gloss: PERSON_GLOSS[p], year, cline: 'agreement-from-pronoun', attested });
    const changed = [];
    let out = entries.map((e) => {
        if (!isParadigmEntry(e) || e.retired) return e;
        const { cls, cell } = parseCellId(e.id);
        const [slot, rest = ''] = cell.split('.');
        if (cls[0] !== 'v' || slot === 'IMP') return e;
        const p = rest.split('>')[0];
        if (!markers[p]?.length) return e;
        const form = join(e.form, p);
        changed.push({ id: e.id, before: e.form, after: form, label: `the subject clitic "${PERSON_GLOSS[p]}" fused with the verb`, year });
        return { ...e, form, ipa: wordToIpa(form), syllables: syllabify(form, pt).length };
    });
    const withCells = new Set(out.filter((e) => isParadigmEntry(e) && parseCellId(e.id).cls[0] === 'v').map((e) => parseCellId(e.id).cls));
    const byCls = new Map();
    for (const e of out) {
        if (e.pos !== 'v' || e.retired || e.paradigm || !e.class || e.derivedFrom || !e.form?.length || withCells.has(e.class)) continue;
        if (!byCls.has(e.class)) byCls.set(e.class, []);
        byCls.get(e.class).push(e);
    }
    const made = [];
    for (const [cls, members] of byCls) {
        // the exemplar a grammar would print: median length, commonest
        const sylls = members.map((m) => m.syllables ?? 1).sort((a, b) => a - b);
        const median = sylls[Math.floor(sylls.length / 2)];
        const pool = members.filter((m) => (m.syllables ?? 1) === median);
        const ex = (pool.length ? pool : members).reduce((b, m) => ((m.rank ?? 999) < (b.rank ?? 999) ? m : b));
        for (const p of Object.keys(PERSON_GLOSS)) {
            const form = join(ex.form, p);
            made.push({
                id: cellIdOf(cls, `PRS.${p}`), form, ipa: wordToIpa(form), gloss: `${ex.gloss}.PRS.${p}`, pos: 'v', domain: 'grammar', core: true,
                rank: Math.max(1, ex.rank ?? 1), zipf: 0, class: cls, syllables: syllabify(form, pt).length, irregular: false, derivedFrom: null,
                paradigm: { cls, cell: `PRS.${p}`, stem: ex.id, stemGloss: ex.gloss }, grammaticalisedFrom: from(p),
            });
        }
    }
    if (!changed.length && !made.length) return null;
    return { entries: [...out, ...made], changed, made: made.map((e) => e.id) };
}

// --- change ------------------------------------------------------------------------------

/** Per thousand years, scaled by the branch rate. */
const POLITE_RISE = 0.07;
const POLITE_GENERALISED = 0.05;
const POLITE_DROPPED = 0.05;
const POLITE_RENEWED = 0.04;
const INCLUSIVE_RISE = 0.03;
const INCLUSIVE_LOST = 0.04;
const STEP = 250;

/**
 * Plan a lifetime's changes to the pronouns, from the language as founded:
 * a polite "you" arising (from the plural, "they", "she" or a noun of
 * respect), becoming the only "you" (English), giving way to the familiar
 * one (Swedish du), or being renewed from a noun (Spanish usted); an
 * inclusive "we" built from "you" and "I", or lost. Dated events, in order.
 */
export function planPronouns(state, rng, { from, to, rate = 1 } = {}) {
    const cats = state.paradigm?.categories;
    if (!cats) return [];
    const entries = state.entries || [];
    // the polite "you" and the inclusive "we" need their words; the agreement cycle does not
    const words = !!live(entries, 'we (inclusive)') && !!live(entries, 'you (polite)');
    const years = Math.max(0, (to ?? from) - from);
    let pol = cats.pronouns?.polite ?? null;
    let cl = !!cats.pronouns?.clusivity;
    // the agreement cycle: whether the verb names its subject, and the clitics where it does not
    let subj = cats.pronouns?.subject ?? null;
    let worn = !subjectAgreement(state).rich;
    const events = [];
    for (let t = 0; t < years; t += STEP) {
        const dt = Math.min(STEP, years - t);
        const k = (dt / 1000) * rate;
        const year = Math.round(from + t + dt * rng.float(0.2, 0.8));
        if (!words) {
            // nothing to draw for "you (polite)" and "we (inclusive)"
        } else if (!pol) {
            if (rng.bool(POLITE_RISE * k)) {
                let strategy = rng.pickWeighted(Object.keys(POLITE_STRATEGIES), (s) => POLITE_STRATEGIES[s].weight);
                const noun = strategy === 'noun' ? respectNoun(entries, rng) : null;
                if (strategy === 'noun' && !noun) strategy = 'plural';
                events.push({
                    kind: 'pronoun', step: 'polite-rise', year, strategy, sourceId: noun?.id ?? null, sourceGloss: noun?.gloss ?? POLITE_STRATEGIES[strategy].from,
                    note: `${strategy === 'noun' ? `"${noun.gloss}"` : POLITE_STRATEGIES[strategy].label} came into use as a polite "you"`,
                    attested: POLITE_STRATEGIES[strategy].attested,
                });
                pol = { strategy, person: POLITE_STRATEGIES[strategy].person };
            }
        } else {
            const r = rng.next();
            if (r < POLITE_GENERALISED * k) {
                events.push({ kind: 'pronoun', step: 'polite-generalised', year, note: 'the polite "you" became the only "you"',
                    attested: 'English you, once the plural and polite form, displaced thou' });
                pol = null;
            } else if (r < (POLITE_GENERALISED + POLITE_DROPPED) * k) {
                events.push({ kind: 'pronoun', step: 'polite-dropped', year, note: 'the familiar "you" came to be used to everyone; the polite one fell out of use',
                    attested: 'Swedish du replaced ni for nearly everyone in the 1960s' });
                pol = null;
            } else if (r < (POLITE_GENERALISED + POLITE_DROPPED + POLITE_RENEWED) * k && pol.strategy !== 'noun') {
                const noun = respectNoun(entries, rng);
                if (noun) {
                    events.push({ kind: 'pronoun', step: 'polite-rise', year, strategy: 'noun', sourceId: noun.id, sourceGloss: noun.gloss,
                        note: `"${noun.gloss}" became the polite "you" in place of the old one`,
                        attested: 'Spanish usted, from vuestra merced "your grace", took the place of vos' });
                    pol = { strategy: 'noun', person: '3SG' };
                }
            }
        }
        if (!words) {
            // as above
        } else if (!cl && rng.bool(INCLUSIVE_RISE * k)) {
            events.push({ kind: 'pronoun', step: 'inclusive-rise', year, note: '"you" and "I" fused into a "we" that takes in the listener',
                attested: 'Tok Pisin yumi ("you-me") beside mipela; northern Mandarin zánmen beside wǒmen' });
            cl = true;
        } else if (cl && rng.bool(INCLUSIVE_LOST * k)) {
            const keep = rng.bool(0.5) ? 'inclusive' : 'exclusive';
            events.push({ kind: 'pronoun', step: 'inclusive-lost', year, keep,
                note: keep === 'inclusive' ? 'the inclusive "we" came to be used for every "we"' : 'the inclusive "we" fell out of use; one "we" serves for both',
                attested: 'colloquial Indonesian kita, once inclusive only, now often means any "we"' });
            cl = false;
        }
        // the agreement cycle, last, so the draws above are as they were
        if (!subj && worn) {
            if (rng.bool(CLITIC_RISE[cats.type === 'isolating' ? 'isolating' : 'worn'] * k)) {
                const host = hostFor(state, rng);
                events.push({ kind: 'pronoun', step: 'subject-clitic', year, host,
                    note: `the unstressed subject pronouns became clitics ${SUBJECT_HOSTS[host].label}`, attested: SUBJECT_HOSTS[host].attested });
                subj = { stage: 'clitic', host };
            }
        } else if (subj?.stage === 'clitic') {
            const r = rng.next();
            if (r < CLITIC_FUSE[subj.host] * k) {
                const position = fusedSide(subj.host, state.syntax?.order);
                events.push({ kind: 'pronoun', step: 'subject-affix', year, host: subj.host, position,
                    note: `the subject clitics fused with the verb: the persons are marked by ${position}es again`,
                    attested: 'the Bantu subject prefixes (Swahili ni-, u-, a-) were pronouns; German du liebst has an old "thou" in its -st; spoken French j\'parle, tu parles is fusing now' });
                subj = null;
                worn = false;
            } else if (r < (CLITIC_FUSE[subj.host] + CLITIC_LOST) * k) {
                events.push({ kind: 'pronoun', step: 'subject-free', year, note: 'the subject clitics gave way to full pronouns again',
                    attested: 'stressed pronouns used for emphasis become the ordinary ones, and the old clitics fall out of use' });
                subj = null;
            }
        }
    }
    return events;
}

/**
 * Apply a lifetime's pronoun events. Words change in place and every change
 * is returned as { id, before, after, label, year } so the derivation records it.
 */
export function applyPronouns(entries, events, { phonotactics, categories } = {}) {
    let out = entries.slice();
    const changed = [];
    const applied = [];
    const made = [];
    let fused = null;
    let sys = { clusivity: !!categories?.pronouns?.clusivity, polite: categories?.pronouns?.polite ?? null, subject: categories?.pronouns?.subject ?? null };
    const at = (gloss) => out.findIndex((e) => e.gloss === gloss && !e.retired && !e.paradigm);
    const set = (i, next, label, year) => {
        if (i < 0 || next.form === out[i].form && next.sameWordAs === out[i].sameWordAs) { if (i >= 0) out[i] = next; return; }
        changed.push({ id: out[i].id, before: out[i].form, after: next.form, label, year });
        out[i] = next;
    };
    for (const ev of events) {
        const iPol = at('you (polite)'), iYou = at('you (sg)'), iWe = at('we'), iIncl = at('we (inclusive)');
        if (ev.step === 'polite-rise') {
            if (iPol < 0) continue;
            if (ev.strategy === 'noun') {
                const noun = out.find((e) => e.id === ev.sourceId);
                if (!noun?.form?.length) continue;
                set(iPol, fromNoun(out[iPol], noun, ev.year), `"${noun.gloss}" became the polite "you"`, ev.year);
            } else {
                const i = at(POLITE_STRATEGIES[ev.strategy].from);
                if (i < 0) continue;
                set(iPol, same(out[iPol], out[i]), `${POLITE_STRATEGIES[ev.strategy].label} came into use as the polite "you"`, ev.year);
            }
            sys = { ...sys, polite: { strategy: ev.strategy, person: POLITE_STRATEGIES[ev.strategy].person, sourceGloss: ev.sourceGloss, since: ev.year } };
        } else if (ev.step === 'polite-generalised') {
            if (iPol < 0 || iYou < 0 || !sys.polite) continue;
            set(iYou, same(out[iYou], out[iPol]), 'the polite "you" became the only "you"', ev.year);
            sys = { ...sys, polite: null };
        } else if (ev.step === 'polite-dropped') {
            if (iPol < 0 || iYou < 0 || !sys.polite) continue;
            set(iPol, same(out[iPol], out[iYou]), 'the familiar "you" came to be used to everyone', ev.year);
            sys = { ...sys, polite: null };
        } else if (ev.step === 'inclusive-rise') {
            const iMe = at('I');
            if (iIncl < 0 || iYou < 0 || iMe < 0 || sys.clusivity) continue;
            set(iIncl, inclusiveFrom(out[iIncl], out[iYou], out[iMe], phonotactics), '"you" and "I" fused into an inclusive "we"', ev.year);
            sys = { ...sys, clusivity: true };
        } else if (ev.step === 'inclusive-lost') {
            if (iIncl < 0 || iWe < 0 || !sys.clusivity) continue;
            if (ev.keep === 'inclusive') set(iWe, same(out[iWe], out[iIncl]), 'the inclusive "we" came to be used for every "we"', ev.year);
            else set(iIncl, same(out[iIncl], out[iWe]), 'one "we" came to serve with and without the listener', ev.year);
            sys = { ...sys, clusivity: false };
        } else if (ev.step === 'subject-clitic') {
            if (sys.subject) continue;
            sys = { ...sys, subject: { stage: 'clitic', host: ev.host, since: ev.year } };
        } else if (ev.step === 'subject-free') {
            if (!sys.subject) continue;
            sys = { ...sys, subject: null };
        } else if (ev.step === 'subject-affix') {
            if (sys.subject?.stage !== 'clitic') continue;
            const f = fuseSubject(out, ev, phonotactics);
            if (!f) continue;
            out = f.entries;
            changed.push(...f.changed);
            made.push(...f.made);
            fused = ev;
            sys = { ...sys, subject: null };
        } else continue;
        applied.push(ev);
    }
    /**
     * Where the language makes no distinction the two are one word, and stay
     * one: when "we" or "you" is replaced, its alias follows it, as "she"
     * follows "he" (gender.js).
     */
    if (categories?.pronouns) {
        const iWe = at('we'), iIncl = at('we (inclusive)'), iYou = at('you (sg)'), iPol = at('you (polite)');
        if (!sys.clusivity && iWe >= 0 && iIncl >= 0 && out[iIncl].ipa !== out[iWe].ipa) set(iIncl, same(out[iIncl], out[iWe]), 'the same word as "we"', null);
        if (!sys.polite && iYou >= 0 && iPol >= 0 && out[iPol].ipa !== out[iYou].ipa) set(iPol, same(out[iPol], out[iYou]), 'the same word as "you"', null);
    }
    if (!applied.length && !changed.length) return { entries, applied, changed: [], made: [], categories: null };
    /**
     * Fused clitics are the verb's persons now: on the side they stood, in the
     * persons and tenses the verb has (a language that had none has a present
     * of six), and a language that had no endings has begun to inflect.
     */
    const agreement = fused ? {
        persons: categories?.persons?.length ? categories.persons : Object.keys(PERSON_GLOSS),
        personPosition: fused.position,
        tenses: categories?.tenses?.length ? categories.tenses : ['PRS'],
        ...(categories?.type === 'isolating' ? { type: 'agglutinative', typeFrom: { type: 'isolating', year: fused.year, cline: 'agreement-from-pronoun' } } : {}),
    } : {};
    return { entries: out, applied, changed, made, categories: applied.length ? { ...(categories || {}), ...agreement, pronouns: sys } : null };
}

/** One line for notes and reports. */
export function describePronouns(system) {
    if (!system) return '';
    return [system.clusivity ? 'two words for "we" (with and without the listener)' : null,
        system.polite ? `a polite "you" from ${system.polite.strategy === 'noun' ? `"${system.polite.sourceGloss}"` : POLITE_STRATEGIES[system.polite.strategy]?.label}` : null,
        system.subject?.stage === 'clitic' ? `subject pronouns are clitics ${SUBJECT_HOSTS[system.subject.host]?.label}` : null]
        .filter(Boolean).join('; ');
}
