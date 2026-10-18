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
    /**
     * WALS's other sound chapters (18 Oct 2026), measured on Andah from the
     * consonant phonemes and the words (scripts/measures.js soundTypology),
     * and on Earth from WALS's own languages.
     */
    voicing: { label: 'Voicing contrast', wals: '4A', values: ['none', 'in plosives alone', 'in fricatives alone', 'in both'] },
    uvulars: { label: 'Uvular consonants', wals: '6A', values: ['none', 'stops only', 'continuants only', 'stops and continuants'] },
    glottalized: { label: 'Ejectives and implosives', wals: '7A', values: ['none', 'ejectives', 'implosives', 'ejectives and implosives', 'glottalized resonants only'] },
    laterals: { label: 'Lateral consonants', wals: '8A', values: ['no laterals', '/l/ only', 'laterals but no /l/', '/l/ and lateral obstruents', 'lateral obstruents but no /l/'] },
    velarNasal: { label: 'Velar nasal (ŋ)', wals: '9A', values: ['none', 'not word-initially', 'word-initially too'] },
    nasalVowels: { label: 'Nasal vowels', wals: '10A', values: ['absent', 'present'] },
    syllableStructure: { label: 'Syllable structure', wals: '12A', values: ['simple', 'moderately complex', 'complex'] },
    stress: { label: 'Fixed stress', wals: '14A', values: ['no fixed stress', 'initial', 'second', 'third', 'antepenultimate', 'penultimate', 'ultimate'] },
    commonAbsent: { label: 'Common consonants missing', wals: '18A', values: ['all present', 'no bilabials', 'no fricatives', 'no nasals', 'no bilabials or nasals', 'no fricatives or nasals'] },
    uncommon: { label: 'Uncommon consonants', wals: '19A', values: ['none', 'clicks', 'labial-velars', 'pharyngeals', '"th" sounds', 'clicks, pharyngeals and "th"', 'pharyngeals and "th"'] },
    /**
     * The order chapters the syntax already models (syntax/parameters.js
     * CORRELATES, NEGATION, QUESTION; 18 Oct 2026), against WALS's own
     * languages. WALS's rarer types (inpositions, correlative and adjoined
     * relatives, mixtures) are counted as "other".
     */
    adposition: { label: 'Adpositions', wals: '85A', values: ['postpositions', 'prepositions', 'no dominant order', 'no adpositions'] },
    genitive: { label: 'Genitive and noun', wals: '86A', values: ['GenN', 'NGen', 'no dominant order'] },
    adjectiveOrder: { label: 'Adjective and noun', wals: '87A', values: ['AdjN', 'NAdj', 'no dominant order'] },
    relativeClause: { label: 'Relative clause and noun', wals: '90A', values: ['NRel', 'RelN', 'other'] },
    questionParticle: { label: 'Question particle position', wals: '92A', values: ['initial', 'final', 'second position', 'other', 'no question particle'] },
    negativeMorpheme: { label: 'Negative morpheme', wals: '112A', values: ['negative affix', 'negative particle', 'negative auxiliary verb', 'double negation', 'other'] },
    polarQuestion: { label: 'Yes-no questions', wals: '116A', values: ['question particle', 'interrogative verb morphology', 'interrogative word order', 'intonation only', 'other'] },
    // one word for two meanings (lexicon/colexify.js), WALS's lexical chapters
    handArm: { label: '"Hand" and "arm"', wals: '129A', values: ['identical', 'different'] },
    fingerHand: { label: '"Finger" and "hand"', wals: '130A', values: ['identical', 'different'] },
    greenBlue: { label: 'Green and blue', wals: '134A', values: ['green vs. blue', 'green/blue', 'other'] },
    redYellow: { label: 'Red and yellow', wals: '135A', values: ['red vs. yellow', 'red/yellow', 'other'] },
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
    // moods (morphology/moods.js): WALS 70A (548 languages), 71A (496), 73A (319)
    imperative: { label: 'Imperative', wals: '70A', values: ['second singular and plural', 'number-neutral', 'second singular only', 'second plural only', 'none'],
        earthCounts: { 'second singular and plural': 292, 'number-neutral': 89, 'second singular only': 43, 'second plural only': 2, none: 122 } },
    prohibitive: { label: 'Prohibitive ("don\'t")', wals: '71A', values: ['normal imperative + normal negative', 'normal imperative + special negative', 'special imperative + normal negative', 'special imperative + special negative'],
        earthCounts: { 'normal imperative + normal negative': 113, 'normal imperative + special negative': 182, 'special imperative + normal negative': 55, 'special imperative + special negative': 146 } },
    optative: { label: 'Optative', wals: '73A', values: ['absent', 'present'], earthCounts: { absent: 271, present: 48 } },
    // evidentials (morphology/evidentials.js): WALS 77A and 78A (418 languages each)
    evidentials: { label: 'Evidentials', wals: '77A', values: ['none', 'indirect only', 'direct and indirect'], earthCounts: { none: 181, 'indirect only': 166, 'direct and indirect': 71 } },
    evidentialCoding: { label: 'How evidentials are marked', wals: '78A', values: ['none', 'affix or clitic', 'separate particle', 'part of the tense system', 'modal morpheme', 'mixed'],
        earthCounts: { none: 181, 'affix or clitic': 131, 'separate particle': 65, 'part of the tense system': 24, 'modal morpheme': 7, mixed: 10 } },
};

/** Scales that run from less to more get a ramp; the rest get distinct hues. */
const ORDINAL = new Set(['tone', 'vowels', 'consonants', 'syllables', 'cases', 'genders', 'classifiers', 'evidentials', 'syllableStructure']);
const NOMINAL_HUES = [210, 25, 130, 285, 50, 340, 175];

/** A value's colour as [hue, saturation %, lightness %], or null. */
export function valueHsl(feature, value) {
    const values = FEATURES[feature].values;
    const i = values.indexOf(value);
    if (i < 0) return null;
    if (feature === 'aspirates' || feature === 'rounded' || feature === 'nasalVowels') return value === 'present' ? [15, 70, 52] : [210, 30, 72];
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
        // as the language now is (morphology/type-measure.js), else as its family was founded
        case 'morphology': return f.morphologyMeasured ?? fam?.character?.morphology?.type ?? null;
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
        case 'imperative': return f.imperative ?? null;
        case 'prohibitive': return f.prohibitive ?? null;
        case 'optative': return f.optative ?? null;
        case 'evidentials': return f.evidentials ?? null;
        case 'evidentialCoding': return f.evidentialCoding ?? null;
        case 'adposition': return f.adposition == null ? null : f.adposition === 'postposition' ? 'postpositions' : 'prepositions';
        case 'genitive': return f.genitive ?? null;
        case 'handArm': case 'fingerHand': case 'greenBlue': case 'redYellow': return f[key] ?? null;
        case 'adjectiveOrder': return f.adjectiveOrder ?? null;
        case 'relativeClause': return f.relativeClause ?? null;
        case 'questionParticle': return f.polar == null ? null
            : ({ 'particle-initial': 'initial', 'particle-final': 'final', 'particle-second': 'second position' })[f.polar] ?? 'no question particle';
        case 'negativeMorpheme': return f.negation == null ? null
            : f.negation === 'prefix' || f.negation === 'suffix' ? 'negative affix' : f.negation === 'double' ? 'double negation' : 'negative particle';
        case 'polarQuestion': return f.polar == null ? null
            : f.polar.startsWith('particle') ? 'question particle' : f.polar === 'verb-suffix' ? 'interrogative verb morphology'
                : f.polar === 'inversion' ? 'interrogative word order' : 'intonation only';
        case 'voicing': case 'uvulars': case 'glottalized': case 'laterals': case 'velarNasal':
        case 'nasalVowels': case 'syllableStructure': case 'stress': case 'commonAbsent': case 'uncommon':
            return f[key] ?? null;
        default: return null;
    }
}
