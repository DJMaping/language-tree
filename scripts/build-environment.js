/**
 * Where each language lives: cold, dry, tropical, by the sea (DJ, 30 Oct
 * 2026: climate and coast "add extra fine words where they matter, like
 * several words for snow and ice in cold lands, or for sand, wells and dunes
 * in deserts").
 *
 * From the andah-atlas data: the Köppen shares of each country
 * (climate_koppen_by_state.json, from DJ's climate map) and the coastal
 * countries (sea_distances.json). A language's lands are its own (the
 * chart's `areas`, colonial ones left out), else its daughters', else its
 * family's homeland (data/evidence.json). A land counts as cold where a third
 * of it is continental or polar (Köppen D or E), dry where a third is desert
 * or steppe (B), tropical where a third is A; a language has a flag where a
 * third of its lands have it.
 *
 *   node scripts/build-environment.js   ->  data/canon/environment.json
 */
import fs from 'node:fs';

const ATLAS = 'C:/Users/danny/Documents/andah-atlas/data';
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const koppen = readJson(`${ATLAS}/climate_koppen_by_state.json`);
const coastal = new Set(readJson(`${ATLAS}/sea_distances.json`).coastal || []);
const doc = readJson('data/languages.json');
const configs = readJson('data/lang-config.json');
const evidence = readJson('data/evidence.json').families;
const L = doc.languages;
const byId = new Map(L.map((l) => [l.id, l]));
const kids = new Map(); for (const l of L) if (l.parentId) { if (!kids.has(l.parentId)) kids.set(l.parentId, []); kids.get(l.parentId).push(l); }
const rootOf = (l) => { let c = l; while (c.parentId && byId.has(c.parentId)) c = byId.get(c.parentId); return c; };

/** A country's flags. */
const landFlags = {};
for (const [st, v] of Object.entries(koppen)) {
    const sh = v.shares || {};
    const sum = (re) => Object.entries(sh).filter(([k]) => re.test(k)).reduce((a, [, x]) => a + x, 0);
    landFlags[st] = { cold: sum(/^[DE]/) >= 1 / 3, polar: sum(/^E/) >= 0.1, dry: sum(/^B/) >= 1 / 3, tropical: sum(/^A/) >= 1 / 3, coast: coastal.has(st) };
}
const FLAGS = ['cold', 'polar', 'dry', 'tropical', 'coast'];
const flagsOf = (lands) => {
    const ok = lands.filter((s) => landFlags[s]);
    if (!ok.length) return null;
    return Object.fromEntries(FLAGS.map((f) => [f, ok.filter((s) => landFlags[s][f]).length / ok.length >= 1 / 3]));
};

const own = (l) => (l.areas || []).filter((a) => a.role !== 'colonial').map((a) => a.state);
const below = new Map();
const landsBelow = (l) => {
    if (below.has(l.id)) return below.get(l.id);
    const s = new Set(own(l));
    for (const k of kids.get(l.id) || []) for (const x of landsBelow(k)) s.add(x);
    below.set(l.id, s);
    return s;
};
const homeOf = (root) => {
    const key = configs[root.id] ? root.id : root.uid;
    const ev = evidence[key]?.states;
    const st = Array.isArray(ev) ? ev : typeof ev === 'string' ? JSON.parse(ev.replace(/'/g, '"')) : [];
    return st.length ? st : [...landsBelow(root)];
};

const out = { _source: 'scripts/build-environment.js from andah-atlas climate_koppen_by_state.json and sea_distances.json', lands: landFlags, languages: {} };
for (const l of L) {
    const mine = own(l);
    const lands = mine.length ? mine : [...landsBelow(l)].length ? [...landsBelow(l)] : homeOf(rootOf(l));
    const f = flagsOf(lands);
    if (f) out.languages[l.id] = { ...f, from: mine.length ? 'own' : [...landsBelow(l)].length ? 'daughters' : 'family' };
}
fs.writeFileSync('data/canon/environment.json', JSON.stringify(out, null, 1));
const n = Object.values(out.languages);
console.log(`environment: ${n.length} languages; cold ${n.filter((x) => x.cold).length}, polar ${n.filter((x) => x.polar).length}, dry ${n.filter((x) => x.dry).length}, tropical ${n.filter((x) => x.tropical).length}, coast ${n.filter((x) => x.coast).length}`);
