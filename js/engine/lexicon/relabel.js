/**
 * Earth's farm species re-labelled as Andah's own (DJ, 30 Oct 2026: "Re-label,
 * you propose", then "Use them" for these matches). Every language keeps the
 * word it always had; only what it means changes: the word that was "dog" is
 * the word for the Farl, first tamed like the dog. Matched by role and date
 * on DJ's map "Domesticating plants and Animals in Andah (Janus)": the Farl
 * first of all (30,000 BFA), Vasis and Tomeu the first grains, from Alzuria,
 * as wheat and barley from the Fertile Crescent; Kenio from Dahe as rice from
 * China; Verr tamed at six hearths, as cattle were more than once.
 *
 * The engine keeps the old names inside (its meaning shifts, the word-sign
 * pictures and radicals are keyed by them, and DJ wants the scripts kept), so
 * the re-labelling is done where meanings are shown and read: the panel, the
 * dictionary, the word lists, the translator. These species are not added
 * again by the species layer (lexicon/species.js).
 */

export const RELABEL = {
    dog: 'Farl', cow: 'Verr', bull: 'Verr bull', sheep: 'Osig', goat: 'Nema', pig: 'Ata',
    chicken: 'Tnsiam', horse: 'Taletana', wheat: 'Vasis', barley: 'Tomeu', rice: 'Kenio',
};
/** The species the older words now carry. */
export const RELABELLED = new Set(Object.values(RELABEL).filter((x) => !x.includes(' ')));

const WORD = new RegExp(`\\b(${Object.keys(RELABEL).join('|')})\\b`, 'g');
/** A gloss as it is shown: "little dog" is "little Farl". */
export const shownGloss = (g) => (typeof g === 'string' ? g.replace(WORD, (w) => RELABEL[w]) : g);

const BACK = new Map(Object.entries(RELABEL).map(([earth, andah]) => [andah.toLowerCase(), earth]));
/** A species name typed in English, read as the word the engine knows it by: "Farl" is "dog". */
export const readGloss = (word) => BACK.get(String(word).toLowerCase()) ?? null;
