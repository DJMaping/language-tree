/**
 * The Views window: the whole world's languages at once.
 *
 * The chart and the panel look at one language at a time. These views compare
 * them all: maps of who speaks what and of typological features, a dashboard
 * of the families, relatedness measured from the words, a word across the
 * whole tree, a name forge, a dictionary, the web of contact, and snapshots of
 * any year. Opened from the top bar (or V), closed with Esc.
 *
 * Views that compare every language read data/views.json, precomputed by
 * `npm run views` because deriving all families takes half a minute; the
 * window says when it was built and warns when the chart has changed since.
 * The name forge and the dictionary derive the one language you pick, live.
 */

import { render as renderMap } from './views/map.js';
import { render as renderTypology } from './views/typology.js';
import { render as renderFamilies } from './views/families.js';
import { render as renderRelatedness } from './views/relatedness.js';
import { render as renderWords } from './views/words.js';
import { render as renderNames } from './views/names.js';
import { render as renderDictionary } from './views/dictionary.js';
import { render as renderContact } from './views/contact.js';
import { render as renderEras } from './views/eras.js';

export const TABS = [
    { id: 'map', label: 'Language map', render: renderMap, needs: ['shapes', 'atlas'] },
    { id: 'typology', label: 'Typology maps', render: renderTypology, needs: ['shapes', 'atlas', 'views'] },
    { id: 'families', label: 'Families', render: renderFamilies, needs: ['views'] },
    { id: 'relatedness', label: 'Measured relatedness', render: renderRelatedness, needs: ['views'] },
    { id: 'words', label: 'Word across the tree', render: renderWords, needs: ['views'] },
    { id: 'names', label: 'Name forge', render: renderNames, needs: [] },
    { id: 'dictionary', label: 'Dictionary', render: renderDictionary, needs: [] },
    { id: 'contact', label: 'Contact web', render: renderContact, needs: [] },
    { id: 'eras', label: 'Era snapshots', render: renderEras, needs: [] },
];

let app = null;
let host = null;
let current = 'map';
const data = {};
const tabState = {}; // per-tab remembered choices while the window is open

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Colours for the views. The chart's family colours come from eight CSS slots,
 * so fourteen families repeat; a map needs every family distinct. Hues are
 * spread round the wheel in the order of DJ's family registry.
 */
export function familyPalette(doc) {
    const fams = (doc.families || []).filter((f) => f.kind === 'family');
    const out = new Map();
    fams.forEach((f, i) => out.set(f.name, `hsl(${Math.round((i * 360) / fams.length + 12) % 360} 62% 52%)`));
    out.set('Lastnu', 'hsl(0 0% 45%)');
    return out;
}

/** A stable colour for any key (a cognate set, a branch): golden-angle hues. */
export function keyColor(key, sat = 60, light = 52) {
    let h = 0;
    for (const ch of String(key)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return `hsl(${Math.round((h * 137.508) % 360)} ${sat}% ${light}%)`;
}

/** The family a language belongs to, by name, through the registry. */
export function familyIndex(doc, model) {
    const nameByRoot = new Map((doc.families || []).map((f) => [f.rootId, f.name]));
    return (langId) => nameByRoot.get(model.familyRootOf.get(langId)) ?? null;
}

async function load(key) {
    if (data[key]) return data[key];
    const url = { shapes: 'data/canon/country-shapes.json', atlas: 'data/canon/people-atlas-languages.json', views: 'data/views.json' }[key];
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(key === 'views' ? 'data/views.json is missing: run npm run views.' : `${url} could not be loaded.`);
    data[key] = await res.json();
    return data[key];
}

/** Has the chart changed since views.json was built? Compares a hash of languages.json. */
async function staleness() {
    if (!data.views?.docHash || !crypto?.subtle) return null;
    try {
        const text = await (await fetch('data/languages.json', { cache: 'no-store' })).text();
        const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
        const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 12);
        return hex !== data.views.docHash;
    } catch { return null; }
}

export function initViews(appApi) {
    app = appApi;
    host = document.getElementById('views');
    host.addEventListener('click', (e) => {
        const tab = e.target.closest('[data-view-tab]');
        if (tab) { current = tab.getAttribute('data-view-tab'); draw(); return; }
        if (e.target.closest('[data-view-close]')) { closeViews(); return; }
        const go = e.target.closest('[data-focus-lang]');
        if (go) { const id = go.getAttribute('data-focus-lang'); closeViews(); app.focusLanguage(id); }
    });
}

export const isViewsOpen = () => !!host && !host.hidden;
export function openViews(tab) { if (!host) return; if (tab) current = tab; host.hidden = false; draw(); }
export function closeViews() { if (host) host.hidden = true; }

async function draw() {
    const tab = TABS.find((t) => t.id === current) || TABS[0];
    host.innerHTML = `<div class="views-window">
      <div class="views-bar">
        <b class="views-title">Views</b>
        ${TABS.map((t) => `<button class="views-tab${t.id === tab.id ? ' on' : ''}" data-view-tab="${t.id}">${esc(t.label)}</button>`).join('')}
        <span class="views-stamp" id="views-stamp"></span>
        <button class="btn btn-icon" data-view-close title="Close (Esc)" aria-label="Close">×</button>
      </div>
      <div class="views-body" id="views-body"><div class="hint">Loading…</div></div>
    </div>`;
    const body = host.querySelector('#views-body');
    try {
        for (const need of tab.needs) await load(need);
    } catch (err) {
        body.innerHTML = `<div class="views-empty">${esc(err.message)}</div>`;
        return;
    }
    const model = app.getModel();
    const doc = app.getDoc();
    if (!model || !doc) { body.innerHTML = '<div class="views-empty">The chart has not loaded yet.</div>'; return; }
    tabState[tab.id] ??= {};
    try {
        await tab.render(body, {
            model, doc, presentYear: doc.config.presentYear, state: tabState[tab.id],
            shapes: data.shapes, atlas: data.atlas, views: data.views,
            palette: familyPalette(doc), familyOf: familyIndex(doc, model),
            rerender: () => draw(),
        });
    } catch (err) {
        body.innerHTML = `<div class="views-empty">This view failed: ${esc(err.message)}</div>`;
        console.error(err);
    }
    if (tab.needs.includes('views') && data.views) {
        const stamp = host.querySelector('#views-stamp');
        const stale = await staleness();
        stamp.textContent = `views built ${data.views.generatedAt.slice(0, 16).replace('T', ' ')}${stale ? ' · the chart has changed since: run npm run views' : ''}`;
        stamp.classList.toggle('warn', !!stale);
    }
}
