// App bootstrap and state owner. Everything flows one way:
//   events mutate `state` -> requestRender() redraws the SVG -> renderPanel()
// The data file on disk is the source of truth; saves go through the server
// (PUT /api/data with baseRev) and external edits arrive back via SSE.

import { validateDoc } from './validate.js';
import { buildModel } from './model.js';
import { computeLayout, BOX_H, GUTTER_W } from './layout.js';
import { render } from './view.js';
import { renderPanel } from './panel.js';
import {
    openLanguageForm, openBorrowingForm, openSettingsForm,
    confirmDeleteLanguage, deleteBorrowing,
} from './forms.js';
import { fetchData, saveData, subscribeEvents, toast, downloadDoc } from './api.js';

const els = {
    svg: document.getElementById('tree'),
    viewport: document.getElementById('viewport'),
    panel: document.getElementById('panel'),
    emptyHint: document.getElementById('empty-hint'),
    banner: document.getElementById('banner'),
    docTitle: document.getElementById('doc-title'),
    status: document.getElementById('status-chip'),
    dlg: document.getElementById('dlg'),
    btnFit: document.getElementById('btn-fit'),
    btnAddRoot: document.getElementById('btn-add-root'),
    btnBorrow: document.getElementById('btn-borrow'),
    btnSettings: document.getElementById('btn-settings'),
    btnDownload: document.getElementById('btn-download'),
    btnTheme: document.getElementById('btn-theme'),
};

const VIEW_KEY = 'andah-langtree-view-v1';
const ZOOM_MIN = 0.02, ZOOM_MAX = 96;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const state = {
    doc: null,
    rev: 0,
    model: null,
    layout: null,
    view: { pxPerYear: 0.5, panX: 0, panY: 120 },
    selectedId: null,
    hasView: false,
};

let w = 0, h = 0;

// --- rendering -----------------------------------------------------------

let rafPending = false;
function requestRender() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
        rafPending = false;
        if (!state.model) return;
        render(els.svg, {
            model: state.model,
            layout: state.layout,
            view: state.view,
            config: state.doc?.config,
            selectedId: state.selectedId,
            w, h,
        });
    });
}

function renderPanelNow() {
    if (!state.model) return;
    renderPanel(els.panel, { model: state.model, config: state.doc?.config, selectedId: state.selectedId });
}

function setStatus(text) { els.status.textContent = text; }
const timeNow = () => new Date().toLocaleTimeString();

// --- data lifecycle ------------------------------------------------------

function rebuild() {
    const errors = validateDoc(state.doc);
    if (errors.length) {
        showValidationBanner(errors);
        return;
    }
    hideBanner();
    state.model = buildModel(state.doc);
    state.layout = computeLayout(state.model);
    if (state.selectedId && !state.model.byId.has(state.selectedId)) {
        state.selectedId = null;
        toast('The selected language no longer exists.', 'err');
    }
    els.docTitle.textContent = state.doc.config?.title ?? '';
    els.emptyHint.hidden = state.model.languages.length > 0;
    els.emptyHint.textContent = 'No languages yet — click “+ Root language”, or ask Claude to add a family to data/languages.json.';
    if (!state.hasView) { restoreOrFit(); state.hasView = true; }
    clampView();
    requestRender();
    renderPanelNow();
}

async function reload(reason) {
    const res = await fetchData();
    if (res.status === 200 && res.body?.doc) {
        state.rev = res.body.rev;
        state.doc = res.body.doc;
        rebuild();
        if (reason === 'external') setStatus(`Reloaded from disk ${timeNow()}`);
        else if (reason === 'initial') setStatus(`Loaded ${timeNow()}`);
        return true;
    }
    if (res.status === 500 && res.body) { showRecoveryBanner(res.body); setStatus('Data file unreadable'); return false; }
    setStatus('Server unreachable');
    showServerDownBanner();
    return false;
}

// The server broadcasts an SSE event just before answering a PUT, so the saving
// client would see its own save as an "external change" and reload redundantly.
// Guard: while a save is in flight, defer events, then reconcile against the
// post-save rev.
let savingInFlight = false;
let deferredEventRev = 0;

function onServerEvent(ev) {
    if (!Number.isInteger(ev.rev)) return;
    if (savingInFlight) { deferredEventRev = Math.max(deferredEventRev, ev.rev); return; }
    if (ev.rev <= state.rev) return;
    reload('external');
}

async function saveFromUi(newDoc) {
    const errors = validateDoc(newDoc);
    if (errors.length) return { ok: false, errors };
    savingInFlight = true;
    let out;
    try {
        const res = await saveData(state.rev, newDoc);
        if (res.status === 200 && Number.isInteger(res.body?.rev)) {
            state.rev = res.body.rev;
            state.doc = newDoc;
            rebuild();
            setStatus(`Saved ${timeNow()}`);
            toast('Saved — backup kept.');
            out = { ok: true };
        } else if (res.status === 400) {
            out = { ok: false, errors: res.body?.errors ?? [{ path: '', message: 'The server rejected the save.' }] };
        } else if (res.status === 409) {
            toast('The file changed on disk — reloaded. Please re-apply your edit.', 'err');
            await reload('external');
            out = { ok: false, conflict: true };
        } else {
            toast('Could not reach the local server — is it still running?', 'err');
            out = { ok: false, errors: [{ path: '', message: 'Server unreachable.' }] };
        }
    } finally {
        savingInFlight = false;
        const deferred = deferredEventRev;
        deferredEventRev = 0;
        if (deferred > state.rev) reload('external');
    }
    return out;
}

const appApi = () => ({
    getDoc: () => state.doc,
    getModel: () => state.model,
    save: saveFromUi,
    select,
    toast,
});

// --- banners -------------------------------------------------------------

function hideBanner() { els.banner.hidden = true; els.banner.innerHTML = ''; }

function showValidationBanner(errors) {
    els.banner.hidden = false;
    els.banner.innerHTML =
        `<b>data/languages.json has ${errors.length} problem${errors.length === 1 ? '' : 's'}:</b>` +
        `<ul>${errors.slice(0, 12).map(e => `<li><code>${esc(e.path)}</code> ${esc(e.message)}</li>`).join('')}</ul>` +
        (errors.length > 12 ? `<div>…and ${errors.length - 12} more.</div>` : '') +
        `<div class="hint">Fix the file in your editor — the app reloads automatically when you save. (\`npm run validate\` checks it from the terminal.)</div>`;
}

function showRecoveryBanner(body) {
    els.banner.hidden = false;
    els.banner.innerHTML =
        `<b>data/languages.json could not be read.</b>` +
        `<div><code>${esc(body.error ?? 'Parse error')}</code></div>` +
        `<div class="hint">Fix the JSON in your editor, or copy a backup over it:</div>` +
        `<ul>${(body.backups ?? []).map(b => `<li><code>${esc(b)}</code></li>`).join('') || '<li>(no backups yet)</li>'}</ul>` +
        `<button class="btn" id="banner-retry">Retry</button>`;
    els.banner.querySelector('#banner-retry')?.addEventListener('click', () => reload('external'));
}

function showServerDownBanner() {
    els.banner.hidden = false;
    els.banner.innerHTML =
        `<b>Can’t reach the local server.</b>` +
        `<div class="hint">Start it with <code>start.bat</code> (or <code>npm start</code>) and reload this page.</div>` +
        `<button class="btn" id="banner-retry">Retry</button>`;
    els.banner.querySelector('#banner-retry')?.addEventListener('click', () => reload('initial'));
}

// --- view: fit / clamp / persistence ------------------------------------

function fitView() {
    if (!state.layout) return;
    const b = state.layout.bounds;
    const maxYear = Math.max(b.maxYear, state.doc?.config?.presentYear ?? b.maxYear);
    const span = Math.max(maxYear - b.minYear, 10);
    state.view.pxPerYear = clamp((h - 160) / span, ZOOM_MIN, ZOOM_MAX);
    state.view.panY = 60 - b.minYear * state.view.pxPerYear;
    const contentW = b.maxX - b.minX;
    const desired = GUTTER_W + Math.max(20, (w - GUTTER_W - contentW) / 2);
    state.view.panX = desired - b.minX;
}

function clampView() {
    if (!state.layout) return;
    const b = state.layout.bounds;
    const ppy = state.view.pxPerYear;
    const maxYear = Math.max(b.maxYear, state.doc?.config?.presentYear ?? b.maxYear);
    const yTop = b.minYear * ppy, yBot = maxYear * ppy + BOX_H;
    state.view.panY = clamp(state.view.panY, 80 - yBot, (h - 80) - yTop);
    state.view.panX = clamp(state.view.panX, 80 - b.maxX, (w - 80) - b.minX);
}

let viewSaveTimer = null;
function persistViewSoon() {
    clearTimeout(viewSaveTimer);
    viewSaveTimer = setTimeout(() => {
        try { localStorage.setItem(VIEW_KEY, JSON.stringify(state.view)); } catch { /* ignore */ }
    }, 300);
}

function restoreOrFit() {
    try {
        const v = JSON.parse(localStorage.getItem(VIEW_KEY));
        if (v && Number.isFinite(v.pxPerYear) && Number.isFinite(v.panX) && Number.isFinite(v.panY)) {
            state.view = {
                pxPerYear: clamp(v.pxPerYear, ZOOM_MIN, ZOOM_MAX),
                panX: v.panX,
                panY: v.panY,
            };
            return;
        }
    } catch { /* fall through to fit */ }
    fitView();
}

// --- selection -----------------------------------------------------------

function select(id) {
    state.selectedId = id ?? null;
    requestRender();
    renderPanelNow();
}

// --- events --------------------------------------------------------------

function wireEvents() {
    // Wheel: zoom the time axis anchored on the cursor (flight-cities-editor
    // formula, retargeted to pxPerYear); Shift or sideways delta pans X.
    els.viewport.addEventListener('wheel', (e) => {
        if (!state.layout) return;
        e.preventDefault();
        const r = els.viewport.getBoundingClientRect();
        const py = e.clientY - r.top;
        if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
            state.view.panX -= (e.deltaX || e.deltaY);
        } else {
            const v = state.view;
            const yearUnder = (py - v.panY) / v.pxPerYear;
            v.pxPerYear = clamp(v.pxPerYear * (e.deltaY < 0 ? 1.2 : 1 / 1.2), ZOOM_MIN, ZOOM_MAX);
            v.panY = py - yearUnder * v.pxPerYear;
        }
        clampView(); persistViewSoon(); requestRender();
    }, { passive: false });

    // Drag pan with a 3px click-vs-drag threshold (same idiom as the site tools).
    let dragging = false, moved = false, lx = 0, ly = 0;
    els.svg.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        dragging = true; moved = false; lx = e.clientX; ly = e.clientY;
        els.svg.setPointerCapture(e.pointerId);
        els.svg.classList.add('dragging');
    });
    els.svg.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const dx = e.clientX - lx, dy = e.clientY - ly;
        if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
        state.view.panX += dx; state.view.panY += dy;
        lx = e.clientX; ly = e.clientY;
        clampView(); persistViewSoon(); requestRender();
    });
    const endDrag = (e) => {
        dragging = false;
        els.svg.classList.remove('dragging');
        try { els.svg.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    };
    els.svg.addEventListener('pointerup', endDrag);
    els.svg.addEventListener('pointercancel', endDrag);
    els.svg.addEventListener('click', (e) => {
        if (moved) { moved = false; return; }
        const g = e.target.closest?.('[data-id]');
        select(g ? g.getAttribute('data-id') : null);
    });

    // Panel + toolbar actions (panel is stateless; actions route here).
    els.panel.addEventListener('click', (e) => {
        const selBtn = e.target.closest('[data-select]');
        if (selBtn) { select(selBtn.getAttribute('data-select')); return; }
        const actBtn = e.target.closest('[data-action]');
        if (actBtn) handleAction(actBtn.getAttribute('data-action'), actBtn);
    });

    els.btnFit.addEventListener('click', () => { fitView(); clampView(); persistViewSoon(); requestRender(); });
    els.btnAddRoot.addEventListener('click', () => openLanguageForm(appApi(), { mode: 'add-root' }));
    els.btnBorrow.addEventListener('click', () => openBorrowingForm(appApi(), { fromId: state.selectedId ?? undefined }));
    els.btnSettings.addEventListener('click', () => openSettingsForm(appApi()));
    els.btnDownload.addEventListener('click', () => { if (state.doc) downloadDoc(state.doc); });

    els.btnTheme.addEventListener('click', () => {
        const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        try { localStorage.setItem('andah-theme', next); } catch { /* ignore */ }
        applyThemeLabel();
    });
    applyThemeLabel();

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !els.dlg.open) select(null);
    });

    const measure = () => {
        const r = els.viewport.getBoundingClientRect();
        w = r.width; h = r.height;
    };
    measure();
    new ResizeObserver(() => { measure(); clampView(); requestRender(); }).observe(els.viewport);
}

function applyThemeLabel() {
    const t = document.documentElement.getAttribute('data-theme');
    els.btnTheme.textContent = t === 'dark' ? '☀ Light' : '☾ Dark';
}

function handleAction(action, btn) {
    const app = appApi();
    switch (action) {
        case 'add-root': openLanguageForm(app, { mode: 'add-root' }); break;
        case 'add-daughter': openLanguageForm(app, { mode: 'add-daughter', parentId: state.selectedId }); break;
        case 'add-stage': openLanguageForm(app, { mode: 'add-stage', parentId: state.selectedId }); break;
        case 'edit': openLanguageForm(app, { mode: 'edit', langId: state.selectedId }); break;
        case 'add-borrowing': openBorrowingForm(app, { fromId: state.selectedId ?? undefined }); break;
        case 'delete': confirmDeleteLanguage(app, state.selectedId); break;
        case 'delete-borrowing': deleteBorrowing(app, btn.getAttribute('data-bid')); break;
        case 'deselect': select(null); break;
    }
}

// --- boot ----------------------------------------------------------------

async function boot() {
    wireEvents();
    await reload('initial');
    subscribeEvents(onServerEvent);
}

boot();
