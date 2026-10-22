/**
 * How long and how widely each contact lasted, read off the Through-time maps,
 * as the weights the engine's contact uses (data/history/contact.json).
 *
 *   node scripts/contact-strength.js          (after a Through-time build)
 *
 * The chart's contact arrows carry a start year and nothing else, so every
 * conquest lent the same amount: a raid and four centuries of rule alike. The
 * maps know better. data/cache/years/contacts.json lists, run by run, where a
 * language's rulers sat over another language's speakers (a superstrate) and
 * where speakers switched from one language to another (a substrate), with the
 * land each covered; frames.json has every language's land each year.
 *
 * Two things come out (DJ, 22 Oct 2026, "contact into the words"):
 *
 *   arrows   a strength for each chart arrow the maps confirm, from how long
 *            the rule lasted and how much of the speakers' land it held. An
 *            arrow given a `strength` of its own on the chart keeps it.
 *   map      the long, heavy rule the chart has no arrow for: 200 years or
 *            more over a quarter or more of the speakers' land, between
 *            families (DJ: "use them automatically"). They lend words like an
 *            arrow does; put an id in `veto` to stop one. Rule only: a map
 *            switch is as often a border wandering back and forth as a shift.
 *   borders  long borders between families, 500 years or more along 300 km
 *            or more: each side's grammar pulls on the other's, and no words
 *            pass (DJ, 22 Oct 2026: "grammar only"), as the Balkan languages
 *            share a "the" after the noun across four families.
 *
 * Lost languages (the map's placeholders) have no words, so they lend none.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel, fallback) => { try { return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8')); } catch { return fallback; } };

const OUT = 'data/history/contact.json';
const MAP_YEARS = 200;      // a map contact: this long ...
const MAP_SHARE = 0.25;     // ... over this much of the speakers' land
const MERGE_GAP = 100;      // runs of one pair this close are one contact

const frames = read('data/cache/years/frames.json', null);
const contacts = read('data/cache/years/contacts.json', { contacts: [] }).contacts;
const doc = read('data/languages.json', { languages: [], borrowings: [] });
const old = read(OUT, {});
if (!frames) { console.error('No Through-time frames: run npm run years-languages first.'); process.exit(1); }

const byId = new Map(doc.languages.map((l) => [l.id, l]));
const rootOf = (id) => { let c = byId.get(id); while (c?.parentId && byId.has(c.parentId)) c = byId.get(c.parentId); return c?.id ?? null; };

// every language's land, year by year (km²)
const idOf = Object.fromEntries(Object.entries(frames.langs).map(([code, l]) => [code, l.id]));
const land = new Map();
for (const [y, f] of Object.entries(frames.frames)) {
    for (const [code, a] of Object.entries(f.areas || {})) {
        const id = idOf[code];
        if (!id) continue;
        if (!land.has(id)) land.set(id, []);
        land.get(id).push([Number(y), a[4]]);
    }
}
const landIn = (id, from, to) => Math.max(0, ...(land.get(id) || []).filter(([y]) => y >= from && y <= to).map(([, k]) => k));

// one contact per donor, recipient and kind: its runs merged across short gaps
const pairs = new Map();
for (const c of contacts) {
    if (c.kind !== 'superstrate' && c.kind !== 'substrate') continue;
    const key = `${c.kind}|${c.a}|${c.b}`;
    if (!pairs.has(key)) pairs.set(key, []);
    pairs.get(key).push(c);
}
const merged = [];
for (const [key, runs] of pairs) {
    const [kind, a, b] = key.split('|');
    runs.sort((x, y) => x.from - y.from);
    let cur = null;
    const flush = () => { if (cur) merged.push(cur); };
    for (const r of runs) {
        const share = Math.min(1, r.areaKm2 / Math.max(1, landIn(b, r.from, r.to)));
        if (cur && r.from - cur.to <= MERGE_GAP) {
            cur.to = Math.max(cur.to, r.to);
            cur.years += r.to - r.from + 10;
            cur.share = Math.max(cur.share, share);
        } else {
            flush();
            cur = { kind, a, b, from: r.from, to: r.to, years: r.to - r.from + 10, share, sameFamily: r.sameFamily };
        }
    }
    flush();
}

/**
 * The strength of one contact: 1 is the typical amount for its kind, the
 * Norman conquest of England about 3 (three and a half centuries of rule over
 * all of it), a short rule over a corner of a language's land a few tenths.
 * Rule lends more the longer and the wider it holds; a shift lends what the
 * old language's speakers carried over, more the more of the land it was.
 */
function strengthOf(c) {
    const s = c.kind === 'superstrate'
        ? 1.4 * Math.pow(c.years / 200, 0.8) * (0.25 + c.share)
        : 1.6 * Math.pow(c.share, 0.7) * Math.min(1, Math.pow(c.years / 150, 0.5));
    return Math.round(100 * Math.max(0.1, Math.min(4, s))) / 100;
}

// the chart's arrows, weighted where the maps show them
const arrows = {};
for (const b of doc.borrowings || []) {
    const seen = merged.filter((c) => c.a === b.fromId && c.b === b.toId);
    if (!seen.length) continue;
    const best = seen.reduce((x, y) => (strengthOf(y) > strengthOf(x) ? y : x));
    arrows[b.id] = { kind: best.kind, from: best.from, to: best.to, years: best.years, share: Math.round(100 * best.share) / 100, strength: strengthOf(best) };
}

// the long, heavy contacts the chart has no arrow for
const charted = new Set((doc.borrowings || []).map((b) => `${b.fromId}|${b.toId}`));
const veto = Array.isArray(old.veto) ? old.veto : [];
const map = [];
for (const c of merged) {
    // rule only: a map "switch" is as often a border wandering back and forth
    // (both directions between the same two peoples) as a real shift
    if (c.kind !== 'superstrate' || c.years < MAP_YEARS || c.share < MAP_SHARE) continue;
    if (!byId.has(c.a) || !byId.has(c.b)) continue;            // a lost language: no words to lend
    if (rootOf(c.a) === rootOf(c.b)) continue;                   // between families
    if (charted.has(`${c.a}|${c.b}`)) continue;
    const id = `map:${c.kind}:${c.a}:${c.b}:${c.from}`;
    const an = byId.get(c.a).name, bn = byId.get(c.b).name;
    map.push({
        id, fromId: c.a, toId: c.b, kind: c.kind, from: c.from,
        // the words come in once the contact has settled: a third of the way in, at most a century
        year: c.from + Math.min(100, Math.round((c.to - c.from) / 3)),
        until: c.to, share: Math.round(100 * c.share) / 100, strength: strengthOf(c),
        label: `from the map: ${an} rulers over ${bn} speakers, ${c.from}-${c.to} (${Math.round(100 * c.share)}% of their land)`,
        vetoed: veto.includes(id) || undefined,
    });
}
map.sort((x, y) => x.year - y.year || x.id.localeCompare(y.id));

// long borders between families: grammar only, both ways
const BORDER_YEARS = 500, BORDER_KM = 300;
const sides = new Map();
for (const c of contacts) {
    if (c.kind !== 'land' || !byId.has(c.a) || !byId.has(c.b) || rootOf(c.a) === rootOf(c.b)) continue;
    const key = [c.a, c.b].sort().join('|');
    if (!sides.has(key)) sides.set(key, []);
    sides.get(key).push(c);
}
const borders = [];
for (const [key, runs] of sides) {
    const [a, b] = key.split('|');
    runs.sort((x, y) => x.from - y.from);
    let cur = null;
    const flush = () => {
        if (!cur || cur.years < BORDER_YEARS || cur.km < BORDER_KM) return;
        const strength = Math.round(100 * Math.min(3, Math.pow(cur.years / 500, 0.6) * (0.5 + cur.km / 1000))) / 100;
        for (const [x, y] of [[a, b], [b, a]]) {
            const id = `map:areal:${x}:${y}:${cur.from}`;
            borders.push({
                id, fromId: x, toId: y, kind: 'areal', grammarOnly: true, from: cur.from,
                year: cur.from + Math.min(100, Math.round((cur.to - cur.from) / 3)), until: cur.to, borderKm: cur.km, strength,
                label: `from the map: ${byId.get(x).name} beside ${byId.get(y).name}, ${cur.from}-${cur.to} (${cur.km} km of border)`,
                vetoed: veto.includes(id) || undefined,
            });
        }
    };
    for (const r of runs) {
        if (cur && r.from - cur.to <= MERGE_GAP) { cur.to = Math.max(cur.to, r.to); cur.years += r.to - r.from + 10; cur.km = Math.max(cur.km, r.borderKm); }
        else { flush(); cur = { from: r.from, to: r.to, years: r.to - r.from + 10, km: r.borderKm }; }
    }
    flush();
}
borders.sort((x, y) => x.year - y.year || x.id.localeCompare(y.id));

const out = {
    _readme: 'Contact weights from the Through-time maps (scripts/contact-strength.js, rebuilt after each Through-time build). '
        + '"arrows": a strength for each chart arrow the maps confirm (1 = typical, the Norman conquest of England about 3). '
        + `"map": rule the chart has no arrow for, ${MAP_YEARS}+ years over ${100 * MAP_SHARE}%+ of the speakers' land, between families; it lends words like an arrow. `
        + `"borders": borders between families ${BORDER_YEARS}+ years along ${BORDER_KM}+ km; each side's grammar pulls on the other's, no words pass. `
        + '"veto": ids of map contacts to ignore (kept from build to build). A strength set on a chart arrow itself wins.',
    veto,
    arrows,
    map,
    borders,
};
fs.writeFileSync(path.join(root, OUT), JSON.stringify(out, null, 1) + '\n');
const used = map.filter((m) => !m.vetoed);
console.log(`${Object.keys(arrows).length} of ${(doc.borrowings || []).length} chart arrows weighted from the maps; ${used.length} map contacts (${map.length - used.length} vetoed); ${borders.filter((m) => !m.vetoed).length / 2} long borders.`);
const st = Object.values(arrows).map((a) => a.strength).sort((a, b) => a - b);
if (st.length) console.log(`arrow strengths: min ${st[0]}, median ${st[Math.floor(st.length / 2)]}, max ${st[st.length - 1]}`);
