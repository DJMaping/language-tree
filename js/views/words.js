/**
 * Word across the tree: one meaning in every language, laid out by lineage and
 * coloured by the word it descends from, so cognates, replacements and loans
 * stand out at a glance. The 207 Swadesh meanings, from data/views.json.
 */

import { esc, keyColor } from '../views.js';

export function render(el, ctx) {
    const { views, model, state } = ctx;
    state.gloss ??= 'water';
    state.fam ??= Object.keys(views.families)[0];
    state.dead ??= false;
    const k = views.glosses.indexOf(state.gloss);
    const famIds = Object.keys(views.families);

    const rows = [];
    const sets = new Map();
    const walk = (id, depth) => {
        const l = model.byId.get(id);
        const L = views.languages[id];
        const living = l.died == null && !l.diverged;
        if (L && (living || state.dead || !l.parentId)) {
            const form = L.words[k];
            const set = L.ids[k];
            if (set) sets.set(set, (sets.get(set) || 0) + 1);
            rows.push({ id, depth, name: l.name, form, set, living, reconstructed: l.reconstructed });
        }
        for (const kid of model.languages.filter((x) => x.parentId === id)) walk(kid.id, depth + 1);
    };
    walk(state.fam, 0);

    const label = (set) => (!set ? '' : set.startsWith('loan:') ? `loan from ${model.byId.get(set.slice(5))?.name ?? set.slice(5)}` : set === 'compound' ? 'new compound' : `set ${set}`);
    const setColor = (set) => (set ? keyColor(set, 60, 45) : 'var(--muted)');
    el.innerHTML = `
      <div class="views-controls">
        <label>Meaning <select id="w-gloss">${views.glosses.map((g) => `<option${g === state.gloss ? ' selected' : ''}>${esc(g)}</option>`).join('')}</select></label>
        <label>Family <select id="w-fam">${famIds.map((f) => `<option value="${f}"${f === state.fam ? ' selected' : ''}>${esc(views.families[f].name)}</option>`).join('')}</select></label>
        <label><input type="checkbox" id="w-dead"${state.dead ? ' checked' : ''}> include older stages</label>
        <span class="hint">${sets.size} different word${sets.size === 1 ? '' : 's'} for “${esc(state.gloss)}”. Same colour = the same original word.</span>
      </div>
      <div class="word-tree">${rows.map((r) => `<div class="word-row${r.living ? '' : ' dead'}" style="padding-left:${r.depth * 16}px">
          <button class="linklike" data-focus-lang="${esc(r.id)}">${esc(r.name)}</button>
          <span class="word-form" style="color:${setColor(r.set)}">${r.form ? `${r.reconstructed ? '*' : ''}${esc(r.form)}` : '—'}</span>
          <span class="hint">${esc(label(r.set))}</span></div>`).join('')}</div>
      <div class="hint">Forms are IPA. “set” is the word a form descends from: a language whose colour differs from its sisters replaced the word, or borrowed one.</div>`;
    el.querySelector('#w-gloss').addEventListener('change', (e) => { state.gloss = e.target.value; render(el, ctx); });
    el.querySelector('#w-fam').addEventListener('change', (e) => { state.fam = e.target.value; render(el, ctx); });
    el.querySelector('#w-dead').addEventListener('change', (e) => { state.dead = e.target.checked; render(el, ctx); });
}
