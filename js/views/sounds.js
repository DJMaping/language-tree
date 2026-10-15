/**
 * Sounds: a language's consonants and vowels laid out as the IPA charts lay
 * them out, side by side with a second language if wanted, and the line's
 * sound changes on a timeline from the proto-language down, each with words
 * before and after.
 */

import { esc } from '../views.js';
import { projectFor } from '../lang-project.js';
import { applyRule } from '../engine/soundchange/rule.js';

const PLACES = ['bilabial', 'labiodental', 'dental', 'alveolar', 'postalveolar', 'retroflex', 'alveolopalatal', 'palatal', 'velar', 'labiovelar', 'uvular', 'pharyngeal', 'glottal'];
const PLACE_LABEL = { alveolopalatal: 'alveolo-palatal', labiovelar: 'labial-velar' };
const MANNERS = [['stop', 'Plosive'], ['affricate', 'Affricate'], ['nasal', 'Nasal'], ['trill', 'Trill'], ['tap', 'Tap or flap'], ['fricative', 'Fricative'], ['lfricative', 'Lateral fricative'], ['approximant', 'Approximant'], ['lapproximant', 'Lateral approximant']];
const HEIGHTS = ['Close', 'Close-mid', 'Mid', 'Open-mid', 'Open'];
const lab = (y) => (y >= 0 ? `${y} AFA` : `${-y} BFA`);

function derive(ctx, id) {
    const project = projectFor(ctx.model, id, ctx.presentYear);
    if (!project) throw new Error(`${ctx.model.byId.get(id)?.name ?? id}: this family has no engine configuration.`);
    return { project, state: project.stateOf(id) };
}

export async function render(el, ctx) {
    const { model, state } = ctx;
    state.a ??= model.languages.find((l) => l.name === 'Ukhdari')?.id ?? model.languages[0].id;
    state.tab ??= 'charts';
    const names = model.languages.map((l) => `${l.name} (${l.id})`);
    const val = (id) => (id ? `${model.byId.get(id)?.name} (${id})` : '');
    el.innerHTML = `
      <div class="views-controls">
        <label>Language <input list="sn-langs" id="sn-a" value="${esc(val(state.a))}" style="width:230px"></label>
        <label>compare with <input list="sn-langs" id="sn-b" value="${esc(val(state.b))}" placeholder="(optional)" style="width:230px"></label>
        <datalist id="sn-langs">${names.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
        <button class="views-tab${state.tab === 'charts' ? ' on' : ''}" data-tab="charts">IPA charts</button>
        <button class="views-tab${state.tab === 'changes' ? ' on' : ''}" data-tab="changes">Sound changes through time</button>
      </div>
      <div id="sn-body"><div class="hint">Working out the sounds…</div></div>`;
    const pickId = (v) => { const m = /\(([^()]+)\)$/.exec(v); return m && model.byId.has(m[1]) ? m[1] : null; };
    el.querySelector('#sn-a').addEventListener('change', (e) => { const id = pickId(e.target.value); if (id) { state.a = id; render(el, ctx); } });
    el.querySelector('#sn-b').addEventListener('change', (e) => { state.b = pickId(e.target.value); render(el, ctx); });
    el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { state.tab = b.dataset.tab; render(el, ctx); }));
    await new Promise((r) => setTimeout(r, 20));
    const body = el.querySelector('#sn-body');
    try {
        if (state.tab === 'charts') charts(body, ctx);
        else changes(body, ctx);
    } catch (e) {
        body.innerHTML = `<div class="views-empty">${esc(e.message)}</div>`;
        console.error(e);
    }
}

// --- the IPA charts ------------------------------------------------------------------

function charts(body, ctx) {
    const { model, state } = ctx;
    const A = derive(ctx, state.a).state;
    const B = state.b ? derive(ctx, state.b).state : null;
    const nameA = model.byId.get(state.a)?.name, nameB = B ? model.byId.get(state.b)?.name : null;
    const inB = new Set(B ? [...B.inventory.consonants, ...B.inventory.vowels].map((s) => s.ipa) : []);
    const inA = new Set([...A.inventory.consonants, ...A.inventory.vowels].map((s) => s.ipa));
    const cls = (ipa, owner) => (!B ? '' : owner === 'a' ? (inB.has(ipa) ? 'both' : 'onlya') : (inA.has(ipa) ? 'both' : 'onlyb'));

    const cons = [];
    for (const s of A.inventory.consonants) cons.push({ s, owner: 'a' });
    if (B) for (const s of B.inventory.consonants) if (!inA.has(s.ipa)) cons.push({ s, owner: 'b' });
    const mannerOf = (f) => (f.lateral && f.manner === 'fricative' ? 'lfricative' : f.lateral && f.manner === 'approximant' ? 'lapproximant' : f.manner);
    const usedPlaces = PLACES.filter((p) => cons.some(({ s }) => s.f.place === p));
    const usedManners = MANNERS.filter(([m]) => cons.some(({ s }) => mannerOf(s.f) === m));
    const cell = (place, manner, voiced) => cons
        .filter(({ s }) => s.f.place === place && mannerOf(s.f) === manner && !!s.f.voice === voiced)
        .map(({ s, owner }) => `<span class="ph ${cls(s.ipa, owner)}" title="${esc(describe(s))}">${esc(s.ipa)}</span>`).join(' ');
    const consTable = `<table class="ipa-c"><tr><th></th>${usedPlaces.map((p) => `<th colspan="2">${esc(PLACE_LABEL[p] ?? p)}</th>`).join('')}</tr>
      ${usedManners.map(([m, label]) => `<tr><th>${label}</th>${usedPlaces.map((p) => `<td class="vl">${cell(p, m, false)}</td><td class="vd">${cell(p, m, true)}</td>`).join('')}</tr>`).join('')}</table>`;

    // vowels on the trapezoid
    const vow = [];
    for (const s of A.inventory.vowels) vow.push({ s, owner: 'a' });
    if (B) for (const s of B.inventory.vowels) if (!inA.has(s.ipa)) vow.push({ s, owner: 'b' });
    const Wv = 420, Hv = 300, pad = 40;
    const pos = (f) => {
        const t = ((f.height ?? 3) - 1) / 4;                 // 0 close .. 1 open
        const left = pad + t * 110, right = Wv - pad;          // the chart's slanted front edge
        const x = left + (((f.back ?? 2) - 1) / 2) * (right - left);
        return [x + (f.round ? 14 : -14), pad + t * (Hv - 2 * pad)];
    };
    const placed = new Map();
    const glyphs = vow.map(({ s, owner }) => {
        let [x, y] = pos(s.f);
        const k = `${Math.round(x)}|${Math.round(y)}`;
        const n = placed.get(k) || 0;
        placed.set(k, n + 1);
        x += n * 15;
        return `<text x="${x.toFixed(0)}" y="${(y + 6).toFixed(0)}" class="ph ${cls(s.ipa, owner)}" text-anchor="middle"><title>${esc(describe(s))}</title>${esc(s.ipa)}</text>`;
    }).join('');
    const tl = [pad, pad], tr = [Wv - pad, pad], br = [Wv - pad, Hv - pad], bl = [pad + 110, Hv - pad];
    const vowelSvg = `<svg class="ipa-v" viewBox="0 0 ${Wv} ${Hv}">
      <polygon points="${[tl, tr, br, bl].map((p) => p.join(',')).join(' ')}" class="trap"/>
      ${[1, 2, 3].map((i) => { const t = i / 4; const l = pad + t * 110; return `<line x1="${l}" x2="${Wv - pad}" y1="${pad + t * (Hv - 2 * pad)}" y2="${pad + t * (Hv - 2 * pad)}" class="grid"/>`; }).join('')}
      <line x1="${(pad + Wv - pad) / 2}" y1="${pad}" x2="${(pad + 110 + Wv - pad) / 2}" y2="${Hv - pad}" class="grid"/>
      ${HEIGHTS.map((h, i) => `<text x="4" y="${pad + (i / 4) * (Hv - 2 * pad) + 4}" class="axis">${h}</text>`).join('')}
      <text x="${pad}" y="20" class="axis">Front</text><text x="${Wv / 2}" y="20" class="axis" text-anchor="middle">Central</text><text x="${Wv - pad}" y="20" class="axis" text-anchor="end">Back</text>
      ${glyphs}</svg>`;

    const tones = (st) => [...new Set(st.inventory.vowels.map((v) => v.f.tone).filter((t) => t != null && t !== 0))].length;
    const stats = (st, name) => `<div class="kv"><b>${esc(name)}:</b> ${st.inventory.consonants.length} consonants, ${new Set(st.inventory.vowels.map((v) => `${v.f.height}|${v.f.back}|${v.f.round}`)).size} vowel qualities (${st.inventory.vowels.length} vowels with length, nasality and tone), ${tones(st) ? `${tones(st) + 1} tones` : 'no tone'}; word order ${esc(st.syntax?.order ?? '?')}</div>`;
    body.innerHTML = `
      ${stats(A, nameA)}${B ? stats(B, nameB) : ''}
      ${B ? `<div class="hint"><span class="ph onlya">blue</span> only in ${esc(nameA)}, <span class="ph onlyb">orange</span> only in ${esc(nameB)}, plain in both.</div>` : ''}
      <h4 class="ty-head">Consonants <span class="hint">voiceless left, voiced right in each column; hover for a description</span></h4>
      ${consTable}
      <h4 class="ty-head">Vowels <span class="hint">unrounded left of each point, rounded right</span></h4>
      ${vowelSvg}`;
}

function describe(s) {
    const f = s.f;
    if (s.type === 'V') {
        return [HEIGHTS[(f.height ?? 3) - 1]?.toLowerCase(), ['front', 'central', 'back'][(f.back ?? 2) - 1], f.round ? 'rounded' : 'unrounded', f.nasal && 'nasal', f.long && 'long', f.tone ? `tone ${f.tone}` : null].filter(Boolean).join(' ') + ' vowel';
    }
    return [f.voice ? 'voiced' : 'voiceless', f.aspirated && 'aspirated', f.glottalised && 'ejective/glottalised', f.palatalised && 'palatalised', f.labialised && 'labialised', f.long && 'long', PLACE_LABEL[f.place] ?? f.place, f.lateral && 'lateral', f.manner].filter(Boolean).join(' ');
}

// --- sound changes through time ---------------------------------------------------------

function changes(body, ctx) {
    const { model, state, presentYear } = ctx;
    const { project } = derive(ctx, state.a);
    const line = [];
    for (let n = model.byId.get(state.a); n; n = n.parentId ? model.byId.get(n.parentId) : null) line.unshift(n);
    const t0 = line[0].born ?? 0, t1 = model.byId.get(state.a).died ?? presentYear;
    const events = [];
    for (const node of line) {
        let cs, st;
        try { cs = project.changeSetOf ? project.changeSetOf(node.id) : null; st = project.stateOf(node.id); cs ??= st.changeSet; } catch { continue; }
        if (!cs?.rules?.length) continue;
        // examples: run the stage's rules over its founding words
        let founding = null;
        try { founding = project.foundingOf(node.id); } catch { /* the root has none */ }
        const sample = (founding?.entries || []).filter((e) => e.core && e.form?.length).slice(0, 160).map((e) => ({ gloss: e.gloss, cur: e.form }));
        for (const r of cs.rules) {
            const ex = [];
            for (const w of sample) {
                let res;
                try { res = applyRule(w.cur, r, { phonotactics: founding?.phonotactics }); } catch { res = null; }
                if (res?.applied) {
                    if (ex.length < 4) ex.push(`${w.gloss}: ${w.cur.map((s) => s.ipa).join('')} → ${res.segments.map((s) => s.ipa).join('')}`);
                    w.cur = res.segments;
                }
            }
            events.push({ stage: node, r, n: st?.stats?.byRule?.get(r.id), ex });
        }
    }
    events.sort((a, b) => (a.r.year ?? 0) - (b.r.year ?? 0));
    const cats = [...new Set(events.map((e) => e.r.category || 'other'))];
    const hue = (c) => (cats.indexOf(c) * 360) / Math.max(1, cats.length);
    const W = 980, H = 120, L = 20, R = 20;
    const X = (y) => L + ((y - t0) / (t1 - t0 || 1)) * (W - L - R);
    const bands = line.map((s, i) => {
        const a = Math.max(t0, s.born ?? t0), b = i + 1 < line.length ? line[i + 1].born ?? t1 : t1;
        return `<rect x="${X(a)}" y="78" width="${Math.max(1, X(b) - X(a))}" height="16" class="sn-stage${i % 2 ? ' alt' : ''}"><title>${esc(`${s.name}: ${lab(a)}–${lab(b)}`)}</title></rect>${X(b) - X(a) > 60 ? `<text x="${(X(a) + X(b)) / 2}" y="90" class="sn-stage-t" text-anchor="middle">${esc(s.name)}</text>` : ''}`;
    }).join('');
    const ticks = events.map((e, i) => `<line x1="${X(e.r.year ?? t0)}" x2="${X(e.r.year ?? t0)}" y1="${70 - (i % 4) * 14}" y2="76" style="stroke:hsl(${hue(e.r.category || 'other')} 55% 45%)" class="sn-tick"/><circle cx="${X(e.r.year ?? t0)}" cy="${70 - (i % 4) * 14}" r="4" style="fill:hsl(${hue(e.r.category || 'other')} 55% 50%)" data-i="${i}"><title>${esc(`c. ${lab(e.r.year)}: ${e.r.label}`)}</title></circle>`).join('');
    body.innerHTML = `
      <div class="hint">${events.length} sound changes on the line from ${esc(line[0].name)} to ${esc(line.at(-1).name)}. Colour = kind of change (${cats.map((c) => `<span style="color:hsl(${hue(c)} 55% 40%)">${esc(c)}</span>`).join(', ')}). Click a dot to jump to it.</div>
      <svg class="sn-time" viewBox="0 0 ${W} ${H}">${bands}${ticks}
        <text x="${L}" y="112" class="axis">${lab(t0)}</text><text x="${W - R}" y="112" class="axis" text-anchor="end">${lab(t1)}</text></svg>
      <div class="sn-list">${events.map((e, i) => `<div class="chg" id="sn-${i}">
        <div class="chg-head"><span class="chg-year">c. ${lab(e.r.year)}</span> <span class="chg-label">${esc(e.r.label)}</span>
          <span class="hint">${esc(e.stage.name)}${e.n != null ? `, ${e.n} word${e.n === 1 ? '' : 's'}` : ''}</span></div>
        ${e.ex.length ? `<div class="sn-ex">${e.ex.map((x) => `<span>${esc(x)}</span>`).join('')}</div>` : ''}
        ${e.r.analogue ? `<div class="chg-cf">cf. ${esc(e.r.analogue)}</div>` : ''}
      </div>`).join('')}</div>`;
    body.querySelector('.sn-time').addEventListener('click', (e) => {
        const c = e.target.closest('[data-i]');
        if (c) body.querySelector(`#sn-${c.dataset.i}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
}
