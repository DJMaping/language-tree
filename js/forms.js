// All <dialog>-based editing forms. Forms build a candidate document, run the
// shared validation, show field-level errors, and hand the doc to app.save()
// (provided by main.js). The data file stays the single source of truth.

import { validateDoc } from './validate.js';

const dlg = document.getElementById('dlg');

const esc = s => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function slugify(name, taken) {
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
        for (const l of model.languages) {
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

    openDialog(`<h2>${esc(titles[opts.mode])}</h2><form>
        ${editing ? `<div class="form-row"><label>id (permanent — safe to rename the name)</label><input value="${esc(editing.id)}" disabled></div>` : ''}
        ${fieldRow('name', 'Name', textInput('name', editing?.name ?? '', 'required autofocus'))}
        <div class="form-grid">
            ${fieldRow('born', 'Born (Andah year)', numInput('born', editing?.born ?? '', 'required'), 'Negative = before the epoch')}
            ${fieldRow('died', 'Died (blank = still spoken)', numInput('died', editing?.died ?? ''))}
        </div>
        ${secSelect}
        <div class="form-grid">
            ${fieldRow('order', 'Sibling order (optional)', numInput('order', editing?.order ?? ''), 'Lower = further left')}
            ${fieldRow('color', 'Color override (optional)', textInput('color', editing?.color ?? '', 'placeholder="inherit family color"'))}
        </div>
        ${fieldRow('notes', 'Notes', `<textarea id="f-notes" name="notes">${esc(editing?.notes ?? '')}</textarea>`)}
        ${fieldRow('polyglotFile', 'PolyGlot file (optional)', textInput('polyglotFile', editing?.polyglotFile ?? '', 'placeholder="path\\to\\language.pgd"'), 'Reserved — opening it from the app comes in a later version.')}
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
        setOpt(lang, 'notes', String(fd.get('notes') ?? '').trim() || null);
        setOpt(lang, 'polyglotFile', String(fd.get('polyglotFile') ?? '').trim() || null);

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
}

export function openBorrowingForm(app, opts = {}) {
    const doc = app.getDoc();
    const model = app.getModel();
    if (model.languages.length < 2) { app.toast('Add at least two languages first.', 'err'); return; }

    const options = (selId) => model.languages
        .map(l => `<option value="${esc(l.id)}"${l.id === selId ? ' selected' : ''}>${esc(l.name)}</option>`)
        .join('');

    openDialog(`<h2>New borrowing / influence</h2><form>
        ${fieldRow('fromId', 'From (source language)', `<select id="f-fromId" name="fromId">${options(opts.fromId)}</select>`)}
        ${fieldRow('toId', 'Into (receiving language)', `<select id="f-toId" name="toId">${options(null)}</select>`)}
        <div class="form-grid">
            ${fieldRow('year', 'Year (optional)', numInput('year', ''))}
            ${fieldRow('label', 'Label (optional)', textInput('label', '', 'placeholder="e.g. sea-trade loanwords"'))}
        </div>
        <div class="dlg-err"></div>
        ${buttons('Add borrowing')}
    </form>`, async (form) => {
        const fd = new FormData(form);
        const newDoc = structuredClone(doc);
        if (!Array.isArray(newDoc.borrowings)) newDoc.borrowings = [];
        let n = 1;
        const ids = new Set(newDoc.borrowings.map(b => b.id));
        while (ids.has(`b${n}`)) n++;
        const bor = { id: `b${n}`, fromId: String(fd.get('fromId') ?? ''), toId: String(fd.get('toId') ?? '') };
        const yearRaw = String(fd.get('year') ?? '').trim();
        setOpt(bor, 'year', yearRaw === '' ? null : Number(yearRaw));
        setOpt(bor, 'label', String(fd.get('label') ?? '').trim() || null);
        newDoc.borrowings.push(bor);
        const index = newDoc.borrowings.length - 1;

        const mapper = path => {
            const m = path.match(new RegExp(`^borrowings\\[${index}\\]\\.(\\w+)$`));
            return m ? m[1] : null;
        };
        const errors = validateDoc(newDoc);
        if (errors.length) { showErrors(form, errors, mapper); return; }
        const res = await app.save(newDoc);
        if (res.ok) dlg.close();
        else if (res.conflict) dlg.close();
        else if (res.errors) showErrors(form, res.errors, mapper);
    });
}

export function openSettingsForm(app) {
    const doc = app.getDoc();
    openDialog(`<h2>Settings</h2><form>
        ${fieldRow('title', 'Title', textInput('title', doc.config?.title ?? ''))}
        ${fieldRow('presentYear', 'Present year (Andah)', numInput('presentYear', doc.config?.presentYear ?? '', 'required'),
            'Living languages read “– now”; the Now line sits at this year. Lore note: Andah year ≈ Earth year − 250.')}
        ${fieldRow('zeroLabel', 'Label for the year-0 tick', textInput('zeroLabel', doc.config?.axis?.zeroLabel ?? '0'),
            'The demo uses "1" for a no-year-zero calendar.')}
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

        const mapper = path => (path === 'config.presentYear' ? 'presentYear'
            : path === 'config.title' ? 'title'
            : path === 'config.axis.zeroLabel' ? 'zeroLabel' : null);
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
