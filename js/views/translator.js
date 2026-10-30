/**
 * Translator (DJ, 17 Oct 2026: "would it be possible to add a translator? I
 * can add a sentence and get the translated results"). English in, any
 * language of the chart out, as it stands in 1765 or in any earlier year,
 * with the gloss that shows how each word was built, and side by side with
 * its sisters to watch one sentence come apart across a family.
 *
 * The work is js/engine/text/translate.js; this is the window onto it. A
 * word in ⟨angle brackets⟩ is one the language has no word for.
 */

import { esc } from '../views.js';
import { projectFor, configFor, stateAtYear } from '../lang-project.js';
import { translate, analyseEnglish, grammarNotes } from '../engine/text/translate.js';
import { NEGATION, QUESTION } from '../engine/syntax/parameters.js';
import { loadScripts, scriptOf, writePassage, wordSvg, SCRIPTS_CHANGED } from '../engine/script/use.js';
import { shownGloss } from '../engine/lexicon/relabel.js';

let scripts = null;   // data/scripts.json, once loaded
window.addEventListener(SCRIPTS_CHANGED, () => { scripts = null; });

const SAMPLE = 'The old man came to the river at night. He saw a white bird on a stone. The bird said: I know your name. Do you know my name? We will not go to your house tomorrow.';

export function render(el, ctx) {
    const { model, presentYear, state } = ctx;
    const langs = model.languages.filter((l) => configFor(model.familyRootOf.get(l.id), model)).sort((a, b) => a.name.localeCompare(b.name));
    state.lang ??= (model.byId.get('emaran') ? 'emaran' : langs.find((l) => l.died == null && !l.diverged)?.id);
    state.text ??= SAMPLE;
    state.year ??= '';
    state.sisters ??= false;
    state.polite ??= false;
    state.we ??= 'auto';
    state.addressee ??= 'auto';
    state.evidence ??= 'auto';

    el.innerHTML = `
      <div class="views-controls">
        <label>Language <input id="t-lang" list="t-langs" value="${esc(model.byId.get(state.lang)?.name ?? '')}"></label>
        <datalist id="t-langs">${langs.map((l) => `<option value="${esc(l.name)}">`).join('')}</datalist>
        <label title="Leave empty for the language as it last stood (1765 for a living one)">Year <input id="t-year" type="number" style="width:6em" value="${esc(state.year)}" placeholder="${presentYear}"></label>
        <label><input type="checkbox" id="t-sis" ${state.sisters ? 'checked' : ''}> beside its sisters</label>
        <label title="Use the polite &quot;you&quot; where the language has one (French vous, German Sie)"><input type="checkbox" id="t-pol" ${state.polite ? 'checked' : ''}> polite</label>
        <label title="Where a language has two words for &quot;we&quot;, which one: with the listener (&quot;you and I&quot;) or without">"we" <select id="t-we">
          <option value="auto"${state.we === 'auto' ? ' selected' : ''}>by the sentence</option>
          <option value="inclusive"${state.we === 'inclusive' ? ' selected' : ''}>you and I</option>
          <option value="exclusive"${state.we === 'exclusive' ? ' selected' : ''}>not you</option></select></label>
        <label title="Who a command is said to, where the language tells one from several (Latin canta / cantate)">"you" <select id="t-you">
          <option value="auto"${state.addressee === 'auto' ? ' selected' : ''}>by the sentence</option>
          <option value="one"${state.addressee === 'one' ? ' selected' : ''}>one person</option>
          <option value="several"${state.addressee === 'several' ? ' selected' : ''}>several</option></select></label>
        <label title="Where a language marks how the speaker knows (Quechua -mi, -si), which: English does not say">known by <select id="t-evid">
          <option value="auto"${state.evidence === 'auto' ? ' selected' : ''}>by the sentence</option>
          <option value="seen"${state.evidence === 'seen' ? ' selected' : ''}>seeing it</option>
          <option value="reported"${state.evidence === 'reported' ? ' selected' : ''}>being told</option>
          <option value="inferred"${state.evidence === 'inferred' ? ' selected' : ''}>working it out</option></select></label>
        <button class="btn" id="t-go">Translate</button>
        <span class="hint">Ctrl+Enter translates. A word in ⟨angle brackets⟩ is one the language has no word for. Small English only: plain sentences, questions, commands ("Don't go!", "Come, all of you!"), "let's", "let him...", "may you...", "would", "they say...", "apparently...", "not", the tenses.</span>
      </div>
      <textarea id="t-text" rows="3" style="width:100%;box-sizing:border-box;font:inherit;padding:6px">${esc(state.text)}</textarea>
      <div id="t-out" style="margin-top:10px"></div>`;

    const lookup = (name) => langs.find((l) => l.name.toLowerCase() === String(name).trim().toLowerCase());
    el.querySelector('#t-lang').addEventListener('change', (e) => { const l = lookup(e.target.value); if (l) { state.lang = l.id; go(); } });
    el.querySelector('#t-year').addEventListener('change', (e) => { state.year = e.target.value; go(); });
    el.querySelector('#t-sis').addEventListener('change', (e) => { state.sisters = e.target.checked; go(); });
    el.querySelector('#t-pol').addEventListener('change', (e) => { state.polite = e.target.checked; go(); });
    el.querySelector('#t-we').addEventListener('change', (e) => { state.we = e.target.value; go(); });
    el.querySelector('#t-you').addEventListener('change', (e) => { state.addressee = e.target.value; go(); });
    el.querySelector('#t-evid').addEventListener('change', (e) => { state.evidence = e.target.value; go(); });
    el.querySelector('#t-go').addEventListener('click', () => go());
    const ta = el.querySelector('#t-text');
    ta.addEventListener('input', () => { state.text = ta.value; });
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); go(); } });

    /** The living languages nearest the chosen one in the tree, for comparison. */
    const sistersOf = (id) => {
        const root = model.familyRootOf.get(id);
        const chain = (x) => { const out = []; let c = model.byId.get(x); while (c) { out.push(c.id); c = c.parentId ? model.byId.get(c.parentId) : null; } return out; };
        const mine = chain(id);
        const kids = new Set(model.languages.map((l) => l.parentId));
        return model.languages
            .filter((l) => l.id !== id && model.familyRootOf.get(l.id) === root && l.died == null && !l.diverged && !kids.has(l.id) && !l.generated)
            .map((l) => ({ l, d: chain(l.id).findIndex((a) => mine.includes(a)) }))
            .sort((a, b) => a.d - b.d || a.l.name.localeCompare(b.l.name))
            .slice(0, 5).map((x) => x.l.id);
    };

    /** The passage in the language's own script that year, or its nearest ancestor's (use.js). */
    const written = (id, year, st, sentence) => {
        if (!scripts) return '';
        const sc = scriptOf(scripts, id, year ?? presentYear, (x) => model.byId.get(x)?.parentId);
        if (!sc) return '';
        const words = writePassage(sc.stage, st, sentence.words);
        if (!words.length) return '';
        const vertical = sc.stage.direction === 'ttb';
        const who = model.byId.get(sc.via)?.name ?? sc.via;
        const how = sc.reason === 'own' || !sc.reason ? '' : sc.reason === 'family' ? ` (the script of ${esc(who)})` : sc.reason === 'religion' ? ` (with ${esc(who)})`
            : sc.reason === 'rule' ? ` (under ${esc(who)})` : sc.reason === 'colony' ? ` (as its colonisers, ${esc(who)})` : sc.reason === 'state' ? ` (beside ${esc(who)})` : ` (from ${esc(who)})`;
        return `<div class="tr-script" style="margin:4px 0;color:var(--text);${vertical ? 'max-height:420px;overflow:auto' : 'overflow-x:auto'}">${wordSvg(sc.stage, words, vertical ? 26 : 30)}</div>
          <div class="hint">in the ${esc(sc.stage.name)}${sc.since != null ? ` since ${sc.since < 0 ? `${-sc.since} BFA` : `${sc.since} AFA`}` : ''}${how}</div>`;
    };

    const card = (id, year, out) => {
        const node = model.byId.get(id);
        const st = out.state;
        const s = st.syntax || {};
        const notes = [...grammarNotes(st),
            NEGATION[s.negation] ? `"not" by ${NEGATION[s.negation].label}` : null,
            QUESTION[s.polar] ? `yes-no questions by ${QUESTION[s.polar].label}` : null].filter(Boolean);
        return `<div style="border:1px solid var(--border-soft);border-radius:6px;padding:8px 10px;margin-bottom:10px">
          <div><b>${esc(node?.name ?? id)}</b> <span class="hint">${year != null ? `as of ${year}` : node?.died != null ? `as last spoken (${node.died})` : 'in 1765'}</span></div>
          ${out.t.sentences.map((x) => `<div style="margin:6px 0">
            <div style="font-size:16px">${esc(x.spelling)}</div>
            ${written(id, year, st, x)}
            <div class="ipa">/${esc(x.ipa)}/</div>
            <div class="hint" style="font-family:var(--mono, monospace)">${esc(shownGloss(x.gloss))}</div>
          </div>`).join('')}
          ${out.t.missing.length ? `<div class="hint">No word for: ${out.t.missing.map(esc).join(', ')}</div>` : ''}
          <div class="hint">${esc(notes.join(' · '))}</div>
        </div>`;
    };

    if (!scripts) loadScripts().then((d) => { if (d) { scripts = d; if (el.isConnected) go(); } });
    const go = () => {
        const out = el.querySelector('#t-out');
        out.innerHTML = '<div class="hint">Translating…</div>';
        setTimeout(() => {
            try {
                const analysis = analyseEnglish(state.text);
                const year = state.year === '' ? null : Number(state.year);
                const ids = [state.lang, ...(state.sisters ? sistersOf(state.lang) : [])];
                const html = [];
                for (const id of ids) {
                    const project = projectFor(model, id, presentYear);
                    if (!project) continue;
                    const st = year != null ? stateAtYear(project, id, year) : project.stateOf(id);
                    if (!st) continue;
                    html.push(card(id, year, { state: st, t: translate(st, analysis, { polite: state.polite, we: state.we, addressee: state.addressee, evidence: state.evidence }) }));
                }
                const english = analysis.missing.length
                    ? `<div class="hint">English words the translator does not know: ${analysis.missing.map(esc).join(', ')}</div>` : '';
                out.innerHTML = english + (html.join('') || '<div class="views-empty">No language to translate into.</div>');
            } catch (err) {
                out.innerHTML = `<div class="views-empty">Could not translate: ${esc(err.message)}</div>`;
            }
        }, 30);
    };
    go();
}
