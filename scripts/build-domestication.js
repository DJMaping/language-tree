/**
 * Andah's own tamed animals and crops in the languages (DJ, 30 Oct 2026:
 * "there are unique animals and plants in this world different to earth",
 * and his map "Domesticating plants and Animals in Andah (Janus)": "this is
 * important for you").
 *
 * The map gives 27 hearths, each with the year of the earliest finds and the
 * species first bred there; "local species were domesticated and then
 * spread through links with other societies", and New Ayre's had "a great
 * deal less impact" than Alzuria's. So:
 *
 *   - the family living at a hearth has the species' word as its own: in its
 *     proto, when the hearth is older than the proto, else coined in the year
 *     of the finds by whichever of its languages is spoken there;
 *   - every other family gets it as the species spreads, about a kilometre a
 *     year over land (the Neolithic's pace across Europe) and a quarter of
 *     that across the sea between landmasses. A species that reached a
 *     family before its proto is in the proto as an old loan, its form worn
 *     native (as the word for the vine reached the Indo-Europeans); one
 *     arriving later is borrowed, in the year it arrives, from the hearth
 *     family's language spoken then (lexicon/species.js);
 *   - contact between languages lends a species sooner where it can
 *     (contact.js makeLoans).
 *
 * The hearth dots were placed on the country outlines by fitting a Robinson
 * projection to DJ's map (tools/janus_fit.py and tools/janus_hearths.py, 71% of the land agreeing);
 * the species lists are his legend and hearth lists, as read from his close
 * up of the legend. The names only in the hearth lists (Rica, Te, Samvor,
 * Odva, Bary, Atavala, Veuy) are added as I read them (DJ: "Add as read"),
 * of no stated kind; Cloth and Bread are products, not species. The species
 * the older words now carry (lexicon/relabel.js: the Farl, Verr, Vasis...)
 * are left to them.
 *
 *   node scripts/build-domestication.js   ->  data/canon/domestication.json
 */
import fs from 'node:fs';
import { RELABELLED } from '../js/engine/lexicon/relabel.js';

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const PRESENT = 1765;

/** DJ's legend (his close-up, 30 Oct 2026). The unheaded columns are crops of no stated kind. */
const KINDS = {
    animal: ['Farl', 'Verr', 'Kia', 'Osig', 'Ata', 'Bovana', 'Nema', 'Ammora', 'Fariva', 'Tnsiam', 'Koura', 'Taletana', 'Cilunta', 'Ibuda', 'Lyoa', 'Tilun', 'Mya', 'Hyraga', 'Abuon', 'Siva', 'Valnt', 'Lycoka', 'Slin'],
    grain: ['Vasis', 'Tomeu', 'Virsha', 'Thumey', 'Celta', 'Kenio', 'Midulan', 'Alode', 'Grunanea', 'Stiid', 'Velcha'],
    food: ['Long Ruto', 'Fireja', 'Zinata', 'Loca', 'Nolnd', 'Ta', 'Dau'],
    yam: ['Glssa', 'Plagn', 'Egezya', 'Daunlo'],
    // in the hearth lists only, read from the map's small print (DJ: "Add as read"), of no stated kind
    crop: ['Rica', 'Te', 'Samvor', 'Odva', 'Bary', 'Atavala', 'Veuy', 'Arna', 'Alerae', 'Byzaruso', 'Slyunt', 'Reisia', 'Casna', 'Rvnia', 'Raana', 'Lando', 'Balesia', 'Telso', 'Genie', 'Enegara', 'Arechi', 'Hre', 'Helto', 'Coratana', 'Inerina', 'Raeda', 'Mitovor', 'Landiy', 'Arcvania', 'Nordelo', 'Nol'],
};
const kindOf = new Map(Object.entries(KINDS).flatMap(([k, list]) => list.map((s) => [s, k])));

/** The hearths, numbered as on the map: region, year of the earliest finds, species. */
const HEARTHS = [
    [1, 'Ayuma', -30000, ['Farl']],
    [2, 'Alzuria', -9500, ['Vasis', 'Tomeu']],
    [3, 'Areoix Lie', -9000, ['Virsha', 'Slin', 'Verr', 'Rica']],
    [4, 'Kari', -9000, ['Long Ruto', 'Celta', 'Fireja', 'Osig']],
    [5, 'Central Dahe', -8500, ['Kenio', 'Zinata', 'Loca', 'Nolnd', 'Ata']],
    [6, 'Northern Dahe', -8500, ['Kenio', 'Verr', 'Dau', 'Ta', 'Ata']],
    [7, 'Passonia', -8000, ['Bovana', 'Nema']],
    [8, 'Sursa', -7500, ['Ammora', 'Glssa', 'Plagn', 'Egezya']],
    [9, 'Stomelu', -7000, ['Ammora', 'Glssa']],
    [10, 'Central Mahea', -7000, ['Midulan', 'Tnsiam', 'Te', 'Koura']],
    [11, 'Ocaun', -7000, ['Alode', 'Tnsiam', 'Casna', 'Reisia']],
    [12, 'Western Ayuma', -6000, ['Verr', 'Rvnia', 'Raana', 'Lando', 'Taletana']],
    [13, 'Central Alnormo', -6000, ['Virsha', 'Arna', 'Alerae', 'Fariva', 'Plagn', 'Byzaruso', 'Samvor']],
    [14, 'Oreu', -6000, ['Verr', 'Taletana', 'Balesia', 'Telso']],
    [15, 'Undoson', -6000, ['Ibuda', 'Cilunta']],
    [16, 'Telitana', -6000, ['Grunanea', 'Genie', 'Enegara', 'Lyoa', 'Tilun', 'Mya']],
    [17, 'Hjuan', -5000, ['Ata', 'Arechi']],
    [18, 'Ashain', -4000, ['Stiid', 'Daunlo']],
    [19, 'Kiha', -4000, ['Odva', 'Hre', 'Helto', 'Long Ruto', 'Verr']],
    [20, 'Coroa', -3000, ['Virsha', 'Verr', 'Hyraga']],
    [21, 'Ayre', -3000, ['Bary', 'Ata', 'Abuon', 'Siva', 'Coratana', 'Ta']],
    [22, 'Fedaea', -2500, ['Inerina', 'Raeda', 'Atavala']],
    [23, 'Eastern Quia', -2500, ['Valnt', 'Plagn', 'Egezya']],
    [24, 'Landar', -2500, ['Mitovor', 'Landiy']],
    [25, 'Western Quia', -1500, ['Arcvania', 'Lycoka']],
    [26, 'Azegika', -1000, ['Velcha', 'Slyunt', 'Nordelo', 'Nol']],
    [27, 'Unknown', -500, ['Veuy']],
];
/** Where each hearth's dot falls (tools/janus_hearths.py on DJ's map). */
const PLACED = readJson('data/canon/janus-hearths.json');
// legend names with no hearth on the map (Thumey, Kia, Nema's partner...) are left out until DJ places them

const shapes = readJson('data/canon/country-shapes-coarse.json').shapes;
const doc = readJson('data/languages.json');
const configs = readJson('data/lang-config.json');
const evidence = readJson('data/evidence.json').families;
const L = doc.languages;
const byId = new Map(L.map((l) => [l.id, l]));
const kids = new Map(); for (const l of L) if (l.parentId) { if (!kids.has(l.parentId)) kids.set(l.parentId, []); kids.get(l.parentId).push(l); }
const rootOf = (l) => { let c = l; while (c.parentId && byId.has(c.parentId)) c = byId.get(c.parentId); return c; };

// a country's centre and landmass
const continent = {};
for (const l of L) for (const a of l.areas || []) if (a.state && a.continent) continent[a.state] = a.continent;
// Ayuma, Acrola, Massir and Mahea are one land; Atirha, New Ayre and Quia stand apart over the sea
const LAND = { Ayuma: 'main', Acrola: 'main', Massir: 'main', Mahea: 'main', Atirha: 'Atirha', 'New Ayre': 'New Ayre', Quia: 'Quia' };
const centre = {};
for (const [name, v] of Object.entries(shapes)) {
    const polys = Array.isArray(v[0][0]) ? v : [v];
    const big = polys.reduce((a, b) => (b.length > a.length ? b : a));
    centre[name] = [big.reduce((s, p) => s + p[0], 0) / big.length, big.reduce((s, p) => s + p[1], 0) / big.length];
}
const km = ([lo1, la1], [lo2, la2]) => {
    const r = Math.PI / 180, a = Math.sin(((la2 - la1) * r) / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(((lo2 - lo1) * r) / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(a));
};

// each family: its root, its homeland (DJ's country lists, else its living languages' own lands), its languages' lands
const lifeEnd = (l) => {
    if (l.died != null) return l.died;
    const k = kids.get(l.id) || [];
    if (l.diverged || k.some((x) => x.relation === 'stage')) return k.length ? Math.max(...k.map((x) => x.born)) : PRESENT;
    return PRESENT;
};
const subtreeLands = new Map();
const landsOf = (l) => {
    if (subtreeLands.has(l.id)) return subtreeLands.get(l.id);
    const s = new Set((l.areas || []).filter((a) => a.role !== 'colonial').map((a) => a.state));
    for (const k of kids.get(l.id) || []) for (const x of landsOf(k)) s.add(x);
    subtreeLands.set(l.id, s);
    return s;
};
const families = {};
for (const key of Object.keys(configs).filter((k) => !k.startsWith('_'))) {
    const root = byId.get(key) || L.find((l) => l.uid === key);
    if (!root) continue;
    const ev = evidence[key]?.states;
    const states = Array.isArray(ev) ? ev : typeof ev === 'string' ? JSON.parse(ev.replace(/'/g, '"')) : [];
    const home = states.length ? states : [...landsOf(root)];
    families[key] = { root: root.id, born: root.born, home: home.filter((s) => centre[s]) };
}

// the family at each hearth: the one whose homeland holds the hearth's country, else the nearest
const hearths = HEARTHS.map(([n, region, year, species]) => {
    const p = PLACED[String(n)];
    const at = [p.lon, p.lat];
    let fam = Object.entries(families).find(([, f]) => f.home.includes(p.country))?.[0];
    if (!fam) fam = Object.entries(families).filter(([, f]) => f.home.length).map(([k, f]) => [k, Math.min(...f.home.map((s) => km(centre[s], at)))]).sort((a, b) => a[1] - b[1])[0][0];
    return { n, region, year, species, country: p.country, lon: p.lon, lat: p.lat, land: LAND[continent[p.country]] || 'main', family: fam };
});

// the languages of a family that were spoken in a country in a year (whose lands, or whose daughters' lands, hold it)
const spokenIn = (famKey, country, year) => {
    const fam = families[famKey];
    return L.filter((l) => rootOf(l).id === fam.root && l.born <= year && year < lifeEnd(l) && landsOf(l).has(country))
        .map((l) => ({ id: l.id, born: l.born, end: lifeEnd(l) }));
};

const out = { _source: 'scripts/build-domestication.js from DJ\'s map "Domesticating plants and Animals in Andah (Janus)", 30 Oct 2026', hearths, species: {}, families: {} };
for (const h of hearths) for (const s of h.species.filter((x) => !RELABELLED.has(x))) {
    if (!out.species[s]) out.species[s] = { kind: kindOf.get(s) || 'crop', hearths: [] };
    out.species[s].hearths.push(h.n);
}
for (const [key, fam] of Object.entries(families)) {
    const proto = [], later = [];
    for (const [s, sp] of Object.entries(out.species)) {
        // the earliest way the species reaches this family, over all its hearths
        let best = null;
        for (const n of sp.hearths) {
            const h = hearths.find((x) => x.n === n);
            let year, how;
            if (h.family === key) { year = h.year; how = 'native'; }
            else {
                if (!fam.home.length) continue;
                const d = Math.min(...fam.home.map((c) => km(centre[c], [h.lon, h.lat])));
                const crossing = fam.home.some((c) => (LAND[continent[c]] || 'main') === h.land) ? 1 : 0.25;
                year = Math.round(h.year + d / crossing);
                how = 'spread';
            }
            if (!best || year < best.year) best = { year, how, hearth: n, from: h.family, country: h.country };
        }
        if (!best || best.year > PRESENT) continue;
        const item = { gloss: s, kind: sp.kind, ...best };
        if (best.year <= fam.born) proto.push(item);
        else {
            // who coins it (the family's languages spoken at the hearth then) or lends it (the hearth family's, spoken there then)
            if (best.how === 'native') item.coiners = spokenIn(key, best.country, best.year).map((x) => x.id);
            else item.lenders = spokenIn(best.from, best.country, best.year).map((x) => x.id);
            later.push(item);
        }
    }
    out.families[key] = { root: fam.root, home: fam.home, proto, later };
}
fs.writeFileSync('data/canon/domestication.json', JSON.stringify(out, null, 1));
const n = Object.values(out.families);
console.log(`domestication: ${hearths.length} hearths, ${Object.keys(out.species).length} species; in protos ${n.reduce((a, f) => a + f.proto.length, 0)}, arriving later ${n.reduce((a, f) => a + f.later.length, 0)} over ${n.length} families`);
for (const h of hearths) console.log(`  ${h.n} ${h.region} (${h.year}) -> ${h.country}, ${h.family}`);
