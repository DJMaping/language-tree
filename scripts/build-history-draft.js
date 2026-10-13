/**
 * Phase 5: the history DRAFT, for DJ to approve before any of it reaches the
 * chart or the engine.
 *
 *   node scripts/build-history-draft.js
 *
 * Writes docs/history-draft.md (to read) and data/history-draft.json (the same
 * proposals as data, ready to apply once approved). Changes nothing else.
 *
 * Three canon sources, every item cited:
 *   - 37 dated events from the wiki that touch languages (conquests,
 *     occupations, settlements, substrates, scripts), each quoted from a named
 *     page by the history investigation of 13 Oct and spot-checked;
 *   - the wars with their infobox dates (Backstab, Etirhan and Laseltshen
 *     Independence, Great Imperial, Red);
 *   - the 116 colonial ties of DJ's Colonial Assignments artifact (colony,
 *     power, year of independence).
 * Each is mapped onto the tree as it stands: which language was alive at that
 * date on each side, or why none was (a date conflict, or a language the
 * chart does not have), and what effect is proposed, with its Earth pattern.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const doc = read('data/languages.json');
const atlas = read('data/canon/people-atlas-languages.json');
const colonial = read('data/canon/colonial-ties.json');
const L = doc.languages;
const byId = new Map(L.map((l) => [l.id, l]));
const norm = (s) => String(s).normalize('NFKD').toLowerCase().replace(/[^a-z]/g, '');
const byName = new Map(L.map((l) => [norm(l.name), l]));
const kids = new Map();
for (const l of L) if (l.parentId) { if (!kids.has(l.parentId)) kids.set(l.parentId, []); kids.get(l.parentId).push(l); }
const PRESENT = doc.config.presentYear;
const endOf = (l) => {
    if (l.died != null) return l.died;
    const ks = kids.get(l.id) || [];
    const st = ks.find((k) => k.relation === 'stage');
    if (st) return st.born;
    if (l.diverged && ks.length) return Math.max(...ks.map((k) => k.born));
    return PRESENT;
};
const yearLabel = (y) => (y < 0 ? `${-y} BFA` : `${y} AFA`);

/** The stage of a named lineage that was alive in year y. */
function aliveStage(name, y) {
    let l = byName.get(norm(name));
    if (!l) return { status: 'missing' };
    while (l.relation === 'stage' && byId.get(l.parentId)) l = byId.get(l.parentId);
    for (let cur = l; cur; cur = (kids.get(cur.id) || []).find((k) => k.relation === 'stage')) {
        if (y >= cur.born && y <= endOf(cur)) return { status: 'ok', id: cur.id, name: cur.name };
    }
    return { status: 'not alive', born: l.born, end: endOf(l), id: l.id, name: l.name };
}

// [label, wiki page, year, kind, donor, recipients, proposed effect]
const EVENTS = [
    ['Ukhdari conquest of Alzuria (Golden the Great)', 'Alzuria (region)', -556, 'superstrate', 'Proto-Ukhdari', ['Ancient Kaalsite', 'Classical Ealdorii'], 'heavy: a conqueror that stayed, as Norman French in English'],
    ['Ukardarian occupation of Areoix Lie', 'Timeline of Arten history', -480, 'superstrate', 'Classical Ukhdari', ['Ancient Bayudaiar'], 'light: administrative words'],
    ['Unwosian river name borrowed into Kaalsite', 'Tusil River', -1000, 'substrate', 'Unwosian', ['Ancient Kaalsite'], 'substrate: river and place names, as Celtic names in England'],
    ['Old Aiisaran source of Ancient Kaalsite Tosal', 'Tusil River', -1000, 'loan', 'Aiisaran', ['Ancient Kaalsite'], 'single loans'],
    ['Carth river word in Vestorian and Hadan', 'Elishara River', 0, 'substrate', 'Carth', ['Vestorian', 'Hadan'], 'substrate: river names'],
    ['Carth tribes before the Ecossian settlement of Emara', 'Emara', -450, 'substrate', 'Carth', ['Ecossian'], 'substrate: place names and a few rural words'],
    ['Vestorian conquest of Emara (1st century BFA)', 'Emara', -50, 'superstrate', 'Vestorian', ['Ecossian'], 'heavy, or a language shift (as Latin in Gaul): DJ to choose'],
    ['Vestorian annexation of Ilicuhe (mid 1st century BFA)', 'Ilicuhe', -50, 'superstrate', 'Vestorian', ['Classical Easuhuran'], 'medium'],
    ['Nasucisan settlement of Ecossi', 'Easuhura', -900, 'split', 'Nasucisan', ['Ecossian'], 'a new branch: the settlers\' language is the parent of Ecossian'],
    ['Ealdorii annexation of Hkuqo (2nd century BFA)', 'Hkuqo', -150, 'superstrate', 'Classical Ealdorii', ['Threch'], 'medium'],
    ['First Ealdorii Empire over Alzuria (c. 180 BFA)', 'Alzuria (region)', -180, 'superstrate', 'Classical Ealdorii', ['Ancient Kaalsite', 'Classical Ukhdari'], 'medium: an empire of related languages, so heavy borrowing is cheap'],
    ['Arten Empire of Des Abres in Alzuria (215-78 BFA)', 'Timeline of Arten history', -200, 'superstrate', 'Arten', ['Classical Ealdorii'], 'medium: 137 years of rule'],
    ['Dehlan subjugation of the Jathian tribes', 'Dahe', -200, 'superstrate', 'Upper Dahen', ['North Jathian', 'South Jathian'], 'shift: the Jathian languages give way, leaving a substrate in Dahen'],
    ['Dahen script standardised (Dehlan, 207 BFA)', 'Dahe', -207, 'standardisation', null, ['Middle Dahen'], 'Dahen-Kino standardisedAt -207 instead of the placeholder 700'],
    ['Dahen bone script attested c. 1400 BFA', 'Dahe', -1400, 'attestation', null, ['Old Dahen'], 'Old Dahen attested, not reconstructed'],
    ['Almaglean Empire over Areoix Lie (189-522)', 'Almaglean Empire', 300, 'superstrate', 'Almaglean', ['Old Bayudaiar'], 'heavy: 333 years'],
    ['Pha-Li campaigns into Kaastini (249-375)', 'Dahe', 300, 'superstrate', 'Dahen', ['Cutrans'], 'medium'],
    ['Escaran conquest of Easuhura (524)', 'Easuhura', 524, 'superstrate', 'Escaran', ['Old Easuhuran'], 'heavy or little trace: DJ to choose'],
    ['Yethran conquest of Alzuria (7th century)', 'Alzuria (region)', 650, 'superstrate', 'Yethran', ['Middle Ealdorii', 'Old Ukhdari', 'Old Kaalsite'], 'heavy: as Arabic over the Near East'],
    ['Uvei adopts the Yethran ____ (842)', 'Estijan', 842, 'superstrate', 'Yethran', ['Old Estijan'], 'learned: the blank on the page is what Uvei adopted (a script or a faith?)'],
    ['Alqir Empire controls Hkuqo (3rd-8th century)', 'Hkuqo', 780, 'superstrate', 'Evhalis Alqiran', ['West Yaela'], 'heavy: five centuries'],
    ['Kaastinial conquest of Dahe (from 1050)', 'Dahe', 1050, 'superstrate', 'Kaastini', ['Dahen', 'Fekunza Dahen'], 'conqueror shift: little trace, as the Manchu in China'],
    ['Kaastinial invasion of Areoix Lie (1087-1090)', 'Timeline of Arten history', 1087, 'loan', 'Kaastini', ['Middle Bayudaiar'], 'little trace: three years'],
    ['Kaastini invasion of Alzuria fragments the Alqir empire', 'Hkuqo', 1100, 'superstrate', 'Kaastini', ['Hkuqoan', 'Evhalis Alqiran', 'Middle Ealdorii'], 'light'],
    ['Dahen community in Chayek, Easuhura (1200s)', 'Demographics of the Easuhura', 1250, 'loan', 'Fekunza Dahen', ['Early Modern Easuhuran'], 'light: food and trade words'],
    ['Emaran Renaissance under Lycroan rule (14th century)', 'Emara', 1350, 'superstrate', 'Middle Lycroan', ['Middle Emaran'], 'medium: prestige and learned words'],
    ['Tavalan colonisation of New Ayre (1333-1585)', 'Taval', 1333, 'colonisation', 'Alqiran', ['Iainoan'], 'colonial: Alqiran spreads; Iainoan takes loans and loses ground'],
    ['Tavalan discovery and first settlement of Atirha (1240, Peka)', 'Etirha', 1240, 'colonisation', 'Evhalis Alqiran', [], 'colonial: an Alqiran variety in Atirha'],
    ['Estijan Huan makes Danocia a tributary (1519)', 'Danocia', 1519, 'superstrate', 'Estijan', ['Danocian', 'Koruchi'], 'medium'],
    ['Estijan Huan conquers Ikzen after the Treaty of Brimasha (1556)', 'Ikzen', 1556, 'superstrate', 'Estijan', ['Seljan', 'Ikzen'], 'heavy: Estijan rule until 1741'],
    ['Seniaaii occupation of Emara (1532-1556)', 'Gaeiya', 1540, 'loan', 'Seniaaii', ['Emaran'], 'little trace: 24 years'],
    ['Dahlii conquest of the Baleens', 'Dahe', 1400, 'superstrate', 'Standard Dahen', ['Baleen'], 'shift: Baleen gives way'],
    ['Atirhan Dahen creole (Standard Dahen and Emaran)', 'the chart', 1590, 'creole', 'Emaran', ['Atirhan Dahen'], 'creole: which parent is the lexifier is DJ\'s call'],
    ['Dahe invades and occupies Kaastini (1681)', 'Dahe', 1681, 'superstrate', 'Standard Dahen', ['Kaastini'], 'medium'],
    ['Treaty of Freedom occupation sectors of Dahe (1695-1700)', 'Dahe', 1696, 'loan', 'Easuhuran', ['Standard Dahen'], 'little trace: five years'],
    ['Treaty of Freedom occupation sectors of Dahe (1695-1700)', 'Dahe', 1696, 'loan', 'Ersuckl', ['Standard Dahen'], 'little trace: five years'],
    ['Collapse of the Huan (1740): Estijan loses its standing in Ealdorii', 'Ealdorii', 1740, 'status', 'Estijan', ['Ealdorii'], 'Estijan stops being a prestige donor to Ealdorii'],
];

const WARS = [
    ['Backstab War', 'Backstab War', 1654, 1655, 'East Atirha, the Mii lands'],
    ['Etirhan Independence War', 'Etirhan Independence War', 1641, 1647, 'Etirha'],
    ['Laseltshen Independence War', 'Laseltshen Independence War', 1644, 1647, 'Eastern Atirha'],
    ['Great Imperial War', 'Great Imperial War', 1661, 1666, 'Lasen Powers victory'],
    ['Red War', 'Red War', 1688, 1695, 'Accord against Vanguards; Dahe, Lycroa and Alzuria occupied'],
];

// ---------------------------------------------------------------- events
const contacts = [];
const missing = new Map();
const conflicts = [];
const events = EVENTS.map(([label, page, year, kind, donor, recipients, effect]) => {
    const d = donor ? aliveStage(donor, year) : null;
    if (d?.status === 'missing') missing.set(donor, [...(missing.get(donor) || []), label]);
    if (d?.status === 'not alive') conflicts.push({ language: donor, born: d.born, end: d.end, year, label, page });
    const recs = recipients.map((r) => {
        const s = aliveStage(r, year);
        if (s.status === 'missing') missing.set(r, [...(missing.get(r) || []), label]);
        if (s.status === 'not alive') conflicts.push({ language: r, born: s.born, end: s.end, year, label, page });
        return { name: r, ...s };
    });
    for (const r of recs) {
        if (!d || d.status !== 'ok' || r.status !== 'ok') continue;
        if (!['superstrate', 'substrate', 'loan'].includes(kind)) continue;
        contacts.push({ fromId: d.id, toId: r.id, year, kind, label, page, effect, ready: true });
    }
    return { label, page, year, kind, donor, donorNode: d, recipients: recs, effect };
});

// ---------------------------------------------------------------- colonial ties
const S = atlas.states;
const mapFamily = (st) => { const fs_ = S[st]?.fs || {}; return Object.keys(fs_).sort((a, b) => fs_[b] - fs_[a])[0]; };
const officialOf = (st) => L.filter((l) => (l.areas || []).some((a) => a.state === st && a.role === 'official'));
/**
 * Colonial contact starts 150 years before independence (DJ, 13 Oct 2026),
 * a placeholder until DJ gives start dates: the ties record only the year a
 * colony left.
 */
const COLONIAL_SPAN = 150;
const colonies = colonial.pairs.map(([colony, power, independence]) => {
    const powerLangs = officialOf(power).filter((l) => l.kind !== 'constructed');
    const colonialHere = L.filter((l) => (l.areas || []).some((a) => a.state === colony && a.role === 'colonial'));
    const native = officialOf(colony).filter((l) => !powerLangs.includes(l) && l.kind !== 'constructed');
    const donor = powerLangs.sort((a, b) => (b.speakers?.l1 ?? 0) - (a.speakers?.l1 ?? 0))[0];
    const sameFamily = mapFamily(colony) === mapFamily(power);
    const start = independence - COLONIAL_SPAN;
    if (donor) {
        for (const n of native) {
            const d = aliveStage(donor.name, start), r = aliveStage(n.name, start);
            if (d.status === 'ok' && r.status === 'ok') {
                contacts.push({
                    fromId: d.id, toId: r.id, year: start, kind: 'superstrate', colonial: true,
                    label: `${power} rule of ${colony} until ${independence} (start a placeholder: ${COLONIAL_SPAN} years before)`,
                    page: 'Colonial Assignments', effect: 'colonial superstrate', ready: true,
                });
            }
        }
    }
    return {
        colony, power, independence, start,
        powerLanguage: donor?.name ?? null,
        stillOfficial: colonialHere.map((l) => l.name),
        nativeLanguages: native.map((l) => l.name),
        sameFamily,
        proposal: !donor ? 'the power has no official language in the chart'
            : colonialHere.some((l) => l.id === donor.id) ? `${donor.name} stayed official: a colonial variety of it, and a superstrate on ${native.map((l) => l.name).join(', ') || 'the majority language'}`
                : `${donor.name} loanwords into ${native.map((l) => l.name).join(', ') || 'the majority language'} until ${independence}`,
    };
});

// ---------------------------------------------------------------- write
const QUESTIONS = [
    'Colonial rule: the ties give the year of independence but not when rule began. Should colonial contact start a fixed span before independence (say 150 years), or will you give start dates?',
    'Conquest outcomes: the draft proposes heavy, light, shift or little trace for each conquest (column "proposed"). Which do you want changed?',
    'Languages named in history but not in the chart (list below): add them as extinct languages (Unwosian and Carth as isolates, the others as members of their families), or leave them as names only?',
    'Date conflicts (list below): for each, should the tree move to the wiki date (the default) or is the wiki wrong?',
    'Lastnu: when, where and by whom was it constructed, and when did it gain native speakers? (Drawn at a placeholder 1700.)',
    'Writing: the wiki dates Dahen bone script to c. 1400 BFA and its standardisation to 207 BFA. Where and when did the other families first write?',
    'Atirhan Dahen: Emaran plantation labourers speaking Dahen (Emaran as lexifier), or a Dahen community restructured under Emaran rule (Dahen as lexifier)?',
    'The blank in Estijan: "the Uvei kingdom adopting ____ from the Yethran Empire" in 842. What did they adopt?',
];

const out = { _readme: 'Phase 5 history draft (scripts/build-history-draft.js). Proposals only: nothing here is read by the chart or the engine until DJ approves it.', generatedAt: new Date().toISOString(), events, wars: WARS.map(([label, page, from, to, note]) => ({ label, page, from, to, note })), contacts, colonies, conflicts, missing: [...missing].map(([name, labels]) => ({ name, events: labels })), questions: QUESTIONS };
fs.writeFileSync(path.join(root, 'data/history-draft.json'), `${JSON.stringify(out, null, 1)}\n`);

const md = [];
md.push('# History draft (Phase 5)', '');
md.push(`Proposals for DJ to approve before any of it reaches the chart or the engine. Built ${out.generatedAt.slice(0, 10)} by \`scripts/build-history-draft.js\`; the same proposals as data in \`data/history-draft.json\`.`, '');
md.push(`**In short:** ${events.length} dated events from the wiki that touch languages, ${WARS.length} wars, and ${colonies.length} colonial ties. They give **${contacts.length} contact arrows** that can be drawn and fed to the engine today, **${conflicts.length} date conflicts** between the tree and the wiki, and **${missing.size} languages** the wiki names that the chart does not have.`, '');
md.push('## Questions for DJ', '');
QUESTIONS.forEach((q, i) => md.push(`${i + 1}. ${q}`));
md.push('', '## Events that touch languages', '');
md.push('| Year | Event (wiki page) | From | To | Proposed |', '|---|---|---|---|---|');
for (const e of events) {
    const side = (s, name) => (!s ? '' : s.status === 'ok' ? s.name : s.status === 'missing' ? `${name} *(not in chart)*` : `${name} *(alive ${s.born}–${s.end})*`);
    md.push(`| ${yearLabel(e.year)} | ${e.label} (${e.page}) | ${side(e.donorNode, e.donor)} | ${e.recipients.map((r) => side(r, r.name)).join(', ') || '(none)'} | ${e.kind}: ${e.effect} |`);
}
md.push('', '## Wars', '');
for (const w of WARS) md.push(`- **${w[0]}** (${w[2]}–${w[3]}): ${w[4]}. Language effect to come from the occupations and migrations it caused; the Red War's occupation of Dahe is the Treaty of Freedom row above.`);
md.push('', '## Contact arrows ready to draw', '', 'Both ends exist and were alive at the date. Approve these and they become borrowings on the chart, which the engine reads (cross-family ones once its world-level contact pass is built).', '');
for (const c of contacts) md.push(`- ${yearLabel(c.year)}: ${byId.get(c.fromId)?.name} → ${byId.get(c.toId)?.name}, ${c.kind} (${c.label}; ${c.effect})`);
md.push('', '## Date conflicts', '', 'A language in the chart that was not alive when the wiki has it doing something. Default proposal: move the tree to the wiki.', '');
for (const c of conflicts) md.push(`- **${c.language}** is alive ${yearLabel(c.born)}–${yearLabel(c.end)} in the chart, but ${c.label} (${c.page}) is in ${yearLabel(c.year)}.`);
md.push('', '## Languages the wiki names that the chart does not have', '');
for (const [name, labels] of missing) md.push(`- **${name}**: ${labels.join('; ')}`);
md.push('', '## Colonial ties', '', `${colonies.length} ties from DJ's Colonial Assignments board (no edits had been made there). "Still official" means the power's language is official in the former colony today (a colonial variety).`, '');
md.push('| Colony | Power | Independence | Power\'s language | Still official | Native official | Proposed |', '|---|---|---|---|---|---|---|');
for (const c of colonies.sort((a, b) => a.power.localeCompare(b.power) || a.independence - b.independence)) {
    md.push(`| ${c.colony} | ${c.power} | ${c.independence} | ${c.powerLanguage ?? '?'} | ${c.stillOfficial.join(', ') || ''} | ${c.nativeLanguages.join(', ') || ''} | ${c.proposal} |`);
}
md.push('', `Names the board could not match to a country: ${colonial.unmatched.map(([c, p, y]) => `${c} (from ${p}, ${y})`).join('; ')}.`);
fs.writeFileSync(path.join(root, 'docs/history-draft.md'), `${md.join('\n')}\n`);
console.log(`events ${events.length}, contacts ready ${contacts.length}, conflicts ${conflicts.length}, missing ${missing.size}, colonies ${colonies.length}`);
