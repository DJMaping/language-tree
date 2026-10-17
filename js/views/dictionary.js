/**
 * Dictionary: a searchable dictionary of any language in the chart, with each
 * word's spelling, pronunciation, part of speech, origin and register, and a
 * CSV download or a printable page. Derived live for the language picked.
 */

import { esc } from '../views.js';
import { projectFor, configFor } from '../lang-project.js';
import { spellEntry } from '../engine/phonology/romanise.js';
import { GENDER_LABELS } from '../engine/morphology/gender.js';
import { classifierOf, classifierWord, CLASSIFIER_CLASSES } from '../engine/morphology/classifiers.js';

const PAGE = 120;
const POS = { n: 'noun', v: 'verb', adj: 'adjective', adv: 'adverb', pron: 'pronoun', num: 'numeral', dem: 'demonstrative', interrog: 'interrogative', quant: 'quantifier', prep: 'adposition', adp: 'adposition', conj: 'conjunction', part: 'particle', clf: 'classifier', art: 'article' };

function originOf(e, state, model) {
    // Words for modern things (js/engine/lexicon/modern.js) say how they were made.
    // "don't", "let" and the articles: the words they were made from
    if ((e.mood || e.article || e.evidential) && e.grammaticalisedFrom) return `from “${e.grammaticalisedFrom.gloss}”${e.grammaticalisedFrom.year != null ? `, c. ${e.grammaticalisedFrom.year}` : ', inherited'}`;
    // a numeral classifier: the noun it grew from (morphology/classifiers.js)
    if (e.classifier && e.grammaticalisedFrom) return `the word “${e.grammaticalisedFrom.gloss}”, a counting word for ${CLASSIFIER_CLASSES[e.classifier]?.label ?? e.classifier}${e.grammaticalisedFrom.year != null ? ` since c. ${e.grammaticalisedFrom.year}` : ''}`;
    const m = e.modern;
    if (m?.strategy === 'calque') return `calque: “${e.compoundOf.modifierGloss}” + “${e.compoundOf.headGloss}”, coined c. ${m.year}`;
    if (m?.strategy === 'extension') return `the word for “${m.fromGloss}”, given this sense c. ${m.year}`;
    if (m?.strategy === 'internationalism') return `loan from Lastnu c. ${m.year}, beside the native word`;
    if (m?.strategy === 'loan') return `loan from Lastnu, the world language, c. ${m.year}`;
    if (e.loan) return `loan from ${model.byId.get(e.loan.from)?.name ?? e.loan.from}${e.loan.learned ? ' (learned)' : ''}`;
    if (e.compoundOf?.incorporated) return `“${e.compoundOf.modifierGloss}” built into “${e.compoundOf.headGloss}” (noun incorporation)`;
    if (e.compoundOf) return `compound of “${e.compoundOf.modifierGloss}” + “${e.compoundOf.headGloss}”`;
    if (e.derivedFrom) return `derived (${String(e.derivedFrom.affix).toLowerCase()}) from ${e.derivedFrom.base}`;
    const h = state.histories?.get(e.id);
    return h?.protoForm ? `inherited, from *${h.protoForm}` : 'inherited';
}

export function render(el, ctx) {
    const { model, presentYear, state } = ctx;
    const langs = model.languages.filter((l) => configFor(model.familyRootOf.get(l.id), model)).sort((a, b) => a.name.localeCompare(b.name));
    state.lang ??= langs.find((l) => l.died == null && !l.diverged)?.id;
    state.q ??= '';
    state.page ??= 0;

    el.innerHTML = `
      <div class="views-controls">
        <label>Language <input id="d-lang" list="d-langs" value="${esc(model.byId.get(state.lang)?.name ?? '')}"></label>
        <datalist id="d-langs">${langs.map((l) => `<option value="${esc(l.name)}">`).join('')}</datalist>
        <label>Search <input id="d-q" value="${esc(state.q)}" placeholder="meaning, spelling or IPA"></label>
        <button class="btn" id="d-csv">Download CSV</button>
        <button class="btn" id="d-print">Printable page</button>
      </div>
      <div id="d-out"><div class="hint">Deriving…</div></div>`;
    const lookup = (name) => langs.find((l) => l.name.toLowerCase() === String(name).trim().toLowerCase());
    el.querySelector('#d-lang').addEventListener('change', (e) => { const l = lookup(e.target.value); if (l) { state.lang = l.id; state.page = 0; render(el, ctx); } });
    el.querySelector('#d-q').addEventListener('input', (e) => { state.q = e.target.value; state.page = 0; fill(); });

    let rows = [];
    const fill = () => {
        const out = el.querySelector('#d-out');
        const q = state.q.trim().toLowerCase();
        const hits = q ? rows.filter((r) => r.gloss.toLowerCase().includes(q) || r.spelling.toLowerCase().includes(q) || r.ipa.includes(q)) : rows;
        const pages = Math.max(1, Math.ceil(hits.length / PAGE));
        state.page = Math.min(state.page, pages - 1);
        const slice = hits.slice(state.page * PAGE, state.page * PAGE + PAGE);
        out.innerHTML = `<div class="hint">${hits.length} of ${rows.length} words${pages > 1 ? ` · page ${state.page + 1} of ${pages} <button class="linklike" id="d-prev">‹</button> <button class="linklike" id="d-next">›</button>` : ''}</div>
          <table class="views-table"><thead><tr><th>Word</th><th>IPA</th><th>Meaning</th><th>Part of speech</th><th>Origin</th></tr></thead><tbody>
          ${slice.map((r) => `<tr><td><b>${esc(r.spelling)}</b></td><td class="ipa">/${esc(r.ipa)}/</td><td>${esc(r.gloss)}${r.register ? ` <span class="hint">(${esc(r.register)})</span>` : ''}</td><td>${esc(r.pos)}</td><td class="hint">${esc(r.origin)}</td></tr>`).join('')}
          </tbody></table>`;
        out.querySelector('#d-prev')?.addEventListener('click', () => { state.page = Math.max(0, state.page - 1); fill(); });
        out.querySelector('#d-next')?.addEventListener('click', () => { state.page += 1; fill(); });
    };

    setTimeout(() => {
        try {
            const project = projectFor(model, state.lang, presentYear);
            const st = project.stateOf(state.lang);
            const sys = st.paradigm?.categories?.classifiers;
            const byId = new Map(st.entries.map((e) => [e.id, e]));
            // the classifier a noun is counted with, where the language has them
            const counted = (e) => {
                const c = sys && e.pos === 'n' ? classifierOf(e, sys, byId) : null;
                if (c === 'SELF') return ', counted bare';
                const w = c ? classifierWord(st.entries, c) : null;
                return w ? `, counted with ${spellEntry(st, w) || w.ipa}` : '';
            };
            rows = st.entries.filter((e) => !e.retired && (!e.paradigm || e.classifier || e.article || e.mood || e.evidential) && e.form?.length).map((e) => ({
                spelling: spellEntry(st, e) || e.ipa,
                ipa: e.ipa,
                gloss: e.gloss,
                // a noun's gender, where agreement still shows it
                pos: `${POS[e.pos] || e.pos || ''}${e.gender && (st.paradigm?.categories?.genders || []).includes(e.gender) ? ` (${GENDER_LABELS[e.gender] ?? e.gender})` : ''}${counted(e)}`,
                register: e.register && e.register !== 'neutral' ? e.register : '',
                origin: originOf(e, st, model),
            })).sort((a, b) => a.gloss.localeCompare(b.gloss));
            fill();
        } catch (err) {
            el.querySelector('#d-out').innerHTML = `<div class="views-empty">Could not derive this language: ${esc(err.message)}</div>`;
        }
    }, 30);

    const name = () => model.byId.get(state.lang)?.name ?? 'language';
    el.querySelector('#d-csv').addEventListener('click', () => {
        const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
        const csv = ['word,ipa,meaning,part of speech,register,origin', ...rows.map((r) => [r.spelling, r.ipa, r.gloss, r.pos, r.register, r.origin].map(q).join(','))].join('\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
        a.download = `${name().replace(/[^\p{L}\p{N}]+/gu, '-')}-dictionary.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
    el.querySelector('#d-print').addEventListener('click', () => {
        const w = window.open('', '_blank');
        if (!w) return;
        w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(name())} dictionary</title>
          <style>body{font:12px Georgia,serif;margin:2em}h1{font-size:20px}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ccc;padding:2px 6px;text-align:left;vertical-align:top}.i{font-family:sans-serif;color:#555}</style>
          <h1>${esc(name())}: dictionary</h1><table><tr><th>Word</th><th>IPA</th><th>Meaning</th><th>Part of speech</th><th>Origin</th></tr>
          ${rows.map((r) => `<tr><td><b>${esc(r.spelling)}</b></td><td class="i">/${esc(r.ipa)}/</td><td>${esc(r.gloss)}</td><td>${esc(r.pos)}</td><td class="i">${esc(r.origin)}</td></tr>`).join('')}</table>`);
        w.document.close();
        w.focus();
        w.print();
    });
}
