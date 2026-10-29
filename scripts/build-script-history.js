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
 *   rule       the rulers' script, taken under a long rule (contact.json
 *              superstrates: Latin under Rome, Chinese under the Han);
 *   religion   the script the scripture is written in (Arabic with Islam,
 *              Latin with the Church, the Indic scripts with Buddhism); which
 *              script each religion carries and when it arose are DJ's
 *              canon (RELIGIONS below);
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
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const scripts = read('data/scripts.json');
const doc = read('data/languages.json');
const contact = read('data/history/contact.json');
const RELIGION_MAP = 'C:/Users/danny/Documents/andah-atlas/data/religion_map_by_state.json';
const religionMap = fs.existsSync(RELIGION_MAP) ? JSON.parse(fs.readFileSync(RELIGION_MAP, 'utf8')) : { states: {} };
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
    Kallimethra: { founded: -1000, lag: 150, tips: ['ema-mod'], note: 'many scripts, as Christianity; the Emaran alphabet where a land has none' },
    Imarel: { founded: -400, lag: 150, tips: ['mik-mod', 'ash-mod', 'sak-mod', 'kii-mod'], note: 'the Quian letters, each land in the nearest sister' },
    Thessovai: { founded: -300, lag: 150, tips: ['osn-mod', 'cas-mod'], note: 'Osnealan and Casan' },
    Kelhari: { founded: -200, lag: 150, tips: ['ukh-mod', 'eald-mod', 'est-mod'], note: 'the Alzurian abjad' },
    Srivandha: { founded: 500, lag: 150, tips: ['sak-mod'], note: "the Sakernlesi script, its old rulers'" },
    Passanu: { founded: 500, lag: 150, tips: ['pas-mod'], note: 'the Passonin script' },
};
const STRENGTH = { own: 5, rule: 4, religion: 3, state: 2, family: 1.5, neighbour: 1 };

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

const history = {};
const switches = [];
const order = [...doc.languages].sort((a, b) => (a.born ?? -9999) - (b.born ?? -9999));
const scriptAt = (id, year) => { const ev = (history[id] || []).filter((e) => e.year <= year); return ev.length ? ev[ev.length - 1] : null; };

for (const l of order) {
    const born = l.born ?? -9999, died = l.died ?? 1765;
    const events = [];
    const own = ownEvents.get(l.id) || [];
    for (const e of own) events.push({ year: e.year, line: e.line, tip: e.tip, reason: 'own', strength: STRENGTH.own });
    // family: the mother's script at the daughter's birth, and the mother's later switches while the daughter lives
    const parent = by.get(l.parentId);
    if (parent) {
        const at = scriptAt(parent.id, born);
        if (at) events.push({ year: born, line: at.line, tip: at.tip, reason: 'family', via: at.reason === 'family' ? at.via : parent.id, strength: Math.max(1, at.strength - 1) });
        for (const e of history[parent.id] || []) if (e.year > born && e.year <= died) events.push({ year: e.year, line: e.line, tip: e.tip, reason: 'family', via: e.reason === 'family' ? e.via : parent.id, strength: Math.max(1, e.strength - 1) });
    }
    // rule: a long rule by a scripted people, whose script they chose for a reason of their own
    for (const m of contact.map) {
        if (m.toId !== l.id || m.kind !== 'superstrate') continue;
        const until = m.until ?? m.year;
        if (until - m.from < 100 || (m.share ?? 0) < 0.25) continue;
        const year = Math.max(born, m.from + 60);
        if (year > until || year > died) continue;
        const rulers = scriptAt(m.fromId, year);
        if (rulers && rulers.strength >= STRENGTH.religion) events.push({ year, line: rulers.line, tip: rulers.tip, reason: 'rule', via: m.fromId, strength: STRENGTH.rule });
    }
    // religion: the faith of its lands, a lag after the faith arose, in the line its own kin write if they write one of the faith's
    const states = statesOf(l);
    const faiths = {};
    for (const st of states) { const f = religionOf(st); if (f) faiths[f] = (faiths[f] || 0) + 1; }
    const faith = Object.entries(faiths).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (faith && RELIGIONS[faith]) {
        const R = RELIGIONS[faith];
        const lineOfTip = (t) => stages.get(t)?.line;
        // the line its own kin write, the nearest kin first
        let tip = own.find((e) => R.tips.some((t) => lineOfTip(t) === e.line))?.tip;
        for (const k of ancestors(l.id)) { if (tip) break; tip = R.tips.find((t) => (writersOfLine.get(lineOfTip(t)) || new Set()).has(k)); }
        if (!tip && R.tips.length > 1) { let best = 0; for (const t of R.tips) { const km = borderWith(l, writersOfLine.get(lineOfTip(t)) || new Set()); if (km > best) { best = km; tip = t; } } }
        tip = tip ?? R.tips[0];
        const line = lineOfTip(tip);
        if (line) {
            const year = Math.max(born, R.founded + R.lag, firstYear(line));
            // a people about to write a script of its own needs no faith to bring it one
            const ownSoon = own.some((e) => e.year >= year && e.year - year < 300);
            if (year <= died && !ownSoon) events.push({ year, line, tip, reason: 'religion', via: faith, strength: STRENGTH.religion });
        }
    }
    // state: a scripted official language beside it, by 1650
    for (const st of states) for (const o of doc.languages) {
        if (o.id === l.id || !(o.areas || []).some((a) => a.state === st && a.role === 'official')) continue;
        const at = scriptAt(o.id, 1650);
        if (at && at.strength >= STRENGTH.state) { events.push({ year: Math.max(born, 1650), line: at.line, tip: at.tip, reason: 'state', via: o.id, strength: STRENGTH.state }); break; }
    }
    // neighbour: the longest border with a scripted people
    let bestKm = 0, bestEv = null;
    for (const b of contact.borders) {
        const other = b.toId === l.id ? b.fromId : b.fromId === l.id ? b.toId : null;
        if (!other || (b.borderKm || 0) < 400) continue;
        const year = Math.max(born, (b.from ?? b.year) + 100);
        if (year > died) continue;
        const at = scriptAt(other, year);
        if (at && at.strength >= STRENGTH.state && b.borderKm > bestKm) { bestKm = b.borderKm; bestEv = { year, line: at.line, tip: at.tip, reason: 'neighbour', via: other, strength: STRENGTH.neighbour }; }
    }
    if (bestEv) events.push(bestEv);
    // resolve in year order: a stronger source replaces, a weaker one does not; a veto strikes a switch
    events.sort((a, b) => a.year - b.year || b.strength - a.strength);
    const timeline = [];
    for (const e of events) {
        const cur = timeline[timeline.length - 1];
        // the same script for a stronger reason: the reason is upgraded, nothing switches
        if (cur && cur.line === e.line) { if (e.strength > cur.strength) { cur.reason = e.reason; cur.via = e.via; cur.strength = e.strength; cur.tip = e.tip; } continue; }
        // what it takes to replace the script in force: a faith does not unseat a people's own tradition or its mother's,
        // a neighbour unseats only a script that came by no better road than another neighbour's
        if (cur) {
            const need = e.reason === 'religion' ? cur.strength - 0.5 : e.reason === 'neighbour' ? (cur.strength <= 1.5 ? 0 : Infinity) : cur.strength - 1;
            if (e.strength < need) continue;
        }
        if (cur && vetoes.some((v) => v.lang === l.id && v.year === e.year)) continue;
        if (cur) switches.push({ lang: l.id, name: l.name, year: e.year, from: cur.line, to: e.line, fromTip: cur.tip, toTip: e.tip, reason: e.reason, via: e.via });
        timeline.push({ year: e.year, line: e.line, tip: e.tip, reason: e.reason, via: e.via, strength: e.strength });
    }
    if (timeline.length) history[l.id] = timeline;
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
