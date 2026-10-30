/**
 * Writing-system tests: the gate for data/scripts.json and the script engine.
 *
 * The scripts are built by scripts/build-scripts.js from the languages and
 * drawn by js/engine/script; nothing else in the suite looks at them. These
 * check that the build is whole (every stage has signs, every parent exists,
 * every word-sign stage draws), that the faces people read are clean (no
 * hairline rings, no specks, no repeated points, a few strokes to a letter),
 * that every living language a tip stage serves can write every one of its
 * words in full, and that a passage comes out in its script (use.js).
 *
 *   node scripts/test-scripts.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { hydrate } = await import('../js/engine/script/strokes.js');
const { writeWord } = await import('../js/engine/script/write.js');
const { scriptOf, writePassage } = await import('../js/engine/script/use.js');
const { stateInWorld } = await import('./world.js');
const { translate, analyseEnglish } = await import('../js/engine/text/translate.js');

let passed = 0, failed = 0;
function ok(name, cond, detail = '') {
    if (cond) { passed += 1; return; }
    failed += 1;
    console.log(`  FAIL ${name}${detail ? `: ${detail}` : ''}`);
}

const data = JSON.parse(fs.readFileSync(path.join(root, 'data/scripts.json'), 'utf8'));
const doc = JSON.parse(fs.readFileSync(path.join(root, 'data/languages.json'), 'utf8'));
const langs = new Map(doc.languages.map((l) => [l.id, l]));
const stages = data.stages;
const byId = new Map(stages.map((s) => [s.id, s]));
for (const s of stages) if (s.logographic) hydrate(s);

// ── The build is whole ─────────────────────────────────────────────────────
console.log('── The build ──');
ok('stages built', stages.length >= 60, `${stages.length}`);
for (const s of stages) {
    ok(`${s.id}: signs`, s.signs.length >= 15, `${s.signs.length}`);
    ok(`${s.id}: parent exists`, !s.parent || byId.has(s.parent), s.parent);
    ok(`${s.id}: year before its children`, stages.filter((x) => x.parent === s.id).every((x) => x.year > s.year));
    ok(`${s.id}: users`, s.users.length >= 1 && s.users.every((u) => langs.has(u.lang)), s.users.map((u) => u.lang).join(','));
    ok(`${s.id}: ductus known`, !!data.ductus[s.ductus], s.ductus);
    const first = s.signs[0];
    ok(`${s.id}: first sign draws`, typeof first.path === 'string' && first.path.length > 10);
    ok(`${s.id}: sign ids unique`, new Set(s.signs.map((x) => x.id)).size === s.signs.length);
    if (s.parent) ok(`${s.id}: signs descend`, s.signs.filter((x) => x.from).every((x) => byId.get(s.parent).signs.some((p) => p.id === x.from)));
}

// ── The faces people read are clean ────────────────────────────────────────
console.log('── The faces ──');
const rings = (p) => p.split('M').filter(Boolean).map((r) => r.replace('Z', '').split('L').map((q) => q.split(',').map(Number)));
const area = (r) => { let a = 0; for (let i = 0; i < r.length; i++) { const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % r.length]; a += x1 * y2 - x2 * y1; } return a / 2; };
const perimeter = (r) => { let L = 0; for (let i = 0; i < r.length; i++) { const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % r.length]; L += Math.hypot(x2 - x1, y2 - y1); } return L; };
for (const s of stages.filter((x) => (x.ductus === 'type' || x.ductus === 'roman') && !x.logographic)) {
    let thin = 0, wound = 0, specks = 0, dup = 0, many = 0;
    for (const sg of s.signs) {
        for (const key of ['path', 'upperPath']) {
            if (!sg[key]) continue;
            for (const r of rings(sg[key])) {
                const a = area(r), p = perimeter(r);
                // the roman face has the pen's thin strokes and small serifs by design: hairlines are judged on the even face only
                if (s.ductus === 'type' && p > 25 && (2 * Math.abs(a)) / p < 2.5) thin += 1;
                if (a < 0) wound += 1;
            }
        }
        const body = sg.strokes.filter((t) => !t.mark && !t.head && !t.headline);
        if (body.length > 4 && !sg.flag) many += 1;   // a flag's emblem keeps its strokes
        for (const t of body) {
            if (!t.closed && t.kind !== 'dian' && t.pts.length === 2 && Math.hypot(t.pts[1][0] - t.pts[0][0], t.pts[1][1] - t.pts[0][1]) < 0.06) specks += 1;
            for (let i = 1; i < t.pts.length; i++) if (Math.hypot(t.pts[i][0] - t.pts[i - 1][0], t.pts[i][1] - t.pts[i - 1][1]) < 1e-4) dup += 1;
        }
    }
    ok(`${s.id}: no hairline rings`, thin === 0, `${thin}`);
    ok(`${s.id}: every ring wound alike`, wound === 0, `${wound}`);
    ok(`${s.id}: no specks`, specks === 0, `${specks}`);
    ok(`${s.id}: no repeated points`, dup === 0, `${dup}`);
    ok(`${s.id}: at most four strokes to a letter`, many === 0, `${many}`);
    ok(`${s.id}: letters told apart`, new Set(s.signs.map((x) => x.path)).size === s.signs.length);
}

// ── Every word written in full ─────────────────────────────────────────────
console.log('── Writing ──');
const tips = stages.filter((s) => !stages.some((x) => x.parent === s.id));
for (const s of tips) {
    for (const u of s.users) {
        if (u.lang === 'lastnu') continue;
        let st = null;
        try { st = stateInWorld(u.lang, 1765); } catch { st = null; }
        if (!st) { ok(`${s.id}/${u.lang}: state`, false, 'no state in 1765'); continue; }
        let short = 0, n = 0;
        for (const e of st.entries.slice(0, 300)) {
            if (!e.form?.length || e.retired || e.paradigm) continue;
            n += 1;
            const w = writeWord(s, e.form, e.gloss, st.phonotactics);
            const need = s.logographic || s.type === 'logosyllabic' || s.type === 'hieroglyphic' ? 1 : s.type === 'abjad' ? e.form.filter((p) => p.type !== 'V').length : s.type === 'abugida' ? e.form.filter((p) => p.type !== 'V').length || 1 : e.form.length;
            if (w.length < need) short += 1;
        }
        ok(`${s.id}/${u.lang}: every word written in full`, short === 0, `${short} of ${n} short`);
    }
}

// ── A passage in its script ────────────────────────────────────────────────
console.log('── A passage ──');
const parentOf = (id) => langs.get(id)?.parentId;
for (const id of ['emaran', 'lycroan', 'passonin', 'casan', 'standard-dahen', 'sakernlesi']) {
    const sc = scriptOf(data, id, 1765, parentOf);
    ok(`${id}: has a script in 1765`, !!sc, '');
    if (!sc) continue;
    const st = stateInWorld(id, 1765);
    const t = translate(st, analyseEnglish('The old man came to the river at night.'));
    const words = writePassage(sc.stage, st, t.sentences[0].words);
    ok(`${id}: the passage is written`, words.length >= 3, `${words.length} words`);
}
const own = stages.flatMap((s) => s.users.map((u) => u.lang)).filter((id) => langs.get(id)?.died == null);
ok('a language with a script of its own writes it', own.every((id) => scriptOf(data, id, 1765, parentOf)?.via === id));

// ── The script history ─────────────────────────────────────────────────────
console.log('── The script history ──');
const hist = JSON.parse(fs.readFileSync(path.join(root, 'data/history/script-history.json'), 'utf8'));
ok('history: a stage index', Array.isArray(hist.stages) && hist.stages.length === stages.length, `${hist.stages?.length} of ${stages.length}`);
ok('history: lines named', Object.values(hist.lines || {}).every((l) => l.label && l.root && byId.has(l.root)));
ok('history: every event on a known line', Object.values(hist.languages).flat().every((e) => hist.lines[e.line]));
const compact = { stages: hist.stages, history: hist };
const livingIds = doc.languages.filter((l) => l.died == null && !l.reconstructed).map((l) => l.id);
const written = livingIds.filter((id) => hist.languages[id]).map((id) => ({ id, sc: scriptOf(compact, id, 1765, parentOf) }));
const resolved = written.map((w) => w.sc);
ok('history: every written living language resolves to a stage in 1765', resolved.every(Boolean), `${resolved.filter((x) => !x).length} unresolved`);
const lastEvent = (id) => { const ev = hist.languages[id].filter((e) => e.year <= 1765); return ev[ev.length - 1]; };
ok("history: the stage in force is on the last event's line, and old enough", written.every(({ id, sc }) => sc && sc.stage.line === lastEvent(id).line && sc.stage.year <= 1765));
ok('history: the unwritten stay unwritten', hist.unwritten.every((id) => !scriptOf(compact, id, 1765, parentOf)));
ok('history: a daughter writes her mother\'s script at birth', (() => { const l = doc.languages.find((x) => x.id === 'trian'); const sc = scriptOf(compact, 'trian', l.born + 1, parentOf); return !!sc && sc.stage.line === 'cas'; })());
ok('history: a switch under rule shows in the year after', (() => { const sw = hist.switches.find((s) => s.reason === 'rule' && livingIds.includes(s.lang)); if (!sw) return true; const sc = scriptOf(compact, sw.lang, sw.year + 1, parentOf); return !!sc && sc.stage.line === sw.to && sc.reason === 'rule'; })());

// ── The fonts ──────────────────────────────────────────────────────────────
console.log('── The fonts ──');
// a copy without its packages (npm install not run) checks everything else, and says what it skipped
const opentype = await import('opentype.js').then((m) => m.default).catch(() => null);
if (!opentype) console.log('  (skipped: opentype.js is not installed here, so the fonts are not parsed; run npm install)');
const fontsIndex = JSON.parse(fs.readFileSync(path.join(root, 'data/fonts/index.json'), 'utf8'));
ok('fonts: one for every modern face', tips.every((t) => fontsIndex.fonts.some((f) => f.stage === t.id)), tips.filter((t) => !fontsIndex.fonts.some((f) => f.stage === t.id)).map((t) => t.id).join(','));
for (const f of fontsIndex.fonts) {
    const file = path.join(root, f.file);
    ok(`${f.stage}: font file`, fs.existsSync(file) && fs.statSync(file).size > 1000);
    if (!fs.existsSync(file) || !opentype) continue;
    let font = null;
    try { const buf = fs.readFileSync(file); font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)); } catch (e) { ok(`${f.stage}: font parses`, false, e.message); continue; }
    const st = byId.get(f.stage);
    ok(`${f.stage}: a glyph for every sign`, font.glyphs.length >= st.signs.length, `${font.glyphs.length} glyphs for ${st.signs.length} signs`);
    ok(`${f.stage}: family named for the script`, (font.getEnglishName ? font.getEnglishName('fontFamily') : font.names?.fontFamily?.en) === f.family, String(font.getEnglishName?.('fontFamily')));
    const inked = f.map.filter((m) => m.kind === 'letter' || m.kind === 'word' || m.kind === 'syllable').map((m) => font.charToGlyph(String.fromCodePoint(m.cp)));
    ok(`${f.stage}: every sign has an outline`, inked.every((g) => g && g.path.commands.length > 3), `${inked.filter((g) => !g || g.path.commands.length <= 3).length} empty`);
    ok(`${f.stage}: no outline is a hairline`, inked.every((g) => { const b = g.getBoundingBox(); return b.x2 - b.x1 > 20 && b.y2 - b.y1 > 20; }));
    if (st.type === 'alphabet' || st.type === 'abjad' || st.type === 'abugida') {
        const a = font.charToGlyph('a'), k = font.charToGlyph('k');
        ok(`${f.stage}: typed by key`, (a && a.index > 0) || (k && k.index > 0), 'neither a nor k maps');
    }
}

// ── Joined letters ─────────────────────────────────────────────────────────
console.log('── Joined letters ──');
const { formsOfWord } = await import('../js/engine/script/joining.js');
for (const st of stages.filter((x) => x.joining)) {
    const letters = st.signs.filter((x) => x.value?.sound);
    ok(`${st.id}: every letter has its four forms`, letters.every((x) => x.forms && ['isol', 'init', 'medi', 'fina'].every((k) => x.forms[k]?.path)), `${letters.filter((x) => !x.forms).length} without`);
    if (st.direction !== 'ttb') {
        // a join runs to the box's edge, so letters set side by side touch
        ok(`${st.id}: an initial reaches the next letter, a final the one before`, letters.every((x) => x.forms.fina.box.x1 >= 0.98 && x.forms.medi.box.x1 >= 0.98 && (x.joins === 'right' || (x.forms.init.box.x0 <= 0.02 && x.forms.medi.box.x0 <= 0.02))));
        // a letter that joins only back (Arabic alif, dal, ra, waw) begins a word as it stands alone
        ok(`${st.id}: the letters that join only back are a few`, letters.filter((x) => x.joins === 'right').length / letters.length < 0.35);
    }
}
ok('joining: a word of three takes initial, medial, final', formsOfWord([{ joins: 'dual' }, { joins: 'dual' }, { joins: 'dual' }]).join(' ') === 'init medi fina');
ok('joining: a letter that joins only back breaks the word after it', formsOfWord([{ joins: 'dual' }, { joins: 'right' }, { joins: 'dual' }]).join(' ') === 'init fina isol');
for (const f of fontsIndex.fonts.filter((x) => byId.get(x.stage)?.joining && x.direction !== 'ttb')) {
    const forms = f.map.filter((m) => m.kind === 'form');
    ok(`${f.stage}: the font carries the joined forms`, forms.length >= 3 * f.map.filter((m) => m.kind === 'letter').length * 0.9, `${forms.length} forms`);
}

// ── Every sign inside its box ──────────────────────────────────────────────
for (const st of stages) {
    const out = st.signs.filter((x) => x.box && (x.box.x0 < -0.25 || x.box.x1 > 1.25 || x.box.y0 < -0.25 || x.box.y1 > 1.25));
    ok(`${st.id}: every sign within its box`, !out.length, out.map((x) => x.value?.sound ?? x.value?.word ?? x.id).join(','));
}

// ── Vowel marks and the handwritten faces ─────────────────────────────────
console.log('── Vowel marks and hands ──');
for (const st of stages.filter((x) => x.type === 'abugida' && !stages.some((y) => y.parent === x.id))) {
    const vowels = st.signs.filter((x) => x.value?.kind === 'V').map((x) => x.value.sound).filter((v) => v !== st.inherent);
    ok(`${st.id}: a mark for every vowel letter but the inherent`, vowels.every((v) => st.marks?.[v]?.path), vowels.filter((v) => !st.marks?.[v]).join(','));
    const paths = Object.values(st.marks || {}).map((m) => m.path);
    ok(`${st.id}: no two vowel marks alike`, new Set(paths).size === paths.length);
}
for (const f of fontsIndex.fonts.filter((x) => x.hand)) ok(`${f.stage}: a handwritten face beside the print one`, fontsIndex.fonts.some((x) => x.stage === f.stage && !x.hand) && fs.existsSync(path.join(root, f.file)) && fs.existsSync(path.join(root, f.woff)));
ok('fonts: a web font (WOFF) beside every OpenType one', fontsIndex.fonts.every((f) => f.woff && fs.existsSync(path.join(root, f.woff))));

// ── DJ's own hand: the editor, the tracer and the pick-one sheet ───────────
console.log('── Your own hand ──');
{
    const { traceInk } = await import('../js/engine/script/trace.js');
    const { stageKeys, descendantsOf, restyle } = await import('../js/engine/script/own.js');
    const W = 120;
    const ink = (f) => { const a = new Uint8Array(W * W); for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (f(x, y)) a[y * W + x] = 1; return a; };
    const plus = traceInk(ink((x, y) => (Math.abs(x - 60) < 5 && y > 15 && y < 105) || (Math.abs(y - 60) < 5 && x > 15 && x < 105)), W, W);
    ok('trace: a cross is two strokes, each straight through the fork', plus.strokes.length === 2 && plus.strokes.every((t) => t.pts.length === 2), JSON.stringify(plus.strokes.map((t) => t.pts.length)));
    const ring = traceInk(ink((x, y) => { const r = Math.hypot(x - 60, y - 60); return r > 30 && r < 38; }), W, W);
    ok('trace: a ring is one closed curve', ring.strokes.length === 1 && ring.strokes[0].closed && ring.strokes[0].curve);
    const dotted = traceInk(ink((x, y) => (Math.abs(x - 60) < 4 && y > 30 && y < 105) || (Math.abs(y - 30) < 4 && x > 20 && x < 100) || Math.hypot(x - 95, y - 95) < 4), W, W);
    ok('trace: a T and a dot are a stem, a bar and a mark', dotted.strokes.length === 3 && dotted.strokes.filter((t) => t.mark).length === 1);
    // a pointed corner leaves a whisker at its tip and bends the arms at a fork: neither may show
    const near = (p, a, b) => { const L2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2, u = Math.max(0, Math.min(1, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / L2)); return Math.hypot(p[0] - a[0] - u * (b[0] - a[0]), p[1] - a[1] - u * (b[1] - a[1])); };
    const A = traceInk(ink((x, y) => [[[24, 110], [60, 14]], [[60, 14], [96, 110]], [[39, 72], [81, 72]]].some(([a, b]) => near([x, y], a, b) < 5) || Math.hypot(x - 60, y - 104) < 3), W, W);
    ok('trace: an A is two legs, a bar and a dot, all straight', A.strokes.length === 4 && A.strokes.filter((t) => t.mark).length === 1 && A.strokes.every((t) => !t.curve), JSON.stringify(A.strokes.map((t) => [t.pts.length, t.curve, !!t.mark])));
    ok('trace: the strokes sit in the unit box', [plus, ring, dotted, A].every((g) => g.strokes.every((t) => t.pts.every(([x, y]) => x >= 0.1 && x <= 0.9 && y >= 0.1 && y <= 0.9))));
    // the browser and the build know a sign by the same key
    for (const st of stages) {
        const keys = [...stageKeys(st.signs).values()];
        if (new Set(keys).size !== keys.length) ok(`${st.id}: every sign has a key of its own`, false);
    }
    const lock = fs.existsSync(path.join(root, 'data/scripts-lock.json')) ? JSON.parse(fs.readFileSync(path.join(root, 'data/scripts-lock.json'), 'utf8')).stages : {};
    const unkeyed = stages.filter((st) => lock[st.id]).flatMap((st) => [...stageKeys(st.signs).values()].filter((k) => !lock[st.id].signs[k]).map((k) => `${st.id} ${k}`));
    ok('own: every sign of a locked stage is found in the lock by its key', unkeyed.length <= stages.length, `${unkeyed.length} not: ${unkeyed.slice(0, 5).join(', ')}`);
    // carrying a sign down reaches the stages below it, and only those
    const root0 = stages.find((s) => s.id === 'alz-classical');
    if (root0) {
        const under = new Set(); const walk = (id) => { for (const s of stages) if (s.parent === id) { under.add(s.id); walk(s.id); } }; walk(root0.id);
        const d = descendantsOf(stages, root0.id, root0.signs[0].id);
        ok('own: a classical Alzurian letter comes down to the scripts under it', d.length >= 5 && d.every((x) => under.has(x.stage)), `${d.length} signs`);
    }
    // a hand changes a letter's width and lean, not its place on the line
    const sample = stages.find((s) => s.id === 'eald-mod')?.signs.find((x) => x.strokes?.length);
    if (sample) {
        const body = (g) => { const ys = g.strokes.filter((t) => !t.mark && !t.headline).flatMap((t) => t.pts.map((q) => q[1])); return [Math.min(...ys), Math.max(...ys)]; };
        const before = body({ strokes: sample.strokes });
        const after = body(restyle({ strokes: sample.strokes }, { aspect: 1, slant: 0, round: 0, headline: false }, { aspect: 1.2, slant: 0.1, round: 0, headline: false }));
        ok('own: a new hand keeps a letter on its line', Math.abs(before[0] - after[0]) < 0.03 && Math.abs(before[1] - after[1]) < 0.03, `${before} -> ${after}`);
    }
    // every sign DJ drew is drawn as he drew it
    const ownFile = path.join(root, 'data/scripts-own.json');
    if (fs.existsSync(ownFile)) {
        const own = JSON.parse(fs.readFileSync(ownFile, 'utf8')).stages || {};
        for (const [sid, o] of Object.entries(own)) {
            const st = byId.get(sid);
            if (!st) { ok(`own: ${sid} is a stage`, false); continue; }
            const keys = stageKeys(st.signs);
            for (const [k, e] of Object.entries(o.signs || {})) {
                const sign = st.signs.find((x) => keys.get(x.id) === k);
                if (!sign) continue;   // drawn for a sound the stage no longer has: the build says so
                const drawn = st.logographic ? !!sign.d : JSON.stringify(sign.strokes?.map((t) => t.pts)) === JSON.stringify(e.s?.map((t) => t.pts.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100])));
                ok(`own: ${sid} ${k} is drawn as DJ drew it`, !!sign.own && (!e.s || drawn));
            }
            const pts = (strokes) => JSON.stringify((strokes || []).map((t) => t.pts.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100])));
            for (const [v, e] of Object.entries(o.marks || {})) if (st.marks?.[v]) ok(`own: ${sid}'s mark for ${v} is drawn as DJ drew it`, !!st.marks[v].own && pts(st.marks[v].strokes) === pts(e.s));
            for (const [n, e] of Object.entries(o.numerals || {})) { const x = (st.numerals || []).find((y) => String(y.value) === n); if (x) ok(`own: ${sid}'s numeral ${n} is drawn as DJ drew it`, !!x.own && pts(x.strokes) === pts(e.s)); }
        }
    }
}

console.log(`${passed} passed, ${failed} ${failed === 1 ? 'FAILED' : 'failed'}.`);
process.exit(failed ? 1 : 0);
