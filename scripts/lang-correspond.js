/**
 * Sound correspondences — the comparative method, run blind against the engine.
 *
 *   node scripts/lang-correspond.js "Standard Dahen" "Qai" "Siaa"
 *   node scripts/lang-correspond.js --family proto-dahen-kino --leaves 4
 *   node scripts/lang-correspond.js "Qai" "Siaa" --min 4 --exceptions
 *
 * A cognate word list — which this app already shows — tells you the languages
 * are related. A CORRESPONDENCE SET tells you the relationship is regular, and
 * regularity is the entire claim of historical linguistics: Proto-Germanic *p
 * does not usually become English f, it always does, and where it does not there
 * is a reason (Verner's Law, a loan, an analogy). Grimm's Law is a table exactly
 * like the one this prints.
 *
 * ## Why this is worth having
 *
 * Everything else in this repo measures the engine against Earth using summary
 * statistics — inventory size, erosion rate, cognate percentage. Those say the
 * output is in the right numerical band. They do not say it would survive
 * contact with a linguist.
 *
 * This does. It throws away the derivation histories, which are ground truth and
 * would make the exercise circular, takes nothing but the surface forms of the
 * modern languages, aligns them, and asks the question a comparativist asks: can
 * this family be reconstructed? If the correspondences are regular, the answer
 * is yes and the family is real in the only sense that matters. If every proto
 * segment shows a scatter of unrelated reflexes, the forms are noise wearing a
 * family's clothes, and no summary statistic would ever have told you.
 *
 * ## What the numbers mean
 *
 * REGULARITY is the share of segment slots covered by each proto phoneme's
 * majority correspondence. Real families do not score 100%: Grimm's Law has
 * Verner's exceptions, borrowing muddies everything, and analogy re-makes forms
 * that sound change had already dealt with. A score in the 80s or low 90s is
 * what a well-behaved real family looks like. 100% would mean nothing had ever
 * interfered with sound change, which is its own kind of unrealistic; below
 * about 60% and the family is not reconstructible.
 *
 * SPLITS are where a proto phoneme has two or more competing reflexes with real
 * support. Those are the interesting ones — a split usually means a conditioned
 * change whose environment has since been destroyed, which is precisely how
 * phonemicisation works and precisely the texture that hand-built conlangs lack.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProject } from '../js/engine/project.js';
import { familyInputs } from './world.js';
import { isVowel, sonorityOf } from '../js/engine/features.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const doc = JSON.parse(fs.readFileSync(path.join(root, 'data/languages.json'), 'utf8'));
const configs = JSON.parse(fs.readFileSync(path.join(root, 'data/lang-config.json'), 'utf8'));

const byId = new Map(doc.languages.map((l) => [l.id, l]));
const rootOf = (l) => { let c = l; while (c.parentId) c = byId.get(c.parentId); return c.id; };

const args = process.argv.slice(2);
const flag = (name, dflt) => {
    const i = args.indexOf(`--${name}`);
    if (i === -1) return dflt;
    const v = args[i + 1];
    return v && !v.startsWith('--') ? v : true;
};
const names = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && flag(args[i - 1].slice(2)) === a));

const MIN_SUPPORT = Number(flag('min', 3));
const SHOW_EXCEPTIONS = Boolean(flag('exceptions', false));

// ---------------------------------------------------------------------------
// Which languages
// ---------------------------------------------------------------------------

let famRoot = flag('family', null);
let targets = [];

if (names.length >= 2) {
    targets = names.map((n) => {
        const l = doc.languages.find((x) => x.id === n || x.name.toLowerCase() === n.toLowerCase());
        if (!l) { console.error(`No language "${n}".`); process.exit(1); }
        return l;
    });
    famRoot = rootOf(targets[0]);
    if (targets.some((t) => rootOf(t) !== famRoot)) {
        console.error('Those languages are not in the same family — there is nothing to correspond.');
        process.exit(1);
    }
} else {
    famRoot = famRoot || 'proto-dahen-kino';
    const wanted = Number(flag('leaves', 4));
    const tree = doc.languages.filter((l) => rootOf(l) === famRoot);
    const leaves = tree.filter((l) => !tree.some((x) => x.parentId === l.id));
    // Spread the sample across the family rather than taking the first N, which
    // would land on one branch and flatter the regularity score.
    const step = Math.max(1, Math.floor(leaves.length / wanted));
    targets = leaves.filter((_, i) => i % step === 0).slice(0, wanted);
}

const cfg = configs[famRoot];
if (!cfg) { console.error(`Family ${famRoot} has no entry in data/lang-config.json.`); process.exit(1); }

const tree = doc.languages.filter((l) => rootOf(l) === famRoot);
const project = createProject({
    tree,
    names: tree.map((l) => l.name),
    config: { ...cfg, rootId: famRoot, presentYear: doc.config.presentYear },
    ...familyInputs(famRoot), borrowings: doc.borrowings || [],
});

/**
 * Reconstruct against the MOST RECENT COMMON ANCESTOR, not the family root.
 *
 * The comparative method reconstructs the proto-language OF THE LANGUAGES BEING
 * COMPARED. Comparing Spanish with Portuguese gets you Proto-Ibero-Romance, not
 * Proto-Indo-European, and holding them against PIE would make two nearly
 * identical sisters look wildly irregular — every change on the four thousand
 * years of shared road between PIE and their split would be counted as though it
 * had happened independently in each of them.
 *
 * Which is exactly what this script did at first, and it is why two Queians
 * sisters that split in 1516 scored 36% attrition: they were being measured
 * against Proto-Queians, thousands of years above their own parent.
 */
function ancestorChain(l) {
    const out = [];
    for (let c = l; c; c = c.parentId ? byId.get(c.parentId) : null) out.push(c.id);
    return out;
}
function mrcaOf(langs) {
    const chains = langs.map(ancestorChain);
    for (const id of chains[0]) if (chains.every((c) => c.includes(id))) return id;
    return famRoot;
}

const protoId = mrcaOf(targets);
const proto = project.stateOf(protoId);
const states = targets.map((t) => ({ node: t, state: project.stateOf(t.id) })).filter((x) => x.state);
if (states.length < 2) { console.error('Need at least two derivable languages.'); process.exit(1); }

// ---------------------------------------------------------------------------
// Alignment
// ---------------------------------------------------------------------------

/**
 * Phonetic distance, used as the alignment score.
 *
 * Alignment has to be phonetically informed or it produces nonsense
 * correspondences: a naive edit distance is as happy to align /k/ with /a/ as
 * with /g/, and the resulting table would show every proto stop corresponding
 * to every daughter vowel. Vowels and consonants are held far apart; within a
 * class, distance follows the features a listener actually confuses.
 */
function dist(a, b) {
    if (!a || !b) return 4;
    if (isVowel(a) !== isVowel(b)) return 6;
    if (a.ipa === b.ipa) return 0;
    if (isVowel(a)) {
        return 0.6 * Math.abs(a.f.height - b.f.height)
            + 0.9 * Math.abs(a.f.back - b.f.back)
            + (a.f.round === b.f.round ? 0 : 0.6)
            + (a.f.nasal === b.f.nasal ? 0 : 0.8)
            + (a.f.long === b.f.long ? 0 : 0.5)
            + ((a.f.tone ?? 0) === (b.f.tone ?? 0) ? 0 : 0.5);
    }
    return 0.9 * Math.abs(sonorityOf(a) - sonorityOf(b))
        + (a.f.place === b.f.place ? 0 : 1.1)
        + (a.f.voice === b.f.voice ? 0 : 0.6)
        + (a.f.aspirated === b.f.aspirated ? 0 : 0.4)
        + (a.f.lateral === b.f.lateral ? 0 : 1.2)
        + (a.f.nasal === b.f.nasal ? 0 : 1.2);
}

const GAP = 2.2;

/** Needleman–Wunsch. Returns pairs of [protoSegment|null, daughterSegment|null]. */
function align(A, B) {
    const n = A.length, m = B.length;
    const d = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
    const p = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1));
    for (let i = 1; i <= n; i++) { d[i][0] = i * GAP; p[i][0] = 1; }
    for (let j = 1; j <= m; j++) { d[0][j] = j * GAP; p[0][j] = 2; }
    for (let i = 1; i <= n; i++) {
        for (let j = 1; j <= m; j++) {
            const diag = d[i - 1][j - 1] + dist(A[i - 1], B[j - 1]);
            const up = d[i - 1][j] + GAP;
            const left = d[i][j - 1] + GAP;
            if (diag <= up && diag <= left) { d[i][j] = diag; p[i][j] = 0; }
            else if (up <= left) { d[i][j] = up; p[i][j] = 1; }
            else { d[i][j] = left; p[i][j] = 2; }
        }
    }
    const out = [];
    let i = n, j = m;
    while (i > 0 || j > 0) {
        const move = i === 0 ? 2 : j === 0 ? 1 : p[i][j];
        if (move === 0) { out.push([A[--i], B[--j]]); }
        else if (move === 1) { out.push([A[--i], null]); }
        else { out.push([null, B[--j]]); }
    }
    return out.reverse();
}

// ---------------------------------------------------------------------------
// Tabulate
// ---------------------------------------------------------------------------

/**
 * Only INHERITED cognates count.
 *
 * A loan has not been through the family's sound changes — that is what makes it
 * a loan — so including one puts an irregular correspondence in the table that
 * no rule ever produced. Comparativists exclude them for the same reason, and
 * hunting the ones that slipped through is most of the craft.
 */
const usable = (e) => e && !e.retired && !e.loan && !e.paradigm && e.form?.length;

/**
 * The conditioning frame a correspondence is stated in.
 *
 * This is the difference between a correspondence table and a tally. Nobody
 * writes "Latin p corresponds to Spanish p, and also to b, and also to nothing";
 * they write "p- initially, -b- between vowels, ∅ before a consonant" — three
 * regular correspondences in three environments, not one irregular one.
 *
 * Without this the measure was nonsense, and it announced itself as nonsense:
 * two sisters that had split barely 250 years apart scored 32% regularity, which
 * cannot be true of languages that close. What it was really measuring was how
 * much CONDITIONED change the family had undergone — counting every conditioned
 * split as an irregularity, which inverts the meaning of the number.
 *
 * The frame is the classic one: position in the word, and whether the neighbours
 * are vowels. Finer conditioning exists (place assimilation, stress, tone) but a
 * narrower frame slices the data until every cell has one member and everything
 * scores 100%, which is the opposite failure.
 */
function environmentOf(form, i) {
    const prev = i > 0 ? form[i - 1] : null;
    const next = i < form.length - 1 ? form[i + 1] : null;
    const pos = !prev ? '#_' : !next ? '_#' : '';
    const frame = `${prev ? (isVowel(prev) ? 'V' : 'C') : '#'}_${next ? (isVowel(next) ? 'V' : 'C') : '#'}`;
    return ` / ${pos ? frame : frame}`;
}

/**
 * The whole inherited lexicon, not just the Swadesh core.
 *
 * Core-only gave 41 cognate sets, which is too thin to tell a correspondence
 * from a coincidence — and it is thin for a reason: core meanings are exactly
 * the ones lexical replacement targets, so restricting to them selects against
 * the surviving cognates the method needs. A comparativist uses every inherited
 * word they can find.
 */
const protoEntries = (proto.entries || []).filter(usable);
const slots = new Map();   // protoIpa -> Map(reflexTuple -> {count, examples})
let sets = 0;
let lostEverywhere = 0, allSlots = 0;

for (const pe of protoEntries) {
    const rows = states.map(({ state }) => (state.entries || []).find((x) => x.id === pe.id));
    if (rows.some((r) => !usable(r))) continue;   // replaced or lost somewhere
    sets += 1;

    // Align each daughter to the proto independently, then read the reflexes off
    // by proto position — which is how a correspondence set is actually built.
    const perDaughter = rows.map((r) => {
        const pairs = align(pe.form, r.form);
        const map = new Map();       // proto index -> reflex ipa (or '∅')
        let pi = -1;
        for (const [a, b] of pairs) {
            if (a) { pi += 1; map.set(pi, b ? b.ipa : '∅'); }
            else if (pi >= 0 && b) map.set(pi, (map.get(pi) ?? '') + b.ipa); // insertion
        }
        return map;
    });

    for (let i = 0; i < pe.form.length; i++) {
        const key = pe.form[i].ipa;
        const reflexes = perDaughter.map((m) => m.get(i) ?? '∅');
        allSlots += 1;
        /**
         * A segment lost in EVERY daughter is attrition, not a correspondence.
         *
         * It carries no reconstructive information — nothing on the surface
         * points back to it — so counting it would let a heavily eroded family
         * score high regularity for the trivial reason that it had regularly
         * lost everything. It is reported on its own instead, because the
         * attrition rate is worth knowing: it is the ceiling on how much of the
         * proto a comparativist could ever recover.
         */
        if (reflexes.every((r) => r === '∅')) { lostEverywhere += 1; continue; }
        const tuple = reflexes.join(' · ');
        const env = environmentOf(pe.form, i);
        const cell = `${key}${env}`;
        if (!slots.has(cell)) slots.set(cell, new Map());
        const t = slots.get(cell);
        if (!t.has(tuple)) t.set(tuple, { count: 0, examples: [] });
        const rec = t.get(tuple);
        rec.count += 1;
        if (rec.examples.length < 3) rec.examples.push(pe.gloss);
    }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const H = (t) => console.log(`\n${'═'.repeat(76)}\n${t}\n${'═'.repeat(76)}`);
const pad = (s, n) => String(s).padEnd(n);

H(`SOUND CORRESPONDENCES — ${cfg.name || famRoot}`);
console.log(`Reconstructed from surface forms alone. Derivation histories not consulted.`);
console.log(`\nProto:     ${proto.node?.name || famRoot}`);
states.forEach((s, i) => {
    const span = s.node.died != null ? `${s.node.born}–${s.node.died}` : `${s.node.born}–now`;
    console.log(`  ${i + 1}.       ${s.node.name}  (${span})`);
});
console.log(`\n${sets} cognate sets survive in all ${states.length} languages (of ${protoEntries.length} inherited proto words).`);

if (!sets) {
    console.log('\nNo shared cognates — these languages have replaced every core word between them.');
    process.exit(0);
}

H('THE TABLE');
const nameW = Math.max(12, ...states.map((s) => s.node.name.length + 1));
console.log(`${pad('proto / env', 16)}${states.map((s) => pad(s.node.name, nameW)).join('')}  support   regularity`);
console.log('─'.repeat(84));

let totalSlots = 0, regularSlots = 0;
const splits = [];
const exceptions = [];

const ordered = [...slots.entries()].sort((a, b) => {
    const na = [...a[1].values()].reduce((n, r) => n + r.count, 0);
    const nb = [...b[1].values()].reduce((n, r) => n + r.count, 0);
    return nb - na;
});

for (const [protoIpa, tuples] of ordered) {
    const all = [...tuples.entries()].sort((a, b) => b[1].count - a[1].count);
    const total = all.reduce((n, [, r]) => n + r.count, 0);
    if (total < MIN_SUPPORT) continue;

    const [bestTuple, bestRec] = all[0];
    totalSlots += total;
    regularSlots += bestRec.count;
    const reg = bestRec.count / total;

    const cells = bestTuple.split(' · ').map((c) => pad(c, nameW)).join('');
    console.log(`*${pad(protoIpa, 15)}${cells}  ${pad(total, 8)}  ${(100 * reg).toFixed(0)}%`);

    // A rival reflex with real support is a SPLIT, not noise.
    for (const [tuple, rec] of all.slice(1)) {
        if (rec.count >= Math.max(MIN_SUPPORT, total * 0.15)) {
            splits.push({ protoIpa, tuple, count: rec.count, total, examples: rec.examples });
            console.log(`${pad('', 16)}${tuple.split(' · ').map((c) => pad(c, nameW)).join('')}  ${pad(rec.count, 8)}  (rival)`);
        } else if (rec.count > 0) {
            exceptions.push({ protoIpa, tuple, count: rec.count, examples: rec.examples });
        }
    }
}

H('IS THIS FAMILY RECONSTRUCTIBLE?');
const attrition = allSlots ? lostEverywhere / allSlots : 0;
console.log(`Attrition:  ${(100 * attrition).toFixed(1)}% of ${allSlots} proto segment slots left no reflex in`);
console.log(`any of these ${states.length} languages. Nothing on the surface points back to them, so`);
console.log(`they are the part of the proto that could never be recovered.\n`);
const regularity = totalSlots ? regularSlots / totalSlots : 0;
console.log(`Regularity: ${(100 * regularity).toFixed(1)}% of the ${totalSlots} slots that DID leave a reflex follow`);
console.log(`their proto phoneme's majority correspondence.\n`);
console.log(`  Earth, for scale: a well-described family sits in the 80s to low 90s.`);
console.log(`  Grimm's Law looked exceptionless until Verner found the residue; borrowing,`);
console.log(`  analogy and dialect mixture keep every real family short of 100%.\n`);

const verdict = regularity >= 0.92 ? 'suspiciously clean — almost nothing has interfered with sound change'
    : regularity >= 0.78 ? 'reconstructible, with the residue a real family carries'
        : regularity >= 0.6 ? 'reconstructible but noisy — a comparativist would work hard here'
            : 'NOT reconstructible — these forms would not be recognised as a family';
console.log(`  Verdict: ${verdict}.`);

if (splits.length) {
    H(`CONDITIONED SPLITS  (${splits.length})`);
    console.log('A proto phoneme with two well-supported reflexes. Usually a change that was');
    console.log('conditioned by an environment since destroyed — which is how a phoneme splits.\n');
    for (const s of splits.slice(0, 12)) {
        console.log(`  *${s.protoIpa}  →  ${s.tuple}   (${s.count}/${s.total})   e.g. ${s.examples.join(', ')}`);
    }
}

if (SHOW_EXCEPTIONS && exceptions.length) {
    H(`RESIDUE  (${exceptions.length} one-off correspondences)`);
    console.log('The words that do not fit. In a real family these are where the interesting');
    console.log('history hides: loans, analogies, and the conditioning nobody has spotted yet.\n');
    for (const e of exceptions.slice(0, 25)) {
        console.log(`  *${e.protoIpa}  →  ${pad(e.tuple, 28)}  ${e.examples.join(', ')}`);
    }
} else if (exceptions.length) {
    console.log(`\n(${exceptions.length} one-off correspondences not shown — pass --exceptions for the residue.)`);
}
