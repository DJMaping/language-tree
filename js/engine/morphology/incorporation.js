/**
 * Noun incorporation: an object noun built into its verb.
 *
 * The hallmark of a polysynthetic language (DJ, 17 Oct 2026: "build it").
 * Mohawk says wa'khnekihrà:ko', "I water-fetched", with the noun -hnek-
 * "water" inside the verb, and Mithun's survey of incorporation found the
 * same few habitual activities incorporated almost everywhere: eating meat
 * or fish, fetching water, felling trees, building houses, making fire,
 * hunting game. These are institutionalised activities, not any verb with
 * any object: the incorporated verb names the activity ("to meat-eat", to
 * have a meal of meat) and the plain verb with a separate object stays for
 * the particular.
 *
 * Each pair the language has words for becomes a verb of its own, noun first
 * (the object before the verb, as Mohawk, Southern Tiwa and Chukchi build
 * them), and from then on it erodes as one word like any compound. Built at
 * the proto stage only: a polysynthetic family's daughters inherit theirs
 * and wear them down.
 */

import { wordToIpa } from '../features.js';
import { repairHiatus, syllabify } from '../phonology/phonotactics.js';
import { classOf } from '../lexicon/roots.js';

/** verb gloss, noun gloss, the activity's name. Commonest first (Mithun 1984). */
export const INCORPORATIONS = [
    ['eat', 'meat', 'eat meat'],
    ['drink', 'water', 'drink water'],
    ['carry', 'water', 'fetch water'],
    ['cut', 'tree', 'fell trees'],
    ['build', 'house', 'build a house'],
    ['make', 'fire', 'make a fire'],
    ['hunt', 'animal', 'hunt game'],
    ['eat', 'fish', 'eat fish'],
    ['cook', 'meat', 'cook meat'],
    ['wash', 'cloth', 'do the washing'],
    ['sew', 'cloth', 'sew clothes'],
    ['make', 'rope', 'make rope'],
    ['make', 'boat', 'build a boat'],
    ['sing', 'song', 'sing songs'],
    ['drink', 'milk', 'drink milk'],
    ['sell', 'salt', 'trade salt'],
];

/**
 * The incorporated verbs a lexicon can build: one per pair whose verb and
 * noun it has, most of them (a language does not incorporate every
 * activity), drawn from the family's seed.
 */
export function incorporate(entries, phonology, rng, { share = 0.75 } = {}) {
    const pt = phonology.phonotactics;
    const byGloss = new Map();
    for (const e of entries) if (!e.derivedFrom && !byGloss.has(e.gloss)) byGloss.set(e.gloss, e);
    const out = [];
    for (const [v, n, gloss] of INCORPORATIONS) {
        const verb = byGloss.get(v), noun = byGloss.get(n);
        if (!verb || !noun || verb.pos !== 'v' || noun.pos !== 'n') continue;
        if (!rng.bool(share)) continue;
        const form = repairHiatus([...noun.form, ...verb.form], pt);
        out.push({
            id: `inc:${noun.id}+${verb.id}`,
            form,
            ipa: wordToIpa(form),
            gloss,
            pos: 'v',
            domain: verb.domain,
            core: false,
            // a habitual activity, said about as often as the verb itself
            rank: Math.round(Math.max(verb.rank, noun.rank) * 1.3),
            class: classOf(form, 'v'),
            syllables: syllabify(form, pt).length,
            irregular: false,
            derivedFrom: null,
            compoundOf: {
                head: verb.id, headGloss: verb.gloss,
                modifier: noun.id, modifierGloss: noun.gloss,
                year: null, incorporated: true,
            },
        });
    }
    return out;
}
