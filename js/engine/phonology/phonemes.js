/**
 * Phonemes and allophones: which of a language's sounds contrast.
 *
 * The lexicon's inventory (soundchange/apply.js inventoryFromLexicon) is every
 * sound its words contain. A conditioned change makes new sounds in one
 * position only: intervocalic voicing gives [z] between vowels and nowhere
 * else, aspiration gives [kʰ] at the start of a word. Those are allophones,
 * as Spanish [β ð ɣ] are of /b d ɡ/ and English [kʰ] is of /k/, and a
 * phonologist would not count them; counted, Andah's inventories ran large
 * (a family drawn to 14 consonants stood at 22). A sound becomes a phoneme
 * when a later change muddles the positions, so that it and its source meet
 * in the same place (ss > s between vowels beside the voiced [z]): the
 * two-step phonemicisation the engine's sound changes are written for.
 *
 * The test is the classical one, complementary distribution. Each sound's
 * places are tallied by its neighbours: before it nothing (#), a vowel, a
 * nasal or another consonant; after it nothing, a front vowel, another vowel
 * or a consonant. A sound is an allophone of a commoner sound like it
 * (differing in voice, a secondary articulation, the manner within its kind,
 * or a neighbouring place, as k and t͡ʃ do) that never shares its places. A
 * pair too rare to tell apart, whose keeping apart could be chance, is left
 * as two phonemes.
 */

const PLACES = ['bilabial', 'labiodental', 'dental', 'alveolar', 'postalveolar', 'alveolopalatal', 'retroflex', 'palatal', 'velar', 'labiovelar', 'uvular', 'pharyngeal', 'glottal'];
const OBSTRUENT = new Set(['stop', 'affricate', 'fricative']);
const PALATAL_FROM = new Set(['dental', 'alveolar', 'velar']);
const PALATAL_TO = new Set(['postalveolar', 'alveolopalatal', 'palatal']);
const MANNER_PAIRS = new Set(['stop|tap', 'tap|stop', 'fricative|approximant', 'approximant|fricative', 'trill|tap', 'tap|trill']);
const SECONDARY = ['voice', 'aspirated', 'glottalised', 'palatalised', 'labialised', 'long'];

/** Below this share of either sound's occurrences, a meeting place is noise (a loan, a stray analogy). */
const OVERLAP_SHARE = 0.03;
/**
 * How unlikely, by chance alone, two sounds' keeping apart must be before it
 * counts: the chance that every occurrence of one falls outside the other's
 * places, were it spread like any consonant. Three final [ɸ] beside a [β]
 * found everywhere but finally is already convincing (about 0.003); one stray
 * occurrence is not.
 */
const ALPHA = 0.05;

/** Whether b could be a conditioned variant of a. */
export function alike(a, b) {
    const fa = a.f, fb = b.f;
    if (!fa || !fb || a.type !== 'C' || b.type !== 'C') return false;
    if (!!fa.lateral !== !!fb.lateral) return false;
    if (fa.manner === 'nasal' || fb.manner === 'nasal') {
        // nasals assimilate in place: n before k is ŋ
        return fa.manner === fb.manner && SECONDARY.every((k) => !!fa[k] === !!fb[k]);
    }
    const secondary = SECONDARY.filter((k) => !!fa[k] !== !!fb[k]).length;
    const manner = fa.manner !== fb.manner;
    if (manner && !((OBSTRUENT.has(fa.manner) && OBSTRUENT.has(fb.manner)) || MANNER_PAIRS.has(`${fa.manner}|${fb.manner}`))) return false;
    if (fa.place === fb.place) {
        // lenition and its kind: b ~ β, p ~ pʰ, and Tamil's p ~ β (voice and manner at once)
        const steps = secondary + (manner ? 1 : 0);
        return steps >= 1 && steps <= 2;
    }
    // A change of place keeps everything else: palatalisation (k ~ t͡ʃ, which
    // makes an affricate as it moves, s ~ ʃ), debuccalisation (s ~ h), or a
    // neighbouring place in the same manner.
    if (secondary) return false;
    const palatal = (PALATAL_FROM.has(fa.place) && PALATAL_TO.has(fb.place)) || (PALATAL_FROM.has(fb.place) && PALATAL_TO.has(fa.place));
    const debuccal = (fa.place === 'glottal' || fb.place === 'glottal') && fa.manner === 'fricative' && fb.manner === 'fricative';
    const near = !manner && Math.abs(PLACES.indexOf(fa.place) - PLACES.indexOf(fb.place)) === 1;
    const affricated = palatal && (!manner || [fa.manner, fb.manner].sort().join('|') === 'affricate|stop');
    return affricated || debuccal || near;
}

function placeOf(form, i) {
    const l = form[i - 1], r = form[i + 1];
    const side = (p) => !p || (p.type !== 'C' && p.type !== 'V');
    const L = side(l) ? '#' : l.type === 'V' ? 'V' : l.f?.manner === 'nasal' ? 'N' : 'C';
    const R = side(r) ? '#' : r.type === 'V' ? (r.f?.back === 1 && r.f?.height <= 4 ? 'F' : 'V') : 'C';
    return L + R;
}

/**
 * The phonemic analysis of a lexicon's consonants.
 *
 * Returns { consonants: [ph] (one per phoneme, its commonest sound),
 * allophones: Map(ipa -> { of: ipa, places: [place] }) }.
 */
export function phonemicConsonants(entries) {
    const count = new Map(), places = new Map(), phOf = new Map(), all = new Map();
    let total = 0;
    for (const e of entries) {
        if (e.retired || !e.form) continue;
        const form = e.form;
        for (let i = 0; i < form.length; i++) {
            const ph = form[i];
            if (ph.type !== 'C') continue;
            const where = placeOf(form, i);
            if (!count.has(ph.ipa)) { count.set(ph.ipa, 0); places.set(ph.ipa, new Map()); phOf.set(ph.ipa, ph); }
            count.set(ph.ipa, count.get(ph.ipa) + 1);
            places.get(ph.ipa).set(where, (places.get(ph.ipa).get(where) || 0) + 1);
            all.set(where, (all.get(where) || 0) + 1);
            total++;
        }
    }
    const share = (set) => { let s = 0; for (const w of set.keys()) s += all.get(w) || 0; return s / Math.max(1, total); };

    const order = [...count.keys()].sort((a, b) => count.get(b) - count.get(a) || (a < b ? -1 : 1));
    const phonemes = [], group = new Map(), groupCount = new Map(), allophones = new Map();
    for (const b of order) {
        const pb = places.get(b), nb = count.get(b);
        let host = null;
        for (const a of phonemes) {
            if (!alike(phOf.get(a), phOf.get(b))) continue;
            const pa = group.get(a), na = groupCount.get(a);
            let meetB = 0, meetA = 0;
            for (const [w, n] of pb) if (pa.has(w)) { meetB += n; meetA += pa.get(w); }
            if (meetB > OVERLAP_SHARE * nb || meetA > OVERLAP_SHARE * na) continue;
            if (Math.pow(1 - share(pb), na) > ALPHA || Math.pow(1 - share(pa), nb) > ALPHA) continue;
            host = a;
            break;
        }
        if (host == null) {
            phonemes.push(b);
            group.set(b, new Map(pb));
            groupCount.set(b, nb);
        } else {
            const g = group.get(host);
            for (const [w, n] of pb) g.set(w, (g.get(w) || 0) + n);
            groupCount.set(host, groupCount.get(host) + nb);
            allophones.set(b, { of: host, places: [...pb.keys()] });
        }
    }
    return { consonants: phonemes.map((x) => phOf.get(x)), allophones };
}
