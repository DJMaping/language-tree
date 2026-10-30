/**
 * Lock the scripts' look (DJ, 30 Oct 2026: "You can redo the words the
 * languages as many times as you want, the scripts I would like to keep as
 * they are"; the plan's step 7, "locks").
 *
 * Writes data/scripts-lock.json from data/scripts.json: every sign's strokes,
 * keyed by what it writes (a letter by its sound, a syllable sign by its
 * syllable, a word-sign by its word) rather than by its id, which shifts when
 * a language gains or loses a sound. scripts/build-scripts.js then draws
 * every sign it finds in the lock as locked, however the languages under it
 * have changed, and only a sign that is new (a new sound, a new word) is
 * drawn afresh. The vowel marks and numerals are locked the same way.
 *
 *   node scripts/lock-scripts.js            lock every stage as it is now
 *   node scripts/lock-scripts.js --keep     keep what is locked; lock every sign, mark and stage not locked yet
 *   node scripts/lock-scripts.js --keep --only <file.json>
 *                                           keep what is locked; lock only the signs listed ([{ stage, key }]),
 *                                           as server.js does after carrying DJ's drawing down
 *
 * To let a script change again, delete its stage from the lock.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lockKey } from '../js/engine/script/own.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'data/scripts.json'), 'utf8'));
const file = path.join(root, 'data/scripts-lock.json');
const keep = process.argv.includes('--keep') && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
const onlyAt = process.argv.indexOf('--only');
const only = onlyAt > 0 ? new Set(JSON.parse(fs.readFileSync(process.argv[onlyAt + 1], 'utf8')).map((x) => `${x.stage}|${x.key}`)) : null;


const out = { _readme: 'The scripts\' look, locked (scripts/lock-scripts.js): each stage\'s signs by what they write, with their strokes (s), a logographic sign\'s encoded strokes (d) and a capital\'s (u); its vowel marks (marks) and numerals (numerals). scripts/build-scripts.js draws every sign found here as it is here.', lockedAt: new Date().toISOString(), stages: { ...(keep?.stages || {}) } };
let n = 0;
for (const st of data.stages) {
    const old = keep?.stages?.[st.id];
    const signs = { ...(old?.signs || {}) };
    const seen = new Map();
    for (const x of st.signs) {
        let k = lockKey(x);
        if (seen.has(k)) k = `${k}#${x.id}`;
        seen.set(k, true);
        if (signs[k]) continue;
        if (x.own) continue;   // DJ's own drawing (data/scripts-own.json) is his, not the engine's: the lock keeps the engine's shapes only
        if (only && !only.has(`${st.id}|${k}`)) continue;
        signs[k] = { ...(x.d ? { d: x.d } : { s: x.strokes }), ...(x.upperStrokes ? { u: x.upperStrokes } : {}) };
        n += 1;
    }
    // --only: the listed signs go back into a stage that was locked; its marks and numerals, and any stage never locked, stay as they were
    if (only) { if (old) out.stages[st.id] = { ...old, signs }; continue; }
    out.stages[st.id] = {
        signs,
        // (a mark or numeral DJ drew is his, not the engine's: never locked as the engine's)
        ...(st.marks ? { marks: { ...Object.fromEntries(Object.entries(st.marks).filter(([, m]) => !m.own).map(([v, m]) => [v, m.strokes])), ...(old?.marks || {}) } } : {}),
        ...(st.numerals?.length ? { numerals: { ...Object.fromEntries(st.numerals.filter((x) => !x.own).map((x) => [x.value, x.strokes])), ...(old?.numerals || {}) } } : {}),
    };
}
fs.writeFileSync(file, JSON.stringify(out));
console.log(`Locked ${n} signs in ${Object.keys(out.stages).length} stages: ${path.relative(root, file)} (${Math.round(fs.statSync(file).size / 1024)} KB).`);
