// App bootstrap and state owner. Everything flows one way:
//   events mutate `state` -> requestRender() redraws the SVG -> renderPanel()
// The data file on disk is the source of truth; saves go through the server
// (PUT /api/data with baseRev) and external edits arrive back via SSE.
//
// v2 interaction model — the app behaves like a desktop program:
//   drag empty canvas  pan / scroll around the timeline
//   click a box        select it (also a borrowing arrow / event band)
//   Shift+drag canvas  rubber-band a multi-selection (move together / Del all)
//   right-click        context menus (canvas: new language here; box: actions)
//   drag a box         move it in time (Ctrl = move its whole family)
//   drag its ● handle  branch a new daughter off at the drop year
//   double-click box   edit details;  F2  rename in place;  Del/Backspace deletes;  Ctrl+Z / Ctrl+Y undo/redo
//   ? or F1            the keyboard & mouse reference;  Ctrl+S autosaves (just reassures)

import { validateDoc } from './validate.js';
import { buildModel } from './model.js';
import { computeLayout, BOX_W, BOX_H, COL_W, GUTTER_W } from './layout.js';
import { computeTreeLayout } from './tree-layout.js';
import { render, renderMinimap, MINIMAP_W, MINIMAP_H, S_MIN } from './view.js';
import { renderTree } from './tree-view.js';
import { renderPanel } from './panel.js';
import {
    openLanguageForm, openBorrowingForm, openEventForm, openSettingsForm, openGroupsForm,
    confirmDeleteLanguage, deleteBorrowing, deleteEvent, slugify,
} from './forms.js';
import { fetchData, saveData, subscribeEvents, toast, downloadDoc, openPolyglot } from './api.js';
import { showMenu, closeMenu } from './menu.js';
import { initSearch, openSearch, isSearchOpen, closeSearch } from './search.js';
import { exportSvg, exportPng } from './export.js';

const els = {
    svg: document.getElementById('tree'),
    minimap: document.getElementById('minimap'),
    viewport: document.getElementById('viewport'),
    panel: document.getElementById('panel'),
    emptyHint: document.getElementById('empty-hint'),
    banner: document.getElementById('banner'),
    docTitle: document.getElementById('doc-title'),
    status: document.getElementById('status-chip'),
    dlg: document.getElementById('dlg'),
    inlineName: document.getElementById('inline-name'),
    readout: document.getElementById('drag-readout'),
    hoverTip: document.getElementById('hover-tip'),
    btnUndo: document.getElementById('btn-undo'),
    btnRedo: document.getElementById('btn-redo'),
    btnFit: document.getElementById('btn-fit'),
    btnZoomIn: document.getElementById('btn-zoom-in'),
    btnZoomOut: document.getElementById('btn-zoom-out'),
    btnZoomReset: document.getElementById('btn-zoom-reset'),
    btnAddRoot: document.getElementById('btn-add-root'),
    btnBorrow: document.getElementById('btn-borrow'),
    btnBorrows: document.getElementById('btn-borrows'),
    btnSettings: document.getElementById('btn-settings'),
    btnDownload: document.getElementById('btn-download'),
    btnSearch: document.getElementById('btn-search'),
    btnScrub: document.getElementById('btn-scrub'),
    btnPlay: document.getElementById('btn-play'),
    btnLiving: document.getElementById('btn-living'),
    btnMinimap: document.getElementById('btn-minimap'),
    btnLayout: document.getElementById('btn-layout'),
    btnExport: document.getElementById('btn-export'),
    btnHelp: document.getElementById('btn-help'),
    btnTheme: document.getElementById('btn-theme'),
    panelToggle: document.getElementById('panel-toggle'),
    app: document.querySelector('.app'),
};

const VIEW_KEY = 'andah-langtree-view-v1';
const TREEVIEW_KEY = 'andah-langtree-treeview-v1';
const LAYOUT_KEY = 'andah-langtree-layout-v1';
const COLLAPSE_KEY = 'andah-langtree-collapsed-v1';
const MINIMAP_KEY = 'andah-langtree-minimap-v1';
const BORROWS_KEY = 'andah-langtree-borrows-v1';
const PANEL_KEY = 'andah-langtree-panel-v1';
const ZOOM_MIN = 0.02, ZOOM_MAX = 96;
// Tree view uses a plain uniform world scale (not px-per-year), with its own range.
const TREE_ZOOM_MIN = 0.05, TREE_ZOOM_MAX = 4;
// The graph is a bounded canvas hugging the actual content: you can pan and
// zoom out only to a modest margin around the languages/events, never into
// endless blank years. Zooming all the way out fits that span for one compact
// overview (boxes shrink with zoom — see view.js). See contentYearBounds().
const HISTORY_MAX = 50;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const state = {
    doc: null,
    rev: 0,
    model: null,
    layout: null,
    view: { pxPerYear: 0.5, panX: 0, panY: 120 },
    layoutMode: loadLayoutMode(),  // 'time' | 'tree' — view-only, persisted to localStorage
    treeView: { scale: 0.6, panX: 40, panY: 40 }, // separate pan/zoom for tree mode
    timeFitted: false, treeFitted: false, // whether each mode's camera has been placed
    selection: null,   // typed: { type: 'lang'|'borrowing'|'event', id } | null
    multi: new Set(),  // rubber-band multi-selection of language ids
    marquee: null,     // live rubber-band rect: { x0, y0, x1, y1 } (viewport px)
    hoverId: null,
    highlight: null,   // { focusId, set } | null — lineage dim/highlight
    collapsed: loadCollapsed(),  // Set<langId> whose subtrees are folded
    minimapOn: loadMinimap(),    // bool — minimap overview visible
    showBorrows: loadShowBorrows(), // bool — borrowing arrows visible (view-only, persisted)
    miniGeom: null,    // last minimap render's { toWorld } mapper (for pan clicks)
    scrub: null,       // { year } | null — year scrubber
    filter: null,      // null | { kind:'living' } | { kind:'family', rootId } — dim non-matches
    filterSet: null,   // Set<langId> of allowed ids for the active filter, or null
    hasView: false,
    boxPos: null,      // last rendered id -> {x, y} (screen coords)
    pending: null,     // in-place creation: { relation, parentId?, born, worldX }
    handleDrag: null,  // live branch-off preview: { parentId, x, y }
    linkDrag: null,    // live borrowing-link drag: { toId, x, y, targetId } (toId = receiving box being dragged from)
    drag: null,        // live time-drag: { ids:Set, delta, shiftDied }
    reorder: null,     // live sibling reorder: { id, caretX, to } | null
    reparent: null,    // live re-parent drag: { id, targetId } | null
    reparentFrom: null,// re-parent pick mode (from a menu): source language id
    linkInto: null,    // borrowing link mode: receiving language id
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

function loadMinimap() {
    try { return localStorage.getItem(MINIMAP_KEY) === '1'; } catch { return false; }
}

function persistMinimap() {
    try { localStorage.setItem(MINIMAP_KEY, state.minimapOn ? '1' : '0'); } catch { /* ignore */ }
}

function loadShowBorrows() {
    try { return localStorage.getItem(BORROWS_KEY) !== '0'; } catch { return true; }
}

function persistShowBorrows() {
    try { localStorage.setItem(BORROWS_KEY, state.showBorrows ? '1' : '0'); } catch { /* ignore */ }
}

function loadLayoutMode() {
    try { return localStorage.getItem(LAYOUT_KEY) === 'tree' ? 'tree' : 'time'; } catch { return 'time'; }
}

function persistLayoutMode() {
    try { localStorage.setItem(LAYOUT_KEY, state.layoutMode); } catch { /* ignore */ }
}

const isTree = () => state.layoutMode === 'tree';

// Pick the right layout algorithm for the current mode. Both return the same
// { pos, hiddenCounts, bounds } contract, so state.layout stays uniform.
function recomputeLayout() {
    state.layout = isTree()
        ? computeTreeLayout(state.model, state.collapsed)
        : computeLayout(state.model, state.collapsed);
}

function isPanelCollapsed() {
    try { return localStorage.getItem(PANEL_KEY) === '1'; } catch { return false; }
}

function applyPanelCollapsed(collapsed) {
    els.app?.classList.toggle('panel-collapsed', collapsed);
    if (els.panelToggle) {
        els.panelToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        els.panelToggle.title = collapsed ? 'Show panel' : 'Hide panel';
        els.panelToggle.setAttribute('aria-label', collapsed ? 'Show panel' : 'Hide panel');
    }
}

function setPanelCollapsed(collapsed) {
    applyPanelCollapsed(collapsed);
    try { localStorage.setItem(PANEL_KEY, collapsed ? '1' : '0'); } catch { /* ignore */ }
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
        const tree = isTree();
        const r = (tree ? renderTree : render)(els.svg, {
            model: state.model,
            layout: state.layout,
            view: tree ? state.treeView : state.view,
            config: state.doc?.config,
            selected: state.selection,
            multi: state.multi,
            marquee: state.marquee,
            hoverId: state.hoverId,
            highlight: state.highlight,
            filterSet: state.filterSet,
            scrub: state.scrub,
            pending: state.pending,
            handleDrag: state.handleDrag,
            linkDrag: state.linkDrag,
            drag: state.drag,
            reorder: state.reorder,
            reparent: state.reparent,
            fitZoom: tree ? 0 : fitZoom(),
            yppy: tree ? 0 : yScaleNow(),
            w, h,
        });
        state.boxPos = r.pos;
        state.boxScale = r.scale;
        renderMinimapNow();
        updateHistoryButtons();
        updateZoomReadout();
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
    for (const id of [...state.multi]) if (!state.model.byId.has(id)) state.multi.delete(id);
    recomputeLayout();
    // Prune a selection whose target vanished.
    if (state.selection) {
        const s = state.selection;
        const gone = (s.type === 'lang' && !state.model.byId.has(s.id))
            || (s.type === 'borrowing' && !state.model.borrowingById.has(s.id))
            || (s.type === 'event' && !state.model.eventById.has(s.id));
        if (gone) state.selection = null;
    }
    // Drop a family filter whose root vanished, then recompute against the fresh
    // model (also refreshes the living-only set as births/deaths change).
    if (state.filter?.kind === 'family' && !state.model.byId.has(state.filter.rootId)) state.filter = null;
    refreshFilter();
    els.btnLiving?.setAttribute('aria-pressed', state.filter?.kind === 'living' ? 'true' : 'false');
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
            stopPlay(); // playback's captured year bounds no longer match the doc
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

// Years map to pixels through the model's time warp (model.js): stretches of
// history where nothing happens fold up, so pxPerYear is px per WARPED year.
// These helpers are safe before the first doc load (identity).
const warpY = y => state.model ? state.model.warp(y) : y;
const unwarpY = wy => state.model ? state.model.unwarp(wy) : wy;

// The zoom at which the whole tree just fills the viewport (oldest to present).
function fitZoom() {
    if (!state.layout) return state.view.pxPerYear || 0.5;
    const b = state.layout.bounds;
    const maxYear = Math.max(b.maxYear, state.doc?.config?.presentYear ?? b.maxYear);
    const span = Math.max(warpY(maxYear) - warpY(b.minYear), 10);
    return clamp((h - 160) / span, ZOOM_MIN, ZOOM_MAX);
}

// The bounded canvas in years: the content's own year span (languages + the
// present line + events) plus a modest margin, so panning/zooming never wanders
// into large blank stretches above the oldest or below the newest language.
function contentYearBounds() {
    const b = state.layout?.bounds;
    let lo = b ? b.minYear : 0, hi = b ? b.maxYear : 1;
    const py = state.doc?.config?.presentYear;
    if (Number.isInteger(py)) hi = Math.max(hi, py);
    for (const ev of state.doc?.events ?? []) {
        if (Number.isInteger(ev.year)) { lo = Math.min(lo, ev.year); hi = Math.max(hi, ev.year); }
        if (Number.isInteger(ev.endYear)) hi = Math.max(hi, ev.endYear);
    }
    const span = Math.max(hi - lo, 10);
    const pad = clamp(span * 0.15, 150, 600);
    return { lo: lo - pad, hi: hi + pad };
}

// The furthest-out zoom we allow. "Everything fits the viewport" (the bounded
// canvas, in warped years, filling the height) is the first overview stop, and
// past it you can keep going — down to a fraction of the fit-everything zoom —
// into the graph-overview level where boxes collapse to family-colored chips
// (view.js DENSE_SCALE) and only the connections read. DJ uses both.
function zoomFloor() {
    const { lo, hi } = contentYearBounds();
    const fitAll = clamp((h - 100) / Math.max(warpY(hi) - warpY(lo), 10), ZOOM_MIN, ZOOM_MAX);
    return clamp(Math.min(fitAll, fitZoom() * 0.18), ZOOM_MIN, ZOOM_MAX);
}

// Effective px-per-warped-year for the TIME axis (what every year↔pixel
// conversion actually uses). Zooming out compresses time only until the whole
// padded timeline fills the viewport height; past that the axis FREEZES at
// that spread and only the boxes/columns keep shrinking (boxScaleNow → the
// chip overview). So a deep zoom-out reads as a family chart spread over the
// whole screen — never everything squashed into a thin band at the bottom.
function yScaleNow() {
    const { lo, hi } = contentYearBounds();
    const fitAll = (h - 100) / Math.max(warpY(hi) - warpY(lo), 10);
    return Math.max(state.view.pxPerYear, Math.min(fitAll, ZOOM_MAX));
}

// Horizontal packing, the inverse of view.js's `hx`: on zoom-out the renderer
// compresses column spacing by the box scale `bs` around the axis gutter (so the
// overview doesn't fly apart sideways). These convert between a world column-x and
// an on-screen x using that same factor, so creates/reorders land in the right
// column at any zoom. At full zoom bs===1, so both reduce to the plain worldX±panX
// the code used before this feature.
function boxScaleNow() {
    const fz = fitZoom();
    return Math.max(S_MIN, Math.min(1, fz ? state.view.pxPerYear / fz : 1));
}
const worldXToScreen = wx => GUTTER_W + (wx - GUTTER_W) * boxScaleNow() + state.view.panX;
const screenXToWorld = px => GUTTER_W + (px - state.view.panX - GUTTER_W) / boxScaleNow();

function fitView() {
    if (isTree()) return fitTreeView();
    if (!state.layout) return;
    const b = state.layout.bounds;
    state.view.pxPerYear = fitZoom();
    state.view.panY = 60 - warpY(b.minYear) * state.view.pxPerYear;
    const contentW = b.maxX - b.minX;
    const desired = GUTTER_W + Math.max(20, (w - GUTTER_W - contentW) / 2);
    state.view.panX = desired - b.minX;
}

// --- tree-view camera: a uniform world scale, no year math ----------------

// The scale at which the whole tree just fills the viewport.
function treeFitScale() {
    if (!state.layout) return state.treeView.scale || 0.6;
    const b = state.layout.bounds;
    const cw = Math.max(b.maxX - b.minX, 10), ch = Math.max(b.maxY - b.minY, 10);
    return clamp(Math.min((w - 120) / cw, (h - 120) / ch), TREE_ZOOM_MIN, 1);
}

function fitTreeView() {
    if (!state.layout) return;
    const b = state.layout.bounds;
    const s = treeFitScale();
    const cw = (b.maxX - b.minX) * s, ch = (b.maxY - b.minY) * s;
    state.treeView = {
        scale: s,
        panX: Math.max(20, (w - cw) / 2) - b.minX * s,
        panY: Math.max(20, (h - ch) / 2) - b.minY * s,
    };
}

function clampTreeView() {
    if (!state.layout) return;
    const b = state.layout.bounds, tv = state.treeView;
    tv.scale = clamp(tv.scale, TREE_ZOOM_MIN, TREE_ZOOM_MAX);
    const minX = b.minX * tv.scale, maxX = b.maxX * tv.scale;
    const minY = b.minY * tv.scale, maxY = b.maxY * tv.scale;
    tv.panX = clamp(tv.panX, 80 - maxX, (w - 80) - minX);
    tv.panY = clamp(tv.panY, 80 - maxY, (h - 80) - minY);
}

// Zoom the tree by a factor, anchored on the viewport center.
function zoomTreeBy(factor) {
    const tv = state.treeView;
    const cx = w / 2, cy = h / 2;
    const wx = (cx - tv.panX) / tv.scale, wy = (cy - tv.panY) / tv.scale;
    tv.scale = clamp(tv.scale * factor, TREE_ZOOM_MIN, TREE_ZOOM_MAX);
    tv.panX = cx - wx * tv.scale;
    tv.panY = cy - wy * tv.scale;
    clampTreeView(); persistViewSoon(); requestRender();
}

function fitAndRender() { fitView(); clampView(); persistViewSoon(); requestRender(); }

// Zoom the time axis by a factor, anchored on the vertical center of the
// viewport (same math as the wheel handler, with py fixed at the midpoint).
function zoomBy(factor) {
    if (!state.layout) return;
    if (isTree()) return zoomTreeBy(factor);
    const v = state.view;
    const px = w / 2, py = h / 2;
    const yearUnder = (py - v.panY) / yScaleNow();
    const wxUnder = screenXToWorld(px);
    v.pxPerYear = clamp(v.pxPerYear * factor, zoomFloor(), ZOOM_MAX);
    v.panY = py - yearUnder * yScaleNow();
    v.panX = px - GUTTER_W - (wxUnder - GUTTER_W) * boxScaleNow();
    clampView(); persistViewSoon(); requestRender();
}

// Draws (or clears) the minimap. Called every frame so the viewport rectangle
// tracks pans and zooms live. Stores the world-mapping for pan-on-click.
function renderMinimapNow() {
    if (!els.minimap) return;
    // The minimap is time-based (year axis); it stays hidden in tree mode.
    if (!state.minimapOn || !state.layout || isTree()) {
        els.minimap.hidden = true;
        state.miniGeom = null;
        return;
    }
    els.minimap.hidden = false;
    const { lo, hi } = contentYearBounds();
    state.miniGeom = renderMinimap(els.minimap, {
        model: state.model, layout: state.layout, view: state.view,
        yppy: yScaleNow(), yearLo: lo, yearHi: hi, vw: w, vh: h,
    });
}

function toggleMinimap() {
    state.minimapOn = !state.minimapOn;
    persistMinimap();
    els.btnMinimap?.setAttribute('aria-pressed', state.minimapOn ? 'true' : 'false');
    requestRender();
}

// Borrowing-arrow visibility is pure CSS (`.hide-borrows` hides `.borrow`
// groups AND the dashed `.conn-creole` second-parent links), so both the
// timeline and tree renderers are untouched — the elements are still in the
// SVG, just not displayed (and not hittable).
function applyShowBorrows() {
    els.viewport?.classList.toggle('hide-borrows', !state.showBorrows);
    els.btnBorrows?.setAttribute('aria-pressed', state.showBorrows ? 'true' : 'false');
}

function toggleShowBorrows() {
    state.showBorrows = !state.showBorrows;
    persistShowBorrows();
    applyShowBorrows();
    // If the hidden selection was a borrowing, drop it so the panel/Del key
    // don't act on something invisible.
    if (!state.showBorrows && state.selection?.type === 'borrowing') {
        state.selection = null;
        refreshHighlight();
        requestRender();
        renderPanelNow();
    }
}

function updateLayoutButton() {
    els.btnLayout?.setAttribute('aria-pressed', isTree() ? 'true' : 'false');
    if (els.btnLayout) els.btnLayout.title = isTree() ? 'Switch to timeline view' : 'Switch to tree view';
}

// Flip between the timeline and the classic left-to-right tree. View-only: it
// recomputes the layout for the new mode and swaps to that mode's own camera,
// fitting it the first time it's opened. Never touches the data file.
function toggleLayout() {
    state.layoutMode = isTree() ? 'time' : 'tree';
    persistLayoutMode();
    updateLayoutButton();
    recomputeLayout();
    if (isTree() && !state.treeFitted) { fitTreeView(); state.treeFitted = true; }
    if (!isTree() && !state.timeFitted) { fitView(); state.timeFitted = true; }
    clampView();
    persistViewSoon();
    requestRender();
    renderPanelNow();
    renderMinimapNow();
}

// Click or drag anywhere on the minimap to recenter the main view there.
function wireMinimap() {
    if (!els.minimap) return;
    let dragging = false;
    const panTo = (e) => {
        const g = state.miniGeom;
        if (!g) return;
        const r = els.minimap.getBoundingClientRect();
        if (!r.width || !r.height) return;
        const { x, year } = g.toWorld(
            (e.clientX - r.left) / r.width * MINIMAP_W,
            (e.clientY - r.top) / r.height * MINIMAP_H,
        );
        centerOnWorld(x, year);
    };
    els.minimap.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        dragging = true;
        els.minimap.setPointerCapture?.(e.pointerId);
        panTo(e);
    });
    els.minimap.addEventListener('pointermove', (e) => { if (dragging) panTo(e); });
    const end = (e) => { dragging = false; els.minimap.releasePointerCapture?.(e.pointerId); };
    els.minimap.addEventListener('pointerup', end);
    els.minimap.addEventListener('pointercancel', end);
}

// Center the camera on a world (x, year) point — used by minimap clicks/drags.
function centerOnWorld(x, year) {
    state.view.panX = w / 2 - x;
    state.view.panY = h / 2 - warpY(year) * yScaleNow();
    clampView(); persistViewSoon(); requestRender();
}

// "100%" is the whole-tree fit zoom; the chip shows the current zoom relative to
// it and clicking it re-fits. Updated every frame from requestRender.
function updateZoomReadout() {
    if (!els.btnZoomReset) return;
    if (isTree()) {
        const fz = treeFitScale();
        const pct = fz > 0 ? Math.round(state.treeView.scale / fz * 100) : 100;
        els.btnZoomReset.textContent = `${pct}%`;
        return;
    }
    const fz = fitZoom();
    const pct = fz > 0 ? Math.round(state.view.pxPerYear / fz * 100) : 100;
    els.btnZoomReset.textContent = `${pct}%`;
}

function clampView() {
    if (!state.layout) return;
    if (isTree()) return clampTreeView();
    const b = state.layout.bounds;
    state.view.pxPerYear = clamp(state.view.pxPerYear, zoomFloor(), ZOOM_MAX);
    const ppy = yScaleNow();
    // Vertical pan is bounded to the content's padded year range (see
    // contentYearBounds) so you can't scroll into blank space past the oldest
    // or newest language.
    const { lo, hi } = contentYearBounds();
    const yTop = warpY(lo) * ppy, yBot = warpY(hi) * ppy + BOX_H;
    state.view.panY = clamp(state.view.panY, 80 - yBot, (h - 80) - yTop);
    // Horizontal pan is bounded to the content's *packed* screen extent (columns
    // compress by boxScaleNow() on zoom-out, mirroring the renderer), so the
    // zoomed-out overview stays framed instead of drifting off to one side.
    const bs = boxScaleNow();
    const packMinX = GUTTER_W + (b.minX - GUTTER_W) * bs;
    const packMaxX = GUTTER_W + (b.maxX - GUTTER_W) * bs;
    state.view.panX = clamp(state.view.panX, 80 - packMaxX, (w - 80) - packMinX);
}

let viewSaveTimer = null;
function persistViewSoon() {
    clearTimeout(viewSaveTimer);
    viewSaveTimer = setTimeout(() => {
        try {
            localStorage.setItem(VIEW_KEY, JSON.stringify(state.view));
            localStorage.setItem(TREEVIEW_KEY, JSON.stringify(state.treeView));
        } catch { /* ignore */ }
    }, 300);
}

// Restore both cameras from localStorage; fit whichever mode is active if it had
// no saved camera. The inactive mode fits lazily the first time it's opened
// (toggleLayout), since its layout isn't computed yet here.
function restoreOrFit() {
    let timeOk = false, treeOk = false;
    try {
        const v = JSON.parse(localStorage.getItem(VIEW_KEY));
        if (v && Number.isFinite(v.pxPerYear) && Number.isFinite(v.panX) && Number.isFinite(v.panY)) {
            state.view = { pxPerYear: clamp(v.pxPerYear, ZOOM_MIN, ZOOM_MAX), panX: v.panX, panY: v.panY };
            timeOk = true;
        }
    } catch { /* fall through to fit */ }
    try {
        const t = JSON.parse(localStorage.getItem(TREEVIEW_KEY));
        if (t && Number.isFinite(t.scale) && Number.isFinite(t.panX) && Number.isFinite(t.panY)) {
            state.treeView = { scale: clamp(t.scale, TREE_ZOOM_MIN, TREE_ZOOM_MAX), panX: t.panX, panY: t.panY };
            treeOk = true;
        }
    } catch { /* fall through to fit */ }
    if (isTree()) {
        if (!treeOk) fitTreeView();
        state.treeFitted = true;
        state.timeFitted = timeOk;
    } else {
        if (!timeOk) fitView();
        state.timeFitted = true;
        state.treeFitted = treeOk;
    }
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
    updateHoverTip();
    refreshHighlight();
    requestRender();
}

// A small info card near the hovered box: name, years, relation, descendants.
// Hidden mid-gesture (the drag readout takes over) and when nothing is hovered.
function updateHoverTip() {
    const tip = els.hoverTip;
    if (!tip) return;
    const id = state.hoverId;
    const gestureActive = !!(state.drag || state.handleDrag || state.pending || state.reorder || state.marquee);
    const l = id && state.model ? state.model.byId.get(id) : null;
    const p = id && state.boxPos ? state.boxPos.get(id) : null;
    if (!l || !p || gestureActive) { tip.hidden = true; return; }

    const m = state.model;
    const d = m.diedOf(l);
    const yearsTxt = d != null
        ? `${l.born} – ${d}${(m.stageChild.has(l.id) || l.diverged) ? '' : ' †'}`
        : `${l.born} – now`;
    const rel = l.parentId == null ? 'Family root'
        : l.relation === 'stage' ? `Stage of ${m.byId.get(l.parentId)?.name ?? l.parentId}`
        : `Daughter of ${m.byId.get(l.parentId)?.name ?? l.parentId}`;
    const desc = m.descendantsOf(l.id).size;
    tip.innerHTML = `<b>${esc(l.name)}</b><span>${esc(yearsTxt)}</span>` +
        `<span>${esc(rel)}</span>${desc ? `<span>${desc} descendant${desc === 1 ? '' : 's'}</span>` : ''}`;
    tip.hidden = false;
    // Anchor just below the box; keep it inside the viewport horizontally.
    const scale = state.boxScale ?? 1;
    const left = clamp(p.x - BOX_W * scale / 2, 8, Math.max(8, w - tip.offsetWidth - 8));
    const top = clamp(p.y + BOX_H * scale + 8, 8, Math.max(8, h - tip.offsetHeight - 8));
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
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

// --- focus filter (living-only / one family) -----------------------------

// Recomputes the set of language ids the active filter keeps in full opacity.
// Everything else gets dimmed by the renderer (same idea as the scrub ghost).
function refreshFilter() {
    const f = state.filter;
    if (!f || !state.model) { state.filterSet = null; return; }
    const set = new Set();
    for (const l of state.model.languages) {
        if (f.kind === 'living' && l.died == null) set.add(l.id);
        else if (f.kind === 'family' && state.model.familyRootOf.get(l.id) === f.rootId) set.add(l.id);
        else if (f.kind === 'region' && l.region === f.region) set.add(l.id);
    }
    state.filterSet = set;
}

function setFilter(f) {
    state.filter = f;
    refreshFilter();
    els.btnLiving?.setAttribute('aria-pressed', f?.kind === 'living' ? 'true' : 'false');
    requestRender();
    renderPanelNow();
}

function toggleLivingFilter() {
    setFilter(state.filter?.kind === 'living' ? null : { kind: 'living' });
}

function focusFamily(rootId) {
    if (!state.model?.byId.has(rootId)) return;
    // Toggle off if the same family is already focused.
    setFilter(state.filter?.kind === 'family' && state.filter.rootId === rootId
        ? null : { kind: 'family', rootId });
}

function focusRegion(region) {
    if (!region) return;
    // Toggle off if this region is already focused (geographic dimension, dims others).
    setFilter(state.filter?.kind === 'region' && state.filter.region === region
        ? null : { kind: 'region', region });
}

// --- collapse / focus / keyboard navigation ------------------------------

function toggleCollapse(id) {
    if (!state.model?.byId.has(id)) return;
    if (state.collapsed.has(id)) state.collapsed.delete(id);
    else state.collapsed.add(id);
    persistCollapsed();
    recomputeLayout();
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
        recomputeLayout();
    }
    return changed;
}

// Center a language on screen and select it (used by search + keyboard nav).
function focusLanguage(id, { select: doSelect = true } = {}) {
    if (!state.model?.byId.has(id)) return;
    expandAncestors(id);
    const p = state.layout.pos.get(id);
    if (isTree()) {
        const tv = state.treeView;
        if (tv.scale < 0.35) tv.scale = 0.6; // make the box readable
        if (p) {
            tv.panX = w * 0.42 - p.x * tv.scale;
            tv.panY = h * 0.5 - p.y * tv.scale;
        }
    } else {
        // Make sure the box is readable.
        if (state.view.pxPerYear < 0.2) state.view.pxPerYear = 0.2;
        const lang = state.model.byId.get(id);
        if (p) {
            state.view.panX = w * 0.42 - p.x;
            state.view.panY = h * 0.36 - warpY(lang.born) * yScaleNow();
        }
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
    if (playRaf != null) stopPlay(); // a manual scrub toggle ends playback
    if (state.scrub) {
        state.scrub = null;
    } else {
        // Start at the year currently at viewport center.
        const year = Math.round(unwarpY((h / 2 - state.view.panY) / yScaleNow()));
        state.scrub = { year };
    }
    els.btnScrub?.setAttribute('aria-pressed', state.scrub ? 'true' : 'false');
    requestRender();
}

// --- time-lapse playback -------------------------------------------------
// Sweeps the scrubber from the oldest year to the present, so the whole family
// can be watched fanning out and dying back over time. Reuses the scrub ghost;
// touches no data. Timing is driven off the rAF timestamp (no Date.now()).
let playRaf = null;
let playState = null; // { lo, hi, dur, startYear, t0 } | null

function stopPlay() {
    if (playRaf != null) cancelAnimationFrame(playRaf);
    playRaf = null;
    playState = null;
    els.btnPlay?.setAttribute('aria-pressed', 'false');
    if (els.btnPlay) els.btnPlay.textContent = '▶ Play';
}

function togglePlay() {
    if (playRaf != null) { stopPlay(); return; } // playing → pause where it is
    const b = state.layout?.bounds;
    if (!b) return;
    const py = state.doc?.config?.presentYear;
    const lo = b.minYear;
    const hi = Number.isInteger(py) ? Math.max(py, b.maxYear) : b.maxYear;
    if (!(hi > lo)) return;
    // ~2.2ms/year of WARPED time (folded quiet stretches flash past at the
    // same screen speed), floored/capped so short and very deep timelines
    // both feel right.
    const dur = Math.min(24000, Math.max(6000, (warpY(hi) - warpY(lo)) * 2.2));
    // Resume from a parked scrub position if it sits mid-timeline, else from the top.
    const parked = state.scrub && Number.isInteger(state.scrub.year) ? state.scrub.year : null;
    const startYear = (parked != null && parked > lo && parked < hi) ? parked : lo;
    playState = { lo, hi, dur, startYear, t0: null };
    state.scrub = { year: startYear };
    els.btnScrub?.setAttribute('aria-pressed', 'true');
    els.btnPlay?.setAttribute('aria-pressed', 'true');
    if (els.btnPlay) els.btnPlay.textContent = '❚❚ Pause';
    playRaf = requestAnimationFrame(playStep);
}

function playStep(ts) {
    if (!playState) return;
    // Playback runs linearly in WARPED years — constant screen speed for the
    // scrub line, with folded (empty) stretches passing in a blink.
    const wLo = warpY(playState.lo), wHi = warpY(playState.hi);
    if (playState.t0 == null) {
        // Anchor t0 so playback starts at startYear rather than always at lo.
        const frac0 = (warpY(playState.startYear) - wLo) / (wHi - wLo);
        playState.t0 = ts - frac0 * playState.dur;
    }
    const frac = Math.min(1, (ts - playState.t0) / playState.dur);
    state.scrub = { year: Math.round(unwarpY(wLo + frac * (wHi - wLo))) };
    requestRender();
    if (frac >= 1) { stopPlay(); return; } // finished on the present year, scrub stays
    playRaf = requestAnimationFrame(playStep);
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

// --- help / shortcuts reference ------------------------------------------

// A full mouse + keyboard reference for new users. Rendered into the shared
// <dialog>; opened by the toolbar "?" button, the ? key, or F1.
function openHelp() {
    const K = s => `<kbd>${esc(s)}</kbd>`;
    const rows = list => list.map(([keys, desc]) =>
        `<div class="help-row"><div class="help-keys">${keys}</div><div class="help-desc">${desc}</div></div>`).join('');

    const mouse = rows([
        [`${K('Left-drag')} empty space`, 'Pan / scroll around the timeline.'],
        [`${K('Click')} a box`, 'Select it to see its details in the side panel.'],
        [`${K('Click')} an arrow or event band`, 'Select it to see its details.'],
        [`${K('Shift')}+${K('Left-drag')} empty space`, 'Rubber-band a group of boxes. Then drag any one to move them all, or ' + K('Del') + ' to delete them.'],
        [`${K('Left-drag')} a box`, 'Move it up/down in time — or left/right to reorder it among its siblings.'],
        [`${K('Ctrl')}+${K('Left-drag')} a box`, 'Move the whole family (the box and all its descendants) together.'],
        [`${K('Alt')}+${K('Left-drag')} a box`, 'Drop it onto another language to move it under there (re-parent into a different branch).'],
        [`${K('Left-drag')} the ● handle`, 'Pull off the bottom of a box into empty space to branch a new daughter.'],
        [`${K('Left-drag')} the right-edge handle`, 'Drag onto the source language to draw a borrowing / influence into this one.'],
        [`${K('Mouse wheel')}`, 'Zoom the timeline in and out. ' + K('Shift') + '+wheel (or a sideways wheel) pans horizontally.'],
        [`${K('Right-click')} empty space`, 'Menu → start a new language (a new family) at that year.'],
        [`${K('Right-click')} a box`, 'Menu with every action: new daughter, new stage below or above, move into another branch, delete…'],
        [`${K('Double-click')} a box`, 'Open its full edit form.'],
    ]);

    const keys = rows([
        [K('?') + ' / ' + K('F1'), 'Open this reference.'],
        [K('Ctrl') + '+' + K('K'), 'Search for a language by name.'],
        [K('↑') + ' ' + K('↓') + ' ' + K('←') + ' ' + K('→'), 'Walk the tree from the selected box (parent / child / siblings).'],
        [K('Enter'), 'Edit the selected language.'],
        [K('F2'), 'Rename the selected language in place.'],
        [K('c'), 'Collapse / expand the selected language’s subtree.'],
        [K('t'), 'Toggle between the timeline and the classic tree layout.'],
        [K('f') + ' / ' + K('0'), 'Fit the whole tree in view.'],
        [K('+') + ' / ' + K('−'), 'Zoom the timeline in / out.'],
        [K('Del') + ' / ' + K('Backspace'), 'Delete the selected language, borrowing, or event (or the whole rubber-band group).'],
        [K('Ctrl') + '+' + K('Z') + ' / ' + K('Ctrl') + '+' + K('Y'), 'Undo / redo (also ' + K('Ctrl') + '+' + K('Shift') + '+' + K('Z') + ').'],
        [K('Ctrl') + '+' + K('S'), 'Everything autosaves — this just confirms it.'],
        [K('Esc'), 'Cancel the current action (search, menu, pending name, selection).'],
    ]);

    els.dlg.classList.add('dlg-wide');
    els.dlg.innerHTML = `<h2>Keyboard &amp; mouse reference</h2>
        <div class="help-cols">
            <section><h3>Mouse</h3>${mouse}</section>
            <section><h3>Keyboard</h3>${keys}</section>
        </div>
        <p class="hint" style="margin-top:12px">Every change saves instantly to <code>data/languages.json</code>. Edit that file in VS Code (or ask Claude to) and this window refreshes itself.</p>
        <div class="dlg-buttons"><button class="btn" type="button" data-close>Close</button></div>`;
    const close = () => { els.dlg.close(); els.dlg.classList.remove('dlg-wide'); };
    els.dlg.querySelector('[data-close]')?.addEventListener('click', close);
    els.dlg.addEventListener('close', () => els.dlg.classList.remove('dlg-wide'), { once: true });
    els.dlg.showModal();
}

// --- helpers -------------------------------------------------------------

const yearAt = py => unwarpY((py - state.view.panY) / yScaleNow());

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

// Language ids whose last-rendered box intersects a screen-space rect (used by
// the rubber-band marquee). boxPos holds screen coords; boxScale the zoom-out
// shrink factor, so the hit rect matches what's actually drawn.
function boxesInRect(ax, ay, bx, by) {
    const out = new Set();
    if (!state.boxPos) return out;
    const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx);
    const y0 = Math.min(ay, by), y1 = Math.max(ay, by);
    const s = state.boxScale ?? 1;
    const hw = (BOX_W * s) / 2, bh = BOX_H * s;
    for (const [id, p] of state.boxPos) {
        if (p.x + hw >= x0 && p.x - hw <= x1 && p.y + bh >= y0 && p.y <= y1) out.add(id);
    }
    return out;
}

// The language whose last-rendered box contains a screen point, or null. Used by
// re-parent drag to find the drop target; `excludeId` (and its descendants) are
// skipped so a language can never be dropped onto itself or its own subtree.
function boxAt(px, py, excludeId) {
    if (!state.boxPos) return null;
    const s = state.boxScale ?? 1;
    const hw = (BOX_W * s) / 2, bh = BOX_H * s;
    const skip = excludeId
        ? new Set([excludeId, ...state.model.descendantsOf(excludeId)])
        : null;
    for (const [id, p] of state.boxPos) {
        if (skip && skip.has(id)) continue;
        if (px >= p.x - hw && px <= p.x + hw && py >= p.y && py <= p.y + bh) return id;
    }
    return null;
}

function clearMulti() {
    if (state.multi.size) { state.multi = new Set(); requestRender(); }
}

// --- re-parent (drag a language into a different branch) ------------------

// Move a language so `newParentId` becomes its parent, as a daughter (branch).
// Guarded against no-ops, cycles, and impossible dates; validation catches the rest.
async function commitReparent(childId, newParentId) {
    const child = state.model?.byId.get(childId);
    const parent = state.model?.byId.get(newParentId);
    if (!child || !parent || childId === newParentId) { requestRender(); return; }
    if (child.parentId === newParentId) { toast(`${child.name} is already a daughter of ${parent.name}.`); requestRender(); return; }
    if (state.model.descendantsOf(childId).has(newParentId)) {
        toast(`Can’t move ${child.name} under its own descendant.`, 'err'); requestRender(); return;
    }
    if (child.born < parent.born) {
        toast(`${child.name} (born ${child.born}) is older than ${parent.name} (born ${parent.born}) — change its year first.`, 'err');
        requestRender(); return;
    }
    const res = await applyEdit(doc => {
        const c = doc.languages.find(x => x.id === childId);
        if (!c) return;
        c.parentId = newParentId;
        c.relation = 'branch';
        delete c.order; // land at the end of the new sibling group
    });
    if (res.ok) { select(childId); toast(`Moved ${child.name} under ${parent.name}.`); }
    else requestRender();
}

// Menu-driven alternative to the drag: pick a new parent by clicking it.
function startReparentPick(id) {
    if (!state.model?.byId.has(id)) return;
    cancelPending();
    cancelLink();
    state.reparentFrom = id;
    els.viewport.classList.add('link-mode');
    const nm = state.model.byId.get(id)?.name ?? id;
    setStatus('Pick the new parent…');
    toast(`Click the language to move ${nm} under (Esc cancels).`);
}

function cancelReparentPick() {
    if (!state.reparentFrom) return false;
    state.reparentFrom = null;
    els.viewport.classList.remove('link-mode');
    setStatus('');
    return true;
}

// Delete every rubber-band-selected language at once, expanding to full subtrees
// so no descendant is orphaned; also drops borrowings and second-parent links
// that would dangle. One confirm, one save (undoable).
async function deleteMulti() {
    const picked = [...state.multi];
    if (picked.length < 2) return;
    const remove = new Set();
    for (const id of picked) for (const sid of subtreeIds(id)) remove.add(sid);
    const extra = remove.size - picked.length;
    const msg = `Delete ${remove.size} languages` +
        (extra > 0 ? ` (${picked.length} selected + ${extra} descendant${extra === 1 ? '' : 's'})` : '') +
        `? A backup is kept on every save.`;
    if (!confirm(msg)) return;
    const res = await applyEdit(doc => {
        doc.languages = doc.languages.filter(l => !remove.has(l.id));
        for (const l of doc.languages) if (l.secondaryParentId && remove.has(l.secondaryParentId)) delete l.secondaryParentId;
        if (doc.borrowings) doc.borrowings = doc.borrowings.filter(b => !remove.has(b.fromId) && !remove.has(b.toId));
    });
    if (res.ok) { state.multi = new Set(); state.selection = null; toast(`Deleted ${remove.size} languages.`); }
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
        x = worldXToScreen(state.pending.worldX);
        y = warpY(state.pending.born) * yScaleNow() + state.view.panY;
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
    cancelReparentPick();
    state.pending = spec;
    requestRender();
    showInline({ mode: 'create' }, '');
}

// Insert a new language directly ABOVE (older than) an existing one: the new box
// takes the child's place in the tree and the child becomes its stage successor.
// Same inline-name flow as any other create; commitInline does the re-pointing.
function startInsertAbove(id) {
    const child = state.model?.byId.get(id);
    if (!child) return;
    const parent = child.parentId != null ? state.model.byId.get(child.parentId) : null;
    // A born year strictly before the child, and valid against any grandparent.
    let born = parent ? Math.floor((parent.born + child.born) / 2) : child.born - 100;
    if (parent) {
        const minBorn = child.relation === 'stage' ? parent.born + 1 : parent.born;
        born = Math.max(born, minBorn);
    }
    if (born >= child.born) born = child.born - 1;
    const lx = state.layout.pos.get(id)?.x ?? 0;
    startPending({ relation: 'insert-above', childId: id, born, worldX: lx });
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
        // Keep the id in step with the name: reslug and cascade the new id through
        // every reference (parent/secondary-parent links, borrowings) so the doc
        // stays consistent. View-state that keys off the id (selection, collapse)
        // is remapped up front so the post-save rebuild doesn't prune it.
        const taken = new Set(state.doc.languages.filter(x => x.id !== id).map(x => x.id));
        const newId = slugify(name, taken);
        if (newId !== id) {
            if (selLangId() === id) state.selection = { type: 'lang', id: newId };
            if (state.collapsed.has(id)) { state.collapsed.delete(id); state.collapsed.add(newId); persistCollapsed(); }
        }
        const res = await applyEdit(doc => {
            const l = doc.languages.find(x => x.id === id);
            if (!l) return;
            l.name = name;
            if (newId === id) return;
            l.id = newId;
            for (const x of doc.languages) {
                if (x.parentId === id) x.parentId = newId;
                if (x.secondaryParentId === id) x.secondaryParentId = newId;
            }
            for (const b of doc.borrowings ?? []) {
                if (b.fromId === id) b.fromId = newId;
                if (b.toId === id) b.toId = newId;
            }
        });
        if (!res.ok && newId !== id) {
            // Save was rejected — roll the optimistic view-state remap back.
            if (selLangId() === newId) state.selection = { type: 'lang', id };
            if (state.collapsed.has(newId)) { state.collapsed.delete(newId); state.collapsed.add(id); persistCollapsed(); }
        }
        return;
    }

    const p = state.pending;
    state.pending = null;
    hideInline();
    requestRender();
    if (!p || !name) return;
    const res = await applyEdit(doc => {
        const taken = new Set(doc.languages.map(l => l.id));
        // Insert-above: the new language slots into the child's place in the tree
        // and the child becomes its stage successor (handed over at the child's birth).
        if (p.relation === 'insert-above') {
            const child = doc.languages.find(x => x.id === p.childId);
            if (!child) return {};
            const newLang = { id: slugify(name, taken), name, born: p.born, died: child.born };
            if (child.parentId != null) {
                newLang.parentId = child.parentId;
                newLang.relation = child.relation ?? 'branch';
                if (child.order != null) newLang.order = child.order;
                // If the child was a stage hand-over, its predecessor now hands
                // over to the newly inserted stage instead (keeps the chain tidy).
                if (newLang.relation === 'stage') {
                    const oldParent = doc.languages.find(x => x.id === child.parentId);
                    if (oldParent && oldParent.died === child.born) oldParent.died = newLang.born;
                }
            }
            doc.languages.push(newLang);
            child.parentId = newLang.id;
            child.relation = 'stage';
            delete child.order;
            return { selectId: newLang.id };
        }
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

function startLink(toId) {
    cancelPending();
    cancelReparentPick();
    state.linkInto = toId;
    els.viewport.classList.add('link-mode');
    const name = state.model.byId.get(toId)?.name ?? toId;
    setStatus('Pick the source language…');
    toast(`Now click the language that ${name} borrowed from (Esc cancels).`);
}

function cancelLink() {
    if (!state.linkInto) return false;
    state.linkInto = null;
    els.viewport.classList.remove('link-mode');
    setStatus('');
    return true;
}

function finishLink(fromId) {
    const toId = state.linkInto;
    cancelLink();
    openBorrowingForm(appApi(), { fromId, toId });
}

// --- gestures: pan / time-drag / branch handle / click -------------------

let gesture = null;
let suppressClick = false;
// Manual double-click detection: native `dblclick` fires unreliably once a
// pointer has been captured (setPointerCapture on the box gesture), so we time
// two stationary taps on the same box ourselves.
let lastTap = { id: null, t: 0 };

// --- edge auto-pan while dragging ------------------------------------------
// Holding a drag (box move / re-parent, branch ● handle, borrowing-link handle)
// near a viewport edge scrolls the view toward the cursor, so a long drag never
// needs to be interrupted to pan. Speed ramps up with edge proximity. Each pan
// step re-feeds the last pointer position through onPointerMove so the dragged
// thing keeps tracking the cursor into the newly revealed area. Plain panning,
// scrubbing and marquee-select deliberately don't auto-pan.
const EDGE_PAN_GESTURES = new Set(['box', 'handle', 'link-handle']);
const EDGE_PAN_ZONE = 48;  // px from each edge where auto-pan kicks in
const EDGE_PAN_MAX = 16;   // px per frame at (or past) the very edge
let edgePanRaf = null;
let lastDragPointer = null;

function scheduleEdgePan() {
    if (edgePanRaf == null) edgePanRaf = requestAnimationFrame(edgePanStep);
}

function edgePanStep() {
    edgePanRaf = null;
    if (!gesture || !lastDragPointer || !EDGE_PAN_GESTURES.has(gesture.type)) return;
    const r = els.viewport.getBoundingClientRect();
    // -1..1 push factor: 0 inside the safe area, ramping to ±1 at the edge
    // (pointer capture keeps events flowing past the edge — stays at full speed).
    const ramp = (pos, lo, hi) => {
        if (pos < lo + EDGE_PAN_ZONE) return -Math.min(1, (lo + EDGE_PAN_ZONE - pos) / EDGE_PAN_ZONE);
        if (pos > hi - EDGE_PAN_ZONE) return Math.min(1, (pos - (hi - EDGE_PAN_ZONE)) / EDGE_PAN_ZONE);
        return 0;
    };
    const fx = ramp(lastDragPointer.clientX, r.left, r.right);
    const fy = ramp(lastDragPointer.clientY, r.top, r.bottom);
    if (!fx && !fy) return; // pointer back inside the safe area — loop ends
    const v = isTree() ? state.treeView : state.view;
    const beforeX = v.panX, beforeY = v.panY;
    // Pointer at the bottom edge → reveal content below → content shifts up.
    v.panX -= fx * EDGE_PAN_MAX;
    v.panY -= fy * EDGE_PAN_MAX;
    clampView();
    const dpx = v.panX - beforeX, dpy = v.panY - beforeY;
    if (!dpx && !dpy) return; // clamped against the content bounds — stop
    // A box time-drag measures its offset from the grab point in screen space;
    // shift the grab point with the pan so the box stays glued to the cursor.
    if (gesture.type === 'box') { gesture.downX += dpx; gesture.downY += dpy; }
    persistViewSoon();
    // Re-derive the drag at the new pan; this also schedules the next step.
    onPointerMove(lastDragPointer);
}

function onPointerDown(e) {
    if (!state.model) return;
    // Left button only. Empty canvas pans (Shift = rubber-band select); grabbing
    // a box or its ● handle is direct manipulation (move in time / branch).
    if (e.button !== 0) return;
    closeMenu();

    const scrubEl = e.target.closest?.('[data-scrub]');
    const handleEl = e.target.closest?.('.branch-handle');
    const linkHandleEl = e.target.closest?.('.link-handle');
    const boxEl = e.target.closest?.('[data-id]');
    if (scrubEl && state.scrub) {
        if (playRaf != null) stopPlay(); // grabbing the chip pauses playback
        gesture = { type: 'scrub' };
        els.svg.setPointerCapture(e.pointerId);
        return;
    }
    if (linkHandleEl && !state.linkInto && !state.reparentFrom) {
        const { px, py } = vpPoint(e);
        gesture = { type: 'link-handle', toId: linkHandleEl.getAttribute('data-link-handle'), moved: false, startX: px, startY: py };
    } else if (handleEl && !state.linkInto && !state.reparentFrom) {
        const { px, py } = vpPoint(e);
        gesture = { type: 'handle', parentId: handleEl.getAttribute('data-handle'), moved: false, startX: px, startY: py };
    } else if (boxEl && !state.linkInto && !state.reparentFrom && !state.pending) {
        const id = boxEl.getAttribute('data-id');
        const lang = state.model.byId.get(id);
        if (!lang) return;
        // Alt makes this a re-parent drag (drop onto another box to move it there).
        gesture = { type: 'box', id, lang, moved: false, downX: e.clientX, downY: e.clientY, alt: e.altKey };
    } else if (!state.linkInto && !state.reparentFrom && !state.pending) {
        // Empty canvas: a plain drag pans; Shift+drag rubber-bands a selection.
        if (e.shiftKey) {
            const { px, py } = vpPoint(e);
            gesture = { type: 'marquee', x0: px, y0: py, moved: false };
        } else {
            gesture = { type: 'pan', lastX: e.clientX, lastY: e.clientY, dist: 0 };
            els.svg.classList.add('dragging');
        }
    } else {
        // In borrowing-link or pending-create mode a bare click is handled by
        // onClick — don't start a gesture.
        return;
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

    // Feed the edge auto-pan loop (only the fields the drag logic reads — this
    // same object is replayed through onPointerMove on every auto-pan step).
    if (EDGE_PAN_GESTURES.has(gesture.type)) {
        lastDragPointer = { clientX: e.clientX, clientY: e.clientY, ctrlKey: e.ctrlKey };
        scheduleEdgePan();
    }

    if (gesture.type === 'scrub') {
        state.scrub = { year: Math.round(yearAt(py)) };
        requestRender();
        return;
    }

    if (gesture.type === 'marquee') {
        gesture.moved = true;
        state.marquee = { x0: gesture.x0, y0: gesture.y0, x1: px, y1: py };
        state.multi = boxesInRect(gesture.x0, gesture.y0, px, py);
        requestRender();
        return;
    }

    if (gesture.type === 'pan') {
        const dx = e.clientX - gesture.lastX, dy = e.clientY - gesture.lastY;
        gesture.dist += Math.abs(dx) + Math.abs(dy);
        if (gesture.dist > 3) gesture.moved = true;
        const v = isTree() ? state.treeView : state.view;
        v.panX += dx; v.panY += dy;
        gesture.lastX = e.clientX; gesture.lastY = e.clientY;
        clampView(); persistViewSoon(); requestRender();
        return;
    }

    if (gesture.type === 'box') {
        const dx = e.clientX - gesture.downX, dy = e.clientY - gesture.downY;
        if (!gesture.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
        if (gesture.alt) {
            // Re-parent drag: highlight the box under the cursor as the drop target.
            gesture.moved = true;
            const targetId = boxAt(px, py, gesture.id);
            state.reparent = { id: gesture.id, targetId };
            const nm = targetId ? (state.model.byId.get(targetId)?.name ?? targetId) : null;
            showReadout(px, py, nm ? `Move under ${nm}` : 'Drop onto a language to move it there');
            requestRender();
            return;
        }
        // Tree view has no year axis: a plain box drag neither moves it in time nor
        // reorders siblings — the box just stays put and selects on release. (Alt =
        // re-parent, handled above, still works since it's purely structural.)
        if (isTree()) return;
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
        // Grabbing a box that's part of a rubber-band selection drags the whole
        // group rigidly (born + died); Ctrl drags the grabbed box's subtree.
        const inMulti = state.multi.size > 1 && state.multi.has(lang.id);
        const subtree = e.ctrlKey && !inMulti;
        const ids = inMulti ? [...state.multi] : subtree ? subtreeIds(lang.id) : [lang.id];
        // Chain semantics: a language with a stage successor is glued to it at
        // its death year, so a plain drag moves its birth only.
        const hasStageSucc = state.model.stageChild.has(lang.id);
        const shiftDied = inMulti || subtree || !hasStageSucc;
        // dy is warped pixels; convert via the box's own position on the warped
        // axis so a drag across a folded stretch lands on the year under the cursor.
        let delta = Math.round(unwarpY(warpY(lang.born) + dy / yScaleNow()) - lang.born);
        if (!shiftDied && lang.died != null) delta = Math.min(delta, lang.died - lang.born);
        const parent = lang.parentId != null ? state.model.byId.get(lang.parentId) : null;
        if (parent) {
            const minBorn = lang.relation === 'stage' ? parent.born + 1 : parent.born;
            delta = Math.max(delta, minBorn - lang.born);
        }
        state.drag = { ids: new Set(ids), delta, shiftDied };
        showReadout(px, py, `Born ${lang.born + delta}` +
            (inMulti ? ` · moving ${ids.length} selected` : subtree ? ' · moving whole family' : ''));
        requestRender();
        return;
    }

    if (gesture.type === 'link-handle') {
        if (!gesture.moved && Math.hypot(px - gesture.startX, py - gesture.startY) < 6) return;
        gesture.moved = true;
        const targetId = boxAt(px, py, gesture.toId);
        state.linkDrag = { toId: gesture.toId, x: px, y: py, targetId };
        const tName = targetId ? state.model.byId.get(targetId)?.name : null;
        showReadout(px, py, tName ? `Borrowing from ${tName}` : 'Drop onto the source language…');
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
    lastDragPointer = null;
    if (edgePanRaf != null) { cancelAnimationFrame(edgePanRaf); edgePanRaf = null; }
    els.svg.classList.remove('dragging');
    try { els.svg.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    hideReadout();
    if (g.moved) suppressClick = true;

    if (g.type === 'scrub') { suppressClick = true; return; }

    if (g.type === 'marquee') {
        state.marquee = null;
        if (g.moved) suppressClick = true;
        const ids = [...state.multi];
        // Collapse a 1-box catch to a normal selection; keep 2+ as the group.
        if (ids.length === 1) select({ type: 'lang', id: ids[0] });
        else { state.selection = null; refreshHighlight(); requestRender(); renderPanelNow(); }
        return;
    }

    if (g.type === 'box' && g.moved) {
        if (g.alt) {
            const targetId = state.reparent?.targetId;
            state.reparent = null;
            if (targetId) await commitReparent(g.id, targetId);
            else requestRender();
            return;
        }
        if (g.axis === 'x') { await commitReorder(g.id, g.reorderCtx, g.reorderTo); return; }
        const drag = state.drag;
        state.drag = null;
        if (drag && drag.delta !== 0) await commitMove(g.lang, drag);
        else requestRender();
        return;
    }
    if (g.type === 'box' && !g.moved) {
        // Stationary tap on a box selects it; a second tap within 400ms opens
        // its edit form (single-click = select, double-click = edit).
        const now = Date.now();
        if (lastTap.id === g.id && now - lastTap.t < 400) {
            lastTap = { id: null, t: 0 };
            suppressClick = true;
            openLanguageForm(appApi(), { mode: 'edit', langId: g.id });
        } else {
            lastTap = { id: g.id, t: now };
            suppressClick = true; // selection handled here, not in the click event
            clearMulti();
            select({ type: 'lang', id: g.id });
        }
        return;
    }
    if (g.type === 'link-handle') {
        const target = state.linkDrag?.targetId;
        state.linkDrag = null;
        requestRender();
        if (g.moved && target) openBorrowingForm(appApi(), { fromId: target, toId: g.toId });
        return;
    }
    if (g.type === 'handle') {
        state.handleDrag = null;
        if (g.moved && g.born != null) {
            const { px } = vpPoint(e);
            startPending({ relation: 'branch', parentId: g.parentId, born: g.born, worldX: screenXToWorld(px) });
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
    const wx = screenXToWorld(px); // pointer world-x (mirrors the renderer's packing)
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
    state.reorder = { id: gesture.id, caretX: worldXToScreen(caretWX), to };
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

    // A collapse badge toggles rather than selects (works without Shift).
    const badge = e.target.closest?.('[data-collapse]');
    if (badge) { clearMulti(); toggleCollapse(badge.getAttribute('data-collapse')); return; }

    const boxEl = e.target.closest?.('[data-id]');
    const id = boxEl ? boxEl.getAttribute('data-id') : null;

    // Re-parent pick mode: a bare click chooses the new parent (or cancels).
    if (state.reparentFrom) {
        clearMulti();
        const from = state.reparentFrom;
        if (id && id !== from) { cancelReparentPick(); commitReparent(from, id); }
        else if (!id) { cancelReparentPick(); toast('Move cancelled.'); }
        return;
    }

    // Borrowing-link mode: a bare click finishes or cancels the pending link.
    if (state.linkInto) {
        clearMulti();
        if (id && id !== state.linkInto) finishLink(id);
        else if (!id) { cancelLink(); toast('Borrowing cancelled.'); }
        return;
    }

    // A plain left-click selects. Boxes are already handled by the pointer
    // gesture (single tap = select, double tap = edit), so only borrowing
    // arrows, event bands, and the empty canvas are resolved here.
    if (id) return;
    clearMulti();  // a fresh click resets any rubber-band group
    const borEl = e.target.closest?.('[data-borrow-id]');
    if (borEl) { select({ type: 'borrowing', id: borEl.getAttribute('data-borrow-id') }); return; }
    const evEl = e.target.closest?.('[data-event-id]');
    if (evEl) { select({ type: 'event', id: evEl.getAttribute('data-event-id') }); return; }
    select(null);
}

// --- context menus -------------------------------------------------------

function onContextMenu(e) {
    e.preventDefault();
    if (!state.model) return;
    cancelLink();
    cancelReparentPick();
    const gEl = e.target.closest?.('[data-id], .branch-handle');
    const id = gEl?.getAttribute?.('data-id') ?? gEl?.getAttribute?.('data-handle') ?? null;
    const { px, py } = vpPoint(e);
    if (id && state.model.byId.has(id)) openBoxMenu(id, e.clientX, e.clientY);
    // The canvas menu's actions are year-based ("new language here (born N)"), so it
    // only makes sense on the timeline. In tree view, right-clicking empty space does
    // nothing — add a family from the toolbar, or a daughter from the box menu.
    else if (!isTree()) openCanvasMenu(e.clientX, e.clientY, Math.round(yearAt(py)), px);
}

function openBoxMenu(id, cx, cy) {
    const l = state.model.byId.get(id);
    if (!l) return;
    // Right-click only opens the menu — it doesn't select the box (menu actions
    // all target `id` directly). Left-click is the way to select.
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
        {
            label: 'New earlier stage (above)',
            hint: 'Inserts an older predecessor; this language becomes its next era',
            run: () => startInsertAbove(id),
        },
        'sep',
        {
            label: 'Move into another branch…',
            hint: 'Then click the new parent (or Alt-drag the box onto it)',
            run: () => startReparentPick(id),
        },
        { label: 'Borrowing into this…', run: () => startLink(id) },
        'sep',
        { label: 'Delete…', kbd: 'Del', danger: true, run: () => confirmDeleteLanguage(appApi(), id) },
    ]);
}

function openCanvasMenu(cx, cy, year, px) {
    showMenu(cx, cy, [
        {
            label: `New language here (born ${year})`,
            hint: 'Starts a new family at this year',
            run: () => startPending({ relation: 'root', born: year, worldX: screenXToWorld(px) }),
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
        const px = e.clientX - r.left, py = e.clientY - r.top;
        if (isTree()) {
            const tv = state.treeView;
            if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
                tv.panX -= (e.deltaX || e.deltaY);
            } else {
                // Uniform zoom anchored on the cursor.
                const wx = (px - tv.panX) / tv.scale, wy = (py - tv.panY) / tv.scale;
                tv.scale = clamp(tv.scale * (e.deltaY < 0 ? 1.2 : 1 / 1.2), TREE_ZOOM_MIN, TREE_ZOOM_MAX);
                tv.panX = px - wx * tv.scale;
                tv.panY = py - wy * tv.scale;
            }
            clampView(); persistViewSoon(); requestRender();
            return;
        }
        if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
            state.view.panX -= (e.deltaX || e.deltaY);
        } else {
            const v = state.view;
            const yearUnder = (py - v.panY) / yScaleNow();
            const wxUnder = screenXToWorld(px);
            v.pxPerYear = clamp(v.pxPerYear * (e.deltaY < 0 ? 1.2 : 1 / 1.2), zoomFloor(), ZOOM_MAX);
            v.panY = py - yearUnder * yScaleNow();
            // Horizontal packing rescales with the zoom (boxScaleNow); re-anchor
            // panX so the column under the cursor stays put, not the left gutter.
            v.panX = px - GUTTER_W - (wxUnder - GUTTER_W) * boxScaleNow();
        }
        clampView(); persistViewSoon(); requestRender();
    }, { passive: false });

    els.svg.addEventListener('pointerdown', onPointerDown);
    els.svg.addEventListener('pointermove', onPointerMove);
    els.svg.addEventListener('pointerup', onPointerUp);
    els.svg.addEventListener('pointercancel', onPointerUp);
    els.svg.addEventListener('pointerleave', () => { if (!gesture) setHover(null); });
    els.svg.addEventListener('click', onClick);
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
    els.btnZoomIn?.addEventListener('click', () => zoomBy(1.4));
    els.btnZoomOut?.addEventListener('click', () => zoomBy(1 / 1.4));
    els.btnZoomReset?.addEventListener('click', fitAndRender);
    els.btnAddRoot.addEventListener('click', () => openLanguageForm(appApi(), { mode: 'add-root' }));
    els.btnBorrow.addEventListener('click', () => openBorrowingForm(appApi(), { toId: selLangId() ?? undefined }));
    els.btnSettings.addEventListener('click', () => openSettingsForm(appApi()));
    els.btnDownload.addEventListener('click', () => { if (state.doc) downloadDoc(state.doc); });
    els.btnSearch?.addEventListener('click', () => openSearch());
    els.btnScrub?.addEventListener('click', toggleScrub);
    els.btnPlay?.addEventListener('click', togglePlay);
    els.btnLiving?.addEventListener('click', toggleLivingFilter);
    els.btnMinimap?.addEventListener('click', toggleMinimap);
    els.btnMinimap?.setAttribute('aria-pressed', state.minimapOn ? 'true' : 'false');
    els.btnBorrows?.addEventListener('click', toggleShowBorrows);
    applyShowBorrows();
    els.btnLayout?.addEventListener('click', toggleLayout);
    updateLayoutButton();
    wireMinimap();
    els.panelToggle?.addEventListener('click', () => setPanelCollapsed(!isPanelCollapsed()));
    applyPanelCollapsed(isPanelCollapsed());
    els.btnExport?.addEventListener('click', () => doExport('svg'));
    els.btnHelp?.addEventListener('click', openHelp);

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
        if (k === 'F1' || k === '?') { e.preventDefault(); if (els.dlg.open) els.dlg.close(); else openHelp(); return; }
        const lid = selLangId();
        if (k === 'ArrowDown') { e.preventDefault(); navigate('down'); return; }
        if (k === 'ArrowUp') { e.preventDefault(); navigate('up'); return; }
        if (k === 'ArrowLeft') { e.preventDefault(); navigate('left'); return; }
        if (k === 'ArrowRight') { e.preventDefault(); navigate('right'); return; }
        if ((k === 'c' || k === 'C') && lid) { toggleCollapse(lid); return; }
        if (k === 't' || k === 'T') { toggleLayout(); return; }
        if ((k === 'f' || k === 'F')) { fitAndRender(); return; }
        if (k === '+' || k === '=') { e.preventDefault(); zoomBy(1.4); return; }
        if (k === '-' || k === '_') { e.preventDefault(); zoomBy(1 / 1.4); return; }
        if (k === '0') { e.preventDefault(); fitAndRender(); return; }
        if (k === 'Enter' && lid) { e.preventDefault(); openLanguageForm(appApi(), { mode: 'edit', langId: lid }); return; }
        if (k === 'Delete' || k === 'Backspace') {
            e.preventDefault();
            if (state.multi.size > 1) { deleteMulti(); return; }
            const sel = state.selection;
            if (sel?.type === 'lang') { confirmDeleteLanguage(appApi(), sel.id); return; }
            if (sel?.type === 'borrowing') { deleteBorrowing(appApi(), sel.id); return; }
            if (sel?.type === 'event') { deleteEvent(appApi(), sel.id); return; }
            return;
        }
        if (k === 'F2' && lid) { e.preventDefault(); beginRename(lid); return; }
        if (k === 'Escape') {
            if (isSearchOpen()) { closeSearch(); return; }
            if (cancelPending()) return;
            if (closeMenu()) return;
            if (cancelReparentPick()) return;
            if (cancelLink()) return;
            if (state.multi.size) { clearMulti(); return; }
            if (state.scrub) { toggleScrub(); return; }
            if (state.filter) { setFilter(null); return; }
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
        case 'add-borrowing': openBorrowingForm(app, { toId: lid ?? undefined }); break;
        case 'delete': confirmDeleteLanguage(app, lid); break;
        case 'delete-borrowing': deleteBorrowing(app, btn.getAttribute('data-bid')); break;
        case 'edit-borrowing': openBorrowingForm(app, { borrowingId: btn.getAttribute('data-bid') }); break;
        case 'add-event': openEventForm(app, {}); break;
        case 'edit-event': openEventForm(app, { eventId: btn.getAttribute('data-eid') }); break;
        case 'delete-event': deleteEvent(app, btn.getAttribute('data-eid')); break;
        case 'toggle-collapse': toggleCollapse(btn.getAttribute('data-id') ?? lid); break;
        case 'focus-family': focusFamily(btn.getAttribute('data-root')); break;
        case 'focus-region': focusRegion(btn.getAttribute('data-region')); break;
        case 'open-polyglot': doOpenPolyglot(btn.getAttribute('data-id') ?? lid); break;
        case 'manage-groups': openGroupsForm(app); break;
        case 'export': openExportChoice(); break;
        case 'help': openHelp(); break;
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
