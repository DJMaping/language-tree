// Ctrl+K language finder. A small overlay that filters languages by name or id
// as you type; Enter / click jumps to and selects the chosen language. Stateless
// beyond its own open flag + active-row index — main.js supplies focusLanguage.

const esc = s => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const MAX_ROWS = 20;

let host, input, results;
let app = null;         // { getModel, focusLanguage }
let rows = [];          // [{ id }]
let active = 0;

export function initSearch(appApi) {
    app = appApi;
    host = document.getElementById('search');
    input = host.querySelector('#search-input');
    results = host.querySelector('#search-results');

    input.addEventListener('input', refresh);
    input.addEventListener('keydown', onKey);
    results.addEventListener('click', (e) => {
        const row = e.target.closest('[data-id]');
        if (row) pick(row.getAttribute('data-id'));
    });
    // Click outside the box closes.
    host.addEventListener('pointerdown', (e) => { if (e.target === host) close(); });
}

export function isSearchOpen() { return host && !host.hidden; }

export function openSearch() {
    if (!host) return;
    host.hidden = false;
    input.value = '';
    refresh();
    input.focus();
}

export function closeSearch() { close(); }

function close() {
    if (!host) return;
    host.hidden = true;
    rows = [];
}

function score(l, q) {
    const name = l.name.toLowerCase(), id = l.id.toLowerCase();
    const iName = name.indexOf(q), iId = id.indexOf(q);
    if (iName === -1 && iId === -1) return null;
    const pos = iName === -1 ? iId : iName;
    return pos + (iName === 0 || iId === 0 ? 0 : 0.5); // prefix matches sort first
}

function refresh() {
    const model = app.getModel();
    const q = input.value.trim().toLowerCase();
    const scored = [];
    for (const l of model.languages) {
        if (!q) { scored.push({ l, s: 0 }); continue; }
        const s = score(l, q);
        if (s != null) scored.push({ l, s });
    }
    scored.sort((a, b) => a.s - b.s || a.l.name.localeCompare(b.l.name));
    rows = scored.slice(0, MAX_ROWS).map(x => ({ id: x.l.id }));
    active = 0;
    render(model);
}

function render(model) {
    if (!rows.length) {
        results.innerHTML = `<div class="search-empty">No matching language.</div>`;
        return;
    }
    results.innerHTML = rows.map((r, i) => {
        const l = model.byId.get(r.id);
        const color = model.colorOf.get(r.id);
        const yrs = l.died != null ? `${l.born} – ${l.died}` : `${l.born} – now`;
        return `<div class="search-row${i === active ? ' active' : ''}" data-id="${esc(r.id)}">` +
            `<span class="color-dot" style="background:${color}"></span>` +
            `<span class="search-name">${esc(l.name)}</span>` +
            `<span class="hint">${esc(yrs)}</span></div>`;
    }).join('');
}

function move(delta) {
    if (!rows.length) return;
    active = (active + delta + rows.length) % rows.length;
    render(app.getModel());
    results.querySelector('.search-row.active')?.scrollIntoView({ block: 'nearest' });
}

function onKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); if (rows[active]) pick(rows[active].id); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
}

function pick(id) {
    close();
    app.focusLanguage(id);
}
