/**
 * Typology maps, in the manner of the World Atlas of Language Structures: one
 * feature at a time across Andah, each country coloured by its main language.
 * Shows areal patterns, or their absence, at a glance.
 *
 * A country's main language is its official language with the most native
 * speakers (colonial ones only if nothing else is official); failing that, a
 * living language of the branch DJ's map gives the majority.
 */

import { esc, keyColor } from '../views.js';
import { countryMap, legend, majorityBranch } from './geo.js';

const FEATURES = {
    order: { label: 'Basic word order', value: (f) => f.order },
    morphology: { label: 'Morphological type', value: (f, fam) => fam?.character?.morphology?.type },
    alignment: { label: 'Alignment', value: (f, fam) => (fam?.character?.morphology?.alignment === 'erg-abs' ? 'ergative' : fam?.character ? 'accusative' : null) },
    tone: { label: 'Tone', value: (f) => (f.toneLevels ? `${f.toneLevels} tone level${f.toneLevels > 1 ? 's' : ''}` : 'no tone') },
    vowels: { label: 'Vowel qualities', value: (f) => (f.vowels <= 4 ? 'small (2-4)' : f.vowels <= 6 ? 'average (5-6)' : 'large (7+)') },
    consonants: { label: 'Consonant inventory', value: (f) => (f.consonants <= 14 ? 'small (up to 14)' : f.consonants <= 22 ? 'average (15-22)' : f.consonants <= 28 ? 'large (23-28)' : 'very large (29+)') },
    aspirates: { label: 'Aspirated stops', value: (f) => (f.aspirates ? 'present' : 'absent') },
    rounded: { label: 'Front rounded vowels', value: (f) => (f.frontRounded ? 'present' : 'absent') },
    syllables: { label: 'Syllables per basic word', value: (f) => (f.syllables < 1.5 ? 'under 1.5' : f.syllables < 2 ? '1.5-2' : f.syllables < 2.5 ? '2-2.5' : '2.5 and over') },
    cases: { label: 'Cases', value: (f) => (f.cases === 0 ? 'none' : f.cases <= 2 ? '1-2' : f.cases <= 5 ? '3-5' : '6+') },
};
const ORDERED = ['no tone', '1 tone level', '2 tone levels', '3 tone levels', 'small (2-4)', 'average (5-6)', 'large (7+)'];

export function render(el, ctx) {
    const { atlas, shapes, doc, views, state } = ctx;
    state.feature ??= 'order';
    const S = atlas.states;
    const byId = ctx.model.byId;

    const officialIn = new Map();
    for (const l of doc.languages) for (const a of l.areas || []) {
        if (!views.languages[l.id]) continue;
        if (!officialIn.has(a.state)) officialIn.set(a.state, []);
        officialIn.get(a.state).push({ id: l.id, role: a.role, l1: l.speakers?.l1 ?? 0 });
    }
    // Living descendants of each branch node, for the fallback.
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

    const feat = FEATURES[state.feature];
    const valueOf = (country) => {
        const m = mainOf.get(country);
        const L = m && views.languages[m.id];
        return L ? feat.value(L.features, views.families[L.family]) ?? null : null;
    };
    const counts = new Map();
    for (const c of Object.keys(shapes.shapes)) { const v = valueOf(c); if (v) counts.set(v, (counts.get(v) || 0) + 1); }
    const values = [...counts.keys()].sort((a, b) => {
        const ia = ORDERED.indexOf(a), ib = ORDERED.indexOf(b);
        return ia >= 0 && ib >= 0 ? ia - ib : String(a).localeCompare(String(b));
    });
    const color = (v) => keyColor(`${state.feature}:${v}`, 58, 52);

    const map = countryMap(shapes, {
        fill: (c) => (valueOf(c) ? color(valueOf(c)) : 'var(--bg-sunken)'),
        title: (c) => { const m = mainOf.get(c); return `${c}: ${valueOf(c) ?? 'no data'}${m ? ` (${byId.get(m.id)?.name}, ${m.how})` : ''}`; },
        selected: state.selected,
    });
    const sel = state.selected && mainOf.get(state.selected);
    const selL = sel && views.languages[sel.id];
    el.innerHTML = `
      <div class="views-controls">
        <label>Feature <select id="ty-feature">${Object.entries(FEATURES).map(([k, f]) => `<option value="${k}"${k === state.feature ? ' selected' : ''}>${f.label}</option>`).join('')}</select></label>
        <span class="hint">Each country takes the feature of its main language. Families with an engine only.</span>
      </div>
      <div class="views-split">
        <div class="views-main">${map}${legend(values.map((v) => ({ label: v, color: color(v), count: counts.get(v) })))}</div>
        <div class="views-side">${sel ? `<h3>${esc(state.selected)}</h3>
          <div class="kv"><b>Main language:</b> <button class="linklike" data-focus-lang="${esc(sel.id)}">${esc(byId.get(sel.id)?.name)}</button> <span class="hint">${sel.how}</span></div>
          <div class="kv"><b>${feat.label}:</b> ${esc(valueOf(state.selected) ?? '?')}</div>
          ${featureTable(selL, views.families[selL.family])}` : '<div class="hint">Click a country.</div>'}</div>
      </div>`;
    el.querySelector('#ty-feature').addEventListener('change', (e) => { state.feature = e.target.value; render(el, ctx); });
    el.querySelector('.views-map').addEventListener('click', (e) => {
        const c = e.target.closest('[data-country]');
        if (c) { state.selected = c.getAttribute('data-country'); render(el, ctx); }
    });
}

function featureTable(L, fam) {
    return `<table class="kv-table">${Object.values(FEATURES).map((f) => `<tr><td>${f.label}</td><td>${esc(f.value(L.features, fam) ?? '?')}</td></tr>`).join('')}</table>`;
}
