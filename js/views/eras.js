/**
 * Era snapshots: Andah's languages in any year. Which families and languages
 * were spoken, the events around it, and on request a few basic words of each
 * language as it stood that year (derived live), so a story set in 900 AFA
 * uses the languages of 900 AFA.
 *
 * Every date is a placeholder until Phase 5 anchors the tree to history.
 */

import { esc } from '../views.js';
import { projectFor, stateAtYear } from '../lang-project.js';

const PRESETS = [-3000, -1500, -500, 0, 500, 1000, 1400, 1600, 1700, 1765];
const SAMPLE = ['I', 'water', 'sun', 'mother', 'king'];

export function render(el, ctx) {
    const { model, doc, presentYear, palette, familyOf, state } = ctx;
    const minYear = Math.min(...model.languages.map((l) => l.born));
    state.year ??= 1000;
    state.samples ??= {};
    const y = state.year;

    const endOf = (l) => {
        if (l.died != null) return l.died;
        const kids = model.languages.filter((x) => x.parentId === l.id);
        if (l.diverged || kids.some((k) => k.relation === 'stage')) return kids.length ? Math.max(...kids.map((k) => k.born)) : presentYear;
        return presentYear + 1;
    };
    const alive = model.languages.filter((l) => l.born <= y && endOf(l) > y);
    const byFamily = new Map();
    for (const l of alive) {
        const f = familyOf(l.id) ?? (l.kind === 'constructed' ? 'Lastnu' : 'other');
        if (!byFamily.has(f)) byFamily.set(f, []);
        byFamily.get(f).push(l);
    }
    const events = (doc.events || []).filter((e) => Math.abs(e.year - y) <= 100 || (e.endYear != null && e.year <= y && e.endYear >= y));
    const yearLabel = (v) => (v < 0 ? `${-v} BFA` : `${v} AFA`);

    el.innerHTML = `
      <div class="views-controls">
        <label>Year <input type="range" id="er-range" min="${minYear}" max="${presentYear}" value="${y}" style="width:320px"></label>
        <input type="number" id="er-year" value="${y}" style="width:80px"> <b>${yearLabel(y)}</b>
        ${PRESETS.filter((p) => p >= minYear).map((p) => `<button class="linklike" data-year="${p}">${yearLabel(p)}</button>`).join(' ')}
      </div>
      <div class="hint">${alive.length} languages in ${byFamily.size} families. Dates are placeholders until Phase 5 anchors them to history.</div>
      ${events.length ? `<div class="kv"><b>Around then:</b> ${events.map((e) => `${esc(e.label)} (${e.year}${e.endYear ? `–${e.endYear}` : ''})`).join('; ')}</div>` : ''}
      <div class="era-fams">${[...byFamily].sort((a, b) => b[1].length - a[1].length).map(([f, list]) => {
        const sample = state.samples[`${f}@${y}`];
        return `<div class="era-fam" style="border-left-color:${palette.get(f) ?? 'gray'}">
          <div><b>${esc(f)}</b> <span class="hint">${list.length}</span>
            ${list[0] && f !== 'other' && f !== 'Lastnu' ? `<button class="linklike" data-sample="${esc(f)}">${sample ? 'refresh words' : 'sample words'}</button>` : ''}</div>
          <div class="era-langs">${list.sort((a, b) => a.name.localeCompare(b.name)).map((l) => `<button class="linklike" data-focus-lang="${esc(l.id)}">${l.reconstructed ? '*' : ''}${esc(l.name)}</button>`).join(', ')}</div>
          ${sample ? `<table class="views-table compact"><tr><th></th>${SAMPLE.map((g) => `<th>${g}</th>`).join('')}</tr>${sample.map((r) => `<tr><td>${esc(r.name)}</td>${r.words.map((w) => `<td class="ipa">${esc(w ?? '—')}</td>`).join('')}</tr>`).join('')}</table>` : ''}
        </div>`;
    }).join('')}</div>`;

    const go = (v) => { state.year = Math.max(minYear, Math.min(presentYear, Math.round(Number(v)))); render(el, ctx); };
    el.querySelector('#er-range').addEventListener('change', (e) => go(e.target.value));
    el.querySelector('#er-year').addEventListener('change', (e) => go(e.target.value));
    el.querySelectorAll('[data-year]').forEach((b) => b.addEventListener('click', () => go(b.getAttribute('data-year'))));
    el.querySelectorAll('[data-sample]').forEach((b) => b.addEventListener('click', () => {
        const f = b.getAttribute('data-sample');
        b.textContent = 'deriving…';
        setTimeout(() => {
            const rows = [];
            for (const l of byFamily.get(f).slice(0, 10)) {
                try {
                    const project = projectFor(model, l.id, presentYear);
                    const st = project && stateAtYear(project, l.id, y);
                    if (!st) continue;
                    rows.push({ name: l.name, words: SAMPLE.map((g) => st.entries.find((e) => e.gloss === g && !e.retired && !e.paradigm)?.ipa) });
                } catch { /* a language the engine cannot derive is skipped */ }
            }
            state.samples[`${f}@${y}`] = rows;
            render(el, ctx);
        }, 30);
    }));
}
