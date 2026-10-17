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
 * Spanish replaced vos with usted, and vos then became familiar again in much
 * of the Americas.
 *
 * Both are kept as words in the lexicon ("we (inclusive)", "you (polite)").
 * Where a language makes no such distinction the word is the same word as
 * "we" or "you" (sameWordAs), as "she" is the same word as "he" in a language
 * without gender (gender.js). The settings sit in
 * paradigm.categories.pronouns.
 */

import { wordToIpa } from '../features.js';
import { repairHiatus, syllabify } from '../phonology/phonotactics.js';

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
            polite: strategy ? { strategy, person: POLITE_STRATEGIES[strategy].person, sourceGloss: noun?.gloss ?? POLITE_STRATEGIES[strategy].from, since: null } : null,
        },
    };
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
    if (!live(entries, 'we (inclusive)') || !live(entries, 'you (polite)')) return [];
    const years = Math.max(0, (to ?? from) - from);
    let pol = cats.pronouns?.polite ?? null;
    let cl = !!cats.pronouns?.clusivity;
    const events = [];
    for (let t = 0; t < years; t += STEP) {
        const dt = Math.min(STEP, years - t);
        const k = (dt / 1000) * rate;
        const year = Math.round(from + t + dt * rng.float(0.2, 0.8));
        if (!pol) {
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
        if (!cl && rng.bool(INCLUSIVE_RISE * k)) {
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
    }
    return events;
}

/**
 * Apply a lifetime's pronoun events. Words change in place and every change
 * is returned as { id, before, after, label, year } so the derivation records it.
 */
export function applyPronouns(entries, events, { phonotactics, categories } = {}) {
    if (!events?.length) return { entries, applied: [], changed: [], categories: null };
    let out = entries.slice();
    const changed = [];
    const applied = [];
    let sys = { clusivity: !!categories?.pronouns?.clusivity, polite: categories?.pronouns?.polite ?? null };
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
        } else continue;
        applied.push(ev);
    }
    if (!applied.length) return { entries, applied, changed: [], categories: null };
    return { entries: out, applied, changed, categories: { ...(categories || {}), pronouns: sys } };
}

/** One line for notes and reports. */
export function describePronouns(system) {
    if (!system) return '';
    return [system.clusivity ? 'two words for "we" (with and without the listener)' : null,
        system.polite ? `a polite "you" from ${system.polite.strategy === 'noun' ? `"${system.polite.sourceGloss}"` : POLITE_STRATEGIES[system.polite.strategy]?.label}` : null]
        .filter(Boolean).join('; ');
}
