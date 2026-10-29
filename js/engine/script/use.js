/**
 * Text in its script: which script a language wrote in a given year, and
 * a translated passage written in it (DJ, 29 Oct 2026: the text writing,
 * after the scripts).
 *
 * The script history (data/history/script-history.json, built by
 * scripts/build-script-history.js) says which script line each language
 * took up and when, and for what reason: its own, its rulers', its faith's,
 * a neighbour's, its mother's. The stage in force in a year is found along
 * that line: up from the line's modern stage until one is old enough, then
 * down again along the branch the language's own ancestors wrote, as a
 * daughter keeps writing the current form of her mother's script. Without
 * a history, a language writes the latest stage it or its nearest ancestor
 * used.
 */

import { hydrate } from './strokes.js';
import { writeWord, wordSvg } from './write.js';

let cache = null;

/** data/scripts.json (with the script history beside it, where built), loaded once, word-sign stages ready to draw. */
export async function loadScripts(url = 'data/scripts.json', historyUrl = 'data/history/script-history.json') {
    if (!cache) {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) return null;
        cache = await res.json();
        for (const st of cache.stages) if (st.logographic) hydrate(st);
        try { const h = await fetch(historyUrl, { cache: 'no-store' }); if (h.ok) cache.history = await h.json(); } catch { /* no history: the fallback rule */ }
    }
    return cache;
}

const ancestorsOf = (langId, parentOf) => { const out = new Set(); for (let id = langId, n = 0; id && n < 40; id = parentOf(id), n++) { if (out.has(id)) break; out.add(id); } return out; };

/**
 * The stage of a script line in force in `year` for a language: from the
 * event's modern stage (`tip`) up until a stage is old enough, no higher
 * than the line's first stage; then down the branches, the one the
 * language's own ancestors wrote first, else the one towards the tip.
 */
export function stageInForce(data, ev, year, langId, parentOf) {
    const byId = data._byId || (data._byId = new Map(data.stages.map((s) => [s.id, s])));
    const kidsOf = data._kids || (data._kids = (() => { const m = new Map(); for (const s of data.stages) { if (!m.has(s.parent)) m.set(s.parent, []); m.get(s.parent).push(s); } return m; })());
    const onLine = (s) => s && (s.line === ev.line || !ev.line);
    let s = byId.get(ev.tip) || byId.get(ev.line);
    if (!s) return null;
    const towardTip = new Set(); for (let t = byId.get(ev.tip); t; t = byId.get(t.parent)) towardTip.add(t.id);
    while (s.year > year && byId.get(s.parent) && onLine(byId.get(s.parent))) s = byId.get(s.parent);
    if (s.year > year) return null;   // the line did not exist yet
    const mine = ancestorsOf(langId, parentOf);
    for (;;) {
        const kids = (kidsOf.get(s.id) || []).filter((k) => k.year <= year && onLine(k));
        if (!kids.length) return s;
        s = kids.find((k) => k.users.some((u) => mine.has(u.lang))) || kids.find((k) => towardTip.has(k.id)) || kids[0];
    }
}

/**
 * The stage a language wrote in `year`, with whose script it is (`via`) and
 * why. With a history, a language no event reaches is unwritten (null).
 */
export function scriptOf(data, langId, year, parentOf) {
    const h = data.history?.languages;
    if (h) {
        const events = (h[langId] || []).filter((e) => e.year <= year);
        if (!events.length) return null;
        const ev = events[events.length - 1];
        const stage = stageInForce(data, ev, year, langId, parentOf);
        return stage ? { stage, via: ev.reason === 'own' ? langId : ev.via ?? langId, reason: ev.reason, since: ev.year } : null;
    }
    const seen = new Set();
    for (let id = langId; id && !seen.has(id); id = parentOf(id)) {
        seen.add(id);
        const own = data.stages.filter((s) => s.year <= year && s.users.some((u) => u.lang === id && u.from <= year));
        if (own.length) return { stage: own.sort((a, b) => b.year - a.year)[0], via: id, reason: id === langId ? 'own' : 'family' };
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
