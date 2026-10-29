/**
 * Colexification: one word for two meanings that other languages keep apart
 * (18 Oct 2026, DJ: "continue, keep improving").
 *
 * Languages carve the world differently. Russian ruka is the hand and the
 * whole arm; Vietnamese xanh is green and blue; many languages call the
 * finger "small hand" or simply "hand". Every Andah concept used to have a
 * word of its own, so no language ever did this, where on Earth a third of
 * languages have one word for hand and arm (WALS 129A) and more than half
 * one for green and blue (134A).
 *
 * At the proto the pair is one word as often as on Earth. Then a lineage
 * can MERGE a pair (the word for one meaning spreads to the other, which
 * gives way: semantics.js's neighbour broadening) or SPLIT it (the second
 * meaning gets a word of its own: "little hand" for the finger, "sky-green"
 * for blue), each at a rate whose balance is Earth's share, so the shares
 * hold over the generations. The events are replacement events and
 * replacement.js builds them (lexicon/replacement.js applyReplacements).
 */

import { wordToIpa } from '../features.js';
import { affixShapes } from './replacement.js';
import { WIDER_COLEX } from './wider.js';

/**
 * The pairs, with WALS's share of languages that have one word for both.
 * a: the meaning whose word spreads; b: the one that takes it or gets a word
 * of its own; affix: the derivation a split coins where the language has it;
 * partners: compound modifiers, else.
 */
export const COLEXIFICATIONS = [
    {
        key: 'hand-arm', a: 'hand', b: 'arm', p: 0.37, wals: '129A', affix: 'AUG', partners: ['long', 'big'],
        attested: 'Russian ruka, Lithuanian ranka and Hawaiian lima name the hand and the whole arm with one word',
    },
    {
        key: 'finger-hand', a: 'hand', b: 'finger', p: 0.12, wals: '130A', affix: 'DIM', partners: ['small', 'child'],
        attested: 'many languages have one word for finger and hand, or call the finger the "small hand" or "child of the hand"',
    },
    // every grue language: one word for green and blue alone (57% of WALS's 120), or with black too (TRIPLES).
    // A little above Earth's 71% at the start (19 Oct 2026): the colour words' own replacement splits the
    // pair more often than the merges make up, and over ten worlds 39% of Andah told green from blue
    // against WALS's 25%
    {
        // (0.9, 30 Oct 2026: at 0.8, 49% of Andah told green from blue against WALS 134A's 25%)
        key: 'green-blue', a: 'green', b: 'blue', p: 0.9, wals: '134A', partners: ['sky', 'sea', 'ash'],
        attested: 'Vietnamese xanh, Welsh glas, Japanese ao (before midori) and most of the world’s languages have one word for green and blue',
    },
    {
        key: 'red-yellow', a: 'red', b: 'yellow', p: 0.13, wals: '135A', partners: ['sun', 'gold', 'fire'],
        attested: 'a word for red that also covers yellow and orange is found in many languages with few colour terms (Berlin and Kay’s stage II)',
    },
];

/**
 * One word for a third colour as well: black, green and blue together, a
 * "dark" or "cool" term (WALS 134A: 15 of 120 languages, most of its
 * "other"; Berlin and Kay's stage III, in New Guinea, Australia and the
 * Americas). Only where green and blue already share a word, and p is its
 * share of those (15 of the 85 with a grue term). The word for black spreads
 * to green and blue; a split gives black a word of its own ("night-dark"),
 * as the dark-cool term divides in Berlin and Kay's sequence, before green
 * and blue part.
 */
export const TRIPLES = [
    {
        // likewise above its Earth share at the start (8% of Andah had a dark-cool term against WALS's 18%)
        key: 'black-grue', a: 'black', pair: ['green', 'blue'], p: 0.45, wals: '134A', partners: ['night', 'ash', 'shadow'],
        attested: 'one word for black, green and blue (a "dark-cool" term) in 15 of WALS’s 120 languages, many of them in New Guinea and the Americas',
    },
];

/** Changes of a pair per thousand years, merges and splits together. */
const TURNOVER = 0.25;

// the word that carries the meaning: its core word first, not a loan for it that sits beside it
const live = (entries, g) => entries.find((e) => e.core && !e.retired && !e.paradigm && e.gloss === g)
    || entries.find((e) => !e.retired && !e.paradigm && e.gloss === g);
const sameWord = (x, y) => !!x && !!y && (x.ipa === y.ipa || (x.sameWordAs ?? x.id) === (y.sameWordAs ?? y.id));

/** At the proto: each pair one word as often as on Earth. */
export function colexifyProto(entries, rng, opts = {}) {
    let out = entries;
    for (const c of COLEXIFICATIONS) {
        const A = live(out, c.a), B = live(out, c.b);
        if (!A || !B || A.pos !== B.pos || !rng.bool(c.p)) continue;
        out = out.map((e) => (e === B ? {
            ...e, form: A.form, ipa: A.ipa, syllables: A.syllables, class: A.class, sameWordAs: A.sameWordAs ?? A.id,
            colexified: { with: c.a, key: c.key },
        } : e));
    }
    // a third colour, where green and blue are one word
    for (const t of TRIPLES) {
        const A = live(out, t.a), G = live(out, t.pair[0]), B = live(out, t.pair[1]);
        if (!A || !G || !B || A.pos !== G.pos || !sameWord(G, B) || !rng.bool(t.p)) continue;
        out = out.map((e) => (e === G || e === B ? {
            ...e, form: A.form, ipa: A.ipa, syllables: A.syllables, class: A.class, sameWordAs: A.sameWordAs ?? A.id,
            colexified: { with: t.a, key: t.key },
        } : e));
    }
    // the wider pairs (lexicon/wider.js), each on a stream of its own; only the wider meaning takes the other's word
    if (opts.streamFor) {
        for (const c of WIDER_COLEX) {
            const A = live(out, c.a), B = live(out, c.b);
            if (!A || !B || (!B.wider && !c.older) || A.pos !== B.pos || sameWord(A, B) || !opts.streamFor(c.key).bool(c.p)) continue;
            out = out.map((e) => (e === B ? {
                ...e, form: A.form, ipa: A.ipa, syllables: A.syllables, class: A.class, sameWordAs: A.sameWordAs ?? A.id,
                colexified: { with: c.a, key: c.key },
            } : e));
        }
    }
    return out;
}

/** A triple joined: the third colour's word is green's and blue's too. */
const tripleJoined = (entries, t) => {
    const A = live(entries, t.a), G = live(entries, t.pair[0]), B = live(entries, t.pair[1]);
    return sameWord(G, B) && sameWord(A, G);
};

/** A lifetime's merges and splits, as replacement events. */
export function planColexification(state, rng, opts = {}) {
    const { from, to, rate = 1, exclude = new Set() } = opts;
    const entries = state.entries || [];
    const years = Math.max(0, (to ?? from) - from);
    const events = [];
    let shapes = null;
    const pairs = opts.wider ? WIDER_COLEX : COLEXIFICATIONS;
    for (const c of pairs) {
        // a wider pair (lexicon/wider.js) draws from a stream of its own, and only ever changes the wider meaning's word
        if (opts.wider) rng = opts.rngFor(c.key);
        const A = live(entries, c.a), B = live(entries, c.b);
        if (!A || !B || exclude.has(A.id) || exclude.has(B.id)) continue;
        if (opts.wider && ((!B.wider && !c.older) || A.pos !== B.pos || events.some((e) => e.meaning === c.b))) continue;
        const joined = sameWord(A, B);
        // a dark-cool term divides before green and blue part (TRIPLES)
        if (joined && TRIPLES.some((t) => t.pair.includes(c.a) && t.pair.includes(c.b) && tripleJoined(entries, t))) continue;
        /**
         * Splits come from ordinary replacement too: when the word for "hand"
         * is replaced, "arm" keeps the old one. That doubles the split rate
         * (one word replaced is enough), so merges come at p(2 - p)/(1 - p)
         * times the turnover for the shares to settle at Earth's: at p alone
         * every pair ended at half its Earth share (hand and arm 20% against
         * 37%, green and blue 30% against 57%).
         */
        const r = TURNOVER * (joined ? 1 - c.p : (c.p * (2 - c.p)) / (1 - c.p)) * rate * (years / 1000);
        if (!rng.bool(1 - Math.exp(-r))) continue;
        const year = Math.round(from + years * rng.float(0.15, 0.85));
        if (!joined) {
            events.push({
                year, meaning: c.b, from: B.id, to: A.id, strategy: 'neighbour', colex: c.key,
                shift: { type: 'extension', from: c.a, attested: c.attested },
                note: `the word for "${c.a}" came to cover "${c.b}" as well, and the old word for "${c.b}" gave way`,
            });
            continue;
        }
        shapes = shapes || affixShapes(entries);
        const fresh = c.affix ? shapes.get(c.affix) : null;
        // a wider pair with no partner word to build from keeps its one word
        if (opts.wider && !fresh && !(c.partners || []).some((g) => live(entries, g))) continue;
        if (fresh) {
            events.push({
                year, meaning: c.b, from: B.id, to: null, strategy: 'fresh', colex: c.key,
                fresh: { affix: fresh.key, position: fresh.position, morph: wordToIpa(fresh.morph) },
                note: `"${c.b}" got a word of its own, a ${c.affix === 'DIM' ? 'diminutive' : 'augmentative'} of "${c.a}"`,
            });
            continue;
        }
        const partner = (c.partners || []).map((g) => live(entries, g)).find(Boolean);
        if (!partner) continue;
        events.push({
            year, meaning: c.b, from: B.id, to: null, strategy: 'compound', colex: c.key,
            compound: { head: B.id, modifier: partner.id },
            note: `"${c.b}" got a word of its own, "${partner.gloss}-${c.a}"`,
        });
    }
    if (opts.wider) return events;
    // a third colour, the same way: its word spreads to a grue, or it gets a word of its own
    const planned = new Set(events.map((e) => e.meaning));
    for (const t of TRIPLES) {
        const A = live(entries, t.a), G = live(entries, t.pair[0]), B = live(entries, t.pair[1]);
        if (!A || !G || !B || !sameWord(G, B) || [A, G, B].some((e) => exclude.has(e.id) || planned.has(e.gloss))) continue;
        const joined = sameWord(A, G);
        const r = TURNOVER * (joined ? 1 - t.p : (t.p * (2 - t.p)) / (1 - t.p)) * rate * (years / 1000);
        if (!rng.bool(1 - Math.exp(-r))) continue;
        const year = Math.round(from + years * rng.float(0.15, 0.85));
        if (!joined) {
            for (const X of [G, B]) {
                events.push({
                    year, meaning: X.gloss, from: X.id, to: A.id, strategy: 'neighbour', colex: t.key,
                    shift: { type: 'extension', from: t.a, attested: t.attested },
                    note: `the word for "${t.a}" came to cover "${t.pair[0]}" and "${t.pair[1]}" as well, and their word gave way`,
                });
            }
            continue;
        }
        const partner = (t.partners || []).map((g) => live(entries, g)).find(Boolean);
        if (!partner) continue;
        events.push({
            year, meaning: t.a, from: A.id, to: null, strategy: 'compound', colex: t.key,
            compound: { head: A.id, modifier: partner.id },
            note: `"${t.a}" got a word of its own, "${partner.gloss}-dark", apart from "${t.pair[0]}" and "${t.pair[1]}"`,
        });
    }
    return events;
}

/** WALS 129A, 130A, 134A, 135A as a language now has them. */
export function colexValues(entries) {
    const one = (c) => {
        const A = live(entries, c.a), B = live(entries, c.b);
        return !A || !B ? null : sameWord(A, B);
    };
    const [ha, fh, gb, ry] = COLEXIFICATIONS.map(one);
    // black with green or blue or both is WALS's "other" (black/green/blue, black/blue vs. green)
    const K = live(entries, 'black');
    const dark = !!K && (sameWord(K, live(entries, 'green')) || sameWord(K, live(entries, 'blue')));
    return {
        handArm: ha == null ? null : ha ? 'identical' : 'different',
        fingerHand: fh == null ? null : fh ? 'identical' : 'different',
        greenBlue: gb == null ? null : dark ? 'other' : gb ? 'green/blue' : 'green vs. blue',
        redYellow: ry == null ? null : ry ? 'red/yellow' : 'red vs. yellow',
    };
}
