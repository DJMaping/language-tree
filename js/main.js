// App bootstrap and state owner. Everything flows one way:
//   events mutate `state` -> requestRender() redraws the SVG -> renderPanel()
// The data file on disk is the source of truth; saves go through the server
// (PUT /api/data with baseRev) and external edits arrive back via SSE.
//
// v2 interaction model — the app behaves like a desktop program:
//   right-click        context menus (canvas: new language here; box: actions)
//   drag a box         move it in time (Ctrl = move its whole family)
//   drag its ● handle  branch a new daughter off at the drop year
//   double-click  edit details;  F2  rename in place;  Del deletes;  Ctrl+Z / Ctrl+Y undo/redo
//   Ctrl+S             everything already autosaves — this just reassures

import { validateDoc } from './validate.js';
import { buildModel } from './model.js';
import { computeLayout, BOX_W, BOX_H, COL_W, GUTTER_W } from './layout.js';
import { render } from './view.js';
import { renderPanel } from './panel.js';
import {
    openLanguageForm, openBorrowingForm, openEventForm, openSettingsForm,
    confirmDeleteLanguage, deleteBorrowing, deleteEvent, slugify,
} from './forms.js';
import { fetchData, saveData, subscribeEvents, toast, downloadDoc, openPolyglot } from './api.js';
import { showMenu, closeMenu } from './menu.js';
import { initSearch, openSearch, isSearchOpen, closeSearch } from './search.js';
import { exportSvg, exportPng } from './export.js';

const els = {
    svg: document.getElementById('tree'),
    viewport: document.getElementById('viewport'),
    panel: document.getElementById('panel'),
    emptyHint: document.getElementById('empty-hint'),
    banner: document.getElementById('banner'),
    docTitle: document.getElementById('doc-title'),
    status: document.getElementById('status-chip'),
    dlg: document.getElementById('dlg'),
    inlineName: document.getElementById('inline-name'),
    readout: document.getElementById('drag-readout'),
    btnUndo: document.getElementById('btn-undo'),
    btnRedo: document.getElementById('btn-redo'),
    btnFit: document.getElementById('btn-fit'),
    btnAddRoot: document.getElementById('btn-add-root'),
    btnBorrow: document.getElementById('btn-borrow'),
    btnSettings: document.getElementById('btn-settings'),
    btnDownload: document.getElementById('btn-download'),
    btnSearch: document.getElementById('btn-search'),
    btnScrub: document.getElementById('btn-scrub'),
    btnExport: document.getElementById('btn-export'),
    btnTheme: document.getElementById('btn-theme'),
};

const VIEW_KEY = 'andah-langtree-view-v1';
const COLLAPSE_KEY = 'andah-langtree-collapsed-v1';
const ZOOM_MIN = 0.02, ZOOM_MAX = 96;
// How far below the fit-to-content zoom the user may keep zooming out. 0.3 = the
// tree can shrink to ~a third of its fit height for a compact overview — but no
// further, so boxes (which also shrink, see view.js) never collide hard enough to
// drift off their true year.
const ZOOM_OUT_FACTOR = 0.3;
const HISTORY_MAX = 50;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const state = {
    doc: null,
    rev: 0,
    model: null,
    layout: null,
    view: { pxPerYear: 0.5, panX: 0, panY: 120 },
    selection: null,   // typed: { type: 'lang'|'borrowing'|'event', id } | null
    hoverId: null,
    highlight: null,   // { focusId, set } | null — lineage dim/highlight
    collapsed: loadCollapsed(),  // Set<langId> whose subtrees are folded
    scrub: null,       // { year } | null — year scrubber
    hasView: false,
    boxPos: null,      // last rendered id -> {x, y} (screen coords)
    pending: null,     // in-place creation: { relation, parentId?, born, worldX }
    handleDrag: null,  // live branch-off preview: { parentId, x, y }
    drag: null,        // live time-drag: { ids:Set, delta, shiftDied }
    reorder: null,     // live sibling reorder: { id, caretX, to } | null
    linkFrom: null,    // borrowing link mode: source language id
};

const selLangId = () => (state.selection?.type === 'lang' ? state.selection.id : null);

function loadCollapsed() {
    try {
        const arr = JSON.parse(localStorage.getItem(COLLAPSE_KEY));
        if (Array.isArray(arr)) return new Set(arr.filter(x => typeof x === 'string'));
    } catch { /* ignore */ }
    return new Set();
}

function persistCollapsed() {
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...state.collapsed])); } catch { /* ignore */ }
}

const history = { undo: [], redo: [] };

let w = 0, h = 0;

// --- rendering -----------------------------------------------------------

let rafPending = false;
function requestRender() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
        rafPending = false;
        if (!state.model) return;
        state.boxPos = render(els.svg, {
            model: state.model,
            layout: state.layout,
            view: state.view,
            config: state.doc?.config,
            selected: state.selection,
            hoverId: state.hoverId,
            highlight: state.highlight,
            scrub: state.scrub,
            pending: state.pending,
            handleDrag: state.handleDrag,
            drag: state.drag,
            reorder: state.reorder,
            fitZoom: fitZoom(),
            w, h,
        });
        updateHistoryButtons();
        positionInline();
    });
}

function renderPanelNow() {
    if (!state.model) return;
    state.model.collapsed = state.collapsed; // let the panel show collapse state
    renderPanel(els.panel, { model: state.model, config: state.doc?.config, selected: state.selection });
}

function setStatus(text) { els.status.textContent = text; }
const timeNow = () => new Date().toLocaleTimeString();

function flashSaved() {
    setStatus(`All changes saved ✓`);
    els.status.classList.remove('flash');
    void els.status.offsetWidth; // restart the animation
    els.status.classList.add('flash');
}

// --- data lifecycle ------------------------------------------------------

function rebuild() {
    const errors = validateDoc(state.doc);
    if (errors.length) {
        showValidationBanner(errors);
        return;
    }
    hideBanner();
    state.model = buildModel(state.doc);
    // Drop collapse ids that no longer exist, then lay out with the rest folded.
    for (const id of [...state.collapsed]) if (!state.model.byId.has(id)) state.collapsed.delete(id);
    state.layout = computeLayout(state.model, state.collapsed);
    // Prune a selection whose target vanished.
    if (state.selection) {
        const s = state.selection;
        const gone = (s.type === 'lang' && !state.model.byId.has(s.id))
            || (s.type === 'borrowing' && !state.model.borrowingById.has(s.id))
            || (s.type === 'event' && !state.model.eventById.has(s.id));
        if (gone) state.selection = null;
    }
    // Recompute the lineage highlight against the fresh model.
    refreshHighlight();
    els.docTitle.textContent = state.doc.config?.title ?? '';
    els.emptyHint.hidden = state.model.languages.length > 0;
    els.emptyHint.textContent = 'No languages yet — right-click anywhere and choose “New language here”, or ask Claude to add a family to data/languages.json.';
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
        if (reason === 'external') {
            // The on-disk truth moved (VS Code / Claude edit): session undo
            // snapshots would clobber those edits wholesale, so drop them.
            history.undo.length = 0;
            history.redo.length = 0;
        }
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

async function saveFromUi(newDoc, { record = true } = {}) {
    const errors = validateDoc(newDoc);
    if (errors.length) return { ok: false, errors };
    const before = state.doc;
    savingInFlight = true;
    let out;
    try {
        const res = await saveData(state.rev, newDoc);
        if (res.status === 200 && Number.isInteger(res.body?.rev)) {
            state.rev = res.body.rev;
            state.doc = newDoc;
            if (record) {
                history.undo.push(before);
                if (history.undo.length > HISTORY_MAX) history.undo.shift();
                history.redo.length = 0;
            }
            rebuild();
            setStatus(`Saved ${timeNow()}`);
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

// Clone-mutate-save helper for all direct-manipulation edits. `fn` mutates the
// cloned doc in place and may return extras (e.g. { selectId }); the first
// validation error is toasted so gestures fail loudly but harmlessly.
async function applyEdit(fn, opts) {
    const newDoc = structuredClone(state.doc);
    const extra = fn(newDoc) ?? {};
    const res = await saveFromUi(newDoc, opts);
    if (!res.ok && res.errors?.length) toast(res.errors[0].message, 'err');
    return { ...res, ...extra };
}

function updateHistoryButtons() {
    if (els.btnUndo) els.btnUndo.disabled = history.undo.length === 0;
    if (els.btnRedo) els.btnRedo.disabled = history.redo.length === 0;
}

async function undo() {
    if (!history.undo.length) { toast('Nothing to undo.'); return; }
    const target = history.undo.pop();
    const current = state.doc;
    const res = await saveFromUi(target, { record: false });
    if (res.ok) { history.redo.push(current); setStatus(`Undone ${timeNow()}`); }
    else history.undo.push(target);
}

async function redo() {
    if (!history.redo.length) { toast('Nothing to redo.'); return; }
    const target = history.redo.pop();
    const current = state.doc;
    const res = await saveFromUi(target, { record: false });
    if (res.ok) { history.undo.push(current); setStatus(`Redone ${timeNow()}`); }
    else history.redo.push(target);
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

// The zoom at which the whole tree just fills the viewport (oldest to present).
function fitZoom() {
    if (!state.layout) return state.view.pxPerYear || 0.5;
    const b = state.layout.bounds;
    const maxYear = Math.max(b.maxYear, state.doc?.config?.presentYear ?? b.maxYear);
    const span = Math.max(maxYear - b.minYear, 10);
    return clamp((h - 160) / span, ZOOM_MIN, ZOOM_MAX);
}

// The furthest-out zoom we allow: a fraction of fit, never below the hard floor.
function zoomFloor() { return clamp(fitZoom() * ZOOM_OUT_FACTOR, ZOOM_MIN, ZOOM_MAX); }

function fitView() {
    if (!state.layout) return;
    const b = state.layout.bounds;
    state.view.pxPerYear = fitZoom();
    state.view.panY = 60 - b.minYear * state.view.pxPerYear;
    const contentW = b.maxX - b.minX;
    const desired = GUTTER_W + Math.max(20, (w - GUTTER_W - contentW) / 2);
    state.view.panX = desired - b.minX;
}

function fitAndRender() { fitView(); clampView(); persistViewSoon(); requestRender(); }

function clampView() {
    if (!state.layout) return;
    const b = state.layout.bounds;
    state.view.pxPerYear = clamp(state.view.pxPerYear, zoomFloor(), ZOOM_MAX);
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

// --- selection / hover ---------------------------------------------------

// Accepts a typed selection object, or a bare id/null (treated as a language)
// for back-compat with the forms and gesture code.
function select(sel) {
    if (sel == null) state.selection = null;
    else if (typeof sel === 'string') state.selection = { type: 'lang', id: sel };
    else state.selection = sel;
    refreshHighlight();
    requestRender();
    renderPanelNow();
}

function setHover(id) {
    if (state.hoverId === id) return;
    state.hoverId = id;
    refreshHighlight();
    requestRender();
}

// The lineage highlight follows the hovered box, else the selected language.
function refreshHighlight() {
    if (!state.model) { state.highlight = null; return; }
    const focusId = state.hoverId ?? selLangId();
    if (focusId && state.model.byId.has(focusId)) {
        state.highlight = { focusId, set: state.model.lineageOf(focusId) };
    } else {
        state.highlight = null;
    }
}

// --- collapse / focus / keyboard navigation ------------------------------

function toggleCollapse(id) {
    if (!state.model?.byId.has(id)) return;
    if (state.collapsed.has(id)) state.collapsed.delete(id);
    else state.collapsed.add(id);
    persistCollapsed();
    state.layout = computeLayout(state.model, state.collapsed);
    // If the current selection just got hidden, fall back to the collapsed root.
    if (selLangId() && !state.layout.pos.has(selLangId())) select({ type: 'lang', id });
    clampView();
    requestRender();
    renderPanelNow();
}

// Expand every collapsed ancestor so `id` becomes visible again.
function expandAncestors(id) {
    let changed = false;
    let cur = state.model.byId.get(id);
    // Any collapsed language on the path up (primary parents + earlier stages) hides id.
    const path = [];
    while (cur) {
        path.push(cur.id);
        cur = cur.parentId != null ? state.model.byId.get(cur.parentId) : null;
    }
    for (const pid of path) {
        if (pid !== id && state.collapsed.has(pid)) { state.collapsed.delete(pid); changed = true; }
    }
    if (changed) {
        persistCollapsed();
        state.layout = computeLayout(state.model, state.collapsed);
    }
    return changed;
}

// Center a language on screen and select it (used by search + keyboard nav).
function focusLanguage(id, { select: doSelect = true } = {}) {
    if (!state.model?.byId.has(id)) return;
    expandAncestors(id);
    // Make sure the box is readable.
    if (state.view.pxPerYear < 0.2) state.view.pxPerYear = 0.2;
    const p = state.layout.pos.get(id);
    const lang = state.model.byId.get(id);
    if (p) {
        state.view.panX = w * 0.42 - p.x;
        state.view.panY = h * 0.36 - lang.born * state.view.pxPerYear;
    }
    clampView();
    persistViewSoon();
    if (doSelect) select({ type: 'lang', id });
    else { requestRender(); renderPanelNow(); }
}

// Arrow-key movement from the selected language.
function navigate(dir) {
    const id = selLangId();
    if (!id) {
        if (state.model?.roots.length) focusLanguage(state.model.roots[0].id);
        return;
    }
    const model = state.model;
    const l = model.byId.get(id);
    if (!l) return;
    let target = null;
    if (dir === 'down') {
        target = model.stageChild.get(id)?.id
            ?? (model.branchChildren.get(id) ?? [])[0]?.id ?? null;
    } else if (dir === 'up') {
        target = l.parentId != null && model.byId.has(l.parentId) ? l.parentId : null;
    } else if (dir === 'left' || dir === 'right') {
        const sibs = model.siblingsOf(id);
        const i = sibs.findIndex(s => s.id === id);
        if (i !== -1) {
            const j = dir === 'left' ? i - 1 : i + 1;
            if (j >= 0 && j < sibs.length) target = sibs[j].id;
        }
    }
    if (target) focusLanguage(target);
}

// --- year scrubber -------------------------------------------------------

function toggleScrub() {
    if (state.scrub) {
        state.scrub = null;
    } else {
        // Start at the year currently at viewport center.
        const year = Math.round((h / 2 - state.view.panY) / state.view.pxPerYear);
        state.scrub = { year };
    }
    els.btnScrub?.setAttribute('aria-pressed', state.scrub ? 'true' : 'false');
    requestRender();
}

// --- image export --------------------------------------------------------

async function doExport(fmt) {
    if (!state.model) return;
    try {
        if (fmt === 'png') await exportPng(state);
        else exportSvg(state);
        toast(`Exported ${fmt.toUpperCase()}.`);
    } catch (e) {
        toast(`Export failed: ${e.message}`, 'err');
    }
}

// Small format picker for the panel "Export image…" button.
function openExportChoice() {
    els.dlg.innerHTML = `<h2>Export image</h2>
        <p class="hint">Saves the whole tree (current collapse state, no selection) as a standalone file.</p>
        <div class="dlg-buttons">
            <button class="btn" type="button" data-close>Cancel</button>
            <button class="btn" type="button" data-fmt="png">PNG</button>
            <button class="btn" type="button" data-fmt="svg">SVG</button>
        </div>`;
    els.dlg.querySelector('[data-close]')?.addEventListener('click', () => els.dlg.close());
    els.dlg.querySelectorAll('[data-fmt]').forEach(b =>
        b.addEventListener('click', () => { els.dlg.close(); doExport(b.getAttribute('data-fmt')); }));
    els.dlg.showModal();
}

// --- helpers -------------------------------------------------------------

const yearAt = py => (py - state.view.panY) / state.view.pxPerYear;

function vpPoint(e) {
    const r = els.viewport.getBoundingClientRect();
    return { px: e.clientX - r.left, py: e.clientY - r.top };
}

// A language plus all its descendants (stage successors and branch daughters).
function subtreeIds(id) {
    const out = [id];
    for (let i = 0; i < out.length; i++) {
        const cur = out[i];
        const sc = state.model.stageChild.get(cur);
        if (sc) out.push(sc.id);
        for (const c of state.model.branchChildren.get(cur) ?? []) out.push(c.id);
    }
    return out;
}

function showReadout(px, py, text) {
    els.readout.hidden = false;
    els.readout.textContent = text;
    els.readout.style.left = `${px + 16}px`;
    els.readout.style.top = `${py + 16}px`;
}

function hideReadout() { els.readout.hidden = true; }

// --- inline name editing (rename + in-place creation) --------------------

let inline = null; // { mode: 'create' } | { mode: 'rename', id }

function positionInline() {
    if (!inline) return;
    let x, y;
    if (inline.mode === 'create' && state.pending) {
        x = state.pending.worldX + state.view.panX;
        y = state.pending.born * state.view.pxPerYear + state.view.panY;
    } else if (inline.mode === 'rename') {
        const b = state.boxPos?.get(inline.id);
        if (!b) { hideInline(); return; }
        x = b.x; y = b.y;
    } else return;
    els.inlineName.style.left = `${x - BOX_W / 2 + 5}px`;
    els.inlineName.style.top = `${y + 4}px`;
    els.inlineName.style.width = `${BOX_W - 10}px`;
}

function showInline(mode, prefill) {
    inline = mode;
    els.inlineName.hidden = false;
    els.inlineName.value = prefill ?? '';
    positionInline();
    els.inlineName.focus();
    els.inlineName.select();
}

function hideInline() { inline = null; els.inlineName.hidden = true; }

function beginRename(id) {
    const l = state.model?.byId.get(id);
    if (!l) return;
    cancelPending();
    select(id);
    showInline({ mode: 'rename', id }, l.name);
}

function startPending(spec) {
    cancelPending();
    cancelLink();
    state.pending = spec;
    requestRender();
    showInline({ mode: 'create' }, '');
}

// Returns true if something was cancelled (used by the Esc cascade).
function cancelPending() {
    const had = !!(state.pending || inline);
    state.pending = null;
    hideInline();
    if (had) requestRender();
    return had;
}

async function commitInline() {
    if (!inline) return;
    const name = els.inlineName.value.trim();

    if (inline.mode === 'rename') {
        const id = inline.id;
        hideInline();
        const cur = state.model?.byId.get(id);
        if (!name || !cur || cur.name === name) return;
        await applyEdit(doc => {
            const l = doc.languages.find(x => x.id === id);
            if (l) l.name = name;
        });
        return;
    }

    const p = state.pending;
    state.pending = null;
    hideInline();
    requestRender();
    if (!p || !name) return;
    const res = await applyEdit(doc => {
        const taken = new Set(doc.languages.map(l => l.id));
        const lang = { id: slugify(name, taken), name, born: p.born };
        if (p.relation !== 'root') {
            lang.parentId = p.parentId;
            lang.relation = p.relation;
        }
        doc.languages.push(lang);
        // Same convention as the stage form: the previous stage ends where the new one begins.
        if (p.relation === 'stage') {
            const par = doc.languages.find(x => x.id === p.parentId);
            if (par) par.died = p.born;
        }
        return { selectId: lang.id };
    });
    if (res.ok && res.selectId) select(res.selectId);
}

// --- borrowing link mode -------------------------------------------------

function startLink(fromId) {
    cancelPending();
    state.linkFrom = fromId;
    els.viewport.classList.add('link-mode');
    const name = state.model.byId.get(fromId)?.name ?? fromId;
    setStatus('Pick the borrowing language…');
    toast(`Now click the language that borrowed from ${name} (Esc cancels).`);
}

function cancelLink() {
    if (!state.linkFrom) return false;
    state.linkFrom = null;
    els.viewport.classList.remove('link-mode');
    setStatus('');
    return true;
}

function finishLink(toId) {
    const fromId = state.linkFrom;
    cancelLink();
    openBorrowingForm(appApi(), { fromId, toId });
}

// --- gestures: pan / time-drag / branch handle / click -------------------

let gesture = null;
let suppressClick = false;

function onPointerDown(e) {
    if (e.button !== 0 || !state.model) return;
    closeMenu();
    const scrubEl = e.target.closest?.('[data-scrub]');
    const handleEl = e.target.closest?.('.branch-handle');
    const boxEl = e.target.closest?.('[data-id]');
    if (scrubEl && state.scrub) {
        gesture = { type: 'scrub' };
        els.svg.setPointerCapture(e.pointerId);
        return;
    }
    if (handleEl) {
        const { px, py } = vpPoint(e);
        gesture = { type: 'handle', parentId: handleEl.getAttribute('data-handle'), moved: false, startX: px, startY: py };
    } else if (boxEl && !state.linkFrom && !state.pending) {
        const id = boxEl.getAttribute('data-id');
        const lang = state.model.byId.get(id);
        if (!lang) return;
        gesture = { type: 'box', id, lang, moved: false, downX: e.clientX, downY: e.clientY };
    } else {
        gesture = { type: 'pan', lastX: e.clientX, lastY: e.clientY, dist: 0 };
        els.svg.classList.add('dragging');
    }
    els.svg.setPointerCapture(e.pointerId);
}

function onPointerMove(e) {
    if (!gesture) {
        const handleEl = e.target.closest?.('.branch-handle');
        const boxEl = e.target.closest?.('[data-id]');
        setHover(handleEl ? handleEl.getAttribute('data-handle') : boxEl ? boxEl.getAttribute('data-id') : null);
        return;
    }
    const { px, py } = vpPoint(e);

    if (gesture.type === 'scrub') {
        state.scrub = { year: Math.round(yearAt(py)) };
        requestRender();
        return;
    }

    if (gesture.type === 'pan') {
        const dx = e.clientX - gesture.lastX, dy = e.clientY - gesture.lastY;
        gesture.dist += Math.abs(dx) + Math.abs(dy);
        if (gesture.dist > 3) gesture.moved = true;
        state.view.panX += dx; state.view.panY += dy;
        gesture.lastX = e.clientX; gesture.lastY = e.clientY;
        clampView(); persistViewSoon(); requestRender();
        return;
    }

    if (gesture.type === 'box') {
        const dx = e.clientX - gesture.downX, dy = e.clientY - gesture.downY;
        if (!gesture.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
        if (!gesture.moved) {
            gesture.moved = true;
            // Lock to the dominant axis for the rest of the gesture. Sideways =
            // reorder among siblings, but only for a language that has siblings
            // to reorder among (branch daughters + family roots, never a
            // mid-chain stage, which is glued to its column).
            const ri = reorderInfo(gesture.id);
            gesture.axis = (ri && Math.abs(dx) > Math.abs(dy)) ? 'x' : 'y';
            gesture.reorderCtx = ri;
        }
        if (gesture.axis === 'x') { reorderMove(gesture, px, py); return; }

        const lang = gesture.lang;
        const subtree = e.ctrlKey;
        const ids = subtree ? subtreeIds(lang.id) : [lang.id];
        // Chain semantics: a language with a stage successor is glued to it at
        // its death year, so a plain drag moves its birth only.
        const hasStageSucc = state.model.stageChild.has(lang.id);
        const shiftDied = subtree || !hasStageSucc;
        let delta = Math.round(dy / state.view.pxPerYear);
        if (!shiftDied && lang.died != null) delta = Math.min(delta, lang.died - lang.born);
        const parent = lang.parentId != null ? state.model.byId.get(lang.parentId) : null;
        if (parent) {
            const minBorn = lang.relation === 'stage' ? parent.born + 1 : parent.born;
            delta = Math.max(delta, minBorn - lang.born);
        }
        state.drag = { ids: new Set(ids), delta, shiftDied };
        showReadout(px, py, `Born ${lang.born + delta}${subtree ? ' · moving whole family' : ''}`);
        requestRender();
        return;
    }

    if (gesture.type === 'handle') {
        if (!gesture.moved && Math.hypot(px - gesture.startX, py - gesture.startY) < 6) return;
        gesture.moved = true;
        const parent = state.model.byId.get(gesture.parentId);
        let born = Math.round(yearAt(py));
        if (parent) born = Math.max(born, parent.born);
        gesture.born = born;
        state.handleDrag = { parentId: gesture.parentId, x: px, y: py };
        showReadout(px, py, `New daughter · born ${born}`);
        requestRender();
    }
}

async function onPointerUp(e) {
    if (!gesture) return;
    const g = gesture;
    gesture = null;
    els.svg.classList.remove('dragging');
    try { els.svg.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    hideReadout();
    if (g.moved) suppressClick = true;

    if (g.type === 'scrub') { suppressClick = true; return; }

    if (g.type === 'box' && g.moved) {
        if (g.axis === 'x') { await commitReorder(g.id, g.reorderCtx, g.reorderTo); return; }
        const drag = state.drag;
        state.drag = null;
        if (drag && drag.delta !== 0) await commitMove(g.lang, drag);
        else requestRender();
        return;
    }
    if (g.type === 'handle') {
        state.handleDrag = null;
        if (g.moved && g.born != null) {
            const { px } = vpPoint(e);
            startPending({ relation: 'branch', parentId: g.parentId, born: g.born, worldX: px - state.view.panX });
        } else {
            requestRender();
        }
    }
}

async function commitMove(lang, drag) {
    // If this language is a stage glued to its predecessor (parent.died ===
    // born), the boundary moves with it.
    const glue = (lang.relation === 'stage' && lang.parentId != null)
        ? (() => {
            const p = state.model.byId.get(lang.parentId);
            return p && p.died === lang.born && !drag.ids.has(p.id) ? { id: p.id } : null;
        })()
        : null;
    const res = await applyEdit(doc => {
        for (const l of doc.languages) {
            if (!drag.ids.has(l.id)) continue;
            l.born += drag.delta;
            if (drag.shiftDied && l.died != null) l.died += drag.delta;
        }
        if (glue) {
            const p = doc.languages.find(x => x.id === glue.id);
            if (p) p.died += drag.delta;
        }
    });
    if (!res.ok) requestRender(); // snap back to the untouched doc
}

// --- sibling reorder (sideways box drag) ---------------------------------

// The reorderable siblings of a language, in the order the layout packs them,
// or null when it can't be reordered. A language is reorderable iff it appears
// among its own siblings (branch daughters and family roots do; a mid-chain
// stage does not — it is pinned to its chain's column) and has a peer to swap
// with.
function reorderInfo(id) {
    const sibs = state.model.siblingsOf(id);
    const idx = sibs.findIndex(s => s.id === id);
    if (idx === -1 || sibs.length < 2) return null;
    return { sibs, idx };
}

// Live preview: pick the insertion slot from the pointer's world-x and stash a
// caret x (screen space) between the two sibling columns it would drop between.
function reorderMove(gesture, px, py) {
    const { sibs, idx } = gesture.reorderCtx;
    const wx = px - state.view.panX; // pointer world-x (screenX = worldX + panX)
    const others = sibs.filter((_, i) => i !== idx);
    const centers = others.map(s => state.layout.pos.get(s.id)?.x ?? 0);
    let to = 0;
    while (to < centers.length && centers[to] < wx) to++;
    let caretWX;
    if (!centers.length) caretWX = wx;
    else if (to === 0) caretWX = centers[0] - COL_W / 2;
    else if (to === centers.length) caretWX = centers[centers.length - 1] + COL_W / 2;
    else caretWX = (centers[to - 1] + centers[to]) / 2;
    gesture.reorderTo = to;
    state.reorder = { id: gesture.id, caretX: caretWX + state.view.panX, to };
    showReadout(px, py, to >= others.length
        ? 'Reorder → drop at the right end'
        : `Reorder → drop before ${others[to].name}`);
    requestRender();
}

// Commit: renumber the sibling group's `order` so the dragged language lands at
// the target slot. The leftmost keeps the default (no `order`) to stay minimal.
async function commitReorder(id, ctx, to) {
    state.reorder = null;
    if (!ctx || to == null) { requestRender(); return; }
    const { sibs, idx } = ctx;
    const others = sibs.filter((_, i) => i !== idx);
    const newSeq = [...others.slice(0, to), sibs[idx], ...others.slice(to)];
    if (newSeq.every((s, i) => s.id === sibs[i].id)) { requestRender(); return; } // unchanged
    const ids = newSeq.map(s => s.id);
    await applyEdit(doc => {
        ids.forEach((sid, i) => {
            const l = doc.languages.find(x => x.id === sid);
            if (!l) return;
            if (i === 0) delete l.order; // 0 is the default — keep the JSON tidy
            else l.order = i;
        });
    });
}

function onClick(e) {
    if (suppressClick) { suppressClick = false; return; }
    // A collapse badge toggles rather than selects.
    const badge = e.target.closest?.('[data-collapse]');
    if (badge) { toggleCollapse(badge.getAttribute('data-collapse')); return; }

    const boxEl = e.target.closest?.('[data-id]');
    const id = boxEl ? boxEl.getAttribute('data-id') : null;
    if (state.linkFrom) {
        if (id && id !== state.linkFrom) finishLink(id);
        else if (!id) { cancelLink(); toast('Borrowing cancelled.'); }
        return;
    }
    if (id) { select({ type: 'lang', id }); return; }

    const borEl = e.target.closest?.('[data-borrow-id]');
    if (borEl) { select({ type: 'borrowing', id: borEl.getAttribute('data-borrow-id') }); return; }
    const evEl = e.target.closest?.('[data-event-id]');
    if (evEl) { select({ type: 'event', id: evEl.getAttribute('data-event-id') }); return; }
    select(null);
}

function onDblClick(e) {
    const gEl = e.target.closest?.('[data-id]');
    if (gEl) openLanguageForm(appApi(), { mode: 'edit', langId: gEl.getAttribute('data-id') });
}

// --- context menus -------------------------------------------------------

function onContextMenu(e) {
    e.preventDefault();
    if (!state.model) return;
    cancelLink();
    const gEl = e.target.closest?.('[data-id], .branch-handle');
    const id = gEl?.getAttribute?.('data-id') ?? gEl?.getAttribute?.('data-handle') ?? null;
    const { px, py } = vpPoint(e);
    if (id && state.model.byId.has(id)) openBoxMenu(id, e.clientX, e.clientY);
    else openCanvasMenu(e.clientX, e.clientY, Math.round(yearAt(py)), px);
}

function openBoxMenu(id, cx, cy) {
    const l = state.model.byId.get(id);
    if (!l) return;
    select(id);
    const hasStage = state.model.stageChild.has(id);
    const lx = state.layout.pos.get(id)?.x ?? 0;
    showMenu(cx, cy, [
        { label: 'Rename', kbd: 'F2', run: () => beginRename(id) },
        { label: 'Edit details…', run: () => openLanguageForm(appApi(), { mode: 'edit', langId: id }) },
        'sep',
        {
            label: 'New daughter language',
            hint: 'Tip: you can also drag the ● handle off the box',
            run: () => startPending({ relation: 'branch', parentId: id, born: l.born, worldX: lx + COL_W }),
        },
        {
            label: 'New stage (next era)',
            disabled: hasStage,
            hint: hasStage ? 'Already has a stage successor' : 'Continues this language down the same column',
            run: () => startPending({
                relation: 'stage',
                parentId: id,
                born: (l.died != null && l.died > l.born) ? l.died : l.born + 1,
                worldX: lx,
            }),
        },
        { label: 'Borrowing from this…', run: () => startLink(id) },
        'sep',
        { label: 'Delete…', kbd: 'Del', danger: true, run: () => confirmDeleteLanguage(appApi(), id) },
    ]);
}

function openCanvasMenu(cx, cy, year, px) {
    showMenu(cx, cy, [
        {
            label: `New language here (born ${year})`,
            hint: 'Starts a new family at this year',
            run: () => startPending({ relation: 'root', born: year, worldX: px - state.view.panX }),
        },
        'sep',
        { label: 'New borrowing…', run: () => openBorrowingForm(appApi(), {}) },
        { label: 'Fit view', run: fitAndRender },
        { label: 'Settings…', run: () => openSettingsForm(appApi()) },
    ]);
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
            v.pxPerYear = clamp(v.pxPerYear * (e.deltaY < 0 ? 1.2 : 1 / 1.2), zoomFloor(), ZOOM_MAX);
            v.panY = py - yearUnder * v.pxPerYear;
        }
        clampView(); persistViewSoon(); requestRender();
    }, { passive: false });

    els.svg.addEventListener('pointerdown', onPointerDown);
    els.svg.addEventListener('pointermove', onPointerMove);
    els.svg.addEventListener('pointerup', onPointerUp);
    els.svg.addEventListener('pointercancel', onPointerUp);
    els.svg.addEventListener('pointerleave', () => { if (!gesture) setHover(null); });
    els.svg.addEventListener('click', onClick);
    els.svg.addEventListener('dblclick', onDblClick);
    els.viewport.addEventListener('contextmenu', onContextMenu);

    // Inline name editor.
    els.inlineName.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); commitInline(); }
        else if (e.key === 'Escape') {
            e.preventDefault();
            if (inline?.mode === 'create') cancelPending();
            else hideInline();
        }
    });
    els.inlineName.addEventListener('blur', () => { if (inline) commitInline(); });

    // Panel + toolbar actions (panel is stateless; actions route here).
    els.panel.addEventListener('click', (e) => {
        const selBtn = e.target.closest('[data-select]');
        if (selBtn) { select({ type: 'lang', id: selBtn.getAttribute('data-select') }); return; }
        const selBor = e.target.closest('[data-select-borrowing]');
        if (selBor) { select({ type: 'borrowing', id: selBor.getAttribute('data-select-borrowing') }); return; }
        const selEv = e.target.closest('[data-select-event]');
        if (selEv) { select({ type: 'event', id: selEv.getAttribute('data-select-event') }); return; }
        const actBtn = e.target.closest('[data-action]');
        if (actBtn) handleAction(actBtn.getAttribute('data-action'), actBtn);
    });

    els.btnUndo?.addEventListener('click', undo);
    els.btnRedo?.addEventListener('click', redo);
    els.btnFit.addEventListener('click', fitAndRender);
    els.btnAddRoot.addEventListener('click', () => openLanguageForm(appApi(), { mode: 'add-root' }));
    els.btnBorrow.addEventListener('click', () => openBorrowingForm(appApi(), { fromId: selLangId() ?? undefined }));
    els.btnSettings.addEventListener('click', () => openSettingsForm(appApi()));
    els.btnDownload.addEventListener('click', () => { if (state.doc) downloadDoc(state.doc); });
    els.btnSearch?.addEventListener('click', () => openSearch());
    els.btnScrub?.addEventListener('click', toggleScrub);
    els.btnExport?.addEventListener('click', () => doExport('svg'));

    els.btnTheme.addEventListener('click', () => {
        const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        try { localStorage.setItem('andah-theme', next); } catch { /* ignore */ }
        applyThemeLabel();
    });
    applyThemeLabel();

    document.addEventListener('keydown', (e) => {
        const k = e.key;
        const mod = e.ctrlKey || e.metaKey;
        if (mod && (k === 's' || k === 'S')) {
            // Everything already autosaves; Ctrl+S just reassures like a real app.
            e.preventDefault();
            flashSaved();
            return;
        }
        if (mod && (k === 'k' || k === 'K')) {
            e.preventDefault();
            if (isSearchOpen()) closeSearch(); else openSearch();
            return;
        }
        const typing = els.dlg.open || isSearchOpen() || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName ?? '');
        if (mod && (k === 'z' || k === 'Z')) {
            if (typing) return;
            e.preventDefault();
            if (e.shiftKey) redo(); else undo();
            return;
        }
        if (mod && (k === 'y' || k === 'Y')) {
            if (typing) return;
            e.preventDefault();
            redo();
            return;
        }
        if (typing) return;
        const lid = selLangId();
        if (k === 'ArrowDown') { e.preventDefault(); navigate('down'); return; }
        if (k === 'ArrowUp') { e.preventDefault(); navigate('up'); return; }
        if (k === 'ArrowLeft') { e.preventDefault(); navigate('left'); return; }
        if (k === 'ArrowRight') { e.preventDefault(); navigate('right'); return; }
        if ((k === 'c' || k === 'C') && lid) { toggleCollapse(lid); return; }
        if ((k === 'f' || k === 'F')) { fitAndRender(); return; }
        if (k === 'Enter' && lid) { e.preventDefault(); openLanguageForm(appApi(), { mode: 'edit', langId: lid }); return; }
        if (k === 'Delete' && lid) { confirmDeleteLanguage(appApi(), lid); return; }
        if (k === 'F2' && lid) { e.preventDefault(); beginRename(lid); return; }
        if (k === 'Escape') {
            if (isSearchOpen()) { closeSearch(); return; }
            if (cancelPending()) return;
            if (closeMenu()) return;
            if (cancelLink()) return;
            if (state.scrub) { toggleScrub(); return; }
            select(null);
        }
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
    const lid = selLangId();
    switch (action) {
        case 'add-root': openLanguageForm(app, { mode: 'add-root' }); break;
        case 'add-daughter': openLanguageForm(app, { mode: 'add-daughter', parentId: lid }); break;
        case 'add-daughter-at-death': {
            const l = lid ? state.model.byId.get(lid) : null;
            if (l && l.died != null) {
                const lx = state.layout.pos.get(lid)?.x ?? 0;
                startPending({ relation: 'branch', parentId: lid, born: l.died, worldX: lx + COL_W });
            }
            break;
        }
        case 'add-stage': openLanguageForm(app, { mode: 'add-stage', parentId: lid }); break;
        case 'edit': openLanguageForm(app, { mode: 'edit', langId: lid }); break;
        case 'rename': if (lid) beginRename(lid); break;
        case 'add-borrowing': openBorrowingForm(app, { fromId: lid ?? undefined }); break;
        case 'delete': confirmDeleteLanguage(app, lid); break;
        case 'delete-borrowing': deleteBorrowing(app, btn.getAttribute('data-bid')); break;
        case 'edit-borrowing': openBorrowingForm(app, { borrowingId: btn.getAttribute('data-bid') }); break;
        case 'add-event': openEventForm(app, {}); break;
        case 'edit-event': openEventForm(app, { eventId: btn.getAttribute('data-eid') }); break;
        case 'delete-event': deleteEvent(app, btn.getAttribute('data-eid')); break;
        case 'toggle-collapse': toggleCollapse(btn.getAttribute('data-id') ?? lid); break;
        case 'open-polyglot': doOpenPolyglot(btn.getAttribute('data-id') ?? lid); break;
        case 'export': openExportChoice(); break;
        case 'deselect': select(null); break;
    }
}

async function doOpenPolyglot(id) {
    if (!id) return;
    const res = await openPolyglot(id);
    if (res.status === 200 && res.body?.ok) toast('Opening in PolyGlot…');
    else toast(res.body?.error ?? 'Could not open PolyGlot.', 'err');
}

// --- boot ----------------------------------------------------------------

async function boot() {
    wireEvents();
    initSearch({ getModel: () => state.model, focusLanguage });
    await reload('initial');
    subscribeEvents(onServerEvent);
}

boot();
