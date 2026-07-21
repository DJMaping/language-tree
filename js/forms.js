// All <dialog>-based editing forms. Forms build a candidate document, run the
// shared validation, show field-level errors, and hand the doc to app.save()
// (provided by main.js). The data file stays the single source of truth.

import { validateDoc, BORROW_KINDS } from './validate.js';

const KIND_LABEL = {
    loan: 'Loanwords', substrate: 'Substrate', superstrate: 'Superstrate', areal: 'Areal / sprachbund',
};

const dlg = document.getElementById('dlg');

const esc = s => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function slugify(name, taken) {
    let s = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (!s) s = 'lang';
    let id = s, n = 2;
    while (taken.has(id)) id = `${s}-${n++}`;
    return id;
}

// Set-or-delete for optional fields, so untouched blanks never serialize.
function setOpt(obj, key, value) {
    if (value == null || value === '' || (typeof value === 'number' && Number.isNaN(value))) delete obj[key];
    else obj[key] = value;
}

function openDialog(html, onSubmit) {
    dlg.innerHTML = html;
    const form = dlg.querySelector('form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await onSubmit(form);
    });
    dlg.querySelector('[data-close]')?.addEventListener('click', () => dlg.close());
    dlg.showModal();
}

function fieldRow(name, label, input, hint = '') {
    return `<div class="form-row"><label for="f-${name}">${label}</label>${input}` +
        (hint ? `<div class="form-hint">${hint}</div>` : '') +
        `<div class="field-err" data-err="${name}"></div></div>`;
}

const textInput = (name, value = '', attrs = '') =>
    `<input id="f-${name}" name="${name}" type="text" value="${esc(value)}" ${attrs}>`;
const numInput = (name, value = '', attrs = '') =>
    `<input id="f-${name}" name="${name}" type="number" step="1" value="${value ?? ''}" ${attrs}>`;
const checkbox = (name, label, checked) =>
    `<label class="form-check"><input type="checkbox" id="f-${name}" name="${name}" ${checked ? 'checked' : ''}> ${label}</label>`;

// Distribute validation errors: mapped ones inline next to their field, the
// rest (e.g. knock-on errors in OTHER languages) into the generic area.
function showErrors(form, errors, pathToField) {
    form.querySelectorAll('.field-err').forEach(el => (el.textContent = ''));
    form.querySelectorAll('.invalid').forEach(el => el.classList.remove('invalid'));
    const box = form.querySelector('.dlg-err');
    const generic = [];
    for (const e of errors) {
        const field = pathToField ? pathToField(e.path) : null;
        const errEl = field ? form.querySelector(`[data-err="${field}"]`) : null;
        if (errEl) {
            errEl.textContent = e.message;
            form.querySelector(`[name="${field}"]`)?.classList.add('invalid');
        } else {
            generic.push(`${e.path ? e.path + ': ' : ''}${e.message}`);
        }
    }
    if (box) box.textContent = generic.join('\n');
}

const langFieldMapper = index => path => {
    const m = path.match(new RegExp(`^languages\\[${index}\\]\\.(\\w+)$`));
    return m ? m[1] : null;
};

const buttons = (submitLabel) =>
    `<div class="dlg-buttons"><button class="btn" type="button" data-close>Cancel</button>` +
    `<button class="btn" type="submit">${submitLabel}</button></div>`;

export function openLanguageForm(app, opts) {
    const doc = app.getDoc();
    const model = app.getModel();
    const editing = opts.mode === 'edit' ? model.byId.get(opts.langId) : null;
    if (opts.mode === 'edit' && !editing) return;
    const parentId = opts.parentId ?? editing?.parentId ?? null;
    const parent = parentId != null ? model.byId.get(parentId) : null;

    const titles = {
        'add-root': 'New family root',
        'add-daughter': `New daughter of ${parent?.name ?? '?'}`,
        'add-stage': `New stage of ${parent?.name ?? '?'}`,
        'edit': `Edit ${editing?.name ?? '?'}`,
    };
    const showSecondary = opts.mode === 'add-daughter' || (opts.mode === 'edit' && editing?.parentId != null);

    let secSelect = '';
    if (showSecondary) {
        const options = ['<option value="">— none —</option>'];
        for (const l of [...model.languages].sort((a, b) => a.name.localeCompare(b.name))) {
            if (editing && l.id === editing.id) continue;
            if (l.id === parentId) continue;
            const sel = editing?.secondaryParentId === l.id ? ' selected' : '';
            options.push(`<option value="${esc(l.id)}"${sel}>${esc(l.name)}</option>`);
        }
        secSelect = fieldRow('secondaryParentId', 'Second parent (creole, optional)',
            `<select id="f-secondaryParentId" name="secondaryParentId">${options.join('')}</select>`);
    }

    const stageHint = opts.mode === 'add-stage'
        ? `<p class="form-hint">On save, ${esc(parent?.name ?? '')}’s end year is set to this stage’s birth year (edit it afterwards to change).</p>` : '';

    const groups = doc.groups ?? [];
    const curGroup = editing?.groupId ?? '';
    const grpOptions = ['<option value="">— none (inherit) —</option>']
        .concat(groups.map(g => `<option value="${esc(g.id)}"${g.id === curGroup ? ' selected' : ''}>${esc(g.name)}</option>`))
        .concat('<option value="__new__">＋ New group…</option>')
        .join('');
    const groupRow = fieldRow('groupId', 'Classification group (optional)',
        `<select id="f-groupId" name="groupId">${grpOptions}</select>`,
        'A named color for this language and its descendants — e.g. colour the Germanic and Romance branches of one family differently.') +
        `<div id="new-group-fields" class="form-grid" hidden>` +
            fieldRow('newGroupName', 'New group name', textInput('newGroupName', '', 'placeholder="e.g. Germanic"')) +
            `<div class="form-row"><label for="f-newGroupColor">New group color</label>` +
            `<input id="f-newGroupColor" name="newGroupColor" type="color" value="#4e79a7"></div>` +
        `</div>`;

    const popPrefill = Array.isArray(editing?.populationSeries)
        ? editing.populationSeries.map(p => `${p.year}:${p.count}`).join(', ') : '';

    // Existing regions offered as autocomplete so the same spelling gets reused.
    const regionList = [...new Set(model.languages.map(l => l.region).filter(Boolean))].sort();
    const regionDatalist = `<datalist id="region-list">${regionList.map(r => `<option value="${esc(r)}"></option>`).join('')}</datalist>`;

    openDialog(`<h2>${esc(titles[opts.mode])}</h2><form>
        ${editing ? `<div class="form-row"><label>id (follows the name automatically)</label><input value="${esc(editing.id)}" disabled></div>` : ''}
        ${fieldRow('name', 'Name', textInput('name', editing?.name ?? '', 'required autofocus'))}
        <div class="form-grid">
            ${fieldRow('born', 'Born (Andah year)', numInput('born', editing?.born ?? '', 'required'), 'Negative = before the epoch')}
            ${fieldRow('died', 'Died (blank = still spoken)', numInput('died', editing?.died ?? ''))}
        </div>
        <div class="form-row"><label>Attestation &amp; certainty</label><div class="form-checks">
            ${checkbox('reconstructed', 'Reconstructed / unattested (shows a * and a dashed box)', editing?.reconstructed)}
            ${checkbox('bornCirca', 'Birth date approximate (“c.”, fuzzy top edge)', editing?.bornCirca)}
            ${checkbox('diedCirca', 'End date approximate (“c.”)', editing?.diedCirca)}
            ${checkbox('diverged', 'Evolved away into its descendants — diverged, not extinct (no † and no end marker; the descendants carry it on). Leave “Died” blank — the end auto-derives from its last daughter or stage successor, so no death date is needed.', editing?.diverged)}
        </div></div>
        ${secSelect}
        <div class="form-grid">
            ${fieldRow('order', 'Sibling order (optional)', numInput('order', editing?.order ?? ''), 'Lower = further left')}
            ${fieldRow('color', 'Color override (optional)', textInput('color', editing?.color ?? '', 'placeholder="inherit family/group color"'))}
        </div>
        ${groupRow}
        ${fieldRow('region', 'Region (optional)', textInput('region', editing?.region ?? '', 'list="region-list" placeholder="e.g. Northern Isles"') + regionDatalist,
            'A geographic area, independent of ancestry. The overview lists regions with a “focus” that dims the others.')}
        ${fieldRow('populationPoints', 'Population points (optional)', textInput('populationPoints', popPrefill, 'placeholder="1400:5000, 1600:12000, 1765:30000"'),
            'A few <code>year:speakers</code> points, comma-separated. Drives the vitality badge on the box and a sparkline here in the panel.')}
        ${fieldRow('notes', 'Notes', `<textarea id="f-notes" name="notes">${esc(editing?.notes ?? '')}</textarea>`)}
        ${fieldRow('polyglotFile', 'PolyGlot file (optional)', textInput('polyglotFile', editing?.polyglotFile ?? '', 'placeholder="path\\to\\language.pgd"'), 'The detail panel gets an “Open in PolyGlot” button for this file (set the launcher path in Settings).')}
        ${stageHint}
        <div class="dlg-err"></div>
        ${buttons(editing ? 'Save changes' : 'Add language')}
    </form>`, async (form) => {
        const fd = new FormData(form);
        const name = String(fd.get('name') ?? '').trim();
        const bornRaw = String(fd.get('born') ?? '').trim();
        const diedRaw = String(fd.get('died') ?? '').trim();
        const orderRaw = String(fd.get('order') ?? '').trim();

        const newDoc = structuredClone(doc);
        let lang, index;
        if (editing) {
            index = newDoc.languages.findIndex(l => l.id === editing.id);
            lang = newDoc.languages[index];
        } else {
            const taken = new Set(newDoc.languages.map(l => l.id));
            lang = { id: slugify(name || 'lang', taken) };
            if (opts.mode !== 'add-root') {
                lang.parentId = parentId;
                lang.relation = opts.mode === 'add-stage' ? 'stage' : 'branch';
            }
            newDoc.languages.push(lang);
            index = newDoc.languages.length - 1;
        }
        lang.name = name;
        lang.born = bornRaw === '' ? undefined : Number(bornRaw);
        setOpt(lang, 'died', diedRaw === '' ? null : Number(diedRaw));
        if (showSecondary) setOpt(lang, 'secondaryParentId', String(fd.get('secondaryParentId') || '') || null);
        setOpt(lang, 'order', orderRaw === '' ? null : Number(orderRaw));
        setOpt(lang, 'color', String(fd.get('color') ?? '').trim() || null);
        const groupSel = String(fd.get('groupId') || '');
        if (groupSel === '__new__') {
            const gName = String(fd.get('newGroupName') ?? '').trim();
            if (gName) {
                if (!Array.isArray(newDoc.groups)) newDoc.groups = [];
                const gid = slugify(gName, new Set(newDoc.groups.map(g => g.id)));
                newDoc.groups.push({ id: gid, name: gName, color: String(fd.get('newGroupColor') ?? '').trim() || '#4e79a7' });
                lang.groupId = gid;
            } else {
                delete lang.groupId; // "New group…" chosen but left blank → treat as none
            }
        } else {
            setOpt(lang, 'groupId', groupSel || null);
        }
        setOpt(lang, 'reconstructed', fd.get('reconstructed') ? true : null);
        setOpt(lang, 'bornCirca', fd.get('bornCirca') ? true : null);
        setOpt(lang, 'diedCirca', fd.get('diedCirca') ? true : null);
        setOpt(lang, 'diverged', fd.get('diverged') ? true : null);
        // Population points: parse "year:count, year:count" into a sorted series.
        // Invalid numbers pass through as NaN so validation flags them by path.
        const popRaw = String(fd.get('populationPoints') ?? '').trim();
        if (popRaw === '') {
            setOpt(lang, 'populationSeries', null);
        } else {
            const pts = popRaw.split(',').map(tok => tok.trim()).filter(Boolean).map(tok => {
                const [y, c] = tok.split(':');
                return { year: Number(y), count: Number(c) };
            }).sort((a, b) => a.year - b.year);
            setOpt(lang, 'populationSeries', pts.length ? pts : null);
        }
        setOpt(lang, 'region', String(fd.get('region') ?? '').trim() || null);
        setOpt(lang, 'notes', String(fd.get('notes') ?? '').trim() || null);
        setOpt(lang, 'polyglotFile', String(fd.get('polyglotFile') ?? '').trim() || null);

        // Keep an existing language's id in step with its (possibly changed) name,
        // cascading the new slug through every reference so links stay intact.
        if (editing) {
            const old = editing.id;
            const newId = slugify(name, new Set(newDoc.languages.filter(x => x.id !== old).map(x => x.id)));
            if (newId !== old) {
                lang.id = newId;
                for (const x of newDoc.languages) {
                    if (x.parentId === old) x.parentId = newId;
                    if (x.secondaryParentId === old) x.secondaryParentId = newId;
                }
                for (const b of newDoc.borrowings ?? []) {
                    if (b.fromId === old) b.fromId = newId;
                    if (b.toId === old) b.toId = newId;
                }
            }
        }

        if (opts.mode === 'add-stage' && Number.isInteger(lang.born)) {
            const p = newDoc.languages.find(x => x.id === parentId);
            if (p) p.died = lang.born;
        }

        const mapper = langFieldMapper(index);
        const errors = validateDoc(newDoc);
        if (errors.length) { showErrors(form, errors, mapper); return; }
        const res = await app.save(newDoc);
        if (res.ok) { dlg.close(); app.select?.(lang.id); }
        else if (res.conflict) dlg.close();
        else if (res.errors) showErrors(form, res.errors, mapper);
    });

    // Reveal the name/color inputs only when "＋ New group…" is picked.
    const grpSel = dlg.querySelector('#f-groupId');
    const grpNew = dlg.querySelector('#new-group-fields');
    grpSel?.addEventListener('change', () => {
        const isNew = grpSel.value === '__new__';
        if (grpNew) grpNew.hidden = !isNew;
        if (isNew) dlg.querySelector('#f-newGroupName')?.focus();
    });
}

export function openGroupsForm(app) {
    const doc = app.getDoc();
    const groups = doc.groups ?? [];

    const row = (g, i) =>
        `<div class="group-edit-row">` +
        `<input name="name-${i}" type="text" value="${esc(g.name)}" aria-label="group name">` +
        `<input name="color-${i}" type="color" value="${esc(g.color)}" aria-label="group color">` +
        `<label class="hint group-del"><input name="del-${i}" type="checkbox"> delete</label>` +
        `</div>`;
    const rows = groups.map(row).join('');

    openDialog(`<h2>Classification groups</h2><form>
        <p class="form-hint">Named colors you can assign to a language (and its descendants) — e.g. colour the Germanic and Romance branches of one Indo-European family differently. Deleting a group unassigns it from every language using it.</p>
        ${rows || '<p class="hint">No groups yet — add one below.</p>'}
        <div class="panel-section"><h3>Add a group</h3>
            <div class="group-edit-row">
                <input name="new-name" type="text" placeholder="e.g. Germanic" aria-label="new group name">
                <input name="new-color" type="color" value="#4e79a7" aria-label="new group color">
            </div>
        </div>
        <div class="dlg-err"></div>
        ${buttons('Save groups')}
    </form>`, async (form) => {
        const fd = new FormData(form);
        const newDoc = structuredClone(doc);
        const removed = new Set();
        const next = [];
        (doc.groups ?? []).forEach((g, i) => {
            if (fd.get(`del-${i}`)) { removed.add(g.id); return; }
            next.push({
                id: g.id,
                name: String(fd.get(`name-${i}`) ?? '').trim() || g.name,
                color: String(fd.get(`color-${i}`) ?? '').trim() || g.color,
            });
        });
        const newName = String(fd.get('new-name') ?? '').trim();
        if (newName) {
            const id = slugify(newName, new Set(next.map(g => g.id)));
            next.push({ id, name: newName, color: String(fd.get('new-color') ?? '').trim() || '#4e79a7' });
        }
        if (next.length) newDoc.groups = next; else delete newDoc.groups;
        if (removed.size) for (const l of newDoc.languages) if (l.groupId && removed.has(l.groupId)) delete l.groupId;

        const errors = validateDoc(newDoc);
        if (errors.length) { showErrors(form, errors, null); return; }
        const res = await app.save(newDoc);
        if (res.ok || res.conflict) dlg.close();
        else if (res.errors) showErrors(form, res.errors, null);
    });
}

export function openBorrowingForm(app, opts = {}) {
    const doc = app.getDoc();
    const model = app.getModel();
    if (model.languages.length < 2) { app.toast('Add at least two languages first.', 'err'); return; }

    const editing = opts.borrowingId != null ? model.borrowingById.get(opts.borrowingId) : null;
    if (opts.borrowingId != null && !editing) return;

    const fromSel = editing?.fromId ?? opts.fromId;
    const toSel = editing?.toId ?? opts.toId;
    const sortedLangs = [...model.languages].sort((a, b) => a.name.localeCompare(b.name));
    const options = (selId) => sortedLangs
        .map(l => `<option value="${esc(l.id)}"${l.id === selId ? ' selected' : ''}>${esc(l.name)}</option>`)
        .join('');
    const curKind = editing?.kind ?? 'loan';
    const kindOptions = BORROW_KINDS
        .map(k => `<option value="${k}"${k === curKind ? ' selected' : ''}>${esc(KIND_LABEL[k])}</option>`)
        .join('');

    openDialog(`<h2>${editing ? 'Edit borrowing' : 'New borrowing / influence'}</h2><form>
        ${editing ? `<div class="form-row"><label>id (permanent)</label><input value="${esc(editing.id)}" disabled></div>` : ''}
        ${fieldRow('fromId', 'From (source language)', `<select id="f-fromId" name="fromId">${options(fromSel)}</select>`)}
        ${fieldRow('toId', 'Into (receiving language)', `<select id="f-toId" name="toId">${options(toSel)}</select>`)}
        ${fieldRow('kind', 'Kind of influence', `<select id="f-kind" name="kind">${kindOptions}</select>`,
            'Loanwords = borrowed words · Substrate = language shifted from · Superstrate = ruling-language layer · Areal = shared regional trait.')}
        <div class="form-grid">
            ${fieldRow('year', 'Year (optional)', numInput('year', editing?.year ?? ''))}
            ${fieldRow('label', 'Label (optional)', textInput('label', editing?.label ?? '', 'placeholder="e.g. sea-trade loanwords"'))}
        </div>
        <div class="dlg-err"></div>
        ${buttons(editing ? 'Save changes' : 'Add borrowing')}
    </form>`, async (form) => {
        const fd = new FormData(form);
        const newDoc = structuredClone(doc);
        if (!Array.isArray(newDoc.borrowings)) newDoc.borrowings = [];
        let bor, index;
        if (editing) {
            index = newDoc.borrowings.findIndex(b => b.id === editing.id);
            bor = newDoc.borrowings[index];
        } else {
            let n = 1;
            const ids = new Set(newDoc.borrowings.map(b => b.id));
            while (ids.has(`b${n}`)) n++;
            bor = { id: `b${n}` };
            newDoc.borrowings.push(bor);
            index = newDoc.borrowings.length - 1;
        }
        bor.fromId = String(fd.get('fromId') ?? '');
        bor.toId = String(fd.get('toId') ?? '');
        const kind = String(fd.get('kind') ?? 'loan');
        setOpt(bor, 'kind', kind === 'loan' ? null : kind); // keep the JSON minimal — loan is the default
        const yearRaw = String(fd.get('year') ?? '').trim();
        setOpt(bor, 'year', yearRaw === '' ? null : Number(yearRaw));
        setOpt(bor, 'label', String(fd.get('label') ?? '').trim() || null);

        const mapper = path => {
            const m = path.match(new RegExp(`^borrowings\\[${index}\\]\\.(\\w+)$`));
            return m ? m[1] : null;
        };
        const errors = validateDoc(newDoc);
        if (errors.length) { showErrors(form, errors, mapper); return; }
        const res = await app.save(newDoc);
        if (res.ok) { dlg.close(); app.select?.({ type: 'borrowing', id: bor.id }); }
        else if (res.conflict) dlg.close();
        else if (res.errors) showErrors(form, res.errors, mapper);
    });
}

export function openEventForm(app, opts = {}) {
    const doc = app.getDoc();
    const model = app.getModel();
    const editing = opts.eventId != null ? model.eventById.get(opts.eventId) : null;
    if (opts.eventId != null && !editing) return;

    openDialog(`<h2>${editing ? 'Edit event' : 'New timeline event'}</h2><form>
        ${editing ? `<div class="form-row"><label>id (permanent)</label><input value="${esc(editing.id)}" disabled></div>` : ''}
        ${fieldRow('label', 'Label', textInput('label', editing?.label ?? '', 'required autofocus placeholder="e.g. The Long Winter"'))}
        <div class="form-grid">
            ${fieldRow('year', 'Year (Andah)', numInput('year', editing?.year ?? '', 'required'), 'Negative = before the epoch')}
            ${fieldRow('endYear', 'End year (optional)', numInput('endYear', editing?.endYear ?? ''), 'Set for a spanning band')}
        </div>
        ${fieldRow('color', 'Color (optional)', textInput('color', editing?.color ?? '', 'placeholder="e.g. #b32424"'))}
        ${fieldRow('notes', 'Notes (optional)', `<textarea id="f-notes" name="notes">${esc(editing?.notes ?? '')}</textarea>`)}
        <div class="dlg-err"></div>
        ${buttons(editing ? 'Save changes' : 'Add event')}
    </form>`, async (form) => {
        const fd = new FormData(form);
        const newDoc = structuredClone(doc);
        if (!Array.isArray(newDoc.events)) newDoc.events = [];
        let ev, index;
        if (editing) {
            index = newDoc.events.findIndex(e => e.id === editing.id);
            ev = newDoc.events[index];
        } else {
            let n = 1;
            const ids = new Set(newDoc.events.map(e => e.id));
            while (ids.has(`ev${n}`)) n++;
            ev = { id: `ev${n}` };
            newDoc.events.push(ev);
            index = newDoc.events.length - 1;
        }
        ev.label = String(fd.get('label') ?? '').trim();
        const yearRaw = String(fd.get('year') ?? '').trim();
        ev.year = yearRaw === '' ? undefined : Number(yearRaw);
        const endRaw = String(fd.get('endYear') ?? '').trim();
        setOpt(ev, 'endYear', endRaw === '' ? null : Number(endRaw));
        setOpt(ev, 'color', String(fd.get('color') ?? '').trim() || null);
        setOpt(ev, 'notes', String(fd.get('notes') ?? '').trim() || null);

        const mapper = path => {
            const m = path.match(new RegExp(`^events\\[${index}\\]\\.(\\w+)$`));
            return m ? m[1] : null;
        };
        const errors = validateDoc(newDoc);
        if (errors.length) { showErrors(form, errors, mapper); return; }
        const res = await app.save(newDoc);
        if (res.ok) { dlg.close(); app.select?.({ type: 'event', id: ev.id }); }
        else if (res.conflict) dlg.close();
        else if (res.errors) showErrors(form, res.errors, mapper);
    });
}

export function deleteEvent(app, eid) {
    const doc = app.getDoc();
    if (!(doc.events ?? []).some(e => e.id === eid)) return;
    if (!confirm('Delete this event?')) return;
    const newDoc = structuredClone(doc);
    newDoc.events = newDoc.events.filter(e => e.id !== eid);
    app.save(newDoc);
}

export function openSettingsForm(app) {
    const doc = app.getDoc();
    openDialog(`<h2>Settings</h2><form>
        ${fieldRow('title', 'Title', textInput('title', doc.config?.title ?? ''))}
        ${fieldRow('presentYear', 'Present year (Andah)', numInput('presentYear', doc.config?.presentYear ?? '', 'required'),
            'Living languages read “– now”; the Now line sits at this year. Lore note: Andah year ≈ Earth year − 250.')}
        ${fieldRow('zeroLabel', 'Label for the year-0 tick', textInput('zeroLabel', doc.config?.axis?.zeroLabel ?? '0'),
            'The demo uses "1" for a no-year-zero calendar.')}
        ${fieldRow('polyglotPath', 'PolyGlot launcher (optional)', textInput('polyglotPath', doc.config?.polyglotPath ?? '', 'placeholder="C:\\Program Files\\PolyGlot\\PolyGlot.exe"'),
            'Full path to PolyGlot.exe or PolyGlot.jar. Enables the “Open in PolyGlot” button on languages with a file. (The ANDAH_POLYGLOT_PATH env var overrides this.)')}
        <div class="dlg-err"></div>
        ${buttons('Save settings')}
    </form>`, async (form) => {
        const fd = new FormData(form);
        const newDoc = structuredClone(doc);
        if (!newDoc.config || typeof newDoc.config !== 'object' || Array.isArray(newDoc.config)) newDoc.config = {};
        newDoc.config.title = String(fd.get('title') ?? '').trim();
        const py = String(fd.get('presentYear') ?? '').trim();
        newDoc.config.presentYear = py === '' ? undefined : Number(py);
        const zl = String(fd.get('zeroLabel') ?? '').trim();
        if (zl) newDoc.config.axis = { ...(newDoc.config.axis ?? {}), zeroLabel: zl };
        setOpt(newDoc.config, 'polyglotPath', String(fd.get('polyglotPath') ?? '').trim() || null);

        const mapper = path => (path === 'config.presentYear' ? 'presentYear'
            : path === 'config.title' ? 'title'
            : path === 'config.axis.zeroLabel' ? 'zeroLabel'
            : path === 'config.polyglotPath' ? 'polyglotPath' : null);
        const errors = validateDoc(newDoc);
        if (errors.length) { showErrors(form, errors, mapper); return; }
        const res = await app.save(newDoc);
        if (res.ok) dlg.close();
        else if (res.conflict) dlg.close();
        else if (res.errors) showErrors(form, res.errors, mapper);
    });
}

export function confirmDeleteLanguage(app, langId) {
    const model = app.getModel();
    const lang = model.byId.get(langId);
    if (!lang) return;
    const blockers = model.blockersOf(langId);
    if (blockers.length) {
        app.toast(`Can’t delete ${lang.name} yet — first remove: ${blockers.join(', ')}.`, 'err');
        return;
    }
    if (!confirm(`Delete ${lang.name}? (A backup of the current file is kept on every save.)`)) return;
    const newDoc = structuredClone(app.getDoc());
    newDoc.languages = newDoc.languages.filter(l => l.id !== langId);
    app.save(newDoc);
}

export function deleteBorrowing(app, bid) {
    const doc = app.getDoc();
    if (!(doc.borrowings ?? []).some(b => b.id === bid)) return;
    if (!confirm('Delete this borrowing?')) return;
    const newDoc = structuredClone(doc);
    newDoc.borrowings = newDoc.borrowings.filter(b => b.id !== bid);
    app.save(newDoc);
}
