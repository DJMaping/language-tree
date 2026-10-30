/**
 * Which script each language wrote, and when: the script history.
 *
 *   node scripts/build-script-history.js   -> data/history/script-history.json
 *
 * The scripts themselves are built by build-scripts.js; this says who wrote
 * them. A script here is a line (the `line` of a stage: everything that
 * evolves from one taking-up of a script), so Lycroan and Emaran are one
 * script, Ealdorii and Ukhdari one; a change of line is a change of script.
 * Earth's scripts spread four ways, and each is a source of events here,
 * in order of strength:
 *
 *   own        a people's own script stage (the users in build-scripts.js);
 *   rule       the rulers' script, taken under a long rule (the yearly maps'
 *              superstrates, data/cache/years/contacts.json: a hundred years
 *              over a third of the land; Latin under Rome, Chinese under the
 *              Han), and the coloniser's script in a colony (the natives of
 *              a colonised land write as their colonisers do, as Africa
 *              writes Latin: DJ, 30 Oct 2026);
 *   religion   the script the scripture is written in (Arabic with Islam,
 *              Latin with the Church, the Indic scripts with Buddhism), but
 *              only where someone brought it: a ruler, a neighbour or a
 *              fellow official language already writing a script of the
 *              faith carries it, so no script reaches a land its writers
 *              never did (DJ, 30 Oct 2026: Emaran had not been to Massir);
 *              which script each religion carries and when it arose are
 *              DJ's canon (RELIGIONS below);
 *   state      a scripted official language beside it in the same state
 *              (small languages first written in a neighbour's script);
 *   family     the mother's script, following that line's later reforms
 *              (every Romance language writes today's Latin), as strong as
 *              the mother's reason less one step;
 *   neighbour  the longest border with a scripted people, last.
 *
 * Events run in year order. A later event replaces the script in force only
 * when it is at least as strong, less one step: rule replaces religion and
 * an inherited script, religion an inherited one, a neighbour's nothing that
 * was chosen for a reason. Every replacement is a proposed switch, listed in
 * the output for DJ's veto (data/history/script-vetoes.json: [{ lang, year }]
 * strikes one). A language no source reaches stays unwritten (DJ: some do).
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const scripts = read('data/scripts.json');
const doc = read('data/languages.json');
const contact = read('data/history/contact.json');
const frames = read('data/cache/years/frames.json');
const allContacts = read('data/cache/years/contacts.json').contacts;
/**
 * DJ's religion map (andah-atlas), wherever it is on this machine: ANDAH_ATLAS,
 * else Documents/andah-atlas, else where it was first read. Where it is found,
 * the people of each faith per state are kept beside the data
 * (data/canon/religion-map.json), so a copy without the atlas (the laptop)
 * builds the same history. With neither, the history would lose every
 * script a faith carried, so nothing is written (--force writes it anyway).
 */
const ATLAS_FILE = 'data/religion_map_by_state.json';
const atlasAt = [process.env.ANDAH_ATLAS && path.join(process.env.ANDAH_ATLAS, ATLAS_FILE), path.join(os.homedir(), 'Documents', 'andah-atlas', ATLAS_FILE), `C:/Users/danny/Documents/andah-atlas/${ATLAS_FILE}`].filter(Boolean).find((f) => fs.existsSync(f));
const SNAPSHOT = path.join(root, 'data/canon/religion-map.json');
let religionMap;
if (atlasAt) {
    const atlas = JSON.parse(fs.readFileSync(atlasAt, 'utf8'));
    religionMap = { states: Object.fromEntries(Object.entries(atlas.states || {}).filter(([, v]) => v?.people).map(([st, v]) => [st, { people: v.people }])) };
    const snap = { _readme: 'The people of each faith per state, from DJ\'s religion map (andah-atlas data/religion_map_by_state.json), kept by scripts/build-script-history.js for a copy without the atlas. Do not edit: it is rewritten whenever the atlas is found.', ...religionMap };
    const was = fs.existsSync(SNAPSHOT) ? fs.readFileSync(SNAPSHOT, 'utf8') : '';
    const now = `${JSON.stringify(snap, null, 1)}\n`;
    if (was !== now) { fs.writeFileSync(SNAPSHOT, now); console.log(`Religion map: ${atlasAt}, kept in data/canon/religion-map.json.`); }
} else if (fs.existsSync(SNAPSHOT)) {
    religionMap = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
    console.log('Religion map: the copy in data/canon/religion-map.json (no andah-atlas here).');
} else if (process.argv.includes('--force')) {
    religionMap = { states: {} };
    console.warn('Religion map: none found; building without it (--force): no faith carries a script.');
} else {
    console.error('No religion map here: neither andah-atlas (set ANDAH_ATLAS to its folder) nor data/canon/religion-map.json.\nThe history built without it would drop every script a faith carried, so data/history/script-history.json is left as it is.\nRun this once where the atlas is, and commit data/canon/religion-map.json.');
    process.exit(2);
}
const vetoes = fs.existsSync(path.join(root, 'data/history/script-vetoes.json')) ? read('data/history/script-vetoes.json') : [];

/** The seven religions' denominations (memory: religion-taxonomy), and the script each carries (DJ, 29 Oct 2026). */
const DENOMINATION = { Therameth: 'Kallimethra', Anakalli: 'Kallimethra', Doxis: 'Kallimethra', Suyuwira: 'Kallimethra', Kayamuya: 'Kallimethra', Oruun: 'Kelhari', 'Kelhari Veth': 'Kelhari', Thimoruun: 'Kelhari', 'Imarel Suun': 'Imarel', Rhov: 'Imarel', Tavessi: 'Imarel', 'Zovael Karesh': 'Imarel', Selvaeth: 'Imarel', Thurvael: 'Imarel', Vimanu: 'Passanu', 'Passanu Dera': 'Passanu', Anuthipa: 'Passanu', Cuetl: 'Tzinalli', Omitztli: 'Tzinalli', Paramaran: 'Srivandha', Bhavandi: 'Srivandha', 'Karmav Liao': 'Srivandha', Thessovai: 'Thessovai' };
/**
 * Founding years are DJ's (29 Oct 2026); a script follows the faith `lag`
 * years after it, and never before the script exists. `tips` are the script
 * lines a religion carries, by their modern stage: a land takes the one its
 * own ancestors wrote if any, else the one with the longest border, else the
 * first (Imarel carries the Quian letters, each land in the nearest sister,
 * as Buddhism's lands each took their own Indic script).
 */
const RELIGIONS = {
    Tzinalli: { founded: -3000, lag: 150, tips: ['are-mod'], note: 'the Arten glyphs of Areoix Lie' },
    Kallimethra: { founded: -1000, lag: 150, tips: ['ema-mod', 'lyc-mod', 'eald-mod', 'dah-mod'], any: true, note: 'many scripts, as Christianity: whichever script the people who brought the faith wrote' },
    Imarel: { founded: -400, lag: 150, tips: ['mik-mod', 'ash-mod', 'sak-mod', 'kii-mod'], note: 'the Quian letters, each land in the nearest sister' },
    Thessovai: { founded: -300, lag: 150, tips: ['osn-mod', 'cas-mod'], note: 'Osnealan and Casan' },
    Kelhari: { founded: -200, lag: 150, tips: ['ukh-mod', 'eald-mod', 'est-mod', 'acr-mod', 'zen-mod'], note: 'the Alzurian abjad and the scripts grown from it' },
    Srivandha: { founded: 500, lag: 150, tips: ['sak-mod'], note: "the Sakernlesi script, its old rulers'" },
    Passanu: { founded: 500, lag: 150, tips: ['pas-mod'], note: 'the Passonin script' },
};
const STRENGTH = { own: 5, rule: 4, colony: 4, religion: 3, state: 2, family: 1.5, neighbour: 1 };
/** Each language's land by year (km², the commoners' layer of the yearly maps). */
const codeOf = Object.fromEntries(Object.entries(frames.langs).map(([code, l]) => [l.id, code]));
const landOf = (id, from, to) => { const c = codeOf[id]; if (!c) return 0; let best = 0; for (const y of frames.meta.years) { if (y < from || y > to) continue; best = Math.max(best, frames.frames[y]?.common?.[c]?.[4] ?? 0); } return best; };
/**
 * Rules from the yearly maps: runs of one people's rulers over another's
 * speakers, joined across short gaps; a rule counts for a script when it
 * lasted a hundred years over a third of the subjects' land (or 50,000 km²).
 */
const RULES = new Map();   // subject -> [{ruler, from, to, share}]
{
    const runs = allContacts.filter((c) => c.kind === 'superstrate').sort((a, b) => a.from - b.from);
    const byPair = new Map();
    for (const r of runs) { const k = `${r.a}>${r.b}`; const arr = byPair.get(k) || []; const last = arr[arr.length - 1]; if (last && r.from - last.to <= 40) { last.to = Math.max(last.to, r.to); last.areaKm2 = Math.max(last.areaKm2, r.areaKm2); } else arr.push({ ...r }); byPair.set(k, arr); }
    for (const arr of byPair.values()) for (const r of arr) {
        const span = r.to - r.from + 10;
        if (span < 80) continue;
        const land = landOf(r.b, r.from, r.to);
        const share = land ? r.areaKm2 / land : (r.areaKm2 >= 50000 ? 1 : 0);
        if (share < 0.25) continue;
        const list = RULES.get(r.b) || [];
        list.push({ ruler: r.a, from: r.from, to: r.to, share: Math.min(1, share), km2: r.areaKm2 });
        RULES.set(r.b, list);
    }
    // of two rulers over the same people at the same time, the lesser (by land) gives way where the greater covers most of its span
    for (const [b, list] of RULES) {
        const keep = list.filter((r) => !list.some((o) => o !== r && o.km2 > r.km2 && Math.max(0, Math.min(o.to, r.to) - Math.max(o.from, r.from)) >= 0.6 * (r.to - r.from + 10)));
        RULES.set(b, keep.sort((x, y) => x.from - y.from));
    }
}
/**
 * Neighbours: across a land border (contact.json), over a narrow sea (the
 * yearly maps' sea contacts, a hundred years or more), or along a trade
 * lane; each weighed, so a long border outweighs a short crossing. A script
 * crosses water with traders and priests (Arabic reached Malaya and Java).
 */
const NEIGHBOURS = new Map();   // lang -> [{id, weight, from}]
{
    const add = (a, b, weight, from) => { for (const [x, y] of [[a, b], [b, a]]) { const list = NEIGHBOURS.get(x) || []; list.push({ id: y, weight, from }); NEIGHBOURS.set(x, list); } };
    for (const b of contact.borders) add(b.fromId, b.toId, b.borderKm || 0, b.from ?? b.year);
    for (const c of allContacts) {
        if (c.kind === 'sea' && c.frames >= 20) add(c.a, c.b, c.frames * 6, c.from);
        else if (c.kind === 'lane' && c.frames >= 10) add(c.a, c.b, c.frames * 10, c.from);
    }
}
/** Two scripts of one tradition: the one taken up from a stage of the other (Sanagaran from Dahen); a ruler's kindred script unseats nothing. */
const lineChain = (line) => { const out = new Set(); for (let st = stages.get(line); st; st = stages.get(st.parent)) out.add(st.line); return out; };
const kin = (a, b) => a === b || lineChain(a).has(b) || lineChain(b).has(a);
/** What a daughter inherits: her mother's own script as good as her own (a stage of one language, or a branch), else a step weaker. */
const inherited = (at, relation) => (at.reason === 'own' || at.strength >= 4.5 ? (relation === 'stage' ? 5 : 4.5) : Math.max(1, at.strength - 1));

/** When a script line became true writing (its first stage that is not pictures alone): before that it spreads to no one. */
const writingFrom = new Map();
for (const st of scripts.stages) if (st.type !== 'pictographic') writingFrom.set(st.line, Math.min(writingFrom.get(st.line) ?? Infinity, st.year));

/** Colonies: the states where a language is official as a coloniser (languages.json areas role "colonial"). */
const COLONIES = {};   // state -> [coloniser language ids]
for (const l of doc.languages) for (const a of (l.areas || [])) if (a.role === 'colonial') (COLONIES[a.state] = COLONIES[a.state] || []).push(l.id);

const by = new Map(doc.languages.map((l) => [l.id, l]));
const stages = new Map(scripts.stages.map((s) => [s.id, s]));
const kidsOf = new Map(); for (const s of scripts.stages) { if (!kidsOf.has(s.parent)) kidsOf.set(s.parent, []); kidsOf.get(s.parent).push(s); }
/** The modern stage down a stage's own branch: the child its users or their daughters write, else the first. */
const tipOf = (stageId) => { const s = stages.get(stageId); const kids = kidsOf.get(stageId) || []; if (!kids.length) return stageId; const same = kids.find((k) => s.users.some((u) => k.users.some((v) => v.lang === u.lang || by.get(v.lang)?.parentId === u.lang))) || kids[0]; return tipOf(same.id); };
const lineRoot = (stageId) => stages.get(stageId).line;
const ownEvents = new Map();   // lang -> [{year, line, tip, stage}]
for (const s of scripts.stages) for (const u of s.users) { const arr = ownEvents.get(u.lang) || []; arr.push({ year: u.from, line: lineRoot(s.id), tip: tipOf(s.id), stage: s.id }); ownEvents.set(u.lang, arr); }
/** Who writes a line (the users of every stage on it), for borders. */
const writersOfLine = new Map();
for (const s of scripts.stages) { const set = writersOfLine.get(s.line) || new Set(); for (const u of s.users) set.add(u.lang); writersOfLine.set(s.line, set); }
const ancestors = (id) => { const out = []; for (let x = by.get(id), n = 0; x && n < 40; x = by.get(x.parentId), n++) out.push(x.id); return out; };

const statesOf = (l) => [...new Set([...(l.areas || []).filter((a) => a.role === 'official' || a.role === 'colonial').map((a) => a.state), ...(l.mapAreas || []).filter((a) => a.role === 'majority' && (a.share ?? 1) >= 0.3).map((a) => a.state)])];
const religionOf = (state) => { const v = religionMap.states[state]; if (!v) return null; const sh = {}; for (const [den, x] of Object.entries(v.people || {})) { const f = DENOMINATION[den]; if (f) sh[f] = (sh[f] || 0) + x; } return Object.entries(sh).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null; };
const borderWith = (l, langIds) => contact.borders.filter((b) => (b.toId === l.id && langIds.has(b.fromId)) || (b.fromId === l.id && langIds.has(b.toId))).reduce((n, b) => n + (b.borderKm || 0), 0);
const firstYear = (line) => stages.get(line).year;

let history = {};
let switches = [];
let faithsOf = {};
let prev = {};
const order = [...doc.languages].sort((a, b) => (a.born ?? -9999) - (b.born ?? -9999));
const scriptAt = (id, year) => { const ev = (history[id] || prev[id] || []).filter((e) => e.year <= year); return ev.length ? ev[ev.length - 1] : null; };

// three passes: a people's rulers, carriers and colonisers may be younger than it, and are read from the pass before
for (let pass = 0; pass < 3; pass++) {
prev = history; history = {}; switches = []; faithsOf = {};
for (const l of order) {
    const born = l.born ?? -9999, died = l.died ?? 1765;
    const events = [];
    const own = ownEvents.get(l.id) || [];
    for (const e of own) events.push({ year: e.year, line: e.line, tip: e.tip, reason: 'own', strength: STRENGTH.own });
    // family: the mother's script at the daughter's birth, and the mother's later switches while the daughter lives
    const parent = by.get(l.parentId);
    if (parent) {
        const at = scriptAt(parent.id, born);
        if (at) events.push({ year: born, line: at.line, tip: at.tip, reason: 'family', via: at.reason === 'family' ? at.via : parent.id, strength: inherited(at, l.relation) });
        for (const e of history[parent.id] || prev[parent.id] || []) if (e.year > born && e.year <= died && (e.reason === 'own' || e.strength >= 4.5)) events.push({ year: e.year, line: e.line, tip: e.tip, reason: 'family', via: e.reason === 'family' ? e.via : parent.id, strength: inherited(e, l.relation) });
    }
    // rule: a long rule by a scripted people (the yearly maps), whose script they chose for a reason of their own
    for (const r of RULES.get(l.id) || []) {
        const year = Math.max(born, r.from + 60);
        if (year > r.to || year > died) continue;
        const rulers = scriptAt(r.ruler, year);
        if (rulers && rulers.strength >= STRENGTH.religion) events.push({ year, line: rulers.line, tip: rulers.tip, reason: 'rule', via: r.ruler, strength: STRENGTH.rule, share: r.share });
    }
    // colony: the natives of a colonised land, with no script of their own, write as the colonisers do
    const states = statesOf(l);
    const colonyStates = [...new Set([...states, ...(l.mapAreas || []).filter((a) => a.role === 'majority' && (a.share ?? 1) >= 0.2).map((a) => a.state)])];
    if (!(ownEvents.get(l.id) || []).length) for (const st of colonyStates) for (const col of COLONIES[st] || []) {
        if (col === l.id) continue;
        const first = (RULES.get(l.id) || []).find((r) => r.ruler === col || by.get(r.ruler)?.parentId === col)?.from ?? 1500;
        const year = Math.max(born, first + 30);
        const theirs = scriptAt(col, year);
        if (theirs && year <= died) events.push({ year, line: theirs.line, tip: theirs.tip, reason: 'colony', via: col, strength: STRENGTH.colony });
    }
    // religion: the faith of its lands, a lag after the faith arose, in the script someone brought with it
    const faiths = {};
    for (const st of states) { const f = religionOf(st); if (f) faiths[f] = (faiths[f] || 0) + 1; }
    const faith = Object.entries(faiths).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (faith && RELIGIONS[faith]) {
        const R = RELIGIONS[faith];
        const lineOfTip = (t) => stages.get(t)?.line;
        const faithLines = new Set(R.tips.map(lineOfTip).filter(Boolean));
        const carries = (line) => (R.any ? true : faithLines.has(line));
        const year0 = Math.max(born, R.founded + R.lag);
        // the carriers: rulers first, then the neighbours by the border, then a fellow official language; each must write a script of the faith by then
        const carriers = [];
        for (const r of RULES.get(l.id) || []) if (r.to >= year0 - 100) carriers.push({ id: r.ruler, weight: 1e6 + r.share * 1000, when: Math.max(year0, r.from + 30) });
        for (const n of NEIGHBOURS.get(l.id) || []) carriers.push({ id: n.id, weight: n.weight, when: Math.max(year0, (n.from ?? year0) + 50) });
        for (const st of states) for (const o of doc.languages) if (o.id !== l.id && (o.areas || []).some((a) => a.state === st && a.role === 'official')) carriers.push({ id: o.id, weight: 500, when: year0 });
        // the earliest carrier that writes a script of the faith by then; the weightiest where several come at once
        const able = [];
        for (const c of carriers) {
            if (c.when > died) continue;
            const at = scriptAt(c.id, c.when);
            if (at && carries(at.line)) able.push({ ...at, when: c.when, carrier: c.id, weight: c.weight });
            else {
                // a carrier that writes such a script only later brings it then
                const later = (history[c.id] || []).find((e) => e.year > c.when && carries(e.line));
                if (later && later.year <= died) able.push({ ...later, when: later.year + 30, carrier: c.id, weight: c.weight });
            }
        }
        able.sort((x, y) => (Math.abs(x.when - y.when) <= 30 ? y.weight - x.weight : x.when - y.when));
        const chosen = able[0] || null;
        // a people about to write a script of its own needs no faith to bring it one
        const ownSoon = own.some((e) => e.year >= year0 && e.year - year0 < 300);
        if (chosen && !ownSoon) events.push({ year: chosen.when, line: chosen.line, tip: chosen.tip, reason: 'religion', via: faith, carrier: chosen.carrier, strength: STRENGTH.religion });
        // the faith itself, for its words (js/engine/lexicon/faith.js): when someone who held it reached the people, else a lag after it arose
        const took = chosen ? chosen.when : year0;
        if (took <= died) faithsOf[l.id] = { faith, year: took, ...(chosen ? { carrier: chosen.carrier } : {}) };
    }
    // state: a language official somewhere, beside a fellow official language there that writes for a reason of its own, by 1650
    if ((l.areas || []).some((a) => a.role === 'official')) {
        let best = null;
        for (const st of (l.areas || []).filter((a) => a.role === 'official').map((a) => a.state)) for (const o of doc.languages) {
            if (o.id === l.id || !(o.areas || []).some((a) => a.state === st && a.role === 'official')) continue;
            const at = scriptAt(o.id, 1650);
            if (at && at.strength >= STRENGTH.religion && (!best || at.strength > best.strength)) best = { ...at, via: o.id };
        }
        if (best && 1650 <= died) events.push({ year: Math.max(born, 1650), line: best.line, tip: best.tip, reason: 'state', via: best.via, strength: STRENGTH.state });
    }
    // neighbour: the longest border with a scripted people
    let bestKm = 0, bestEv = null;
    for (const n of NEIGHBOURS.get(l.id) || []) {
        if (n.weight < 400) continue;
        const year = Math.max(born, (n.from ?? born) + 100);
        if (year > died) continue;
        const at = scriptAt(n.id, year);
        if (at && at.strength >= STRENGTH.state && n.weight > bestKm) { bestKm = n.weight; bestEv = { year, line: at.line, tip: at.tip, reason: 'neighbour', via: n.id, strength: STRENGTH.neighbour }; }
    }
    if (bestEv) events.push(bestEv);
    // resolve in year order: a stronger source replaces, a weaker one does not; a veto strikes a switch
    for (const e of events) if (e.reason !== 'own') e.year = Math.max(e.year, writingFrom.get(e.line) ?? e.year);
    const live = events.filter((e) => e.year <= died);
    live.sort((a, b) => a.year - b.year || b.strength - a.strength || (b.share ?? 0) - (a.share ?? 0));
    const timeline = [];
    for (const [i, e] of live.entries()) {
        if (e.reason === 'rule' && i > 0 && live[i - 1].reason === 'rule' && live[i - 1].year === e.year && live[i - 1].line !== e.line) continue;
        const cur = timeline[timeline.length - 1];
        // the same script for a stronger reason: the reason is upgraded, nothing switches
        // (the same year: the reason is the stronger one; a later year: the script keeps the reason and year it came by, and the later
        // reason is noted as holding it, so a script inherited in 2000 BFA is not dated as a faith's that arose in 1000 BFA)
        if (cur && cur.line === e.line) {
            if (e.strength > cur.strength) {
                if (e.year === cur.year) { cur.reason = e.reason; cur.via = e.via; cur.tip = e.tip; }
                else cur.heldBy = { reason: e.reason, via: e.via, year: e.year, ...(e.carrier ? { carrier: e.carrier } : {}) };
                cur.strength = e.strength;
            }
            continue;
        }
        // what it takes to replace the script in force: a faith does not unseat a people's own tradition or its mother's,
        // a neighbour unseats only a script that came by no better road than another neighbour's
        // a move back to an older form of the script in force is no move (a ruler's kindred script unseats nothing);
        // a script grown from the one in force may take over, as Arabic took over from Nabataean among the Arabs
        if (cur && e.reason !== 'own' && lineChain(cur.line).has(e.line)) continue;
        if (cur) {
            const need = cur.reason === 'own' ? (e.reason === 'own' ? 0 : Infinity)
                : e.reason === 'neighbour' ? (cur.strength <= 1.5 ? 0 : Infinity)
                : e.reason === 'religion' ? cur.strength - 0.5
                : cur.strength;
            if (e.strength < need) continue;
        }
        if (cur && vetoes.some((v) => v.lang === l.id && v.year === e.year)) continue;
        if (cur) switches.push({ lang: l.id, name: l.name, year: e.year, from: cur.line, to: e.line, fromTip: cur.tip, toTip: e.tip, reason: e.reason, via: e.via, carrier: e.carrier });
        const entry = { year: e.year, line: e.line, tip: e.tip, reason: e.reason, via: e.via, ...(e.carrier ? { carrier: e.carrier } : {}), strength: e.strength };
        timeline.push(entry);
    }
    if (timeline.length) history[l.id] = timeline;
}
}

const living = doc.languages.filter((l) => l.died == null && !l.reconstructed);
const unwritten = living.filter((l) => !history[l.id]).map((l) => l.id);
/**
 * The stages as the map needs them (no glyphs: id, name, parent, year, line,
 * users), and the lines: each script's root invention, its first year and a
 * label from its modern stages ("Ealdorii / Ukhdari script"), so the map can
 * colour kindred scripts alike and name them.
 */
const stageIndex = scripts.stages.map((s) => ({ id: s.id, name: s.name, parent: s.parent, year: s.year, line: s.line, type: s.type, direction: s.direction, ductus: s.ductus, users: s.users }));
const rootOf = (id) => { let s = stages.get(id); while (s && stages.get(s.parent)) s = stages.get(s.parent); return s?.id ?? id; };
const lines = {};
for (const s of scripts.stages) {
    if (lines[s.line]) continue;
    const tips = scripts.stages.filter((x) => x.line === s.line && !(kidsOf.get(x.id) || []).some((k) => k.line === s.line));
    const names = tips.map((t) => t.name.replace(/ script( in print)?$/, '').replace(/^(Modern|Simplified) /, ''));
    const allScripts = tips.every((t) => / script( in print)?$/.test(t.name));
    lines[s.line] = { name: stages.get(s.line).name, label: allScripts ? `${names.join(' / ')} script` : names.join(' / '), root: rootOf(s.line), year: stages.get(s.line).year, tips: tips.map((t) => t.id) };
}
const out = {
    _readme: 'Which script each language wrote and when (scripts/build-script-history.js): per language, dated events, each a script line (the stage where it was taken up) with the modern stage down its branch (tip), the reason (own, rule, religion, state, family, neighbour), whose script it was (via) and how strong the reason; the stage in force in a year is found along the line (use.js stageInForce). Switches are the replacements proposed for DJ\u2019s veto (data/history/script-vetoes.json). Religion dates are DJ\u2019s (29 Oct 2026).',
    generatedAt: new Date().toISOString(),
    religions: RELIGIONS,
    // each language's faith and the year it took it up (the faith of its lands; lexicon/faith.js takes its words from it)
    faiths: faithsOf,
    languages: history,
    switches,
    unwritten,
    stages: stageIndex,
    lines,
};
fs.writeFileSync(path.join(root, 'data/history/script-history.json'), JSON.stringify(out));
const byReason = {};
for (const ev of Object.values(history)) byReason[ev[ev.length - 1].reason] = (byReason[ev[ev.length - 1].reason] || 0) + 1;
console.log(`Wrote data/history/script-history.json: ${Object.keys(history).length} languages written (by last reason ${JSON.stringify(byReason)}), ${switches.length} switches proposed, ${unwritten.length} living languages unwritten.`);
