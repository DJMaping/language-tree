/**
 * Typology maps, in the manner of the World Atlas of Language Structures: one
 * feature at a time across Andah, each country coloured by its main language,
 * and Earth underneath on the same scale for comparison.
 *
 * A country's main language is its official language with the most native
 * speakers (colonial ones only if nothing else is official); failing that, a
 * living language of the branch DJ's map gives the majority.
 *
 * Earth (scripts/build-earth.js) is WALS as published: a dot per language
 * WALS describes, and each country coloured by its main language, with
 * handbook values where WALS has none (marked "est." in the side panel).
 * The categories are WALS's (js/views/typology-bins.js), so a colour means
 * the same thing on both maps.
 */

import { esc } from '../views.js';
import { countryMap, majorityBranch } from './geo.js';
import { FEATURES, andahValue } from './typology-bins.js';

/** Scales that run from less to more get a ramp; the rest get distinct hues. */
const ORDINAL = new Set(['tone', 'vowels', 'consonants', 'syllables', 'cases']);
const NOMINAL_HUES = [210, 25, 130, 285, 50, 340, 175];
function colorFor(feature, value) {
    const values = FEATURES[feature].values;
    const i = values.indexOf(value);
    if (i < 0) return 'var(--bg-sunken)';
    if (feature === 'aspirates' || feature === 'rounded') return value === 'present' ? 'hsl(15 70% 52%)' : 'hsl(210 30% 72%)';
    if (ORDINAL.has(feature)) {
        const t = values.length > 1 ? i / (values.length - 1) : 0;
        return `hsl(${Math.round(220 - 210 * t)} ${55 + 15 * t}% ${62 - 14 * t}%)`;
    }
    return `hsl(${NOMINAL_HUES[i % NOMINAL_HUES.length]} 60% 52%)`;
}

export function render(el, ctx) {
    const { atlas, shapes, doc, views, state, earth, earthShapes } = ctx;
    state.feature ??= 'order';
    state.earthLayer ??= 'both';
    const S = atlas.states;
    const byId = ctx.model.byId;
    const key = state.feature;
    const feat = FEATURES[key];

    // --- Andah: each country's main language --------------------------------
    const officialIn = new Map();
    for (const l of doc.languages) for (const a of l.areas || []) {
        if (!views.languages[l.id]) continue;
        if (!officialIn.has(a.state)) officialIn.set(a.state, []);
        officialIn.get(a.state).push({ id: l.id, role: a.role, l1: l.speakers?.l1 ?? 0 });
    }
    const branchNode = new Map();
    for (const f of doc.families || []) for (const b of f.branches || []) branchNode.set(b.name, b.nodeId);
    const livingUnder = (nodeId) => {
        const out = [];
        const walk = (id) => {
            const kids = ctx.model.languages.filter((x) => x.parentId === id);
            if (!kids.length && views.languages[id] && byId.get(id)?.died == null) out.push(id);
            for (const k of kids) walk(k.id);
        };
        if (nodeId) walk(nodeId);
        return out;
    };
    const mainOf = new Map();
    for (const country of Object.keys(shapes.shapes)) {
        const list = officialIn.get(country) || [];
        const pick = (role) => list.filter((o) => o.role === role).sort((a, b) => b.l1 - a.l1)[0]?.id;
        let id = pick('official') || null;
        let how = 'official language';
        if (!id) {
            const under = livingUnder(branchNode.get(majorityBranch(S[country])));
            if (under.length) { id = under[0]; how = 'a language of the majority branch'; }
        }
        if (!id) { id = pick('colonial') || null; how = 'colonial language'; }
        if (id) mainOf.set(country, { id, how });
    }
    const andahOf = (id) => { const L = views.languages[id]; return L ? andahValue(key, L.features, views.families[L.family]) : null; };
    const valueOf = (country) => { const m = mainOf.get(country); return m ? andahOf(m.id) : null; };

    // --- Earth --------------------------------------------------------------
    const E = earth.languages;
    const earthMain = (iso) => E[earth.countries[iso]] || null;
    const earthValue = (iso) => earthMain(iso)?.v[key] ?? null;
    const showCountries = state.earthLayer !== 'dots';
    const showDots = state.earthLayer !== 'countries';
    const dots = showDots ? Object.entries(E)
        .filter(([, l]) => l.lat != null && (l.src[key] === 'w' || l.src[key] === 'd'))
        .map(([id, l]) => ({ key: id, lon: l.lon, lat: l.lat, color: colorFor(key, l.v[key]), title: `${l.n} (${l.fam}): ${l.v[key]}` })) : [];

    // --- shares, for the comparison table -----------------------------------
    const tally = (list) => { const m = new Map(); let n = 0; for (const v of list) if (v) { m.set(v, (m.get(v) || 0) + 1); n++; } return { m, n }; };
    const cols = [
        ['Andah languages', tally(Object.keys(views.languages).filter((id) => byId.get(id)?.died == null).map(andahOf))],
        ['Andah countries', tally(Object.keys(shapes.shapes).map(valueOf))],
        ['Earth countries', tally(Object.keys(earthShapes.shapes).map(earthValue))],
        ['Earth languages (WALS)', tally(Object.values(E).filter((l) => l.lat != null && (l.src[key] === 'w' || l.src[key] === 'd')).map((l) => l.v[key]))],
    ];
    const seen = feat.values.filter((v) => cols.some(([, t]) => t.m.has(v)));
    const pct = (t, v) => (t.n ? Math.round((100 * (t.m.get(v) || 0)) / t.n) : 0);
    const table = `<table class="ty-compare"><tr><th></th>${cols.map(([h, t]) => `<th>${h}<br><span class="hint">${t.n}</span></th>`).join('')}</tr>
      ${seen.map((v) => `<tr><td><i class="sw" style="background:${colorFor(key, v)}"></i>${esc(v)}</td>${cols.map(([, t]) => {
        if (!t.n) return '<td class="hint">no data</td>';
        const p = pct(t, v);
        return `<td><span class="bar" style="width:${p}%;background:${colorFor(key, v)}"></span><span class="num">${p}%</span></td>`;
    }).join('')}</tr>`).join('')}</table>`;

    // --- maps ---------------------------------------------------------------
    const andahMap = countryMap(shapes, {
        fill: (c) => (valueOf(c) ? colorFor(key, valueOf(c)) : 'var(--bg-sunken)'),
        title: (c) => { const m = mainOf.get(c); return `${c}: ${valueOf(c) ?? 'no data'}${m ? ` (${byId.get(m.id)?.name}, ${m.how})` : ''}`; },
        selected: state.selected, cls: 'ty-andah',
    });
    const earthMap = countryMap(earthShapes, {
        fill: (iso) => (showCountries && earthValue(iso) ? colorFor(key, earthValue(iso)) : 'var(--bg-sunken)'),
        title: (iso) => { const l = earthMain(iso); return `${earthShapes.names[iso]}: ${earthValue(iso) ?? 'no data'}${l ? ` (${l.main || l.n}${l.src[key] === 'h' ? ', estimate' : ''})` : ''}`; },
        selected: state.earthSel?.startsWith('c:') ? state.earthSel.slice(2) : null,
        dots, selectedDot: state.earthSel?.startsWith('d:') ? state.earthSel.slice(2) : null, cls: 'ty-earth',
    });
    const walsNote = feat.wals
        ? `WALS chapter ${feat.wals}${key === 'morphology' ? ' (WALS has no single type; read from fusion, exponence and verb synthesis)' : ''}`
        : 'WALS has no chapter for this; Earth countries use handbook estimates and there are no dots';

    el.innerHTML = `
      <div class="views-controls">
        <label>Feature <select id="ty-feature">${Object.entries(FEATURES).map(([k, f]) => `<option value="${k}"${k === key ? ' selected' : ''}>${f.label}</option>`).join('')}</select></label>
        <label>Earth shows <select id="ty-layer">
          <option value="both"${state.earthLayer === 'both' ? ' selected' : ''}>countries + WALS dots</option>
          <option value="countries"${state.earthLayer === 'countries' ? ' selected' : ''}>countries (main language)</option>
          <option value="dots"${state.earthLayer === 'dots' ? ' selected' : ''}>WALS dots only</option>
        </select></label>
        <span class="hint">Same colours on both maps. ${esc(walsNote)}.</span>
      </div>
      <div class="views-split">
        <div class="views-main">
          <h4 class="ty-head">Andah <span class="hint">each country by its main language</span></h4>
          ${andahMap}
          <h4 class="ty-head">Earth <span class="hint">${showCountries ? 'countries by their main language' : ''}${showCountries && showDots ? ', ' : ''}${showDots ? `${dots.length} WALS languages as dots` : ''}</span></h4>
          ${earthMap}
          <h4 class="ty-head">Andah against Earth <span class="hint">share of each</span></h4>
          ${table}
        </div>
        <div class="views-side">${side()}</div>
      </div>`;

    function side() {
        if (state.earthSel) {
            const [kind, id] = [state.earthSel.slice(0, 1), state.earthSel.slice(2)];
            const l = kind === 'c' ? earthMain(id) : E[id];
            if (!l) return '<div class="hint">No data.</div>';
            return `<h3>${esc(kind === 'c' ? earthShapes.names[id] : l.n)}</h3>
              <div class="kv"><b>${kind === 'c' ? 'Main language' : 'Language'}:</b> ${esc(l.main || l.n)} <span class="hint">${esc(l.fam || '')}</span></div>
              <div class="kv"><b>${feat.label}:</b> ${esc(l.v[key] ?? '?')}</div>
              <table class="kv-table">${Object.entries(FEATURES).map(([k, f]) => `<tr><td>${f.label}</td><td>${esc(l.v[k] ?? '?')}${l.src[k] === 'h' ? ' <span class="hint">est.</span>' : l.src[k] === 'd' ? ' <span class="hint">derived</span>' : ''}</td></tr>`).join('')}</table>
              <div class="hint">Values from WALS unless marked: est. = handbook estimate (editable in data/canon/earth-main-languages.json); derived = read from WALS's fusion, exponence and verb-synthesis chapters.</div>`;
        }
        const sel = state.selected && mainOf.get(state.selected);
        if (!sel) return '<div class="hint">Click a country or dot on either map.</div>';
        const L = views.languages[sel.id];
        return `<h3>${esc(state.selected)}</h3>
          <div class="kv"><b>Main language:</b> <button class="linklike" data-focus-lang="${esc(sel.id)}">${esc(byId.get(sel.id)?.name)}</button> <span class="hint">${sel.how}</span></div>
          <div class="kv"><b>${feat.label}:</b> ${esc(valueOf(state.selected) ?? '?')}</div>
          <table class="kv-table">${Object.entries(FEATURES).map(([k, f]) => `<tr><td>${f.label}</td><td>${esc(andahValue(k, L.features, views.families[L.family]) ?? '?')}</td></tr>`).join('')}</table>`;
    }

    el.querySelector('#ty-feature').addEventListener('change', (e) => { state.feature = e.target.value; render(el, ctx); });
    el.querySelector('#ty-layer').addEventListener('change', (e) => { state.earthLayer = e.target.value; render(el, ctx); });
    el.querySelector('.ty-andah').addEventListener('click', (e) => {
        const c = e.target.closest('[data-country]');
        if (c) { state.selected = c.getAttribute('data-country'); state.earthSel = null; render(el, ctx); }
    });
    el.querySelector('.ty-earth').addEventListener('click', (e) => {
        const d = e.target.closest('[data-dot]');
        const c = e.target.closest('[data-country]');
        if (d) state.earthSel = `d:${d.getAttribute('data-dot')}`;
        else if (c) state.earthSel = `c:${c.getAttribute('data-country')}`;
        else return;
        state.selected = null;
        render(el, ctx);
    });
}
