/**
 * Fine words where the land calls for them (DJ, 30 Oct 2026: climate and
 * coast "add extra fine words where they matter, like several words for snow
 * and ice in cold lands, or for sand, wells and dunes in deserts").
 *
 * Every language has its plain words for snow, ice, sand and the sea; these
 * are the finer ones a people needs only where it lives with the thing:
 * Sámi and Inuit have many words for kinds of snow and ice, Arabic for
 * dunes, wells and dry valleys, Malay for the rains and the tides. A family
 * whose homeland has the climate has them in its proto; a later language
 * that lives in such a land and lacks them coins its own at its birth
 * (contact may lend them too, as any word). Where each language lives:
 * scripts/build-environment.js (data/canon/environment.json). Every word is
 * of the wider vocabulary (lexicon/wider.js), so none of this moves an older
 * word.
 */

import { generateLexicon } from './roots.js';

export const ENV_WORDS = {
    cold: [['powder snow', 'n'], ['wet snow', 'n'], ['snowdrift', 'n'], ['sleet', 'n'], ['icicle', 'n'], ['thin ice', 'n'],
        ['frozen ground', 'n'], ['snowshoe', 'n'], ['fur cloak', 'n'], ['first frost', 'n'], ['meltwater', 'n'], ['winter dark', 'n']],
    polar: [['sea ice', 'n'], ['ice field', 'n'], ['midnight sun', 'n'], ['snow house', 'n']],
    dry: [['dune', 'n'], ['sandstorm', 'n'], ['dry riverbed', 'n'], ['salt flat', 'n'], ['mirage', 'n'], ['waterskin', 'n'],
        ['deep well', 'n'], ['stony desert', 'n'], ['sun shelter', 'n'], ['flash flood', 'n']],
    tropical: [['downpour', 'n'], ['flood season', 'n'], ['swamp forest', 'n'], ['leaf roof', 'n'], ['canopy', 'n'], ['muggy heat', 'n'],
        ['mudslide', 'n'], ['stilt house', 'n']],
    coast: [['tide pool', 'n'], ['sandbar', 'n'], ['cove', 'n'], ['lagoon', 'n'], ['surf', 'n'], ['driftwood', 'n'],
        ['fishing net', 'n'], ['sea wind', 'n'], ['low tide', 'n'], ['high tide', 'n'], ['seaweed', 'n'], ['shipwreck', 'n']],
};
const DOMAIN = { cold: 'weather', polar: 'weather', dry: 'nature', tropical: 'weather', coast: 'nature' };

/** The fine words for a set of flags, as concepts (after every other: swadesh.js conceptList). */
export function environmentConcepts(flags) {
    if (!flags) return [];
    return Object.entries(ENV_WORDS).filter(([f]) => flags[f]).flatMap(([f, words]) => words.map(([gloss, pos]) => ({
        gloss, pos, domain: DOMAIN[f], core: false, wider: true, environment: f,
    })));
}

/** The fine words a language living in such a land coins at its birth, where it lacks them. */
export function coinEnvironment(flags, state, rngFor, year) {
    const have = new Set(state.entries.filter((e) => !e.retired && !e.paradigm).map((e) => `${e.gloss}|${e.pos}`));
    const want = environmentConcepts(flags).filter((c) => !have.has(`${c.gloss}|${c.pos}`));
    if (!want.length) return [];
    const phonology = { inventory: state.inventory, phonotactics: state.phonotactics, profile: state.profile, segmentMap: state.inventory?.segmentMap ?? new Map() };
    const made = generateLexicon(want, phonology, rngFor('ranks'), { streamFor: (gloss) => rngFor(gloss) }).roots;
    return made.map((r, i) => ({ ...r, id: `env:${want[i].gloss}|${want[i].pos}`, rank: 350 + i, wider: true, environment: want[i].environment, enteredAt: year }));
}
