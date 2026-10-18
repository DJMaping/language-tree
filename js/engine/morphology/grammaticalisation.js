/**
 * Grammaticalisation — where new morphology comes from.
 *
 * ## The asymmetry this fixes
 *
 * Until this module, morphology in this engine could only ever be DESTROYED.
 * Sound change ate endings, `analogy.js` levelled away what survived, and
 * `erosion.js` reported the damage. Nothing anywhere built anything back.
 *
 * That is not what a language does. Latin lost its case system and, over the
 * same centuries, grew a definite article out of a demonstrative, a perfect out
 * of "to have", and a future out of an infinitive plus "to have" — *cantare
 * habeo* became *chanterai*. Loss and renewal run at once, and a model with only
 * the first produces a family where the sixty-third century looks like the proto
 * with holes in it rather than like a different language.
 *
 * The concrete symptom was that no daughter anywhere in the tree had a
 * grammatical category its ancestor lacked. `MORPH_TYPES` was a ceiling.
 *
 * ## Why it can be modelled honestly
 *
 * Grammaticalisation is one of the most regular processes in language change —
 * regular enough that the same clines recur in unrelated families, which is why
 * the table below can be short and still cover most of what happens. "Go"
 * becomes a future in English, French, Bantu and Tamil independently. "Finish"
 * becomes a completive in Mandarin, Yoruba and Tok Pisin independently.
 *
 * And it is not teleology, which is the standing objection to anything that
 * ADDS structure. The engine never notices that a language has lost its cases
 * and decides to build it some adpositions. It notices that this language has a
 * high-frequency verb meaning "go", that "go" sits on the venitive-to-future
 * cline, and rolls. A language may lose every case and gain nothing for four
 * thousand years; that is a fact about the language, not a bug.
 *
 * ## The three steps, in the order they actually happen
 *
 *   1. BLEACHING   the source loses its specific content. Crucially the lexical
 *                  item SURVIVES alongside the new grammatical one — Hopper's
 *                  layering. English still has a full verb "go" as well as the
 *                  going-to future, and French has both *aller* and the
 *                  synthetic future built from *habeo*.
 *   2. REDUCTION   grammatical material erodes faster than lexical material,
 *                  because it is more frequent. *going to* → *gonna*; *habeo* →
 *                  *-ai*. So the new morph is a truncation of the source, not
 *                  the whole word.
 *   3. BONDING     it becomes a paradigm cell — and from that moment it is an
 *                  ordinary string in the lexicon, subject to every subsequent
 *                  sound change, so it can erode away in turn and be renewed
 *                  again. That cycle is the entire point.
 *
 * ## And the other direction
 *
 * `planCategoryLoss` is the compensating half: when a cell has become
 * homophonous with another in EVERY class, the language may drop the
 * distinction outright rather than carry a slot that marks nothing. That is
 * what finally takes a case system to zero, and it is deliberately an
 * INDEPENDENT roll from the renewal above — a language that loses a case does
 * not thereby acquire one. Coupling them would be exactly the teleology this
 * engine forbids.
 */

import { wordToIpa, wordToIpaStressed } from '../features.js';
import { repairHiatus, syllabify } from '../phonology/phonotactics.js';
import { isParadigmEntry, parseCellId, cellIdOf, isIrregularClass, isMoodCellEntry } from './paradigm.js';
import { evolveLexicon } from '../soundchange/apply.js';

// ---------------------------------------------------------------------------
// The clines
// ---------------------------------------------------------------------------

/**
 * Each cline: which lexemes can start down it, and what it produces.
 *
 * `sources` are glosses, tried in order of how often the path is attested.
 * `axis` says which part of the paradigm the new cell joins: nominal cells hang
 * off the unmarked case, verbal cells off the first tense.
 */
export const CLINES = [
    {
        id: 'future-from-motion',
        sources: ['go', 'come'], pos: 'v', axis: 'verbal',
        cell: 'FUT', label: 'future tense',
        attested: 'English going to; French aller; Bantu -ka-; Tamil; Greek θα < θέλω ἵνα. Motion towards a goal becomes motion towards a time.',
    },
    {
        id: 'perfect-from-possession',
        sources: ['have', 'hold', 'take'], pos: 'v', axis: 'verbal',
        cell: 'PRF', label: 'perfect',
        attested: 'Latin habeo gave the Romance perfect AND, glued to the infinitive, the Romance future: cantare habeo → chanterai. English have eaten; German haben; Hindi.',
    },
    {
        id: 'completive-from-finish',
        sources: ['finish'], pos: 'v', axis: 'verbal',
        cell: 'PFV', label: 'completive aspect',
        attested: 'Mandarin 了 le is 了 liǎo "to finish"; Yoruba tán; Tok Pisin pinis < English finish.',
    },
    {
        id: 'progressive-from-posture',
        sources: ['stand', 'sit', 'live'], pos: 'v', axis: 'verbal',
        cell: 'PROG', label: 'progressive aspect',
        attested: 'Dutch zitten te; Irish ag; English is a-going < on going. Posture verbs are the commonest source of progressives there is.',
    },
    {
        id: 'locative-from-body',
        sources: ['back', 'face', 'belly', 'head', 'side'], pos: 'n', axis: 'nominal',
        cell: 'LOC', label: 'locative case',
        attested: 'The commonest cline on Earth: body part → adposition → case affix. Hausa bāya "back" is also "behind"; Hebrew lifnei "before" < panim "face"; the Uralic and Turkic local cases go back to postposed nouns.',
    },
    {
        id: 'instrumental-from-adposition',
        sources: ['with', 'in', 'at'], pos: 'adp', axis: 'nominal',
        cell: 'INS', label: 'instrumental case',
        attested: 'Postpositions bond into case suffixes across Uralic, Turkic and Dravidian; the Hungarian and Finnish local cases are the standard demonstration.',
    },
    {
        id: 'ablative-from-adposition',
        sources: ['from', 'towards', 'through'], pos: 'adp', axis: 'nominal',
        cell: 'ABL', label: 'ablative case',
        attested: 'Same mechanism; the Indo-Aryan case systems were rebuilt this way after the Old Indo-Aryan one collapsed, which is renewal following loss.',
    },
    {
        id: 'definite-from-demonstrative',
        sources: ['that', 'this'], pos: 'dem', axis: 'nominal',
        cell: 'DEF', label: 'definite article',
        attested: 'Latin ille gave French le, Spanish el, Italian il. Where the article ends up SUFFIXED it is an extra paradigm slot exactly as modelled here: Romanian lup / lupul, Bulgarian, Albanian, Swedish hus / huset.',
    },
];

/**
 * How likely a language is to start down some cline in a given stretch.
 *
 * Deliberately low. Grammaticalisation is regular but it is not frequent: a
 * language acquires a new bound category every few thousand years, not every
 * few centuries, and a generator that handed out a new case every edge would
 * produce polysynthesis by the year 1000.
 */
function renewalPressure(years, rate) {
    return Math.max(0, Math.min(0.5, 0.16 * (years / 1000) * rate));
}

/** And the likelihood that a slot marking nothing is finally dropped. */
function lossPressure(years, rate) {
    return Math.max(0, Math.min(0.7, 0.30 * (years / 1000) * rate));
}

/**
 * How a morphological type bends both. Agglutinative case systems hold and
 * grow: Proto-Uralic's six or seven cases became Finnish's fifteen and
 * Hungarian's eighteen, Turkic and Mongolic have kept six to eight for as long
 * as they are recorded, and each new postposition that bonds is one more
 * suffix in a row of them. Fusional ones wear away, a case at a time, once
 * their endings fall together: Latin to French, Old English to English, Late
 * Common Slavic's syncretisms. With one rate for all, every family drifted to
 * three to five cases (31% of Andah's genera against 11% of Earth's) and
 * almost none kept six or more (6% against 32%).
 */
const TYPE_RENEWAL = { agglutinative: 1.6, polysynthetic: 2, fusional: 0.8, isolating: 0.5 };
const TYPE_LOSS = { agglutinative: 0.35, polysynthetic: 0.35, fusional: 1.4, isolating: 1 };
const typeOf = (state) => state.paradigm?.categories?.type ?? null;

// ---------------------------------------------------------------------------
// Reduction
// ---------------------------------------------------------------------------

/**
 * Cut a lexeme down to a bound morph.
 *
 * Grammatical material is short because it is frequent — Zipf's law of
 * abbreviation applies to bound morphemes more forcefully than to words, which
 * is why no language anywhere has a four-syllable case ending. The reduction
 * keeps the edge of the word that will face the stem: a suffix keeps its own
 * final syllable's material, a prefix its initial.
 *
 * Position follows the stress rule for the same reason `derivation.js` does it:
 * final stress shelters suffixes and starves everything before the stem, so a
 * language with final stress that built prefixes would erode them away as fast
 * as it made them.
 */
export function reduce(form, pt, position) {
    const keep = form.length <= 2 ? form.length : Math.max(2, Math.round(form.length / 2));
    const cut = position === 'suffix' ? form.slice(form.length - keep) : form.slice(0, keep);
    // A bound morph that is a bare consonant cluster is not pronounceable on
    // its own edge; trim to something with a vowel in it where possible.
    const hasVowel = cut.some((p) => p.type === 'V');
    if (hasVowel || form.length <= 2) return cut;
    const i = position === 'suffix'
        ? form.map((p) => p.type).lastIndexOf('V')
        : form.map((p) => p.type).indexOf('V');
    if (i < 0) return cut;
    return position === 'suffix' ? form.slice(i) : form.slice(0, i + 1);
}

export const affixPosition = (pt) => (pt?.stress?.rule === 'initial' ? 'prefix' : 'suffix');

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

/**
 * Decide whether this edge grammaticalises anything, and what.
 *
 * Planned from the PARENT alone: whether a cline is available depends on which
 * lexemes the language has and which categories it already marks, both of which
 * are properties of the parent. No projection is needed, unlike levelling.
 */
/**
 * How often an ISOLATING language bonds its first ending, per thousand years
 * (DJ, 18 Oct 2026: "yes, slowly"). The typological cycle runs both ways:
 * endings wear away (Latin to French to the analytic side of English), and an
 * isolating language's auxiliaries and particles can fuse to its verbs (the
 * Tibeto-Burman languages beside Chinese; Mandarin's -le, from liǎo "finish",
 * is on the way). Slow: most of a family stays isolating for millennia, and one
 * ending still leaves a language isolating by WALS's count (22A: 0-1
 * categories), as Mandarin is.
 */
const FIRST_INFLECTION = 0.04;

export function planGrammaticalisation(parentState, rng, { from, to, rate = 1 } = {}) {
    const paradigm = parentState.paradigm;
    if (!paradigm?.classes || !Object.keys(paradigm.classes).length) return planFirstInflection(parentState, rng, { from, to, rate });

    const years = Math.max(0, (to ?? from) - from);
    if (!rng.bool(Math.min(0.6, renewalPressure(years, rate) * (TYPE_RENEWAL[typeOf(parentState)] ?? 1)))) return [];

    const live = (parentState.entries || []).filter((e) => !e.retired && !e.paradigm);
    const byGloss = new Map();
    for (const e of live) if (!byGloss.has(e.gloss)) byGloss.set(e.gloss, e);

    // Which cells already exist anywhere in the paradigm — a language does not
    // grammaticalise a second future while it still has the first.
    const existing = new Set();
    for (const c of Object.values(paradigm.classes)) {
        for (const cell of Object.keys(c.cells || {})) existing.add(cell.split('.')[0]);
    }

    const available = CLINES.filter((cl) => {
        if (existing.has(cl.cell)) return false;
        const hasClass = Object.values(paradigm.classes).some((c) => (
            cl.axis === 'verbal' ? c.pos === 'v' : c.pos === 'n'
        ));
        if (!hasClass) return false;
        return cl.sources.some((g) => {
            const e = byGloss.get(g);
            return e && e.pos === cl.pos;
        });
    });
    if (!available.length) return [];

    /**
     * A free definite article is the likeliest thing to bond: the definiteness
     * cycle ends with "the" as an ending (Romanian lupul, Swedish huset,
     * Bulgarian -ът), so where the language has one (morphology/articles.js)
     * the definite cline is chosen far more often.
     */
    const freeArticle = ['word', 'demonstrative'].includes(paradigm.categories?.articles?.definite);
    const cline = rng.pickWeighted(available, (c) => (c.cell === 'DEF' && freeArticle ? 6 : 1));
    /**
     * The source is the FIRST listed gloss the language actually has, not a
     * random one. The ordering in each cline is by how often the path is
     * attested, so "go" beats "come" for a future because that is the way the
     * world's languages lean.
     */
    const sourceGloss = cline.sources.find((g) => byGloss.get(g)?.pos === cline.pos);
    const source = byGloss.get(sourceGloss);
    if (!source) return [];

    return [{
        id: `gram-${cline.id}`,
        year: Math.round(from + 0.5 * Math.max(1, years)),
        kind: 'grammaticalisation',
        cline: cline.id,
        cell: cline.cell,
        label: cline.label,
        axis: cline.axis,
        sourceId: source.id,
        sourceGloss,
        attested: cline.attested,
        note: `"${sourceGloss}" bleached and bonded to the word, giving a ${cline.label}`,
    }];
}

/** An isolating language's first ending: a verb of motion, finishing or holding bonds to the verb. */
function planFirstInflection(parentState, rng, { from, to, rate = 1 } = {}) {
    if (parentState.paradigm?.categories?.type !== 'isolating') return [];
    const years = Math.max(0, (to ?? from) - from);
    if (!rng.bool(Math.min(0.5, FIRST_INFLECTION * (years / 1000) * rate))) return [];
    const live = (parentState.entries || []).filter((e) => !e.retired && !e.paradigm);
    const byGloss = new Map();
    for (const e of live) if (!byGloss.has(e.gloss)) byGloss.set(e.gloss, e);
    const available = CLINES.filter((c) => c.axis === 'verbal' && c.sources.some((g) => byGloss.get(g)?.pos === c.pos));
    if (!available.length) return [];
    const cline = rng.pick(available);
    const sourceGloss = cline.sources.find((g) => byGloss.get(g)?.pos === cline.pos);
    const source = byGloss.get(sourceGloss);
    return [{
        id: `gram-first-${cline.id}`, year: Math.round(from + 0.5 * Math.max(1, years)), kind: 'grammaticalisation', first: true,
        cline: cline.id, cell: cline.cell, label: cline.label, axis: 'verbal', sourceId: source.id, sourceGloss, attested: cline.attested,
        note: `"${sourceGloss}" bonded to the verb: the language's first ending, a ${cline.label}`,
    }];
}

/** The persons a first verb paradigm is laid out in (all one form: no agreement yet). */
const FIRST_PERSONS = ['1SG', '2SG', '3SG', '1PL', '2PL', '3PL'];

/**
 * Decide whether a slot that no longer marks anything gets dropped.
 *
 * The condition is strict on purpose: the cell must be homophonous with the
 * same partner in EVERY class that has both. A distinction surviving anywhere
 * is a distinction, and dropping it while one declension still made it would be
 * inventing a change rather than modelling one.
 *
 * Needs the post-change paradigm, so it projects the parent's cells through
 * this edge's rules exactly as `analogy.js` does.
 */
export function planCategoryLoss(parentState, rules, rng, { from, to, rate = 1 } = {}) {
    // the moods are dropped by morphology/moods.js, not here
    const cellEntries = (parentState.entries || []).filter((e) => isParadigmEntry(e) && !isMoodCellEntry(e));
    if (cellEntries.length < 2) return [];

    const projected = evolveLexicon(cellEntries, rules, {
        phonotactics: parentState.phonotactics,
        stageId: `${parentState.langId}:project-loss`,
    }).entries;

    const classes = new Map();
    for (const e of projected) {
        const { cls, cell } = parseCellId(e.id);
        // a common word's own paradigm does not hold up the loss of a
        // distinction the regular classes have given up; the cell goes from
        // it too (morphology/irregular.js)
        if (isIrregularClass(cls)) continue;
        if (!classes.has(cls)) classes.set(cls, new Map());
        classes.get(cls).set(cell, e);
    }
    if (!classes.size) return [];

    const years = Math.max(0, (to ?? from) - from);
    const p = Math.min(0.85, lossPressure(years, rate) * (TYPE_LOSS[typeOf(parentState)] ?? 1));
    if (p <= 0) return [];

    const cellNames = [...new Set([...classes.values()].flatMap((m) => [...m.keys()]))];
    // Never drop the last remaining slot of a number: a language with no
    // nominative is not a language with a simpler case system, it is a broken
    // paradigm.
    const events = [];
    const dropped = new Set();

    for (let i = 0; i < cellNames.length; i++) {
        for (let j = i + 1; j < cellNames.length; j++) {
            const survivor = cellNames[i], candidate = cellNames[j];
            if (dropped.has(candidate)) continue;
            // The unmarked cell is always the survivor, so a cell is only ever
            // dropped in favour of one earlier in the table.
            let seen = 0, identical = 0;
            for (const cellMap of classes.values()) {
                const a = cellMap.get(survivor), b = cellMap.get(candidate);
                if (!a || !b) continue;
                seen += 1;
                if (wordToIpaStressed(a.form) === wordToIpaStressed(b.form)) identical += 1;
            }
            if (!seen || identical !== seen) continue;
            // Do not empty the table.
            const remaining = cellNames.filter((c) => !dropped.has(c)).length;
            if (remaining <= 2) continue;
            if (!rng.bool(p)) continue;
            dropped.add(candidate);
            events.push({
                id: `drop-${candidate}`,
                year: Math.round(from + 0.6 * Math.max(1, years)),
                kind: 'category-loss',
                cell: candidate,
                mergedWith: survivor,
                note: `${candidate} had become identical to ${survivor} in every class; the language stopped marking it`,
                attested: 'Latin\'s cases became homophonous class by class and were then abandoned outright, their work taken over by prepositions and word order — Old French kept two, Modern French none',
            });
        }
    }
    return events;
}

// ---------------------------------------------------------------------------
// Application
// ---------------------------------------------------------------------------

/**
 * Apply grammaticalisations and category losses to an evolved lexicon.
 *
 * New cells join the lexicon as ordinary entries with the reserved `para:` id
 * shape, which is what makes the renewal real: from here on they are strings
 * like any other, they undergo every later sound change, and they can erode
 * away and be replaced in turn.
 */
export function applyGrammaticalisation(entries, events, { phonotactics, paradigm } = {}) {
    if (!events?.length) return { entries, applied: [], categories: null };

    let out = entries.slice();
    const applied = [];
    let addedCells = [];
    let removedCells = [];
    let firstInflection = null;

    const table = () => {
        const m = new Map();
        for (const e of out) {
            if (!isParadigmEntry(e)) continue;
            const { cls, cell } = parseCellId(e.id);
            if (!m.has(cls)) m.set(cls, new Map());
            m.get(cls).set(cell, e);
        }
        return m;
    };

    for (const ev of events) {
        if (ev.kind === 'category-loss') {
            /**
             * Drop the NAMED CELL, not everything sharing its first component.
             *
             * Matching on the prefix was wrong in a way that only showed up on
             * verbs. A nominal cell is `CASE.NUMBER`, so dropping "GEN" plausibly
             * means both GEN.SG and GEN.PL; but a verbal cell is
             * `TENSE.PERSON`, and "PRS.3PL has become identical to PRS.3SG
             * everywhere" is a statement about the PERSON distinction, not about
             * the present tense. Dropping the whole tense on that evidence
             * deleted every present-tense cell in the language — and where a
             * class had nothing else left, the class itself disappeared.
             *
             * The evidence supports removing exactly the cell the evidence was
             * about. Anything wider is inventing a change.
             */
            const before = out.length;
            out = out.filter((e) => !(isParadigmEntry(e) && parseCellId(e.id).cell === ev.cell));
            if (out.length !== before) { applied.push(ev); removedCells.push(ev.cell); }
            continue;
        }

        const source = out.find((e) => e.id === ev.sourceId && !e.retired);
        if (!source) continue;
        const classes = table();
        const position = affixPosition(phonotactics);
        const morph = reduce(source.form, phonotactics, position);
        if (!morph.length) continue;
        if (ev.first) {
            // an isolating language's first ending: a verb paradigm built from nothing,
            // one exemplar per verb class, the bare verb as the present
            const byCls = new Map();
            for (const e of out) {
                if (e.pos !== 'v' || e.retired || e.paradigm || !e.class || e.derivedFrom || !e.form?.length) continue;
                if (!byCls.has(e.class)) byCls.set(e.class, []);
                byCls.get(e.class).push(e);
            }
            const made = [];
            for (const [cls, members] of byCls) {
                const sylls = members.map((m) => m.syllables ?? 1).sort((a, b) => a - b);
                const median = sylls[Math.floor(sylls.length / 2)];
                const pool = members.filter((m) => (m.syllables ?? 1) === median);
                const ex = (pool.length ? pool : members).reduce((b, m) => ((m.rank ?? 999) < (b.rank ?? 999) ? m : b));
                const mk = (cell, form) => ({
                    id: cellIdOf(cls, cell), form, ipa: wordToIpa(form), gloss: `${ex.gloss}.${cell}`, pos: 'v', domain: 'grammar', core: true,
                    rank: Math.max(1, ex.rank ?? 1), zipf: 0, class: cls, syllables: syllabify(form, phonotactics).length, irregular: false, derivedFrom: null,
                    paradigm: { cls, cell, stem: ex.id, stemGloss: ex.gloss },
                    ...(cell.startsWith(`${ev.cell}.`) ? { grammaticalisedFrom: { lexeme: ev.sourceId, gloss: ev.sourceGloss, year: ev.year, cline: ev.cline, attested: ev.attested } } : {}),
                });
                const bonded = repairHiatus(position === 'suffix' ? [...ex.form, ...morph] : [...morph, ...ex.form], phonotactics);
                for (const p of FIRST_PERSONS) made.push(mk(`PRS.${p}`, ex.form), mk(`${ev.cell}.${p}`, bonded));
            }
            if (!made.length) continue;
            out = [...out, ...made];
            addedCells.push(ev.cell);
            firstInflection = ev;
            applied.push({ ...ev, cells: made.length, morph: wordToIpa(morph), position });
            continue;
        }

        const made = [];
        for (const [cls, cellMap] of classes) {
            const pos = cls[0] === 'v' ? 'v' : (cls[0] === 'a' ? 'adj' : 'n');
            if (ev.axis === 'verbal' ? pos !== 'v' : pos !== 'n') continue;

            /**
             * The new cell is built on the EXISTING unmarked form, not on a
             * bare stem — because that is what happens. A postposition follows
             * an already-inflected noun; *cantare habeo* is an inflected verb
             * plus an auxiliary. The new marker stacks outside what is there.
             */
            const unmarked = [...cellMap.keys()][0]?.split('.')[0];
            for (const [cell, e] of cellMap) {
                const [slot, ...rest] = cell.split('.');
                if (slot !== unmarked) continue;  // build off the unmarked slot only
                const newCell = [ev.cell, ...rest].join('.');
                if (cellMap.has(newCell)) continue;
                const form = repairHiatus(
                    position === 'suffix' ? [...e.form, ...morph] : [...morph, ...e.form],
                    phonotactics,
                );
                made.push({
                    id: cellIdOf(cls, newCell),
                    form,
                    ipa: wordToIpa(form),
                    gloss: `${e.paradigm?.stemGloss ?? e.gloss}.${newCell}`,
                    pos,
                    domain: 'grammar',
                    core: true,
                    rank: e.rank,
                    zipf: 0,
                    class: cls,
                    syllables: syllabify(form, phonotactics).length,
                    irregular: false,
                    derivedFrom: null,
                    paradigm: { cls, cell: newCell, stem: e.paradigm?.stem, stemGloss: e.paradigm?.stemGloss },
                    // Where this piece of grammar came from, kept on the entry
                    // so the panel can print the whole cline.
                    grammaticalisedFrom: {
                        lexeme: ev.sourceId, gloss: ev.sourceGloss, year: ev.year,
                        cline: ev.cline, attested: ev.attested,
                    },
                });
            }
        }
        if (!made.length) continue;
        out = [...out, ...made];
        addedCells.push(ev.cell);
        applied.push({ ...ev, cells: made.length, morph: wordToIpa(morph), position });
    }

    /**
     * The declared category lists move too, so the panel and the grammar sketch
     * describe the language the lexicon actually is.
     */
    let categories = null;
    if (paradigm?.categories && (addedCells.length || removedCells.length)) {
        const cats = { ...paradigm.categories };
        /**
         * A case (or tense) is gone only when NO cell of it is left. Dropping
         * GEN.PL, fallen together with NOM.PL, struck GEN from the list while
         * GEN.SG still stood apart, so the lists under-counted: Emaran was
         * listed with two cases while its nouns kept a distinct dative,
         * locative and ablative, and the typology counted the two.
         */
        const alive = new Set(out.filter(isParadigmEntry).map((e) => parseCellId(e.id).cell.split('.')[0]));
        const strip = (list) => (list || []).filter((c) => alive.has(c) || !removedCells.some((r) => r.split('.')[0] === c));
        cats.cases = strip(cats.cases);
        cats.tenses = strip(cats.tenses);
        /**
         * A GENDER goes the same way: when its agreement endings have fallen
         * together with another gender's everywhere, it is gone, and its nouns
         * join the gender it merged with, as Latin's neuters became Romance
         * masculines (morphology/gender.js). One gender left is no gender.
         */
        if ((cats.genders || []).length) {
            const before = cats.genders;
            cats.genders = strip(cats.genders);
            const dead = before.filter((g) => !cats.genders.includes(g));
            if (dead.length) {
                const into = new Map();
                for (const ev of applied) {
                    if (ev.kind !== 'category-loss') continue;
                    const g = ev.cell.split('.')[0], m = String(ev.mergedWith || '').split('.')[0];
                    if (dead.includes(g) && cats.genders.includes(m)) into.set(g, m);
                }
                out = out.map((e) => (e.pos === 'n' && dead.includes(e.gender)
                    ? { ...e, gender: into.get(e.gender) ?? cats.genders[0] ?? null } : e));
            }
            if (cats.genders.length < 2) cats.genders = [];
        }
        // An article is not a case: a suffixed DEF (Romanian lupul, Swedish
        // huset) was listed among the cases and counted as one.
        cats.cases = cats.cases.filter((c) => c !== 'DEF');
        if (alive.has('DEF')) cats.definite = true;
        // the first ending: the language now inflects, and inflects as an agglutinating one does
        if (firstInflection) {
            cats.tenses = ['PRS'];
            cats.persons = FIRST_PERSONS;
            cats.type = 'agglutinative';
            cats.typeFrom = { type: 'isolating', year: firstInflection.year, cline: firstInflection.cline };
        }
        for (const ev of applied) {
            if (ev.kind !== 'grammaticalisation') continue;
            if (ev.cell === 'DEF') { cats.definite = true; continue; }
            const key = CLINES.find((c) => c.id === ev.cline)?.axis === 'verbal' ? 'tenses' : 'cases';
            if (!cats[key].includes(ev.cell)) cats[key] = [...cats[key], ev.cell];
        }
        categories = cats;
    }

    return { entries: out, applied, categories };
}

/** Readable log for the panel and the CLI. */
export function formatGrammaticalisation(events) {
    if (!events?.length) return '';
    return events.map((ev) => (
        ev.kind === 'category-loss'
            ? `  c.${String(ev.year).padStart(5)}  − ${ev.cell} dropped\n        ${ev.note}`
            : `  c.${String(ev.year).padStart(5)}  + ${ev.cell} (${ev.label}) < "${ev.sourceGloss}"${ev.morph ? ` → -${ev.morph}` : ''}\n        ${ev.note}`
    )).join('\n');
}
