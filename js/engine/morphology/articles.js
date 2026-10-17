/**
 * Articles: "the" and "a" (17 Oct 2026, DJ: "I do want these to be
 * incredibly complicated like languages").
 *
 * A third of Earth's languages have no article of either kind (WALS 37A and
 * 38A, Dryer: 198 of 620). Where there is one it nearly always comes from
 * the same two places. A DEFINITE article is a demonstrative that has
 * weakened (Greenberg's definiteness cycle): first "that" itself is used to
 * mean "the" (69 languages), then a reduced word of its own splits off from
 * it (216: Latin ille, French le; Old English se, the), and in some
 * languages it fuses onto the noun as an ending (92: Romanian lupul,
 * Swedish huset; grammaticalisation.js grows that ending). An INDEFINITE
 * article is the numeral "one" (112 languages: German ein, Turkish bir), and
 * then a reduced word of its own (102: English a beside one, from ān).
 * Either can fade out again, and neither is old: Latin, Proto-Indo-European
 * and Old Chinese had none.
 *
 * The articles are words in the lexicon (pos 'art'), made from the language's
 * own "that" and "one" as they sound when the article splits off, and from
 * then on they wear down on their own (the from that, a from one). The
 * settings sit in paradigm.categories.articles.
 */

import { wordToIpa } from '../features.js';
import { syllabify } from '../phonology/phonotactics.js';

const live = (entries, gloss, pos) => entries.find((e) => e.gloss === gloss && (!pos || e.pos === pos) && !e.retired && !e.paradigm) || null;

/**
 * The proto's articles, drawn near the spread the cycle settles into, or
 * declared. An indefinite article mostly comes after a definite one (Heine
 * 1997): WALS has 45 languages with "a" and no "the" against 377 with "the",
 * so the indefinite is drawn given the definite.
 */
export function drawArticleSpec(rng, declared = {}) {
    const W_DEF = { none: 0.37, demonstrative: 0.1, word: 0.53 };
    const def = rng.pickWeighted(Object.keys(W_DEF), (k) => W_DEF[k]);
    const W_INDEF = def === 'none' ? { none: 0.82, one: 0.13, word: 0.05 } : { none: 0.45, one: 0.27, word: 0.28 };
    const indef = rng.pickWeighted(Object.keys(W_INDEF), (k) => W_INDEF[k]);
    const spec = {
        definite: declared.definiteArticle ?? (def === 'none' ? null : def),
        indefinite: declared.indefiniteArticle ?? (indef === 'none' ? null : indef),
    };
    const say = (v, kind) => (!v ? `no ${kind} article` : v === 'demonstrative' ? '"that" used as "the"' : v === 'one' ? '"one" used as "a"' : `a ${kind} article of its own`);
    return { spec, reason: `${say(spec.definite, 'definite')}; ${say(spec.indefinite, 'indefinite')}` };
}

/** An article worn down from its source: the first syllable, without its coda (that > the, ān > a). */
function weakened(form, pt) {
    const s = syllabify(form, pt)[0];
    const cut = s ? [...(s.onset || []), ...(s.nucleus || [])] : form;
    return cut.length ? cut : form;
}

/** The article word, made from its source as it now sounds. */
export function makeArticle(kind, source, pt, year = null) {
    const form = weakened(source.form, pt);
    return {
        id: `art:${kind}:${source.id}`,
        form, ipa: wordToIpa(form), gloss: kind === 'DEF' ? 'the' : 'a', pos: 'art', domain: 'grammar', core: false,
        rank: Math.max(1, source.rank ?? 1), zipf: 0, syllables: syllabify(form, pt).length, irregular: false, derivedFrom: null,
        article: kind,
        // grammar, not vocabulary: every lexical process passes it by
        paradigm: { cls: 'art', cell: kind, stem: source.id, stemGloss: source.gloss },
        grammaticalisedFrom: {
            lexeme: source.id, gloss: source.gloss, year, cline: kind === 'DEF' ? 'definite-article' : 'indefinite-article',
            attested: kind === 'DEF' ? 'Latin ille gave French le; Old English se, sēo, þæt gave the' : 'Old English ān "one" gave a and an; German ein is both',
        },
    };
}

/** Set the proto's articles. Returns { entries, system }. */
export function buildArticleSystem(entries, spec, pt) {
    if (!spec) return { entries, system: null };
    let out = entries;
    let definite = spec.definite, indefinite = spec.indefinite;
    const that = live(out, 'that', 'dem'), one = live(out, 'one', 'num');
    if (definite && !that) definite = null;
    if (indefinite && !one) indefinite = null;
    if (definite === 'word') out = [...out, makeArticle('DEF', that, pt)];
    if (indefinite === 'word') out = [...out, makeArticle('INDF', one, pt)];
    return { entries: out, system: { definite, indefinite } };
}

/** Per thousand years, scaled by the branch rate: the definiteness cycle, and the indefinite one. */
const RATE = {
    definite: { none: [['demonstrative', 0.12]], demonstrative: [['word', 0.35], [null, 0.08]], word: [[null, 0.07]] },
    indefinite: { none: [['one', 0.07]], one: [['word', 0.1], [null, 0.06]], word: [[null, 0.08]] },
};
const STEP = 250;

/**
 * Plan a lifetime's article changes from the language as founded: "that"
 * coming to mean "the", a reduced article splitting off, "one" coming to
 * mean "a", and either fading. A definite ending (grammaticalisation.js)
 * takes over from a free article when it comes. Dated events, in order.
 */
export function planArticles(state, rng, { from, to, rate = 1 } = {}) {
    const cats = state.paradigm?.categories;
    if (!cats) return [];
    const entries = state.entries || [];
    const years = Math.max(0, (to ?? from) - from);
    const sys = { definite: cats.articles?.definite ?? null, indefinite: cats.articles?.indefinite ?? null };
    if (cats.definite) sys.definite = 'affix';
    const events = [];
    for (let t = 0; t < years; t += STEP) {
        const dt = Math.min(STEP, years - t);
        const k = (dt / 1000) * rate;
        const year = Math.round(from + t + dt * rng.float(0.2, 0.8));
        for (const kind of ['definite', 'indefinite']) {
            const now = sys[kind] ?? 'none';
            const steps = RATE[kind][now];
            if (!steps) continue;   // an ending is left to grammaticalisation.js
            const r = rng.next();
            let acc = 0;
            // "a" grows mostly where "the" already has (Heine 1997)
            const slow = kind === 'indefinite' && now === 'none' && !sys.definite ? 0.17 : 1;
            for (const [to2, p] of steps) {
                acc += p * k * slow;
                if (r >= acc) continue;
                if (to2 === 'demonstrative' && !live(entries, 'that', 'dem')) break;
                if (to2 === 'one' && !live(entries, 'one', 'num')) break;
                events.push({ kind: 'article', article: kind, step: to2 ?? 'lost', from: now, year, note: NOTES[kind][to2 ?? 'lost'], attested: ATTESTED[kind][to2 ?? 'lost'] });
                sys[kind] = to2;
                break;
            }
        }
    }
    return events;
}

const NOTES = {
    definite: { demonstrative: '"that" came to be used to mean "the"', word: 'the definite article wore down into a word of its own, apart from "that"', lost: 'the definite article fell out of use' },
    indefinite: { one: '"one" came to be used to mean "a"', word: 'the indefinite article wore down into a word of its own, apart from "one"', lost: 'the indefinite article fell out of use' },
};
const ATTESTED = {
    definite: { demonstrative: 'Late Latin ille "that" used for "the"; so in Classical Greek, Hungarian and Basque before them', word: 'French le beside celui, English the beside that', lost: 'Russian and the other Slavic languages had no article to keep; Old Norse hinn gave way to an ending' },
    indefinite: { one: 'German ein, Turkish bir, Hungarian egy are "one" and "a" at once', word: 'English a beside one, both from Old English ān', lost: 'an indefinite article can simply go out of use, as Old Irish never had one' },
};

/** Apply a lifetime's article events: make or remove the article words, move the settings. */
export function applyArticles(entries, events, { phonotactics, categories } = {}) {
    const before = { definite: categories?.articles?.definite ?? null, indefinite: categories?.articles?.indefinite ?? null };
    if (!events?.length && !(categories?.definite && before.definite !== 'affix')) return { entries, applied: [], categories: null };
    let out = entries;
    const sys = { definite: categories?.articles?.definite ?? null, indefinite: categories?.articles?.indefinite ?? null };
    const applied = [];
    for (const ev of events || []) {
        const kind = ev.article;
        if (kind === 'definite' && sys.definite === 'affix') continue;
        const tag = kind === 'definite' ? 'DEF' : 'INDF';
        if (ev.step === 'word') {
            const src = live(out, kind === 'definite' ? 'that' : 'one', kind === 'definite' ? 'dem' : 'num');
            if (!src?.form?.length) continue;
            out = [...out.filter((e) => e.article !== tag), makeArticle(tag, src, phonotactics, ev.year)];
        } else if (ev.step === 'lost') {
            out = out.filter((e) => e.article !== tag);
        } else if (ev.step === 'demonstrative' || ev.step === 'one') {
            out = out.filter((e) => e.article !== tag);
        } else continue;
        sys[kind] = ev.step === 'lost' ? null : ev.step;
        applied.push(ev);
    }
    // a definite ending (Romanian lupul) takes over from the free article
    if (categories?.definite && sys.definite !== 'affix') {
        out = out.filter((e) => e.article !== 'DEF');
        sys.definite = 'affix';
    }
    if (!applied.length && sys.definite === before.definite && sys.indefinite === before.indefinite) return { entries, applied, categories: null };
    return { entries: out, applied, categories: { ...(categories || {}), articles: sys } };
}

/** WALS 37A's and 38A's values for a language. */
export function articleValues(cats) {
    const a = cats?.articles || {};
    const def = cats?.definite ? 'affix' : a.definite ?? null;
    const indef = a.indefinite ?? null;
    return {
        definite: def === 'affix' ? 'definite affix' : def === 'word' ? 'definite word' : def === 'demonstrative' ? '"that" as definite' : indef ? 'only indefinite' : 'no articles',
        indefinite: indef === 'word' ? 'indefinite word' : indef === 'one' ? '"one" as indefinite' : def ? 'only definite' : 'no articles',
    };
}

/** One line for notes and reports. */
export function describeArticles(cats) {
    const v = articleValues(cats);
    if (v.definite === 'no articles') return 'no articles';
    return [v.definite === 'only indefinite' ? 'no "the"' : v.definite === 'definite affix' ? '"the" as an ending' : v.definite === '"that" as definite' ? '"that" used as "the"' : 'a word for "the"',
        v.indefinite === 'only definite' ? 'no "a"' : v.indefinite === '"one" as indefinite' ? '"one" used as "a"' : 'a word for "a"'].join(', ');
}
