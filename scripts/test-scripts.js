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
const opentype = (await import('opentype.js')).default;
const fontsIndex = JSON.parse(fs.readFileSync(path.join(root, 'data/fonts/index.json'), 'utf8'));
ok('fonts: one for every modern face', tips.every((t) => fontsIndex.fonts.some((f) => f.stage === t.id)), tips.filter((t) => !fontsIndex.fonts.some((f) => f.stage === t.id)).map((t) => t.id).join(','));
for (const f of fontsIndex.fonts) {
    const file = path.join(root, f.file);
    ok(`${f.stage}: font file`, fs.existsSync(file) && fs.statSync(file).size > 1000);
    if (!fs.existsSync(file)) continue;
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

console.log(`${passed} passed, ${failed} ${failed === 1 ? 'FAILED' : 'failed'}.`);
process.exit(failed ? 1 : 0);
