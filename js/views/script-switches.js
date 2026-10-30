/**
 * The script history's proposed switches, for DJ's veto
 * (scripts/build-script-history.js; docs/script-history-proposals.md). Each
 * is a people taking up another script, with why: a ruler's or a
 * coloniser's, a faith's, a neighbour's, its mother's. A veto strikes one
 * (data/history/script-vetoes.json); applying rebuilds the history, about a
 * second, through server.js. A struck switch can let a later one through,
 * so the list is read again after every apply.
 */

import { esc } from '../views.js';
import { SCRIPTS_CHANGED } from '../engine/script/use.js';

const lab = (y) => (y < 0 ? `${-y} BFA` : `${y} AFA`);
const REASONS = { rule: 'under a ruler', colony: 'as its colonisers', religion: 'with a faith', state: 'beside a fellow official language', family: "its mother's script", neighbour: "a neighbour's", own: 'its own' };
let history = null;
let saved = null;   // the vetoes on disk, as keys lang|year

export async function renderSwitches(body, { stages, state, model }) {
    if (!history) {
        body.innerHTML = '<div class="hint">Reading the script history…</div>';
        try {
            const [h, v] = await Promise.all([fetch('data/history/script-history.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)), fetch('/api/scripts/vetoes', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : { vetoes: [] })).catch(() => ({ vetoes: [] }))]);
            if (!h) { body.innerHTML = '<div class="views-empty">data/history/script-history.json is missing: run npm run scripts:history.</div>'; return; }
            history = h;
            saved = new Set((v.vetoes || []).map((x) => `${x.lang}|${x.year}`));
            state.swVeto = new Set(saved);
        } catch (err) { body.innerHTML = `<div class="views-empty">${esc(err.message)}</div>`; return; }
    }
    state.swVeto ??= new Set(saved);
    state.swLiving ??= true;
    state.swReason ??= '';
    state.swFind ??= '';
    const byId = new Map(stages.map((s) => [s.id, s]));
    const name = (id) => model.byId.get(id)?.name ?? id;
    const living = (id) => { const l = model.byId.get(id); return !!l && l.died == null && !l.reconstructed; };
    const lineName = (line) => byId.get(line)?.name ?? history.stages?.find((s) => s.id === line)?.name ?? line;
    // a few signs of the script as the language came to write it
    const sample = (tip) => {
        const st = byId.get(tip);
        if (!st) return '';
        return st.signs.filter((x) => x.path).slice(0, 5).map((x) => `<svg class="sc-glyph" viewBox="0 0 100 100" width="18" height="18"><path d="${x.path}"/></svg>`).join('');
    };
    const why = (s) => `${REASONS[s.reason] ?? s.reason}${s.via ? ` (${name(s.via)}${s.carrier ? `, brought by ${name(s.carrier)}` : ''})` : ''}`;
    const find = state.swFind.trim().toLowerCase();
    const rows = history.switches.filter((s) => (!state.swLiving || living(s.lang)) && (!state.swReason || s.reason === state.swReason) && (!find || s.name.toLowerCase().includes(find) || s.lang.includes(find)));
    // switches already struck no longer appear in the history: listed by what was struck
    const struck = [...state.swVeto].filter((k) => !history.switches.some((s) => `${s.lang}|${s.year}` === k));
    const changed = state.swVeto.size !== saved.size || [...state.swVeto].some((k) => !saved.has(k));
    const reasons = [...new Set(history.switches.map((s) => s.reason))];

    body.innerHTML = `<div class="hint">The script history proposes these switches: a people taking up another script, and why. Veto any that is wrong, then apply: the history is rebuilt in about a second, and since a struck switch can let a later one through, the list is drawn again after.</div>
      <div class="views-controls">
        <label>Language <input id="sw-find" value="${esc(state.swFind)}" style="width:140px" placeholder="name or id"></label>
        <label>Why <select id="sw-reason"><option value="">any</option>${reasons.map((r) => `<option value="${r}"${state.swReason === r ? ' selected' : ''}>${esc(REASONS[r] ?? r)}</option>`).join('')}</select></label>
        <label><input type="checkbox" id="sw-living"${state.swLiving ? ' checked' : ''}> living languages only</label>
        <span class="hint">${rows.length} of ${history.switches.length} switches · ${state.swVeto.size} vetoed</span>
        <button class="btn primary" id="sw-apply"${changed ? '' : ' disabled'}>Apply${changed ? ` (${[...state.swVeto].filter((k) => !saved.has(k)).length} vetoed, ${[...saved].filter((k) => !state.swVeto.has(k)).length} let through)` : ''}</button>
      </div>
      <div class="hint" id="sw-status">${esc(state.swNote ?? '')}</div>
      ${struck.length ? `<h4 class="ty-head">Struck <span class="hint">vetoed switches, kept in data/history/script-vetoes.json</span></h4><div class="sw-struck">${struck.map((k) => { const [lang, year] = k.split('|'); return `<span class="sw-chip">${esc(name(lang))}, ${lab(+year)} <button class="btn" data-let="${esc(k)}">let it happen</button></span>`; }).join('')}</div>` : ''}
      <table class="sw-table"><tr><th>Language</th><th>Year</th><th>From</th><th></th><th>To</th><th>Why</th><th></th></tr>
      ${rows.map((s) => {
        const k = `${s.lang}|${s.year}`, off = state.swVeto.has(k);
        return `<tr class="${off ? 'sw-off' : ''}"><td>${esc(s.name)}${living(s.lang) ? '' : ' <span class="hint">†</span>'}</td><td>${lab(s.year)}</td>
          <td><span class="sw-script">${sample(s.fromTip)}</span><small class="hint">${esc(lineName(s.from))}</small></td><td>→</td>
          <td><span class="sw-script">${sample(s.toTip)}</span><small class="hint">${esc(lineName(s.to))}</small></td>
          <td>${esc(why(s))}</td><td><button class="btn${off ? ' danger' : ''}" data-k="${esc(k)}">${off ? 'vetoed' : 'veto'}</button></td></tr>`;
    }).join('')}</table>
      ${rows.length ? '' : '<div class="hint">No switch matches.</div>'}`;

    const again = () => renderSwitches(body, { stages, state, model });
    body.querySelector('#sw-find').addEventListener('change', (e) => { state.swFind = e.target.value; again(); });
    body.querySelector('#sw-reason').addEventListener('change', (e) => { state.swReason = e.target.value; again(); });
    body.querySelector('#sw-living').addEventListener('change', (e) => { state.swLiving = e.target.checked; again(); });
    body.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => { const k = b.dataset.k; if (state.swVeto.has(k)) state.swVeto.delete(k); else state.swVeto.add(k); state.swNote = null; again(); }));
    body.querySelectorAll('[data-let]').forEach((b) => b.addEventListener('click', () => { state.swVeto.delete(b.dataset.let); state.swNote = null; again(); }));
    body.querySelector('#sw-apply').addEventListener('click', async () => {
        const status = body.querySelector('#sw-status');
        body.querySelector('#sw-apply').disabled = true;
        status.textContent = 'Saving the vetoes and rebuilding the history…';
        const vetoes = [...state.swVeto].map((k) => { const i = k.lastIndexOf('|'); return { lang: k.slice(0, i), year: +k.slice(i + 1) }; });
        try {
            const r = await fetch('/api/scripts/vetoes', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ vetoes }) }).then((x) => x.json());
            if (r.saved) saved = new Set(state.swVeto);
            if (r.ok) {
                history = null;
                state.swNote = `Applied. ${String(r.log || '').split('\n').find((l) => /^Wrote data\/history/.test(l)) ?? ''}`;
                window.dispatchEvent(new Event(SCRIPTS_CHANGED));
            } else if (r.noMap) state.swNote = 'Your vetoes are saved, but the history cannot be rebuilt on this machine: it has no religion map (andah-atlas, or data/canon/religion-map.json). They take effect the next time the history is rebuilt where the atlas is (npm run scripts:history).';
            else state.swNote = `The rebuild failed: ${r.error || r.log || ''}`;
        } catch (err) { state.swNote = `Could not reach the app's server (${err.message}).`; }
        again();
    });
}
