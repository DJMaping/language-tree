/**
 * Language map: the 172 countries coloured by family, branch, or the family of
 * the official language, from DJ's map shares. Click a country for who speaks
 * what there.
 */

import { esc, keyColor } from '../views.js';
import { countryMap, legend, majorityFamily, majorityBranch } from './geo.js';

const MODES = { family: 'Majority family', branch: 'Majority branch', official: 'Family of the official language' };

export function render(el, ctx) {
    const { atlas, shapes, doc, palette, state } = ctx;
    state.mode ??= 'family';
    const S = atlas.states;

    // Official languages per country, from the chart's canon areas.
    const officialIn = new Map();
    for (const l of doc.languages) for (const a of l.areas || []) {
        if (!officialIn.has(a.state)) officialIn.set(a.state, []);
        officialIn.get(a.state).push({ lang: l, role: a.role });
    }
    const familyOfLang = ctx.familyOf;
    const officialFamily = (country) => {
        const list = (officialIn.get(country) || []).filter((o) => o.role === 'official');
        const best = list.sort((a, b) => (b.lang.speakers?.l1 ?? 0) - (a.lang.speakers?.l1 ?? 0))[0];
        return best ? familyOfLang(best.lang.id) ?? (best.lang.kind === 'constructed' ? 'Lastnu' : null) : null;
    };

    const keyOf = (country) => {
        const s = S[country];
        if (state.mode === 'family') return majorityFamily(s);
        if (state.mode === 'branch') return majorityBranch(s);
        return officialFamily(country);
    };
    const colorOf = (key) => (state.mode === 'branch' ? keyColor(key, 55, 55) : palette.get(key)) || 'var(--bg-sunken)';
    const counts = new Map();
    for (const c of Object.keys(shapes.shapes)) { const k = keyOf(c); if (k) counts.set(k, (counts.get(k) || 0) + 1); }

    const map = countryMap(shapes, {
        fill: (c) => (keyOf(c) ? colorOf(keyOf(c)) : 'var(--bg-sunken)'),
        title: (c) => `${c}: ${keyOf(c) ?? 'no data'}`,
        selected: state.selected,
    });

    el.innerHTML = `
      <div class="views-controls">
        <label>Colour by <select id="map-mode">${Object.entries(MODES).map(([k, v]) => `<option value="${k}"${k === state.mode ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
        <span class="hint">Click a country for its languages. Shares are DJ's family map (People Atlas); official and colonial languages are the wiki's.</span>
      </div>
      <div class="views-split">
        <div class="views-main">${map}${legend([...counts].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ label: k, color: colorOf(k), count: n })))}</div>
        <div class="views-side" id="map-side">${state.selected ? countryInfo(state.selected, S[state.selected], officialIn.get(state.selected) || [], palette, ctx) : '<div class="hint">No country selected.</div>'}</div>
      </div>`;
    el.querySelector('#map-mode').addEventListener('change', (e) => { state.mode = e.target.value; render(el, ctx); });
    el.querySelector('.views-map').addEventListener('click', (e) => {
        const c = e.target.closest('[data-country]');
        if (c) { state.selected = c.getAttribute('data-country'); render(el, ctx); }
    });
}

function bar(label, share, color) {
    return `<div class="share"><span class="share-label">${esc(label)}</span><span class="share-bar"><i style="width:${Math.round(share * 100)}%;background:${color}"></i></span><span class="share-n">${Math.round(share * 100)}%</span></div>`;
}

function countryInfo(name, s, officials, palette, ctx) {
    if (!s) return `<h3>${esc(name)}</h3><div class="hint">Not in the Atlas data.</div>`;
    const fams = Object.entries(s.fs || {}).sort((a, b) => b[1] - a[1]);
    const brs = [...(s.br || [])].sort((a, b) => b[1] - a[1]);
    const langRows = officials
        .sort((a, b) => (b.lang.speakers?.l1 ?? 0) - (a.lang.speakers?.l1 ?? 0))
        .map(({ lang, role }) => `<li><button class="linklike" data-focus-lang="${esc(lang.id)}">${esc(lang.name)}</button>
          <span class="hint">${role}${lang.speakers ? `, ${lang.speakers.l1}M L1` : ''}${ctx.familyOf(lang.id) ? `, ${esc(ctx.familyOf(lang.id))}` : ''}</span></li>`).join('');
    return `<h3>${esc(name)}</h3>
      <div class="kv"><b>Continent:</b> ${esc(s.c)} · <b>Population 1765:</b> ${s.pop1765 != null ? `${s.pop1765.toFixed(1)}M` : '?'}</div>
      <h4>Families on the map</h4>${fams.map(([f, v]) => bar(f, v, palette.get(f) || 'var(--muted)')).join('')}
      <h4>Branches</h4>${brs.map(([b, v]) => bar(b, v, keyColor(b, 55, 55))).join('')}
      <h4>Official and colonial languages</h4>${langRows ? `<ul class="plain">${langRows}</ul>` : '<div class="hint">None named on the wiki.</div>'}`;
}
