/**
 * Through time: DJ's yearly civilisation maps (657 of them, 200,000 BFA to
 * 1765 AFA) as a language map with a year slider, and the tables that make
 * it right: which language each civilisation speaks, the borders between
 * languages (suggested contact, for DJ to approve), where the map and the
 * tree disagree on dates, and the Paint.NET keyframes.
 *
 * Everything here is read from data/cache/years/, which
 * scripts/build-years.py writes (npm run years). Edits go back through the
 * server (/api/history/*) and the chart's own save.
 */

import { esc } from '../views.js';

const BASE = 'data/cache/years/';
const W = 2000, H = 1000;
const SPECIAL_RGB = { 0: [168, 190, 214], 1: [246, 243, 236], 2: [222, 222, 222], 3: [200, 200, 200], 4: [176, 177, 184] };

let store = null;   // { frames, contacts, clashes, civs, decisions }
let codes = null;   // Uint32Array of the frame on screen
let shownYear = null;
let timer = null;

const label = (y) => (y >= 0 ? `${y} AFA` : `${(-y).toLocaleString('en-GB')} BFA`);
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

async function getJson(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`${url} is missing: run  npm run years  (python scripts/build-years.py all).`);
    return r.json();
}

async function load(force = false) {
    if (store && !force) return store;
    const [frames, contacts, clashes, civs, decisions] = await Promise.all([
        getJson(`${BASE}frames.json`), getJson(`${BASE}contacts.json`), getJson(`${BASE}clashes.json`),
        getJson('data/history/civs.json'), fetch('/api/history/decisions').then((r) => r.json()).catch(() => ({ decisions: {} })),
    ]);
    store = { frames, contacts: contacts.contacts, clashes: clashes.clashes, civs: civs.civs, decisions: decisions.decisions || {} };
    return store;
}

/** The sea a little further on each era: DJ's "depends on the era". km. */
function seaReach(year, scale) {
    const t = Math.max(0, Math.min(1, (year + 3000) / 4500));
    return Math.round((50 + 550 * t) * scale);
}

export async function render(el, ctx) {
    const { state } = ctx;
    state.mode ??= 'map';
    state.colour ??= 'language';
    state.labels ??= true;
    state.speed ??= 6;
    state.seaScale ??= 1;
    el.innerHTML = '<div class="hint">Loading the yearly maps…</div>';
    let S;
    try { S = await load(); } catch (e) { el.innerHTML = `<div class="views-empty">${esc(e.message)}</div>`; return; }
    const years = S.frames.meta.years;
    state.i ??= years.length - 1;

    const modes = [['map', 'Map'], ['civs', `Civilisations (${Object.keys(S.civs).length})`], ['contacts', 'Border suggestions'],
        ['clashes', `Date clashes (${S.clashes.filter((c) => c.kind !== 'never-on-map').length})`], ['keyframes', 'Keyframes']];
    el.innerHTML = `
      <div class="views-controls hist-modes">${modes.map(([k, t]) => `<button class="views-tab${state.mode === k ? ' on' : ''}" data-mode="${k}">${esc(t)}</button>`).join('')}
        <span class="hint">built ${esc(S.frames.meta.built.replace('T', ' '))}</span>
        <button class="btn" id="hist-rebuild" title="Rerun the languages stage after changing civilisations, keyframes or the chart (about 40 seconds)">Apply changes</button>
      </div>
      <div id="hist-body"></div>`;
    el.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { stop(); state.mode = b.dataset.mode; render(el, ctx); }));
    el.querySelector('#hist-rebuild').addEventListener('click', () => rebuild(el, ctx));
    const body = el.querySelector('#hist-body');
    if (state.mode === 'map') return renderMap(body, ctx, S);
    if (state.mode === 'civs') return renderCivs(body, ctx, S);
    if (state.mode === 'contacts') return renderContacts(body, ctx, S);
    if (state.mode === 'clashes') return renderClashes(body, ctx, S);
    return renderKeyframes(body, ctx, S);
}

async function rebuild(el, ctx) {
    const btn = el.querySelector('#hist-rebuild');
    btn.disabled = true;
    btn.textContent = 'Rebuilding… (about 40 seconds)';
    try {
        const r = await fetch('/api/history/rebuild', { method: 'POST', body: '{}' }).then((x) => x.json());
        if (!r.ok) alert(`The rebuild failed:\n${r.log || r.error}`);
    } catch (e) { alert(`The rebuild failed: ${e.message}`); }
    store = null;
    shownYear = null;
    render(el, ctx);
}

// --- the map ---------------------------------------------------------------------

function stop() { if (timer) { clearTimeout(timer); timer = null; } }

function renderMap(body, ctx, S) {
    const { state } = ctx;
    const F = S.frames;
    const years = F.meta.years;
    body.innerHTML = `
      <div class="views-controls hist-time">
        <button class="btn" id="h-play" title="Play / pause (space)">${timer ? '❚❚' : '▶'}</button>
        <button class="btn" id="h-prev" title="Back one map">‹</button>
        <input type="range" id="h-slider" min="0" max="${years.length - 1}" value="${state.i}">
        <button class="btn" id="h-next" title="On one map">›</button>
        <b id="h-year" class="hist-year"></b>
        <label>Speed <select id="h-speed">${[2, 4, 6, 10, 15].map((v) => `<option${v === state.speed ? ' selected' : ''}>${v}</option>`).join('')}</select> maps/s</label>
        <label>Colour <select id="h-colour">
          <option value="language"${state.colour === 'language' ? ' selected' : ''}>by language (related = similar)</option>
          <option value="family"${state.colour === 'family' ? ' selected' : ''}>by family</option>
          <option value="map"${state.colour === 'map' ? ' selected' : ''}>your original map</option>
        </select></label>
        <label><input type="checkbox" id="h-labels"${state.labels ? ' checked' : ''}> names</label>
      </div>
      <div class="views-split">
        <div class="views-main hist-stage">
          <canvas id="h-canvas" width="${W}" height="${H}"></canvas>
          <svg id="h-labels" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet"></svg>
          <div id="h-tip" class="hist-tip" hidden></div>
        </div>
        <div class="views-side" id="h-side"></div>
      </div>`;
    const slider = body.querySelector('#h-slider');
    const canvas = body.querySelector('#h-canvas');
    const g = canvas.getContext('2d', { willReadFrequently: true });
    const tip = body.querySelector('#h-tip');

    const show = async (i) => {
        state.i = Math.max(0, Math.min(years.length - 1, i));
        slider.value = state.i;
        const y = years[state.i];
        body.querySelector('#h-year').textContent = label(y);
        await drawFrame(g, F, y, state, !!timer);
        drawLabels(body.querySelector('#h-labels'), F, y, state);
        if (!timer) side(body.querySelector('#h-side'), ctx, S, y);
    };
    const play = () => {
        if (timer) { stop(); body.querySelector('#h-play').textContent = '▶'; show(state.i); return; }
        body.querySelector('#h-play').textContent = '❚❚';
        const tick = async () => {
            const t0 = performance.now();
            if (state.i >= years.length - 1) state.i = -1;
            await show(state.i + 1);
            timer = setTimeout(tick, Math.max(0, 1000 / state.speed - (performance.now() - t0)));
        };
        tick();
    };
    body.querySelector('#h-play').addEventListener('click', play);
    body.querySelector('#h-prev').addEventListener('click', () => { stop(); show(state.i - 1); });
    body.querySelector('#h-next').addEventListener('click', () => { stop(); show(state.i + 1); });
    slider.addEventListener('input', () => { stop(); body.querySelector('#h-play').textContent = '▶'; show(+slider.value); });
    body.querySelector('#h-speed').addEventListener('change', (e) => { state.speed = +e.target.value; });
    body.querySelector('#h-colour').addEventListener('change', (e) => { state.colour = e.target.value; shownYear = null; show(state.i); });
    body.querySelector('#h-labels').addEventListener('change', (e) => { state.labels = e.target.checked; show(state.i); });
    const codeAt = (e) => {
        const r = canvas.getBoundingClientRect();
        const x = Math.floor(((e.clientX - r.left) / r.width) * W), y = Math.floor(((e.clientY - r.top) / r.height) * H);
        return codes && x >= 0 && y >= 0 && x < W && y < H ? codes[y * W + x] : null;
    };
    canvas.addEventListener('mousemove', (e) => {
        const c = codeAt(e);
        const t = nameOf(F, c);
        tip.hidden = !t;
        if (t) {
            const r = canvas.parentElement.getBoundingClientRect();
            tip.textContent = t;
            tip.style.left = `${e.clientX - r.left + 12}px`;
            tip.style.top = `${e.clientY - r.top + 10}px`;
        }
    });
    canvas.addEventListener('mouseleave', () => { tip.hidden = true; });
    canvas.addEventListener('click', (e) => {
        const c = codeAt(e);
        const L = F.langs[c];
        state.sel = L ? L.id : null;
        shownYear = null;
        show(state.i);
    });
    show(state.i);
}

function nameOf(F, c) {
    if (c == null) return null;
    if (F.langs[c]) return `${F.langs[c].name} (${F.langs[c].family})`;
    if (F.civs[c]) return `${F.civs[c].name}: no language yet`;
    return F.meta.special[c] ?? null;
}

const imgCache = new Map();
function image(src) {
    if (imgCache.has(src)) return imgCache.get(src);
    const p = new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error(`${src} missing`)); im.src = src; });
    imgCache.set(src, p);
    if (imgCache.size > 40) imgCache.delete(imgCache.keys().next().value);
    return p;
}

/**
 * One frame onto the canvas. The PNG holds a code per pixel; one pass turns
 * codes into colours and darkens the line where two languages meet. While
 * playing, every other pixel is skipped (half size, scaled up): four times
 * less work, and nobody reads borders at ten maps a second.
 */
async function drawFrame(g, F, year, state, fast = false) {
    const im = await image(`${BASE}lang/${year}.png`);
    const yi = F.meta.years.indexOf(year);
    if (yi + 1 < F.meta.years.length) image(`${BASE}lang/${F.meta.years[yi + 1]}.png`);
    const w = fast ? W / 2 : W, h = fast ? H / 2 : H;
    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    const og = off.getContext('2d', { willReadFrequently: true });
    og.imageSmoothingEnabled = false;   // nearest pixel: codes must survive scaling exactly
    og.drawImage(im, 0, 0, w, h);
    const src = og.getImageData(0, 0, w, h).data;
    const n = w * h;
    const cs = new Uint32Array(n);

    if (state.colour === 'map') {
        for (let p = 0, q = 0; p < n; p++, q += 4) cs[p] = (src[q] << 16) | (src[q + 1] << 8) | src[q + 2];
        codes = fast ? null : cs;
        const orig = await image(`${BASE}orig/${year}.jpg`);
        g.drawImage(orig, 0, 0, W, H);
        if (state.sel && !fast) dimExcept(g, F, state.sel);
        return;
    }
    const famHue = F.meta.familyHue;
    const L0 = F.meta.lang0;
    const selCode = state.sel ? Number(Object.keys(F.langs).find((k) => F.langs[k].id === state.sel)) : null;
    const table = new Map();
    const colourOf = (c) => {
        let rgb = table.get(c);
        if (rgb) return rgb;
        if (F.langs[c]) rgb = state.colour === 'family' ? hsl(famHue[F.langs[c].family] ?? 0, 0.5, 0.55) : hexRgb(F.langs[c].color);
        else if (F.civs[c]) rgb = hexRgb(F.civs[c].rgb).map((v) => Math.round(v * 0.6 + 255 * 0.4));
        else rgb = SPECIAL_RGB[c] ?? [255, 0, 255];
        if (selCode != null && c !== selCode && c >= L0) rgb = rgb.map((v) => Math.round(v * 0.3 + 255 * 0.7));
        table.set(c, rgb);
        return rgb;
    };
    const out = new ImageData(w, h);
    const d = out.data;
    let last = -1, rgb = null;
    for (let p = 0, q = 0; p < n; p++, q += 4) {
        const c = (src[q] << 16) | (src[q + 1] << 8) | src[q + 2];
        cs[p] = c;
        if (c !== last) { rgb = colourOf(c); last = c; }
        // a line where two languages meet (left or above differs)
        const edge = c >= L0 && ((p % w && cs[p - 1] !== c && cs[p - 1] >= L0) || (p >= w && cs[p - w] !== c && cs[p - w] >= L0));
        const k = edge ? 0.55 : 1;
        d[q] = rgb[0] * k; d[q + 1] = rgb[1] * k; d[q + 2] = rgb[2] * k; d[q + 3] = 255;
    }
    codes = fast ? null : cs;
    if (fast) {
        og.putImageData(out, 0, 0);
        g.imageSmoothingEnabled = false;
        g.drawImage(off, 0, 0, W, H);
    } else g.putImageData(out, 0, 0);
}

function dimExcept(g, F, id) {
    const img = g.getImageData(0, 0, W, H);
    const d = img.data;
    const code = Number(Object.keys(F.langs).find((k) => F.langs[k].id === id));
    for (let p = 0, q = 0; p < codes.length; p++, q += 4) {
        if (codes[p] !== code) { d[q] = d[q] * 0.35 + 166; d[q + 1] = d[q + 1] * 0.35 + 166; d[q + 2] = d[q + 2] * 0.35 + 166; }
    }
    g.putImageData(img, 0, 0);
}

function hsl(h, s, l) {
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [f(0), f(8), f(4)].map((v) => Math.round(v * 255));
}

/** Names where each area is deepest, sized to fit inside it. */
function drawLabels(svg, F, year, state) {
    if (!state.labels) { svg.innerHTML = ''; return; }
    const areas = F.frames[year]?.areas || {};
    const items = [];
    for (const [c, [px, x, y, room]] of Object.entries(areas)) {
        const name = F.langs[c]?.name ?? (F.civs[c] ? `${F.civs[c].name}?` : null);
        if (!name || px < 120) continue;
        const size = Math.min(30, room * 0.9, (2.2 * room) / (0.55 * name.length));
        if (size < 8.5) continue;
        items.push({ c, x, y, size, name, civ: !F.langs[c] });
    }
    svg.innerHTML = items.map((t) => `<text x="${t.x}" y="${t.y}" font-size="${t.size.toFixed(1)}" class="${t.civ ? 'civ' : ''}${F.langs[t.c]?.id === state.sel ? ' sel' : ''}">${esc(t.name)}</text>`).join('');
}

function side(el, ctx, S, year) {
    const F = S.frames;
    const id = ctx.state.sel;
    const areas = F.frames[year]?.areas || {};
    const ranked = Object.entries(areas).filter(([c]) => F.langs[c]).sort((a, b) => b[1][4] - a[1][4]);
    const lost = ['2', '3', '4'];
    if (!id) {
        const kf = F.frames[year]?.keyframe;
        el.innerHTML = `<h3>${label(year)}</h3>
          <div class="hint">${ranked.length} languages on the map${kf != null ? `; following the keyframe of ${label(kf)}` : ''}. Click a language.</div>
          <table class="kv-table">${ranked.slice(0, 40).map(([c, [, , , , km2]]) => `<tr><td><i class="sw" style="background:${F.langs[c].color}"></i>${esc(F.langs[c].name)}</td><td class="num">${Math.round(km2 / 1000).toLocaleString('en-GB')}k km²</td></tr>`).join('')}</table>
          <div class="hint">Grey land: peoples whose languages are lost (Advanced Culture, Embryonic Civilisation) or Homo sapiens without a culture.</div>`;
        return;
    }
    const L = Object.values(F.langs).find((l) => l.id === id);
    const node = ctx.model.byId.get(id);
    const civs = Object.entries(S.civs).filter(([, c]) => c.lang && lineage(ctx.model, c.lang).has(id));
    const near = S.contacts.filter((c) => (c.a === id || c.b === id) && c.from <= year && year <= c.to);
    el.innerHTML = `<h3>${esc(L.name)}</h3>
      <div class="kv"><b>Family:</b> ${esc(L.family)}</div>
      <div class="kv"><b>On the tree:</b> ${node?.born != null ? label(node.born) : '?'} – ${node?.died != null ? label(node.died) : 'living'}</div>
      <div class="kv"><button class="linklike" data-focus-lang="${esc(id)}">Show it on the tree</button></div>
      <h4>Spoken by (civilisations)</h4>
      ${civs.length ? civs.map(([, c]) => `<div><i class="sw" style="background:${c.rgb}"></i>${esc(c.name)} <span class="hint">${label(c.from)}–${label(c.to)}, ${esc(c.how || '')}</span></div>`).join('') : '<div class="hint">none</div>'}
      <h4>Neighbours in ${label(year)}</h4>
      ${near.length ? near.map((c) => { const o = c.a === id ? c.b : c.a; const n = Object.values(F.langs).find((l) => l.id === o); return `<div>${esc(n?.name ?? o)} <span class="hint">${c.kind === 'land' ? `border ${c.borderKm} km` : `${c.km} km across water`}, ${label(c.from)}–${label(c.to)}${c.exists ? ', already sharing' : ''}</span></div>`; }).join('') : '<div class="hint">none</div>'}
      <div class="hint" style="margin-top:8px">Click the sea to clear.</div>`;
    void lost;
}

/** A language with its ancestors and descendants. */
function lineage(model, id) {
    const out = new Set([id]);
    let cur = model.byId.get(id);
    while (cur?.parentId) { out.add(cur.parentId); cur = model.byId.get(cur.parentId); }
    const walk = (x) => { for (const l of model.languages) if (l.parentId === x) { out.add(l.id); walk(l.id); } };
    walk(id);
    return out;
}

// --- civilisations -> languages ------------------------------------------------------

function renderCivs(body, ctx, S) {
    const { state, model } = ctx;
    state.civFilter ??= 'check';
    const nameOfId = (id) => model.byId.get(id)?.name ?? '';
    const names = new Map(model.languages.map((l) => [`${l.name} (${l.id})`, l.id]));
    const rows = Object.entries(S.civs).filter(([, c]) => state.civFilter === 'all' || (state.civFilter === 'check' ? ['auto', 'place', null, undefined].includes(c.how) : state.civFilter === c.how));
    const HOW = { auto: 'matched by name', place: 'guessed from the land it held', dj: 'yours', lost: 'language lost' };
    body.innerHTML = `
      <div class="views-controls">
        <label>Show <select id="c-filter">
          <option value="check"${state.civFilter === 'check' ? ' selected' : ''}>to check (guessed)</option>
          <option value="all"${state.civFilter === 'all' ? ' selected' : ''}>all</option>
          <option value="dj"${state.civFilter === 'dj' ? ' selected' : ''}>yours</option>
          <option value="lost"${state.civFilter === 'lost' ? ' selected' : ''}>lost</option>
        </select></label>
        <span class="hint">Each civilisation speaks the line of its language: before that language was born, its ancestor; later, its main daughter. Change one, then press Apply changes.</span>
        <span id="c-saved" class="hint"></span>
      </div>
      <datalist id="c-langs">${[...names.keys()].map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
      <table class="hist-table"><tr><th></th><th>Civilisation</th><th>On the maps</th><th>Speaks</th><th>How</th><th>Lost</th></tr>
      ${rows.map(([k, c]) => `<tr data-key="${esc(k)}">
        <td><i class="sw" style="background:${c.rgb}"></i></td>
        <td>${esc(c.name)}</td>
        <td class="num">${label(c.from)} – ${label(c.to)}</td>
        <td><input list="c-langs" class="c-lang" value="${esc(c.lang ? `${nameOfId(c.lang)} (${c.lang})` : '')}" placeholder="pick a language"></td>
        <td class="hint">${esc(HOW[c.how] ?? 'none yet')}</td>
        <td><input type="checkbox" class="c-lost"${c.how === 'lost' ? ' checked' : ''} title="No recorded language: drawn grey, like the Advanced Cultures"></td>
      </tr>`).join('')}</table>`;
    body.querySelector('#c-filter').addEventListener('change', (e) => { state.civFilter = e.target.value; renderCivs(body, ctx, S); });
    const save = async (key, change) => {
        const r = await fetch('/api/history/civs', { method: 'PUT', body: JSON.stringify({ changes: { [key]: change } }) }).then((x) => x.json()).catch(() => null);
        body.querySelector('#c-saved').textContent = r?.ok ? 'Saved. Press Apply changes to redraw the maps.' : 'Could not save.';
        Object.assign(S.civs[key], change);
    };
    body.querySelectorAll('.c-lang').forEach((inp) => inp.addEventListener('change', () => {
        const key = inp.closest('tr').dataset.key;
        const id = names.get(inp.value) ?? (model.byId.has(inp.value) ? inp.value : null);
        if (inp.value && !id) { inp.classList.add('bad'); return; }
        inp.classList.remove('bad');
        save(key, { lang: id, how: id ? 'dj' : null });
    }));
    body.querySelectorAll('.c-lost').forEach((cb) => cb.addEventListener('change', () => {
        const key = cb.closest('tr').dataset.key;
        save(key, cb.checked ? { lang: null, how: 'lost' } : { how: null });
    }));
}

// --- border suggestions ------------------------------------------------------------------

function renderContacts(body, ctx, S) {
    const { state, model } = ctx;
    state.cKind ??= 'all';
    state.cShow ??= 'open';
    const F = S.frames;
    const nm = (id) => model.byId.get(id)?.name ?? id;
    const keyOf = (c) => `${c.a}|${c.b}|${c.from}`;
    const list = S.contacts.filter((c) => {
        if (state.cKind !== 'all' && c.kind !== state.cKind) return false;
        if (c.kind === 'sea' && c.km > seaReach(c.from, state.seaScale)) return false;
        const d = S.decisions[keyOf(c)];
        if (state.cShow === 'open' && (d || c.exists)) return false;
        if (state.cShow === 'decided' && !d) return false;
        return true;
    }).map((c) => ({ ...c, weight: (c.to - c.from + 5) * (c.kind === 'land' ? Math.max(20, c.borderKm) : 400 / Math.max(50, c.km) * 20) }))
        .sort((a, b) => b.weight - a.weight);
    body.innerHTML = `
      <div class="views-controls">
        <label>Kind <select id="k-kind"><option value="all">land and sea</option><option value="land"${state.cKind === 'land' ? ' selected' : ''}>land borders</option><option value="sea"${state.cKind === 'sea' ? ' selected' : ''}>across water</option></select></label>
        <label>Show <select id="k-show"><option value="open">not yet decided</option><option value="decided"${state.cShow === 'decided' ? ' selected' : ''}>decided</option><option value="all"${state.cShow === 'all' ? ' selected' : ''}>all</option></select></label>
        <label>Sea reach <input type="range" id="k-sea" min="0.25" max="2" step="0.05" value="${state.seaScale}"> <span class="hint" id="k-sea-t"></span></label>
      </div>
      <div class="hint">Languages that bordered each other on your maps. Approve to start them sharing words (a loan contact from the first year, stronger for longer and longer borders); the direction buttons choose who borrows from whom. ${list.length} shown.</div>
      <table class="hist-table"><tr><th>Languages</th><th>How</th><th>Years</th><th></th></tr>
      ${list.slice(0, 300).map((c) => `<tr data-key="${esc(keyOf(c))}">
        <td><i class="sw" style="background:${langColour(F, c.a)}"></i>${esc(nm(c.a))} · <i class="sw" style="background:${langColour(F, c.b)}"></i>${esc(nm(c.b))}${c.sameFamily ? '' : ' <span class="tag">two families</span>'}</td>
        <td>${c.kind === 'land' ? `land border, ${c.borderKm} km` : `${c.km} km across water`}</td>
        <td class="num">${label(c.from)} – ${label(c.to)}</td>
        <td class="actions">${S.decisions[keyOf(c)] ? `<span class="hint">${esc(S.decisions[keyOf(c)])}</span>` : `
          <button class="btn" data-act="both" title="Both borrow from each other">⇄ both</button>
          <button class="btn" data-act="ab" title="${esc(nm(c.b))} borrows from ${esc(nm(c.a))}">${esc(nm(c.a))} →</button>
          <button class="btn" data-act="ba" title="${esc(nm(c.a))} borrows from ${esc(nm(c.b))}">← ${esc(nm(c.b))}</button>
          <button class="btn" data-act="no" title="No sharing">✕</button>`}</td>
      </tr>`).join('')}</table>`;
    const seaT = body.querySelector('#k-sea-t');
    seaT.textContent = `${seaReach(-3000, state.seaScale)} km in 3000 BFA → ${seaReach(1500, state.seaScale)} km by 1500 AFA`;
    body.querySelector('#k-kind').addEventListener('change', (e) => { state.cKind = e.target.value; renderContacts(body, ctx, S); });
    body.querySelector('#k-show').addEventListener('change', (e) => { state.cShow = e.target.value; renderContacts(body, ctx, S); });
    body.querySelector('#k-sea').addEventListener('change', (e) => { state.seaScale = +e.target.value; renderContacts(body, ctx, S); });
    body.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', async () => {
        const key = b.closest('tr').dataset.key;
        const c = list.find((x) => keyOf(x) === key);
        const act = b.dataset.act;
        if (act !== 'no') {
            const doc = structuredClone(ctx.doc);
            doc.borrowings ??= [];
            const ids = new Set(doc.borrowings.map((x) => x.id));
            const add = (from, to) => {
                let n = 1;
                while (ids.has(`b${n}`)) n++;
                ids.add(`b${n}`);
                const years = c.to - c.from + 5;
                const strength = Math.max(0.2, Math.min(2.5, (years / 300) * (c.kind === 'land' ? Math.min(2, 0.5 + c.borderKm / 600) : 0.5)));
                doc.borrowings.push({ id: `b${n}`, fromId: from, toId: to, year: c.from, until: c.to, strength: +strength.toFixed(2), label: `${c.kind === 'land' ? 'border' : 'across water'} on the maps, ${label(c.from)}–${label(c.to)}` });
            };
            if (act === 'both' || act === 'ab') add(c.a, c.b);
            if (act === 'both' || act === 'ba') add(c.b, c.a);
            const r = await ctx.saveDoc(doc);
            if (!r?.ok) { alert(`Could not save: ${(r?.errors || []).map((e) => e.message).join('; ')}`); return; }
            ctx.doc = doc;
        }
        S.decisions[key] = { both: 'approved, both ways', ab: `approved, ${nm(c.b)} borrows`, ba: `approved, ${nm(c.a)} borrows`, no: 'turned down' }[act];
        await fetch('/api/history/decisions', { method: 'PUT', body: JSON.stringify({ decisions: S.decisions }) });
        renderContacts(body, ctx, S);
    }));
}

function langColour(F, id) {
    return Object.values(F.langs).find((l) => l.id === id)?.color ?? '#999';
}

// --- clashes and keyframes ----------------------------------------------------------------

function renderClashes(body, ctx, S) {
    const groups = [
        ['map-before-birth', 'On the map before the tree has it born'],
        ['map-after-death', 'On the map after the tree has it die'],
        ['never-on-map', 'Living on the tree, but no civilisation on any map speaks it'],
    ];
    body.innerHTML = groups.map(([k, t]) => {
        const rows = S.clashes.filter((c) => c.kind === k);
        return `<h4 class="ty-head">${esc(t)} <span class="hint">${rows.length}</span></h4>
          ${k === 'never-on-map' ? '<div class="hint">Usually minority languages inside a bigger civilisation: paint them in a keyframe to put them on the map.</div>' : ''}
          <table class="hist-table">${rows.map((c) => `<tr><td><button class="linklike" data-focus-lang="${esc(c.id)}">${esc(c.name)}</button></td><td class="hint">${esc(c.note)}</td></tr>`).join('')}</table>`;
    }).join('');
}

function renderKeyframes(body, ctx, S) {
    const F = S.frames;
    const kfs = Object.entries(F.meta.keyframes);
    const years = F.meta.years;
    body.innerHTML = `
      <div class="hist-help">
        <p><b>Keyframes</b> are your own language maps, painted in Paint.NET. Between keyframes, languages follow their civilisations on your yearly maps.</p>
        <ol>
          <li>Pick a year and press <b>Make a starter</b>. It writes <code>data/language-maps/&lt;year&gt;.png</code> in the language-tree folder: your map for that year, at full size, with each civilisation painted in its language's colour.</li>
          <li>Open it in Paint.NET. Paint languages where they belong, using exactly the colours in the key below (pick them from the map with the colour picker). Leave the sea, the greys and the borders alone.</li>
          <li>Save it as PNG, then press <b>Apply changes</b>.</li>
        </ol>
      </div>
      <div class="views-controls">
        <label>Year <select id="kf-year">${years.slice().reverse().map((y) => `<option value="${y}">${label(y)}</option>`).join('')}</select></label>
        <button class="btn" id="kf-make">Make a starter</button> <span id="kf-msg" class="hint"></span>
      </div>
      <h4 class="ty-head">Your keyframes <span class="hint">${kfs.length}</span></h4>
      ${kfs.length ? `<table class="hist-table">${kfs.map(([y, k]) => `<tr><td>${label(+y)}</td><td>${esc(k.file)}</td><td class="hint">${k.painted.toLocaleString('en-GB')} pixels of language</td>
        <td>${k.unknown.length ? `<span class="warn">${k.unknown.length} colours not in the key: ${k.unknown.slice(0, 8).map((u) => `<i class="sw" style="background:${u.rgb}"></i>${u.rgb}`).join(' ')}</span>` : 'all colours known'}</td></tr>`).join('')}</table>` : '<div class="hint">None yet.</div>'}
      <h4 class="ty-head">Key: the paint colour of each language</h4>
      <div class="kf-key">${Object.values(F.langs).sort((a, b) => a.family.localeCompare(b.family) || a.name.localeCompare(b.name)).map((l) => `<span title="${esc(l.family)}"><i class="sw" style="background:${l.key}"></i>${esc(l.name)} <code>${l.key}</code></span>`).join('')}</div>`;
    body.querySelector('#kf-make').addEventListener('click', async () => {
        const y = +body.querySelector('#kf-year').value;
        const msg = body.querySelector('#kf-msg');
        msg.textContent = 'Painting the starter…';
        const r = await fetch('/api/history/starter', { method: 'POST', body: JSON.stringify({ year: y }) }).then((x) => x.json()).catch((e) => ({ log: e.message }));
        msg.textContent = r.ok ? `Written: data/language-maps/${label(y)}.png. Open it in Paint.NET.` : (r.log || r.error || 'failed').split('\n').filter(Boolean).pop();
    });
}
