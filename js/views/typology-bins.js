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
};

/** Scales that run from less to more get a ramp; the rest get distinct hues. */
const ORDINAL = new Set(['tone', 'vowels', 'consonants', 'syllables', 'cases']);
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
        default: return null;
    }
}
