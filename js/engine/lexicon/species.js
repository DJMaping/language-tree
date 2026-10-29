/**
 * Andah's own tamed animals and crops (DJ, 30 Oct 2026, and his map
 * "Domesticating plants and Animals in Andah (Janus)"; the hearths, dates
 * and spread are worked out by scripts/build-domestication.js into
 * data/canon/domestication.json).
 *
 * A family living at a species' hearth has its word as its own; every other
 * family gets it as the species spreads: in its proto if the species reached
 * it first (an old loan, its form worn native, as the word for wine reached
 * the Indo-Europeans), else borrowed in the year it arrives from the hearth
 * family's language spoken there then, or named afresh where that language
 * is not known. Contact lends a species sooner where it can (contact.js).
 *
 * Every species word is of the wider vocabulary (lexicon/wider.js `wider`),
 * so adding them moves no older word.
 */

import { wordToIpa } from '../features.js';
import { syllabify } from '../phonology/phonotactics.js';
import { generateLexicon, classOf } from './roots.js';
import { adapt } from '../contact.js';

const DOMAIN = { animal: 'animal', grain: 'plant', food: 'plant', yam: 'plant', crop: 'plant' };

/** The family's record in domestication.json, by its root's id. */
export function speciesOfFamily(domestication, rootId, uid = null) {
    const fams = domestication?.families || {};
    return Object.values(fams).find((f) => f.root === rootId || (uid && f.root === uid)) || null;
}

/** The proto's species, as concepts after every other (swadesh.js conceptList). */
export function speciesConcepts(family) {
    return (family?.proto || []).map((s) => ({
        gloss: s.gloss, pos: 'n', domain: DOMAIN[s.kind] || 'plant', core: false, wider: true,
        species: { kind: s.kind, hearth: s.hearth, how: s.how === 'native' ? 'native' : 'old loan', from: s.from, year: s.year },
    }));
}

const note = (s) => ({ kind: s.kind, hearth: s.hearth, how: s.how, from: s.from, year: s.year });

/** A word of its own for a species, in the sounds of the language as it is that year. */
export function coinSpecies(s, state, rng, year) {
    const phonology = { inventory: state.inventory, phonotactics: state.phonotactics, profile: state.profile, segmentMap: state.inventory?.segmentMap ?? new Map() };
    const made = generateLexicon([{ gloss: s.gloss, pos: 'n', domain: DOMAIN[s.kind] || 'plant', core: false }], phonology, rng, { streamFor: () => rng }).roots[0];
    if (!made) return null;
    return {
        ...made, id: `species:${s.gloss}`, rank: 300 + Math.round(rng.float(0, 200)), wider: true,
        species: { ...note(s), how: s.how === 'native' ? 'native' : 'named' }, enteredAt: year,
    };
}

/** The species word borrowed from the lender's language as it stood that year. */
export function borrowSpecies(s, donorState, donorId, state, rng, year) {
    const w = donorState?.entries?.find((e) => e.gloss === s.gloss && !e.retired && !e.paradigm);
    if (!w) return null;
    const form = adapt(w.form, state);
    if (!form?.length) return null;
    const pt = state.phonotactics;
    return {
        id: `species:${s.gloss}:${donorId}`, form, ipa: wordToIpa(form), gloss: s.gloss, pos: 'n', domain: DOMAIN[s.kind] || 'plant',
        core: false, rank: 300 + Math.round(rng.float(0, 200)), zipf: 0, class: classOf(form, 'n'), syllables: syllabify(form, pt).length,
        irregular: false, derivedFrom: null, wider: true,
        loan: { from: donorId, borrowingId: `species:${s.gloss}`, kind: 'loan', strength: 1, year, label: `the language of the ${s.gloss}'s hearth`, donorForm: w.ipa, adapted: wordToIpa(form) !== w.ipa },
        species: note(s), enteredAt: year,
    };
}
