/**
 * Onomastics — generating names in a language, and reading names back.
 *
 * Two things live here, and the second is the interesting one.
 *
 * ## Names are COMPOUNDS, not random syllables
 *
 * A generator that emits phonotactically legal noise produces names that look
 * right and mean nothing. Real toponyms are almost always transparent compounds
 * at the moment they are coined: Blackpool, Newcastle, Oxford, Dublin (*dubh
 * linn*, "black pool" again), Shanghai (*shàng hǎi*, "upon the sea"),
 * Reykjavík ("smoke bay"). They stop being transparent only because the
 * language moves on underneath them.
 *
 * So names here are built from the language's OWN lexicon, in the semantic
 * domains people actually name things after — landscape, water, colour, size,
 * animals, kinship — and the etymology is kept. That is what turns a name from
 * decoration into worldbuilding: you get *hau-ram* and you get "river-mouth".
 *
 * ## Names FOSSILISE
 *
 * This is the payoff of having a diachronic engine at all, and no static name
 * generator can do it.
 *
 * A place name is coined once and then inherited. It undergoes every sound
 * change AFTER its coining, but the compound stops being re-analysed, so it
 * preserves the shape of a language that no longer exists. English place names
 * are full of Old English and Norse that Modern English lost: -chester from
 * Latin *castra*, -by and -thwaite from Norse, Wednesbury from a god nobody
 * worships. The name is older than the language it sits in.
 *
 * `coinAt()` does exactly that: coin the name at an ancestor stage, then run it
 * forward through the real rulesets to the modern language. The result is a
 * name that looks archaic in its own language — because it is.
 */

import { wordToIpa, isVowel } from '../features.js';
import { repairHiatus, repairClusters, syllabify, isLegalOnset } from '../phonology/phonotactics.js';
import { evolveWord } from '../soundchange/apply.js';
import { spellEntry } from '../phonology/romanise.js';

/**
 * The sound changes a name meets between the language that coined it and a
 * descendant, in the LINEAGE model: each language on the way contributes its
 * own lifetime's changes, but only up to the year the next language on the
 * path split off from it. Its later changes belong to its other descendants.
 */
export function pathChangeSets(project, ancestorId, targetId) {
    // Changesets are generated lazily, when a language is first derived; on a
    // fresh project the path would otherwise be empty and a name would come
    // down the centuries unchanged.
    project.stateOf(targetId);
    const nodes = [];
    for (let node = project.nodeOf(targetId); node; node = node.parentId ? project.nodeOf(node.parentId) : null) {
        if (node.id === ancestorId) break;
        nodes.unshift(node);
    }
    return nodes.map((node, i) => {
        const cs = project.changeSetOf(node.id);
        if (!cs) return null;
        const until = i < nodes.length - 1 ? nodes[i + 1].born : Infinity;
        return { ...cs, rules: cs.rules.filter((r) => r.year == null || r.year <= until) };
    }).filter(Boolean);
}

/**
 * The ancestor as it stood when the path to the target left it: the state a
 * name coined there and carried down to the target was coined in.
 */
export function coiningState(project, ancestorId, targetId) {
    if (ancestorId === targetId || !project.lineageAtYear) return project.stateOf(ancestorId);
    let child = project.nodeOf(targetId);
    while (child?.parentId && child.parentId !== ancestorId) child = project.nodeOf(child.parentId);
    return child ? project.lineageAtYear(ancestorId, child.born) : project.stateOf(ancestorId);
}

/**
 * A name wears at its seam faster than the words it was made of.
 *
 * Place and personal names are said constantly and their parts stop being
 * analysed, so they shorten irregularly: Brycgstow > Bristol, Wodnesdaeg >
 * Wednesday, Gleawecestre > Gloucester. Each stage, a name of three or more
 * syllables loses one interior unstressed vowel (never the last, never leaving
 * three consonants together). Its elements, carried as ordinary words, do not,
 * and that difference is what makes an old name opaque to its own speakers.
 */
export function wearName(form) {
    const vowelAt = form.map((p, i) => (isVowel(p) ? i : -1)).filter((i) => i >= 0);
    if (vowelAt.length < 3) return form;
    for (const i of vowelAt.slice(1, -1).reverse()) {
        if (form[i].f?.stress === 1) continue;
        const cand = [...form.slice(0, i), ...form.slice(i + 1)];
        let run = 0, bad = false;
        for (const ph of cand) { run = ph.type === 'C' ? run + 1 : 0; if (run >= 3) { bad = true; break; } }
        if (!bad) return cand;
    }
    return form;
}


// ---------------------------------------------------------------------------
// What people name things after
// ---------------------------------------------------------------------------

/**
 * Semantic domains that supply name elements, by what is being named.
 *
 * These are not arbitrary. Toponyms across unrelated languages draw on the same
 * small set: the landscape feature itself, water, a colour or size, a tree or
 * animal, a person, and a word for settlement. Personal names draw on quality,
 * kinship, animals and the divine — which is why so many languages have a name
 * meaning "bear" or "wolf" or "gift of god".
 */
const NAME_SOURCES = {
    settlement: {
        head: ['dwelling'],
        /**
         * Settlements are named after SETTLEMENTS and the things a settlement
         * is built at — not after building components. Without this list the
         * `dwelling` domain supplied door, roof, floor, window and hearth as
         * heads, and the map filled up with towns called "bull + floor",
         * "nut + roof" and, bare, "Roof".
         *
         * River and mountain already pin their heads this way; settlement was
         * the only kind that did not.
         */
        headGlosses: ['house', 'village', 'city', 'well', 'bridge', 'fence', 'wall',
            'field', 'market', 'temple', 'garden', 'road', 'hill', 'ford'],
        modifier: ['nature', 'colour', 'quality', 'plant', 'animal', 'space', 'weather'],
        note: 'Newcastle, Blackpool, Oxford — a settlement word plus a describing element',
    },
    river: {
        head: ['nature'],
        modifier: ['colour', 'quality', 'animal', 'space'],
        headGlosses: ['river', 'water', 'stream', 'spring (water)', 'flow'],
        note: 'River names are the most conservative layer in any toponymy — Avon is simply Brythonic for "river"',
    },
    mountain: {
        head: ['nature'],
        modifier: ['colour', 'quality', 'weather', 'space'],
        headGlosses: ['mountain', 'hill', 'stone', 'cliff', 'top'],
        note: 'Often tautological across language shift: Torpenhow Hill is hill-hill-hill-hill',
    },
    region: {
        head: ['nature', 'space'],
        modifier: ['colour', 'quality', 'space', 'society'],
        note: 'Often the name of the people who live there, or the landscape they live in',
    },
    person: {
        head: ['quality', 'animal', 'religion', 'war', 'kinship'],
        modifier: ['quality', 'colour', 'religion'],
        note: 'Bernard = "bear-hard"; Theodore = "god-gift"; the dithematic pattern is Indo-European-wide',
    },
};

/** Pick lexemes usable as name elements, preferring short, common, concrete words. */
function elementsFor(state, domains, glosses) {
    /**
     * An explicit gloss list RESTRICTS the pool; it does not add to it.
     *
     * It read as "in this list OR in these domains", so pinning settlement to
     * house/village/city changed nothing — door, roof, floor and window were
     * still admitted by the `dwelling` domain, and the map kept its towns
     * called "crow + roof". River and mountain had the same latent fault; their
     * domains were simply broad enough to hide it.
     */
    const restricted = glosses && glosses.length;
    const pool = state.entries.filter((e) => {
        if (e.derivedFrom) return false;             // derived words are rarely name elements
        /**
         * A name is coined out of the CURRENT language. Nobody names a place
         * with a word that was already archaic when they named it — the name
         * becomes archaic later, by sitting still while the language moves,
         * which is a different and much more interesting fact. Coining from a
         * displaced word would short-circuit the whole mechanism and produce a
         * fossil that was never alive.
         */
        if (e.retired || e.restricted || e.paradigm) return false;
        if (!['n', 'adj'].includes(e.pos)) return false;
        if (restricted) return glosses.includes(e.gloss);
        return domains.includes(e.domain);
    });
    // Names favour short, frequent words — the ones everyone knows.
    return pool.filter((e) => e.syllables <= 2).length >= 4
        ? pool.filter((e) => e.syllables <= 2)
        : pool;
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

/**
 * Join two elements into a compound, repairing the seam.
 *
 * The junction is where compounds get worn down — that is why "Blackpool" is
 * still transparent but "Bristol" (< Brycgstow, "bridge place") is not, and why
 * "cupboard" is no longer a board for cups. The same phonotactic repairs that
 * run after a ruleset run here.
 */
function compound(a, b, pt, order = 'modifier-head') {
    const [first, second] = order === 'modifier-head' ? [a, b] : [b, a];
    let form = [...first.form, ...second.form];
    form = repairHiatus(form, pt);
    form = repairClusters(form, pt);
    return form;
}

/**
 * Generate one name.
 *
 * @param state  a derived language stage
 * @param rng    seeded stream
 * @param opts.kind  settlement | river | mountain | region | person
 */
export function generateName(state, rng, opts = {}) {
    const kind = opts.kind || 'settlement';
    const spec = NAME_SOURCES[kind] || NAME_SOURCES.settlement;
    const pt = state.phonotactics;

    const heads = elementsFor(state, spec.head, spec.headGlosses);
    const mods = elementsFor(state, spec.modifier);
    if (!heads.length) return null;

    const head = rng.pick(heads);

    // Not every name is a compound. Simplex names are common — plenty of places
    // are just called "the ford" or "the marsh" — and a mix reads better than
    // relentless two-part names.
    const simplex = rng.bool(0.28) || !mods.length;
    if (simplex) {
        return {
            form: head.form,
            ipa: wordToIpa(head.form),
            spelling: capitalise(spellEntry(state, head)),
            gloss: head.gloss,
            etymology: `${head.gloss}`,
            parts: [head.gloss],
            kind,
        };
    }

    // Modifier-head vs head-modifier follows the language's own noun-phrase
    // order, which is why English has "Blackpool" and French has "Châteauneuf".
    const order = opts.order || (state.syntax?.adjectiveOrder === 'NA' ? 'head-modifier' : 'modifier-head');
    let mod = rng.pick(mods);
    for (let i = 0; i < 6 && mod.id === head.id; i++) mod = rng.pick(mods);

    const form = compound(mod, head, pt, order);
    const parts = order === 'modifier-head' ? [mod.gloss, head.gloss] : [head.gloss, mod.gloss];
    return {
        form,
        ipa: wordToIpa(form),
        spelling: capitalise(state.romanisation.spell(form)),
        gloss: `${mod.gloss} ${head.gloss}`,
        etymology: `${parts.join(' + ')}  (*${wordToIpa(mod.form)} + *${wordToIpa(head.form)})`,
        parts,
        kind,
    };
}

/** N distinct names. */
export function generateNames(state, rng, opts = {}) {
    const n = opts.count ?? 20;
    const seen = new Set();
    const out = [];
    for (let i = 0; i < n * 12 && out.length < n; i++) {
        const name = generateName(state, rng, opts);
        if (!name || seen.has(name.ipa)) continue;
        seen.add(name.ipa);
        out.push(name);
    }
    return out;
}

// ---------------------------------------------------------------------------
// Fossilisation
// ---------------------------------------------------------------------------

/**
 * Coin a name at an ANCESTOR stage and inherit it forward to a modern one.
 *
 * The name is built from the ancestor's lexicon, then run through every ruleset
 * between there and the target — so it undergoes the sound changes but never
 * gets re-coined. What arrives is a name whose shape belongs to a language that
 * stopped being spoken centuries ago, sitting inside a modern one.
 *
 * That is the entire reason English has Winchester, Ipswich, Grimsby and
 * Keswick, and why a speaker cannot tell you what any of them mean.
 *
 * Returns the modern form, the original, and the chain between them.
 */
export function coinAt(project, targetLangId, ancestorLangId, rng, opts = {}) {
    const target = project.stateOf(targetLangId);
    const ancestor = coiningState(project, ancestorLangId, targetLangId);
    if (!target || !ancestor) return null;

    const coined = generateName(ancestor, rng, opts);
    if (!coined) return null;

    const chain = pathChangeSets(project, ancestorLangId, targetLangId);

    let form = coined.form;
    const steps = [];
    for (const cs of chain) {
        const res = evolveWord(form, cs.rules, {
            rootId: `name:${coined.ipa}`, rank: 400,
            phonotactics: ancestor.phonotactics, stageId: cs.childId,
        });
        let next = repairHiatus(res.segments, ancestor.phonotactics);
        next = repairClusters(wearName(next), ancestor.phonotactics);
        if (wordToIpa(next) !== wordToIpa(form)) {
            steps.push({ stageId: cs.childId, from: wordToIpa(form), to: wordToIpa(next) });
        }
        form = next;
    }

    return {
        ...coined,
        coinedIn: ancestor.node?.name ?? ancestorLangId,
        coinedForm: coined.ipa,
        coinedSpelling: coined.spelling,
        form,
        ipa: wordToIpa(form),
        spelling: capitalise(target.romanisation.spell(form)),
        steps,
        // A name that has changed a lot is opaque to its own speakers — they
        // can no longer see the words it was made of.
        opaque: steps.length >= 2,
    };
}

// ---------------------------------------------------------------------------
// Reading a name back: which language does it look like?
// ---------------------------------------------------------------------------

/**
 * Score how well a written name fits a language.
 *
 * The reverse problem, and a genuinely useful one for a worldbuilder with a
 * corpus of canon names already on a wiki: given "Zayliabao", which of these
 * languages could have produced it — and if none can, it is a loan.
 *
 * The score combines three things a phonologist would actually check:
 *   1. can every segment be spelled by this language's orthography at all?
 *   2. is every segment in its inventory?
 *   3. does every syllable satisfy its phonotactics?
 * plus a frequency term, so a name made of the language's COMMON sounds scores
 * above one made of its rarest.
 */
export function scoreName(text, state) {
    const { map } = state.romanisation;
    // Invert the romanisation, longest spelling first so digraphs win.
    const inverse = [...map.entries()].map(([ipa, letters]) => [letters, ipa])
        .sort((a, b) => b[0].length - a[0].length);

    const clean = String(text).toLowerCase().replace(/[^a-zà-ÿʼ'̀-ͯ]/g, '');
    const segments = [];
    const unreadable = [];
    let i = 0;
    while (i < clean.length) {
        const hit = inverse.find(([letters]) => letters && clean.startsWith(letters, i));
        if (!hit) { unreadable.push(clean[i]); i += 1; continue; }
        const ph = [...state.inventory.consonants, ...state.inventory.vowels].find((p) => p.ipa === hit[1]);
        if (ph) segments.push(ph); else unreadable.push(hit[0]);
        i += hit[0].length;
    }

    if (!segments.length) return { score: 0, unreadable, segments: [], ipa: '', reasons: ['nothing readable'] };

    const reasons = [];

    /**
     * TYPICALITY, as a per-segment geometric mean of probability.
     *
     * The obvious formulation — sum the segment frequencies — is wrong, and
     * wrong in a way that hides the answer: the sum grows with name length, so
     * every name of more than a few segments saturates and every language
     * scores 1.000. What is wanted is "how typical is this string OF this
     * language", which is a per-segment average, and averaging probabilities
     * means the geometric mean (equivalently, the mean log-probability).
     *
     * It is also the right shape linguistically: one segment the language does
     * not have should sink the whole name, not be diluted by the segments that
     * fit. That is how a loanword announces itself — English "genre" keeps a
     * /ʒ/ in a position English words never have one.
     */
    const counts = state.inventory.counts;
    const total = counts && counts.size ? [...counts.values()].reduce((a, b) => a + b, 0) : 0;
    // The floor for an absent segment. Small enough to sink a name, not zero,
    // so a single odd sound does not make everything equally impossible.
    const FLOOR = 1e-4;
    let logSum = 0;
    const foreign = [];
    for (const ph of segments) {
        const p = total ? (counts.get(ph.ipa) || 0) / total : 1 / segments.length;
        if (!p) foreign.push(ph.ipa);
        logSum += Math.log(Math.max(p, FLOOR));
    }
    // Normalise against the best a name of this length could score in this
    // language, so the measure is "how close to ideal" rather than an absolute
    // probability that shrinks with length.
    const best = total ? Math.log(Math.max(...counts.values()) / total) : 0;
    let typicality = Math.exp(logSum / segments.length - best);
    typicality = Math.max(0, Math.min(1, typicality));
    if (foreign.length) reasons.push(`not in the inventory: ${[...new Set(foreign)].join(' ')}`);

    const coverage = segments.length / (segments.length + unreadable.length);
    if (unreadable.length) reasons.push(`${unreadable.length} unspellable: ${[...new Set(unreadable)].join(' ')}`);

    // Phonotactic legality, syllable by syllable.
    const sylls = syllabify(segments, state.phonotactics);
    const allowed = state.phonotactics.coda?.allowed;
    let illegal = 0;
    for (const s of sylls) {
        const onset = [...(s.appendix || []), ...s.onset];
        if (onset.length > (state.phonotactics.onset?.max ?? 2) || !isLegalOnset(onset, state.phonotactics)) illegal += 1;
        if (allowed && s.coda.some((c) => !allowed.includes(c.ipa))) illegal += 1;
        // A vowel sequence the language does not license as a diphthong is a
        // hiatus it would have repaired, so a native name would not contain one.
        const diphs = state.phonotactics.nucleus?.diphthongs || [];
        if (s.nucleus.length > 1 && !diphs.includes(s.nucleus.map((v) => v.ipa).join(''))) illegal += 1;
    }
    if (illegal) reasons.push(`${illegal} syllable(s) break the phonotactics`);

    const score = coverage * typicality * Math.pow(0.6, illegal);
    return { score, typicality, coverage, illegal, segments, ipa: wordToIpa(segments), unreadable, syllables: sylls.length, reasons };
}

/**
 * Rank languages by how well a name fits each.
 *
 * A name that fits nothing well is the interesting result: it means the name
 * cannot be native to any of them, which is exactly the diagnostic that
 * identifies a loanword or a name inherited from a substrate the family
 * displaced.
 */
export function identifyLanguage(text, project, langIds) {
    const scored = langIds.map((id) => {
        const state = project.stateOf(id);
        if (!state) return null;
        const r = scoreName(text, state);
        return { langId: id, name: state.node?.name ?? id, ...r };
    }).filter(Boolean).sort((a, b) => b.score - a.score);

    const best = scored[0];
    return {
        ranked: scored,
        verdict: !best || best.score < 0.12
            ? 'No language here can produce this name natively — it looks borrowed, or inherited from a substrate.'
            : `Best fit: ${best.name}`,
    };
}

function capitalise(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

export { NAME_SOURCES };
