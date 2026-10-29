/**
 * Name forge: place and personal names for any living language, for
 * worldbuilding. Each name is coined in one of the language's ancestors (rivers
 * deepest, people most recent, as real toponymies are stratified), carried down
 * through every sound change since, and read for how transparent it still is to
 * the speakers. Uses the engine live, so it reflects the chart as it is now.
 */

import { esc } from '../views.js';
import { projectFor, configFor } from '../lang-project.js';
import { coinArchaicLayer, STRATA } from '../engine/lexicon/toponyms.js';
import { derive } from '../engine/rng.js';
import { loadScripts, scriptOf, wordSvg } from '../engine/script/use.js';
import { writeWord } from '../engine/script/write.js';
import { parseWord } from '../engine/features.js';

let SCRIPTS = null;   // data/scripts.json, once loaded

export function render(el, ctx) {
    const { model, presentYear, state } = ctx;
    const speaking = model.languages
        .filter((l) => l.died == null && !l.diverged && !model.languages.some((x) => x.parentId === l.id))
        .filter((l) => configFor(model.familyRootOf.get(l.id), model))
        .sort((a, b) => a.name.localeCompare(b.name));
    state.lang ??= speaking[0]?.id;
    state.kind ??= 'settlement';
    state.batch ??= 1;

    el.innerHTML = `
      <div class="views-controls">
        <label>Language <input id="nf-lang" list="nf-langs" value="${esc(model.byId.get(state.lang)?.name ?? '')}" placeholder="a living language"></label>
        <datalist id="nf-langs">${speaking.map((l) => `<option value="${esc(l.name)}">`).join('')}</datalist>
        <label>Kind <select id="nf-kind">${Object.keys(STRATA).map((k) => `<option${k === state.kind ? ' selected' : ''}>${k}</option>`).join('')}</select></label>
        <button class="btn" id="nf-more">Forge more</button>
        <span class="hint">${esc(STRATA[state.kind].note)}</span>
      </div>
      <div id="nf-out"><div class="hint">Deriving…</div></div>`;
    const lookup = (name) => speaking.find((l) => l.name.toLowerCase() === String(name).trim().toLowerCase());
    el.querySelector('#nf-lang').addEventListener('change', (e) => { const l = lookup(e.target.value); if (l) { state.lang = l.id; state.batch = 1; render(el, ctx); } });
    el.querySelector('#nf-kind').addEventListener('change', (e) => { state.kind = e.target.value; render(el, ctx); });
    el.querySelector('#nf-more').addEventListener('click', () => { state.batch += 1; render(el, ctx); });

    // Let the "Deriving…" paint before the engine runs.
    setTimeout(() => {
        const out = el.querySelector('#nf-out');
        if (!out || !state.lang) return;
        try {
            const project = projectFor(model, state.lang, presentYear);
            const names = coinArchaicLayer(project, state.lang, derive('name-forge', state.lang, state.kind, String(state.batch)), { count: 12, kinds: [state.kind] });
            // each name in the script the language writes (use.js), a name-sign where a word-sign script has none (write.js)
            if (!SCRIPTS) loadScripts().then((d) => { if (d && !SCRIPTS) { SCRIPTS = d; if (el.isConnected) render(el, ctx); } });
            const sc = SCRIPTS ? scriptOf(SCRIPTS, state.lang, presentYear ?? 1765, (x) => model.byId.get(x)?.parentId) : null;
            const st = sc ? project.stateOf(state.lang) : null;
            const written = (n) => {
                if (!sc) return '';
                try { const w = writeWord(sc.stage, parseWord(n.ipa), null, st.phonotactics, { name: true }); return w.length ? `<span style="display:inline-block;max-width:240px;overflow:hidden;color:var(--text)">${wordSvg(sc.stage, w, sc.stage.direction === 'ttb' ? 16 : 22)}</span>` : ''; } catch { return ''; }
            };
            out.innerHTML = names.length ? `<table class="views-table"><thead><tr><th>Name</th>${sc ? `<th>${esc(sc.stage.name.replace(/ script( in print)?$/, ''))}</th>` : ''}<th>IPA</th><th>Meant</th><th>Coined in</th><th>Today</th></tr></thead><tbody>
              ${names.map((n) => `<tr><td><b>${esc(n.spelling)}</b></td>${sc ? `<td>${written(n)}</td>` : ''}<td class="ipa">/${esc(n.ipa)}/</td><td>“${esc(n.coinedGloss)}”<div class="hint">${esc(n.coinedSpelling)} /${esc(n.coinedForm)}/</div></td>
                <td>${esc(n.stratum.ancestorName)}</td><td>${esc(n.opacity?.reading ?? '')}${n.opacity?.elements?.some((x) => !x.wordSurvives) ? `<div class="hint">lost: ${n.opacity.elements.filter((x) => !x.wordSurvives).map((x) => esc(x.gloss)).join(', ')}</div>` : ''}</td></tr>`).join('')}
            </tbody></table>` : '<div class="hint">This language has too short a history to coin in.</div>';
        } catch (err) {
            out.innerHTML = `<div class="views-empty">Could not forge names: ${esc(err.message)}</div>`;
        }
    }, 30);
}
