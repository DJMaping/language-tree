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
    {
        key: 'green-blue', a: 'green', b: 'blue', p: 0.57, wals: '134A', partners: ['sky', 'sea', 'ash'],
        attested: 'Vietnamese xanh, Welsh glas, Japanese ao (before midori) and most of the world’s languages have one word for green and blue',
    },
    {
        key: 'red-yellow', a: 'red', b: 'yellow', p: 0.13, wals: '135A', partners: ['sun', 'gold', 'fire'],
        attested: 'a word for red that also covers yellow and orange is found in many languages with few colour terms (Berlin and Kay’s stage II)',
    },
];

/** Changes of a pair per thousand years, merges and splits together. */
const TURNOVER = 0.25;

const live = (entries, g) => entries.find((e) => !e.retired && !e.paradigm && e.gloss === g);
const sameWord = (x, y) => !!x && !!y && (x.ipa === y.ipa || (x.sameWordAs ?? x.id) === (y.sameWordAs ?? y.id));

/** At the proto: each pair one word as often as on Earth. */
export function colexifyProto(entries, rng) {
    let out = entries;
    for (const c of COLEXIFICATIONS) {
        const A = live(out, c.a), B = live(out, c.b);
        if (!A || !B || A.pos !== B.pos || !rng.bool(c.p)) continue;
        out = out.map((e) => (e === B ? {
            ...e, form: A.form, ipa: A.ipa, syllables: A.syllables, class: A.class, sameWordAs: A.sameWordAs ?? A.id,
            colexified: { with: c.a, key: c.key },
        } : e));
    }
    return out;
}

/** A lifetime's merges and splits, as replacement events. */
export function planColexification(state, rng, { from, to, rate = 1, exclude = new Set() } = {}) {
    const entries = state.entries || [];
    const years = Math.max(0, (to ?? from) - from);
    const events = [];
    let shapes = null;
    for (const c of COLEXIFICATIONS) {
        const A = live(entries, c.a), B = live(entries, c.b);
        if (!A || !B || exclude.has(A.id) || exclude.has(B.id)) continue;
        const joined = sameWord(A, B);
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
    return events;
}

/** WALS 129A, 130A, 134A, 135A as a language now has them. */
export function colexValues(entries) {
    const one = (c) => {
        const A = live(entries, c.a), B = live(entries, c.b);
        return !A || !B ? null : sameWord(A, B);
    };
    const [ha, fh, gb, ry] = COLEXIFICATIONS.map(one);
    return {
        handArm: ha == null ? null : ha ? 'identical' : 'different',
        fingerHand: fh == null ? null : fh ? 'identical' : 'different',
        greenBlue: gb == null ? null : gb ? 'green/blue' : 'green vs. blue',
        redYellow: ry == null ? null : ry ? 'red/yellow' : 'red vs. yellow',
    };
}
