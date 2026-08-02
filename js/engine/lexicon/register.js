/**
 * Registers and dialects — a language is never one thing.
 *
 * Every stage in this engine is currently a single uniform idiolect: one form
 * per meaning, spoken identically by everybody, everywhere, in every situation.
 * No language has ever been like that, and the absence shows. Variation is not
 * noise on top of a language; it is the medium sound change travels in, and a
 * language without it reads as a specification rather than as something people
 * use.
 *
 * Two axes, because they are genuinely different phenomena with different
 * causes:
 *
 *   REGISTER   variation by SITUATION. The same speaker says different things
 *              in a courtroom and a pub.
 *   DIALECT    variation by PLACE. Different speakers, same situation,
 *              different forms.
 *
 * ## Register: the formal half is already there
 *
 * The formal register of a language with a classical ancestor is, to a
 * remarkable degree, just its learned vocabulary. English formal register is
 * Latinate (*commence*, *purchase*, *decapitate* against *begin*, *buy*,
 * *behead*); Japanese formal register is Sino-Japanese; Hindi's is Sanskritic;
 * Turkish spent the twentieth century deliberately replacing its Arabic and
 * Persian formal layer. `learned.js` generates that stratum already and stamps
 * it `register: 'formal'`, so half of this is done and was done for a different
 * reason.
 *
 * ## Register: the colloquial half is fast speech, and it is mechanical
 *
 * The other half is not a different vocabulary but the same vocabulary spoken
 * faster. The processes are well documented and they are conditioned by exactly
 * the thing this engine already tracks on every entry — frequency:
 *
 *   *going to* → *gonna*, *want to* → *wanna*, *camera* → *cam'ra*,
 *   *probably* → *prob'ly*, *next day* → *nex' day*, *let me* → *lemme*
 *
 * All of it happens to common words and none of it to rare ones, because
 * reduction is licensed by predictability: a listener can recover a frequent
 * word from less signal. That is Bybee's reducing effect of frequency, and it is
 * the same argument the engine already makes about levelling and suppletion,
 * pointed the other way.
 *
 * So the colloquial register is derived, not authored: three attested
 * fast-speech processes, applied to the head of the frequency curve, and only
 * where the result is something the language could actually say.
 *
 * ## Dialect: a change that stopped at a line on the map
 *
 * A sound change does not arrive everywhere. It spreads from somewhere and
 * stops, and where it stops is a dialect boundary. Northern English never
 * underwent the FOOT–STRUT split, which is why *put* and *putt* still rhyme in
 * Manchester and do not in London — one change, one isogloss, and two dialects
 * that differ in a way you can name and date.
 *
 * That is the model here, and it needs nothing new: a stage's own most recent
 * changes are the ones still in progress, so a dialect is simply the same stage
 * WITHOUT them. Both reflexes are real forms of the language and the panel can
 * show them side by side with the change that separates them named.
 *
 * Deliberately restrained. This is computed on demand for display, never folded
 * into `evolve()`, because a dialect is a view of a language and not a different
 * language — and because every display in the app would otherwise have to decide
 * which variant it meant.
 */

import { isVowel, wordToIpa } from '../features.js';
import { syllabify, assignStress, isLegalOnset, isLegalCoda, repairHiatus, repairClusters } from '../phonology/phonotactics.js';
import { evolveWord } from '../soundchange/apply.js';

// ---------------------------------------------------------------------------
// The colloquial register
// ---------------------------------------------------------------------------

/**
 * How likely a word is to have a reduced casual form.
 *
 * Steeply frequency-weighted, because that is the whole mechanism. The top of
 * the curve reduces almost always, the middle sometimes, the tail never — which
 * is why English has *gonna* and *wanna* and *dunno* and no casual form of
 * *perambulate*.
 */
function reductionChance(entry) {
    const r = entry.rank || 999;
    if (r <= 30) return 0.85;
    if (r <= 100) return 0.55;
    if (r <= 250) return 0.25;
    if (r <= 500) return 0.08;
    return 0;
}

/**
 * Delete an unstressed vowel in a medial syllable.
 *
 * Syncope, the commonest fast-speech process there is: *camera* → *cam'ra*,
 * *every* → *ev'ry*, *family* → *fam'ly*, *chocolate* → *choc'late*.
 *
 * Only in a MEDIAL syllable, and only when the consonants left behind form a
 * cluster the language actually licenses. English can lose the vowel of
 * *cam(e)ra* because /mr/ is a possible sequence; a language with no clusters at
 * all cannot syncopate anything, and correctly gets no casual forms by this
 * route.
 */
function syncope(form, pt, rng) {
    const sylls = assignStress(syllabify(form, pt), pt.stress?.rule);
    if (sylls.length < 3) return null;

    // Candidates: unstressed, not the first syllable, not the last.
    const candidates = [];
    for (let i = 1; i < sylls.length - 1; i++) {
        if (sylls[i].stress === 1) continue;
        if (sylls[i].nucleus.length !== 1) continue;   // leave diphthongs alone
        if (sylls[i].coda.length) continue;            // an open syllable reduces first
        candidates.push(i);
    }
    if (!candidates.length) return null;

    const target = rng.pick(candidates);
    const out = [];
    sylls.forEach((s, i) => {
        if (i === target) { out.push(...s.onset, ...s.coda); return; }
        out.push(...s.onset, ...s.nucleus, ...s.coda);
    });

    // Only if what is left is pronounceable by this language's own rules.
    const check = syllabify(out, pt);
    for (const s of check) {
        const onset = [...(s.appendix || []), ...s.onset];
        if (onset.length && !isLegalOnset(onset, pt)) return null;
        if (s.coda.length && !isLegalCoda(s.coda, pt)) return null;
    }
    return { form: out, process: 'syncope', note: 'an unstressed medial vowel dropped in casual speech — English "camera" → "cam\'ra", "every" → "ev\'ry"' };
}

/**
 * Drop the last consonant of a final cluster.
 *
 * *next day* → *nex' day*, *and* → *an'*, *old man* → *ol' man*. One of the most
 * robust casual-speech processes in any language that has final clusters at all,
 * and the source of a great many eventual sound changes — French lost every one
 * of its final consonants by this route.
 */
function finalClusterReduction(form, pt) {
    if (form.length < 3) return null;
    const last = form[form.length - 1];
    const prev = form[form.length - 2];
    if (isVowel(last) || isVowel(prev)) return null;
    const out = form.slice(0, -1);
    if (!isLegalCoda([prev], pt)) return null;
    return { form: out, process: 'cluster reduction', note: 'the last consonant of a final cluster dropped — English "next day" → "nex\' day", "old man" → "ol\' man"' };
}

/**
 * Centralise an unstressed vowel.
 *
 * Reduction towards schwa, which is what English does to almost every unstressed
 * vowel and what gives it its rhythm. Only available if the language has a
 * central vowel to reduce towards — a language with a strict five-vowel system
 * and no schwa cannot do this, and correctly does not.
 */
function centralise(form, pt, inventory) {
    const schwa = inventory.vowels.find((v) => v.ipa === 'ə')
        || inventory.vowels.find((v) => v.f.back === 2 && v.f.height === 3 && !v.f.long && !v.f.tone);
    if (!schwa) return null;

    const sylls = assignStress(syllabify(form, pt), pt.stress?.rule);
    if (sylls.length < 2) return null;

    let changed = false;
    const out = [];
    for (const s of sylls) {
        out.push(...s.onset);
        if (s.stress !== 1 && s.nucleus.length === 1 && s.nucleus[0].ipa !== schwa.ipa
            && !s.nucleus[0].f.long && !s.nucleus[0].f.tone) {
            out.push(schwa);
            changed = true;
        } else {
            out.push(...s.nucleus);
        }
        out.push(...s.coda);
    }
    if (!changed) return null;
    return { form: out, process: 'vowel reduction', note: 'unstressed vowels centralised towards schwa, which is what gives a stress-timed language its rhythm' };
}

/**
 * Derive the colloquial register for one stage.
 *
 * Returns only the entries that HAVE a distinct casual form — most do not, and a
 * list padded with words identical to their careful pronunciation would say
 * nothing.
 */
export function colloquialForms(state, rng, { limit = 400 } = {}) {
    const pt = state.phonotactics;
    const out = [];

    const pool = (state.entries || [])
        .filter((e) => !e.paradigm && !e.retired)
        .sort((a, b) => (a.rank || 999) - (b.rank || 999))
        .slice(0, limit);

    for (const e of pool) {
        const p = reductionChance(e);
        if (p <= 0 || !rng.bool(p)) continue;

        // Tried in the order fast speech actually applies them: lose a whole
        // syllable first, then trim the edges of what is left.
        const applied = [];
        let form = e.form;
        for (const step of [
            () => syncope(form, pt, rng),
            () => finalClusterReduction(form, pt),
            () => centralise(form, pt, state.inventory),
        ]) {
            const r = step();
            if (!r) continue;
            form = r.form;
            applied.push({ process: r.process, note: r.note });
        }
        if (!applied.length || wordToIpa(form) === e.ipa) continue;

        out.push({
            id: e.id,
            gloss: e.gloss,
            careful: e.ipa,
            casual: wordToIpa(form),
            carefulSpelling: state.romanisation.spell(e.form),
            casualSpelling: state.romanisation.spell(form),
            rank: e.rank,
            processes: applied,
        });
    }
    return out;
}

/**
 * The formal register: what the learned stratum contributed.
 *
 * Not generated — read off the lexicon, because the words are already there and
 * already marked. What makes this worth surfacing is the PAIRS: a formal word
 * and the everyday word that means the same thing, which is the *commence /
 * begin* relationship and the single most recognisable property of a language
 * with a prestige ancestor.
 */
export function formalRegister(state) {
    const learned = (state.entries || []).filter((e) => e.register === 'formal' || e.loan?.learned);
    const byGloss = new Map();
    for (const e of state.entries || []) {
        if (e.paradigm || e.retired || e.register === 'formal' || e.loan?.learned) continue;
        if (!byGloss.has(e.gloss)) byGloss.set(e.gloss, e);
    }
    return learned.map((e) => ({
        gloss: e.gloss,
        formal: e.ipa,
        formalSpelling: state.romanisation.spell(e.form),
        everyday: byGloss.get(e.gloss)?.ipa ?? null,
        everydaySpelling: byGloss.get(e.gloss) ? state.romanisation.spell(byGloss.get(e.gloss).form) : null,
        source: e.loan?.classicalSource ?? e.loan?.from ?? null,
        borrowedAt: e.loan?.year ?? null,
        /**
         * A learned borrowing that came out identical to the inherited word is
         * not a register pair. It happens whenever the intervening centuries
         * changed nothing about that word, and listing it would claim a
         * formal/everyday contrast the language does not have.
         */
    })).filter((p) => p.everyday && p.everyday !== p.formal);
}

// ---------------------------------------------------------------------------
// Dialects
// ---------------------------------------------------------------------------

/**
 * A dialect that did not undergo this stage's most recent changes.
 *
 * The isogloss model, done the cheap and correct way: take the stage's own
 * changeset, hold back the last `held` rules, and re-derive. What comes out is a
 * variety of the same language that is conservative in exactly one nameable
 * respect — which is what a dialect is.
 *
 * Why the LAST rules rather than a random subset: a change that arrived
 * recently is the one still spreading, and therefore the one most likely not to
 * have arrived everywhere. Changes from two thousand years ago have had time to
 * reach the whole speech area, and the ones that did not are no longer one
 * language's dialects — they are separate languages, and the chart already draws
 * those as branches.
 */
export function dialectVariants(project, langId, { held = 2, limit = 300 } = {}) {
    const state = project.stateOf(langId);
    const node = project.nodeOf(langId);
    if (!state?.changeSet || !node?.parentId) return null;

    const rules = state.changeSet.rules || [];
    if (rules.length <= held) return null;

    /**
     * A dialect needs time to form. A stage that lasted two centuries has not
     * had the chance to develop one, and claiming otherwise would put an
     * isogloss inside a single generation.
     */
    const parent = project.nodeOf(node.parentId);
    const span = (node.born ?? 0) - (parent?.born ?? 0);
    if (span < 400) return null;

    const kept = rules.slice(0, rules.length - held);
    const withheld = rules.slice(rules.length - held);
    const parentState = project.stateOf(node.parentId);
    if (!parentState) return null;

    const variants = [];
    const pool = (parentState.entries || []).filter((e) => !e.paradigm).slice(0, limit);
    for (const e of pool) {
        const conservative = evolveWord(e.form, kept, {
            rootId: e.id, rank: e.rank, domain: e.domain, pos: e.pos,
            // A loan must not be exposed to rules that predate its arrival,
            // exactly as in evolve().
            enteredAt: e.enteredAt,
            phonotactics: parentState.phonotactics, stageId: langId,
        });
        const standard = (state.entries || []).find((x) => x.id === e.id);
        if (!standard) continue;
        /**
         * Repaired the way evolve() repairs, or the comparison is not measuring
         * a dialect at all.
         *
         * The standard form on the other side of this comparison has been
         * through repairHiatus and repairClusters; the conservative one had
         * not, so every word the repair touched was reported as an isogloss.
         * Two thirds of Dahen-Kino's reported dialect difference was this —
         * 21% claimed against 9% real — and the other five families reported
         * differences that did not exist at all.
         */
        const cIpa = wordToIpa(repairClusters(
            repairHiatus(conservative.segments, parentState.phonotactics),
            parentState.phonotactics,
        ));
        if (cIpa === standard.ipa) continue;
        variants.push({ id: e.id, gloss: standard.gloss, standard: standard.ipa, conservative: cIpa });
    }

    return {
        langId,
        withheld: withheld.map((r) => ({ id: r.id, label: r.label, year: r.year })),
        variants,
        share: pool.length ? variants.length / pool.length : 0,
        note: 'A conservative area that the most recent changes did not reach. Northern English never underwent the FOOT–STRUT split, which is why "put" and "putt" still rhyme in Manchester.',
    };
}

/** Readable block for the CLI. */
export function formatRegisters(colloquial, formal, { limit = 8 } = {}) {
    const L = [];
    if (formal?.length) {
        L.push(`Formal register — ${formal.length} learned words with an everyday equivalent:`);
        for (const p of formal.slice(0, limit)) {
            L.push(`   "${p.gloss}"   formal ${p.formal}  /  everyday ${p.everyday}${p.borrowedAt != null ? `   (taken from ${p.source} c.${p.borrowedAt})` : ''}`);
        }
    }
    if (colloquial?.length) {
        if (L.length) L.push('');
        L.push(`Casual speech — ${colloquial.length} words with a reduced form:`);
        for (const c of colloquial.slice(0, limit)) {
            L.push(`   "${c.gloss}"   ${c.careful} → ${c.casual}   (${c.processes.map((p) => p.process).join(', ')})`);
        }
    }
    return L.length ? L.join('\n') : '(no register variation)';
}
