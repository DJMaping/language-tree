/**
 * The words of a faith, from its sacred language (DJ, 30 Oct 2026: faith
 * words "from each religion's sacred language, the way Latin, Arabic and Pali
 * words spread with their faiths", the sacred languages my picks for his
 * veto).
 *
 * A people that takes up a faith takes many of its words from the language
 * of its scriptures, in their classical form: English has Latin altar,
 * saint and scripture, Persian and Turkish have Arabic dua and namaz's
 * neighbours, Thai has Pali and Sanskrit for monk, merit and sin. The
 * sacred language is the one its founders spoke, frozen as it stood then;
 * its own descendants keep their native words. Each word is taken or not on
 * its own (roughly half the nouns, a third of the verbs, as Latin's share of
 * English church vocabulary), and a taken word displaces the native one.
 *
 * The faiths and the years each language took one up come from
 * scripts/build-script-history.js (data/history/script-history.json
 * `faiths`): the faith of its lands, from when someone who held it reached
 * them. Every word is of the wider vocabulary (lexicon/wider.js), so none of
 * this moves an older word.
 */

import { wordToIpa } from '../features.js';
import { syllabify } from '../phonology/phonotactics.js';
import { classOf } from './roots.js';
import { adapt } from '../contact.js';

/** Each religion's sacred language and the year its words are frozen at (my picks; DJ's founding dates). */
export const SACRED = {
    Tzinalli: { lang: 'proto-arten', year: -2800, note: 'the oldest Arten on record; the faith is older still (3000 BFA)' },
    Kallimethra: { lang: 'saetnde', year: -1000, note: 'the Saetnde of the founding, as Latin for the Church' },
    Imarel: { lang: 'proto-ankusano-elaian', year: -400, note: 'the Ankusano of the people who made the letters it is written in' },
    Thessovai: { lang: 'osnealan', year: -300, note: 'the Osnealan of the founding' },
    Kelhari: { lang: 'classical-ukhdari', year: -200, note: 'Classical Ukhdari, as Arabic for Islam' },
    Srivandha: { lang: 'sakernlesi', year: 500, note: 'the Sakernlesi of the founding, as Pali for the Theravada' },
    Passanu: { lang: 'passonin', year: 500, note: 'the Passonin of the founding' },
};

/** The words a faith brings, and how readily each is taken (nouns more than verbs). */
export const FAITH_WORDS = [
    ['prayer', 'n', 0.55], ['worship', 'v', 0.35], ['faith', 'n', 0.5], ['heaven', 'n', 0.45], ['hell', 'n', 0.45],
    ['shrine', 'n', 0.5], ['altar', 'n', 0.6], ['pilgrim', 'n', 0.55], ['pilgrimage', 'n', 0.55], ['saint', 'n', 0.6],
    ['monk', 'n', 0.6], ['prophet', 'n', 0.6], ['ritual', 'n', 0.5], ['offering', 'n', 0.4], ['scripture', 'n', 0.65],
    ['sin', 'n', 0.45], ['virtue', 'n', 0.45], ['afterlife', 'n', 0.4], ['heretic', 'n', 0.55], ['convert', 'v', 0.35],
    ['bless', 'v', 0.35], ['pray', 'v', 0.3],
];

/**
 * A faith's words in a language that took it up in `year`, from the sacred
 * language's state at its frozen year. `rngFor(gloss)` gives each word its
 * own draw; words the language does not have a slot for are skipped.
 */
export function faithLoans(faith, sacredState, state, year, rngFor) {
    const S = SACRED[faith];
    if (!S || !sacredState) return [];
    const out = [];
    for (const [gloss, pos, p] of FAITH_WORDS) {
        if (!rngFor(gloss).bool(p)) continue;
        const w = sacredState.entries.find((e) => e.gloss === gloss && e.pos === pos && !e.retired && !e.paradigm);
        if (!w) continue;
        const form = adapt(w.form, state);
        if (!form?.length) continue;
        out.push({
            id: `faith:${faith}:${gloss}|${pos}`, form, ipa: wordToIpa(form), gloss, pos, domain: 'religion', core: false,
            rank: w.rank, zipf: 0, class: classOf(form, pos), syllables: syllabify(form, state.phonotactics).length, irregular: false, derivedFrom: null,
            loan: { from: S.lang, borrowingId: `faith:${faith}`, kind: 'loan', learned: true, strength: 1, year, label: `the ${faith} scriptures`, donorForm: w.ipa, adapted: wordToIpa(form) !== w.ipa, displaces: true },
            faith: { name: faith, year, sacred: S.lang },
            enteredAt: year, wider: true,
        });
    }
    return out;
}
