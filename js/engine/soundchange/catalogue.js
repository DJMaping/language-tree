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

import { consonant, vowel, isVowel } from '../features.js';

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
        build: () => ({
            label: 'j > d͡ʑ word-initially',
            a: { is: 'j' }, b: { set: 'd͡ʑ' },
            env: { before: WORD_START },
            analogue: 'Latin IAM > Italian "già"; initial glides routinely harden into affricates',
        }),
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
    {
        id: 'palatalisation', category: 'assimilation', weight: 10,
        applies: (inv) => hasFrontVowel(inv) && (has(inv, 'k') || has(inv, 't') || has(inv, 'ɡ')),
        build: (inv, rng) => {
            const targets = consonantsWhere(inv, (c) => ['velar', 'alveolar'].includes(c.f.place) && ['stop'].includes(c.f.manner));
            if (!targets.length) return null;
            const t = rng.pick(targets);
            const out = t.f.place === 'velar'
                ? (t.f.voice ? 'd͡ʑ' : 't͡ɕ')
                : (t.f.voice ? 'd͡ʑ' : 't͡ɕ');
            return {
                label: `${t.ipa} > ${out} before a front vowel`,
                a: { is: t.ipa }, b: { set: out },
                env: { after: [{ any: [{ type: 'V', back: 1 }, { is: 'j' }] }] },
                analogue: 'Latin CENTUM /k/ → Italian "cento" /tʃ/; the most frequent conditioned change on earth, and the reason English spelling has soft ⟨c⟩ and ⟨g⟩',
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
            b: { assimilate: { from: 'before', features: ['back'] } },
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
        id: 'vowel-nasalisation', category: 'assimilation', weight: 5,
        applies: (inv, pt) => inv.consonants.some((c) => c.f.manner === 'nasal') && (pt?.coda?.allowed || []).some((x) => ['n', 'm', 'ŋ'].includes(x)),
        build: () => ({
            label: 'vowel nasalisation before a nasal coda',
            a: { type: 'V' },
            b: { delta: { nasal: true } },
            env: { after: [{ type: 'C', manner: 'nasal' }] },
            analogue: 'French VINUM > "vin" /vɛ̃/; the nasal is then lost and the nasalisation becomes contrastive — a split, created properly',
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
        id: 'final-consonant-loss', category: 'deletion', weight: 6,
        applies: (inv, pt) => codas(inv, pt).length > 0,
        build: (inv, rng, pt) => {
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
        applies: (inv) => true,
        build: () => ({
            label: 'cluster simplification',
            a: { type: 'C', manner: 'stop' },
            b: { empty: true },
            env: { after: [{ type: 'C', manner: ['stop', 'fricative', 'nasal'] }] },
            analogue: 'Latin SEPTEM > Spanish "siete"; English "knight" losing its /k/',
        }),
    },
    {
        id: 'degemination', category: 'deletion', weight: 4,
        applies: (inv) => true,
        build: () => ({
            label: 'degemination',
            a: { seq: [C, C] }, b: { delta: {} },
            env: {},
            skip: true, // handled specially — see generate.js
        }),
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
        applies: (inv) => true,
        build: (inv, rng) => {
            const v = rng.pick(vowelsWhere(inv, (x) => x.f.height === 3 || x.f.back === 2)) || inv.vowels[0];
            return {
                label: `epenthesis in a liquid cluster`,
                a: { empty: true }, b: { set: v.ipa },
                env: { before: [{ type: 'C', manner: ['stop', 'fricative'] }], after: [{ class: 'liquid' }] },
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
        id: 'liquid-metathesis', category: 'rearrangement', weight: 2,
        applies: (inv) => has(inv, 'r') || has(inv, 'l'),
        build: () => ({
            label: 'metathesis of vowel + liquid',
            a: { seq: [V, { class: 'liquid' }] }, b: { swap: true },
            env: { before: [{ boundary: '#' }, C] },
            probability: 0.7,
            analogue: 'Old English "brid" > "bird", "hros" > "horse"; Slavic liquid metathesis wholesale. Liquids metathesise more than anything else because their acoustic cues are spread over the whole syllable',
        }),
    },

    // ══════════════════════════════════════════════════════════════════════
    // VOWEL CHANGES
    // ══════════════════════════════════════════════════════════════════════
    {
        id: 'reduction-to-schwa', category: 'vowel', weight: 4,
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
        id: 'tonogenesis-coda', category: 'prosodic', weight: 7,
        applies: (inv, pt) => codas(inv, pt).some((x) => ['h', 's', 'ʔ'].includes(x)) && !inv.vowels.some((v) => v.f.tone),
        build: (inv, rng, pt) => {
            const source = codas(inv, pt).find((x) => ['h', 's'].includes(x));
            if (!source) return null;
            return {
                label: `tonogenesis: coda ${source} > low tone`,
                a: { seq: [V, { is: source }] },
                b: { keep: 0, delta: { tone: 1 } },
                env: { after: [{ boundary: '#' }] },
                analogue: 'Vietnamese: final *-s and *-h produced the sắc and nặng tones, then vanished. Middle Chinese *-ʔ gave the rising tone the same way',
                note: 'A SPLIT done properly: the coda transfers its cue to pitch, then disappears, leaving a contrast nothing on the surface explains.',
            };
        },
    },
    {
        id: 'tonogenesis-voicing', category: 'prosodic', weight: 7,
        applies: (inv) => hasVoicingContrast(inv) && !inv.vowels.some((v) => v.f.tone),
        build: () => ({
            label: 'tonogenesis: voiced onsets lower the following vowel’s pitch',
            a: { type: 'V' },
            b: { delta: { tone: 1 } },
            env: { before: [{ type: 'C', voice: true, manner: ['stop', 'affricate', 'fricative'] }] },
            analogue: 'Middle Chinese: the voicing contrast split every tone into a higher yin and a lower yang register, and the voiced series then devoiced — leaving the tone split as its only trace. Exactly the change this family’s proto-language was reconstructed to make possible',
            note: 'Must be followed by devoicing for the tone to become contrastive. generate.js pairs them.',
        }),
    },
    {
        id: 'devoicing-after-tonogenesis', category: 'prosodic', weight: 0, // only ever paired
        applies: (inv) => hasVoicingContrast(inv),
        build: () => ({
            label: 'the voiced series devoices, leaving the tone split behind',
            a: { type: 'C', voice: true, manner: ['stop', 'affricate'] },
            b: { delta: { voice: false, aspirated: false } },
            env: {},
            analogue: 'Middle Chinese > Mandarin: *b *d *ɡ merge into *p *t *k, and the tone categories are all that distinguishes the old contrast',
        }),
    },
    {
        id: 'aspiration-split', category: 'prosodic', weight: 3,
        applies: (inv) => consonantsWhere(inv, (c) => !c.f.voice && c.f.manner === 'stop' && !c.f.aspirated).length > 0,
        build: () => ({
            label: 'voiceless stops aspirate word-initially',
            a: { type: 'C', manner: 'stop', voice: false, aspirated: false },
            b: { delta: { aspirated: true } },
            env: { before: WORD_START },
            analogue: 'English /p t k/ are aspirated initially but not after /s/ — which is why "spin" sounds closer to "bin" than to "pin"',
        }),
    },
].filter((t) => !t.skip);

/** Templates that can legally apply to this inventory right now. */
export function applicable(inv, pt) {
    return CATALOGUE.filter((t) => {
        try { return t.weight > 0 && t.applies(inv, pt); } catch { return false; }
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
    'tonogenesis-voicing': ['devoicing-after-tonogenesis'],
    'vowel-nasalisation': ['final-consonant-loss'],
    'umlaut': ['apocope'],
};
