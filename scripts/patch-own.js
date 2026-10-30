/**
 * DJ's own hand into data/scripts.json without running the engine
 * (js/engine/script/own.js). A sign he drew, or a hand he picked, needs no
 * language worked out: it is drawn as he drew it, so it can be written
 * straight into the built scripts, as scripts/build-scripts.js would write
 * it. That takes seconds where the build takes many minutes; the build
 * gives the same signs the next time it runs.
 *
 * A sign he gave back to the engine is drawn again from the lock. Where the
 * lock has no shape for it (a stage never locked), only the build can draw
 * it, and this exits with 3 so the caller runs the build instead.
 *
 *   node scripts/patch-own.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toPath, inkBox, encodeStrokes, decodeStrokes } from '../js/engine/script/strokes.js';
import { joinForms } from '../js/engine/script/joining.js';
import { stageKeys, round2, OWN_CHANGE } from '../js/engine/script/own.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f, fallback) => (fs.existsSync(path.join(root, f)) ? JSON.parse(fs.readFileSync(path.join(root, f), 'utf8')) : fallback);
const data = read('data/scripts.json', null);
if (!data) { console.error('data/scripts.json is missing: run npm run scripts.'); process.exit(1); }
const own = read('data/scripts-own.json', { stages: {} }).stages || {};
const lock = read('data/scripts-lock.json', { stages: {} }).stages || {};
const style2 = (s) => ({ ...s, aspect: +(+s.aspect).toFixed(2), slant: +(+s.slant).toFixed(2), round: +(+s.round).toFixed(2), tall: +(+(s.tall ?? 0)).toFixed(2) });

let drawn = 0, restored = 0;
const needBuild = [];
for (const st of data.stages) {
    const mine = own[st.id]?.signs || {};
    const L = lock[st.id]?.signs || {};
    const keys = stageKeys(st.signs);
    const current = (x) => (x.strokes ? { strokes: x.strokes } : x.d ? decodeStrokes(x.d) : null);
    st.signs = st.signs.map((x) => {
        const k = keys.get(x.id), o = mine[k];
        if (!o && !x.own) return x;
        // the engine's shape: the lock's, else (a sign never his) the one built
        const l = L[k];
        const engine = l ? (l.d ? decodeStrokes(l.d) : { strokes: l.s }) : !x.own ? current(x) : null;
        const engineUpper = l?.u ? { strokes: l.u } : !x.own && x.upperStrokes ? { strokes: x.upperStrokes } : null;
        const glyph = o?.s ? { strokes: o.s } : engine;
        const upper = o?.u ? { strokes: o.u } : engineUpper ?? (x.upperStrokes && !x.own ? { strokes: x.upperStrokes } : null);
        if (!glyph || (x.upperStrokes && !upper)) { needBuild.push(`${st.id} ${k}`); return x; }
        if (o) drawn += 1; else restored += 1;
        const out = { ...x };
        delete out.own;
        if (o) out.own = o.via || 'drawn';
        if (st.logographic) out.d = encodeStrokes(glyph);
        else {
            out.path = toPath(glyph, st.ductus, 100);
            out.box = inkBox(glyph);
            out.strokes = round2(glyph.strokes);
            const j = joinForms({ ...x, glyph }, st);
            if (j) { out.joins = j.joins; out.forms = Object.fromEntries(Object.entries(j.forms).map(([f, s]) => [f, { path: toPath({ strokes: s }, st.ductus, 100), box: inkBox({ strokes: s }), strokes: round2(s) }])); }
        }
        if (upper) { out.upperPath = toPath(upper, st.ductus, 100); out.upperBox = inkBox(upper); out.upperStrokes = upper.strokes; }
        return out;
    });
    // the hand he picked, and the engine's kept beside it to go back to
    const picked = own[st.id]?.style;
    st.changes = (st.changes || []).filter((c) => c.kind !== 'own hand');
    if (picked) { st.engineStyle ??= st.style; st.style = style2(picked); st.changes.push(OWN_CHANGE(st.year)); }
    else if (st.engineStyle) { st.style = st.engineStyle; delete st.engineStyle; }
}
if (needBuild.length) {
    console.log(`Own: ${needBuild.length} signs only the build can draw again (${needBuild.slice(0, 5).join(', ')}): run npm run scripts.`);
    process.exit(3);
}
data.generatedAt = new Date().toISOString();
const file = path.join(root, 'data/scripts.json');
fs.writeFileSync(`${file}.tmp`, JSON.stringify(data));
fs.renameSync(`${file}.tmp`, file);
console.log(`Own: ${drawn} of DJ's signs (drawn, or in a hand he picked)${restored ? `, ${restored} back to the engine's` : ''}, written into data/scripts.json.`);
