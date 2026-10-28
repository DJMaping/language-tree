/**
 * Scripts: the writing systems as a tree over time (data/scripts.json,
 * scripts/build-scripts.js). A stage's signs with what each stands for and
 * where it came from; one sign followed from its picture down every branch;
 * and a word written in the script.
 */

import { esc } from '../views.js';
import { projectFor, stateAtYear } from '../lang-project.js';
import { writeWord, wordSvg } from '../engine/script/write.js';
import { parseWord } from '../engine/features.js';

let data = null;
const lab = (y) => (y < 0 ? `${-y} BFA` : `${y} AFA`);
const svg = (sign, size = 54) => `<svg class="sc-glyph" viewBox="0 0 100 100" width="${size}" height="${size}"><path d="${sign.path}"/></svg>`;
const valueOf = (s) => s.value?.sound ?? s.value?.syllable ?? s.value?.word ?? '';

export async function render(el, ctx) {
    const { model, state } = ctx;
    if (!data) {
        const res = await fetch('data/scripts.json', { cache: 'no-store' });
        if (!res.ok) { el.innerHTML = '<div class="views-empty">data/scripts.json is missing: run npm run scripts.</div>'; return; }
        data = await res.json();
    }
    const stages = data.stages;
    const byId = new Map(stages.map((s) => [s.id, s]));
    const name = (id) => model.byId.get(id)?.name ?? id;
    state.stage ??= stages[stages.length - 1].id;
    state.tab ??= 'signs';
    const stage = byId.get(state.stage) || stages[0];
    const lineage = (stageId, signId) => { const out = []; let s = byId.get(stageId), id = signId; while (s && id) { const sign = s.signs.find((x) => x.id === id); if (!sign) break; out.unshift({ stage: s, sign }); id = sign.from; s = byId.get(s.parent); } return out; };
    const tips = stages.filter((s) => !stages.some((x) => x.parent === s.id));
    const users = stage.users.map((u) => `${name(u.lang)} from ${lab(u.from)}`).join(', ');

    el.innerHTML = `
      <div class="views-controls">
        <label>Script <select id="sc-stage">${stages.map((s) => `<option value="${s.id}"${s.id === stage.id ? ' selected' : ''}>${esc(s.name)} (${lab(s.year)})</option>`).join('')}</select></label>
        <button class="views-tab${state.tab === 'signs' ? ' on' : ''}" data-tab="signs">Signs</button>
        <button class="views-tab${state.tab === 'time' ? ' on' : ''}" data-tab="time">One sign through time</button>
        <button class="views-tab${state.tab === 'write' ? ' on' : ''}" data-tab="write">Write</button>
        <span class="hint" id="sc-stamp">scripts built ${esc(data.generatedAt.slice(0, 16).replace('T', ' '))}</span>
      </div>
      <h3 class="ty-head">${esc(stage.name)} <span class="hint">${lab(stage.year)} · ${esc(stage.type)} · ${esc(dirLabel(stage.direction))} · ${esc(data.ductus[stage.ductus]?.label ?? stage.ductus)} · ${esc(users)}</span></h3>
      ${stage.note ? `<div class="hint">${esc(stage.note)}</div>` : ''}
      <div class="hint">${stage.changes.map((c) => `<b>${esc(c.kind)}</b>: ${esc(c.note)} <i>(${esc(c.analogue)})</i>`).join(' · ')}</div>
      <div id="sc-body"></div>`;
    el.querySelector('#sc-stage').addEventListener('change', (e) => { state.stage = e.target.value; state.sign = null; render(el, ctx); });
    el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { state.tab = b.dataset.tab; render(el, ctx); }));
    const body = el.querySelector('#sc-body');

    if (state.tab === 'signs') {
        body.innerHTML = `<div class="hint">Click a sign to follow it through time. Hover for where it came from.</div>
          <div class="sc-grid">${stage.signs.map((s) => `<button class="sc-cell${state.sign === s.id ? ' on' : ''}" data-sign="${esc(s.id)}" title="${esc(s.origin ?? (s.concept ? `a picture of ${s.concept}${s.word ? `, ${s.word}` : ''}` : ''))}">${svg(s)}<small>${esc(valueOf(s))}${s.value?.word && s.value?.syllable ? ` · ${esc(s.value.word)}` : ''}</small></button>`).join('')}</div>`;
        body.querySelectorAll('[data-sign]').forEach((b) => b.addEventListener('click', () => { state.sign = b.dataset.sign; state.tab = 'time'; render(el, ctx); }));
        return;
    }
    if (state.tab === 'time') {
        const sign = stage.signs.find((s) => s.id === state.sign) || stage.signs[0];
        const chain = lineage(stage.id, sign.id);
        const rootSign = chain[0]?.sign;
        const rows = tips.map((tip) => {
            const tipSign = tip.signs.find((s) => lineage(tip.id, s.id)[0]?.sign.id === rootSign?.id);
            if (!tipSign) return '';
            return `<div class="sc-chain"><span class="sc-tip">${esc(tip.name)}</span>${lineage(tip.id, tipSign.id).map(({ stage: st, sign: sg }) => `<button class="sc-cell${st.id === stage.id ? ' on' : ''}" data-go="${esc(st.id)}|${esc(sg.id)}" title="${esc(st.name)}, ${lab(st.year)}: ${esc(sg.origin ?? '')}">${svg(sg, 44)}<small>${esc(valueOf(sg))}</small><em>${lab(st.year)}</em></button>`).join('<span class="sc-arrow">›</span>')}</div>`;
        }).join('');
        body.innerHTML = `<div class="hint">${esc(stage.name)}'s sign <b>${esc(valueOf(sign))}</b>${rootSign?.concept ? `, once a picture of ${esc(rootSign.concept)} (${esc(rootSign.word ?? '')}) in ${esc(byId.get(chain[0].stage.id).name)}` : ''}: what became of that picture on every branch.</div>
          <div class="sc-grid-select"><select id="sc-sign">${stage.signs.map((s) => `<option value="${s.id}"${s.id === sign.id ? ' selected' : ''}>${esc(valueOf(s))}${s.concept ? ` (${esc(s.concept)})` : ''}</option>`).join('')}</select></div>
          ${rows || '<div class="hint">This sign was made within its own script and has no older picture behind it.</div>'}`;
        body.querySelector('#sc-sign').addEventListener('change', (e) => { state.sign = e.target.value; render(el, ctx); });
        body.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { const [st, sg] = b.dataset.go.split('|'); state.stage = st; state.sign = sg; render(el, ctx); }));
        return;
    }
    // write
    state.lang ??= stage.users[0].lang;
    state.word ??= 'water';
    const langs = stage.users.map((u) => u.lang).filter((id) => model.byId.has(id));
    body.innerHTML = `<div class="views-controls">
        <label>Language <select id="sc-lang">${langs.map((id) => `<option value="${id}"${id === state.lang ? ' selected' : ''}>${esc(name(id))}</option>`).join('')}</select></label>
        <label>Word (its English meaning) <input id="sc-word" value="${esc(state.word)}" style="width:160px"></label>
        <span class="hint">as the language said it in ${lab(Math.max(stage.year, model.byId.get(state.lang)?.born ?? stage.year))}</span>
      </div><div id="sc-written" class="hint">Working it out…</div>`;
    body.querySelector('#sc-lang').addEventListener('change', (e) => { state.lang = e.target.value; render(el, ctx); });
    body.querySelector('#sc-word').addEventListener('change', (e) => { state.word = e.target.value; render(el, ctx); });
    const out = body.querySelector('#sc-written');
    try {
        const st = state.lang === 'lastnu' ? await lastnuState() : (() => {
            const project = projectFor(model, state.lang, ctx.presentYear);
            if (!project) throw new Error(`${name(state.lang)}: this family has no engine configuration.`);
            const node = model.byId.get(state.lang);
            const year = Math.max(stage.year, node.born);
            return stateAtYear(project, state.lang, Math.min(year, ctx.presentYear)) || project.stateOf(state.lang);
        })();
        const g = state.word.trim().toLowerCase();
        const e = st.entries.find((x) => x.gloss === g && x.core && !x.retired && !x.paradigm) || st.entries.find((x) => x.gloss === g && !x.retired && !x.paradigm);
        if (!e) {
            const some = st.entries.filter((x) => !x.retired && !x.paradigm && x.core).slice(0, 8).map((x) => x.gloss).join(', ');
            out.innerHTML = `<div class="hint">${esc(name(state.lang))} has no word listed for "${esc(g)}" (it has: ${esc(some)} …).</div>`;
            return;
        }
        const written = writeWord(stage, e.form, g, st.phonotactics);
        out.innerHTML = `<div class="sc-word">${wordSvg(stage, written, 64)}</div><div class="hint">${esc(e.ipa)} · ${written.map((w) => `${esc(valueOf(w.sign))}${w.mark ? `+${esc(w.mark)}` : ''}${w.bare ? ' (bare)' : ''}`).join(' ')}${stage.type === 'abugida' ? ` · the built-in vowel is ${esc(stage.inherent ?? '')}` : ''}${stage.type === 'abjad' ? ' · the vowels are not written' : ''}</div>`;
    } catch (err) { out.innerHTML = `<div class="views-empty">${esc(err.message)}</div>`; }
}

const dirLabel = (d) => ({ ltr: 'left to right', rtl: 'right to left', ttb: 'top to bottom' })[d] || d;

/** Lastnu's words (data/lastnu.json, scripts/build-lastnu.js) as something the writer can read. */
let lastnu = null;
async function lastnuState() {
    if (!lastnu) {
        const res = await fetch('data/lastnu.json', { cache: 'no-store' });
        if (!res.ok) throw new Error('data/lastnu.json is missing: run npm run lastnu.');
        const l = await res.json();
        lastnu = { entries: [...Object.entries(l.roots || {}), ...Object.entries(l.words || {})].map(([gloss, w]) => ({ gloss, ipa: w.ipa, form: parseWord(w.ipa), core: true })), phonotactics: null };
    }
    return lastnu;
}
