/** Probe 3: PAIRED integrity, probe-drift, and repairJoin on inflectional joins. */
import fs from 'node:fs';
import path from 'node:path';
import { createProject, buildProto } from './js/engine/project.js';
import { candidateSequence } from './js/engine/soundchange/generate.js';
import { derive } from './js/engine/rng.js';
import { PAIRED } from './js/engine/soundchange/catalogue.js';
import { wordToIpa, isVowel, parseWord } from './js/engine/features.js';
import { isLegalCoda, isLegalOnset } from './js/engine/phonology/phonotactics.js';

const root = 'C:/Users/danny/Desktop/Andah games/language-tree';
const doc = JSON.parse(fs.readFileSync(path.join(root, 'data/languages.json'), 'utf8'));
const configs = JSON.parse(fs.readFileSync(path.join(root, 'data/lang-config.json'), 'utf8'));
const byId = new Map(doc.languages.map((l) => [l.id, l]));
const rootOf = (l) => { let c = l; while (c.parentId) c = byId.get(c.parentId); return c.id; };

console.log('=== 1. PAIRED integrity: does every umlaut get its apocope partner? ===');
for (const [famRoot, cfg] of Object.entries(configs)) {
    if (famRoot.startsWith('_')) continue;
    const tree = doc.languages.filter((l) => rootOf(l) === famRoot);
    if (!tree.length) continue;
    const project = createProject({ tree, names: tree.map((l) => l.name),
        config: { ...cfg, rootId: famRoot, presentYear: doc.config.presentYear }, sidecar: {} });
    let umlauts = 0, paired = 0, nasalisations = 0, nasalPaired = 0, tono = 0, tonoPaired = 0;
    for (const node of tree) {
        const st = project.stateOf(node.id);
        const rules = st?.changeSet?.rules || [];
        rules.forEach((r, i) => {
            if (r.template === 'umlaut') { umlauts++; if (rules[i + 1]?.template === 'apocope') paired++; }
            if (r.template === 'vowel-nasalisation') { nasalisations++; if (rules[i + 1]?.template === 'final-consonant-loss') nasalPaired++; }
            if (r.template === 'tonogenesis-voicing') { tono++; if (rules[i + 1]?.template === 'devoicing-after-tonogenesis') tonoPaired++; }
        });
    }
    console.log(`  ${(cfg.name || famRoot).padEnd(17)} umlaut ${paired}/${umlauts} paired   nasalisation ${nasalPaired}/${nasalisations}   tonogenesis ${tonoPaired}/${tono}`);
}

console.log('\n=== 2. Probe drift: does adding paradigm rows to entries change the ruleset? ===');
{
    const famRoot = 'proto-dahen-kino';
    const cfg = configs[famRoot];
    const tree = doc.languages.filter((l) => rootOf(l) === famRoot);
    const names = tree.map((l) => l.name);
    const proto = buildProto(names, { ...cfg, rootId: famRoot });
    const child = tree.find((l) => l.parentId === famRoot);
    const seqA = candidateSequence(proto, derive(cfg.seed, child.id, 'ruleset'), { idPrefix: child.id });

    // add 360 fake paradigm rows
    const extra = [];
    const nouns = proto.entries.filter((e) => e.pos === 'n').slice(0, 120);
    for (const n of nouns) for (const suf of ['ka', 'to', 'mi']) {
        extra.push({ ...n, id: `${n.id}#${suf}`, form: [...n.form, ...parseWord(suf)], ipa: n.ipa + suf });
    }
    const proto2 = { ...proto, entries: [...proto.entries, ...extra] };
    const seqB = candidateSequence(proto2, derive(cfg.seed, child.id, 'ruleset'), { idPrefix: child.id });
    console.log(`  entries ${proto.entries.length} -> ${proto2.entries.length}`);
    console.log(`  A (${seqA.length}): ${seqA.slice(0, 14).map((r) => r.template).join(' > ')}`);
    console.log(`  B (${seqB.length}): ${seqB.slice(0, 14).map((r) => r.template).join(' > ')}`);
    const same = seqA.map((r) => r.template).join('|') === seqB.map((r) => r.template).join('|');
    console.log(`  IDENTICAL: ${same}`);
}

console.log('\n=== 3. repairJoin on inflectional joins: does it eat the class marker? ===');
{
    const famRoot = 'proto-dahen-kino';
    const cfg = configs[famRoot];
    const tree = doc.languages.filter((l) => rootOf(l) === famRoot);
    const proto = buildProto(tree.map((l) => l.name), { ...cfg, rootId: famRoot });
    const pt = proto.phonotactics;
    // replicate derivation.js repairJoin
    const repairJoin = (segments, boundary) => {
        const a = segments[boundary - 1]; const b = segments[boundary];
        if (!a || !b) return segments;
        if (a.ipa === b.ipa) return [...segments.slice(0, boundary), ...segments.slice(boundary + 1)];
        if (isVowel(a) && isVowel(b)) {
            const diphs = pt.nucleus?.diphthongs || [];
            if (!diphs.includes(a.ipa + b.ipa)) return [...segments.slice(0, boundary - 1), ...segments.slice(boundary)];
        }
        if (!isVowel(a) && !isVowel(b)) {
            if (!isLegalCoda([a], pt) || !isLegalOnset([b], pt)) return [...segments.slice(0, boundary - 1), ...segments.slice(boundary)];
        }
        return segments;
    };
    const nouns = proto.entries.filter((e) => e.pos === 'n' && e.class);
    const endings = { 'V-initial (-o)': parseWord('o'), 'C-initial (-se)': parseWord('se'), 'C-initial (-na)': parseWord('na') };
    for (const [label, end] of Object.entries(endings)) {
        let lost = 0, total = 0;
        const byClassLost = {};
        for (const n of nouns) {
            total++;
            const joined = [...n.form, ...end];
            const fixed = repairJoin(joined, n.form.length);
            if (fixed.length !== joined.length) { lost++; byClassLost[n.class] = (byClassLost[n.class] || 0) + 1; }
        }
        console.log(`  ${label.padEnd(18)} stem-final segment deleted in ${lost}/${total} nouns  ${JSON.stringify(byClassLost)}`);
    }
    const cc = {}; for (const n of nouns) cc[n.class] = (cc[n.class] || 0) + 1;
    console.log(`  class sizes: ${JSON.stringify(cc)}`);
    console.log(`  proto coda inventory: ${JSON.stringify(pt.coda.allowed)}  onset max ${pt.onset.max}`);
}
