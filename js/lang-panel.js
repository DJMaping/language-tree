/**
 * The language sections of the detail panel.
 *
 * Renders a derived stage: its phoneme inventory, its phonotactics, the sound
 * changes on the edge that produced it, its lexicon, and a comparative table
 * across sister languages. Clicking a word opens its etymology — the full chain
 * back to the proto-form with the rule responsible for each step.
 *
 * Stateless like the rest of the panel, apart from a small view state (which
 * sections are open, IPA or spelling) that lives here rather than in the
 * document — none of it is worth saving.
 */

import { projectFor, configFor, familyRootOf, comparisonSet } from './lang-project.js';

const esc = (s) => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** View state. Deliberately not persisted — it's a lens, not data. */
const view = {
    script: 'ipa',        // 'ipa' | 'roman'
    open: new Set(['phonology', 'lexicon']),
    word: null,           // root id whose etymology is expanded
    lexPage: 0,
    lexFilter: '',
};

const LEX_PAGE = 24;

export function langViewState() { return view; }

/**
 * Handle a click inside the language sections.
 * Returns true if it was ours, so main.js knows to re-render.
 */
export function handleLangAction(action, btn) {
    switch (action) {
        case 'lang-script': view.script = view.script === 'ipa' ? 'roman' : 'ipa'; return true;
        case 'lang-toggle': {
            const id = btn.getAttribute('data-section');
            if (view.open.has(id)) view.open.delete(id); else view.open.add(id);
            return true;
        }
        case 'lang-word': {
            const id = btn.getAttribute('data-word');
            view.word = view.word === id ? null : id;
            return true;
        }
        case 'lang-page': view.lexPage = Math.max(0, view.lexPage + Number(btn.getAttribute('data-delta') || 0)); return true;
        case 'lang-core': view.lexFilter = view.lexFilter === 'core' ? '' : 'core'; view.lexPage = 0; return true;
        default: return false;
    }
}

// ---------------------------------------------------------------------------

const section = (id, title, body, extra = '') => `
<div class="panel-section lang-section">
  <h3><button class="lang-h" data-action="lang-toggle" data-section="${id}" aria-expanded="${view.open.has(id)}">
    <span class="lang-caret">${view.open.has(id) ? '▾' : '▸'}</span>${esc(title)}</button>${extra}</h3>
  ${view.open.has(id) ? `<div class="lang-body">${body}</div>` : ''}
</div>`;

/**
 * The main entry point. Returns '' when this family has no configuration, so
 * the panel is unchanged for families that don't have languages yet.
 */
export function langSectionsHtml(model, lang, presentYear) {
    const rootId = familyRootOf(model, lang.id);
    const config = configFor(rootId);
    if (!config) {
        return `<div class="panel-section lang-section"><h3>Language</h3>
      <div class="hint">No language defined for this family. Add an entry for
      <code>${esc(rootId || '?')}</code> to <code>data/lang-config.json</code> to generate one.</div></div>`;
    }

    let project, state;
    try {
        project = projectFor(model, lang.id, presentYear);
        state = project?.stateOf(lang.id);
    } catch (err) {
        return `<div class="panel-section lang-section"><h3>Language</h3>
      <div class="hint">Could not derive this stage: ${esc(err.message)}</div></div>`;
    }
    if (!state) return '';

    const scriptToggle = `<button class="linklike lang-script" data-action="lang-script"
      title="Switch between IPA and the romanisation">${view.script === 'ipa' ? 'IPA' : 'spelling'}</button>`;

    return `<div class="lang-block">
    <div class="panel-section lang-head">
      <h3>Language <span class="hint">${esc(config.name || rootId)}</span></h3>
      <div class="kv"><b>Phonemes:</b> ${state.inventory.consonants.length} consonants, ${state.inventory.vowels.length} vowels</div>
      <div class="kv"><b>Lexicon:</b> ${state.entries.length} words</div>
      ${state.isProto ? '<div class="hint">Reconstructed root of the family — every form below is starred.</div>' : ''}
    </div>
    ${section('phonology', 'Phonology', phonologyHtml(state), scriptToggle)}
    ${state.changeSet ? section('changes', `Sound changes (${state.changeSet.rules.length})`, changesHtml(state)) : ''}
    ${section('lexicon', 'Lexicon', lexiconHtml(state, model), scriptToggle)}
    ${section('compare', 'Compare with sisters', compareHtml(project, model, lang.id))}
  </div>`;
}

// ---------------------------------------------------------------------------
// Phonology
// ---------------------------------------------------------------------------

const PLACE_ORDER = ['bilabial', 'labiodental', 'dental', 'alveolar', 'postalveolar', 'retroflex', 'alveolopalatal', 'palatal', 'velar', 'labiovelar', 'uvular', 'pharyngeal', 'glottal'];
const PLACE_SHORT = { bilabial: 'bilab', labiodental: 'lab-dt', dental: 'dent', alveolar: 'alv', postalveolar: 'post', retroflex: 'retr', alveolopalatal: 'al-pal', palatal: 'pal', velar: 'vel', labiovelar: 'lab-vl', uvular: 'uvu', pharyngeal: 'phar', glottal: 'glot' };
const MANNER_ORDER = ['stop', 'affricate', 'fricative', 'nasal', 'trill', 'tap', 'approximant'];

function phonologyHtml(state) {
    const cons = state.inventory.consonants;
    const places = PLACE_ORDER.filter((p) => cons.some((c) => c.f.place === p));

    const rows = [];
    for (const manner of [...MANNER_ORDER, 'lateral']) {
        const inRow = manner === 'lateral'
            ? cons.filter((c) => c.f.lateral)
            : cons.filter((c) => c.f.manner === manner && !c.f.lateral);
        if (!inRow.length) continue;
        const cells = places.map((p) => {
            const here = inRow.filter((c) => c.f.place === p).map((c) => `<span class="ph">${esc(c.ipa)}</span>`).join(' ');
            return `<td>${here}</td>`;
        }).join('');
        rows.push(`<tr><th>${esc(manner)}</th>${cells}</tr>`);
    }

    const consTable = `<div class="lang-scroll"><table class="ipa-chart">
    <thead><tr><th></th>${places.map((p) => `<th>${esc(PLACE_SHORT[p] || p)}</th>`).join('')}</tr></thead>
    <tbody>${rows.join('')}</tbody></table></div>`;

    // Vowels are grouped by their plain quality, with length, nasality and tone
    // shown as modifications of it rather than as separate members — that's how
    // a vowel system is actually organised, and it stops a tonal language
    // looking like it has forty vowels.
    const byBase = new Map();
    for (const v of state.inventory.vowels) {
        const base = v.ipa.replace(/[ːʰ˩˨˧˦˥̃]/gu, '');
        if (!byBase.has(base)) byBase.set(base, []);
        byBase.get(base).push(v.ipa);
    }
    const vowelRows = [...byBase.entries()]
        .map(([base, all]) => `<span class="vow"><b>${esc(base)}</b>${all.length > 1 ? ` <span class="hint">${esc(all.filter((x) => x !== base).join(' '))}</span>` : ''}</span>`)
        .join('');

    const pt = state.phonotactics;
    const tone = state.inventory.vowels.some((v) => v.f.tone);

    return `${consTable}
    <div class="kv"><b>Vowels:</b> <span class="vowels">${vowelRows}</span></div>
    <div class="kv"><b>Syllable:</b> ${esc(pt.syllable || '(C)V(C)')}</div>
    <div class="kv"><b>Coda:</b> ${pt.coda.max === 0 ? 'none — fully open syllables' : esc((pt.coda.allowed || []).join(' ') || 'any')}</div>
    ${pt.nucleus?.diphthongs?.length ? `<div class="kv"><b>Diphthongs:</b> ${esc(pt.nucleus.diphthongs.join(' '))}</div>` : ''}
    <div class="kv"><b>Stress:</b> ${esc(pt.stress.label || pt.stress.rule)}</div>
    ${tone ? '<div class="kv"><b>Tone:</b> contrastive <span class="hint">(arisen from lost codas or lost onset voicing)</span></div>' : ''}
    ${state.delta ? deltaHtml(state.delta) : ''}`;
}

/**
 * What the inventory gained and lost relative to the parent. Losses are
 * mergers; gains are splits, and both are consequences rather than decisions.
 */
function deltaHtml(delta) {
    const bits = [];
    if (delta.lost.length) bits.push(`<b>Lost:</b> ${delta.lost.map((x) => `<span class="ph gone">${esc(x)}</span>`).join(' ')} <span class="hint">(merged away)</span>`);
    if (delta.gained.length) bits.push(`<b>New:</b> ${delta.gained.map((x) => `<span class="ph new">${esc(x)}</span>`).join(' ')}`);
    return bits.length ? `<div class="kv lang-delta">${bits.join('<br>')}</div>` : '';
}

// ---------------------------------------------------------------------------
// Change log
// ---------------------------------------------------------------------------

function changesHtml(state) {
    const cs = state.changeSet;
    const counts = state.stats?.byRule;
    const rows = cs.rules.map((r) => {
        const n = counts?.get(r.id);
        return `<div class="chg">
      <div class="chg-head"><span class="chg-year">c. ${r.year}</span>
        <span class="chg-label">${esc(r.label)}</span>
        ${n != null ? `<span class="hint">${n} word${n === 1 ? '' : 's'}</span>` : ''}</div>
      ${r.analogue ? `<div class="chg-cf">cf. ${esc(r.analogue)}</div>` : ''}
      ${r.note ? `<div class="chg-note">${esc(r.note)}</div>` : ''}
    </div>`;
    }).join('');

    return `<div class="hint">From ${cs.from} to ${cs.to} — about one change per ${cs.interval} years.</div>
    ${state.warning ? `<div class="kv lang-warn">${esc(state.warning)}</div>` : ''}
    <div class="chg-list">${rows}</div>`;
}

// ---------------------------------------------------------------------------
// Lexicon
// ---------------------------------------------------------------------------

function formOf(state, entry) {
    return view.script === 'ipa'
        ? (state.isProto ? '*' : '') + entry.ipa
        : state.romanisation.spell(entry.form);
}

function lexiconHtml(state, model) {
    const all = view.lexFilter === 'core' ? state.entries.filter((e) => e.core) : state.entries;
    const pages = Math.max(1, Math.ceil(all.length / LEX_PAGE));
    const page = Math.min(view.lexPage, pages - 1);
    const slice = all.slice(page * LEX_PAGE, page * LEX_PAGE + LEX_PAGE);

    const rows = slice.map((e) => {
        const isOpen = view.word === e.id;
        const etym = isOpen ? etymologyHtml(state, e) : '';
        return `<tr class="${isOpen ? 'open' : ''}">
      <td class="lex-form"><button class="linklike" data-action="lang-word" data-word="${esc(e.id)}"
          title="Show the derivation">${esc(formOf(state, e))}</button>${e.overridden ? ' <span class="hint" title="Hand-set form">✎</span>' : ''}</td>
      <td class="lex-gloss">${esc(e.gloss)}<span class="hint"> ${esc(e.pos)}</span></td>
    </tr>${etym ? `<tr class="etym-row"><td colspan="2">${etym}</td></tr>` : ''}`;
    }).join('');

    return `<div class="lex-controls">
      <button class="linklike" data-action="lang-core">${view.lexFilter === 'core' ? 'showing core' : 'core only'}</button>
      <span class="hint">${all.length} words</span>
      <span class="lex-pager">
        <button class="linklike" data-action="lang-page" data-delta="-1" ${page === 0 ? 'disabled' : ''}>‹</button>
        ${page + 1}/${pages}
        <button class="linklike" data-action="lang-page" data-delta="1" ${page >= pages - 1 ? 'disabled' : ''}>›</button>
      </span>
    </div>
    <table class="lex-table"><tbody>${rows}</tbody></table>`;
}

/**
 * The etymology of one word: every rule that touched it, in order, with the
 * form before and after. This is the display the whole derivation-history
 * machinery exists to produce.
 */
function etymologyHtml(state, entry) {
    const history = state.histories.get(entry.id);
    if (!history || !history.steps.length) {
        return `<div class="etym"><span class="hint">Unchanged since the proto-language: *${esc(history?.protoForm ?? entry.ipa)}</span></div>`;
    }
    const applied = history.steps.filter((s) => s.applied);
    const chain = [`*${history.protoForm}`, ...applied.map((s) => s.to)];
    const steps = applied.map((s) => `<li><span class="etym-form">${esc(s.from)} › ${esc(s.to)}</span>
     <span class="etym-rule">${esc(s.label)}</span>${s.year != null ? `<span class="hint"> c. ${s.year}</span>` : ''}</li>`).join('');
    const escaped = history.steps.filter((s) => !s.applied);

    return `<div class="etym">
    <div class="etym-chain">${chain.map(esc).join(' → ')}</div>
    <ol class="etym-steps">${steps}</ol>
    ${escaped.length ? `<div class="hint">Escaped ${escaped.length} change${escaped.length === 1 ? '' : 's'} that reached other words (lexical diffusion) — which is why it looks irregular.</div>` : ''}
    ${entry.derivedFrom ? `<div class="hint">Derived: ${esc(entry.derivedFrom.base)} + ${esc(entry.derivedFrom.affix)}</div>` : ''}
  </div>`;
}

// ---------------------------------------------------------------------------
// Comparative table
// ---------------------------------------------------------------------------

/**
 * One proto-root across several daughters. This is the comparative method's own
 * output format, and it is the view that makes a family look like a family:
 * regular correspondences visible down each column.
 */
function compareHtml(project, model, langId) {
    const ids = comparisonSet(model, langId, 4);
    if (ids.length < 2) return '<div class="hint">No sister languages to compare with.</div>';

    const states = ids.map((id) => ({ id, name: model.byId.get(id)?.name ?? id, state: safeState(project, id) }))
        .filter((x) => x.state);
    if (states.length < 2) return '<div class="hint">No sister languages to compare with.</div>';

    const CORE = ['I', 'two', 'water', 'fire', 'eye', 'hand', 'sun', 'name', 'eat', 'dog'];
    const rootState = project.stateOf(model.familyRootOf?.get(langId) || langId);

    const rows = CORE.map((gloss) => {
        const proto = rootState?.entries.find((e) => e.gloss === gloss);
        const cells = states.map((s) => {
            const e = s.state.entries.find((x) => x.gloss === gloss);
            return `<td>${e ? esc(view.script === 'ipa' ? e.ipa : s.state.romanisation.spell(e.form)) : '—'}</td>`;
        }).join('');
        return `<tr><th>${esc(gloss)}</th><td class="proto">${proto ? `*${esc(proto.ipa)}` : '—'}</td>${cells}</tr>`;
    }).join('');

    return `<div class="lang-scroll"><table class="cmp-table">
    <thead><tr><th></th><th class="proto">proto</th>${states.map((s) => `<th>${esc(s.name)}</th>`).join('')}</tr></thead>
    <tbody>${rows}</tbody></table></div>
    <div class="hint">Regular correspondences run down the columns; a gap means the root was lost.</div>`;
}

function safeState(project, id) {
    try { return project.stateOf(id); } catch { return null; }
}
