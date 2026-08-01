/**
 * Language contact: loanwords, and why they can be dated.
 *
 * The chart already draws borrowing arrows between languages, each with a year
 * and a kind. This turns them into events with consequences.
 *
 * ## The diagnostic that makes this worth building
 *
 * A borrowed word enters the recipient language at a moment in time, and from
 * then on it is an ordinary word: it undergoes every sound change that happens
 * AFTER it arrived, and none of the ones that happened before. So the shape of a
 * loan tells you when it was borrowed.
 *
 * English borrowed the same French word twice. *Chief* came in early enough to
 * undergo the change that turned /tʃ/ into… no, the other way round: it arrived
 * while French still had /tʃ/, and kept it. *Chef* arrived centuries later,
 * after French had shifted /tʃ/ to /ʃ/, and so has /ʃ/. Same source word, two
 * dates, and you can read the date off the consonant. Likewise *catch* vs
 * *chase*, *warranty* vs *guarantee*, *cattle* vs *chattel*.
 *
 * That is what `enteredAt` does here. A loan carries the year it arrived, and
 * the rule engine skips every rule dated before it. The result is a lexicon
 * with visible strata — and the panel can say "this word entered before the
 * palatalisation of c.900; that one after".
 *
 * ## The four kinds are not interchangeable
 *
 * The chart's four borrowing kinds describe genuinely different social
 * situations, and they leave different fingerprints:
 *
 *   SUBSTRATE   the language people shifted AWAY from. Contributes few words,
 *               and those it does are local and unglamorous: place names,
 *               plants, animals, landscape. Its real legacy is phonological.
 *               (Brythonic in English; pre-Roman Iberian in Spanish.)
 *   SUPERSTRATE the language of an incoming elite that was then absorbed.
 *               Contributes prestige vocabulary: law, war, government,
 *               religion, fine food. (Norman French in English — beef, pork,
 *               court, judge, army, parliament.)
 *   ADSTRATE    neighbours of roughly equal standing trading over a long
 *               period. Borrows freely across domains, nouns first.
 *               (Dutch and English; Japanese and Korean.)
 *   AREAL       a sprachbund. Contributes STRUCTURE rather than words —
 *               shared features across unrelated languages in one region.
 *               (The Balkan sprachbund's postposed articles; Mainland SE Asia.)
 *
 * ## The borrowability hierarchy
 *
 * Nouns borrow most freely, then verbs and adjectives, then function words,
 * then bound morphology, which almost never borrows at all. This ordering is
 * one of the most robust findings in contact linguistics (Thomason & Kaufman's
 * borrowing scale), and it is why English has thousands of French nouns and
 * essentially no French inflection.
 */

import { wordToIpa, isVowel } from './features.js';
import { repairHiatus, repairClusters, syllabify, isLegalOnset } from './phonology/phonotactics.js';

/** The relative ease with which each word class is borrowed. */
export const BORROWABILITY = { n: 1.0, adj: 0.45, v: 0.4, adv: 0.2, num: 0.1, adp: 0.06, pron: 0.02, conj: 0.02, dem: 0.01, interrog: 0.01, part: 0.02, neg: 0.005, quant: 0.05 };

/**
 * What each kind of contact actually transfers.
 *
 * `rate` is words per contact event as a fraction of the recipient's lexicon —
 * deliberately small. Even the Norman conquest, the most lopsided contact
 * situation in the history of English, left the core vocabulary intact.
 */
export const CONTACT_KINDS = {
    substrate: {
        label: 'substrate',
        rate: 0.02,
        domains: ['nature', 'plant', 'animal', 'weather', 'space', 'agriculture'],
        note: 'The language people shifted away from. Few words, and local ones — landscape, flora, fauna. Its real legacy is phonological, not lexical.',
        analogue: 'Brythonic in English (few words, but the river names survive: Avon, Thames, Ouse)',
    },
    superstrate: {
        label: 'superstrate',
        rate: 0.06,
        domains: ['society', 'war', 'religion', 'trade', 'food', 'craft', 'cognition'],
        note: 'An incoming elite, later absorbed. Prestige vocabulary: law, war, government, fine food.',
        analogue: 'Norman French in English — beef, pork, court, judge, army, parliament, while cow, pig and swine stayed English',
    },
    loan: {
        label: 'adstrate / loanwords',
        rate: 0.04,
        domains: null, // borrows across the board
        note: 'Neighbours of roughly equal standing. Borrows freely, nouns first.',
        analogue: 'Dutch and English across the North Sea; Japanese and Korean',
    },
    areal: {
        label: 'areal / sprachbund',
        rate: 0.01,
        domains: ['nature', 'society', 'trade'],
        structural: true,
        note: 'Convergence across a region regardless of ancestry. Transfers STRUCTURE more than words.',
        analogue: 'The Balkan sprachbund: Albanian, Romanian, Bulgarian and Greek share a postposed article and a lost infinitive without sharing an ancestor',
    },
};

// ---------------------------------------------------------------------------
// Adapting a foreign word
// ---------------------------------------------------------------------------

/**
 * Distance between two phonemes in feature space.
 *
 * Used to find the nearest native segment to a foreign one. This is exactly
 * what speakers do when they borrow a word containing a sound their language
 * lacks: English /θ/ becomes /t/, /s/ or /f/ in the borrowing language
 * depending on which is nearest in ITS inventory, which is why "thing" is
 * borrowed differently into French, German and Japanese.
 */
const PLACE_ORDER = ['bilabial', 'labiodental', 'dental', 'alveolar', 'postalveolar', 'retroflex', 'alveolopalatal', 'palatal', 'velar', 'labiovelar', 'uvular', 'pharyngeal', 'glottal'];
const MANNER_ORDER = ['stop', 'affricate', 'fricative', 'nasal', 'trill', 'tap', 'approximant'];

function distance(a, b) {
    if (a.type !== b.type) return 100;
    if (a.type === 'V') {
        return Math.abs(a.f.height - b.f.height) * 1.4
            + Math.abs(a.f.back - b.f.back) * 1.2
            + (a.f.round === b.f.round ? 0 : 1)
            + (a.f.long === b.f.long ? 0 : 0.6)
            + (a.f.nasal === b.f.nasal ? 0 : 0.8)
            + ((a.f.tone || 0) === (b.f.tone || 0) ? 0 : 0.3);
    }
    const dp = Math.abs(PLACE_ORDER.indexOf(a.f.place) - PLACE_ORDER.indexOf(b.f.place));
    const dm = Math.abs(MANNER_ORDER.indexOf(a.f.manner) - MANNER_ORDER.indexOf(b.f.manner));
    // An obstruent and a sonorant are not near neighbours however close their
    // place: speakers borrowing /x/ reach for /k/ or /h/, never for /ŋ/.
    const sonorant = (x) => ['nasal', 'trill', 'tap', 'approximant'].includes(x.f.manner);
    const classGap = sonorant(a) === sonorant(b) ? 0 : 3;
    return dp * 0.8 + dm * 1.3 + classGap
        + (a.f.voice === b.f.voice ? 0 : 1.1)
        + (a.f.lateral === b.f.lateral ? 0 : 1.5)
        + (a.f.aspirated === b.f.aspirated ? 0 : 0.5)
        + (a.f.palatalised === b.f.palatalised ? 0 : 0.4)
        + (a.f.labialised === b.f.labialised ? 0 : 0.4);
}

/** The nearest segment the recipient language actually has. */
function nearest(ph, inventory) {
    const pool = ph.type === 'V' ? inventory.vowels : inventory.consonants;
    if (!pool.length) return ph;
    let best = pool[0], bestD = Infinity;
    for (const cand of pool) {
        const d = distance(ph, cand);
        if (d < bestD) { bestD = d; best = cand; }
    }
    return best;
}

/**
 * Adapt a foreign word to the recipient's phonology.
 *
 * Two steps, in the order speakers do them: substitute each foreign segment
 * with the nearest native one, then repair whatever syllable structure that
 * leaves. Japanese borrowing "strike" gives /sɯtoraiki/ — every consonant is
 * substituted AND vowels are inserted to break clusters Japanese does not
 * permit. Both steps are needed; either alone gives the wrong answer.
 */
export function adapt(form, recipientState) {
    const substituted = form.map((ph) => nearest(ph, recipientState.inventory));
    let out = repairHiatus(substituted, recipientState.phonotactics);
    out = repairClusters(out, recipientState.phonotactics);
    return out;
}

// ---------------------------------------------------------------------------
// Selecting what gets borrowed
// ---------------------------------------------------------------------------

/**
 * Choose which of the donor's words are borrowed.
 *
 * Weighted by the borrowability hierarchy and by the semantic domains the
 * contact type actually transfers. Frequency matters in the opposite direction
 * to what you might expect: the recipient's OWN high-frequency core vocabulary
 * is what resists replacement, so loans cluster in the mid and low frequency
 * range. Nobody borrows a word for "two" or "eye".
 */
export function selectLoans(donorState, kind, rng, count) {
    const spec = CONTACT_KINDS[kind] || CONTACT_KINDS.loan;
    const pool = donorState.entries.filter((e) => {
        if (e.core && e.rank < 120) return false;         // core vocabulary is not borrowed
        if (spec.domains && !spec.domains.includes(e.domain)) return false;
        return (BORROWABILITY[e.pos] ?? 0.05) > 0.02;
    });
    if (!pool.length) return [];

    const chosen = [];
    const seen = new Set();
    for (let i = 0; i < count * 8 && chosen.length < count; i++) {
        const e = rng.pickWeighted(pool, (x) => BORROWABILITY[x.pos] ?? 0.05);
        if (!e || seen.has(e.id)) continue;
        seen.add(e.id);
        chosen.push(e);
    }
    return chosen;
}

/**
 * Build the loanwords a contact event delivers.
 *
 * @param donorState      the donor language AT the year of contact
 * @param recipientState  the recipient, at the same moment
 * @param borrowing       { id, fromId, toId, year, label, kind }
 */
export function makeLoans(donorState, recipientState, borrowing, rng) {
    const kind = borrowing.kind || 'loan';
    const spec = CONTACT_KINDS[kind] || CONTACT_KINDS.loan;
    /**
     * `strength` scales how much this contact delivered. 1 is the typical
     * amount for its kind; the Norman conquest of English was perhaps a 3, a
     * few trade words across a border a 0.2. Real contact situations differ by
     * more than an order of magnitude, so one arrow is not like another.
     */
    const strength = borrowing.strength != null ? Math.max(0, Math.min(5, borrowing.strength)) : 1;
    const count = Math.max(1, Math.round(recipientState.entries.length * spec.rate * strength));
    const words = selectLoans(donorState, kind, rng, count);

    return words.map((w) => {
        const form = adapt(w.form, recipientState);
        return {
            id: `loan:${borrowing.id}:${w.id}`,
            form,
            ipa: wordToIpa(form),
            gloss: w.gloss,
            pos: w.pos,
            domain: w.domain,
            core: false,
            // Loans sit in the mid-frequency band: common enough to survive,
            // never as common as inherited core vocabulary.
            rank: Math.max(150, w.rank),
            zipf: 0,
            class: w.class,
            syllables: syllabify(form, recipientState.phonotactics).length,
            irregular: false,
            derivedFrom: null,
            // The bit that makes a loan datable.
            loan: {
                from: borrowing.fromId,
                borrowingId: borrowing.id,
                kind,
                strength,
                year: borrowing.year,
                label: borrowing.label || spec.label,
                donorForm: w.ipa,
                adapted: wordToIpa(form) !== w.ipa,
            },
            enteredAt: borrowing.year,
        };
    });
}

/**
 * Which structural features an areal contact transfers.
 *
 * A sprachbund spreads STRUCTURE, not vocabulary — and it does so between
 * languages that are not related, which makes it the only mechanism in the
 * engine that can produce shared features across family boundaries. Reported
 * rather than applied for now: the structural side needs the morphology and
 * syntax layers to land first.
 */
export function arealFeatures(donorState, recipientState) {
    const out = [];
    const donorTone = donorState.inventory.vowels.some((v) => v.f.tone);
    const recTone = recipientState.inventory.vowels.some((v) => v.f.tone);
    if (donorTone && !recTone) {
        out.push({ feature: 'tone', note: 'the donor is tonal and the recipient is not — tone spreads areally, which is how Mainland SE Asia became a tone area across four unrelated families' });
    }
    const donorCoda = donorState.phonotactics.coda?.allowed?.length ?? 0;
    const recCoda = recipientState.phonotactics.coda?.allowed?.length ?? 0;
    if (Math.abs(donorCoda - recCoda) >= 3) {
        out.push({ feature: 'syllable canon', note: `donor licenses ${donorCoda} coda types, recipient ${recCoda} — syllable structure converges in long contact` });
    }
    return out;
}

/**
 * Group a language's loans into datable STRATA.
 *
 * This is the display the whole mechanism exists for: the same donor,
 * contributing at different dates, leaves layers that can be told apart by
 * which sound changes they did and did not undergo.
 */
export function strata(entries, changeSetsByYear = []) {
    const byEvent = new Map();
    for (const e of entries) {
        if (!e.loan) continue;
        const key = e.loan.borrowingId;
        if (!byEvent.has(key)) {
            byEvent.set(key, { ...e.loan, words: [], rulesEscaped: [] });
        }
        byEvent.get(key).words.push(e);
    }
    for (const s of byEvent.values()) {
        // Every change dated before the loan arrived is one it escaped — and
        // escaping it is exactly what marks the word as late.
        s.rulesEscaped = changeSetsByYear.filter((r) => r.year != null && s.year != null && r.year < s.year);
    }
    return [...byEvent.values()].sort((a, b) => (a.year ?? 0) - (b.year ?? 0));
}
