/**
 * The family dashboard: every family side by side. Population on DJ's map,
 * how many languages and how many still spoken, its inferred character, and a
 * typological profile of its living languages as a radar, so the families'
 * different characters can be seen rather than read.
 */

import { esc } from '../views.js';

/** Radar axes: each normalised to 0..1 against a generous Earth range. */
const AXES = [
    { key: 'consonants', label: 'consonants', max: 35 },
    { key: 'vowels', label: 'vowels', max: 10 },
    { key: 'syllables', label: 'word length', max: 3 },
    { key: 'tone', label: 'tone', max: 1 },
    { key: 'cases', label: 'cases', max: 8 },
    { key: 'aspirates', label: 'aspiration', max: 1 },
];

export function render(el, ctx) {
    const { doc, views, palette, model } = ctx;
    const stats = (doc.families || []).filter((f) => f.kind === 'family').map((f) => {
        const ids = model.languages.filter((l) => model.familyRootOf.get(l.id) === f.rootId);
        const living = ids.filter((l) => l.died == null && !l.diverged);
        const leaves = living.filter((l) => !model.languages.some((x) => x.parentId === l.id));
        const feats = leaves.map((l) => views.languages[l.id]?.features).filter(Boolean);
        const mean = (fn) => (feats.length ? feats.reduce((a, x) => a + fn(x), 0) / feats.length : 0);
        const profile = {
            consonants: mean((x) => x.consonants), vowels: mean((x) => x.vowels), syllables: mean((x) => x.syllables),
            tone: mean((x) => (x.toneLevels ? 1 : 0)), cases: mean((x) => x.cases), aspirates: mean((x) => (x.aspirates ? 1 : 0)),
        };
        const ranked = ids.filter((l) => l.speakers?.l1 != null).sort((a, b) => b.speakers.l1 - a.speakers.l1);
        const fam = views.families[f.rootId] || views.families[Object.keys(views.families).find((k) => views.families[k].name === f.name)];
        return { f, color: palette.get(f.name), total: ids.length, living: living.length, profile, ranked, character: fam?.character, root: model.byId.get(f.rootId) };
    });

    const maxPop = Math.max(...stats.map((s) => s.f.population1765 || 0));
    const bars = [...stats].sort((a, b) => (b.f.population1765 || 0) - (a.f.population1765 || 0)).map((s) =>
        `<div class="share"><span class="share-label">${esc(s.f.name)}</span><span class="share-bar"><i style="width:${(100 * (s.f.population1765 || 0) / maxPop).toFixed(1)}%;background:${s.color}"></i></span><span class="share-n">${Math.round(s.f.population1765 || 0)}M</span></div>`).join('');
    const maxN = Math.max(...stats.map((s) => s.total));
    const nbars = [...stats].sort((a, b) => b.total - a.total).map((s) =>
        `<div class="share"><span class="share-label">${esc(s.f.name)}</span><span class="share-bar"><i style="width:${(100 * s.total / maxN).toFixed(1)}%;background:${s.color};opacity:.45"></i><i style="width:${(100 * s.living / maxN).toFixed(1)}%;background:${s.color};margin-left:-${(100 * s.total / maxN).toFixed(1)}%"></i></span><span class="share-n">${s.living} / ${s.total}</span></div>`).join('');

    el.innerHTML = `
      <div class="views-cols">
        <div><h3>People in each family, 1765 <span class="hint">(DJ's map shares x population)</span></h3>${bars}</div>
        <div><h3>Languages <span class="hint">(living / all in the chart)</span></h3>${nbars}</div>
      </div>
      <h3>The families</h3>
      <div class="fam-cards">${stats.map(card).join('')}</div>
      <div class="hint">Radar: the living languages' averages against generous Earth ranges (consonants to 35, vowels to 10, 3 syllables a word, 8 cases; tone and aspiration as the share of languages that have them). Dates are placeholders until Phase 5.</div>`;
}

function radar(profile, color) {
    const R = 52, cx = 70, cy = 66;
    const pts = AXES.map((a, i) => {
        const ang = (Math.PI * 2 * i) / AXES.length - Math.PI / 2;
        const v = Math.max(0.04, Math.min(1, profile[a.key] / a.max));
        return [cx + Math.cos(ang) * R * v, cy + Math.sin(ang) * R * v, cx + Math.cos(ang) * (R + 12), cy + Math.sin(ang) * (R + 12), a.label];
    });
    const rings = [0.33, 0.66, 1].map((r) => `<polygon class="radar-ring" points="${AXES.map((_, i) => {
        const ang = (Math.PI * 2 * i) / AXES.length - Math.PI / 2;
        return `${cx + Math.cos(ang) * R * r},${cy + Math.sin(ang) * R * r}`;
    }).join(' ')}"/>`).join('');
    return `<svg class="radar" viewBox="0 0 140 136">${rings}
      <polygon points="${pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')}" style="fill:${color};fill-opacity:.35;stroke:${color}"/>
      ${pts.map((p) => `<text x="${p[2].toFixed(1)}" y="${p[3].toFixed(1)}" text-anchor="middle">${p[4]}</text>`).join('')}</svg>`;
}

function card(s) {
    const ch = s.character;
    const top = s.ranked.slice(0, 4).map((l) => `<button class="linklike" data-focus-lang="${esc(l.id)}">${esc(l.name)}</button> <span class="hint">${l.speakers.l1}M</span>`).join(', ');
    return `<div class="fam-card" style="border-top-color:${s.color}">
      <div class="fam-head"><b>${esc(s.f.name)}</b> <span class="hint">${s.living} living of ${s.total}</span></div>
      ${radar(s.profile, s.color)}
      ${ch ? `<div class="kv">${esc(ch.morphology.type)}, ${ch.morphology.alignment === 'erg-abs' ? 'ergative' : 'accusative'}, ${esc(ch.order)}</div>
      <div class="kv hint">${ch.vowelCount} vowels; ${Math.round(ch.suffixShare * 100)}% suffixes</div>` : '<div class="hint">No engine settings.</div>'}
      <div class="kv"><b>Branches:</b> ${(s.f.branches || []).map((b) => esc(b.name)).join(', ')}</div>
      ${top ? `<div class="kv"><b>Largest:</b> ${top}</div>` : ''}
      <div class="kv hint">Root: ${esc(s.root?.name ?? '?')}, ${s.root?.born ?? '?'}</div>
    </div>`;
}
