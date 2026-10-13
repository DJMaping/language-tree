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
import { CASE_NOTES, conflatedClasses } from './engine/morphology/paradigm.js';
import { SENTENCES, renderSentence, describeLanguage } from './engine/text/sentence.js';
import { spellEntry, orthographicDepth } from './engine/phonology/romanise.js';
import { falseFriends } from './engine/lexicon/semantics.js';
import { CORRELATES, FREEDOM, BASIC_ORDERS, coherence } from './engine/syntax/parameters.js';

import { findDoublets, describeDoublet } from './engine/lexicon/doublets.js';
import { colloquialForms, formalRegister, dialectVariants } from './engine/lexicon/register.js';
import { coinArchaicLayer } from './engine/lexicon/toponyms.js';
import { derive } from './engine/rng.js';

/**
 * Distinct vowel QUALITIES — the count a grammar sketch means by "a five-vowel
 * language", as opposed to the phoneme count that treats /a aː ã ã˩/ as four.
 *
 * Both numbers are legitimate and the panel used to show one labelled as the
 * other: a header reading "33 vowels" sat above a body reading "9 qualities".
 */
const TONE_AND_LENGTH_MARKS = /[ːʰ˩˨˧˦˥̃]/gu;
function vowelQualityCount(state) {
    return new Set(state.inventory.vowels.map((v) => v.ipa.replace(TONE_AND_LENGTH_MARKS, ''))).size;
}

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
    paradigmClass: null,   // which declension the Grammar section is showing
    sentence: 0,           // which sample sentence the snapshot shows
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
        case 'lang-sentence': view.sentence += 1; return true;
        case 'lang-class': view.paradigmClass = btn.getAttribute('data-class'); return true;
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
    const config = configFor(rootId, model);
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
      <div class="kv"><b>Phonemes:</b> ${state.inventory.consonants.length} consonants, ${vowelQualityCount(state)} vowel qualities${
        state.inventory.vowels.length > vowelQualityCount(state)
            ? ` <span class="hint">(${state.inventory.vowels.length} with length, nasality and tone)</span>`
            : ''}</div>
      <div class="kv"><b>Lexicon:</b> ${state.entries.length} words</div>
      ${state.isProto ? '<div class="hint">Reconstructed root of the family — every form below is starred.</div>' : ''}
      ${lang.secondaryParentId ? `<div class="kv warn"><b>Creole — second parent not modelled.</b>
        <span class="hint">The chart draws a second parent (${esc(model.byId.get(lang.secondaryParentId)?.name || lang.secondaryParentId)})
        and the engine does not read it: everything below is derived as an ordinary daughter of
        ${esc(model.byId.get(lang.parentId)?.name || lang.parentId)} alone. Creole genesis — a lexicon drawn from one
        parent over the grammar of the other, with the morphology stripped — is not implemented, so treat this
        stage as a placeholder rather than a description.</span></div>` : ''}
    </div>
    ${snapshotHtml(state)}
    ${characterHtml(project, rootId)}
    ${section('phonology', 'Phonology', phonologyHtml(state), scriptToggle)}
    ${section('vowelspace', 'Vowel space', vowelSpaceHtml(project, model, lang.id))}
    ${state.changeSet ? section('changes', `Sound changes (${state.changeSet.rules.length})`, changesHtml(state)) : ''}
    ${grammarHtml(state)}
    ${syntaxHtml(state)}
    ${contactHtml(state, model)}
    ${doubletsHtml(project, state)}
    ${registerHtml(project, state, config)}
    ${section('lexicon', 'Lexicon', lexiconHtml(state, model), scriptToggle)}
    ${namesHtml(project, state, config)}
    ${section('compare', 'Compare with sisters', compareHtml(project, model, lang.id))}
  </div>`;
}

/**
 * Sections below here are LAZY.
 *
 * Coining a stratified name layer re-evolves a dozen words through every ruleset
 * in the lineage, and a dialect re-derives a whole lexicon minus two rules.
 * Neither is expensive enough to matter once, and both are far too expensive to
 * run on every panel render for a section nobody has opened. `section()` takes
 * its body as an argument, so the guard has to be at the call site.
 */
const lazy = (id, fn) => (view.open.has(id) ? fn() : '');

// ---------------------------------------------------------------------------
// Syntax
// ---------------------------------------------------------------------------

/**
 * Word order, what travels with it, and how it got that way.
 *
 * The change log is the part worth having. A language that is SVO tells you
 * very little; a language that was SOV until its accusative fell together with
 * its nominative, and rigidified into the order it had been using pragmatically
 * all along, tells you what happened to it.
 */
function syntaxHtml(state) {
    const s = state.syntax;
    if (!s) return '';
    const c = coherence(s);
    const changes = s.changes || [];

    const rows = Object.entries(CORRELATES).map(([key, spec]) => {
        const expected = s.headFinal ? spec.ov : spec.vo;
        const off = s[key] !== expected;
        return `<tr${off ? ' class="lang-off"' : ''}>
      <td>${esc(spec.label)}</td><td><b>${esc(s[key])}</b></td>
      <td class="hint">${off ? 'against the head-direction expectation' : ''}</td></tr>`;
    }).join('');

    const history = changes.length ? `
    <h4>How it got here</h4>
    <ul class="lang-list">${changes.map((ch) => {
        const what = ch.parameter === 'order' ? 'basic order'
            : ch.parameter === 'freedom' ? 'order freedom'
                : (CORRELATES[ch.parameter]?.label || ch.parameter);
        return `<li><b>c.${ch.year}</b> — ${esc(what)}: ${esc(ch.from)} → ${esc(ch.to)}
        <span class="hint">(${esc(ch.cause)})</span><div class="hint">${esc(ch.note)}</div></li>`;
    }).join('')}</ul>`
        : `<div class="hint">No syntactic change in this lineage, which is the common outcome —
       Proto-Indo-European to English is one order change in five and a half thousand years.</div>`;

    const title = `Syntax — ${s.order}, ${FREEDOM[s.freedom]?.label || s.freedom}`;
    return section('syntax', title, `
    <div class="kv"><b>${esc(s.order)}</b> — ${esc(BASIC_ORDERS[s.order]?.note || '')}</div>
    <div class="kv"><b>${esc(FREEDOM[s.freedom]?.label || s.freedom)} order</b> —
      ${esc(FREEDOM[s.freedom]?.note || '')}</div>
    <table class="lang-table">${rows}</table>
    <div class="hint">${c.score != null ? `${Math.round(c.score * 100)}% consistent with a head-${s.headFinal ? 'final' : 'initial'} grammar.` : ''}
      No real language is perfectly consistent — German is verb-final in subordinate
      clauses and verb-second in main ones, and Mandarin is SVO with postpositions.</div>
    ${history}`);
}

// ---------------------------------------------------------------------------
// Doublets
// ---------------------------------------------------------------------------

/**
 * The same word, arriving twice.
 *
 * The display exists for one sentence: *these two words are the same word, and
 * here is the change that tells you when the second one arrived*. That is the
 * comparative method working inside a single language, on the surface, where a
 * reader can see it.
 */
function doubletsHtml(project, state) {
    if (!view.open.has('doublets')) {
        // The count is cheap enough to want in the header even when closed, but
        // finding the sets is not — so the closed title stays generic.
        return section('doublets', 'Doublets', '');
    }
    const sets = findDoublets(state, { bornOf: (id) => project.nodeOf(id)?.born ?? null });
    if (!sets.length) {
        return section('doublets', 'Doublets', `<div class="hint">Nothing has entered this
      language twice. Doublets need a second route in — a prestige ancestor to borrow back
      from, or two contact events with the same neighbour at different dates.</div>`);
    }
    const items = sets.slice(0, 20).map((d) => `
    <li><b>${esc(d.members[0].gloss)}</b>
      <div class="lang-doublet">${d.members.map((m) => `<span class="${m.register === 'formal' ? 'lang-formal' : ''}">${esc(m.ipa)}
        <span class="hint">${esc(m.route.label)}${m.route.year != null ? ` c.${m.route.year}` : ''}</span></span>`).join('<span class="hint"> / </span>')}</div>
      ${d.escaped.length ? `<div class="hint">the later arrival escaped
        ${d.escaped.slice(0, 3).map((s) => `${esc(s.label)} (c.${s.year})`).join(', ')}${d.escaped.length > 3 ? `, and ${d.escaped.length - 3} more` : ''}</div>` : ''}
    </li>`).join('');
    return section('doublets', `Doublets (${sets.length})`, `
    <div class="hint">English borrowed <i>chief</i> before French turned /tʃ/ into /ʃ/ and
      <i>chef</i> after it. One Latin word, two English words, and the date of each
      borrowing readable off its consonant.</div>
    <ul class="lang-list">${items}</ul>
    ${sets.length > 20 ? `<div class="hint">…and ${sets.length - 20} more</div>` : ''}`);
}

// ---------------------------------------------------------------------------
// Register and dialect
// ---------------------------------------------------------------------------

/** Formal against everyday, careful against casual, standard against dialect. */
function registerHtml(project, state, config) {
    const body = lazy('register', () => {
        const formal = formalRegister(state);
        const casual = colloquialForms(state, derive(config.seed || 'x', state.langId, 'colloquial'));
        const dial = dialectVariants(project, state.langId);

        const formalBlock = formal.length ? `
      <h4>Formal against everyday</h4>
      <div class="hint">The learned stratum IS the formal register — which is why formal
        English is Latinate, formal Japanese is Sino-Japanese and formal Hindi is Sanskritic.</div>
      <ul class="lang-list">${formal.slice(0, 12).map((p) => `<li><b>${esc(p.gloss)}</b> —
        <span class="lang-formal">${esc(p.formal)}</span> <span class="hint">formal, taken
        from ${esc(p.source)} c.${p.borrowedAt}</span> / ${esc(p.everyday)} <span class="hint">everyday</span></li>`).join('')}</ul>` : '';

        const casualBlock = casual.length ? `
      <h4>Careful against casual</h4>
      <div class="hint">Reduction is licensed by predictability: a listener can recover a
        frequent word from less signal, which is why English has <i>gonna</i> and
        <i>wanna</i> and no casual form of <i>perambulate</i>.</div>
      <ul class="lang-list">${casual.slice(0, 12).map((c) => `<li><b>${esc(c.gloss)}</b> —
        ${esc(c.careful)} → ${esc(c.casual)} <span class="hint">${esc(c.processes.map((p) => p.process).join(', '))}</span></li>`).join('')}</ul>` : '';

        const dialBlock = dial?.variants.length ? `
      <h4>A conservative area</h4>
      <div class="hint">A change spreads from somewhere and stops, and where it stops is a
        dialect boundary. This area never took ${esc(dial.withheld.map((r) => r.label).join(', '))} —
        the same relationship northern English has to the FOOT–STRUT split, which is why
        <i>put</i> and <i>putt</i> still rhyme in Manchester.</div>
      <ul class="lang-list">${dial.variants.slice(0, 12).map((v) => `<li><b>${esc(v.gloss)}</b> —
        ${esc(v.standard)} <span class="hint">standard</span> / ${esc(v.conservative)} <span class="hint">conservative</span></li>`).join('')}</ul>` : '';

        if (!formalBlock && !casualBlock && !dialBlock) {
            return '<div class="hint">No variation recorded for this stage.</div>';
        }
        return formalBlock + casualBlock + dialBlock;
    });
    return section('register', 'Register and dialect', body);
}

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

/**
 * The map, which is older than the language on it.
 *
 * Each name is labelled with the stage it was coined in and whether its own
 * speakers can read it — and if not, which of the two reasons applies: the
 * sounds wore it past recognition, or the word it was made of died.
 */
function namesHtml(project, state, config) {
    const body = lazy('names', () => {
        const names = coinArchaicLayer(project, state.langId, derive(config.seed || 'x', state.langId, 'toponyms'), { count: 12 });
        if (!names.length) return '<div class="hint">Not enough lineage above this stage to coin an archaic layer.</div>';
        return `
      <div class="hint">Coined across the whole lineage, oldest first. Rivers and mountains
        near the root, settlements in between, personal names in the current language — the
        stratification English place names have, where the rivers are pre-Celtic and the
        towns are Old English and Norse.</div>
      <ul class="lang-list">${names.map((n) => `
      <li><b>${esc(n.spelling)}</b> <span class="hint">/${esc(n.ipa)}/ — ${esc(n.kind)}</span>
        <div class="hint">coined in ${esc(n.stratum.ancestorName)} as *${esc(n.coinedForm)}
          "${esc(n.coinedGloss)}"</div>
        <div class="lang-opacity ${n.opacity?.opaque ? 'lang-off' : ''}">${esc(n.opacity?.reading || '')}</div>
        ${n.opacity && n.opacity.reading !== 'transparent' ? `<div class="hint">${esc(n.opacity.note)}</div>` : ''}
      </li>`).join('')}</ul>`;
    });
    return section('names', 'Names', body);
}

// ---------------------------------------------------------------------------
// Snapshot — what this language looks and sounds like, at a glance
// ---------------------------------------------------------------------------

/**
 * The section that answers the question a reader actually has.
 *
 * Everything else in this panel answers "what are the phonemes" and "which
 * rules fired". None of it answers "what does this language look like", which
 * is the first thing anyone wants to know. This does: a sentence you can read,
 * a handful of characteristic words, and one line of prose describing the sound
 * of it in the terms people actually think in.
 *
 * Deliberately open by default and placed above the technical sections.
 */
function snapshotHtml(state) {
    const sentence = SENTENCES[view.sentence % SENTENCES.length];
    let rendered = null;
    try { rendered = renderSentence(state, sentence); } catch { rendered = null; }

    // A handful of concrete, high-frequency words — the ones that give a feel.
    const SHOWCASE = ['water', 'fire', 'sun', 'moon', 'eye', 'hand', 'mother', 'name', 'one', 'two'];
    const words = SHOWCASE
        .map((g) => state.entries.find((e) => e.gloss === g && !e.retired && !e.paradigm))
        .filter(Boolean)
        .map((e) => `<span class="snap-word"><b>${esc(spellEntry(state, e))}</b>
      <span class="snap-ipa">/${esc(e.ipa)}/</span> <span class="hint">${esc(e.gloss)}</span></span>`)
        .join('');

    let description = '';
    try { description = describeLanguage(state); } catch { description = ''; }

    const cycler = SENTENCES.length > 1
        ? `<button class="linklike" data-action="lang-sentence" title="Another sentence">↻</button>` : '';

    return `<div class="panel-section lang-section snapshot">
    <h3>At a glance ${cycler}</h3>
    ${rendered ? `<div class="snap-sentence${rendered.long ? ' snap-long' : ''}">
      <div class="snap-target">${esc(rendered.spelling)}</div>
      <div class="snap-ipa-line">/${esc(rendered.ipa)}/</div>
      <div class="hint">${esc(rendered.english)}</div>
      <div class="snap-reader">
        <div class="hint">Hear it — paste into <a href="https://ipa-reader.com/" target="_blank" rel="noopener">ipa-reader.com</a>.
          Every sound the reader cannot say is swapped for its nearest English one rather than
          dropped, so nothing goes silent; tone, aspiration and vowel rounding are lost, because
          no such reader can voice them. This is a listening aid, not the language.</div>
        <textarea class="snap-reader-text" readonly rows="${rendered.long ? 3 : 2}"
          onclick="this.select()">${esc(rendered.readerIpa)}</textarea>
      </div>
    </div>` : ''}
    ${description ? `<div class="kv snap-desc">${esc(description)}.</div>` : ''}
    <div class="snap-words">${words}</div>
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
    /**
     * The group label is a QUALITY, and a quality is not necessarily a phoneme.
     *
     * If /i/ has been lost and only /i˩ ĩ iː/ survive, the group still has to be
     * headed "i" — that is the quality they are all versions of. But bolding it
     * like a phoneme put a bare "i" on screen directly above a line reading
     * "Lost: i (merged away)", which reads as the panel contradicting itself.
     * A quality with no plain member is parenthesised so the two lines agree.
     */
    const vowelRows = [...byBase.entries()]
        .map(([base, all]) => {
            const plain = all.includes(base);
            const head = plain
                ? `<b>${esc(base)}</b>`
                : `<b class="quality-only" title="quality only — the plain vowel is not itself a phoneme here">(${esc(base)})</b>`;
            const rest = all.filter((x) => x !== base);
            return `<span class="vow">${head}${rest.length ? ` <span class="hint">${esc(rest.join(' '))}</span>` : ''}</span>`;
        })
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
    ${orthographyHtml(state)}
    ${state.delta ? deltaHtml(state.delta) : ''}`;
}

/**
 * How far the spelling has drifted from the speech.
 *
 * Only shown once a language is WRITTEN — before standardisation the
 * orthography is rebuilt from the inventory at every stage and the answer is
 * trivially zero. After it, the spelling is inherited and the pronunciation
 * carries on underneath, which is why English writes ⟨knight⟩ for /naɪt/.
 *
 * The examples are the payoff: silent letters nobody authored, standing where a
 * sound used to be.
 */
function orthographyHtml(state) {
    if (!state.orthographyFrozen) return '';
    const d = orthographicDepth(state, { examples: 5 });
    if (!d) return '';
    const pct = Math.round(d.depth * 100);
    const label = pct < 5 ? 'near-transparent, like Finnish or Turkish'
        : pct < 20 ? 'shallow, like Italian'
            : pct < 40 ? 'deep, like French'
                : 'very deep, like English or Irish';
    return `<div class="kv"><b>Spelling:</b> fixed${d.frozenAt != null ? ` c. ${d.frozenAt}` : ''};
      ${pct}% of words are now written differently from how they sound
      <span class="hint">— ${label}</span></div>
    ${d.examples.length ? `<div class="kv ortho-examples">${d.examples.map((e) => (
        `<span class="ortho-pair">⟨${esc(e.written)}⟩ <span class="hint">said</span> /${esc(e.ipa)}/</span>`
    )).join(' ')}</div>` : ''}`;
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

    /**
     * The changes that were NOT sound changes.
     *
     * They belong in this log beside the phonology and not in a section of
     * their own, because the causal story only reads if they sit together: a
     * rule ate an ending, speakers levelled what was left, a postposition
     * bonded to fill the gap. Split across three panels that is three lists;
     * in one list it is a history.
     */
    const speakerRows = [
        ...(state.levellings || []).map((ev) => ({
            year: ev.year, kind: 'analogy',
            label: `analogy — ${ev.kind === 'stem' ? 'stem levelled' : ev.kind === 'class' ? `class ${ev.cls} absorbed into ${ev.donorCls}` : `${ev.cells.join(', ')} levelled to ${ev.model}`} (${ev.cls})`,
            note: ev.note, cf: ev.attested,
        })),
        ...(state.grammaticalisations || []).map((ev) => ({
            year: ev.year, kind: ev.kind === 'category-loss' ? 'loss' : 'renewal',
            label: ev.kind === 'category-loss'
                ? `− ${ev.cell} abandoned`
                : `+ ${ev.cell} (${ev.label}) from "${ev.sourceGloss}"${ev.morph ? ` → -${ev.morph}` : ''}`,
            note: ev.note, cf: ev.attested,
        })),
        ...(state.entriesShifted ? [{
            year: cs.to, kind: 'semantic',
            label: `${state.entriesShifted} word${state.entriesShifted === 1 ? '' : 's'} changed meaning`,
            note: 'along attested paths — metaphor, metonymy, broadening, narrowing, pejoration, amelioration, bleaching',
            cf: '',
        }] : []),
    ].sort((a, b) => (a.year ?? 0) - (b.year ?? 0));

    const speakerHtml = speakerRows.map((r) => `<div class="chg chg-${r.kind}">
      <div class="chg-head"><span class="chg-year">c. ${r.year}</span>
        <span class="chg-label">${esc(r.label)}</span></div>
      ${r.note ? `<div class="chg-note">${esc(r.note)}</div>` : ''}
      ${r.cf ? `<div class="chg-cf">cf. ${esc(r.cf)}</div>` : ''}
    </div>`).join('');

    return `<div class="hint">From ${cs.from} to ${cs.to} — about one change per ${cs.interval} years.</div>
    ${state.warning ? `<div class="kv lang-warn">${esc(state.warning)}</div>` : ''}
    <div class="chg-list">${rows}</div>
    ${speakerRows.length ? `<div class="hint chg-divider">Not sound change — things speakers did</div>
      <div class="chg-list">${speakerHtml}</div>` : ''}`;
}

// ---------------------------------------------------------------------------
// Grammar — the paradigm, and what the sound changes have cost it
// ---------------------------------------------------------------------------

/**
 * A declension table with the syncretism made visible.
 *
 * The point of the display is not the table, it is the COLLAPSE. Cells that
 * have fallen together are marked as such and the sound change responsible is
 * named, because that is the causal story: nobody merged the accusative with
 * the dative, a rule ate the final syllable and they stopped differing.
 */
function grammarHtml(state) {
    const p = state.paradigm;
    const er = state.erosion;
    if (!p || !p.classes || !Object.keys(p.classes).length) return '';

    const classNames = Object.keys(p.classes).sort();
    const active = classNames.includes(view.paradigmClass) ? view.paradigmClass : classNames[0];
    const cls = p.classes[active];

    const tabs = classNames.map((c) => `<button class="linklike cls-tab${c === active ? ' on' : ''}"
      data-action="lang-class" data-class="${esc(c)}" title="${p.classes[c].members} members">${esc(c)}</button>`).join(' ');

    // Group cells by form so a merger can be drawn as one row spanning its labels.
    const byForm = new Map();
    for (const [cell, v] of Object.entries(cls.cells || {})) {
        if (!byForm.has(v.ipa)) byForm.set(v.ipa, []);
        byForm.get(v.ipa).push(cell);
    }
    const causeOf = (cells) => (er?.mergers || []).find((m) => m.cls === active
        && m.cells.length === cells.length && m.cells.every((x) => cells.includes(x)));

    const rows = [...byForm.entries()].map(([ipa, cells]) => {
        const merged = cells.length > 1;
        const cause = merged ? causeOf(cells) : null;
        return `<tr class="${merged ? 'merged' : ''}">
      <th>${cells.map((c) => esc(c)).join('<br>')}</th>
      <td class="lex-form">${esc(view.script === 'ipa' ? ipa : ipa)}</td>
      <td class="hint">${merged
            ? (cause?.cause === 'sound-change'
                ? `merged by ${esc(cause.label)}${cause.year != null ? ` <span class="hint">c. ${cause.year}</span>` : ''}`
                : cause?.cause === 'analogy'
                    ? `<b>levelled by speakers</b> — ${esc(cause.label)}${cause.year != null ? ` <span class="hint">c. ${cause.year}</span>` : ''}`
                    : esc(cause?.note || 'merged'))
            : ''}</td>
    </tr>`;
    }).join('');

    const survival = er?.survival != null ? Math.round(er.survival * 100) : null;
    const cats = p.categories || {};

    /**
     * Which cells this language BUILT, and where each came from.
     *
     * The single most informative line the grammar section can carry, because
     * it is the one thing the engine could not say at all until
     * grammaticalisation landed: that a category here is younger than the
     * language, and that it used to be a word.
     */
    const built = new Map();
    for (const e of state.entries || []) {
        const g = e.grammaticalisedFrom;
        if (!g || !e.paradigm) continue;
        const slot = e.paradigm.cell.split('.')[0];
        if (!built.has(slot)) built.set(slot, g);
    }
    const builtHtml = [...built.entries()].map(([slot, g]) => `<div class="kv gram-cline">
      <b>${esc(slot)}</b> ← <i>${esc(g.gloss)}</i> <span class="hint">bleached and bonded c. ${g.year}</span>
      <div class="chg-cf">cf. ${esc(g.attested)}</div></div>`).join('');

    const analogical = (er?.mergers || []).filter((m) => m.cause === 'analogy').length;
    // Classes whose endings have become identical — see conflatedClasses().
    const conflated = conflatedClasses(p);

    return section('grammar', `Grammar${survival != null ? ` — ${survival}% inflection` : ''}`, `
    <div class="kv"><b>Type:</b> ${esc(cats.type || '—')} <span class="hint">${esc(cats.typeNote || '')}</span></div>
    ${cats.cases?.length ? `<div class="kv"><b>Cases:</b> ${cats.cases.map((c) => `<span title="${esc(CASE_NOTES[c] || '')}">${esc(c)}</span>`).join(' · ')}</div>` : ''}
    ${cats.tenses?.length ? `<div class="kv"><b>Tense / aspect:</b> ${cats.tenses.map((c) => esc(c)).join(' · ')}</div>` : ''}
    ${survival != null ? `<div class="kv"><b>Inflection retained:</b> ${survival}%
      <span class="hint">${er.distinct}/${er.cells} cells distinct across ${er.classes} classes${er.dropped ? `, ${er.dropped} slot${er.dropped === 1 ? '' : 's'} abandoned outright` : ''}${er.lostSinceParent ? `, down ${Math.round(er.lostSinceParent * 100)} points on this edge` : ''}</span></div>` : ''}
    ${analogical ? `<div class="kv"><b>Of the mergers:</b> ${analogical} ${analogical === 1 ? 'was' : 'were'} levelled by speakers rather than caused by sound change</div>` : ''}
    ${conflated.length ? `<div class="kv"><b>Fallen together:</b> ${conflated.map((g) => esc(g.join(' = '))).join('; ')}
      <span class="hint">identical endings in every cell — these differ only in the shape of their stems, and are one class now</span></div>` : ''}
    ${builtHtml ? `<div class="kv"><b>Grown, not inherited:</b></div>${builtHtml}` : ''}
    <div class="cls-tabs">${tabs}</div>
    <div class="hint">Exemplar: <b>${esc(cls.exemplarGloss || '')}</b> ${cls.exemplarForm ? `/${esc(cls.exemplarForm)}/` : ''} · ${cls.members} members</div>
    <div class="lang-scroll"><table class="para-table"><tbody>${rows}</tbody></table></div>
    ${er?.newMergers?.length ? `<div class="hint">${er.newMergers.length} distinction${er.newMergers.length === 1 ? '' : 's'} lost at this stage.</div>` : ''}
  `);
}

// ---------------------------------------------------------------------------
// Vowel space
// ---------------------------------------------------------------------------

/**
 * The vowel system plotted as the trapezoid every phonetics textbook draws,
 * with the ancestors trailing behind it.
 *
 * This is nearly free, and it is free for a reason that was a deliberate
 * decision made early: vowel height and backness are stored as NUMBERS, not as
 * categories, so that raising and fronting could be arithmetic and chain shifts
 * could be modelled properly. A consequence nobody planned is that a vowel
 * system is therefore already a scatter plot.
 *
 * What it shows that no table can: a CHAIN SHIFT is visible as motion. When one
 * vowel raises it vacates a slot, and the vowel below it moves up into the
 * space — the Great Vowel Shift, the Northern Cities Shift, Grimm's vowels. On
 * a chart of the modern system alone you see a set of dots. With the ancestors
 * trailing behind, you see the rotation.
 *
 * Drawn in the panel's own SVG, no dependencies, and it exports with the rest.
 */
function vowelSpaceHtml(project, model, langId) {
    // The lineage, oldest first.
    const chain = [];
    for (let s = project.stateOf(langId); s; s = s.parentId ? project.stateOf(s.parentId) : null) chain.unshift(s);
    if (!chain.length) return '';

    const W = 300, H = 210, PAD = 26;
    // The trapezoid: front vowels have more room at the top than the bottom,
    // which is why the IPA chart is a quadrilateral and not a rectangle.
    const xAt = (back, height) => {
        const inset = (height - 1) / 4 * 0.30;       // narrows towards open
        const t = (back - 1) / 2;                     // 0 front … 1 back
        return PAD + (inset + t * (1 - inset)) * (W - 2 * PAD);
    };
    const yAt = (height) => PAD + ((height - 1) / 4) * (H - 2 * PAD);

    const outline = [[1, 1], [3, 1], [3, 5], [1, 5]]
        .map(([b, h]) => `${xAt(b, h).toFixed(1)},${yAt(h).toFixed(1)}`).join(' ');

    // Only plain vowels are plotted: length, nasality and tone are separate
    // dimensions and would stack dots on top of each other.
    const plain = (st) => st.inventory.vowels.filter((v) => !v.f.long && !v.f.nasal && !v.f.tone);

    // Ancestor trails, oldest faintest.
    const trails = chain.slice(0, -1).map((st, i) => {
        const opacity = 0.12 + 0.28 * (i / Math.max(1, chain.length - 1));
        return plain(st).map((v) => `<circle cx="${xAt(v.f.back, v.f.height).toFixed(1)}" cy="${yAt(v.f.height).toFixed(1)}"
        r="3" class="vs-ghost" opacity="${opacity.toFixed(2)}"/>`).join('');
    }).join('');

    // Movement arrows from the immediate parent, drawn only where a vowel of
    // the same rounding actually moved — that is the shift made visible.
    const parent = chain.length > 1 ? chain[chain.length - 2] : null;
    let arrows = '';
    if (parent) {
        const now = plain(chain[chain.length - 1]);
        const before = plain(parent);
        arrows = before.map((p) => {
            // Nearest current vowel of the same rounding, if it moved at all.
            const near = now.filter((n) => n.f.round === p.f.round)
                .map((n) => ({ n, d: Math.abs(n.f.height - p.f.height) + Math.abs(n.f.back - p.f.back) }))
                .sort((a, b) => a.d - b.d)[0];
            if (!near || near.d === 0 || near.d > 2) return '';
            const x1 = xAt(p.f.back, p.f.height), y1 = yAt(p.f.height);
            const x2 = xAt(near.n.f.back, near.n.f.height), y2 = yAt(near.n.f.height);
            return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"
          class="vs-arrow" marker-end="url(#vs-tip)"/>`;
        }).join('');
    }

    const dots = plain(chain[chain.length - 1]).map((v) => {
        const x = xAt(v.f.back, v.f.height), y = yAt(v.f.height);
        return `<g class="vs-v"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5"/>
      <text x="${(x + 7).toFixed(1)}" y="${(y + 4).toFixed(1)}">${esc(v.ipa)}</text></g>`;
    }).join('');

    const moved = parent
        ? plain(parent).length !== plain(chain[chain.length - 1]).length
            || plain(parent).some((p) => !plain(chain[chain.length - 1]).some((n) => n.ipa === p.ipa))
        : false;

    return `<svg class="vowel-space" viewBox="0 0 ${W} ${H}" width="100%" role="img"
      aria-label="Vowel space with ancestor positions">
    <defs><marker id="vs-tip" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto">
      <path d="M0,0 L8,4 L0,8 z"/></marker></defs>
    <polygon points="${outline}" class="vs-frame"/>
    <text x="${PAD}" y="12" class="vs-axis">front</text>
    <text x="${W - PAD}" y="12" class="vs-axis" text-anchor="end">back</text>
    <text x="4" y="${PAD + 4}" class="vs-axis">close</text>
    <text x="4" y="${H - PAD + 4}" class="vs-axis">open</text>
    ${trails}${arrows}${dots}
  </svg>
  <div class="hint">${chain.length > 1
        ? `Faint dots are the ${chain.length - 1} ancestor stage${chain.length === 2 ? '' : 's'}; arrows show movement since ${esc(parent.node?.name ?? 'the parent')}.
       ${moved ? 'A vowel moving into the space another has just left is a chain shift.' : 'No vowel moved on this edge.'}`
        : 'The reconstructed root — nothing behind it yet.'}</div>`;
}

// ---------------------------------------------------------------------------
// Contact — loanwords and their strata
// ---------------------------------------------------------------------------

/**
 * The loanwords this stage received, grouped into datable strata.
 *
 * The diagnostic on show: a loan escapes every sound change dated before it
 * arrived. So the panel can name the changes a stratum did NOT undergo, which
 * is precisely how a real loan is dated — English "chief" and "chef" are the
 * same French word, and the consonant tells you which arrived first.
 */
function contactHtml(state, model) {
    const loans = state.entries.filter((e) => e.loan);
    const areal = state.arealFeatures || [];
    if (!loans.length && !areal.length) return '';

    // Group by contact event.
    const byEvent = new Map();
    for (const e of loans) {
        if (!byEvent.has(e.loan.borrowingId)) byEvent.set(e.loan.borrowingId, { ...e.loan, words: [] });
        byEvent.get(e.loan.borrowingId).words.push(e);
    }

    const rules = state.changeSet?.rules || [];
    const blocks = [...byEvent.values()]
        .sort((a, b) => (a.year ?? 0) - (b.year ?? 0))
        .map((s) => {
            const donor = model.byId.get(s.from);
            // The changes this stratum arrived too late for.
            const escaped = rules.filter((r) => r.year != null && s.year != null && r.year < s.year);
            const sample = s.words.slice(0, 6).map((w) => `<tr>
          <td class="lex-form">${esc(view.script === 'ipa' ? w.ipa : spellEntry(state, w))}</td>
          <td class="lex-gloss">${esc(w.gloss)}</td>
          <td class="hint">&lt; ${esc(w.loan.donorForm)}${w.loan.adapted ? ' <em>adapted</em>' : ''}</td>
        </tr>`).join('');

            return `<div class="stratum">
        <div class="kv"><b>${esc(KIND_LABELS[s.kind] || s.kind)}</b> from
          ${donor ? `<button class="linklike" data-select="${esc(s.from)}">${esc(donor.name)}</button>` : esc(s.from)}
          <span class="hint">${s.year != null ? `c. ${s.year}` : 'undated'} · ${s.words.length} words</span></div>
        ${s.label ? `<div class="hint">${esc(s.label)}</div>` : ''}
        <table class="lex-table"><tbody>${sample}</tbody></table>
        ${escaped.length
            ? `<div class="hint stratum-date">Arrived too late for ${escaped.length} change${escaped.length === 1 ? '' : 's'} on this edge —
             ${escaped.slice(0, 3).map((r) => esc(r.label)).join('; ')}${escaped.length > 3 ? '…' : ''}.
             That is what dates the stratum.</div>`
            : '<div class="hint">Present for every change on this edge.</div>'}
      </div>`;
        }).join('');

    const arealBlock = areal.length ? `<div class="stratum">
      <div class="kv"><b>Areal convergence</b> <span class="hint">structure, not vocabulary</span></div>
      ${areal.map((f) => `<div class="hint">${esc(f.feature)} — ${esc(f.note)}</div>`).join('')}
    </div>` : '';

    return section('contact', `Loanwords (${loans.length})`, blocks + arealBlock);
}

const KIND_LABELS = {
    loan: 'Adstrate loans', substrate: 'Substrate', superstrate: 'Superstrate', areal: 'Areal',
};

// ---------------------------------------------------------------------------
// Family character
// ---------------------------------------------------------------------------

/**
 * What the engine inferred about the whole family from its evidence, and why
 * (js/engine/character.js). The same for every language in the family: it is
 * the starting character of the proto, which its daughters then drift from.
 */
function characterHtml(project, rootId) {
    const ch = project.foundingOf?.(rootId)?.character;
    if (!ch) return '';
    const row = (label, value, why) => `<div class="kv"><b>${label}:</b> ${esc(value)} <span class="hint">${esc(why)}</span></div>`;
    const body = [
        row('Morphology', `${ch.morphology.type}, ${ch.morphology.alignment === 'erg-abs' ? 'ergative' : 'accusative'}`, `${ch.reasons.morphology}; ${ch.reasons.alignment}`),
        row('Word order', ch.syntax.order, ch.reasons.order),
        row('Affixes', `${Math.round(ch.suffixShare * 100)}% suffixes`, ch.reasons.affixes),
        row('Vowels', String(ch.vowelCount), ch.reasons.vowels),
        row('Consonants', ch.laryngeal === 'asIs' ? 'as the evidence shows them' : `reconstructed (${ch.laryngeal})`, ch.reasons.laryngeal),
        '<div class="hint">Inferred from the evidence of the whole family; set any of these in data/lang-config.json to override. npm run character shows the full report.</div>',
    ].join('');
    return section('character', 'Family character', body);
}

// ---------------------------------------------------------------------------
// Lexicon
// ---------------------------------------------------------------------------

function formOf(state, entry) {
    return view.script === 'ipa'
        ? (state.isProto ? '*' : '') + entry.ipa
        : spellEntry(state, entry);
}

/**
 * Lock or unlock a word. A locked word is canon: it never changes when the
 * engine is improved or the chart is edited. Saved on the language in
 * languages.json, so it is undoable like any other edit.
 */
function lockButton(state, e) {
    if (e.paradigm || e.retired || !state.node) return '';
    const locked = !!e.locked;
    return ` <button class="linklike lex-lock${locked ? ' on' : ''}" data-action="lang-lock"
          data-lang="${esc(state.node.id)}" data-gloss="${esc(e.gloss)}" data-ipa="${esc(e.ipa)}"
          title="${locked ? 'Locked: this form is canon and never changes. Click to unlock.' : 'Lock this form as canon'}">${locked ? '🔒' : '🔓'}</button>`;
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
          title="Show the derivation">${esc(formOf(state, e))}</button>${e.overridden ? ' <span class="hint" title="Hand-set form">✎</span>' : ''}${lockButton(state, e)}</td>
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
    /**
     * The MEANING chain, printed above the form chain.
     *
     * A form history says what the word sounded like; this says what it meant,
     * and the two together are what an etymological dictionary entry is. Each
     * link names the relation it travelled and the real example that licenses
     * it, so "'enemy', formerly 'stranger'" also says *why* that is an ordinary
     * thing for a word to do.
     */
    const senses = (entry.glossHistory || []).slice().reverse();
    const senseHtml = senses.length ? `<div class="etym-senses">
      <b>${esc(entry.gloss)}</b>${entry.alsoMeans ? ` <span class="hint">(also “${esc(entry.alsoMeans)}”)</span>` : ''}
      ${senses.map((h) => `<div class="etym-sense">← formerly “${esc(h.gloss)}”
        <span class="hint">${esc(h.type)}${h.until != null ? `, c. ${h.until}` : ''}</span>
        ${h.attested ? `<div class="chg-cf">cf. ${esc(h.attested)}</div>` : ''}</div>`).join('')}
    </div>` : '';

    const provenance = [
        entry.derivedFrom ? `Derived: ${entry.derivedFrom.base} + ${entry.derivedFrom.affix}` : '',
        entry.loan ? `Borrowed from ${entry.loan.from}, c. ${entry.loan.year} (${entry.loan.kind})${entry.loan.adapted ? `, adapted from /${entry.loan.donorForm}/` : ''}` : '',
        entry.grammaticalisedFrom ? `Grammar, not vocabulary: this cell was the word “${entry.grammaticalisedFrom.gloss}” until c. ${entry.grammaticalisedFrom.year}` : '',
        entry.levelled ? `Rebuilt by analogy c. ${entry.levelled.year} — speakers regularised it, no sound change did this` : '',
        entry.retired ? `Displaced from “${entry.retiredGloss}” and kept, the way English “hound” survived “dog”` : '',
    ].filter(Boolean).map((t) => `<div class="hint">${esc(t)}</div>`).join('');

    const history = state.histories.get(entry.id);
    if (!history || !history.steps.length) {
        return `<div class="etym">${senseHtml}
      <span class="hint">Unchanged since the proto-language: *${esc(history?.protoForm ?? entry.ipa)}</span>${provenance}</div>`;
    }
    const applied = history.steps.filter((s) => s.applied);
    const chain = [`*${history.protoForm}`, ...applied.map((s) => s.to)];
    const steps = applied.map((s) => `<li class="${s.category === 'analogy' ? 'etym-analogy' : ''}"><span class="etym-form">${esc(s.from)} › ${esc(s.to)}</span>
     <span class="etym-rule">${esc(s.label)}</span>${s.year != null ? `<span class="hint"> c. ${s.year}</span>` : ''}</li>`).join('');
    const escaped = history.steps.filter((s) => !s.applied);

    return `<div class="etym">
    ${senseHtml}
    <div class="etym-chain">${chain.map(esc).join(' → ')}</div>
    <ol class="etym-steps">${steps}</ol>
    ${escaped.length ? `<div class="hint">Escaped ${escaped.length} change${escaped.length === 1 ? '' : 's'} that reached other words (lexical diffusion) — which is why it looks irregular.</div>` : ''}
    ${provenance}
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
            return `<td>${e ? esc(view.script === 'ipa' ? e.ipa : spellEntry(s.state, e)) : '—'}</td>`;
        }).join('');
        return `<tr><th>${esc(gloss)}</th><td class="proto">${proto ? `*${esc(proto.ipa)}` : '—'}</td>${cells}</tr>`;
    }).join('');

    /**
     * FALSE FRIENDS: the same etymon, meanings that have parted company.
     *
     * German *Gift* is "poison" and English *gift* is a present, and they are
     * the same word. This is the most convincing single artefact a real
     * language family produces, and until the semantic layer landed nothing in
     * this engine could make one, because a meaning only ever moved while
     * displacing another word and it always landed in the domain it started in.
     *
     * The pairs where the FORM still matches go first, because those are the
     * ones that stop you.
     */
    const me = states.find((s) => s.id === langId) || states[0];
    const friends = [];
    for (const other of states) {
        if (other.id === me.id) continue;
        for (const f of falseFriends(me.state, other.state, { limit: 60 })) {
            if (!f.a.shifted && !f.b.shifted) continue;   // derivational glosses are dull
            friends.push({ other: other.name, f });
        }
    }
    friends.sort((x, y) => (y.f.formsMatch ? 1 : 0) - (x.f.formsMatch ? 1 : 0));
    const friendsHtml = friends.slice(0, 8).map(({ other, f }) => `<div class="kv ff-row">
      <span class="lex-form">${esc(f.a.ipa)}</span> “${esc(f.a.gloss)}”
      <span class="hint">vs ${esc(other)}</span>
      <span class="lex-form">${esc(f.b.ipa)}</span> “${esc(f.b.gloss)}”
      ${f.formsMatch ? '<span class="hint">— identical form</span>' : ''}
      ${(f.a.shifted || f.b.shifted) ? `<div class="chg-cf">${esc((f.a.shifted || f.b.shifted).type)}: ${esc((f.a.shifted || f.b.shifted).attested || '')}</div>` : ''}
    </div>`).join('');

    return `<div class="lang-scroll"><table class="cmp-table">
    <thead><tr><th></th><th class="proto">proto</th>${states.map((s) => `<th>${esc(s.name)}</th>`).join('')}</tr></thead>
    <tbody>${rows}</tbody></table></div>
    <div class="hint">Regular correspondences run down the columns; a gap means the root was lost.</div>
    ${friendsHtml ? `<div class="hint chg-divider">False friends — same word, different meaning</div>${friendsHtml}` : ''}`;
}

function safeState(project, id) {
    try { return project.stateOf(id); } catch { return null; }
}
