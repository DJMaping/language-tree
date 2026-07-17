// Stateless side panel. main.js owns all state and re-calls renderPanel on any
// selection/data change; clicks inside the panel are delegated in main.js via
// the data-select / data-action attributes emitted here.

const esc = s => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// A died-year with a stage successor is a renaming, not an extinction — no †.
const years = (l, model) => (l.died != null
    ? `${l.born} – ${l.died}${model?.stageChild.has(l.id) ? '' : ' †'}`
    : `${l.born} – now`);

const langLink = (model, id) => {
    const l = model.byId.get(id);
    return l ? `<button class="linklike" data-select="${esc(l.id)}">${esc(l.name)}</button>` : esc(id);
};

const KIND_LABEL = {
    loan: 'Loanwords', substrate: 'Substrate', superstrate: 'Superstrate', areal: 'Areal / sprachbund',
};

export function renderPanel(el, ctx) {
    const { model, config, selected } = ctx;
    if (selected?.type === 'lang' && model.byId.has(selected.id)) {
        el.innerHTML = detailHtml(model, model.byId.get(selected.id));
    } else if (selected?.type === 'borrowing' && model.borrowingById.has(selected.id)) {
        el.innerHTML = borrowingDetailHtml(model, model.borrowingById.get(selected.id));
    } else if (selected?.type === 'event' && model.eventById.has(selected.id)) {
        el.innerHTML = eventDetailHtml(model, model.eventById.get(selected.id));
    } else {
        el.innerHTML = overviewHtml(model, config);
    }
}

function overviewHtml(model, config) {
    const n = model.languages.length;
    const fams = model.roots.length;
    let yearsLine = '';
    if (n) {
        const min = Math.min(...model.languages.map(l => l.born));
        const max = Math.max(config?.presentYear ?? -Infinity, ...model.languages.map(l => l.died ?? l.born));
        yearsLine = ` · years ${min} to ${max}`;
    }

    const famRows = model.roots.map(r => {
        const color = model.colorOf.get(r.id);
        return `<div class="legend-row"><span class="color-dot" style="background:${color}"></span>` +
            `${langLink(model, r.id)}<span class="hint">${esc(years(r, model))}</span></div>`;
    }).join('') || '<p class="hint">No families yet.</p>';

    const sample = (inner) => `<svg width="46" height="14" viewBox="0 0 46 14" aria-hidden="true">${inner}</svg>`;
    const borSample = cls => sample(`<line x1="2" y1="7" x2="38" y2="7" class="${cls}" stroke-width="1.5"/><path d="M 38 3 L 44 7 L 38 11 z" fill="var(--muted)"/>`);
    const legend =
        `<div class="legend-row">${sample('<line x1="2" y1="7" x2="44" y2="7" stroke="var(--fam-0)" stroke-width="2"/>')}<span>Stage — same language renamed over time</span></div>` +
        `<div class="legend-row">${sample('<path d="M 2 12 L 20 12 Q 26 12 26 6 L 26 2 L 44 2" fill="none" stroke="var(--fam-0)" stroke-width="2"/>')}<span>Daughter branch</span></div>` +
        `<div class="legend-row">${sample('<line x1="2" y1="7" x2="44" y2="7" stroke="var(--fam-1)" stroke-width="2" stroke-dasharray="10 4" stroke-opacity="0.55"/>')}<span>Second parent (creole)</span></div>` +
        `<div class="legend-row">${borSample('conn-borrow kind-loan')}<span>Borrowing — loanwords</span></div>` +
        `<div class="legend-row">${borSample('conn-borrow kind-substrate')}<span>Borrowing — substrate</span></div>` +
        `<div class="legend-row">${borSample('conn-borrow kind-superstrate')}<span>Borrowing — superstrate</span></div>` +
        `<div class="legend-row">${borSample('conn-borrow kind-areal')}<span>Borrowing — areal / sprachbund</span></div>`;

    const events = model.events ?? [];
    const eventRows = events.map(ev => {
        const span = ev.endYear != null && ev.endYear !== ev.year ? `${ev.year} – ${ev.endYear}` : `${ev.year}`;
        const dot = ev.color ? `<span class="color-dot" style="background:${ev.color}"></span>` : '';
        return `<div class="legend-row">${dot}<button class="linklike" data-select-event="${esc(ev.id)}">${esc(ev.label)}</button>` +
            `<span class="hint">${esc(span)}</span></div>`;
    }).join('');
    const timeline = `<div class="panel-section"><h3>Timeline</h3>${eventRows || '<p class="hint">No events yet.</p>'}` +
        `<div class="btn-row"><button class="btn" data-action="add-event">+ Event</button></div></div>`;

    return `
        <h2>${esc(config?.title ?? 'Language tree')}</h2>
        <p class="panel-sub">${n} language${n === 1 ? '' : 's'} · ${fams} famil${fams === 1 ? 'y' : 'ies'}${esc(yearsLine)}</p>
        <div class="panel-section"><h3>Families</h3>${famRows}</div>
        ${timeline}
        <div class="panel-section"><h3>Legend</h3>${legend}</div>
        <div class="panel-section"><h3>Controls</h3>
            <p class="hint"><b>Right-click</b> empty space → new language there · right-click a box for all its actions.</p>
            <p class="hint"><b>Drag a box</b> up/down to move it in time (hold <b>Ctrl</b> to move its whole family), or left/right to reorder it among its siblings · drag its <b>●</b> handle into empty space to branch off a daughter.</p>
            <p class="hint"><b>Ctrl+K</b> search · <b>arrow keys</b> walk the tree · <b>c</b> collapse/expand · <b>Double-click</b>/F2 rename · <b>Del</b> deletes · <b>Ctrl+Z</b>/<b>Ctrl+Y</b> undo/redo.</p>
            <p class="hint">Every change saves instantly. The data lives in <code>data/languages.json</code> — edit it in VS Code (or ask Claude to) and this window refreshes itself.</p>
            <div class="btn-row">
                <button class="btn" data-action="add-root">+ Root language</button>
                <button class="btn" data-action="add-borrowing">+ Borrowing</button>
                <button class="btn" data-action="export">Export image…</button>
            </div>
        </div>`;
}

function detailHtml(model, l) {
    const color = model.colorOf.get(l.id);
    const stageNext = model.stageChild.get(l.id);
    const daughters = (model.branchChildren.get(l.id) ?? []);
    const { out, incoming } = model.borrowingsOf(l.id);

    let lineage;
    if (l.parentId == null) lineage = 'Family root';
    else if (l.relation === 'stage') lineage = `Stage of ${langLink(model, l.parentId)}`;
    else lineage = `Daughter of ${langLink(model, l.parentId)}`;

    const secondary = l.secondaryParentId != null
        ? `<div class="kv"><b>Second parent:</b> ${langLink(model, l.secondaryParentId)} <span class="hint">(creole)</span></div>` : '';

    const continues = stageNext
        ? `<div class="panel-section"><h3>Becomes</h3><div class="kv">${langLink(model, stageNext.id)} <span class="hint">from ${stageNext.born}</span></div></div>` : '';

    const daughterRows = daughters.map(d =>
        `<div class="kv">${langLink(model, d.id)} <span class="hint">${esc(years(d, model))}</span></div>`).join('');
    const daughterSection = daughters.length
        ? `<div class="panel-section"><h3>Daughters</h3>${daughterRows}</div>` : '';

    const borRow = (b, dir) => {
        const otherId = dir === 'out' ? b.toId : b.fromId;
        const meta = [KIND_LABEL[b.kind ?? 'loan'], b.year != null ? String(b.year) : null].filter(Boolean).join(', ');
        return `<div class="borrow-row"><span>${dir === 'out' ? '→ into' : '← from'} ${langLink(model, otherId)}` +
            ` <button class="linklike" data-select-borrowing="${esc(b.id)}">${esc(b.label || '(borrowing)')}</button>` +
            `${meta ? ` <span class="hint">(${esc(meta)})</span>` : ''}</span>` +
            `<button class="linklike" data-action="delete-borrowing" data-bid="${esc(b.id)}" title="Delete this borrowing">✕</button></div>`;
    };
    const borSection = (out.length || incoming.length)
        ? `<div class="panel-section"><h3>Borrowings</h3>${out.map(b => borRow(b, 'out')).join('')}${incoming.map(b => borRow(b, 'in')).join('')}</div>` : '';

    const notes = l.notes
        ? `<div class="panel-section"><h3>Notes</h3><p class="notes">${esc(l.notes)}</p></div>` : '';

    const hasDescendants = !!stageNext || daughters.length > 0;
    const isCollapsed = (model.collapsed && model.collapsed.has(l.id)) || false;
    const collapseBtn = hasDescendants
        ? `<button class="btn" data-action="toggle-collapse" data-id="${esc(l.id)}">${isCollapsed ? 'Expand subtree' : 'Collapse subtree'}</button>` : '';

    const polyglot = l.polyglotFile
        ? `<div class="panel-section"><h3>PolyGlot</h3><div class="kv"><code>${esc(l.polyglotFile)}</code></div>` +
          `<div class="btn-row"><button class="btn" data-action="open-polyglot" data-id="${esc(l.id)}">Open in PolyGlot</button></div>` +
          `<p class="hint">Launches the configured PolyGlot with this file (set the path in Settings).</p></div>` : '';

    return `
        <h2><span class="color-dot" style="background:${color}"></span>${esc(l.name)}</h2>
        <p class="panel-sub"><code>${esc(l.id)}</code></p>
        <div class="kv"><b>Years:</b> ${esc(years(l, model))}</div>
        <div class="kv"><b>Lineage:</b> ${lineage}</div>
        ${secondary}
        ${continues}
        ${daughterSection}
        ${borSection}
        ${notes}
        ${polyglot}
        <div class="btn-row">
            <button class="btn" data-action="rename" title="Rename in place (F2)">Rename</button>
            <button class="btn" data-action="edit">Edit</button>
            <button class="btn" data-action="add-stage" ${stageNext ? 'disabled title="Already has a stage successor"' : 'title="This language renamed/evolved into a new stage"'}>Add stage</button>
            <button class="btn" data-action="add-daughter">Add daughter</button>
            <button class="btn" data-action="add-borrowing">Add borrowing</button>
            ${collapseBtn}
            <button class="btn danger" data-action="delete">Delete</button>
        </div>
        <p class="hint" style="margin-top:8px"><button class="linklike" data-action="deselect">← Back to overview</button></p>`;
}

function borrowingDetailHtml(model, b) {
    const kind = b.kind ?? 'loan';
    return `
        <h2>Borrowing</h2>
        <p class="panel-sub"><code>${esc(b.id)}</code></p>
        <div class="kv"><b>From:</b> ${langLink(model, b.fromId)}</div>
        <div class="kv"><b>Into:</b> ${langLink(model, b.toId)}</div>
        <div class="kv"><b>Kind:</b> ${esc(KIND_LABEL[kind] ?? kind)}</div>
        ${b.year != null ? `<div class="kv"><b>Year:</b> ${esc(String(b.year))}</div>` : ''}
        ${b.label ? `<div class="panel-section"><h3>Label</h3><p class="notes">${esc(b.label)}</p></div>` : ''}
        <div class="btn-row">
            <button class="btn" data-action="edit-borrowing" data-bid="${esc(b.id)}">Edit</button>
            <button class="btn danger" data-action="delete-borrowing" data-bid="${esc(b.id)}">Delete</button>
        </div>
        <p class="hint" style="margin-top:8px"><button class="linklike" data-action="deselect">← Back to overview</button></p>`;
}

function eventDetailHtml(model, ev) {
    const span = ev.endYear != null && ev.endYear !== ev.year ? `${ev.year} – ${ev.endYear}` : `${ev.year}`;
    const dot = ev.color ? `<span class="color-dot" style="background:${ev.color}"></span>` : '';
    return `
        <h2>${dot}${esc(ev.label)}</h2>
        <p class="panel-sub"><code>${esc(ev.id)}</code></p>
        <div class="kv"><b>${ev.endYear != null && ev.endYear !== ev.year ? 'Years' : 'Year'}:</b> ${esc(span)}</div>
        ${ev.notes ? `<div class="panel-section"><h3>Notes</h3><p class="notes">${esc(ev.notes)}</p></div>` : ''}
        <div class="btn-row">
            <button class="btn" data-action="edit-event" data-eid="${esc(ev.id)}">Edit</button>
            <button class="btn danger" data-action="delete-event" data-eid="${esc(ev.id)}">Delete</button>
        </div>
        <p class="hint" style="margin-top:8px"><button class="linklike" data-action="deselect">← Back to overview</button></p>`;
}
