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

export function renderPanel(el, ctx) {
    const { model, config, selectedId } = ctx;
    const sel = selectedId != null ? model.byId.get(selectedId) : null;
    el.innerHTML = sel ? detailHtml(model, sel) : overviewHtml(model, config);
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
    const legend =
        `<div class="legend-row">${sample('<line x1="2" y1="7" x2="44" y2="7" stroke="var(--fam-0)" stroke-width="2"/>')}<span>Stage — same language renamed over time</span></div>` +
        `<div class="legend-row">${sample('<path d="M 2 12 L 20 12 Q 26 12 26 6 L 26 2 L 44 2" fill="none" stroke="var(--fam-0)" stroke-width="2"/>')}<span>Daughter branch</span></div>` +
        `<div class="legend-row">${sample('<line x1="2" y1="7" x2="44" y2="7" stroke="var(--fam-1)" stroke-width="2" stroke-dasharray="10 4" stroke-opacity="0.55"/>')}<span>Second parent (creole)</span></div>` +
        `<div class="legend-row">${sample('<line x1="2" y1="7" x2="38" y2="7" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="4 4"/><path d="M 38 3 L 44 7 L 38 11 z" fill="var(--muted)"/>')}<span>Borrowing / influence</span></div>`;

    return `
        <h2>${esc(config?.title ?? 'Language tree')}</h2>
        <p class="panel-sub">${n} language${n === 1 ? '' : 's'} · ${fams} famil${fams === 1 ? 'y' : 'ies'}${esc(yearsLine)}</p>
        <div class="panel-section"><h3>Families</h3>${famRows}</div>
        <div class="panel-section"><h3>Legend</h3>${legend}</div>
        <div class="panel-section"><h3>Tips</h3>
            <p class="hint">Scroll to zoom (the year under the cursor stays put) · drag to pan · click a box for details.</p>
            <p class="hint">Everything lives in <code>data/languages.json</code> — edit it in VS Code (or ask Claude to) and this page refreshes itself.</p>
            <div class="btn-row"><button class="btn" data-action="add-root">+ Root language</button></div>
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
        const meta = [b.label, b.year != null ? String(b.year) : null].filter(Boolean).join(', ');
        return `<div class="borrow-row"><span>${dir === 'out' ? '→ into' : '← from'} ${langLink(model, otherId)}` +
            `${meta ? ` <span class="hint">(${esc(meta)})</span>` : ''}</span>` +
            `<button class="linklike" data-action="delete-borrowing" data-bid="${esc(b.id)}" title="Delete this borrowing">✕</button></div>`;
    };
    const borSection = (out.length || incoming.length)
        ? `<div class="panel-section"><h3>Borrowings</h3>${out.map(b => borRow(b, 'out')).join('')}${incoming.map(b => borRow(b, 'in')).join('')}</div>` : '';

    const notes = l.notes
        ? `<div class="panel-section"><h3>Notes</h3><p class="notes">${esc(l.notes)}</p></div>` : '';

    const polyglot = l.polyglotFile
        ? `<div class="panel-section"><h3>PolyGlot</h3><div class="kv"><code>${esc(l.polyglotFile)}</code></div>` +
          `<p class="hint">Opening the file from here is planned for a later version.</p></div>` : '';

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
            <button class="btn" data-action="edit">Edit</button>
            <button class="btn" data-action="add-stage" ${stageNext ? 'disabled title="Already has a stage successor"' : 'title="This language renamed/evolved into a new stage"'}>Add stage</button>
            <button class="btn" data-action="add-daughter">Add daughter</button>
            <button class="btn" data-action="add-borrowing">Add borrowing</button>
            <button class="btn danger" data-action="delete">Delete</button>
        </div>
        <p class="hint" style="margin-top:8px"><button class="linklike" data-action="deselect">← Back to overview</button></p>`;
}
