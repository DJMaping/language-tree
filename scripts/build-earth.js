/**
 * Builds the Earth side of the typology maps: Earth's countries and their
 * languages, measured with the same categories as Andah's (js/views/typology-bins.js).
 *
 *   npm run earth-map
 *   node scripts/build-earth.js --ne <ne_50m_admin_0_countries.geojson> --wals <dir>
 *
 * Inputs (neither is in git; the outputs are):
 *   - Natural Earth 1:50m countries, the copy the andah-atlas repository keeps
 *     (Documents/andah-atlas/data/earth/ne_50m_admin_0_countries.geojson).
 *   - WALS, the World Atlas of Language Structures (Dryer & Haspelmath 2013,
 *     CC-BY 4.0), as CLDF tables: values.csv, languages.csv, codes.csv from
 *     https://github.com/cldf-datasets/wals/tree/master/cldf, in data/earth-src/wals/.
 *   - data/canon/earth-main-languages.json (hand-written): each country's main
 *     language and handbook values for what WALS lacks.
 *
 * Outputs:
 *   - data/canon/earth-shapes.json   outlines, simplified, keyed by ISO3
 *   - data/canon/earth-typology.json every WALS language with a typology value
 *                                    (the dots) and each country's main language
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FEATURES, bin } from '../js/views/typology-bins.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const NE = arg('--ne', path.join(os.homedir(), 'Documents', 'andah-atlas', 'data', 'earth', 'ne_50m_admin_0_countries.geojson'));
const WALS = arg('--wals', path.join(root, 'data', 'earth-src', 'wals'));

/** A CSV reader that copes with quoted fields (WALS sources contain commas). */
function readCsv(file) {
    const text = fs.readFileSync(file, 'utf8');
    const rows = [];
    let row = [], field = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quoted) {
            if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
            else if (c === '"') quoted = false;
            else field += c;
        } else if (c === '"') quoted = true;
        else if (c === ',') { row.push(field); field = ''; }
        else if (c === '\n' || c === '\r') {
            if (c === '\r' && text[i + 1] === '\n') i++;
            row.push(field); field = '';
            if (row.length > 1 || row[0] !== '') rows.push(row);
            row = [];
        } else field += c;
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    const [head, ...body] = rows;
    return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

// --- WALS -----------------------------------------------------------------

const V = FEATURES;
const FROM_WALS = {
    '81A': ['order', (n) => V.order.values[n - 1]],
    '1A': ['consonants', (n) => V.consonants.values[n - 1]],
    '2A': ['vowels', (n) => V.vowels.values[n - 1]],
    '11A': ['rounded', (n) => (n === 1 ? 'absent' : 'present')],
    '13A': ['tone', (n) => V.tone.values[n - 1]],
    // 9 = "exclusively borderline case-marking", read as no case.
    '49A': ['cases', (n) => (n === 1 || n === 9 ? 'no case' : V.cases.values[n - 1])],
    '98A': ['alignment', (n) => ['neutral', 'accusative', 'accusative', 'ergative', 'tripartite', 'active'][n - 1]],
    // the grammar added on 17 Oct 2026 (gender, classifiers, pronouns, suppletion, articles)
    '30A': ['genders', (n) => V.genders.values[n - 1]],
    '55A': ['classifiers', (n) => V.classifiers.values[n - 1]],
    '88A': ['demonstrative', (n) => (n === 1 ? 'DemN' : n === 2 ? 'NDem' : null)],
    '89A': ['numeral', (n) => (n === 1 ? 'NumN' : n === 2 ? 'NNum' : null)],
    '39A': ['clusivity', (n) => (n <= 3 ? 'one "we"' : 'inclusive and exclusive')],
    '45A': ['politeness', (n) => (n === 1 ? 'none' : 'polite "you"')],
    '79A': ['suppletion', (n) => (n === 4 ? 'none' : 'tense or aspect')],
    '37A': ['definiteArticle', (n) => ['definite word', '"that" as definite', 'definite affix', 'only indefinite', 'no articles'][n - 1]],
    '38A': ['indefiniteArticle', (n) => ['indefinite word', '"one" as indefinite', 'indefinite affix', 'only definite', 'no articles'][n - 1]],
    '70A': ['imperative', (n) => ['second singular and plural', 'second singular only', 'second plural only', 'number-neutral', 'none'][n - 1]],
    '71A': ['prohibitive', (n) => V.prohibitive.values[n - 1]],
    '73A': ['optative', (n) => (n === 1 ? 'present' : 'absent')],
    '77A': ['evidentials', (n) => ['none', 'indirect only', 'direct and indirect'][n - 1]],
    '78A': ['evidentialCoding', (n) => ['none', 'affix or clitic', 'part of the tense system', 'separate particle', 'modal morpheme', 'mixed'][n - 1]],
    // the other sound chapters (18 Oct 2026), in WALS's code order
    '4A': ['voicing', (n) => V.voicing.values[n - 1]],
    '6A': ['uvulars', (n) => V.uvulars.values[n - 1]],
    // glottalized resonants alongside ejectives or implosives count with those
    '7A': ['glottalized', (n) => ['none', 'ejectives', 'implosives', 'glottalized resonants only', 'ejectives and implosives', 'ejectives', 'implosives', 'ejectives and implosives'][n - 1]],
    '8A': ['laterals', (n) => ['no laterals', '/l/ only', 'laterals but no /l/', '/l/ and lateral obstruents', 'lateral obstruents but no /l/'][n - 1]],
    '9A': ['velarNasal', (n) => ['word-initially too', 'not word-initially', 'none'][n - 1]],
    '10A': ['nasalVowels', (n) => (n === 1 ? 'present' : 'absent')],
    '12A': ['syllableStructure', (n) => V.syllableStructure.values[n - 1]],
    '14A': ['stress', (n) => V.stress.values[n - 1]],
    '18A': ['commonAbsent', (n) => V.commonAbsent.values[n - 1]],
    '19A': ['uncommon', (n) => V.uncommon.values[n - 1]],
    // one word for two meanings (18 Oct 2026)
    '129A': ['handArm', (n) => (n === 1 ? 'identical' : 'different')],
    '130A': ['fingerHand', (n) => (n === 1 ? 'identical' : 'different')],
    '134A': ['greenBlue', (n) => (n === 1 ? 'green vs. blue' : n === 2 ? 'green/blue' : 'other')],
    '135A': ['redYellow', (n) => (n === 1 ? 'red vs. yellow' : n === 2 ? 'red/yellow' : 'other')],
    // the order chapters (18 Oct 2026); WALS's rarer types counted as "other"
    '85A': ['adposition', (n) => ['postpositions', 'prepositions', null, 'no dominant order', 'no adpositions'][n - 1]],
    '86A': ['genitive', (n) => ['GenN', 'NGen', 'no dominant order'][n - 1]],
    '87A': ['adjectiveOrder', (n) => ['AdjN', 'NAdj', 'no dominant order', null][n - 1]],
    '90A': ['relativeClause', (n) => (n === 1 ? 'NRel' : n === 2 ? 'RelN' : 'other')],
    '92A': ['questionParticle', (n) => ['initial', 'final', 'second position', 'other', 'other', 'no question particle'][n - 1]],
    '112A': ['negativeMorpheme', (n) => ['negative affix', 'negative particle', 'negative auxiliary verb', 'other', 'other', 'double negation'][n - 1]],
    '116A': ['polarQuestion', (n) => ['question particle', 'interrogative verb morphology', 'other', 'interrogative word order', 'other', 'intonation only', 'other'][n - 1]],
};

const wLangs = readCsv(path.join(WALS, 'languages.csv')).filter((l) => l.Latitude && !l.ID.includes('-'));
const raw = new Map(); // id -> { '81A': n, ... }
for (const v of readCsv(path.join(WALS, 'values.csv'))) {
    if (!['81A', '1A', '2A', '11A', '13A', '49A', '98A', '20A', '21A', '22A', ...Object.keys(FROM_WALS)].includes(v.Parameter_ID)) continue;
    if (!raw.has(v.Language_ID)) raw.set(v.Language_ID, {});
    raw.get(v.Language_ID)[v.Parameter_ID] = +v.Value;
}

/**
 * WALS has no single "morphological type". It is read from three chapters:
 * fusion (20A), exponence (21A) and the verb's inflectional synthesis (22A).
 */
function morphologyOf(w) {
    const f = w['20A'], e = w['21A'], s = w['22A'];
    if (f == null && e == null && s == null) return null;
    if (f === 2 || f === 4 || s === 1) return 'isolating';
    if (s >= 5) return 'polysynthetic';
    if (f === 6 || e === 2 || e === 3 || e === 4) return 'fusional';
    return 'agglutinative';
}

const languages = {};
for (const l of wLangs) {
    const w = raw.get(l.ID);
    if (!w) continue;
    const v = {};
    for (const [chapter, [key, fn]] of Object.entries(FROM_WALS)) {
        if (w[chapter] == null) continue;
        const x = fn(w[chapter]);
        if (x != null) v[key] = x;
    }
    const m = morphologyOf(w);
    if (m) v.morphology = m;
    if (!Object.keys(v).length) continue;
    // Morphological type is read from WALS, not stated by it: 'd', derived.
    languages[l.ID] = {
        n: l.Name, fam: [l.Family, l.Genus].filter(Boolean).join(', '),
        lat: +(+l.Latitude).toFixed(2), lon: +(+l.Longitude).toFixed(2),
        v, src: Object.fromEntries(Object.keys(v).map((k) => [k, k === 'morphology' ? 'd' : 'w'])),
    };
}

// --- main languages ---------------------------------------------------------

const hand = JSON.parse(fs.readFileSync(path.join(root, 'data', 'canon', 'earth-main-languages.json'), 'utf8'));
const handValues = (h) => ({
    order: h.order,
    morphology: h.morph,
    alignment: h.cases === 0 ? 'neutral' : h.align === 'erg' ? 'ergative' : 'accusative',
    tone: { none: 'no tones', simple: 'simple tone system', complex: 'complex tone system' }[h.tone],
    vowels: bin.vowels(h.vowels),
    consonants: bin.consonants(h.consonants),
    aspirates: bin.present(h.aspirates),
    rounded: bin.present(h.frontRounded),
    syllables: bin.syllables(h.syllables),
    cases: bin.cases(h.cases),
});
const keyOfHand = {};
const problems = [];
for (const [name, h] of Object.entries(hand.languages)) {
    if (h.wals && !languages[h.wals] && !wLangs.some((l) => l.ID === h.wals)) problems.push(`${name}: no WALS language ${h.wals}`);
    const key = h.wals && languages[h.wals] ? h.wals : `h:${name}`;
    const rec = languages[key] || (languages[key] = { n: name, fam: h.family, v: {}, src: {} });
    rec.main = name;
    if (h.wals && languages[h.wals]) rec.fam = h.family; // the handbook family reads better than WALS's genus
    const hv = handValues(h);
    for (const [k, val] of Object.entries(hv)) {
        // WALS wins where it states a value; a handbook type beats a derived one.
        if (val != null && (rec.v[k] == null || rec.src[k] === 'd')) { rec.v[k] = val; rec.src[k] = 'h'; }
    }
    keyOfHand[name] = key;
}
const countries = {};
for (const [iso, name] of Object.entries(hand.countries)) {
    if (!keyOfHand[name]) { problems.push(`${iso}: unknown language ${name}`); continue; }
    countries[iso] = keyOfHand[name];
}

// --- outlines ---------------------------------------------------------------

/** Douglas-Peucker on one ring, in degrees. */
function simplify(pts, tol) {
    if (pts.length < 5) return pts;
    const keep = new Uint8Array(pts.length);
    // A ring ends where it starts, so first cut it at its farthest point.
    let mid = 1, far0 = 0;
    pts.forEach(([x, y], i) => { const d = Math.hypot(x - pts[0][0], y - pts[0][1]); if (d > far0) { far0 = d; mid = i; } });
    keep[0] = keep[mid] = keep[pts.length - 1] = 1;
    const stack = [[0, mid], [mid, pts.length - 1]];
    while (stack.length) {
        const [a, b] = stack.pop();
        const [ax, ay] = pts[a], [bx, by] = pts[b];
        const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1e-9;
        let best = -1, far = 0;
        for (let i = a + 1; i < b; i++) {
            const d = Math.abs(dy * (pts[i][0] - ax) - dx * (pts[i][1] - ay)) / len;
            if (d > far) { far = d; best = i; }
        }
        if (far > tol && best > 0) { keep[best] = 1; stack.push([a, best], [best, b]); }
    }
    return pts.filter((_, i) => keep[i]);
}
const area = (r) => Math.abs(r.reduce((s, [x, y], i) => { const [x2, y2] = r[(i + 1) % r.length]; return s + x * y2 - x2 * y; }, 0) / 2);

const ne = JSON.parse(fs.readFileSync(NE, 'utf8'));
const shapes = {}, names = {};
for (const f of ne.features) {
    const iso = f.properties.ADM0_A3;
    if (iso === 'ATA') continue;
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    const rings = polys.map((p) => p[0]).sort((a, b) => area(b) - area(a));
    const out = [];
    rings.forEach((ring, i) => {
        // Fine enough to zoom into (15 Oct 2026): 0.025 degrees is under 3 km.
        if (i > 0 && area(ring) < 0.004) return; // specks; the largest piece always stays
        const s = simplify(ring, 0.025).map(([x, y]) => [+x.toFixed(3), +y.toFixed(3)]);
        if (s.length >= 4) out.push(s);
    });
    if (out.length) { shapes[iso] = out; names[iso] = f.properties.NAME; }
}
for (const iso of Object.keys(shapes)) if (!countries[iso]) problems.push(`${iso} (${names[iso]}): no main language`);

const write = (rel, obj) => fs.writeFileSync(path.join(root, rel), `${JSON.stringify(obj)}\n`);
write('data/canon/earth-shapes.json', {
    _readme: 'Earth\'s countries for the typology maps, from Natural Earth 1:50m (public domain), simplified by scripts/build-earth.js. Keyed by ISO3 (ADM0_A3); lon/lat.',
    bounds: [-180, -56, 180, 84], shapes, names,
});
write('data/canon/earth-typology.json', {
    _readme: 'Earth typology for comparison with Andah: every WALS language with a value (src w) plus each country\'s main language, gaps filled from handbooks (src h, data/canon/earth-main-languages.json). Built by scripts/build-earth.js. WALS: Dryer & Haspelmath (eds.) 2013, The World Atlas of Language Structures Online, CC-BY 4.0.',
    languages, countries,
});
const size = (rel) => `${Math.round(fs.statSync(path.join(root, rel)).size / 1024)} KB`;
console.log(`Earth: ${Object.keys(shapes).length} countries (${size('data/canon/earth-shapes.json')}), ${Object.keys(languages).length} languages (${size('data/canon/earth-typology.json')}).`);
for (const k of Object.keys(FEATURES)) {
    const n = Object.values(languages).filter((l) => l.lat != null && (l.src[k] === 'w' || l.src[k] === 'd')).length;
    console.log(`  ${FEATURES[k].label.padEnd(28)} ${n} WALS dots`);
}
if (problems.length) console.log(`\nTo look at:\n  ${problems.join('\n  ')}`);
