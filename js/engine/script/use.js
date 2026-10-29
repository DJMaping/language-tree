/**
 * Text in its script: which script a language wrote in a given year, and
 * a translated passage written in it (DJ, 29 Oct 2026: the text writing,
 * after the scripts).
 *
 * A language writes the latest script stage it uses by that year, or,
 * where it has none of its own, the one its nearest ancestor used: a
 * daughter keeps the script of the people she came from (Trian writes
 * Casan, the Sursian dialects Sakernlesi) until history gives her another.
 */

import { hydrate } from './strokes.js';
import { writeWord, wordSvg } from './write.js';

let cache = null;

/** data/scripts.json, loaded once, word-sign stages ready to draw. */
export async function loadScripts(url = 'data/scripts.json') {
    if (!cache) {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) return null;
        cache = await res.json();
        for (const st of cache.stages) if (st.logographic) hydrate(st);
    }
    return cache;
}

/**
 * The stage a language wrote in `year`: its own latest, else its nearest
 * ancestor's. `parentOf(id)` gives a language's parent id. Returns
 * { stage, via } where `via` is the language whose script it is.
 */
export function scriptOf(data, langId, year, parentOf) {
    const seen = new Set();
    for (let id = langId; id && !seen.has(id); id = parentOf(id)) {
        seen.add(id);
        const own = data.stages.filter((s) => s.year <= year && s.users.some((u) => u.lang === id && u.from <= year));
        if (own.length) return { stage: own.sort((a, b) => b.year - a.year)[0], via: id };
    }
    return null;
}

/**
 * Translated words (translate.js: each with its form and the entry it
 * came from) written in a stage: one written word per word, the entry's
 * gloss naming the word-sign where the script has them.
 */
export function writePassage(stage, state, words) {
    const byId = new Map(state.entries.map((e) => [e.id, e]));
    return words.map((w, i) => writeWord(stage, w.form, byId.get(w.entryId)?.gloss ?? null, state.phonotactics, { capital: i === 0 && !!stage.bicameral }))
        .filter((x) => x.length);
}

export { wordSvg };
