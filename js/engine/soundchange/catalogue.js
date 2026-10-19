/**
 * The catalogue of sound-change templates.
 *
 * Every entry is a change that really happens, somewhere, repeatedly — with the
 * environment that conditions it built in, and a named attested analogue stored
 * alongside. Nothing here is invented. That constraint is the whole point: a
 * generator that can emit any rule at all will emit `k > l` unconditioned, and
 * the output stops resembling a language.
 *
 * A template is not a rule. It is a function that inspects an inventory and
 * either produces a rule appropriate to THAT language or declines. Palatalisation
 * needs front vowels; final devoicing needs a voicing contrast and codas;
 * tonogenesis needs something to lose. Declining is the normal case, and it is
 * why a generated ruleset is shaped by the language it applies to rather than
 * being drawn from a hat.
 *
 * `weight` is roughly how often the change type turns up in the world's
 * languages. Lenition and assimilation are everywhere; dissimilation and
 * metathesis are rare and, when they do happen, tend to be sporadic.
 */

import { consonant, vowel, isVowel, applyDelta } from '../features.js';

const V = { type: 'V' };
const C = { type: 'C' };
const WORD_END = [{ boundary: '#' }];
const WORD_START = [{ boundary: '#' }];

/** Small helpers for interrogating an inventory. */
function has(inv, ipa) { return inv.consonants.some((p) => p.ipa === ipa) || inv.vowels.some((p) => p.ipa === ipa); }
function consonantsWhere(inv, test) { return inv.consonants.filter(test); }
function vowelsWhere(inv, test) { return inv.vowels.filter(test); }
const hasFrontVowel = (inv) => inv.vowels.some((v) => v.f.back === 1 && v.f.height <= 2);
const hasVoicingContrast = (inv) => inv.consonants.some((c) => c.f.voice && c.f.manner === 'stop')
    && inv.consonants.some((c) => !c.f.voice && c.f.manner === 'stop');
const codas = (inv, pt) => (pt?.coda?.allowed || []).filter((x) => has(inv, x));

/**
 * Geminates actually present in the lexicon.
 *
 * A template that needs a specific structure has to be able to ask whether the
 * language has one, rather than guessing from the inventory. `ctx.probe` is the
 * word sample the generator already builds to test-fire candidates; reusing it
 * costs nothing and keeps templates honest about what they can act on.
 */
function geminatesIn(ctx) {
    const found = new Set();
    for (const e of ctx?.probe || []) {
        for (let i = 1; i < e.form.length; i++) {
            if (e.form[i].type === 'C' && e.form[i].ipa === e.form[i - 1].ipa) found.add(e.form[i].ipa);
        }
    }
    return [...found];
}

/**
 * Vowel pairs ADJACENT in the vowel space — candidates for a merger.
 *
 * Adjacency is one step in height or one step in backness, everything else
 * equal. Mergers only ever join neighbours: Vulgar Latin ĭ/ē, English
 * meet/meat, the cot–caught merger. Nothing in any language merges /i/ with
 * /a/, and a generator that allowed it would produce vowel systems with holes
 * in impossible places.
 *
 * Only plain vowels are eligible — merging a long or toned vowel into a short
 * or toneless one would destroy a suprasegmental contrast under the guise of a
 * quality change, which is a different event with a different name.
 */
function adjacentVowelPairs(inv) {
    const plain = inv.vowels.filter((v) => !v.f.long && !v.f.nasal && !v.f.tone);
    const pairs = [];
    for (const a of plain) {
        for (const b of plain) {
            if (a.ipa === b.ipa) continue;
            if (a.f.round !== b.f.round) continue;
            const dh = Math.abs(a.f.height - b.f.height);
            const db = Math.abs(a.f.back - b.f.back);
            if ((dh === 1 && db === 0) || (dh === 0 && db === 1)) pairs.push([a, b]);
        }
    }
    return pairs;
}

/**
 * Consonant pairs ADJACENT in feature space — candidates for a merger.
 *
 * Adjacent means differing in exactly one dimension: one step of place, one
 * step of manner, or voicing alone. Those are the mergers that actually happen
 * — Spanish merged /b/ and /v/, most of English merged /hw/ into /w/, Old
 * English lost the /x/ of "niht" into the preceding vowel. Nothing merges /p/
 * with /l/.
 */
function adjacentConsonantPairs(inv) {
    const P = ['bilabial', 'labiodental', 'dental', 'alveolar', 'postalveolar', 'retroflex', 'alveolopalatal', 'palatal', 'velar', 'labiovelar', 'uvular', 'pharyngeal', 'glottal'];
    const M = ['stop', 'affricate', 'fricative', 'nasal', 'trill', 'tap', 'approximant'];
    const plain = inv.consonants.filter((c) => !c.f.long);
    const pairs = [];
    for (const a of plain) {
        for (const b of plain) {
            if (a.ipa === b.ipa) continue;
            if (a.f.lateral !== b.f.lateral) continue;
            const dp = Math.abs(P.indexOf(a.f.place) - P.indexOf(b.f.place));
            const dm = Math.abs(M.indexOf(a.f.manner) - M.indexOf(b.f.manner));
            const dv = a.f.voice === b.f.voice ? 0 : 1;
            const da = a.f.aspirated === b.f.aspirated ? 0 : 1;
            // Exactly one dimension apart.
            if (dp + dm + dv + da !== 1) continue;
            pairs.push([a, b]);
        }
    }
    return pairs;
}

/**
 * Crowding pressure.
 *
 * A merger is likelier in a crowded inventory than a sparse one. That is not a
 * cap on inventory size, it is a mechanism with a reason behind it: the more
 * segments share the articulatory space, the smaller the perceptual margin
 * between neighbours, and the harder a contrast is to maintain. The result is a
 * self-regulating band rather than a hard limit, which is what the world's
 * inventories actually look like.
 *
 * Returns a multiplier that is ~0.3 at 15 consonants and ~2.5 at 40.
 */
/**
 * How monosyllabic the language's words are, from the generator's probe.
 *
 * Tonogenesis on Earth belongs overwhelmingly to languages whose words are
 * one syllable long, where a lost coda or onset contrast has nowhere else to
 * leave its trace: Chinese, Vietnamese, Thai, Hmong, the Tibeto-Burman
 * fringe. Polysyllabic families (Indo-European, Uralic, Turkic, Dravidian,
 * most of Austronesian) rarely develop it. Scaling tonogenesis by this share
 * is what keeps tone a family trait instead of a feature every family gets.
 */
function monosyllabicity(ctx) {
    // roots, not compounds or derivatives: Chinese is monosyllabic in its
    // morphemes while most of its words are two of them, and it is the
    // morphemes whose lost codas and onsets leave their trace as pitch
    const words = (ctx?.probe || []).filter((e) => !e.paradigm && !e.compoundOf && !e.derivedFrom && e.form?.length);
    if (!words.length) return 0.5;
    return words.filter((e) => e.form.filter(isVowel).length <= 1).length / words.length;
}
// Raised from 1.6 when seven series changes joined the catalogue (17 Oct
// 2026) and took their share of every pick: toneless went from 64% to 77%.
const toneWeight = (inv, pt, ctx) => 0.05 + 2.4 * monosyllabicity(ctx) ** 3;

/**
 * How freely the language's words already close their syllables: the share
 * of the probe's words with a coda (a final consonant, or a consonant before
 * another inside the word).
 */
function codaShare(ctx) {
    const words = (ctx?.probe || []).filter((e) => !e.paradigm && e.form?.length);
    if (!words.length) return 0.5;
    let n = 0;
    for (const e of words) {
        const f = e.form;
        let closed = f[f.length - 1].type === 'C';
        for (let i = 1; !closed && i < f.length - 1; i++) closed = f[i - 1].type === 'V' && f[i].type === 'C' && f[i + 1].type === 'C';
        if (closed) n += 1;
    }
    return n / words.length;
}

/**
 * Open-syllable languages keep their open syllables. Japanese, the
 * Polynesian languages and most of Bantu have stayed (C)V for millennia,
 * repairing every new coda (in loans too) rather than taking it; vowel loss
 * that closes syllables belongs to languages that already have codas
 * (Germanic, French). Deleting at one rate everywhere gave every Andah
 * language codas in a fifth of its words or more, and Amnant, whose living
 * languages are called Bewilojega and Hozutuxepi, codas in 82%: no language
 * was (C)V, against 13% of Earth's (WALS 12A).
 */
const openness = (inv, pt, ctx) => 0.15 + 0.85 * Math.min(1, codaShare(ctx) / 0.3);

/**
 * And they repair the codas they get: Japanese and Hawaiian give loans extra
 * vowels and drop clusters, and the Polynesian languages lost every final
 * consonant they had. The fewer codas a language has, the likelier its
 * repairs: up to three times as likely in a language all but (C)V.
 */
const closingRepair = (inv, pt, ctx) => 1 + 2 * (1 - Math.min(1, codaShare(ctx) / 0.3));

/**
 * Whether a second tone source may layer on a language that already has tone.
 * Stacked systems (three heights and more, contours) belong to Southeast
 * Asia's monosyllabic isolating languages: Middle Chinese's four coda tones
 * split by voicing into eight, Vietnamese's three by two (Haudricourt 1954).
 * Long-word tone languages keep a two-way contrast, high against the rest
 * (Bantu, Athabaskan, Japanese). WALS 13A crossed with morphology: complex
 * systems are 73% of the tone systems of isolating languages, 19-27% of the
 * others'. Layering everywhere made 38% of long-word tone systems complex.
 */
const STACK_OUTSIDE_ISOLATING = 0.4;
const mayStack = (inv, rng, ctx) => !inv.vowels.some((v) => v.f.tone)
    || ctx?.morphology === 'isolating' || rng.float(0, 1) < STACK_OUTSIDE_ISOLATING;

/**
 * Merger pressure from a crowded consonant system. Centred on the lineage's
 * own size where it has one (a Caucasian-sized branch is not crowded at 35),
 * else on Earth's typical size (WALS 1A: about 21; was 24 before the 15 Oct
 * 2026 tuning), so systems above it lose contrasts a little sooner. Centred
 * on 21 for everyone, it pulled every lineage back to the middle whatever
 * size it was drawn to.
 */
function crowding(inv, ctx) {
    const n = ctx?.consonantCount ?? inv.consonants.length;
    return Math.max(0.2, Math.min(3, Math.exp((n - (ctx?.consonantTarget ?? 21)) / 8)));
}

export const CATALOGUE = [
    // ══════════════════════════════════════════════════════════════════════
    // LENITION — the commonest kind of change there is. Consonants weaken in
    // weak positions: between vowels, at the end of a word, in unstressed
    // syllables. The classic cline is stop > fricative > approximant > nothing,
    // and Western Romance walked the whole thing.
    // ══════════════════════════════════════════════════════════════════════
    {
        id: 'intervocalic-voicing', category: 'lenition', weight: 10,
        applies: (inv) => consonantsWhere(inv, (c) => !c.f.voice && c.f.manner === 'stop').length > 0,
        build: () => ({
            label: 'intervocalic voicing',
            a: { type: 'C', manner: 'stop', voice: false },
            b: { delta: { voice: true } },
            env: { before: [V], after: [V] },
            analogue: 'Latin VITA > Spanish "vida"; the first step of the Western Romance lenition chain',
        }),
    },
    {
        id: 'intervocalic-spirantisation', category: 'lenition', weight: 8,
        applies: (inv) => consonantsWhere(inv, (c) => c.f.voice && c.f.manner === 'stop').length > 0,
        build: () => ({
            label: 'intervocalic spirantisation',
            a: { type: 'C', manner: 'stop', voice: true },
            b: { delta: { manner: 'fricative' } },
            env: { before: [V], after: [V] },
            analogue: 'Spanish /b d ɡ/ → [β ð ɣ] between vowels; the second step of the same chain',
        }),
    },
    {
        id: 'intervocalic-elision', category: 'lenition', weight: 5,
        applies: (inv) => consonantsWhere(inv, (c) => c.f.voice && c.f.manner === 'fricative').length > 0,
        build: () => ({
            label: 'loss of intervocalic voiced fricatives',
            a: { type: 'C', manner: 'fricative', voice: true },
            b: { empty: true },
            env: { before: [V], after: [V] },
            analogue: 'Latin CREDERE > French "croire"; the end of the lenition cline — the consonant disappears',
        }),
    },
    {
        id: 'debuccalisation', category: 'lenition', weight: 4,
        applies: (inv) => consonantsWhere(inv, (c) => c.f.manner === 'fricative' && !c.f.voice && c.f.place !== 'glottal').length > 0,
        build: (inv, rng) => {
            const cand = rng.pick(consonantsWhere(inv, (c) => c.f.manner === 'fricative' && !c.f.voice && c.f.place !== 'glottal'));
            if (!cand) return null;
            return {
                label: `${cand.ipa} > h`,
                a: { is: cand.ipa }, b: { set: 'h' },
                env: {},
                analogue: 'Latin /f/ > Spanish /h/ (FILIUM > "hijo"); Proto-Polynesian *s > Hawaiian /h/. The place of articulation is lost and only the glottal gesture survives',
            };
        },
    },
    {
        id: 'final-lenition', category: 'lenition', weight: 5,
        applies: (inv, pt) => codas(inv, pt).length > 0,
        build: () => ({
            label: 'weakening of final stops',
            a: { type: 'C', manner: 'stop' },
            b: { delta: { manner: 'fricative' } },
            env: { before: [V], after: WORD_END },
            analogue: 'German auslaut weakening; word-final position is prosodically weak in almost every language',
        }),
    },
    {
        id: 'flapping', category: 'lenition', weight: 3,
        applies: (inv) => has(inv, 't') && !has(inv, 'ɾ'),
        build: () => ({
            label: 'intervocalic flapping',
            a: { is: ['t', 'd'] }, b: { set: 'ɾ' },
            env: { before: [{ ...V, stress: 'stressed' }], after: [{ ...V, stress: 'unstressed' }] },
            analogue: 'American English "butter" [ˈbʌɾɚ]; conditioned by the stress fall, which is why "atom" flaps and "atomic" does not',
        }),
    },

    // ══════════════════════════════════════════════════════════════════════
    // FORTITION — rarer than lenition, and it happens in STRONG positions:
    // word-initially, after a nasal, under stress.
    // ══════════════════════════════════════════════════════════════════════
    {
        id: 'initial-fortition', category: 'fortition', weight: 3,
        applies: (inv) => consonantsWhere(inv, (c) => c.f.manner === 'fricative' && c.f.voice).length > 0,
        build: () => ({
            label: 'word-initial hardening',
            a: { type: 'C', manner: 'fricative', voice: true },
            b: { delta: { manner: 'stop' } },
            env: { before: WORD_START },
            analogue: 'Germanic *j > Danish /dʒ/; word-initial position is the strongest in the word and resists weakening',
        }),
    },
    {
        id: 'postnasal-hardening', category: 'fortition', weight: 3,
        applies: (inv) => inv.consonants.some((c) => c.f.manner === 'nasal') && consonantsWhere(inv, (c) => c.f.manner === 'fricative').length > 0,
        build: () => ({
            label: 'post-nasal hardening',
            a: { type: 'C', manner: 'fricative' },
            b: { delta: { manner: 'stop' } },
            env: { before: [{ type: 'C', manner: 'nasal' }] },
            analogue: 'Greek and Bantu post-nasal stops; the velum closing early gives the following segment a full closure',
        }),
    },
    {
        id: 'glide-strengthening', category: 'fortition', weight: 3,
        applies: (inv) => has(inv, 'j'),
        /**
         * The outcome was hard-coded to /d͡ʑ/, the Sinitic alveolo-palatal, while
         * the analogue it cited (Italian "già") has /d͡ʒ/; it put /d͡ʑ/ in 40-100%
         * of the leaves of every family. A language already holding one of the
         * attested outcomes tends to merge into it; otherwise any may arise.
         */
        build: (inv, rng) => {
            const OUTCOMES = [
                ['d͡ʒ', 'Latin IAM > Italian "già" /d͡ʒa/'],
                ['ʝ', 'Latin IAM > Spanish "ya" [ʝa]'],
                ['ʒ', 'Latin IAM > French "déjà", Portuguese "já" /ʒa/'],
                ['d͡ʑ', 'Middle Chinese initial *j- > the alveolo-palatal series of the southern dialects'],
            ];
            const present = OUTCOMES.filter(([o]) => has(inv, o));
            const [out, analogue] = present.length ? rng.pick(present) : rng.pick(OUTCOMES);
            return {
                label: `j > ${out} word-initially`,
                a: { is: 'j' }, b: { set: out },
                env: { before: WORD_START },
                analogue,
            };
        },
    },

    // ══════════════════════════════════════════════════════════════════════
    // ASSIMILATION — segments become more like their neighbours. The single
    // largest category of conditioned change in any language.
    // ══════════════════════════════════════════════════════════════════════
    {
        id: 'nasal-place-assimilation', category: 'assimilation', weight: 9,
        applies: (inv) => inv.consonants.some((c) => c.f.manner === 'nasal'),
        build: () => ({
            label: 'nasal place assimilation',
            a: { type: 'C', manner: 'nasal' },
            b: { assimilate: { from: 'after', features: ['place'] } },
            env: { after: [{ type: 'C', manner: ['stop', 'affricate'] }] },
            analogue: 'English "in-possible" → "impossible"; near-universal, and one of the first things children acquire',
        }),
    },
    /**
     * SECONDARY SERIES (DJ, 17 Oct 2026: "drift further"). Earth's large
     * inventories are built by doubling a series, each consonant gaining a
     * partner with a secondary articulation, and each of these begins as a
     * conditioned variant that becomes a phoneme once its condition blurs.
     * Without them a lineage drawn to a large system had only aspiration and
     * palatalisation to grow by and stalled near thirty.
     */
    {
        id: 'labialisation', category: 'assimilation', weight: 3,
        applies: (inv) => inv.vowels.some((v) => v.f.round && v.f.back === 3)
            && consonantsWhere(inv, (c) => ['velar', 'uvular'].includes(c.f.place) && ['stop', 'fricative'].includes(c.f.manner) && !c.f.labialised).length > 0,
        build: (inv, rng) => {
            const places = [...new Set(consonantsWhere(inv, (c) => ['velar', 'uvular'].includes(c.f.place)
                && ['stop', 'fricative'].includes(c.f.manner) && !c.f.labialised).map((c) => c.f.place))];
            if (!places.length) return null;
            const place = rng.pick(places);
            return {
                label: `${place} consonants round before a rounded back vowel`,
                a: { type: 'C', place, manner: ['stop', 'fricative'], labialised: false },
                b: { delta: { labialised: true } },
                env: { after: [{ type: 'V', round: true, back: 3 }] },
                analogue: 'Proto-Indo-European had a whole labiovelar row (*kʷ *gʷ, Latin "quis"); Abkhaz and Ubykh built theirs the same way and have dozens of rounded consonants',
            };
        },
    },
    {
        id: 'secondary-palatalisation', category: 'assimilation', weight: 3,
        applies: (inv) => hasFrontVowel(inv)
            && consonantsWhere(inv, (c) => ['bilabial', 'alveolar', 'dental'].includes(c.f.place) && !c.f.palatalised
                && ['stop', 'nasal', 'fricative', 'trill', 'tap', 'approximant'].includes(c.f.manner)).length >= 3,
        build: (inv, rng) => {
            const labial = rng.bool(0.4);
            return {
                label: `${labial ? 'labials' : 'coronals'} turn soft before front vowels`,
                a: { type: 'C', place: labial ? 'bilabial' : ['alveolar', 'dental'], palatalised: false, manner: ['stop', 'nasal', 'fricative', 'trill', 'tap', 'approximant'] },
                b: { delta: { palatalised: true } },
                env: { after: [{ type: 'V', back: 1 }] },
                analogue: 'Russian and Irish: nearly every consonant has a "soft" partner, made before front vowels and phonemic once the vowels moved (Russian "мат" /mat/ "checkmate" against "мать" /matʲ/ "mother")',
            };
        },
    },
    {
        id: 'glottalisation', category: 'fortition', weight: 1,
        applies: (inv) => has(inv, 'ʔ')
            && consonantsWhere(inv, (c) => !c.f.voice && ['stop', 'affricate'].includes(c.f.manner) && c.f.place !== 'glottal' && !c.f.glottalised).length > 0,
        // the glottal stop on either side: a coda ʔ before an onset stop fuses as readily as one after it
        build: (inv, rng) => {
            const stop = { type: 'C', voice: false, manner: ['stop', 'affricate'], place: { not: 'glottal' }, glottalised: false };
            const before = rng.bool(0.5);
            return {
                label: `a stop and the glottal stop ${before ? 'before' : 'after'} it fuse into an ejective`,
                a: { seq: before ? [{ is: 'ʔ' }, stop] : [stop, { is: 'ʔ' }] },
                b: { keep: before ? 1 : 0, delta: { glottalised: true } },
                env: {},
                analogue: 'Ejectives often begin as a stop beside a glottal stop: the Mayan and Salishan rows are reconstructed from such clusters, and Georgian and its neighbours keep a whole ejective series',
            };
        },
    },
    {
        /**
         * Labial-velar stops (WALS 19A: 8% of languages, most of them in West
         * Africa): a labialised velar whose lip-rounding closes into a second
         * stop.
         */
        id: 'labial-velarisation', category: 'fortition', weight: 0.12,
        applies: (inv) => consonantsWhere(inv, (c) => c.f.place === 'velar' && c.f.manner === 'stop' && c.f.labialised).length > 0,
        build: () => ({
            label: 'the labialised velars close into labial-velar stops (kʷ > k͡p)',
            a: { type: 'C', place: 'velar', manner: 'stop', labialised: true },
            b: { delta: { place: 'labiovelar', labialised: false } },
            env: {},
            analogue: 'Proto-Indo-European *kʷ became p in Greek and the P-Celtic languages (Welsh pump against Irish cóig, "five"), plausibly by way of k͡p; Yoruba, Ewe and Igbo have the labial-velar stops themselves',
        }),
    },
    {
        /**
         * Pharyngeals (WALS 19A: 4% of languages, Semitic, Caucasian, Salish).
         */
        id: 'pharyngealisation', category: 'lenition', weight: 0.5,
        applies: (inv) => consonantsWhere(inv, (c) => c.f.place === 'uvular' && c.f.manner === 'fricative').length > 0,
        build: () => ({
            label: 'the uvular fricatives move back to the pharynx (χ > ħ, ʁ > ʕ)',
            a: { type: 'C', place: 'uvular', manner: 'fricative' },
            b: { delta: { place: 'pharyngeal' } },
            env: {},
            analogue: 'Hebrew merged Proto-Semitic *ḫ [χ] into its ħ and *ġ [ʁ] into its ʕ: its letters ח and ע each stand for two old sounds',
        }),
    },
    {
        /**
         * Implosives (WALS 7A: 13% of languages have them, alone or beside
         * ejectives). The voiced stops are pronounced with the larynx moving
         * down, and the row becomes a glottalic one of its own.
         */
        id: 'implosivisation', category: 'fortition', weight: 0.3,
        applies: (inv) => consonantsWhere(inv, (c) => c.f.voice && c.f.manner === 'stop' && ['bilabial', 'alveolar'].includes(c.f.place) && !c.f.glottalised && !c.f.aspirated).length > 0,
        build: () => ({
            label: 'the voiced stops become implosive',
            a: { type: 'C', manner: 'stop', voice: true, place: ['bilabial', 'alveolar'], glottalised: false, aspirated: false },
            b: { delta: { glottalised: true } },
            env: {},
            analogue: 'Proto-Vietic *b *d became the implosives of Vietnamese (written b and đ); Sindhi, Hausa and many languages of West and Central Africa have an implosive row',
        }),
    },
    {
        /**
         * A voiceless lateral fricative (WALS 8A: 9% of languages have a
         * lateral obstruent) from h or s run together with l.
         */
        id: 'lateral-fricativisation', category: 'assimilation', weight: 1,
        applies: (inv) => has(inv, 'l') && (has(inv, 'h') || has(inv, 's')),
        build: (inv, rng) => {
            const lead = has(inv, 'h') && (!has(inv, 's') || rng.bool(0.5)) ? 'h' : 's';
            return {
                label: `${lead} and l fuse into a voiceless lateral fricative, ɬ`,
                a: { seq: [{ is: lead }, { is: 'l' }] },
                b: { keep: 1, delta: { manner: 'fricative', voice: false } },
                env: {},
                analogue: 'Old English and Icelandic hl- (hlāf "loaf", Icelandic hlaupa "run") made one voiceless lateral of h and l; Welsh ll (Llanelli), Zulu hl and Navajo ł are the same sound',
            };
        },
    },
    {
        id: 'retroflexion', category: 'assimilation', weight: 2,
        applies: (inv) => inv.consonants.some((c) => ['trill', 'tap', 'approximant'].includes(c.f.manner) && c.f.place === 'alveolar' && !c.f.lateral)
            && consonantsWhere(inv, (c) => ['alveolar', 'dental'].includes(c.f.place) && ['stop', 'nasal', 'fricative'].includes(c.f.manner) && !c.f.lateral).length > 0,
        build: () => ({
            label: 'r fuses with the coronal after it into a retroflex',
            a: { seq: [{ type: 'C', manner: ['trill', 'tap', 'approximant'], place: 'alveolar', lateral: false }, { type: 'C', place: ['alveolar', 'dental'], manner: ['stop', 'nasal', 'fricative'], lateral: false }] },
            b: { keep: 1, delta: { place: 'retroflex' } },
            env: {},
            analogue: 'Swedish and Norwegian rt, rd, rn, rs became ʈ ɖ ɳ ʂ ("kort" [kɔʈ]); the same fusion fed the retroflex row of the Indo-Aryan languages',
        }),
    },
    {
        id: 'uvularisation', category: 'assimilation', weight: 3,
        /**
         * The voiced velar stop backs as a fricative (ɡ > ʁ), as Kazakh's does
         * (the letter ғ): so q and ʁ come in pairs, Earth's commoner uvular
         * system (WALS 6A: stops and continuants 8%, stops alone 7%), where
         * backing k and x alone left Andah with stops alone in 18%.
         */
        applies: (inv) => inv.vowels.some((v) => v.f.back === 3 && v.f.height >= 4)
            && consonantsWhere(inv, (c) => c.f.place === 'velar' && !c.f.labialised
                && ((['stop', 'fricative'].includes(c.f.manner) && !c.f.voice) || (c.f.manner === 'stop' && c.f.voice))).length > 0,
        build: (inv, rng) => {
            const targets = consonantsWhere(inv, (c) => c.f.place === 'velar' && !c.f.labialised
                && ((['stop', 'fricative'].includes(c.f.manner) && !c.f.voice) || (c.f.manner === 'stop' && c.f.voice)));
            if (!targets.length) return null;
            const t = rng.pick(targets);
            const voicedStop = t.f.voice && t.f.manner === 'stop';
            return {
                label: `${t.ipa} backs to a uvular${voicedStop ? ' fricative' : ''} before a low back vowel`,
                a: { is: t.ipa }, b: { delta: voicedStop ? { place: 'uvular', manner: 'fricative' } : { place: 'uvular' } },
                env: { after: [{ type: 'V', back: 3, height: { min: 4 } }] },
                analogue: 'Kazakh and Kyrgyz say [q] before back vowels and [k] before front ones; in Arabic, Quechua and the Inuit languages /q/ is a phoneme of its own',
            };
        },
    },
    {
        /**
         * A uvular stop turns fricative between vowels (q > χ, ɢ > ʁ) and
         * stays a stop elsewhere, so the language has both: Earth's commoner
         * uvular system (WALS 6A: stops and continuants in 8% of languages,
         * stops alone in 7%), as Kazakh and Uzbek q is [χ] between vowels and
         * the Inuit languages have q beside ʁ. Follows uvularisation seven
         * times in ten, and comes on its own where the q is old: backing k
         * alone left 18% of Andah with uvular stops only and 1% with both
         * (at weight 0.5 and half the time, 17% and 2%).
         */
        id: 'uvular-spirantisation', category: 'lenition', weight: 2,
        applies: (inv) => consonantsWhere(inv, (c) => c.f.place === 'uvular' && c.f.manner === 'stop').length > 0
            && !consonantsWhere(inv, (c) => c.f.place === 'uvular' && c.f.manner === 'fricative').length,
        build: (inv, rng) => {
            const stops = consonantsWhere(inv, (c) => c.f.place === 'uvular' && c.f.manner === 'stop');
            if (!stops.length || consonantsWhere(inv, (c) => c.f.place === 'uvular' && c.f.manner === 'fricative').length) return null;
            const t = rng.pick(stops);
            return {
                label: `${t.ipa} becomes a fricative between vowels`,
                a: { is: t.ipa }, b: { delta: { manner: 'fricative' } },
                env: { before: [V], after: [V] },
                analogue: 'Kazakh and Uzbek q is [χ] between vowels; the Inuit languages have q beside ʁ',
            };
        },
    },
    {
        id: 'palatalisation', category: 'assimilation', weight: 10,
        applies: (inv) => hasFrontVowel(inv) && (has(inv, 'k') || has(inv, 't') || has(inv, 'ɡ')),
        /**
         * Palatalisation before a front vowel.
         *
         * The outcome depends on where the palatalising consonant STARTED, and
         * the two branches used to be textually identical — both hardcoded the
         * alveolo-palatal /t͡ɕ d͡ʑ/, which is the Mandarin outcome. At joint-
         * highest weight in the shared catalogue, that quietly gave every family
         * in the tree a Sinitic sibilant series, and /d͡ʑ/ was the sole surviving
         * voiced obstruent in several of them.
         *
         *   velar    → postalveolar   Latin CENTUM > Italian "cento" /tʃ/
         *   alveolar → alveolo-palatal  Japanese /ti/ > /t͡ɕi/; Polish /t/ > /t͡ɕ/
         */
        build: (inv, rng) => {
            const targets = consonantsWhere(inv, (c) => ['velar', 'alveolar'].includes(c.f.place) && c.f.manner === 'stop');
            if (!targets.length) return null;
            const t = rng.pick(targets);

            // Don't hand a voiced obstruent to a language that has just lost its
            // voiced series — that would reintroduce by the back door exactly
            // what a devoicing change had removed.
            const hasVoicedObstruents = inv.consonants.some((c) => c.f.voice && ['stop', 'affricate', 'fricative'].includes(c.f.manner));
            const voiced = t.f.voice && hasVoicedObstruents;

            const out = t.f.place === 'velar'
                ? (voiced ? 'd͡ʒ' : 't͡ʃ')
                : (voiced ? 'd͡ʑ' : 't͡ɕ');
            return {
                label: `${t.ipa} > ${out} before a front vowel`,
                a: { is: t.ipa }, b: { set: out },
                env: { after: [{ any: [{ type: 'V', back: 1 }, { is: 'j' }] }] },
                analogue: t.f.place === 'velar'
                    ? 'Latin CENTUM /k/ → Italian "cento" /tʃ/ — the most frequent conditioned change on earth, and the reason English spelling has soft ⟨c⟩ and ⟨g⟩'
                    : 'Japanese /ti/ > /t͡ɕi/ (チ); Polish and Russian palatalised dentals',
            };
        },
    },
    {
        id: 'umlaut', category: 'assimilation', weight: 6,
        applies: (inv) => inv.vowels.some((v) => v.f.back === 3) && (has(inv, 'i') || has(inv, 'j')),
        build: () => ({
            label: 'i-umlaut (fronting before /i/ or /j/)',
            a: { type: 'V', back: 3 },
            b: { delta: { back: 1 } },
            env: { after: [{ any: [C, V] }, { any: [{ is: 'i' }, { is: 'j' }] }] },
            analogue: 'Proto-Germanic *mūsiz > Old English "mȳs" > "mice"; the trigger is then usually lost, stranding the umlaut as the sole plural marker',
            note: 'A classic counterbleeding setup: when the conditioning /i/ later drops, the fronting becomes opaque and turns into morphology.',
        }),
    },
    {
        id: 'vowel-harmony-spread', category: 'assimilation', weight: 4,
        applies: (inv) => inv.vowels.filter((v) => v.f.back === 1).length >= 2 && inv.vowels.filter((v) => v.f.back === 3).length >= 2,
        build: () => ({
            label: 'backness harmony spreads rightwards',
            a: { type: 'V', stress: 'unstressed' },
            b: { assimilate: { from: 'before', features: ['back'], nearest: 'V' } },
            env: { before: [{ type: 'V', stress: 'stressed' }, C] },
            analogue: 'Turkish and Finnish vowel harmony; the stressed vowel dictates the backness of everything after it',
        }),
    },
    {
        id: 'final-devoicing', category: 'assimilation', weight: 7,
        applies: (inv, pt) => hasVoicingContrast(inv) && (pt?.coda?.max ?? 0) > 0,
        build: () => ({
            label: 'final devoicing',
            a: { type: 'C', voice: true, manner: ['stop', 'fricative', 'affricate'] },
            b: { delta: { voice: false } },
            env: { after: WORD_END },
            analogue: 'German "Rad" and "Rat" both /raːt/; Russian, Dutch, Polish, Turkish all do the same. Voicing is hard to maintain with no following vowel to carry it',
        }),
    },
    {
        id: 'vowel-nasalisation', category: 'assimilation', weight: 0.8,
        applies: (inv, pt) => inv.consonants.some((c) => c.f.manner === 'nasal') && (pt?.coda?.allowed || []).some((x) => ['n', 'm', 'ŋ'].includes(x)),
        build: () => ({
            label: 'vowel nasalisation before a nasal coda',
            a: { type: 'V' },
            b: { delta: { nasal: true } },
            // before a nasal that closes the syllable, as the label says: French
            // nasalised "an" and "bon", not the a of "ami"
            env: { after: [{ type: 'C', manner: 'nasal' }, { any: [{ type: 'C' }, { boundary: '#' }] }] },
            analogue: 'French VINUM > "vin" /vɛ̃/; the nasal is then lost and the nasalisation becomes contrastive — a split, created properly',
        }),
    },
    {
        // only ever paired with vowel-nasalisation: the nasal coda that caused it goes
        id: 'nasal-coda-loss', category: 'deletion', weight: 0,
        applies: (inv) => inv.consonants.some((c) => c.f.manner === 'nasal'),
        build: () => ({
            label: 'the final nasal is lost, leaving the vowel nasal',
            a: { type: 'C', manner: 'nasal' }, b: { empty: true },
            env: { before: [{ type: 'V', nasal: true }], after: WORD_END },
            analogue: 'French bon /bɔ̃/, Portuguese bom /bõ/: the vowel keeps the nasal the word lost',
        }),
    },

    // ══════════════════════════════════════════════════════════════════════
    // DISSIMILATION — the opposite, and much rarer. Two similar segments in
    // one word are hard to plan and produce, so one of them changes.
    // ══════════════════════════════════════════════════════════════════════
    {
        id: 'liquid-dissimilation', category: 'dissimilation', weight: 2,
        applies: (inv) => has(inv, 'r') && has(inv, 'l'),
        build: () => ({
            label: 'r … r > l … r',
            a: { is: 'r' }, b: { set: 'l' },
            env: { after: [{ any: [C, V] }, { any: [C, V] }, { is: 'r' }] },
            probability: 0.6,
            analogue: 'Latin PEREGRINUS > "pilgrim"; ARBOREM > Spanish "árbol". Sporadic rather than regular, which is why it is modelled probabilistically',
        }),
    },
    {
        id: 'grassmann', category: 'dissimilation', weight: 2,
        applies: (inv) => inv.consonants.some((c) => c.f.aspirated),
        build: () => ({
            label: "Grassmann's Law (deaspiration of the first of two aspirates)",
            a: { type: 'C', aspirated: true },
            b: { delta: { aspirated: false } },
            env: { after: [{ any: [C, V] }, { any: [C, V] }, { type: 'C', aspirated: true }] },
            analogue: 'Sanskrit *bʰabʰūva > "babhūva"; Greek *tʰritʰos > "tritos". Discovered by the same Grassmann as the algebra',
        }),
    },

    // ══════════════════════════════════════════════════════════════════════
    // DELETION — where morphology goes to die. Which syllables get eaten is
    // decided by the stress rule, which is why the stress rule is the highest-
    // leverage choice in the whole engine.
    // ══════════════════════════════════════════════════════════════════════
    {
        id: 'apocope', category: 'deletion', weight: 8,
        dynamicWeight: openness,
        applies: () => true,
        build: () => ({
            label: 'apocope (loss of the final unstressed vowel)',
            a: { type: 'V', stress: 'unstressed' },
            b: { empty: true },
            env: { before: [C], after: WORD_END },
            analogue: 'Latin PANEM > French "pain"; Old English "nama" > "name" > /neɪm/. The main engine of case-system collapse',
            note: 'This is the rule that kills inflection. Every case ending sitting in a final unstressed syllable dies here at once.',
        }),
    },
    {
        id: 'syncope', category: 'deletion', weight: 6,
        dynamicWeight: openness,
        applies: () => true,
        build: () => ({
            label: 'syncope (loss of a medial unstressed vowel)',
            a: { type: 'V', stress: 'unstressed' },
            b: { empty: true },
            env: { before: [{ ...V, stress: 'stressed' }, C], after: [C, V] },
            analogue: 'Latin CALIDUM > Spanish "caldo"; English "chocolate" /ˈtʃɒklət/. Creates clusters the language must then repair',
        }),
    },
    {
        /**
         * The unstressed vowel of a first syllable goes, leaving the word
         * starting on two consonants: the main source of the onset clusters
         * that make a language's syllables complex (WALS 12A: 31% of Earth's).
         */
        id: 'pretonic-syncope', category: 'deletion', weight: 1.5,
        dynamicWeight: openness,
        applies: () => true,
        build: () => ({
            label: 'the unstressed vowel of a first syllable is lost (CVCV́ > CCV́)',
            a: { type: 'V', stress: 'unstressed' },
            b: { empty: true },
            env: { before: [{ boundary: '#' }, C], after: [C, { ...V, stress: 'stressed' }] },
            analogue: 'Common Slavic lost its weak vowels: *mъnogo, *dъva and *kъto became Russian mnogo, dva and kto',
        }),
    },
    {
        id: 'final-consonant-loss', category: 'deletion', weight: 6,
        dynamicWeight: closingRepair,
        applies: (inv, pt) => codas(inv, pt).length > 0,
        build: (inv, rng, pt, ctx) => {
            // now and then all of them at once: the road to a (C)V language (WALS 12A: 13% of
            // Earth's), and most often in a lineage drawn to open syllables
            if (rng.bool(ctx?.open ? 0.6 : 0.2)) {
                return {
                    label: 'every final consonant is lost',
                    a: { type: 'C' }, b: { empty: true },
                    env: { after: WORD_END },
                    analogue: 'Proto-Oceanic to Proto-Polynesian lost every final consonant, which is why Polynesian words all end in a vowel',
                };
            }
            const pool = codas(inv, pt);
            const target = rng.pick(pool);
            if (!target) return null;
            return {
                label: `loss of final ${target}`,
                a: { is: target }, b: { empty: true },
                env: { after: WORD_END },
                analogue: 'Latin final -M and -S lost across Romance; Middle Chinese final stops lost in Mandarin — where their loss is exactly what produced the tone categories',
            };
        },
    },
    {
        id: 'cluster-simplification', category: 'deletion', weight: 6,
        dynamicWeight: closingRepair,
        applies: (inv) => true,
        build: () => ({
            label: 'cluster simplification',
            a: { type: 'C', manner: 'stop' },
            b: { empty: true },
            // Liquids and glides belong in this list. Without them the rule was
            // structurally incapable of matching a single cluster this engine
            // produces — every onset cluster in the tree is C+liquid (tʰr, nr,
            // nl, hr, t͡ɕl) — so it was applicable at every stage and selected
            // zero times in 801 draws.
            env: { after: [{ type: 'C', manner: ['stop', 'fricative', 'affricate', 'nasal', 'trill', 'tap', 'approximant'] }] },
            analogue: 'Latin SEPTEM > Spanish "siete"; English "knight" losing its /k/',
        }),
    },
    {
        /**
         * A glide after a consonant is lost (yod-dropping): American English
         * tune and news, said without the y of British [tjuːn]; French qui
         * and quand, said with a plain [k] for Latin qu. An open-syllable
         * lineage's repair of its consonant-glide onsets (generate.js
         * OPEN_REPAIRS), rare elsewhere: lineages turned open lost their codas
         * and kept onsets like nja, ʃwo and hja in a tenth of their words, so
         * 8 of 107 reached (C)V (WALS 12A counts CjV as moderately complex).
         */
        id: 'glide-loss', category: 'deletion', weight: 0.5,
        dynamicWeight: (inv, pt, ctx) => (ctx?.open ? closingRepair(inv, pt, ctx) : 0.3),
        applies: (inv) => has(inv, 'j') || has(inv, 'w'),
        build: (inv, rng, pt, ctx) => {
            // the glide with more clusters in the words
            const count = (g) => (ctx?.probe || []).filter((e) => e.form?.some((ph, i) => i > 0 && ph.ipa === g && e.form[i - 1].type === 'C')).length;
            const cj = has(inv, 'j') ? count('j') : -1, cw = has(inv, 'w') ? count('w') : -1;
            const glide = cj >= cw ? 'j' : 'w';
            return {
                label: `${glide} is lost after a consonant (C${glide} > C)`,
                a: { is: glide }, b: { empty: true },
                env: { before: [{ type: 'C' }] },
                analogue: glide === 'j' ? 'American English tune and news, said without the y of British [tjuːn]' : 'French qui and quand, said with a plain [k] for the Latin qu',
            };
        },
    },
    {
        /**
         * Degemination.
         *
         * Previously this was live and was an IDENTITY MAP: `skip: true` sat
         * inside the object returned by `build()`, where the filter at the
         * bottom of the file could never see it, and the rule `{seq:[C,C]} >
         * {delta:{}}` matched 350 words and changed none of them. The "handled
         * specially in generate.js" comment was false — there is no such
         * handling.
         *
         * Written properly it needs a CONCRETE geminate to target, so that a
         * language with no geminates rejects it at the probe rather than
         * carrying a no-op rule in its change log.
         *
         * Conditioned, because degemination is not universal: Italian, Finnish
         * and Japanese have length as a defining contrast, and Western Romance
         * lost only its OBSTRUENT geminates — Latin -NN- and -LL- palatalised
         * instead (ANNUM > año, CABALLUM > caballo).
         */
        /**
         * A coda takes on the sound of the consonant after it, leaving a long
         * consonant that later shortens: the main road from closed syllables
         * to open ones besides deletion. Cluster simplification takes only a
         * stop, so a nasal, liquid or fricative coda (umka, enemne) was never
         * repaired.
         */
        id: 'cluster-assimilation', category: 'assimilation', weight: 1,
        // mostly an open-syllable lineage's: at full rate everywhere it left 15% of Andah's
        // languages with complex syllables against Earth's 31%
        dynamicWeight: (inv, pt, ctx) => (ctx?.open ? closingRepair(inv, pt, ctx) : 0.3),
        applies: () => true,
        build: () => ({
            label: 'a consonant before another takes on its sound (C1C2 > C2C2)',
            a: { type: 'C' },
            b: { assimilate: { from: 'after', features: ['place', 'manner', 'voice', 'lateral', 'aspirated', 'glottalised', 'palatalised', 'labialised'] } },
            env: { before: [V], after: [{ type: 'C', lateral: false, manner: { not: ['approximant', 'trill', 'tap'] } }] },
            analogue: 'Sanskrit karma, dharma and sapta became Pali kamma, dhamma and satta: Middle Indo-Aryan assimilated nearly every cluster, and the doubled consonants later shortened (Hindi kām, sāt)',
        }),
    },
    {
        /**
         * A consonant and the glide after it fall together into one
         * palatalised or labialised consonant: the commonest end of a C+j or
         * C+w cluster, and the last cluster an open-syllable language keeps
         * (the most open Andah languages were (C)V but for Cj onsets in a
         * quarter of their words).
         */
        id: 'glide-coalescence', category: 'assimilation', weight: 2,
        dynamicWeight: closingRepair,
        applies: (inv) => has(inv, 'j') || has(inv, 'w'),
        build: (inv, rng, pt, ctx) => {
            // the glide with more clusters in the words, else j most often
            const count = (g) => (ctx?.probe || []).filter((e) => e.form?.some((ph, i) => i > 0 && ph.ipa === g && e.form[i - 1].type === 'C')).length;
            const cj = has(inv, 'j') ? count('j') : -1, cw = has(inv, 'w') ? count('w') : -1;
            const j = cj > cw || (cj === cw && has(inv, 'j') && rng.bool(0.7));
            const glide = j ? 'j' : 'w';
            return {
                label: `a consonant and the ${glide} after it fall together (C${glide} > C${j ? 'ʲ' : 'ʷ'})`,
                // any consonant but a glide, l included (Italian gli)
                a: { seq: [{ any: [
                    { type: 'C', manner: { not: ['approximant'] }, palatalised: false, labialised: false },
                    { type: 'C', lateral: true, palatalised: false, labialised: false },
                ] }, { is: glide }] },
                b: { keep: 0, delta: j ? { palatalised: true } : { labialised: true } },
                env: {},
                analogue: j
                    ? 'Latin -nj- and -lj- became Spanish ñ and Italian gli (vinea > viña, filia > figlia); Common Slavic *Cj became palatals (*světja > Russian sveča)'
                    : 'Latin qu and gu were single labialised stops, kʷ and ɡʷ, as the Proto-Indo-European *kʷ was',
            };
        },
    },
    {
        /**
         * A vowel after a word-final consonant: the open-syllable languages'
         * own repair, rare elsewhere (English adds none).
         */
        id: 'paragoge', category: 'insertion', weight: 1,
        // an open-syllable lineage's own repair (generate.js OPEN_REPAIRS); rare elsewhere
        dynamicWeight: (inv, pt, ctx) => (ctx?.open ? 1 : 0.1 + (closingRepair(inv, pt, ctx) - 1)),
        applies: () => true,
        build: (inv, rng) => {
            const v = rng.pick(vowelsWhere(inv, (x) => !x.f.nasal && !x.f.long && !x.f.tone && x.f.height >= 1)) || inv.vowels[0];
            return {
                label: `a vowel is added after a final consonant (∅ > ${v.ipa} / C_#)`,
                a: { empty: true }, b: { set: v.ipa },
                env: { before: [{ type: 'C' }], after: WORD_END },
                analogue: 'Japanese and Hawaiian end every loan in a vowel (Christmas: kurisumasu, Kalikimaka); Sardinian added echo vowels to Latin final consonants (tempus > tempusu)',
            };
        },
    },
    {
        id: 'degemination', category: 'deletion', weight: 4,
        applies: (inv, pt, ctx) => geminatesIn(ctx).length > 0,
        build: (inv, rng, pt, ctx) => {
            const g = rng.pick(geminatesIn(ctx));
            if (!g) return null;
            return {
                label: `${g}${g} > ${g} (degemination)`,
                a: { seq: [{ is: g }, { is: g }] },
                b: { keep: 0 },
                env: {},
                analogue: 'Western Romance lost its obstruent geminates: Latin GUTTAM > Spanish "gota", CUPPAM > "copa"',
            };
        },
    },

    // ══════════════════════════════════════════════════════════════════════
    // INSERTION — languages repair sequences they cannot pronounce.
    // ══════════════════════════════════════════════════════════════════════
    {
        id: 'prothesis', category: 'insertion', weight: 3,
        applies: (inv) => has(inv, 's'),
        build: (inv, rng) => {
            const v = rng.pick(vowelsWhere(inv, (x) => x.f.height <= 3)) || inv.vowels[0];
            return {
                label: `∅ > ${v.ipa} / #_ sC`,
                a: { empty: true }, b: { set: v.ipa },
                env: { before: WORD_START, after: [{ is: 's' }, { type: 'C', manner: { not: 'approximant' } }] },
                analogue: 'Latin SCHOLA > Spanish "escuela"; still productive today in "estrés", "esnob"',
            };
        },
    },
    {
        id: 'anaptyxis', category: 'insertion', weight: 3,
        dynamicWeight: closingRepair,
        applies: (inv) => true,
        build: (inv, rng, pt, ctx) => {
            const v = rng.pick(vowelsWhere(inv, (x) => x.f.height === 3 || x.f.back === 2)) || inv.vowels[0];
            return {
                label: `epenthesis in a liquid cluster`,
                a: { empty: true }, b: { set: v.ipa },
                // an open-syllable lineage breaks up nasal + liquid too, and a consonant and a glide
                // (Japanese gives English cute and queen extra vowels: kyūto, kuīn)
                env: { before: [{ type: 'C', manner: ctx?.open ? ['stop', 'fricative', 'affricate', 'nasal'] : ['stop', 'fricative'] }], after: [{ class: ctx?.open ? ['liquid', 'glide'] : 'liquid' }] },
                analogue: 'Old English "æcern" > "acorn"; Dutch "melk" [mɛlək]. The cluster is broken up rather than simplified',
            };
        },
    },
    {
        id: 'excrescent-stop', category: 'insertion', weight: 2,
        applies: (inv) => inv.consonants.some((c) => c.f.manner === 'nasal') && has(inv, 's'),
        build: () => ({
            label: 'excrescent stop between a nasal and a fricative',
            a: { empty: true }, b: { set: 't' },
            env: { before: [{ is: 'n' }], after: [{ is: 's' }] },
            analogue: 'Latin *emere > English "empty"; "Thomson" → "Thompson". The velum closes before the oral gesture releases, and a stop falls out',
        }),
    },

    // ══════════════════════════════════════════════════════════════════════
    // REARRANGEMENT
    // ══════════════════════════════════════════════════════════════════════
    {
        /**
         * Liquid metathesis.
         *
         * The `after` condition is load-bearing and its absence made this rule
         * the engine's cluster factory: unconditioned, /nara/ became /nraa/ and
         * /mala/ became /mlaa/, manufacturing an onset cluster AND a hiatus in
         * one step, 71 times across the tree. It was also the source of a word
         * for "big" spelled /rrəjau/, whose onset the language's own
         * phonotactics reject.
         *
         * Requiring a consonant or a word edge AFTER the liquid means only a
         * CODA liquid metathesises — which is what the attested change is.
         * Proto-Slavic *gordъ > OCS gradъ, *melko > mlěko: the liquid closing a
         * syllable moves in front of its vowel, and the syllable thereby becomes
         * open. No regular sound law turns an open #CV.RV into #CRV.V.
         *
         * (`{not: {type:'V'}}` rather than `{any:[C, {boundary:'#'}]}` — both
         * now work, but the negative form reads as what it means.)
         */
        id: 'liquid-metathesis', category: 'rearrangement', weight: 2,
        applies: (inv) => has(inv, 'r') || has(inv, 'l'),
        build: () => ({
            label: 'metathesis of a coda liquid',
            a: { seq: [V, { class: 'liquid' }] }, b: { swap: true },
            env: { before: [{ boundary: '#' }, C], after: [{ not: { type: 'V' } }] },
            /**
             * Regular, not sporadic. The Slavic liquid metathesis this models
             * caught every *CoRC in South Slavic; it is a textbook regular sound
             * law. At probability 0.7 a third of eligible words escaped it on
             * every edge where it fired, which made it the largest single source
             * of irregular reflexes in the corpus.
             */
            analogue: 'Proto-Slavic *gordъ > Old Church Slavonic "gradъ", *melko > "mlěko" — the liquid closing a syllable moves in front of its vowel, opening it',
        }),
    },

    // ══════════════════════════════════════════════════════════════════════
    // VOWEL CHANGES
    // ══════════════════════════════════════════════════════════════════════
    {
        // Weight 2.5, not 4: reduction belongs to strong-stress languages
        // (English, Russian, Portuguese) and is absent from syllable-timed ones
        // (Spanish, Italian, Japanese), yet at 4 it put a schwa in 94-100% of
        // the leaves of every family. Family drift now decides who leans to it.
        id: 'reduction-to-schwa', category: 'vowel', weight: 2.5,
        applies: () => true,
        build: () => ({
            label: 'unstressed vowels reduce to schwa',
            a: { type: 'V', stress: 'unstressed' },
            b: { set: 'ə' },
            env: {},
            analogue: 'English "atom"/"atomic"; the reason English spelling and pronunciation diverge so badly in unstressed syllables',
            note: 'Reduction is the step before deletion. A language that reduces has already started dismantling its unstressed morphology.',
        }),
    },
    {
        /**
         * Loss of the reduced vowel.
         *
         * Reduction is a STAGE, not a terminus. Once a language has a schwa,
         * the commonest next event is that the schwa disappears between
         * consonants — French "samedi" [samdi] beside "vendredi" [vɑ̃dʁədi];
         * English "chocolate", "camera", "family". Without this the engine
         * reduced 84 times across the tree and never removed a single schwa,
         * which is how one vowel came to be half of every vowel token in the
         * family.
         *
         * NOT a PAIRED partner of reduction. `PAIRED` is unconditional, and
         * welding the two would assert that no language can have a stable
         * reduced vowel — English has had one for 800 years, and German, Dutch,
         * Catalan, Romanian and Albanian all contrast one. Reduction FEEDS this
         * (the schwa must exist for `applies` to pass) without compelling it.
         *
         * `tone: null` in the matcher matters: without it the rule also deletes
         * ə̃, əː and ə˩, destroying nasality, length and tone contrasts that
         * other changes have just created.
         */
        id: 'schwa-syncope', category: 'deletion', weight: 5,
        applies: (inv) => inv.vowels.some((v) => v.f.height === 3 && v.f.back === 2 && !v.f.round && !v.f.tone),
        build: () => ({
            label: 'loss of the reduced vowel between consonants',
            a: { type: 'V', stress: 'unstressed', height: 3, back: 2, round: false, tone: null, long: false },
            b: { empty: true },
            env: { before: [{ type: 'C' }], after: [{ type: 'C' }] },
            // Frequency-led, as lexical diffusion really is: common words lead
            // the deletion and rare ones lag, which is why English "every" has
            // two syllables and "battery" often still has three.
            conditions: { maxRank: 900 },
            analogue: 'French "samedi" [samdi] vs "vendredi" [vɑ̃dʁədi]; English "chocolate", "camera", "family"',
        }),
    },
    {
        /**
         * Loss of contrastive vowel length.
         *
         * One of the two great distinction-REMOVERS this catalogue was missing.
         * Gated on the language not declaring length as a contrast, so a family
         * that asked for length is never stripped of it.
         */
        id: 'quantity-collapse', category: 'vowel', weight: 4,
        applies: (inv, pt) => !pt?.nucleus?.longVowels && inv.vowels.some((v) => v.f.long),
        build: () => ({
            label: 'loss of contrastive vowel length',
            a: { type: 'V', long: true }, b: { delta: { long: false } },
            env: {},
            analogue: 'Ancient → Modern Greek lost quantity outright; Russian and most Slavic likewise',
        }),
    },
    {
        /**
         * Consonant merger.
         *
         * The counterpart of vowel-merger, and its absence is why inventories
         * only ever grew: the catalogue could add consonant distinctions
         * (palatalisation, tonogenesis splits, retroflexion) and had no way at
         * all to remove one.
         *
         * Weighted by CROWDING, so a language with forty consonants merges
         * readily and one with fifteen rarely does.
         */
        id: 'consonant-merger', category: 'other', weight: 5,
        dynamicWeight: (inv, pt, ctx) => crowding(inv, ctx),
        applies: (inv) => adjacentConsonantPairs(inv).length > 0,
        build: (inv, rng) => {
            const pair = rng.pick(adjacentConsonantPairs(inv));
            if (!pair) return null;
            const [from, to] = pair;
            return {
                label: `${from.ipa} merges into ${to.ipa}`,
                a: { is: from.ipa }, b: { set: to.ipa },
                env: {},
                analogue: 'Spanish merged /b/ and /v/; most of English merged /ʍ/ into /w/; Old English lost the /x/ of "niht"',
            };
        },
    },
    /**
     * SERIES MERGERS. A pair at a time, a lineage drawn to a small system
     * (Polynesian, the Papuan highlands) could not get there: Earth's small
     * inventories lost whole rows of contrasts at once.
     */
    {
        id: 'voicing-merger', category: 'other', weight: 0.6,
        /**
         * Plain mergers belong to languages of longer words. Where words are
         * one syllable the voicing contrast goes through tone instead
         * (tonogenesis-voicing and its devoicing partner: Chinese, Vietnamese),
         * and an unweighted merger here took the voicing those languages needed
         * to grow tone (toneless went from 64% to 74%).
         */
        dynamicWeight: (inv, pt, ctx) => 0.1 + 1.5 * (1 - monosyllabicity(ctx)) ** 2,
        applies: (inv) => inv.consonants.some((c) => c.f.voice && ['stop', 'affricate'].includes(c.f.manner))
            && inv.consonants.some((c) => !c.f.voice && ['stop', 'affricate'].includes(c.f.manner)),
        /**
         * Usually the fricatives go with the stops: a language without voiced
         * stops seldom keeps voiced fricatives (WALS 4A: 32% of languages have
         * no voicing contrast at all, 7% have it in the fricatives alone).
         */
        build: (inv, rng) => {
            const fricatives = rng.bool(0.8);
            return {
                label: `the voiced ${fricatives ? 'obstruents' : 'stops'} merge with the voiceless`,
                a: { type: 'C', voice: true, manner: fricatives ? ['stop', 'affricate', 'fricative'] : ['stop', 'affricate'], place: { not: 'glottal' }, lateral: false },
                b: { delta: { voice: false } },
                env: {},
                analogue: 'Tocharian merged all three Proto-Indo-European stop rows into one voiceless row; the Polynesian languages, Finnish and most Australian languages have no voicing contrast in their stops',
            };
        },
    },
    {
        /**
         * The voiced fricatives alone merge with the voiceless, leaving the
         * stops: WALS 4A's commonest system with voicing is the plosives
         * alone (33% of languages, against 7% for the fricatives alone).
         */
        id: 'fricative-devoicing', category: 'other', weight: 1.2,
        applies: (inv) => inv.consonants.some((c) => c.f.voice && c.f.manner === 'fricative' && c.f.place !== 'glottal' && !c.f.lateral),
        build: () => ({
            label: 'the voiced fricatives merge with the voiceless',
            a: { type: 'C', voice: true, manner: 'fricative', place: { not: 'glottal' }, lateral: false },
            b: { delta: { voice: false } },
            env: {},
            analogue: 'Spanish devoiced its sibilants in the sixteenth century (/z ʒ dz/ > /s ʃ ts/) and kept /b d ɡ/; Dutch in the Netherlands is merging /v z/ into /f s/',
        }),
    },
    {
        /**
         * The two liquids fall together (WALS 8A: 17% of languages have no
         * lateral at all). Either way: into the rhotic, and the language has
         * no l, or into l, and it has no r.
         */
        id: 'liquid-merger', category: 'other', weight: 0.5,
        applies: (inv) => has(inv, 'l') && inv.consonants.some((c) => c.f.place === 'alveolar' && !c.f.lateral && ['trill', 'tap', 'approximant'].includes(c.f.manner)),
        build: (inv, rng) => {
            const rhotic = inv.consonants.find((c) => c.f.place === 'alveolar' && !c.f.lateral && ['tap', 'trill', 'approximant'].includes(c.f.manner));
            if (!rhotic) return null;
            const toRhotic = rng.bool(0.5);
            return toRhotic ? {
                label: `l merges into ${rhotic.ipa}: one liquid, and no lateral`,
                a: { type: 'C', place: 'alveolar', lateral: true, manner: 'approximant' },
                b: { delta: { lateral: false, manner: rhotic.f.manner } },
                env: {},
                analogue: 'Japanese and Korean have a single liquid; Japanese /r/ is a flap that never contrasts with an l',
            } : {
                label: `${rhotic.ipa} merges into l: one liquid, and no r`,
                a: { type: 'C', place: 'alveolar', lateral: false, manner: ['trill', 'tap', 'approximant'] },
                b: { delta: { lateral: true, manner: 'approximant' } },
                env: {},
                analogue: 'Hawaiian merged Proto-Polynesian *l and *r into its one l; Mandarin has l and no trill or flap',
            };
        },
    },
    {
        /**
         * The velar nasal goes (WALS 9A: half of Earth's languages have none).
         */
        id: 'velar-nasal-merger', category: 'other', weight: 0.5,
        applies: (inv) => has(inv, 'ŋ') && has(inv, 'n'),
        build: () => ({
            label: 'ŋ merges into n',
            a: { type: 'C', place: 'velar', manner: 'nasal' },
            b: { delta: { place: 'alveolar' } },
            env: {},
            analogue: 'Hawaiian n is Proto-Polynesian *ŋ (Proto-Polynesian *taŋata "person" > Hawaiian kanaka), where Samoan keeps it; Mandarin lost Middle Chinese initial ŋ- altogether',
        }),
    },
    {
        id: 'place-merger', category: 'other', weight: 2,
        applies: (inv) => (has(inv, 't') && has(inv, 'k')) || (has(inv, 'k') && has(inv, 'ʔ')),
        build: (inv, rng) => {
            const options = [];
            if (has(inv, 't') && has(inv, 'k')) options.push(['t', 'k', 'Hawaiian *t became /k/ ("tapu" > "kapu"), and colloquial Samoan does the same today']);
            if (has(inv, 'k') && has(inv, 'ʔ')) options.push(['k', 'ʔ', 'Hawaiian and Tahitian *k became the glottal stop; Hawaiian now has eight consonants']);
            if (!options.length) return null;
            const [from, to, analogue] = rng.pick(options);
            return {
                label: `${from} merges into ${to}`,
                a: { is: from }, b: { set: to },
                env: {},
                analogue,
            };
        },
    },
    {
        /**
         * Vowel merger — two qualities collapse into one.
         *
         * The catalogue could raise, lower, diphthongise, front and nasalise
         * vowels, but it had no way to REDUCE the number of qualities, so every
         * family's vowel system only ever grew. Ten qualities after six thousand
         * years was the result, and no natural language works that way: merger
         * is at least as common as split, and it is the balance between the two
         * that keeps real inventories in a narrow band.
         */
        id: 'vowel-merger', category: 'vowel', weight: 6,
        dynamicWeight: (inv) => Math.max(0.3, Math.min(3, Math.exp((inv.vowels.length - 7) / 3))),
        applies: (inv) => adjacentVowelPairs(inv).length > 0,
        build: (inv, rng) => {
            const pair = rng.pick(adjacentVowelPairs(inv));
            if (!pair) return null;
            const [from, to] = pair;
            return {
                label: `${from.ipa} merges into ${to.ipa}`,
                a: { is: from.ipa }, b: { set: to.ipa },
                env: {},
                analogue: 'Vulgar Latin ĭ and ē merge as /e/, ŭ and ō as /o/ — the change that rebuilt the Romance vowel system on quality; English "meet"/"meat"',
            };
        },
    },
    {
        /**
         * Denasalisation — the other missing remover.
         *
         * Attributed to French rather than to Spanish-vs-Portuguese: Portuguese
         * nasal vowels arise chiefly from loss of intervocalic /n/ (LŪNA > lũa >
         * lua), which Spanish never underwent, so Spanish never nasalised in the
         * first place rather than denasalising.
         */
        id: 'denasalisation', category: 'vowel', weight: 3,
        applies: (inv) => inv.vowels.some((v) => v.f.nasal),
        build: () => ({
            label: 'denasalisation of vowels',
            a: { type: 'V', nasal: true }, b: { delta: { nasal: false } },
            env: {},
            analogue: 'French "bon" /bɔ̃/ ~ "bonne" /bɔn/ — the nasal vowel denasalises before an intervocalic nasal',
        }),
    },
    {
        id: 'raising', category: 'vowel', weight: 6,
        applies: (inv) => inv.vowels.some((v) => v.f.height >= 2 && v.f.height <= 4),
        build: (inv, rng) => {
            const pool = vowelsWhere(inv, (v) => v.f.height >= 2 && v.f.height <= 4);
            const t = rng.pick(pool);
            if (!t) return null;
            return {
                label: `${t.ipa} raises`,
                a: { is: t.ipa }, b: { delta: { height: '-1' } },
                env: {},
                analogue: 'The Great Vowel Shift raised every English long vowel one step; Middle English /eː/ > /iː/ is why "meet" is spelled the way it is',
            };
        },
    },
    {
        id: 'lowering', category: 'vowel', weight: 4,
        applies: (inv) => inv.vowels.some((v) => v.f.height <= 3),
        build: (inv, rng) => {
            const t = rng.pick(vowelsWhere(inv, (v) => v.f.height <= 3));
            if (!t) return null;
            return {
                label: `${t.ipa} lowers`,
                a: { is: t.ipa }, b: { delta: { height: '+1' } },
                env: {},
                analogue: 'Vulgar Latin ĭ > e, ŭ > o — the change that rebuilt the Romance vowel system on quality instead of length',
            };
        },
    },
    {
        id: 'monophthongisation', category: 'vowel', weight: 6,
        applies: (inv, pt) => (pt?.nucleus?.diphthongs || []).length > 0,
        build: (inv, rng, pt) => {
            const d = rng.pick(pt.nucleus.diphthongs);
            if (!d) return null;
            // The monophthong lands between the two members: /ai/ > /e/, /au/ > /o/.
            const target = d.startsWith('a') && d.endsWith('i') ? 'e'
                : d.startsWith('a') && d.endsWith('u') ? 'o'
                : d[0];
            return {
                label: `${d} > ${target}`,
                a: { seq: [...d].map((ch) => ({ is: ch })) },
                b: { set: target },
                env: {},
                analogue: 'Latin AURUM > Spanish "oro"; Greek /ai/ > /e/. The two targets collapse into a single articulation between them',
            };
        },
    },
    {
        id: 'diphthongisation', category: 'vowel', weight: 5,
        applies: (inv) => inv.vowels.some((v) => v.f.height >= 2 && v.f.stress !== undefined),
        build: (inv, rng) => {
            const t = rng.pick(vowelsWhere(inv, (v) => v.f.height >= 2 && v.f.height <= 4));
            if (!t) return null;
            const glide = t.f.back === 3 ? 'w' : 'j';
            return {
                label: `stressed ${t.ipa} > ${glide}${t.ipa}`,
                a: { is: t.ipa, stress: 'stressed' },
                b: { set: `${glide}${t.ipa}` },
                env: {},
                analogue: 'Latin FOCUM > Spanish "fuego", PETRAM > "piedra"; stressed syllables lengthen and then break',
            };
        },
    },
    {
        id: 'breaking', category: 'vowel', weight: 3,
        applies: (inv) => inv.vowels.some((v) => v.f.back === 1) && (has(inv, 'r') || has(inv, 'l')),
        build: () => ({
            label: 'breaking before a liquid',
            a: { type: 'V', back: 1, height: { min: 2 } },
            b: { set: 'ea' },
            env: { after: [{ class: 'liquid' }] },
            analogue: 'Old English breaking: *ærm > "earm" (arm). The back resonance of the liquid pulls a glide out of the vowel',
        }),
    },

    // ══════════════════════════════════════════════════════════════════════
    // PROSODIC — including the one that makes this family what it is.
    // ══════════════════════════════════════════════════════════════════════
    {
        id: 'compensatory-lengthening', category: 'prosodic', weight: 5,
        applies: (inv, pt) => codas(inv, pt).length > 0,
        build: (inv, rng, pt) => {
            const target = rng.pick(codas(inv, pt).filter((x) => ['s', 'h', 'n', 'r'].includes(x)));
            if (!target) return null;
            return {
                label: `loss of coda ${target} with compensatory lengthening`,
                a: { seq: [V, { is: target }] },
                b: { keep: 0, delta: { long: true } },
                env: { after: [{ any: [C, { boundary: '#' }] }] },
                analogue: 'Latin *kasnus > "cānus"; Ionic Greek *odwos > "oudos". The syllable keeps its weight even though the consonant is gone — which is why the vowel lengthens rather than the syllable simply shrinking',
            };
        },
    },
    {
        id: 'tonogenesis-coda', category: 'prosodic', weight: 1,
        dynamicWeight: toneWeight,
        /**
         * No longer barred in a language that already has tone. Tonogenesis
         * happens in layers: Middle Chinese got its four tones from codas and
         * then split each by onset voicing into eight. Each source also gives a
         * different pitch: a final glottal stop raises (Middle Chinese *-ʔ gave
         * the rising tone), a final *-s or *-h lowers (the departing tone).
         */
        applies: (inv, pt) => codas(inv, pt).some((x) => ['h', 's', 'ʔ'].includes(x)),
        build: (inv, rng, pt, ctx) => {
            const sources = codas(inv, pt).filter((x) => ['h', 's', 'ʔ'].includes(x));
            if (!sources.length || !mayStack(inv, rng, ctx)) return null;
            const source = rng.pick(sources);
            const high = source === 'ʔ';
            return {
                label: `tonogenesis: coda ${source} > ${high ? 'high' : 'low'} tone`,
                a: { seq: [V, { is: source }] },
                b: { keep: 0, delta: { tone: high ? 5 : 1 } },
                env: { after: [{ boundary: '#' }] },
                analogue: 'Vietnamese: final *-s and *-h produced the sắc and nặng tones, then vanished. Middle Chinese *-ʔ gave the rising tone the same way',
                note: 'A SPLIT done properly: the coda transfers its cue to pitch, then disappears, leaving a contrast nothing on the surface explains.',
            };
        },
    },
    {
        id: 'tonogenesis-voicing', category: 'prosodic', weight: 1,
        dynamicWeight: toneWeight,
        applies: (inv) => hasVoicingContrast(inv),
        build: (inv, rng, pt, ctx) => (!mayStack(inv, rng, ctx) ? null : {
            label: 'tonogenesis: voiced onsets lower the following vowel’s pitch',
            a: { type: 'V' },
            b: { delta: { tone: 2 } },
            env: { before: [{ type: 'C', voice: true, manner: ['stop', 'affricate', 'fricative'] }] },
            analogue: 'Middle Chinese: the voicing contrast split every tone into a higher yin and a lower yang register, and the voiced series then devoiced — leaving the tone split as its only trace. Exactly the change this family’s proto-language was reconstructed to make possible',
            note: 'Must be followed by devoicing for the tone to become contrastive. generate.js pairs them.',
        }),
    },
    {
        /**
         * Tone in a long-word language, the way most of Earth's long-word
         * tone arose: a syllable is lost and its trace stays as pitch on the
         * stressed vowel. Swedish and Norwegian accent 2 sits on the old
         * disyllables; the Franconian tone accents (Limburgish, Cologne) came
         * with the 13th-century loss of final schwa; Serbo-Croatian's
         * neo-acute followed the fall of the weak yers. WALS 13A counts these
         * pitch-accent systems as simple tone (Japanese, Norwegian, Latvian,
         * Somali, Hopi), and simple systems sit overwhelmingly in long-word
         * languages, which the coda and onset routes above almost never reach.
         * Only in a toneless language: an existing tone system takes the cue.
         */
        id: 'tonogenesis-accent', category: 'prosodic', weight: 0.15,
        dynamicWeight: (inv, pt, ctx) => 0.1 + (1 - monosyllabicity(ctx)) ** 2,
        applies: (inv) => !inv.vowels.some((v) => v.f.tone),
        build: () => ({
            label: 'a stressed vowel before a final syllable keeps a distinct pitch as that syllable goes (accent 2)',
            a: { type: 'V', stress: 'stressed', tone: null },
            b: { delta: { tone: 5 } },
            env: { after: [C, { type: 'V', stress: 'unstressed' }, { boundary: '#' }] },
            analogue: 'Swedish and Norwegian accent 2 on the old disyllables (anden "the duck" against anden "the spirit"); the Franconian tone accents; the Serbo-Croatian neo-acute after the weak yers fell',
            note: 'Contrastive only once the final vowel goes: generate.js pairs it with apocope.',
        }),
    },
    {
        /**
         * The other half of the register split: vowels after VOICELESS onsets
         * rise. Without it a voicing split left one marked low tone against
         * nothing, a single privative level, which is how every tonal language
         * in the tree came to have exactly one tone (˩).
         */
        id: 'tonogenesis-voiceless-high', category: 'prosodic', weight: 0, // only ever paired
        applies: (inv) => hasVoicingContrast(inv),
        build: () => ({
            label: 'voiceless onsets raise the following vowel’s pitch',
            a: { type: 'V', tone: null },
            b: { delta: { tone: 4 } },
            env: { before: [{ type: 'C', voice: false, manner: ['stop', 'affricate', 'fricative'] }] },
            analogue: 'Middle Chinese: the yin (upper) register, after voiceless initials, against the yang (lower) register after voiced ones',
        }),
    },
    {
        id: 'devoicing-after-tonogenesis', category: 'prosodic', weight: 0, // only ever paired
        applies: (inv) => hasVoicingContrast(inv),
        // the fricatives too: Mandarin kept no voiced obstruent of Middle Chinese's,
        // and leaving them made a third of Andah's languages voice fricatives
        // alone (WALS 4A: 7% of Earth's)
        build: () => ({
            label: 'the voiced series devoices, leaving the tone split behind',
            a: { type: 'C', voice: true, manner: ['stop', 'affricate', 'fricative'], place: { not: 'glottal' }, lateral: false },
            b: { delta: { voice: false, aspirated: false } },
            env: {},
            analogue: 'Middle Chinese > Mandarin: *b *d *ɡ *dz *z *ʑ merge into p t k ts s ɕ, and the tone categories are all that distinguishes the old contrast',
        }),
    },
    {
        id: 'aspiration-split', category: 'prosodic', weight: 3,
        applies: (inv) => consonantsWhere(inv, (c) => !c.f.voice && c.f.manner === 'stop'
            && !c.f.aspirated && c.f.place !== 'glottal').length > 0,
        build: () => ({
            label: 'voiceless stops aspirate word-initially',
            // NOT the glottal stop. Aspiration IS a glottal gesture -- the
            // glottis cannot both close for /ʔ/ and open for the aspiration, so
            // no language has an aspirated glottal stop.
            a: { type: 'C', manner: 'stop', voice: false, aspirated: false, place: { not: 'glottal' } },
            b: { delta: { aspirated: true } },
            env: { before: WORD_START },
            analogue: 'English /p t k/ are aspirated initially but not after /s/ — which is why "spin" sounds closer to "bin" than to "pin"',
        }),
    },

    // ══════════════════════════════════════════════════════════════════════
    // REMOVERS — the way back out. Tone, aspiration, affricates, /h/, schwa
    // and front rounded vowels could all be GAINED and never lost, so every
    // family drifted towards the same marked phonology: each series sat in
    // 80-100% of the leaves of every family. On Earth every one of them is
    // lost again somewhere, and the functional-load gate in generate.js
    // decides how often: a series doing a lot of work is rarely given up.
    // ══════════════════════════════════════════════════════════════════════
    {
        id: 'tone-loss', category: 'prosodic', weight: 2,
        /**
         * Likelier as words lengthen: with two or three syllables a word has
         * room to keep its contrasts without pitch, and tone thins to a pitch
         * accent or goes (Swahili, Seoul Korean). A monosyllabic language
         * keeps it, as Chinese and Vietnamese have. Tone appeared on 46 edges
         * and went on 9 before this.
         */
        // gentler since common changes may recur on long edges (generate.js): once
        // established, tone is a family trait (Proto-Bantu's two tones survive in
        // nearly all of Bantu; Swahili is the exception)
        dynamicWeight: (inv, pt, ctx) => 0.15 + 1.0 * (1 - monosyllabicity(ctx)) ** 2,
        applies: (inv) => inv.vowels.some((v) => v.f.tone != null && v.f.tone !== 0),
        build: () => ({
            label: 'tone is lost',
            a: { type: 'V' }, b: { delta: { tone: null } },
            env: {},
            analogue: 'Swahili lost the two tones of Proto-Bantu; Seoul Korean lost the pitch accent of Middle Korean, which Gyeongsang dialects keep',
        }),
    },
    {
        id: 'deaspiration', category: 'fortition', weight: 3,
        applies: (inv) => inv.consonants.some((c) => c.f.aspirated),
        build: () => ({
            label: 'aspirated stops lose their aspiration',
            a: { type: 'C', aspirated: true }, b: { delta: { aspirated: false } },
            env: {},
            analogue: 'Proto-Indo-European *bʰ *dʰ *ɡʰ merged with *b *d *ɡ in Balto-Slavic, Iranian and Celtic; Sinhala lost the Indo-Aryan aspirates',
        }),
    },
    {
        id: 'deaffrication', category: 'lenition', weight: 3,
        applies: (inv) => inv.consonants.some((c) => c.f.manner === 'affricate'),
        build: (inv, rng) => {
            const t = rng.pick(consonantsWhere(inv, (c) => c.f.manner === 'affricate'));
            if (!t) return null;
            const out = applyDelta(t, { manner: 'fricative' });
            if (!out || out.ipa === t.ipa) return null;
            return {
                label: `${t.ipa} > ${out.ipa}`,
                a: { is: t.ipa }, b: { delta: { manner: 'fricative' } },
                env: {},
                analogue: 'Old French /t͡ʃ/ and /t͡s/ became /ʃ/ and /s/: English borrowed "chief" before the change and "chef" after it',
            };
        },
    },
    {
        id: 'h-loss', category: 'deletion', weight: 3,
        applies: (inv) => has(inv, 'h'),
        build: () => ({
            label: 'h is lost',
            a: { is: 'h' }, b: { empty: true },
            env: {},
            analogue: 'Latin H was silent by Vulgar Latin and left no trace in any Romance language; Ionic Greek lost its /h/ (psilosis)',
        }),
    },
    {
        id: 'schwa-colouring', category: 'vowel', weight: 3,
        applies: (inv) => inv.vowels.some((v) => v.f.height === 3 && v.f.back === 2 && !v.f.round),
        build: (inv, rng) => {
            const targets = ['a', 'e', 'i'].filter((x) => has(inv, x));
            if (!targets.length) return null;
            const out = rng.pick(targets);
            return {
                label: `ə > ${out}`,
                a: { type: 'V', height: 3, back: 2, round: false }, b: { set: out },
                env: {},
                analogue: 'The Proto-Indo-European "schwa" of the laryngeals became /a/ in Greek and Latin and /i/ in Indo-Iranian: *ph₂tḗr > Latin "pater", Sanskrit "pitā́"',
            };
        },
    },
    {
        id: 'unrounding', category: 'vowel', weight: 3,
        applies: (inv) => inv.vowels.some((v) => v.f.round && v.f.back === 1),
        build: (inv, rng) => {
            const t = rng.pick(vowelsWhere(inv, (v) => v.f.round && v.f.back === 1));
            if (!t) return null;
            return {
                label: `${t.ipa} unrounds`,
                a: { is: t.ipa }, b: { delta: { round: false } },
                env: {},
                analogue: 'Greek upsilon /y/ unrounded to /i/ by the tenth century; Old English "fȳr" /yː/ became Middle English "fire" /iː/',
            };
        },
    },
].filter((t) => !t.skip);

/**
 * Templates that can legally apply to this language right now.
 *
 * `ctx` carries the generator's word probe, so a template can ask about the
 * actual lexicon — "does this language have any geminates?" — rather than
 * guessing from the inventory alone.
 */
export function applicable(inv, pt, ctx) {
    return CATALOGUE.filter((t) => {
        try { return t.weight > 0 && t.applies(inv, pt, ctx); } catch { return false; }
    });
}

export function byId(id) { return CATALOGUE.find((t) => t.id === id); }

/**
 * Pairs of templates that must run together and in order.
 *
 * Tonogenesis is the important one: a pitch difference conditioned by onset
 * voicing is merely allophonic until the voicing contrast is destroyed. Only
 * then is the tone doing the contrastive work, and only then has a tone system
 * actually come into existence. Emitting the first without the second would
 * produce a language with decorative pitch and no tonemes.
 */
export const PAIRED = {
    'tonogenesis-voicing': ['tonogenesis-voiceless-high', 'devoicing-after-tonogenesis'],
    'tonogenesis-accent': ['apocope'],
    // the nasal it stood before goes: the loss of some other final consonant left
    // the nasal vowel predictable from the nasal after it
    'vowel-nasalisation': ['nasal-coda-loss'],
    'umlaut': ['apocope'],
    // a new q goes fricative between vowels (PAIR_CHANCE)
    'uvularisation': ['uvular-spirantisation'],
};

/**
 * Which way a change usually moves the number of consonants, as measured over
 * the engine's own runs (17 Oct 2026): conditioned changes whose new sounds
 * are left behind as phonemes once their conditions blur (palatalisation,
 * aspiration, voicing between vowels), and mergers that take sounds away.
 * The generator's size lean (generate.js) reads it: a lineage drawn to a
 * small system favours the mergers, one drawn to a large system the splits.
 */
export const CONSONANT_EFFECT = {
    'final-devoicing': 1, 'aspiration-split': 1, 'postnasal-hardening': 1, 'final-lenition': 1,
    'intervocalic-voicing': 1, 'flapping': 1, 'palatalisation': 1, 'initial-fortition': 1,
    'nasal-place-assimilation': 1, 'intervocalic-spirantisation': 1,
    'labialisation': 1, 'secondary-palatalisation': 1, 'glottalisation': 1, 'retroflexion': 1, 'uvularisation': 1,
    'deaffrication': -1, 'debuccalisation': -1, 'consonant-merger': -1, 'h-loss': -1, 'deaspiration': -1,
    'voicing-merger': -1, 'place-merger': -1,
    'fricative-devoicing': -1, 'liquid-merger': -1, 'velar-nasal-merger': -1, 'lateral-fricativisation': 1,
    'glide-coalescence': 1, 'uvular-spirantisation': 1,
    // the voiced row merges into the voiceless through tone (its devoicing
    // partner follows): Middle Chinese's 36 initials became Mandarin's 21
    'tonogenesis-voicing': -1,
};

/**
 * Partners that follow only sometimes. A register split usually leaves two
 * registers: the vowels after sonorants and after no consonant side with one
 * of them (Kammu's high and low, Lhasa Tibetan's), the voiced-onset vowels
 * marked low against the rest. Raising the voiceless-onset vowels as well
 * leaves three, a high, a low and the rest between: Earth's complex systems
 * mostly come from layers (Middle Chinese's four coda tones split again by
 * voicing). Paired every time, every tonal language had three levels or more
 * from its first tone: 40% complex tone against Earth's 17%, 16% simple
 * against 25%.
 */
export const PAIR_CHANCE = {
    'uvular-spirantisation': 0.7,
    // a third height is a layered system: common in isolating languages, rare elsewhere (see mayStack)
    'tonogenesis-voiceless-high': (inv, pt, ctx) => (ctx?.morphology === 'isolating' ? 0.35 : 0.15),
};
