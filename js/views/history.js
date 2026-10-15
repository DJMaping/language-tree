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

import { esc, keyColor } from '../views.js';
import { FEATURES, andahValue, valueHsl } from './typology-bins.js';
import { makeZoomable } from './zoom.js';

const BASE = 'data/cache/years/';
const W = 2000, H = 1000;   // the working grid: names, areas and arrows are placed on it
let IW = W, IH = H;          // the pictures, twice as sharp since 15 Oct 2026 (meta.image)
const SPECIAL_RGB = { 0: [168, 190, 214], 1: [246, 243, 236], 2: [222, 222, 222], 3: [200, 200, 200], 4: [176, 177, 184] };

let store = null;   // { frames, contacts, clashes, civs, decisions }
let codes = null;   // Uint32Array of the frame on screen (the layer shown)
let shownYear = null;
let timer = null;
let keyHandler = null;

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
    // One layer at a time (DJ, 15 Oct 2026: "don't merge the maps ... only show one of the two").
    if (state.layer !== 'lang') state.layer = 'common';
    state.labels ??= true;
    state.speed ??= 6;
    state.seaScale ??= 1;
    el.innerHTML = '<div class="hint">Loading the yearly maps…</div>';
    let S;
    try { S = await load(); } catch (e) { el.innerHTML = `<div class="views-empty">${esc(e.message)}</div>`; return; }
    const years = S.frames.meta.years;
    state.i ??= years.length - 1;

    const modes = [['map', 'Map'], ['civs', `Civilisations (${Object.keys(S.civs).length})`], ['contacts', 'Border suggestions'],
        ['clashes', `Clashes (${S.clashes.filter((c) => c.kind !== 'never-on-map').length})`], ['keyframes', 'Keyframes']];
    el.innerHTML = `
      <div class="views-controls hist-modes">${modes.map(([k, t]) => `<button class="views-tab${state.mode === k ? ' on' : ''}" data-mode="${k}">${esc(t)}</button>`).join('')}
        <span class="hint">built ${esc(S.frames.meta.built.replace('T', ' '))}</span>
        <button class="btn" id="hist-rebuild" title="Rerun the languages stage after changing civilisations, keyframes or the chart (about 8 minutes)">Apply changes</button>
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
    btn.textContent = 'Rebuilding… (about 8 minutes)';
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
    [IW, IH] = F.meta.image || [W, H];
    body.innerHTML = `
      <div class="views-controls hist-time">
        <button class="btn" id="h-play" title="Play / pause (Space). Left and right arrows step one map (Shift: ten); Home and End jump to the first and last">${timer ? '❚❚' : '▶'}</button>
        <button class="btn" id="h-prev" title="Back one map">‹</button>
        <input type="range" id="h-slider" min="0" max="${years.length - 1}" value="${state.i}">
        <button class="btn" id="h-next" title="On one map">›</button>
        <b id="h-year" class="hist-year"></b>
        <label>Speed <select id="h-speed">${[2, 4, 6, 10, 15].map((v) => `<option${v === state.speed ? ' selected' : ''}>${v}</option>`).join('')}</select> maps/s</label>
        <label title="Commoners: what ordinary people speak, from your keyframes (1765 is your family map). Rulers: the civilisations on your yearly maps and their languages.">Layer <select id="h-layer">
          <option value="common"${state.layer === 'common' ? ' selected' : ''}>commoners (what people speak)</option>
          <option value="lang"${state.layer === 'lang' ? ' selected' : ''}>rulers (the civilisations)</option>
        </select></label>
        <label>Colour <select id="h-colour">
          <option value="language"${state.colour === 'language' ? ' selected' : ''}>by language (related = similar)</option>
          <option value="family"${state.colour === 'family' ? ' selected' : ''}>by family</option>
          <option value="map"${state.colour === 'map' ? ' selected' : ''}>your original map</option>
          <optgroup label="Typology, as each language stood then">${Object.entries(FEATURES).map(([k, f]) => `<option value="t:${k}"${state.colour === `t:${k}` ? ' selected' : ''}>${esc(f.label)}</option>`).join('')}</optgroup>
          <option value="word"${state.colour === 'word' ? ' selected' : ''}>a word (word map)</option>
          <option value="sound"${state.colour === 'sound' ? ' selected' : ''}>a sound (sound map)</option>
        </select></label>
        <label id="h-sound-l"${state.colour === 'sound' ? '' : ' hidden'}>Sound <select id="h-sound">${soundChoices(ctx.views).map(([ph, n]) => `<option value="${esc(ph)}"${ph === state.sound ? ' selected' : ''}>/${esc(ph)}/ (${n})</option>`).join('')}</select></label>
        <label id="h-word-l"${state.colour === 'word' ? '' : ' hidden'}>Word <select id="h-word">${ctx.views.glosses.map((g, i) => `<option value="${i}"${i === state.word ? ' selected' : ''}>${esc(g)}</option>`).join('')}</select></label>
        <label title="Lines where the colour's category changes: isoglosses for a feature or a word"><input type="checkbox" id="h-iso"${state.iso ? ' checked' : ''}> isoglosses</label>
        <input list="h-find-list" id="h-find" placeholder="Find a language…" title="Type a language: the map goes to a year it is spoken, selects it and zooms onto it" style="width:170px">
        <datalist id="h-find-list">${[...new Set(Object.values(F.langs).map((l) => l.name))].sort().map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
        <label><input type="checkbox" id="h-labels"${state.labels ? ' checked' : ''}> names</label>
        <label title="Contacts on the chart (borrowings) active in this year, from donor to borrower"><input type="checkbox" id="h-flows"${state.flows ? ' checked' : ''}> contact arrows</label>
        <label title="Borders your maps suggest, not yet decided"><input type="checkbox" id="h-sugg"${state.sugg ? ' checked' : ''}> suggested</label>
      </div>
      <div class="views-split">
        <div class="views-main hist-stage">
          <img id="h-orig" alt="" hidden>
          <canvas id="h-canvas" width="${IW}" height="${IH}"></canvas>
          <svg id="h-labels" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet"></svg>
          <div id="h-tip" class="hist-tip" hidden></div>
        </div>
        <div class="views-side" id="h-side"></div>
      </div>`;
    const slider = body.querySelector('#h-slider');
    const canvas = body.querySelector('#h-canvas');
    const labelSvg = body.querySelector('#h-labels');
    // Names re-fit as you zoom: smaller areas get theirs once there is room.
    let relabelQueued = false;
    const relabel = () => {
        if (relabelQueued) return;
        relabelQueued = true;
        setTimeout(() => {
            relabelQueued = false;
            const y = years[state.i];
            drawLabels(labelSvg, F, y, state, flowSvg(ctx, S, y), ctx.views);
        }, 16);
    };
    // Sharp pixels up to the picture's own size; beyond it, smoothed rather than blocky.
    const zoomer = makeZoomable([body.querySelector('#h-orig'), canvas, labelSvg], state, 'hist', (k) => {
        canvas.style.imageRendering = k * (W / IW) > 1.1 ? 'auto' : 'pixelated';
        relabel();
    });
    const g = canvas.getContext('2d', { willReadFrequently: true });
    const tip = body.querySelector('#h-tip');

    const show = async (i) => {
        state.i = Math.max(0, Math.min(years.length - 1, i));
        slider.value = state.i;
        const y = years[state.i];
        body.querySelector('#h-year').textContent = label(y);
        await drawFrame(g, F, y, state, !!timer, ctx.views);
        drawLabels(body.querySelector('#h-labels'), F, y, state, flowSvg(ctx, S, y), ctx.views);
        if (!timer) side(body.querySelector('#h-side'), ctx, S, y);
        if (!timer) legendFor(body.querySelector('#h-side'), ctx, S, y);
    };
    // Keys while the map is up: arrows step, Space plays, Home/End jump.
    if (keyHandler) document.removeEventListener('keydown', keyHandler);
    keyHandler = (e) => {
        if (!body.isConnected) { document.removeEventListener('keydown', keyHandler); keyHandler = null; return; }
        if (e.target.closest?.('input, select, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
        const go = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
        if (go) { e.preventDefault(); stop(); body.querySelector('#h-play').textContent = '▶'; show(state.i + go * (e.shiftKey ? 10 : 1)); }
        else if (e.key === ' ') { e.preventDefault(); play(); }
        else if (e.key === 'Home') { e.preventDefault(); stop(); show(0); }
        else if (e.key === 'End') { e.preventDefault(); stop(); show(years.length - 1); }
    };
    document.addEventListener('keydown', keyHandler);
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
    body.querySelector('#h-layer').addEventListener('change', (e) => { state.layer = e.target.value; show(state.i); });
    body.querySelector('#h-word').addEventListener('change', (e) => { state.word = +e.target.value; show(state.i); });
    body.querySelector('#h-iso').addEventListener('change', (e) => { state.iso = e.target.checked; show(state.i); });
    const findBox = () => body.querySelector('#h-find');
    // Find: the nearest year (to the one shown) in which the language is on
    // the map, then select it and zoom to the middle of its land.
    const findLanguage = async (ids, e = null) => {
        const codes_ = Object.keys(F.langs).filter((c) => ids.has(F.langs[c].id));
        if (!codes_.length) return;
        const where = (i) => { const a = layerAreas(F, years[i], state); const c = codes_.find((x) => a[x]); return c ? { c, a: a[c] } : null; };
        let i = -1;
        for (let d = 0; d < years.length && i < 0; d++) {
            if (state.i - d >= 0 && where(state.i - d)) i = state.i - d;
            else if (state.i + d < years.length && where(state.i + d)) i = state.i + d;
        }
        if (i < 0) { if (e) { e.target.value = ''; e.target.placeholder = 'not on any map'; } return false; }
        stop();
        const hit = where(i);
        state.sel = F.langs[hit.c].id;
        await show(i);
        const [px, x, y] = hit.a;
        const k = Math.max(1.5, Math.min(12, Math.sqrt((W * H) / Math.max(40, px)) / 3));
        zoomer?.focus(x / W, y / H, k);
        if (e) e.target.value = '';
        return true;
    };
    findBox().addEventListener('change', (e) => {
        const wanted = e.target.value.trim().toLowerCase();
        findLanguage(new Set(Object.values(F.langs).filter((l) => l.name.toLowerCase() === wanted).map((l) => l.id)), e);
    });
    // From the tree's panel: "On the yearly map". The language itself, or the
    // nearest of its line that the maps show (an ancestor or a descendant).
    if (state.find) {
        const id = state.find;
        state.find = null;
        setTimeout(async () => {
            if (await findLanguage(new Set([id]))) return;
            await findLanguage(lineage(ctx.model, id));
        }, 0);
    }
    body.querySelector('#h-colour').addEventListener('change', () => {
        body.querySelector('#h-word-l').hidden = state.colour !== 'word';
        body.querySelector('#h-sound-l').hidden = state.colour !== 'sound';
        if (state.colour === 'sound' && !state.sound) { state.sound = body.querySelector('#h-sound').value; show(state.i); }
    });
    body.querySelector('#h-sound').addEventListener('change', (e) => { state.sound = e.target.value; show(state.i); });
    body.querySelector('#h-labels').addEventListener('change', (e) => { state.labels = e.target.checked; show(state.i); });
    body.querySelector('#h-flows').addEventListener('change', (e) => { state.flows = e.target.checked; show(state.i); });
    body.querySelector('#h-sugg').addEventListener('change', (e) => { state.sugg = e.target.checked; show(state.i); });
    const pos = (e) => {
        const r = canvas.getBoundingClientRect();
        const x = Math.floor(((e.clientX - r.left) / r.width) * IW), y = Math.floor(((e.clientY - r.top) / r.height) * IH);
        return x >= 0 && y >= 0 && x < IW && y < IH ? y * IW + x : null;
    };
    const codeAt = (e) => { const p = pos(e); return codes && p != null ? codes[p] : null; };
    canvas.addEventListener('mousemove', (e) => {
        const c = codeAt(e);
        const t = nameOf(F, c);
        tip.hidden = !t;
        if (t) {
            const r = body.querySelector('.hist-stage').getBoundingClientRect();
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
    if (imgCache.size > 12) imgCache.delete(imgCache.keys().next().value);   // 4000 x 2000 pictures: keep few
    return p;
}

/**
 * One frame onto the canvas. The PNG holds a code per pixel; one pass turns
 * codes into colours and darkens the line where two languages meet. While
 * playing, every other pixel is skipped (half size, scaled up): four times
 * less work, and nobody reads borders at ten maps a second.
 */
async function decode(url, w, h) {
    const im = await image(url);
    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    const og = off.getContext('2d', { willReadFrequently: true });
    og.imageSmoothingEnabled = false;   // nearest pixel: codes must survive scaling exactly
    og.drawImage(im, 0, 0, w, h);
    return { off, og, data: og.getImageData(0, 0, w, h).data };
}

/**
 * What a colour mode says about a language: its typology value, or the root
 * its word for the chosen meaning comes from (a loan counts as its donor's).
 * null when the mode is about languages themselves.
 */
function categoryOf(F, views, state, c) {
    const L = F.langs[c];
    if (!L || !views) return null;
    const V = views.languages[L.id];
    if (!V) return null;
    if (state.colour.startsWith('t:')) return andahValue(state.colour.slice(2), V.features, views.families[V.family]);
    if (state.colour === 'word') return V.ids[state.word ?? 0] ?? null;
    if (state.colour === 'sound') return V.phonemes ? (V.phonemes.includes(state.sound) ? `has /${state.sound}/` : `no /${state.sound}/`) : null;
    return null;
}

/** Every sound in any language, commonest first, with how many languages have it. */
let soundList = null;
function soundChoices(views) {
    if (soundList) return soundList;
    const n = new Map();
    for (const L of Object.values(views?.languages || {})) for (const ph of new Set(L.phonemes || [])) n.set(ph, (n.get(ph) || 0) + 1);
    soundList = [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return soundList;
}

function categoryRgb(state, cat) {
    if (cat == null) return [235, 235, 235];
    if (state.colour === 'sound') return String(cat).startsWith('has') ? [196, 74, 40] : [196, 210, 224];
    if (state.colour.startsWith('t:')) {
        const h = valueHsl(state.colour.slice(2), cat);
        return h ? hsl(h[0], h[1] / 100, h[2] / 100) : [235, 235, 235];
    }
    const m = /hsl\((\d+) (\d+)% (\d+)%\)/.exec(keyColor(String(cat).replace(/^loan:/, ''), 60, 55));
    return m ? hsl(+m[1], +m[2] / 100, +m[3] / 100) : [128, 128, 128];
}

async function drawFrame(g, F, year, state, fast = false, views = null) {
    const folder = state.layer === 'lang' ? 'lang' : 'common';
    const yi = F.meta.years.indexOf(year);
    if (yi + 1 < F.meta.years.length) image(`${BASE}${folder}/${F.meta.years[yi + 1]}.png`);
    const w = fast ? W / 2 : IW, h = fast ? H / 2 : IH;
    const { off, og, data: src } = await decode(`${BASE}${folder}/${year}.png`, w, h);
    const n = w * h;
    const cs = new Uint32Array(n);

    if (state.colour === 'map') {
        for (let p = 0, q = 0; p < n; p++, q += 4) cs[p] = (src[q] << 16) | (src[q + 1] << 8) | src[q + 2];
        codes = fast ? null : cs;
        // DJ's own map as an image of its own, so the browser draws it at
        // the zoom it is seen at: full size from the PC's Every Year folder,
        // the small copy in git where that folder is not.
        const el = g.canvas.parentElement.querySelector('#h-orig');
        const small = `${BASE}orig/${year}.jpg`;
        let ok = true;
        await new Promise((res) => {
            el.onload = res;
            el.onerror = () => {
                if (el.src.endsWith(small)) { ok = false; res(); } else el.src = small;
            };
            el.src = `/api/history/original/${year}`;
        });
        if (!ok) {   // no original anywhere (the view-only copy)
            el.hidden = true;
            state.colour = 'language';
            return drawFrame(g, F, year, state, fast, views);
        }
        el.hidden = false;
        g.clearRect(0, 0, IW, IH);
        if (state.sel && !fast) dimExcept(g, F, state.sel, true);
        return;
    }
    const famHue = F.meta.familyHue;
    const L0 = F.meta.lang0;
    const selCode = state.sel ? Number(Object.keys(F.langs).find((k) => F.langs[k].id === state.sel)) : null;
    const table = new Map();
    const byCategory = state.colour.startsWith('t:') || state.colour === 'word' || state.colour === 'sound';
    const cats = new Map();
    const catOf = (c) => { if (!cats.has(c)) cats.set(c, byCategory ? categoryOf(F, views, state, c) : c); return cats.get(c); };
    const colourOf = (c) => {
        let rgb = table.get(c);
        if (rgb) return rgb;
        if (F.langs[c] && byCategory) rgb = categoryRgb(state, catOf(c));
        else if (F.langs[c]) rgb = state.colour === 'family' ? hsl(famHue[F.langs[c].family] ?? 0, 0.5, 0.55) : hexRgb(F.langs[c].color);
        else if (F.civs[c]) rgb = hexRgb(F.civs[c].rgb).map((v) => Math.round(v * 0.6 + 255 * 0.4));
        else rgb = SPECIAL_RGB[c] ?? [255, 0, 255];
        if (selCode != null && c !== selCode && c >= L0) rgb = rgb.map((v) => Math.round(v * 0.3 + 255 * 0.7));
        table.set(c, rgb);
        return rgb;
    };
    const origEl = g.canvas.parentElement?.querySelector('#h-orig');
    if (origEl) origEl.hidden = true;
    const out = new ImageData(w, h);
    const d = out.data;
    let last = -1, rgb = null;
    for (let p = 0, q = 0; p < n; p++, q += 4) {
        const c = (src[q] << 16) | (src[q + 1] << 8) | src[q + 2];
        cs[p] = c;
        if (c !== last) { rgb = colourOf(c); last = c; }
        // a line where two languages meet (left or above differs)
        const edge = c >= L0 && ((p % w && cs[p - 1] !== c && cs[p - 1] >= L0) || (p >= w && cs[p - w] !== c && cs[p - w] >= L0));
        // an isogloss: where the category itself changes, a heavy dark line
        const iso = state.iso && edge && ((p % w && cs[p - 1] !== c && catOf(cs[p - 1]) !== catOf(c)) || (p >= w && cs[p - w] !== c && catOf(cs[p - w]) !== catOf(c)));
        const k = iso ? 0.1 : edge ? (byCategory ? 0.8 : 0.55) : 1;
        d[q] = rgb[0] * k; d[q + 1] = rgb[1] * k; d[q + 2] = rgb[2] * k; d[q + 3] = 255;
    }
    codes = fast ? null : cs;
    if (fast) {
        og.putImageData(out, 0, 0);
        g.imageSmoothingEnabled = false;
        g.drawImage(off, 0, 0, IW, IH);
    } else g.putImageData(out, 0, 0);
}

/** Fade all but one language: in place, or (over DJ's own map) as a veil on an empty canvas. */
function dimExcept(g, F, id, veil = false) {
    const img = veil ? g.createImageData(IW, IH) : g.getImageData(0, 0, IW, IH);
    const d = img.data;
    const code = Number(Object.keys(F.langs).find((k) => F.langs[k].id === id));
    for (let p = 0, q = 0; p < codes.length; p++, q += 4) {
        if (codes[p] === code) continue;
        if (veil) { d[q] = d[q + 1] = d[q + 2] = 245; d[q + 3] = 165; }
        else { d[q] = d[q] * 0.35 + 166; d[q + 1] = d[q + 1] * 0.35 + 166; d[q + 2] = d[q + 2] * 0.35 + 166; }
    }
    g.putImageData(img, 0, 0);
}

function hsl(h, s, l) {
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [f(0), f(8), f(4)].map((v) => Math.round(v * 255));
}

/**
 * The flow map: every contact on the chart active in this year as an arrow
 * from the donor's land to the borrower's, thicker for a stronger contact.
 * A contact names languages; the map shows whichever stage of their lines is
 * spoken in this year, so each end is found through its line.
 */
const lineCache = new Map();
function lineOf(model, id) {
    if (!lineCache.has(id)) lineCache.set(id, lineage(model, id));
    return lineCache.get(id);
}
function flowSvg(ctx, S, year) {
    const { state, model } = ctx;
    if (!state.flows && !state.sugg) return '';
    const F = S.frames;
    const areas = layerAreas(F, year, state);
    const present = Object.entries(areas).filter(([c]) => F.langs[c]).map(([c, a]) => ({ id: F.langs[c].id, color: F.langs[c].color, px: a[0], x: a[1], y: a[2] }));
    const where = (id) => {
        const line = lineOf(model, id);
        let best = null;
        for (const p of present) if (line.has(p.id) && (!best || p.px > best.px)) best = p;
        return best;
    };
    const arrow = (a, b, cls, w, color, title) => {
        if (!a || !b || a === b) return '';
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const dx = b.x - a.x, dy = b.y - a.y;
        const bend = 0.18;
        const cx = mx - dy * bend, cy = my + dx * bend;
        // the head: a triangle along the curve's last direction
        const ux = b.x - cx, uy = b.y - cy, len = Math.hypot(ux, uy) || 1;
        const hx = ux / len, hy = uy / len, size = 6 + w * 2.2;
        const p1 = [b.x - hx * size - hy * size * 0.55, b.y - hy * size + hx * size * 0.55];
        const p2 = [b.x - hx * size + hy * size * 0.55, b.y - hy * size - hx * size * 0.55];
        return `<g class="${cls}"><title>${esc(title)}</title><path d="M${a.x},${a.y} Q${cx.toFixed(0)},${cy.toFixed(0)} ${(b.x - hx * size * 0.8).toFixed(0)},${(b.y - hy * size * 0.8).toFixed(0)}" style="stroke:${color};stroke-width:${w.toFixed(1)}"/>`
            + `<polygon points="${b.x},${b.y} ${p1[0].toFixed(0)},${p1[1].toFixed(0)} ${p2[0].toFixed(0)},${p2[1].toFixed(0)}" style="fill:${color}"/></g>`;
    };
    let out = '';
    if (state.flows) {
        for (const b of ctx.doc.borrowings || []) {
            if (b.year == null) continue;
            const until = b.until ?? b.year + 150;
            if (year < b.year || year > until) continue;
            const kind = b.kind || 'loan';
            out += arrow(where(b.fromId), where(b.toId), `flow ${kind}`, 2 + 3 * Math.min(2, b.strength ?? 1), where(b.fromId)?.color ?? '#333',
                `${model.byId.get(b.fromId)?.name} → ${model.byId.get(b.toId)?.name}: ${kind}, ${label(b.year)}–${label(until)}${b.label ? ` (${b.label})` : ''}`);
        }
    }
    if (state.sugg) {
        const keyOf = (c) => `${c.a}|${c.b}|${c.from}`;
        for (const c of S.contacts) {
            if (year < c.from || year > c.to || c.exists || S.decisions[keyOf(c)]) continue;
            const a = present.find((p) => p.id === c.a), b = present.find((p) => p.id === c.b);
            if (a && b) out += `<line class="sugg" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"><title>${esc(`${F.langs[Object.keys(F.langs).find((k) => F.langs[k].id === c.a)]?.name} · ${F.langs[Object.keys(F.langs).find((k) => F.langs[k].id === c.b)]?.name}: ${c.kind === 'land' ? 'border' : `${c.km} km across water`}, not decided`)}</title></line>`;
        }
    }
    return out;
}

/** Names where each area is deepest, sized to fit inside it. */
const layerAreas = (F, year, state) => (state.layer === 'lang' ? F.frames[year]?.areas : F.frames[year]?.common) || {};

function drawLabels(svg, F, year, state, under = '', views = null) {
    if (!state.labels) { svg.innerHTML = under; return; }
    const areas = layerAreas(F, year, state);
    const k = state.zoom?.hist?.k ?? 1;
    const items = [];
    for (const [c, [px, x, y, room]] of Object.entries(areas)) {
        const word = state.colour === 'word' && F.langs[c] && views?.languages[F.langs[c].id]?.words[state.word ?? 0];
        const name = word || (F.langs[c]?.name ?? (F.civs[c] ? `${F.civs[c].name}?` : null));
        if (!name || px * k * k < 120) continue;
        // sized in map units, so on screen a name is at most as big zoomed as not
        const size = Math.min(30 / k, room * 0.9, (2.2 * room) / (0.55 * name.length));
        if (size * k < 8.5) continue;
        items.push({ c, x, y, size, name, civ: !F.langs[c] });
    }
    svg.innerHTML = under + items.map((t) => `<text x="${t.x}" y="${t.y}" font-size="${t.size.toFixed(1)}" class="${t.civ ? 'civ' : ''}${F.langs[t.c]?.id === state.sel ? ' sel' : ''}">${esc(t.name)}</text>`).join('');
}

/** For a typology or word map: what each colour means, and how many languages. */
function legendFor(el, ctx, S, year) {
    const { state, views } = ctx;
    if (state.sel || !(state.colour.startsWith('t:') || state.colour === 'word' || state.colour === 'sound')) return;
    const F = S.frames;
    const areas = layerAreas(F, year, state);
    const tally = new Map();
    for (const [c, a] of Object.entries(areas)) {
        if (!F.langs[c]) continue;
        const cat = categoryOf(F, views, state, c);
        const t = tally.get(cat) || { km2: 0, langs: [] };
        t.km2 += a[4];
        t.langs.push(c);
        tally.set(cat, t);
    }
    const order = state.colour.startsWith('t:') ? FEATURES[state.colour.slice(2)].values : null;
    const rows = [...tally.entries()].sort((a, b) => (order ? order.indexOf(a[0]) - order.indexOf(b[0]) : b[1].km2 - a[1].km2));
    const swatch = (cat) => `rgb(${categoryRgb(state, cat).join(',')})`;
    const title = state.colour === 'word' ? `"${views.glosses[state.word ?? 0]}" in ${label(year)}` : state.colour === 'sound' ? `/${state.sound}/ in ${label(year)}` : `${FEATURES[state.colour.slice(2)].label} in ${label(year)}`;
    el.innerHTML = `<h3>${esc(title)}</h3>
      <table class="kv-table">${rows.map(([cat, t]) => `<tr><td><i class="sw" style="background:${swatch(cat)}"></i>${esc(state.colour === 'word'
        ? t.langs.map((c) => views.languages[F.langs[c].id]?.words[state.word ?? 0]).filter((v, i, a) => a.indexOf(v) === i).slice(0, 4).join(', ') + (String(cat).startsWith('loan:') ? ` (from ${ctx.model.byId.get(String(cat).slice(5))?.name ?? '?'})` : '')
        : cat ?? 'no data')}</td><td class="num">${t.langs.length} lang.</td><td class="num">${Math.round(t.km2 / 1000).toLocaleString('en-GB')}k km²</td></tr>`).join('')}</table>
      <div class="hint">${state.colour === 'word' ? 'One colour per root: languages sharing a colour use words from the same source (cognates, or loans from the same donor).' : 'Each language as it stood in that year, measured as on the Typology maps.'} Tick isoglosses for the lines between them.</div>
      <h4>Through history <span class="hint">share of the land in each category</span></h4>
      ${historyStream(ctx, S, year, swatch, order)}`;
}

/**
 * A feature (or a word's roots) through every year on the maps: the share of
 * language-speaking land in each category, stacked. The years are spaced by
 * map, not by date, since the maps come every 5 years late and every
 * thousands early; the axis marks the dates.
 */
function historyStream(ctx, S, year, swatch, order, catFn = null) {
    const { state, views } = ctx;
    const F = S.frames;
    const cat_ = catFn || ((c) => categoryOf(F, views, state, c));
    const years = F.meta.years;
    const first = years.findIndex((y) => Object.keys(layerAreas(F, y, state)).some((c) => F.langs[c]));
    if (first < 0) return '';
    const ys = years.slice(first);
    const per = ys.map((y) => {
        const m = new Map();
        let t = 0;
        for (const [c, a] of Object.entries(layerAreas(F, y, state))) {
            if (!F.langs[c]) continue;
            const cat = cat_(c);
            m.set(cat, (m.get(cat) || 0) + a[4]);
            t += a[4];
        }
        return { m, t: t || 1 };
    });
    const totals = new Map();
    for (const p of per) for (const [c, v] of p.m) totals.set(c, (totals.get(c) || 0) + v / p.t);
    let cats = [...totals.keys()];
    cats = order ? cats.sort((a, b) => order.indexOf(a) - order.indexOf(b)) : cats.sort((a, b) => totals.get(b) - totals.get(a));
    const shown = cats.slice(0, 9);
    const Wd = 300, Hd = 120;
    const X = (i) => (i / Math.max(1, ys.length - 1)) * Wd;
    const base = ys.map(() => 0);
    let paths = '';
    for (const c of shown) {
        const top = per.map((p, i) => base[i] + (p.m.get(c) || 0) / p.t);
        const d = `M${top.map((v, i) => `${X(i).toFixed(1)},${(Hd - v * Hd).toFixed(1)}`).join('L')}L${[...base].reverse().map((v, j) => `${X(ys.length - 1 - j).toFixed(1)},${(Hd - v * Hd).toFixed(1)}`).join('L')}Z`;
        paths += `<path d="${d}" style="fill:${swatch(c)}"><title>${esc(String(c ?? 'no data'))}</title></path>`;
        top.forEach((v, i) => { base[i] = v; });
    }
    const now = ys.indexOf(year);
    const ticks = [0, Math.round((ys.length - 1) / 2), ys.length - 1].map((i) => `<text x="${X(i).toFixed(1)}" y="${Hd + 12}" text-anchor="${i === 0 ? 'start' : i === ys.length - 1 ? 'end' : 'middle'}">${label(ys[i])}</text>`).join('');
    return `<svg class="hist-stream" viewBox="0 -2 ${Wd} ${Hd + 16}">${paths}${now >= 0 ? `<line x1="${X(now)}" x2="${X(now)}" y1="0" y2="${Hd}" class="now"/>` : ''}${ticks}</svg>`;
}

/** One language's land through the years: commoners (filled) and rulers (line). */
function rangeChart(F, code, year) {
    const years = F.meta.years;
    const c = years.map((y) => F.frames[y]?.common?.[code]?.[4] ?? 0);
    const r = years.map((y) => F.frames[y]?.areas?.[code]?.[4] ?? 0);
    const on = years.map((_, i) => c[i] || r[i]);
    const i0 = Math.max(0, on.findIndex(Boolean) - 2), i1 = Math.min(years.length - 1, years.length - 1 - [...on].reverse().findIndex(Boolean) + 2);
    if (i0 >= i1) return '';
    const max = Math.max(...c.slice(i0, i1 + 1), ...r.slice(i0, i1 + 1), 1);
    const Wd = 300, Hd = 70;
    const X = (i) => ((i - i0) / (i1 - i0)) * Wd, Y = (v) => Hd - (v / max) * Hd;
    const idx = Array.from({ length: i1 - i0 + 1 }, (_, k) => i0 + k);
    const area = `M${X(i0)},${Hd}L${idx.map((i) => `${X(i).toFixed(1)},${Y(c[i]).toFixed(1)}`).join('L')}L${X(i1)},${Hd}Z`;
    const line = `M${idx.map((i) => `${X(i).toFixed(1)},${Y(r[i]).toFixed(1)}`).join('L')}`;
    const now = years.indexOf(year);
    const peak = idx.reduce((a, i) => (c[i] > c[a] ? i : a), i0);
    return `<svg class="hist-range" viewBox="0 -2 ${Wd} ${Hd + 16}">
      <path d="${area}" class="spoken"/><path d="${line}" class="ruled"/>
      ${now >= i0 && now <= i1 ? `<line x1="${X(now)}" x2="${X(now)}" y1="0" y2="${Hd}" class="now"/>` : ''}
      <text x="0" y="${Hd + 12}">${label(years[i0])}</text><text x="${Wd}" y="${Hd + 12}" text-anchor="end">${label(years[i1])}</text>
      <text x="${Math.min(Wd - 4, Math.max(4, X(peak)))}" y="10" text-anchor="middle">${Math.round(c[peak] / 1000).toLocaleString('en-GB')}k km²</text></svg>
      <div class="hint">Filled: where ordinary people speak it. Line: land its speakers rule.</div>`;
}

function side(el, ctx, S, year) {
    const F = S.frames;
    const id = ctx.state.sel;
    const areas = layerAreas(F, year, ctx.state);
    const ranked = Object.entries(areas).filter(([c]) => F.langs[c]).sort((a, b) => b[1][4] - a[1][4]);
    const lost = ['2', '3', '4'];
    if (!id) {
        const kf = F.frames[year]?.keyframe;
        el.innerHTML = `<h3>${label(year)}</h3>
          <div class="hint">${ranked.length} languages on the map${kf != null ? `; following the keyframe of ${label(kf)}` : ''}. Click a language.</div>
          <table class="kv-table">${ranked.slice(0, 40).map(([c, [, , , , km2]]) => `<tr><td><i class="sw" style="background:${F.langs[c].color}"></i>${esc(F.langs[c].name)}</td><td class="num">${Math.round(km2 / 1000).toLocaleString('en-GB')}k km²</td></tr>`).join('')}</table>
          <div class="hint">Grey land: peoples whose languages are lost (Advanced Culture, Embryonic Civilisation) or Homo sapiens without a culture.</div>
          <h4>Families through history <span class="hint">share of the language-speaking land</span></h4>
          ${historyStream(ctx, S, year, (f) => `rgb(${hsl(F.meta.familyHue[f] ?? 0, 0.5, 0.55).join(',')})`, null, (c) => F.langs[c]?.family)}`;
        return;
    }
    const L = Object.values(F.langs).find((l) => l.id === id);
    const node = ctx.model.byId.get(id);
    const civs = Object.entries(S.civs).filter(([, c]) => c.lang && lineage(ctx.model, c.lang).has(id));
    const near = S.contacts.filter((c) => (c.a === id || c.b === id) && c.from <= year && year <= c.to && (c.kind === 'land' || c.kind === 'sea' || c.kind === 'lane'));
    const layered = S.contacts.filter((c) => (c.a === id || c.b === id) && c.from <= year && year <= c.to && (c.kind === 'superstrate' || c.kind === 'substrate'));
    const code = Object.keys(F.langs).find((k) => F.langs[k].id === id);
    const km = (a) => (a ? `${Math.round(a[4] / 1000).toLocaleString('en-GB')}k km²` : 'none');
    el.innerHTML = `<h3>${esc(L.name)}</h3>
      <div class="kv"><b>Family:</b> ${esc(L.family)}</div>
      <div class="kv"><b>On the tree:</b> ${node?.born != null ? label(node.born) : '?'} – ${node?.died != null ? label(node.died) : 'living'}</div>
      <div class="kv"><b>In ${label(year)}:</b> commoners speak it on ${km(F.frames[year]?.common?.[code])}; its speakers rule ${km(F.frames[year]?.areas?.[code])}</div>
      <div class="kv"><button class="linklike" data-focus-lang="${esc(id)}">Show it on the tree</button></div>
      <h4>Its land through history</h4>
      ${rangeChart(F, code, year)}
      <h4>Spoken by (civilisations)</h4>
      ${civs.length ? civs.map(([, c]) => `<div><i class="sw" style="background:${c.rgb}"></i>${esc(c.name)} <span class="hint">${label(c.from)}–${label(c.to)}, ${esc(c.how || '')}</span></div>`).join('') : '<div class="hint">none</div>'}
      <h4>Neighbours in ${label(year)}</h4>
      ${near.length ? near.map((c) => { const o = c.a === id ? c.b : c.a; const n = Object.values(F.langs).find((l) => l.id === o); return `<div>${esc(n?.name ?? o)} <span class="hint">${c.kind === 'land' ? `border ${c.borderKm} km` : c.kind === 'lane' ? 'sea trade' : `${c.km} km across water`}, ${label(c.from)}–${label(c.to)}${c.exists ? ', already sharing' : ''}</span></div>`; }).join('') : '<div class="hint">none</div>'}
      ${layered.length ? `<h4>Rule and shift around ${label(year)}</h4>${layered.map((c) => `<div>${c.kind === 'superstrate' ? `${esc(nmOf(F, c.a))} rules ${esc(nmOf(F, c.b))} speakers` : `${esc(nmOf(F, c.b))} replaces ${esc(nmOf(F, c.a))}`} <span class="hint">${label(c.from)}–${label(c.to)}, ${Math.round(c.areaKm2 / 1000).toLocaleString('en-GB')}k km²</span></div>`).join('')}` : ''}
      <div class="hint" style="margin-top:8px">Click the sea to clear.</div>`;
    void lost;
}

const nmOf = (F, id) => Object.values(F.langs).find((l) => l.id === id)?.name ?? id;

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
    state.cLang ??= '';
    const F = S.frames;
    const nm = (id) => model.byId.get(id)?.name ?? id;
    const keyOf = (c) => `${c.a}|${c.b}|${c.from}`;
    const want = state.cLang.trim().toLowerCase();
    const list = S.contacts.filter((c) => {
        if (state.cKind !== 'all' && c.kind !== state.cKind) return false;
        if (want && !nm(c.a).toLowerCase().includes(want) && !nm(c.b).toLowerCase().includes(want)) return false;
        if (c.kind === 'sea' && c.km > seaReach(c.from, state.seaScale)) return false;
        const d = S.decisions[keyOf(c)];
        if (state.cShow === 'open' && (d || c.exists)) return false;
        if (state.cShow === 'decided' && !d) return false;
        return true;
    }).map((c) => ({ ...c, weight: (c.to - c.from + 5) * (c.kind === 'land' ? Math.max(20, c.borderKm) : c.kind === 'sea' ? 400 / Math.max(50, c.km) * 20 : c.kind === 'lane' ? 50 + 2000 * c.share : Math.sqrt(c.areaKm2) / 2) }))
        .sort((a, b) => b.weight - a.weight);
    body.innerHTML = `
      <div class="views-controls">
        <label>Kind <select id="k-kind">${[['all', 'all kinds'], ['land', 'land borders'], ['sea', 'across water'], ['lane', 'sea trade routes (1690+)'], ['superstrate', 'rulers over commoners (superstrate)'], ['substrate', 'finished switches (substrate)']].map(([v, t]) => `<option value="${v}"${state.cKind === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
        <label>Show <select id="k-show"><option value="open">not yet decided</option><option value="decided"${state.cShow === 'decided' ? ' selected' : ''}>decided</option><option value="all"${state.cShow === 'all' ? ' selected' : ''}>all</option></select></label>
        <label>Sea reach <input type="range" id="k-sea" min="0.25" max="2" step="0.05" value="${state.seaScale}"> <span class="hint" id="k-sea-t"></span></label>
        <label>Language <input list="k-langs" id="k-lang" value="${esc(state.cLang)}" placeholder="any" style="width:150px"></label>
        <datalist id="k-langs">${[...new Set(S.contacts.flatMap((c) => [nm(c.a), nm(c.b)]))].sort().map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
        ${state.cShow !== 'decided' && list.some((c) => !S.decisions[keyOf(c)] && !c.exists) ? `<button class="btn" id="k-all" title="Add every suggestion matching these filters (borders, water and trade both ways; rule and shift one way)">Approve all ${list.filter((c) => !S.decisions[keyOf(c)] && !c.exists).length}</button>` : ''}
        <span id="k-msg" class="hint"></span>
      </div>
      <div class="hint">Languages that bordered each other on your maps. Approve to start them sharing words (a loan contact from the first year, stronger for longer and longer borders); the direction buttons choose who borrows from whom. ${list.length} shown.</div>
      <table class="hist-table"><tr><th>Languages</th><th>How</th><th>Years</th><th></th></tr>
      ${list.slice(0, 300).map((c) => `<tr data-key="${esc(keyOf(c))}">
        <td><i class="sw" style="background:${langColour(F, c.a)}"></i>${esc(nm(c.a))} · <i class="sw" style="background:${langColour(F, c.b)}"></i>${esc(nm(c.b))}${c.sameFamily ? '' : ' <span class="tag">two families</span>'}</td>
        <td>${HOW_TEXT(c, nm)}</td>
        <td class="num">${label(c.from)} – ${label(c.to)}</td>
        <td class="actions">${S.decisions[keyOf(c)] ? `<span class="hint">${esc(S.decisions[keyOf(c)])}</span>` : c.kind === 'superstrate' || c.kind === 'substrate' ? `
          <button class="btn" data-act="ab" title="${esc(nm(c.b))} takes words from ${esc(nm(c.a))} (${c.kind})">✓ add</button>
          <button class="btn" data-act="no" title="No">✕</button>` : `
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
    body.querySelector('#k-lang').addEventListener('change', (e) => { state.cLang = e.target.value; renderContacts(body, ctx, S); });
    const DONE = { both: 'approved, both ways', no: 'turned down' };
    body.querySelector('#k-all')?.addEventListener('click', async (e) => {
        const todo = list.filter((c) => !S.decisions[keyOf(c)] && !c.exists);
        const btn = e.target;
        if (btn.dataset.sure !== 'yes') {   // a second click confirms
            btn.dataset.sure = 'yes';
            btn.textContent = `Click again to add ${todo.length} contacts`;
            return;
        }
        const doc = structuredClone(ctx.doc);
        doc.borrowings ??= [];
        const ids = new Set(doc.borrowings.map((x) => x.id));
        for (const c of todo) {
            addBorrowing(doc, ids, c, c.a, c.b);
            if (c.kind === 'land' || c.kind === 'sea' || c.kind === 'lane') addBorrowing(doc, ids, c, c.b, c.a);
        }
        const r = await ctx.saveDoc(doc);
        if (!r?.ok) { body.querySelector('#k-msg').textContent = `Could not save: ${(r?.errors || []).map((x) => x.message).join('; ')}`; return; }
        ctx.doc = doc;
        for (const c of todo) S.decisions[keyOf(c)] = c.kind === 'superstrate' || c.kind === 'substrate' ? `approved, ${nm(c.b)} borrows` : DONE.both;
        await fetch('/api/history/decisions', { method: 'PUT', body: JSON.stringify({ decisions: S.decisions }) });
        renderContacts(body, ctx, S);
    });
    body.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', async () => {
        const key = b.closest('tr').dataset.key;
        const c = list.find((x) => keyOf(x) === key);
        const act = b.dataset.act;
        if (act !== 'no') {
            const doc = structuredClone(ctx.doc);
            doc.borrowings ??= [];
            const ids = new Set(doc.borrowings.map((x) => x.id));
            if (act === 'both' || act === 'ab') addBorrowing(doc, ids, c, c.a, c.b);
            if (act === 'both' || act === 'ba') addBorrowing(doc, ids, c, c.b, c.a);
            const r = await ctx.saveDoc(doc);
            if (!r?.ok) { alert(`Could not save: ${(r?.errors || []).map((e) => e.message).join('; ')}`); return; }
            ctx.doc = doc;
        }
        S.decisions[key] = { both: 'approved, both ways', ab: `approved, ${nm(c.b)} borrows`, ba: `approved, ${nm(c.a)} borrows`, no: 'turned down' }[act];
        await fetch('/api/history/decisions', { method: 'PUT', body: JSON.stringify({ decisions: S.decisions }) });
        renderContacts(body, ctx, S);
    }));
}

/** A suggestion as a contact on the chart: dated, with an end, its strength from its length and size. */
function addBorrowing(doc, ids, c, from, to) {
    let n = 1;
    while (ids.has(`b${n}`)) n++;
    ids.add(`b${n}`);
    const years = c.to - c.from + 5;
    const reach = c.kind === 'land' ? Math.min(2, 0.5 + c.borderKm / 600) : c.kind === 'sea' ? 0.5 : c.kind === 'lane' ? 0.4 + 2 * c.share : Math.min(2, 0.4 + Math.log10(Math.max(10, c.areaKm2)) / 5);
    const strength = Math.max(0.2, Math.min(2.5, (years / 300) * reach));
    const what = { land: 'border', sea: 'across water', lane: 'sea trade route', superstrate: 'rulers over commoners', substrate: 'commoners switched language' }[c.kind];
    const b = { id: `b${n}`, fromId: from, toId: to, year: c.from, until: c.to, strength: +strength.toFixed(2), label: `${what} on the maps, ${label(c.from)}–${label(c.to)}` };
    if (c.kind === 'superstrate' || c.kind === 'substrate') b.kind = c.kind;
    doc.borrowings.push(b);
}

function HOW_TEXT(c, nm) {
    if (c.kind === 'land') return `land border, ${c.borderKm} km`;
    if (c.kind === 'sea') return `${c.km} km across water`;
    if (c.kind === 'lane') return `sea trade route (${Math.max(1, Math.round(c.share * 100))}% of the busiest)`;
    const k = `${Math.round(c.areaKm2 / 1000).toLocaleString('en-GB')}k km²`;
    return c.kind === 'superstrate' ? `${esc(nm(c.a))} rules ${esc(nm(c.b))} speakers, ${k}` : `${esc(nm(c.a))} speakers switch to ${esc(nm(c.b))}, ${k}`;
}

function langColour(F, id) {
    return Object.values(F.langs).find((l) => l.id === id)?.color ?? '#999';
}

// --- clashes and keyframes ----------------------------------------------------------------

function renderClashes(body, ctx, S) {
    const groups = [
        ['map-before-birth', 'On the map before the tree has it born'],
        ['map-after-death', 'On the map after the tree has it die'],
        ['never-on-map', 'Living on the tree, but on no map'],
        ['family-map', 'In 1765, the commoners on the map against your language-family map'],
        ['placed', 'Placed by the app in 1765: languages with no country in the chart (check them)'],
    ];
    body.innerHTML = groups.map(([k, t]) => {
        const rows = S.clashes.filter((c) => c.kind === k);
        return `<h4 class="ty-head">${esc(t)} <span class="hint">${rows.length}</span></h4>
          ${k === 'never-on-map' ? '<div class="hint">Usually minority languages inside a bigger civilisation: paint them in a keyframe to put them on the map.</div>' : ''}
          ${k === 'family-map' ? '<div class="hint">Countries where the 1765 commoners keyframe differs from your Distribution of the Major Language Families map: a repaint, or a map newer than the keyframe (delete the keyframe to make it again).</div>' : ''}
          ${k === 'placed' ? '<div class="hint">Each takes a share of its nearest relative\'s land, where its name points (Southwestern = south-west), else spread out. Repaint the 1765 commoners keyframe to put any of them right.</div>' : ''}
          <table class="hist-table">${rows.sort((a, b) => (b.distance ?? 0) - (a.distance ?? 0)).map((c) => `<tr><td>${c.id ? `<button class="linklike" data-focus-lang="${esc(c.id)}">${esc(c.name)}</button>` : esc(c.name)}</td><td class="hint">${esc(c.note)}</td></tr>`).join('')}</table>`;
    }).join('');
}

function renderKeyframes(body, ctx, S) {
    const F = S.frames;
    const kfs = Object.values(F.meta.keyframes).sort((a, b) => (a.layer === b.layer ? b.year - a.year : a.layer === 'commoners' ? -1 : 1));
    const years = F.meta.years;
    const KIND = { 'family-map': 'from your family map', official: 'from the official languages', starter: 'the app\'s starter', yours: 'yours' };
    const mine = kfs.filter((k) => k.layer === 'commoners' && k.kind === 'yours').length;
    body.innerHTML = `
      <div class="hist-help">
        <p><b>The commoners' map is made from keyframes only</b>: what ordinary people speak, painted in Paint.NET, in <code>data/language-maps/</code> in the language-tree folder.</p>
        <ul>
          <li><b>1765</b> is your family map, each branch as the language of that branch its country speaks (the nearest country's where it has none).</li>
          <li><b>Starters</b> every 100 years back from 1765 are the app's: each place keeps its later language's line; where your yearly maps show that family arriving, its people spoke the earlier rulers' language if those held it about 300 years, else a language now lost (grey).</li>
          <li>Between two keyframes that disagree about a place, it switches once its new language's family has ruled it for about 300 years (varied by district), always between the two; with no such rulers, halfway.</li>
        </ul>
        <ol>
          <li>Open any keyframe below in Paint.NET and repaint what is wrong, using exactly the colours in the key (pick them from the map with the colour picker). Leave the sea and the greys alone; grey means a language now lost.</li>
          <li>Save it as PNG, then press <b>Apply changes</b>. A keyframe you have changed is yours: the app never writes over it, and the starters before it are worked out again from yours.</li>
          <li>To get a fresh starter, delete the file and apply changes. To add a year of your own, save a copy as <code>&lt;year&gt; AFA - commoners.png</code> (or BFA).</li>
        </ol>
        <p>The rulers' layer is the civilisations on your yearly maps. To change a civilisation's language, use <b>Civilisations</b>; for a whole year, make a rulers' starter here and paint it.</p>
      </div>
      <div class="views-controls">
        <label>Rulers' starter for <select id="kf-year">${years.slice().reverse().map((y) => `<option value="${y}">${label(y)}</option>`).join('')}</select></label>
        <button class="btn" id="kf-make">Make a rulers' starter</button> <span id="kf-msg" class="hint"></span>
      </div>
      <h4 class="ty-head">Keyframes <span class="hint">${kfs.length}, ${mine} of the commoners' yours</span></h4>
      ${kfs.length ? `<table class="hist-table">${kfs.map((k) => `<tr><td>${label(k.year)}</td><td>${esc(k.layer)}</td><td>${esc(KIND[k.kind] || 'yours')}</td><td><code>${esc(k.file)}</code></td><td class="hint">${k.painted.toLocaleString('en-GB')} pixels of language</td>
        <td>${k.unknown.length ? `<span class="warn">${k.unknown.length} colours not in the key: ${k.unknown.slice(0, 8).map((u) => `<i class="sw" style="background:${u.rgb}"></i>${u.rgb}`).join(' ')}</span>` : 'all colours known'}</td></tr>`).join('')}</table>` : '<div class="hint">None yet: press Apply changes.</div>'}
      <h4 class="ty-head">Key: the paint colour of each language</h4>
      <div class="kf-key">${Object.values(F.langs).sort((a, b) => a.family.localeCompare(b.family) || a.name.localeCompare(b.name)).map((l) => `<span title="${esc(l.family)}"><i class="sw" style="background:${l.key}"></i>${esc(l.name)} <code>${l.key}</code></span>`).join('')}</div>`;
    body.querySelector('#kf-make').addEventListener('click', async () => {
        const y = +body.querySelector('#kf-year').value;
        const msg = body.querySelector('#kf-msg');
        msg.textContent = 'Painting the starter…';
        const r = await fetch('/api/history/starter', { method: 'POST', body: JSON.stringify({ year: y, layer: 'rulers' }) }).then((x) => x.json()).catch((e) => ({ log: e.message }));
        msg.textContent = r.ok ? `Written: data/language-maps/${label(y)} - rulers.png. Open it in Paint.NET.` : (r.log || r.error || 'failed').split('\n').filter(Boolean).pop();
    });
}
