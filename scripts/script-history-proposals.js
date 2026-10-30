/**
 * The script history as a sheet for DJ: the religions and their scripts, the
 * proposed switches to veto, the languages still unwritten, and who writes
 * what in 1765.
 *
 *   node scripts/script-history-proposals.js   -> docs/script-history-proposals.md
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const h = read('data/history/script-history.json');
const d = read('data/scripts.json');
const doc = read('data/languages.json');
const by = new Map(doc.languages.map((l) => [l.id, l]));
const st = new Map(d.stages.map((s) => [s.id, s]));
const living = new Set(doc.languages.filter((l) => l.died == null && !l.reconstructed).map((l) => l.id));
const nm = (id) => by.get(id)?.name ?? id;
const lineName = (line) => st.get(line)?.name ?? line;
const yr = (y) => (y < 0 ? `${-y} BFA` : `${y} AFA`);
const why = (s) => `${s.reason}${s.via ? ` (${nm(s.via)}${s.carrier ? `, brought by ${nm(s.carrier)}` : ''})` : ''}`;

let md = `# Script history: proposals for DJ's veto

Built by scripts/build-script-history.js from the scripts, the family tree, contact.json (rulers, borders) and the atlas religion map. To strike a switch, veto it in the Scripts window's Switches tab and apply; or add \`{ "lang": "<id>", "year": <year> }\` to data/history/script-vetoes.json and rebuild (\`npm run scripts:history\`). The rebuild needs the religion map: andah-atlas, or its copy in data/canon/religion-map.json.

## The religions and their scripts

| Religion | Arose | Script |
|---|---|---|
`;
for (const [k, v] of Object.entries(h.religions)) md += `| ${k} | ${yr(v.founded)} | ${v.note} (${v.tips.map((t) => st.get(t)?.name).join(', ')}) |\n`;

const liveSw = h.switches.filter((s) => living.has(s.lang)), deadSw = h.switches.filter((s) => !living.has(s.lang));
md += `\n## Proposed switches, living languages (${liveSw.length})\n\n| Language | id | Year | From | To | Why |\n|---|---|---|---|---|---|\n`;
for (const s of liveSw) md += `| ${s.name} | \`${s.lang}\` | ${yr(s.year)} | ${lineName(s.from)} | ${lineName(s.to)} | ${why(s)} |\n`;
md += `\n## Proposed switches, dead languages and stages (${deadSw.length})\n\n`;
for (const s of deadSw) md += `- ${s.name} (\`${s.lang}\`) ${yr(s.year)}: ${lineName(s.from)} to ${lineName(s.to)}, ${why(s)}\n`;
md += `\n## Living languages still unwritten in 1765 (${h.unwritten.length})\n\n${h.unwritten.map(nm).join(', ')}\n`;

const last = {};
for (const [id, ev] of Object.entries(h.languages)) if (living.has(id)) { const e = ev[ev.length - 1]; (last[e.line] = last[e.line] || []).push(nm(id)); }
md += `\n## Who writes what in 1765\n\n`;
for (const [line, arr] of Object.entries(last).sort((a, b) => b[1].length - a[1].length)) md += `- **${lineName(line)}** (${arr.length}): ${arr.sort().join(', ')}\n`;

fs.writeFileSync(path.join(root, 'docs/script-history-proposals.md'), md);
console.log(`Wrote docs/script-history-proposals.md: ${liveSw.length} switches of living languages, ${deadSw.length} of dead ones, ${h.unwritten.length} unwritten.`);
