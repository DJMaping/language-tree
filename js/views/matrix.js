/**
 * Contact matrix: every borrowing language against every donor, coloured by
 * how much of its basic vocabulary (the 207 meanings of data/views.json)
 * came from that donor. Clusters of contact show as blocks; one family
 * leaning on another shows as a band.
 */

import { esc } from '../views.js';

export function render(el, ctx) {
    const { views, model, doc, state } = ctx;
    state.group ??= 'language';
    state.living ??= true;
    state.min ??= 1;
    state.fam ??= '*';
    const famOf = (id) => views.languages[id]?.family ?? '?';
    const famOrder = (doc.families || []).map((f) => f.name);
    const order = new Map();
    let k = 0;
    const walk = (id) => { order.set(id, k++); for (const l of model.languages) if (l.parentId === id) walk(l.id); };
    for (const l of model.languages) if (!l.parentId) walk(l.id);
    const rank = (id) => [famOrder.indexOf(famOf(id)), order.get(id) ?? 0];
    const cmp = (a, b) => { const x = rank(a), y = rank(b); return x[0] - y[0] || x[1] - y[1]; };
    const isLeaf = (id) => !model.languages.some((l) => l.parentId === id);

    // loans[recipient][donorKey] = [gloss indices]
    const loans = {};
    for (const [id, L] of Object.entries(views.languages)) {
        if (state.living && (!isLeaf(id) || model.byId.get(id)?.died != null)) continue;
        L.ids.forEach((rid, g) => {
            if (!rid || !rid.startsWith('loan:')) return;
            const donor = rid.slice(5);
            const key = state.group === 'family' ? famOf(donor) : donor;
            ((loans[id] ??= {})[key] ??= []).push(g);
        });
    }
    const rows = Object.keys(loans).filter((r) => (state.fam === '*' || famOf(r) === state.fam) && Object.values(loans[r]).some((v) => v.length >= state.min)).sort(cmp);
    const colSet = new Set();
    for (const r of rows) for (const [d, v] of Object.entries(loans[r])) if (v.length >= state.min) colSet.add(d);
    const cols = [...colSet].sort(state.group === 'family' ? (a, b) => famOrder.indexOf(a) - famOrder.indexOf(b) : cmp);
    const nm = (id) => (state.group === 'family' && cols.includes(id) && !model.byId.has(id) ? id : model.byId.get(id)?.name ?? id);
    let max = 1;
    for (const r of rows) for (const v of Object.values(loans[r])) max = Math.max(max, v.length);

    const cell = Math.max(7, Math.min(16, Math.floor(860 / Math.max(1, cols.length))));
    const left = 170, top = 130;
    const Wd = left + cols.length * cell + 10, Hd = top + rows.length * cell + 10;
    const shade = (n) => {
        const t = Math.sqrt(n / max);
        return `hsl(${Math.round(30 - 30 * t)} ${50 + 40 * t}% ${94 - 58 * t}%)`;
    };
    let svg = '';
    // family bands behind the rows
    let lastFam = null;
    rows.forEach((r, i) => {
        if (famOf(r) !== lastFam) {
            lastFam = famOf(r);
            svg += `<line x1="0" x2="${Wd}" y1="${top + i * cell}" y2="${top + i * cell}" class="mx-sep"/><text x="2" y="${top + i * cell + 9}" class="mx-fam">${esc(lastFam)}</text>`;
        }
        svg += `<text x="${left - 4}" y="${top + i * cell + cell * 0.75}" class="mx-row" text-anchor="end">${esc(nm(r))}</text>`;
    });
    cols.forEach((c, j) => {
        svg += `<text transform="translate(${left + j * cell + cell * 0.7},${top - 4}) rotate(-60)" class="mx-col">${esc(nm(c))}</text>`;
    });
    rows.forEach((r, i) => cols.forEach((c, j) => {
        const v = loans[r][c];
        if (!v || v.length < state.min) return;
        svg += `<rect x="${left + j * cell}" y="${top + i * cell}" width="${cell - 1}" height="${cell - 1}" style="fill:${shade(v.length)}" data-r="${esc(r)}" data-c="${esc(c)}"><title>${esc(`${nm(r)} took ${v.length} of 207 basic words from ${nm(c)}`)}</title></rect>`;
    }));

    // the totals
    const takers = rows.map((r) => [r, Object.values(loans[r]).reduce((n, v) => n + v.length, 0)]).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const given = new Map();
    for (const r of rows) for (const [d, v] of Object.entries(loans[r])) given.set(d, (given.get(d) || 0) + v.length);
    const givers = [...given.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

    el.innerHTML = `
      <div class="views-controls">
        <label>Donors <select id="mx-group"><option value="language">by language</option><option value="family"${state.group === 'family' ? ' selected' : ''}>by family</option></select></label>
        <label><input type="checkbox" id="mx-living"${state.living ? ' checked' : ''}> living languages only</label>
        <label>Borrowers <select id="mx-fam"><option value="*">every family</option>${famOrder.filter((f) => Object.keys(loans).some((r) => famOf(r) === f)).map((f) => `<option${f === state.fam ? ' selected' : ''}>${esc(f)}</option>`).join('')}</select></label>
        <label>At least <select id="mx-min">${[1, 2, 3, 5, 10].map((v) => `<option${v === state.min ? ' selected' : ''}>${v}</option>`).join('')}</select> words</label>
        <span class="hint">Rows borrow from columns. Darker = more of the 207 basic words. ${rows.length} borrowers, ${cols.length} donors.</span>
      </div>
      <div class="views-split">
        <div class="views-main mx-wrap"><svg class="mx" viewBox="0 0 ${Wd} ${Hd}" width="${Wd}" height="${Hd}">${svg}</svg></div>
        <div class="views-side" id="mx-side">${state.pick ? '' : `
          <h4>Most borrowed basic words</h4>${takers.map(([r, n]) => `<div>${esc(nm(r))} <span class="hint">${n}</span></div>`).join('')}
          <h4>Biggest donors</h4>${givers.map(([d, n]) => `<div>${esc(nm(d))} <span class="hint">${n}</span></div>`).join('')}
          <div class="hint" style="margin-top:8px">Click a square for the words.</div>`}</div>
      </div>`;
    const side = el.querySelector('#mx-side');
    const showPick = (r, c) => {
        const gl = loans[r][c] || [];
        side.innerHTML = `<h3>${esc(nm(r))} ← ${esc(nm(c))}</h3>
          <div class="hint">${gl.length} of the 207 basic words, as ${esc(nm(r))} says them now. Word origins shows each loan with the donor's form when it was borrowed.</div>
          <table class="kv-table">${gl.map((g) => `<tr><td>${esc(views.glosses[g])}</td><td><b>${esc(views.languages[r].words[g] ?? '')}</b></td></tr>`).join('')}</table>
          <div class="kv"><button class="linklike" data-focus-lang="${esc(r)}">Show ${esc(nm(r))} on the tree</button></div>`;
    };
    if (state.pick && loans[state.pick[0]]?.[state.pick[1]]) showPick(...state.pick);
    el.querySelector('.mx').addEventListener('click', (e) => {
        const t = e.target.closest('rect[data-r]');
        if (!t) return;
        state.pick = [t.dataset.r, t.dataset.c];
        showPick(...state.pick);
    });
    el.querySelector('#mx-group').addEventListener('change', (e) => { state.group = e.target.value; state.pick = null; render(el, ctx); });
    el.querySelector('#mx-living').addEventListener('change', (e) => { state.living = e.target.checked; state.pick = null; render(el, ctx); });
    el.querySelector('#mx-min').addEventListener('change', (e) => { state.min = +e.target.value; render(el, ctx); });
    el.querySelector('#mx-fam').addEventListener('change', (e) => { state.fam = e.target.value; state.pick = null; render(el, ctx); });
}
