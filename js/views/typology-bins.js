/**
 * The typology maps' categories, shared by the app (js/views/typology.js) and
 * the Earth builder (scripts/build-earth.js), so that a value means the same
 * thing on Andah and on Earth and takes the same colour on both maps.
 *
 * The bands are WALS's own (World Atlas of Language Structures, chapters 1A,
 * 2A, 11A, 13A, 49A, 81A, 98A), so the Earth map is WALS as published and the
 * Andah map is measured with the same ruler.
 */

export const FEATURES = {
    order: { label: 'Basic word order', wals: '81A', values: ['SOV', 'SVO', 'VSO', 'VOS', 'OVS', 'OSV', 'no dominant order'] },
    morphology: { label: 'Morphological type', wals: '20A/22A', values: ['isolating', 'agglutinative', 'fusional', 'polysynthetic'] },
    alignment: { label: 'Alignment of case marking', wals: '98A', values: ['neutral', 'accusative', 'ergative', 'tripartite', 'active'] },
    tone: { label: 'Tone', wals: '13A', values: ['no tones', 'simple tone system', 'complex tone system'] },
    vowels: { label: 'Vowel qualities', wals: '2A', values: ['small (2-4)', 'average (5-6)', 'large (7+)'] },
    consonants: { label: 'Consonant inventory', wals: '1A', values: ['small (6-14)', 'moderately small (15-18)', 'average (19-25)', 'moderately large (26-33)', 'large (34+)'] },
    aspirates: { label: 'Aspirated stops', wals: null, values: ['absent', 'present'] },
    rounded: { label: 'Front rounded vowels', wals: '11A', values: ['absent', 'present'] },
    syllables: { label: 'Syllables per basic word', wals: null, values: ['under 1.5', '1.5-2', '2-2.5', '2.5 and over'] },
    cases: { label: 'Number of cases', wals: '49A', values: ['no case', '2 cases', '3 cases', '4 cases', '5 cases', '6-7 cases', '8-9 cases', '10+ cases'] },
    /**
     * Genders (morphology/gender.js). The Earth file carries no per-language
     * values for it, so the comparison takes WALS 30A's published totals
     * (Corbett, 257 languages) as `earthCounts`.
     */
    genders: { label: 'Number of genders', wals: '30A', values: ['none', 'two', 'three', 'four', 'five or more'],
        earthCounts: { none: 145, two: 50, three: 26, four: 12, 'five or more': 24 } },
    // numeral classifiers (morphology/classifiers.js), WALS 55A's totals (Gil, 400 languages)
    classifiers: { label: 'Numeral classifiers', wals: '55A', values: ['absent', 'optional', 'obligatory'],
        earthCounts: { absent: 260, optional: 62, obligatory: 78 } },
    // where numeral and demonstrative stand (syntax/parameters.js), WALS 89A and 88A's totals (Dryer)
    numeral: { label: 'Numeral and noun', wals: '89A', values: ['NumN', 'NNum'], earthCounts: { NumN: 479, NNum: 608 } },
    demonstrative: { label: 'Demonstrative and noun', wals: '88A', values: ['DemN', 'NDem'], earthCounts: { DemN: 542, NDem: 562 } },
    // pronouns (morphology/pronouns.js): WALS 39A (Cysouw, 200 languages; "only inclusive" counted
    // with the distinction) and 45A (Helmbrecht, 207; every kind of politeness counted together)
    clusivity: { label: 'Inclusive and exclusive "we"', wals: '39A', values: ['one "we"', 'inclusive and exclusive'],
        earthCounts: { 'one "we"': 132, 'inclusive and exclusive': 68 } },
    politeness: { label: 'Polite "you"', wals: '45A', values: ['none', 'polite "you"'], earthCounts: { none: 136, 'polite "you"': 71 } },
    // a verb taking a tense from another (morphology/irregular.js): WALS 79A (Veselinova, 193 languages;
    // tense, aspect, or both, counted together)
    suppletion: { label: 'Suppletion by tense or aspect', wals: '79A', values: ['none', 'tense or aspect'], earthCounts: { none: 123, 'tense or aspect': 70 } },
    // articles (morphology/articles.js): WALS 37A (620 languages) and 38A (534), from the WALS data
    definiteArticle: { label: 'Definite articles', wals: '37A', values: ['no articles', 'only indefinite', '"that" as definite', 'definite word', 'definite affix'],
        earthCounts: { 'no articles': 198, 'only indefinite': 45, '"that" as definite': 69, 'definite word': 216, 'definite affix': 92 } },
    indefiniteArticle: { label: 'Indefinite articles', wals: '38A', values: ['no articles', 'only definite', '"one" as indefinite', 'indefinite word', 'indefinite affix'],
        earthCounts: { 'no articles': 198, 'only definite': 98, '"one" as indefinite': 112, 'indefinite word': 102, 'indefinite affix': 24 } },
};

/** Scales that run from less to more get a ramp; the rest get distinct hues. */
const ORDINAL = new Set(['tone', 'vowels', 'consonants', 'syllables', 'cases', 'genders', 'classifiers']);
const NOMINAL_HUES = [210, 25, 130, 285, 50, 340, 175];

/** A value's colour as [hue, saturation %, lightness %], or null. */
export function valueHsl(feature, value) {
    const values = FEATURES[feature].values;
    const i = values.indexOf(value);
    if (i < 0) return null;
    if (feature === 'aspirates' || feature === 'rounded') return value === 'present' ? [15, 70, 52] : [210, 30, 72];
    if (ORDINAL.has(feature)) {
        const t = values.length > 1 ? i / (values.length - 1) : 0;
        return [Math.round(220 - 210 * t), 55 + 15 * t, 62 - 14 * t];
    }
    return [NOMINAL_HUES[i % NOMINAL_HUES.length], 60, 52];
}

export const bin = {
    consonants: (n) => (n <= 14 ? 'small (6-14)' : n <= 18 ? 'moderately small (15-18)' : n <= 25 ? 'average (19-25)' : n <= 33 ? 'moderately large (26-33)' : 'large (34+)'),
    vowels: (n) => (n <= 4 ? 'small (2-4)' : n <= 6 ? 'average (5-6)' : 'large (7+)'),
    /** Contrasting tones beyond the toneless: one marked tone is WALS's "simple" two-way system. */
    tone: (levels) => (!levels ? 'no tones' : levels === 1 ? 'simple tone system' : 'complex tone system'),
    /** One case left is no contrast at all: WALS's "no morphological case". */
    cases: (n) => (n <= 1 ? 'no case' : n <= 2 ? '2 cases' : n <= 5 ? `${n} cases` : n <= 7 ? '6-7 cases' : n <= 9 ? '8-9 cases' : '10+ cases'),
    syllables: (x) => (x < 1.5 ? 'under 1.5' : x < 2 ? '1.5-2' : x < 2.5 ? '2-2.5' : '2.5 and over'),
    present: (b) => (b ? 'present' : 'absent'),
};

/** An Andah language's value for a feature, from data/views.json. */
export function andahValue(key, f, fam) {
    switch (key) {
        case 'order': return f.dominant === false ? 'no dominant order' : f.order ?? null;
        case 'morphology': return fam?.character?.morphology?.type ?? null;
        // WALS 98A is the alignment of CASE MARKING: no cases reads "neutral".
        case 'alignment': return !fam?.character ? null : f.cases <= 1 ? 'neutral' : fam.character.morphology?.alignment === 'erg-abs' ? 'ergative' : 'accusative';
        case 'tone': return bin.tone(f.toneLevels);
        case 'vowels': return bin.vowels(f.vowels);
        case 'consonants': return bin.consonants(f.consonants);
        case 'aspirates': return bin.present(f.aspirates);
        case 'rounded': return bin.present(f.frontRounded);
        case 'syllables': return bin.syllables(f.syllables);
        case 'cases': return bin.cases(f.cases);
        case 'genders': return f.genders == null ? null : ['none', 'none', 'two', 'three', 'four'][f.genders] ?? 'five or more';
        case 'classifiers': return f.classifiers == null ? null : f.classifiers === 'none' ? 'absent' : f.classifiers;
        case 'numeral': return f.numeral ?? null;
        case 'demonstrative': return f.demonstrative ?? null;
        case 'clusivity': return f.clusivity == null ? null : f.clusivity ? 'inclusive and exclusive' : 'one "we"';
        case 'politeness': return f.polite == null ? null : f.polite ? 'polite "you"' : 'none';
        case 'suppletion': return f.suppletion == null ? null : f.suppletion ? 'tense or aspect' : 'none';
        case 'definiteArticle': return f.definiteArticle ?? null;
        case 'indefiniteArticle': return f.indefiniteArticle ?? null;
        default: return null;
    }
}
