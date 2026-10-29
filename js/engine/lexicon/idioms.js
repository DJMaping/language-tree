/**
 * Sayings: how a language talks about character and feeling through the body
 * (DJ's plan, the deeper languages: "idioms and set phrases").
 *
 * Every language does it, and they differ in the same ways: where they seat
 * the feelings, and which picture they pick. English has a heavy heart,
 * Malay a hati, the liver, that is sick or glad; Ancient Greek felt in the
 * splanchna, the bowels, and Hebrew in the kidneys. The brave are big- or
 * strong-hearted, the generous open- or wide-handed, the liar has two
 * tongues or a crooked one, the dead close their eyes or lose their breath
 * (Kövecses, Metaphor and Emotion, 2000; the seats of feeling surveyed by
 * Sharifian et al., Culture, Body and Language, 2008).
 *
 * A family keeps one seat of feeling (heart, liver, belly or head) and one
 * picture for each meaning, drawn once from its seed; a language now and
 * then takes another of the attested pictures (about one in five). Each
 * saying is the language's own words for the picture, set in its own order
 * (an adjective before or after its noun, a verb before or after its object:
 * syntax/parameters.js), and its words are only what they are in that
 * language, so a saying changes as its words change.
 */

import { derive } from '../rng.js';

export const SEATS = ['heart', 'liver', 'belly', 'head'];

/**
 * meaning, then the attested pictures: [adjective, noun] or ['v', verb, object],
 * with SEAT for the language's seat of feeling.
 */
export const SAYINGS = [
    ['brave', ['big', 'SEAT'], ['strong', 'SEAT']],
    ['sad', ['heavy', 'SEAT'], ['dark', 'SEAT']],
    ['glad', ['light (weight)', 'SEAT'], ['wide', 'SEAT'], ['warm', 'SEAT']],
    ['angry', ['hot', 'SEAT'], ['hot', 'head'], ['hot', 'blood']],
    ['calm', ['cold', 'SEAT'], ['soft', 'breath']],
    ['kind', ['soft', 'SEAT'], ['good', 'SEAT']],
    ['cruel', ['hard', 'SEAT'], ['cold', 'blood']],
    ['afraid', ['small', 'SEAT'], ['weak', 'SEAT']],
    ['honest', ['straight', 'tongue'], ['clean', 'SEAT']],
    ['generous', ['wide', 'hand'], ['long', 'hand']],
    ['mean with money', ['tight', 'hand'], ['small', 'hand'], ['hard', 'hand']],
    ['poor', ['empty', 'hand'], ['empty', 'belly']],
    ['greedy', ['big', 'eye'], ['big', 'belly']],
    ['clever', ['sharp', 'head'], ['fast', 'eye'], ['sharp', 'eye']],
    ['foolish', ['empty', 'head'], ['thick', 'head']],
    ['stubborn', ['hard', 'head'], ['thick', 'neck'], ['hard', 'neck']],
    ['a liar', ['two', 'tongue'], ['crooked', 'tongue']],
    ['a flatterer', ['sweet', 'mouth'], ['sweet', 'tongue']],
    ['a gossip', ['long', 'tongue'], ['loose', 'mouth']],
    ['patient', ['long', 'breath'], ['long', 'SEAT']],
    ['impatient', ['short', 'breath'], ['short', 'SEAT']],
    ['lazy', ['heavy', 'bone'], ['heavy', 'hand']],
    ['old', ['white', 'hair'], ['white', 'head']],
    ['lucky', ['good', 'star'], ['good', 'head']],
    ['to die', ['v', 'close', 'eye'], ['v', 'lose', 'breath']],
    ['to be ashamed', ['v', 'lose', 'face'], ['red', 'face']],
    ['to fall in love', ['v', 'lose', 'SEAT'], ['v', 'give', 'SEAT']],
    ['to remember', ['v', 'hold', 'head'], ['v', 'hold', 'SEAT']],
    ['to marry', ['v', 'take', 'wife'], ['v', 'make', 'house']],
];

const live = (st, g) => st.entries.find((e) => e.gloss === g && e.core && !e.retired && !e.paradigm)
    || st.entries.find((e) => e.gloss === g && !e.retired && !e.paradigm);

/**
 * The language's sayings. `familyKey` keys the family's seat and pictures;
 * `langKey` a language's own departures from them.
 */
export function sayingsOf(state, familyKey, langKey) {
    const seat = SEATS[derive(familyKey, 'sayings', 'seat').int(0, SEATS.length - 1)];
    const adjFirst = state.syntax?.adjective === 'AdjN';
    const verbFirst = !/^(SOV|OSV|OVS)$/.test(state.syntax?.order || 'SVO');
    const out = [];
    for (const [meaning, ...pictures] of SAYINGS) {
        let k = derive(familyKey, 'sayings', meaning).int(0, pictures.length - 1);
        if (pictures.length > 1 && derive(langKey, 'sayings', meaning).bool(0.2)) k = (k + 1 + derive(langKey, 'sayings', meaning, 'which').int(0, pictures.length - 2)) % pictures.length;
        const pic = pictures[k].map((g) => (g === 'SEAT' ? seat : g));
        const verb = pic[0] === 'v';
        const [a, b] = verb ? pic.slice(1) : pic;
        const A = live(state, a), B = live(state, b);
        if (!A || !B) continue;
        const words = verb ? (verbFirst ? [A, B] : [B, A]) : adjFirst ? [A, B] : [B, A];
        out.push({ meaning, literal: verb ? `${a} the ${b}` : `${a} ${b}`, words, seat });
    }
    return { seat, sayings: out };
}
