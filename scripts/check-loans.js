/**
 * Borrowing by field of meaning in the living languages, against Earth: the
 * World Loanword Database (Haspelmath and Tadmor 2009, rounded shares).
 *
 *   npm run check:loans [language ids...]   (40 living languages by default; about 4 minutes)
 */
import fs from 'node:fs';
import { stateInWorld } from './world.js';
const doc = JSON.parse(fs.readFileSync('data/languages.json'));
const ids = process.argv[2] ? process.argv.slice(2) : doc.languages.filter((l) => l.died == null && !l.diverged && !doc.languages.some((x) => x.parentId === l.id) && !l.generated).map((l) => l.id).slice(0, 40);
const by = {};
for (const id of ids) {
  let st; try { st = stateInWorld(id, 1765); } catch { continue; } if (!st) continue;
  for (const e of st.entries) { if (e.retired || e.paradigm) continue; const d = e.domain || '?'; by[d] ??= [0, 0]; by[d][0]++; if (e.loan) by[d][1]++; }
}
const WOLD = { religion: 41, craft: 37, dwelling: 37, society: 31, agriculture: 30, plant: 30, food: 30, war: 28, trade: 27, animal: 25, cognition: 24, tool: 24, action: 22, time: 23, speech: 22, nature: 20, weather: 20, quality: 20, kinship: 15, body: 14, perception: 11, space: 14, quantity: 13, motion: 15, person: 15, colour: 20, grammar: 5 };
const rows = Object.entries(by).map(([d, [n, l]]) => [d, n, Math.round(100 * l / n), WOLD[d]]).sort((a, b) => b[2] - a[2]);
for (const [d, n, p, w] of rows) console.log(d.padEnd(12), String(n).padStart(6), `${p}%`.padStart(5), w != null ? `Earth ${w}%` : '');
const tot = Object.values(by).reduce((a, [n, l]) => [a[0] + n, a[1] + l], [0, 0]);
console.log('all', tot[0], Math.round(100 * tot[1] / tot[0]) + '%', 'Earth ~24%', ids.length, 'languages');
