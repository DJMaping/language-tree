/**
 * Panel rendering tests — the sections actually produce HTML.
 *
 * `js/lang-panel.js` builds several hundred lines of markup from derived state,
 * and every one of the values it interpolates is optional somewhere: a proto has
 * no changeset, a short-lived stage has no dialect, a family with no classical
 * source has no doublets. The panel is also wrapped in a try/catch by design, so
 * an exception surfaces as a one-line "could not derive this stage" and a value
 * that comes out `undefined` surfaces as the word "undefined" sitting in the UI.
 *
 * Both of those are silent in a way a unit test is not, and neither is caught by
 * anything else in the suite. So this renders the real panel for real stages and
 * asserts on the string.
 *
 * The panel is browser code and reaches for `fetch` to load the family configs.
 * Stubbing that is the whole of the setup — everything below it is the same code
 * path the app runs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Serve the config off disk, so the browser module can load unmodified. */
globalThis.fetch = async (url) => {
    const rel = String(url).replace(/^\.?\//, '');
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) return { ok: false, status: 404 };
    const text = fs.readFileSync(file, 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(text), text: async () => text };
};

const { buildModel } = await import('../js/model.js');
const { loadLangConfigs } = await import('../js/lang-project.js');
const { langSectionsHtml, langViewState } = await import('../js/lang-panel.js');
const { projectFor } = await import('../js/lang-project.js');
const { SENTENCES, renderSentence, READER_ALPHABET } = await import('../js/engine/text/sentence.js');

let passed = 0, failed = 0;
const failures = [];
function ok(name, cond, detail = '') {
    if (cond) { passed += 1; return; }
    failed += 1;
    failures.push(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`);
}
function section(title) { console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 58 - title.length))}`); }

const doc = JSON.parse(fs.readFileSync(path.join(root, 'data/languages.json'), 'utf8'));
const model = buildModel(doc);
await loadLangConfigs();

/**
 * Open every section. The panel renders a section's body only when it is open,
 * and the expensive ones (names, dialects) are lazy behind exactly that check —
 * so a test against the default view state would exercise almost none of this.
 */
const view = langViewState();
const SECTIONS = ['phonology', 'vowelspace', 'changes', 'grammar', 'syntax', 'contact',
    'doublets', 'register', 'lexicon', 'names', 'compare'];
for (const s of SECTIONS) view.open.add(s);

const byId = new Map(doc.languages.map((l) => [l.id, l]));
const rootOf = (l) => { let c = l; while (c.parentId) c = byId.get(c.parentId); return c.id; };

/**
 * Three targets, chosen to hit three different shapes of state.
 *
 * The middle one has to descend from the family's CLASSICAL SOURCE, or it has
 * no learned stratum, hence no doublets and no formal register — which is
 * correct behaviour and useless as a test of the sections that display them.
 * Picking the deepest leaf in the family is not enough; most of the family sits
 * on branches that split off before the classical stage existed.
 */
const configs = JSON.parse(fs.readFileSync(path.join(root, 'data/lang-config.json'), 'utf8'));
const classicalId = configs['proto-alzuria-ayuman']?.classical?.sourceId;
const descendsFrom = (l, ancestorId) => {
    for (let c = l; c; c = c.parentId ? byId.get(c.parentId) : null) if (c.id === ancestorId) return true;
    return false;
};

const targets = [];
{
    targets.push(doc.languages.find((l) => l.id === 'proto-alzuria-ayuman'));
    const alz = doc.languages.filter((l) => rootOf(l) === 'proto-alzuria-ayuman');
    const leaves = alz.filter((l) => !alz.some((x) => x.parentId === l.id));
    const eligible = classicalId ? leaves.filter((l) => descendsFrom(l, classicalId)) : leaves;
    let deepest = eligible[0] || leaves[0], best = -1;
    for (const l of eligible) {
        let d = 0, c = l;
        while (c.parentId) { d += 1; c = byId.get(c.parentId); }
        if (d > best) { best = d; deepest = l; }
    }
    targets.push(deepest);
    const dk = doc.languages.filter((l) => rootOf(l) === 'proto-dahen-kino');
    targets.push(dk.filter((l) => !dk.some((x) => x.parentId === l.id))[0]);
}
ok('a leaf descending from the classical source exists to test against',
    !classicalId || (targets[1] && descendsFrom(targets[1], classicalId)),
    `classical source ${classicalId}, picked ${targets[1]?.name}`);

// ===========================================================================
section('The panel renders');
// ===========================================================================
const rendered = new Map();
for (const lang of targets.filter(Boolean)) {
    let html = null;
    try { html = langSectionsHtml(model, lang, doc.config.presentYear); } catch (e) {
        ok(`${lang.name} renders without throwing`, false, e.stack?.split('\n').slice(0, 3).join('\n      '));
        continue;
    }
    ok(`${lang.name} renders without throwing`, true);
    rendered.set(lang.name, html);

    ok(`${lang.name} produced real markup`, typeof html === 'string' && html.length > 2000,
        `got ${html?.length ?? 0} chars`);

    /**
     * The panel's own error branch. It is correct behaviour when a family has
     * no config, and a silent failure when one does — so it must not appear
     * for a family that is configured.
     */
    ok(`${lang.name} did not fall into the error branch`,
        !/Could not derive this stage|No language defined/.test(html),
        html.slice(0, 300));

    // The three ways a missing value shows up as text in the UI.
    for (const bad of ['undefined', 'NaN', '[object Object]']) {
        const hits = html.split(bad).length - 1;
        ok(`${lang.name} has no "${bad}" in the markup`, hits === 0, `${hits} occurrence(s)`);
    }

    // Angle brackets have to balance or the panel eats the rest of the sidebar.
    const opens = (html.match(/<[a-zA-Z]/g) || []).length;
    const closes = (html.match(/<\/[a-zA-Z]/g) || []).length;
    const selfClosing = (html.match(/<(br|hr|img|input|circle|line|path|rect|text|polyline|use|g)\b/g) || []).length;
    ok(`${lang.name} has plausibly balanced tags`, opens - closes - selfClosing < opens * 0.35,
        `${opens} open, ${closes} close, ${selfClosing} void`);
}

// ===========================================================================
section('The variation sections are present and populated');
// ===========================================================================
{
    const deep = rendered.get(targets[1]?.name);
    ok('a deep Alzuria-Ayuman leaf rendered', !!deep);
    if (deep) {
        // Section headers.
        for (const [label, needle] of [
            ['Syntax', 'Syntax —'],
            ['Doublets', 'Doublets'],
            ['Register and dialect', 'Register and dialect'],
            ['Names', '>Names<'],
        ]) {
            ok(`the ${label} section is in the panel`, deep.includes(needle));
        }

        // And populated rather than empty — this family has a classical source,
        // so all four should have content.
        ok('doublets are listed', /the same word twice|escaped/.test(deep) || deep.includes('lang-doublet'));
        ok('a formal/everyday pair is shown', deep.includes('lang-formal'));
        ok('the syntax correlate table rendered', deep.includes('lang-table'));
        ok('names carry an opacity reading',
            /transparent|the word died|worn past recognition|wholly opaque/.test(deep));
        ok('names name the stage they were coined in', deep.includes('coined in'));

        // Every attested analogue in the UI copy should still be spelled the way
        // the engine spells it, so a reader can grep between the two.
        ok('the doublet section cites chief/chef', /chief|chef/.test(deep));
    }

    // A proto has no changeset and no parent, which is where optional-value
    // bugs live. It must still render its syntax, since a proto HAS a syntax.
    const proto = rendered.get(targets[0]?.name);
    if (proto) {
        ok('the proto renders a syntax section', proto.includes('Syntax —'));
        ok('the proto reports no syntactic change yet',
            proto.includes('No syntactic change in this lineage') || proto.includes('How it got here'));
    }
}

// ===========================================================================
section('Closed sections stay cheap');
// ===========================================================================
{
    /**
     * The lazy guard is load-bearing, not a nicety: coining a name layer
     * re-evolves a dozen words through every ruleset in the lineage, and a
     * dialect re-derives a lexicon. Both would run on every panel render for a
     * section nobody opened.
     */
    for (const s of ['names', 'register', 'doublets']) view.open.delete(s);
    const lang = targets[1];
    const t0 = process.hrtime.bigint();
    const closed = langSectionsHtml(model, lang, doc.config.presentYear);
    const closedMs = Number(process.hrtime.bigint() - t0) / 1e6;

    for (const s of ['names', 'register', 'doublets']) view.open.add(s);
    const t1 = process.hrtime.bigint();
    langSectionsHtml(model, lang, doc.config.presentYear);
    const openMs = Number(process.hrtime.bigint() - t1) / 1e6;

    ok('a closed Names section renders no name list', !closed.includes('coined in'));
    ok('a closed Register section renders no pairs', !closed.includes('lang-formal'));
    ok('closing the expensive sections is measurably cheaper', closedMs < openMs,
        `closed ${closedMs.toFixed(0)}ms, open ${openMs.toFixed(0)}ms`);
}

section('Sample text is pronounceable by an IPA reader');
{
    /**
     * The failure mode here is SILENT. A reader handed a symbol it does not know
     * says nothing at all, so a sentence full of tie bars and alveolo-palatals
     * comes out with holes in it and no error anywhere. Before readerSafe became
     * a substitution table rather than a delete list, 18 distinct characters were
     * surviving it, including 1,286 bare /a/ and 30 script-g U+0261, which is not
     * the ASCII g a reader expects and is invisibly different on screen.
     */
    const offenders = new Map();
    let checked = 0, nonEmpty = 0;
    for (const lang of targets) {
        let state;
        try { state = projectFor(model, lang.id, doc.config.presentYear)?.stateOf(lang.id); } catch { continue; }
        if (!state) continue;
        for (const sentence of SENTENCES) {
            let r;
            try { r = renderSentence(state, sentence); } catch { continue; }
            checked += 1;
            const txt = r.readerIpa || '';
            if (txt.length > 3) nonEmpty += 1;
            for (const ch of txt) {
                if (!READER_ALPHABET.has(ch)) offenders.set(ch, (offenders.get(ch) || 0) + 1);
            }
        }
    }
    ok('some sentences were actually checked', checked > 0, `${checked} renderings`);
    ok('every rendering produces non-empty reader IPA', nonEmpty === checked, `${nonEmpty}/${checked}`);
    ok('reader IPA contains only characters an IPA reader can voice',
        offenders.size === 0,
        offenders.size
            ? [...offenders.entries()].map(([c, n]) =>
                `${JSON.stringify(c)} U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')} x${n}`).join(', ')
            : '');
}

console.log('\n' + '='.repeat(64));
if (failures.length) console.log(failures.join('\n'));
console.log(`${passed} passed, ${failed} ${failed === 1 ? 'FAILED' : 'failed'}.`);
process.exit(failed ? 1 : 0);
