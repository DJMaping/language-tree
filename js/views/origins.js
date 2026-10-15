/**
 * Word origins: one language's vocabulary through time as a stream, inherited
 * words at the bottom and each donor's loans as a layer above, the way
 * English shows its Norse, French and Latin layers. Derived from the engine:
 * each loan carries the year it entered, each coinage its year; inherited
 * words count from the family's proto-language.
 */

import { esc, keyColor } from '../views.js';
import { projectFor } from '../lang-project.js';

const PREFIX = /^(Proto|Old|Middle|Classical|Early|Late|Modern|New|Ancient|Archaic|Upper|Lower|Common)[- ]/i;
const lineName = (name) => { let n = name; while (PREFIX.test(n)) n = n.replace(PREFIX, ''); return n; };

export async function render(el, ctx) {
    const { model, state, presentYear } = ctx;
    const withLoans = (ctx.views ? Object.entries(ctx.views.languages) : [])
        .map(([id, L]) => [id, L.ids.filter((x) => x?.startsWith('loan:')).length])
        .sort((a, b) => b[1] - a[1]);
    state.lang ??= withLoans[0]?.[0] ?? model.languages[0]?.id;
    state.core ??= false;
    state.share ??= false;
    state.group ??= 'line';
    const names = model.languages.map((l) => `${l.name} (${l.id})`);
    el.innerHTML = `
      <div class="views-controls">
        <label>Language <input list="or-langs" id="or-lang" value="${esc(`${model.byId.get(state.lang)?.name} (${state.lang})`)}" style="width:260px"></label>
        <datalist id="or-langs">${names.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
        <label><input type="checkbox" id="or-core"${state.core ? ' checked' : ''}> basic vocabulary only</label>
        <label><input type="checkbox" id="or-share"${state.share ? ' checked' : ''}> as shares</label>
        <label>Donors <select id="or-group"><option value="line">by language line</option><option value="stage"${state.group === 'stage' ? ' selected' : ''}>by exact stage</option><option value="family"${state.group === 'family' ? ' selected' : ''}>by family</option></select></label>
        <span class="hint">Most-borrowing languages: ${withLoans.slice(0, 6).map(([id, n]) => `<button class="linklike" data-or="${esc(id)}">${esc(model.byId.get(id)?.name)}</button> (${n})`).join(', ')}</span>
      </div>
      <div class="views-split"><div class="views-main" id="or-main"><div class="hint">Working out the vocabulary…</div></div><div class="views-side" id="or-side"></div></div>`;
    const rerender = () => render(el, ctx);
    el.querySelector('#or-lang').addEventListener('change', (e) => {
        const m = /\(([^()]+)\)$/.exec(e.target.value);
        if (m && model.byId.has(m[1])) { state.lang = m[1]; state.pick = null; rerender(); }
    });
    el.querySelectorAll('[data-or]').forEach((b) => b.addEventListener('click', () => { state.lang = b.dataset.or; state.pick = null; rerender(); }));
    el.querySelector('#or-core').addEventListener('change', (e) => { state.core = e.target.checked; rerender(); });
    el.querySelector('#or-share').addEventListener('change', (e) => { state.share = e.target.checked; rerender(); });
    el.querySelector('#or-group').addEventListener('change', (e) => { state.group = e.target.value; rerender(); });

    await new Promise((r) => setTimeout(r, 20));   // let "Working…" paint
    const main = el.querySelector('#or-main');
    const project = projectFor(model, state.lang, presentYear);
    if (!project) { main.innerHTML = '<div class="views-empty">This language\'s family has no engine configuration.</div>'; return; }
    let st;
    try { st = project.stateOf(state.lang); } catch (e) { main.innerHTML = `<div class="views-empty">${esc(e.message)}</div>`; return; }

    let root = model.byId.get(state.lang);
    while (root?.parentId && model.byId.get(root.parentId)) root = model.byId.get(root.parentId);
    const node = model.byId.get(state.lang);
    const t0 = root.born ?? node.born ?? 0, t1 = node.died ?? presentYear;
    const fam = (id) => { let r = model.byId.get(id); while (r?.parentId && model.byId.get(r.parentId)) r = model.byId.get(r.parentId); return ctx.doc.families?.find((f) => f.rootId === r?.id)?.name ?? r?.name ?? '?'; };
    const donorKey = (id) => (state.group === 'stage' ? model.byId.get(id)?.name ?? id : state.group === 'family' ? fam(id) : lineName(model.byId.get(id)?.name ?? id));

    // each word's life: [from, to, layer]
    const words = [];
    for (const e of st.entries) {
        if (state.core && !e.core) continue;
        const end = e.replaced?.year ?? t1;
        if (e.loan) words.push({ e, from: e.loan.year ?? e.enteredAt ?? t0, to: end, layer: donorKey(e.loan.from) });
        else if (e.enteredAt != null) words.push({ e, from: e.enteredAt, to: end, layer: 'new words' });
        else words.push({ e, from: t0, to: end, layer: 'inherited' });
    }
    const totals = new Map();
    for (const w of words) totals.set(w.layer, (totals.get(w.layer) || 0) + 1);
    const donors = [...totals.keys()].filter((k) => k !== 'inherited' && k !== 'new words').sort((a, b) => totals.get(b) - totals.get(a));
    const TOP = 10;
    for (const w of words) if (donors.indexOf(w.layer) >= TOP) w.layer = 'other loans';
    const layers = ['inherited', 'new words', ...donors.slice(0, TOP), ...(donors.length > TOP ? ['other loans'] : [])].filter((k) => words.some((w) => w.layer === k));
    const colour = (k) => (k === 'inherited' ? 'hsl(35 12% 72%)' : k === 'new words' ? 'hsl(200 18% 82%)' : k === 'other loans' ? 'hsl(0 0% 60%)' : keyColor(k, 62, 52));

    const N = 160;
    const xs = Array.from({ length: N + 1 }, (_, i) => t0 + ((t1 - t0) * i) / N);
    const series = layers.map((k) => xs.map((x) => words.filter((w) => w.layer === k && w.from <= x && x < Math.max(w.to, w.from + 1) + (w.to >= t1 ? 1 : 0)).length));
    const tot = xs.map((_, i) => series.reduce((n, s) => n + s[i], 0) || 1);
    const val = (li, i) => (state.share ? series[li][i] / tot[i] : series[li][i]);
    const ymax = state.share ? 1 : Math.max(...tot);
    const W = 980, H = 380, L = 54, B = 26, T = 10;
    const X = (x) => L + ((x - t0) / (t1 - t0 || 1)) * (W - L - 10);
    const Y = (y) => T + (1 - y / ymax) * (H - T - B);
    let paths = '';
    const base = xs.map(() => 0);
    layers.forEach((k, li) => {
        const top = xs.map((_, i) => base[i] + val(li, i));
        const d = `M${xs.map((x, i) => `${X(x).toFixed(1)},${Y(top[i]).toFixed(1)}`).join('L')}L${xs.map((x, i) => `${X(xs[N - i]).toFixed(1)},${Y(base[N - i]).toFixed(1)}`).join('L')}Z`;
        paths += `<path d="${d}" style="fill:${colour(k)}" data-layer="${esc(k)}"><title>${esc(`${k}: ${totals.get(k) ?? words.filter((w) => w.layer === k).length} words`)}</title></path>`;
        top.forEach((v, i) => { base[i] = v; });
    });
    const ticks = [];
    const step = Math.pow(10, Math.floor(Math.log10((t1 - t0) / 4 || 1)));
    const nice = [1, 2, 5].map((m) => m * step).find((s) => (t1 - t0) / s <= 8) ?? step * 10;
    for (let y = Math.ceil(t0 / nice) * nice; y <= t1; y += nice) ticks.push(y);
    const lab = (y) => (y >= 0 ? `${y} AFA` : `${-y} BFA`);
    // the stages of the line, as bands under the axis
    const stages = [];
    let cur = node;
    while (cur) { stages.unshift(cur); cur = cur.parentId ? model.byId.get(cur.parentId) : null; }
    const stageBand = stages.map((s, i) => {
        const a = Math.max(t0, s.born ?? t0), b = i + 1 < stages.length ? stages[i + 1].born ?? t1 : t1;
        return b > a ? `<rect x="${X(a)}" y="${H - B + 4}" width="${Math.max(1, X(b) - X(a))}" height="8" class="or-stage${i % 2 ? ' alt' : ''}"><title>${esc(`${s.name}: ${lab(a)} to ${lab(b)}`)}</title></rect>` : '';
    }).join('');
    main.innerHTML = `
      <svg class="or-chart" viewBox="0 0 ${W} ${H + 14}">
        ${paths}
        ${ticks.map((y) => `<line x1="${X(y)}" x2="${X(y)}" y1="${T}" y2="${H - B}" class="or-grid"/><text x="${X(y)}" y="${H - B + 24}" class="or-tick" text-anchor="middle">${lab(y)}</text>`).join('')}
        <text x="${L - 6}" y="${Y(ymax) + 8}" class="or-tick" text-anchor="end">${state.share ? '100%' : ymax}</text>
        <text x="${L - 6}" y="${Y(0)}" class="or-tick" text-anchor="end">0</text>
        ${stageBand}
        <line id="or-cursor" x1="0" x2="0" y1="${T}" y2="${H - B}" class="or-cursor" visibility="hidden"/>
      </svg>
      <div class="views-legend">${layers.map((k) => `<span class="lg" data-layer="${esc(k)}"><i style="background:${colour(k)}"></i>${esc(k)} <span class="hint">${words.filter((w) => w.layer === k).length}</span></span>`).join('')}</div>
      <div class="hint">The band under the axis is the line's stages (${stages.map((s) => esc(s.name)).join(' → ')}). Hover for the counts in a year; click a layer for its words.</div>`;
    const side = el.querySelector('#or-side');
    const pick = (k) => {
        const ws = words.filter((w) => w.layer === k).sort((a, b) => a.from - b.from);
        side.innerHTML = `<h3>${esc(k)}</h3><div class="hint">${ws.length} words in ${esc(node.name)}</div>
          <table class="kv-table">${ws.slice(0, 400).map((w) => `<tr><td>${esc(w.e.gloss ?? '')}</td><td><b>${esc(w.e.ipa ?? '')}</b></td><td class="hint">${k === 'inherited' ? '' : lab(Math.round(w.from))}${w.e.loan?.donorForm ? ` ← ${esc(w.e.loan.donorForm)}` : ''}</td></tr>`).join('')}</table>`;
    };
    el.querySelectorAll('[data-layer]').forEach((n) => n.addEventListener('click', () => { state.pick = n.dataset.layer; pick(state.pick); }));
    if (state.pick && layers.includes(state.pick)) pick(state.pick);
    else side.innerHTML = `<h3>${esc(node.name)}</h3><div class="hint">${words.length} words; ${words.filter((w) => w.layer !== 'inherited' && w.layer !== 'new words').length} borrowed from ${donors.length} sources.</div>`;
    const svg = main.querySelector('svg');
    const cursor = svg.querySelector('#or-cursor');
    svg.addEventListener('mousemove', (e) => {
        const r = svg.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width) * W;
        const i = Math.max(0, Math.min(N, Math.round(((x - L) / (W - L - 10)) * N)));
        cursor.setAttribute('x1', X(xs[i])); cursor.setAttribute('x2', X(xs[i])); cursor.setAttribute('visibility', 'visible');
        if (state.pick) return;
        side.innerHTML = `<h3>${lab(Math.round(xs[i]))}</h3><table class="kv-table">${layers.map((k, li) => `<tr><td><i class="sw" style="background:${colour(k)}"></i>${esc(k)}</td><td class="num">${series[li][i]}</td><td class="num hint">${Math.round((100 * series[li][i]) / tot[i])}%</td></tr>`).join('')}</table>`;
    });
}
