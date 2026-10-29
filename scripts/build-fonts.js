/**
 * Fonts of the scripts: one OpenType font for each face people read, made
 * from the glyphs of data/scripts.json, so the wiki, the atlases and DJ's
 * own documents can set text in them (DJ's plan, 29 Oct 2026: font files
 * after the script map).
 *
 *   node scripts/build-fonts.js [stage ids...]   -> data/fonts/<stage>.otf, data/fonts/index.json
 *
 * With no ids, every modern face (the tips of the script tree). Each sign's
 * inked rings (strokes.js toRings) are united into one outline, since a font
 * may not have overlapping contours (polygon-clipping does what a type
 * designer's "remove overlap" does), and set in a 1000-unit em: the foot of
 * the unit box on the baseline, its top at 760, so a sign that reaches
 * below the box descends. Letters are keyed for typing: a Latin letter where
 * the sound is one (type "ka", see the script's k and a), the IPA letter
 * where the sound is one (ʃ θ ŋ), capitals to the capital letters of a
 * two-case script, and every sign in the Private Use Area from U+E000 in
 * the order of the script, which index.json lists with each sign's value,
 * so that word-signs and marks can be typed by code. A joining script's
 * letters have their four forms (js/engine/script/joining.js): the
 * isolated one on the keys, and the initial, medial and final each at a
 * code point of its own after the signs, as Unicode gives Arabic its
 * presentation forms (U+FE70 onwards), and as the OpenType init, medi and
 * fina substitutions. The Scripts page's Type tab picks the forms as you
 * type; a word processor that shapes only Unicode's own scripts can be
 * given the form code points directly.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';
import polygonClipping from 'polygon-clipping';
import { toRings, decodeStrokes } from '../js/engine/script/strokes.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'data/scripts.json'), 'utf8'));
const stages = data.stages;
const byId = new Map(stages.map((s) => [s.id, s]));
const want = process.argv.slice(2);
const tips = stages.filter((s) => !stages.some((x) => x.parent === s.id));
const chosen = want.length ? want.map((id) => byId.get(id)).filter(Boolean) : tips;

const EM = 1000, TOP = 0.12, FOOT = 0.88, BEARING = 50;
const X = (x) => Math.round(x * EM);
const Y = (y) => Math.round((FOOT - y) * EM);
const PUA = 0xe000;
const LATIN = /^[a-z]$/;
const IPA_TO_LATIN = { 'ɡ': 'g' };

/** One outline from a sign's rings: the rings united, as a font must have them, in font units. */
function outline(rings, dx = 0) {
    if (!rings.length) return new opentype.Path();
    const polys = rings.map((r) => [r.map(([x, y]) => [X(x + dx), Y(y)])]);
    let union;
    try { union = polygonClipping.union(...polys); } catch { union = polys; }
    const p = new opentype.Path();
    for (const poly of union) for (const ring of poly) {
        // the union gives outer rings anticlockwise and holes clockwise in y-up coordinates, as PostScript wants
        const pts = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring;
        if (pts.length < 3) continue;
        p.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
        p.close();
    }
    return p;
}

const strokesOf = (sign, upper = false) => (upper ? sign.upperStrokes : sign.strokes) || (sign.d ? decodeStrokes(sign.d).strokes : null);
const inkOf = (strokes) => { const b = { x0: 1, x1: 0 }; for (const t of strokes) if (!t.headline) for (const [x] of t.pts) { b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x); } return b.x1 > b.x0 ? b : { x0: 0.12, x1: 0.88 }; };

const index = [];
fs.mkdirSync(path.join(root, 'data/fonts'), { recursive: true });
for (const stage of chosen) {
    const family = `Andah ${stage.name.replace(/ script( in print)?$/, '').replace(/^(Modern|Simplified) /, '')}`;
    const glyphs = [new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 600, path: (() => { const p = new opentype.Path(); p.moveTo(80, 0); p.lineTo(520, 0); p.lineTo(520, 700); p.lineTo(80, 700); p.close(); p.moveTo(140, 60); p.lineTo(140, 640); p.lineTo(460, 640); p.lineTo(460, 60); p.close(); return p; })() })];
    glyphs.push(new opentype.Glyph({ name: 'space', unicode: 32, advanceWidth: stage.separator === 'none' ? 120 : 320, path: new opentype.Path() }));
    const map = [];
    const pendingForms = [];
    const taken = new Set([0, 32]);
    let pua = PUA;
    const add = (name, strokes, value, kind, codes, { joined = false } = {}) => {
        if (!strokes?.length) return null;
        const ink = inkOf(strokes);
        const width = ink.x1 - ink.x0;
        // a letter with forms of its own joins by them (its join runs to its box's edge); else it carries the stroke along the line
        const joining = !!stage.joining && (kind === 'letter' || kind === 'form') && !joined;
        const touching = kind === 'form' || joined;
        const dx = BEARING / EM - ink.x0;
        const rings = toRings({ strokes }, stage.ductus, stage.logographic ? 4 : 10);
        // a joining script's letters carry the stroke along the line (write.js draws it under each word)
        // (down the page, a spine the full height of the em, so letters set one under another join: Mongolian's stem)
        if (joining) rings.push(stage.direction === 'ttb' ? [[0.48, TOP - 0.12], [0.525, TOP - 0.12], [0.525, 1], [0.48, 1]] : [[ink.x0 - 0.02, 0.66], [ink.x1 + 0.02, 0.66], [ink.x1 + 0.02, 0.705], [ink.x0 - 0.02, 0.705]]);
        const advance = Math.round(width * EM) + (joining || touching ? 0 : 2 * BEARING);
        const unicodes = [];
        for (const c of codes) { const cp = typeof c === 'number' ? c : c.codePointAt(0); if (!taken.has(cp)) { unicodes.push(cp); taken.add(cp); } }
        const cp = pua++; unicodes.push(cp); taken.add(cp);
        glyphs.push(new opentype.Glyph({ name, unicode: unicodes[0], unicodes, advanceWidth: Math.max(advance, 80), path: outline(rings, joining ? -ink.x0 + 0.02 : touching ? -ink.x0 : dx) }));
        map.push({ cp, keys: unicodes.filter((u) => u !== cp).map((u) => String.fromCodePoint(u)), name, value, kind });
        return unicodes;
    };
    const safe = (s) => s.replace(/[^A-Za-z0-9]/g, '_');
    // the signs: letters by their sounds, word-signs by their words, syllable signs by their syllables
    for (const [i, sign] of stage.signs.entries()) {
        const v = sign.value || {};
        const sound = v.sound ?? null;
        const codes = [];
        if (sound) {
            const plain = sound.replace(/[ʲʷʰʼ̃ː]/gu, '');
            const latin = IPA_TO_LATIN[plain] || plain;
            if (LATIN.test(latin)) { codes.push(latin); if (!stage.bicameral || !sign.upperStrokes) codes.push(latin.toUpperCase()); }
            if ([...sound].length === 1 && sound.codePointAt(0) > 127) codes.push(sound);
        }
        const label = v.sound ?? v.syllable ?? v.word ?? v.reading ?? v.mark ?? `sign${i}`;
        const kindOf = v.sound ? 'letter' : v.syllable ? 'syllable' : v.mark ? 'mark' : 'word';
        const isolated = sign.forms && stage.direction !== 'ttb' ? sign.forms.isol.strokes : strokesOf(sign);
        add(`sign_${safe(String(label))}_${i}`, isolated, { ...v, concept: sign.concept ?? undefined, ...(sign.joins ? { joins: sign.joins } : {}) }, kindOf, codes, { joined: !!sign.forms && stage.direction !== 'ttb' });
        // (a script written down the page keeps its forms to the app's drawing: browsers set private-use letters sideways in vertical text)
        if (sign.forms && stage.direction !== 'ttb') pendingForms.push({ sign, label, i, base: map[map.length - 1] });
        if (sign.upperStrokes && sound) {
            const plain = (IPA_TO_LATIN[sound.replace(/[ʲʷʰʼ̃ː]/gu, '')] || sound.replace(/[ʲʷʰʼ̃ː]/gu, ''));
            add(`cap_${safe(String(label))}_${i}`, strokesOf(sign, true), { ...v, capital: true }, 'capital', LATIN.test(plain) ? [plain.toUpperCase()] : []);
        }
    }
    // the joined forms, after every sign, each at its own code point (as Arabic's presentation forms)
    const substitutions = [];
    for (const { sign, label, i, base } of pendingForms) {
        if (!base) continue;
        for (const form of ['init', 'medi', 'fina']) {
            const f = sign.forms[form];
            if (!f?.strokes?.length) continue;
            add(`sign_${safe(String(label))}_${i}.${form}`, f.strokes, { sound: sign.value?.sound, form, of: base.cp }, 'form', []);
            map[map.length - 1].form = form; map[map.length - 1].of = base.cp;
            substitutions.push({ feature: form, sub: glyphs.findIndex((g) => g.name === base.name), by: glyphs.length - 1 });
        }
    }
    // a hieroglyphic script's consonant signs are typed by their consonants too
    if (stage.consonantSigns) for (const [c, id] of Object.entries(stage.consonantSigns)) {
        const sign = stage.signs.find((x) => x.id === id);
        const plain = IPA_TO_LATIN[c] || c;
        if (!sign || !LATIN.test(plain)) continue;
        const g = glyphs.find((x) => x.name.startsWith('sign_') && map.find((m) => m.name === x.name)?.value?.word === sign.value?.word);
        if (g && !taken.has(plain.codePointAt(0))) { g.unicodes.push(plain.codePointAt(0)); taken.add(plain.codePointAt(0)); map.find((m) => m.name === g.name).keys.push(plain); }
    }
    // an abjad has no vowel letters: a Latin vowel typed in one is nothing, not another font's letter
    if (stage.type === 'abjad') for (const v of 'aeiouAEIOU') if (!taken.has(v.codePointAt(0))) { glyphs.push(new opentype.Glyph({ name: `blank_${v}`, unicode: v.codePointAt(0), advanceWidth: 0, path: new opentype.Path() })); taken.add(v.codePointAt(0)); }
    // the vowel marks and the numerals
    for (const [vowel, m] of Object.entries(stage.marks || {})) add(`mark_${safe(vowel)}`, m.strokes, { mark: vowel, at: m.at }, 'mark', []);
    for (const n of stage.numerals || []) add(`num_${n.value}`, n.strokes || (n.path ? null : null), { numeral: n.value }, 'numeral', n.value <= 9 ? [String(n.value)] : []);
    const font = new opentype.Font({ familyName: family, styleName: 'Regular', unitsPerEm: EM, ascender: Math.round((FOOT - TOP) * EM) + 40, descender: -Math.round((1 - FOOT) * EM) - 80, glyphs });
    // (opentype.js wants the features in alphabetical order: fina, init, medi)
    for (const s of substitutions.sort((a, b) => a.feature.localeCompare(b.feature))) if (s.sub > 0) font.substitution.addSingle(s.feature, { sub: s.sub, by: s.by }, 'DFLT', 'dflt');
    const file = `data/fonts/${stage.id}.otf`;
    fs.writeFileSync(path.join(root, file), Buffer.from(font.toArrayBuffer()));
    index.push({ stage: stage.id, name: stage.name, family, file, direction: stage.direction, type: stage.type, glyphs: glyphs.length - 2, map });
    console.log(`${stage.id.padEnd(10)} ${family.padEnd(24)} ${String(glyphs.length - 2).padStart(4)} glyphs  ${map.filter((m) => m.keys.length).length} typed by key`);
}
if (!want.length) {
    fs.writeFileSync(path.join(root, 'data/fonts/index.json'), JSON.stringify({ _readme: 'The fonts of the scripts (scripts/build-fonts.js): one OpenType font per modern face, with each sign’s code point (cp, in the Private Use Area), the keys that type it, its value and kind.', generatedAt: new Date().toISOString(), fonts: index }));
    console.log(`Wrote ${index.length} fonts and data/fonts/index.json.`);
}
