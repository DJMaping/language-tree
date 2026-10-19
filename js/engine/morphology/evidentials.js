/**
 * Evidentials: saying how you know (17 Oct 2026, DJ: "I do want these to be
 * incredibly complicated like languages"; from the judged design against the
 * WALS data on disk).
 *
 * More than half of Earth's languages mark, in the grammar, how the speaker
 * knows what they say (WALS 77A, de Haan: 237 of 418). Most mark only that
 * the speaker did NOT see it (166, "indirect only": heard it, the
 * reportative; worked it out, the inferential), some also that they did (71,
 * "direct and indirect": Quechua -mi "I saw", -si "I am told", -chá "I
 * suppose"). They are coded as an ending or clitic on the verb (131), a
 * separate particle (65: Tibetan, many Tibeto-Burman and Amazonian
 * languages), a past tense of their own (24: Turkish -miş, Bulgarian and the
 * Balkan "renarrative", Georgian's perfect, where the plain past is
 * first-hand by contrast), a modal form (7: German soll, "is said to"), or
 * several of these (10). WALS 78A.
 *
 * Where they come from (Aikhenvald 2004): a reportative from "say" (Tibetan
 * zer, Lhasa "it is said"), an inferential from "seem", "think" or a
 * perfect ("he has gone" > "he must have gone": Turkish -miş, Persian, the
 * Balkans), a direct marker from "see". A particle can bond to the verb and
 * become an ending, a set can be lost, and the whole category spreads by
 * contact (the Balkans, the Andes, the Caucasus, Turkic).
 *
 * The markers are words (pos 'part' or a bound morph, "evid:REP:...") or a
 * cell series (NFH.<person>, "non-firsthand", or the perfect itself), grammar
 * like the rest. Each lifetime's changes are a chain whose stationary shares
 * are Earth's for the language's class (verb position and whether it
 * inflects), the proto drawn at those shares; the pace was fitted to how
 * often WALS sisters still agree (0.66, 0.50).
 */

import { wordToIpa, wordToIpaStressed } from '../features.js';
import { repairHiatus, syllabify } from '../phonology/phonotactics.js';
import { isParadigmEntry, parseCellId, cellIdOf, makeEnding } from './paradigm.js';
import { reduce, affixPosition } from './grammaticalisation.js';
import { weakened } from './articles.js';

export const EVIDENTIAL_VALUES = ['none', 'indirect only', 'direct and indirect'];
export const CODING_VALUES = ['none', 'affix or clitic', 'separate particle', 'part of the tense system', 'modal morpheme', 'mixed'];
const CODING_LABEL = { affix: 'affix or clitic', particle: 'separate particle', tense: 'part of the tense system', modal: 'modal morpheme' };

/**
 * The states: 0 none; Ip indirect particle(s); Ia indirect affix(es); Im a
 * modal reportative; It a non-firsthand past; Dp, Da direct and indirect
 * particles, affixes; Dt a non-firsthand past with the plain past first-hand
 * by contrast; X Dt plus a reportative ending (mixed).
 */
const PROTO = {
    OV: { 0: 0.328, Ip: 0.132, Ia: 0.274, Im: 0.008, It: 0.014, Dp: 0.001, Da: 0.12, Dt: 0.079, X: 0.044 },
    SVO: { 0: 0.658, Ip: 0.101, Ia: 0.156, Im: 0.046, It: 0.005, Dp: 0, Da: 0.014, Dt: 0.018, X: 0.003 },
    V1: { 0: 0.479, Ip: 0.214, Ia: 0.263, Im: 0.001, It: 0, Dp: 0.001, Da: 0.04, Dt: 0.002, X: 0.001 },
    'isolating-SVO': { 0: 0.867, Ip: 0.067, Dp: 0.066 },
    'isolating-other': { 0: 0.619, Ip: 0.238, Dp: 0.143 },
};
/** Which terms a state has: second draw. */
const TERM_SETS = {
    Ip: [[['REP'], 0.75], [['INFR'], 0.25]],
    Ia: [[['REP'], 0.55], [['INFR'], 0.25], [['REP', 'INFR'], 0.2]],
    Dp: [[['DIR', 'REP'], 1]],
    Da: [[['DIR', 'REP'], 0.4], [['DIR', 'INFR'], 0.25], [['DIR', 'REP', 'INFR'], 0.35]],
};
/** Per thousand years before the branch rate. */
const LOSS = { lostP: 0.448, lostA: 0.196, lostM: 0.594, dirLost: 0.03, pastPlain: 0.05, mixLostA: 0.367, particleJoin: 0.519 };
const GAIN = {
    OV: { rise: 0.362, perfect: 0.064, bond: 0.433, dir: 0.025, modal: 0.052 },
    SVO: { rise: 0.116, perfect: 0.007, bond: 0.308, dir: 0.005, modal: 0.256 },
    V1: { rise: 0.311, perfect: 0.002, bond: 0.247, dir: 0.009, modal: 0.006 },
    free: { rise: 0.252, perfect: 0.007, bond: 0.218, dir: 0.026, modal: 0.295 },
    'isolating-SVO': { rise: 0.069, perfect: 0, bond: 0, dir: 0.478, modal: 0 },
    'isolating-other': { rise: 0.276, perfect: 0, bond: 0, dir: 0.287, modal: 0 },
};
const STEP = 250;
const DIRECT_SHARE = 0.88;

/** Where each marker comes from (Aikhenvald 2004). */
export const EVIDENTIAL_SOURCES = {
    REP: { glosses: ['say', 'tell', 'speak'], attested: 'Lhasa Tibetan reportative from "say"; Quechua -si; Estonian -vat' },
    INFR: { glosses: ['seem', 'think'], attested: 'inferentials from "seem" and "think"; Shipibo -bira' },
    DIR: { glosses: ['see'], attested: 'direct-evidence markers from "see"; Quechua -mi' },
};

export function evidClass(type, syntax = {}) {
    if (type === 'isolating') return syntax.order === 'SVO' ? 'isolating-SVO' : 'isolating-other';
    if (syntax.dominant === false) return 'free';
    if (syntax.headFinal ?? /^(SOV|OSV|OVS)$/.test(syntax.order || '')) return 'OV';
    return syntax.order === 'SVO' ? 'SVO' : 'V1';
}

/** The state code of a live system. */
export function evidentialState(sys) {
    const t = sys?.terms || {};
    const ind = ['REP', 'INFR', 'NFH'].filter((k) => t[k]);
    if (!ind.length) return '0';
    const codings = new Set(ind.map((k) => t[k].coding));
    const dir = !!t.DIR;
    if (codings.has('tense') && codings.size > 1) return 'X';
    if (codings.has('tense')) return dir ? 'Dt' : 'It';
    if (codings.has('modal')) return 'Im';
    if (codings.has('affix')) return dir ? 'Da' : 'Ia';
    return dir ? 'Dp' : 'Ip';
}

/** The proto's spec: two draws whatever is declared. */
export function drawEvidentialSpec(rng, { type, order }, declared = {}) {
    const headFinal = /^(SOV|OSV|OVS)$/.test(order || '');
    const cls = evidClass(type, { order, headFinal });
    const W = PROTO[cls] || PROTO.SVO;
    const drawn = rng.pickWeighted(Object.keys(W), (k) => W[k]);
    const u = rng.next();
    const state = declared.evidentials === 'none' ? '0' : declared.evidentials && W[declared.evidentials] != null ? declared.evidentials : drawn;
    let terms = [];
    const sets = TERM_SETS[state];
    if (sets) { let acc = 0; for (const [ts, w] of sets) { acc += w; if (u < acc) { terms = ts; break; } } if (!terms.length) terms = sets[sets.length - 1][0]; }
    const reason = state === '0' ? 'no evidentials, as about two languages in five'
        : `${{ Ip: 'a particle for what one did not see', Ia: 'an ending for what one did not see', Im: 'a modal for hearsay', It: 'a past of its own for what one did not see', Dp: 'particles for seen and unseen', Da: 'endings for seen and unseen', Dt: 'a past for what one did not see, the plain past for what one saw', X: 'a past for the unseen and a hearsay ending' }[state]}, drawn at Earth's rates`;
    return { spec: { state, terms }, reason };
}

// --- forms ----------------------------------------------------------------------------------

const live = (entries, gloss, pos) => entries.find((e) => e.gloss === gloss && (!pos || e.pos === pos) && !e.retired && !e.paradigm && e.form?.length) || null;
function sourceFor(entries, term) {
    for (const g of EVIDENTIAL_SOURCES[term].glosses) { const e = live(entries, g, 'v'); if (e) return e; }
    return null;
}
/** A marker word or ending made from its source. */
export function makeMarker(term, source, pt, { bound = null, year = null } = {}) {
    const form = bound ? reduce(source.form, pt, bound) : weakened(source.form, pt);
    return {
        id: `evid:${term}:${source.id}${bound ? ':b' : ''}`, form, ipa: wordToIpa(form),
        gloss: { REP: 'reportative ("they say")', INFR: 'inferential ("it seems")', DIR: 'direct ("I saw")' }[term],
        pos: 'part', domain: 'grammar', core: false, rank: Math.max(1, source.rank ?? 1), zipf: 0,
        syllables: syllabify(form, pt).length, irregular: false, derivedFrom: null, evidential: term, bound,
        paradigm: { cls: 'evid', cell: term, stem: source.id, stemGloss: source.gloss },
        grammaticalisedFrom: { lexeme: source.id, gloss: source.gloss, year, cline: { REP: 'reportative-from-say', INFR: 'inferential-from-seem', DIR: 'direct-from-see' }[term], attested: EVIDENTIAL_SOURCES[term].attested },
    };
}
const particlePosition = (syntax, headFinal) => (syntax?.polar === 'particle-final' ? 'final' : syntax?.polar === 'particle-second' ? 'second'
    : syntax?.polar === 'particle-initial' ? 'initial' : (syntax?.headFinal ?? headFinal) ? 'final' : 'second');

/** Build the proto's evidentials from its spec. */
export function buildEvidentialSystem(entries, paradigm, spec, { pools, phonotactics: pt, type, morphs, headFinal, rng } = {}) {
    if (!spec || spec.state === '0') return { entries, system: null };
    let out = [...entries];
    const cats = paradigm?.categories || {};
    const terms = {};
    const coding = { Ip: 'particle', Dp: 'particle', Ia: 'affix', Da: 'affix' }[spec.state];
    const bound = coding === 'affix' ? affixPosition(pt) : null;
    for (const t of spec.terms || []) {
        const src = sourceFor(out, t);
        if (!src) continue;
        const m = makeMarker(t, src, pt, { bound });
        out.push(m);
        terms[t] = { coding, marker: m.id, position: coding === 'particle' ? particlePosition(null, headFinal) : null, source: src.gloss, since: null };
    }
    const persons = (cats.persons || []).filter((p) => !p.includes('>'));
    if (['It', 'Dt', 'X'].includes(spec.state) && type !== 'isolating' && persons.length) {
        // a past of its own for what the speaker did not see, beside the plain past
        let morph = makeEnding(pools, rng, { zeroAllowed: false });
        for (const [cls, c] of Object.entries(paradigm.classes || {})) {
            if (c.pos !== 'v') continue;
            const stem = out.find((e) => e.id === c.exemplarId);
            if (!stem?.form?.length) continue;
            for (const p of persons) {
                const person = morphs?.person?.[p] || [];
                // the person marker on its own side of the stem (persons before it: Swahili)
                const form = repairHiatus(cats.personPosition === 'prefix' ? [...person, ...stem.form, ...morph] : [...stem.form, ...morph, ...person], pt);
                const e = { id: cellIdOf(cls, `NFH.${p}`), form, ipa: wordToIpa(form), gloss: `${stem.gloss}.NFH.${p}`, pos: 'v', domain: 'grammar', core: true,
                    rank: Math.max(1, stem.rank ?? 1), zipf: 0, class: cls, syllables: syllabify(form, pt).length, irregular: !!stem.irregular, derivedFrom: null,
                    paradigm: { cls, cell: `NFH.${p}`, stem: stem.id, stemGloss: stem.gloss } };
                out.push(e);
                c.cells[`NFH.${p}`] = { ending: wordToIpa(morph), form, ipa: e.ipa, key: wordToIpaStressed(form) };
            }
            if (!morphs) morph = makeEnding(pools, rng, { zeroAllowed: false });
        }
        terms[spec.state === 'X' ? 'INFR' : 'NFH'] = { coding: 'tense', marker: null, slot: 'NFH', source: null, since: null };
        if (spec.state !== 'It') terms.DIR = { coding: 'tense', marker: null, slot: 'PST', byContrast: true, source: null, since: null };
        if (spec.state === 'X') {
            const src = sourceFor(out, 'REP');
            if (src) { const m = makeMarker('REP', src, pt, { bound: affixPosition(pt) }); out.push(m); terms.REP = { coding: 'affix', marker: m.id, source: src.gloss, since: null }; }
        }
    }
    if (spec.state === 'Im' && cats.moods?.irrealis?.series === 'SBJV') terms.REP = { coding: 'modal', marker: null, slot: 'IRR', source: null, since: null };
    return Object.keys(terms).length ? { entries: out, system: { terms } } : { entries, system: null };
}

// --- change ---------------------------------------------------------------------------------

const NOTE = {
    rise: ['a word for "they say" or "it seems" came into use beside the verb', 'Lhasa Tibetan reportative from zer "say"'],
    bond: ['the evidential particle bonded to the verb as an ending', 'Quechua -mi and -si are clitics; many Tibeto-Burman particles became suffixes'],
    'dir-rise': ['a marker for what the speaker saw came into use', 'Quechua -mi "I saw it"'],
    'dir-lost': ['the marker for what the speaker saw fell out of use', 'direct markers are the first to go (Aikhenvald)'],
    lost: ['the evidentials fell out of use', 'evidential particles are often lost and renewed'],
    'reanalyse-perfect': ['the perfect came to mean "it seems" or "it is said": a past for what one did not see', 'Turkish -miş, Bulgarian and Macedonian, Georgian: the perfect turned non-firsthand'],
    'past-plain': ['the non-firsthand past became an ordinary past', 'a non-firsthand past can lose its evidential sense (Persian, in part)'],
    modal: ['a modal form came to report hearsay', 'German soll "is said to", the Latvian oblique mood'],
};

function outgoing(S, ec, elig) {
    const g = GAIN[ec] || GAIN.SVO;
    const affixing = !ec.startsWith('isolating');
    const L = LOSS;
    const perf = elig.perfect ? Math.min(0.5, g.perfect) : 0;
    switch (S) {
        case '0': return [['Ip', g.rise, 'rise'], ['Im', elig.sbjv ? g.modal : 0, 'modal'], ['PERF', perf, 'reanalyse-perfect']];
        case 'Ip': return [['Ia', affixing ? g.bond : 0, 'bond'], ['Dp', g.dir * (affixing ? 0.25 : 1), 'dir-rise'], ['X', perf, 'reanalyse-perfect'], ['0', L.lostP, 'lost']];
        case 'Ia': return [['Da', g.dir, 'dir-rise'], ['X', perf, 'reanalyse-perfect'], ['0', L.lostA, 'lost']];
        case 'Im': return [['0', L.lostM, 'lost']];
        case 'It': return [['Dt', g.dir, 'dir-rise'], ['0', L.pastPlain, 'past-plain']];
        case 'Dp': return [['Ip', L.dirLost, 'dir-lost'], ['Da', affixing ? g.bond : 0, 'bond'], ['0', L.lostP, 'lost']];
        case 'Da': return [['Ia', L.dirLost, 'dir-lost'], ['0', L.lostA * 0.15, 'lost']];
        case 'Dt': return [['X', L.particleJoin * g.rise, 'rise'], ['0', L.pastPlain, 'past-plain'], ['It', L.dirLost * 0.3, 'dir-lost']];
        case 'X': return [['Dt', L.mixLostA, 'lost'], ['Ia', L.pastPlain, 'past-plain']];
        default: return [];
    }
}

/**
 * Plan a lifetime's evidential changes from the language as founded: one draw
 * per 250 years walked through the state's outgoing rates (sub-choices draw
 * their own). Dated events, in order.
 */
export function planEvidentials(state, rng, { from, to, rate = 1, pending = [] } = {}) {
    const cats = state.paradigm?.categories;
    if (!cats) return [];
    const years = Math.max(0, (to ?? from) - from);
    const ec = evidClass(cats.type, state.syntax || {});
    let S = evidentialState(cats.evidentials);
    const tenses = new Set(cats.tenses || []);
    const perfectNow = tenses.has('PRF') || tenses.has('PFV');
    const perfectPending = (pending || []).find((g) => g.cell === 'PRF' || g.cell === 'PFV');
    const sbjv = cats.moods?.irrealis?.series === 'SBJV';
    const events = [];
    for (let t = 0; t < years; t += STEP) {
        const dt = Math.min(STEP, years - t);
        const k = (dt / 1000) * rate;
        const year = Math.round(from + t + dt * rng.float(0.2, 0.8));
        const elig = { perfect: perfectNow || (perfectPending && perfectPending.year <= year), sbjv };
        const r = rng.next();
        let acc = 0;
        for (const [to0, p, step] of outgoing(S, ec, elig)) {
            if (!p) continue;
            acc += p * k;
            if (r >= acc) continue;
            // a perfect turned non-firsthand mostly leaves the plain past as first-hand (Turkish, Bulgarian)
            const next = to0 === 'PERF' ? (rng.bool(DIRECT_SHARE) ? 'Dt' : 'It') : to0;
            const ev = { kind: 'evidential', step, from: S, to: next, year, note: NOTE[step][0], attested: NOTE[step][1] };
            if (step === 'rise') ev.term = rng.bool(0.75) ? 'REP' : 'INFR';
            if (step === 'reanalyse-perfect') ev.slot = tenses.has('PRF') || perfectPending?.cell === 'PRF' ? 'PRF' : 'PFV';
            events.push(ev);
            S = next;
            break;
        }
    }
    return events;
}

/**
 * Apply a lifetime's evidential events, then the sync: a marker worn to
 * nothing is gone with its term; a direct term without an indirect one goes.
 */
export function applyEvidentials(entries, events, { phonotactics: pt, categories, syntax } = {}) {
    const sys0 = categories?.evidentials || null;
    let out = entries;
    let terms = { ...(sys0?.terms || {}) };
    const applied = [];
    const made = [];
    const drop = (keys) => { for (const k of keys) { if (terms[k]?.marker) out = out.filter((e) => e.id !== terms[k].marker); delete terms[k]; } };
    const addMarker = (term, coding, year) => {
        const src = sourceFor(out, term);
        if (!src) return false;
        const bound = coding === 'affix' ? affixPosition(pt) : null;
        const m = makeMarker(term, src, pt, { bound, year });
        out = [...out.filter((e) => e.id !== m.id), m];
        made.push(m.id);
        terms[term] = { coding, marker: m.id, position: coding === 'particle' ? particlePosition(syntax) : null, source: src.gloss, since: year };
        return true;
    };
    for (const ev of events || []) {
        const S = evidentialState({ terms });
        if (ev.from !== S) continue;
        const affixState = ['Ia', 'Da'].includes(S);
        if (ev.step === 'rise') {
            const coding = S === 'Dt' ? 'affix' : 'particle';
            if (!addMarker(S === 'Dt' ? 'REP' : ev.term, coding, ev.year)) continue;
            if (S === 'Dt' && terms.NFH) { terms.INFR = { ...terms.NFH }; delete terms.NFH; }
        } else if (ev.step === 'bond') {
            let any = false;
            for (const k of ['REP', 'INFR', 'DIR']) {
                if (terms[k]?.coding !== 'particle') continue;
                const old = out.find((e) => e.id === terms[k].marker);
                const src = old ? out.find((e) => e.id === old.paradigm?.stem) || old : null;
                if (!src?.form?.length) continue;
                const position = affixPosition(pt);
                const m = { ...makeMarker(k, src, pt, { bound: position, year: ev.year }), form: reduce(old.form, pt, position) };
                m.ipa = wordToIpa(m.form);
                out = [...out.filter((e) => e.id !== old.id && e.id !== m.id), m];
                made.push(m.id);
                terms[k] = { ...terms[k], coding: 'affix', marker: m.id, position: null };
                any = true;
            }
            if (!any) continue;
        } else if (ev.step === 'dir-rise') {
            if (['It'].includes(S)) terms.DIR = { coding: 'tense', marker: null, slot: 'PST', byContrast: true, source: null, since: ev.year };
            else if (!addMarker('DIR', affixState ? 'affix' : 'particle', ev.year)) continue;
        } else if (ev.step === 'dir-lost') {
            drop(['DIR']);
        } else if (ev.step === 'lost') {
            if (S === 'X') drop(Object.keys(terms).filter((k) => terms[k].coding === 'affix'));
            else drop(Object.keys(terms));
        } else if (ev.step === 'reanalyse-perfect') {
            const cells = out.some((e) => isParadigmEntry(e) && parseCellId(e.id).cell.startsWith(`${ev.slot}.`));
            if (!cells) continue;
            const key = S === '0' ? 'NFH' : 'INFR';
            if (S !== '0') delete terms.INFR;
            terms[key] = { coding: 'tense', marker: null, slot: ev.slot, source: null, since: ev.year };
            if (S === '0' && ev.to === 'Dt') terms.DIR = { coding: 'tense', marker: null, slot: 'PST', byContrast: true, source: null, since: ev.year };
        } else if (ev.step === 'past-plain') {
            drop(Object.keys(terms).filter((k) => terms[k].coding === 'tense'));
            if (S === 'X' && terms.REP) { /* the hearsay ending stays: Ia */ }
        } else if (ev.step === 'modal') {
            if (categories?.moods?.irrealis?.series !== 'SBJV') continue;
            terms.REP = { coding: 'modal', marker: null, slot: 'IRR', source: null, since: ev.year };
        } else continue;
        applied.push(ev);
    }
    // sync
    for (const k of Object.keys(terms)) {
        const t = terms[k];
        if (t.marker) {
            const m = out.find((e) => e.id === t.marker);
            if (!m?.form?.length) { drop([k]); applied.push({ kind: 'evidential', step: 'merged', year: null, note: `the ${k} marker wore away`, attested: '' }); }
        } else if (t.coding === 'tense' && t.slot !== 'PST' && !out.some((e) => isParadigmEntry(e) && parseCellId(e.id).cell.startsWith(`${t.slot}.`))) {
            drop([k]);
        } else if (t.coding === 'modal' && categories?.moods?.irrealis?.series !== 'SBJV') drop([k]);
    }
    if (terms.DIR && !['REP', 'INFR', 'NFH'].some((k) => terms[k])) drop(['DIR']);
    if (!Object.keys(terms).length && out.some((e) => e.evidential)) out = out.filter((e) => !e.evidential);
    const sys = Object.keys(terms).length ? { terms } : null;
    const same = JSON.stringify(sys) === JSON.stringify(sys0);
    if (same && out === entries && !applied.length) return { entries, applied, made, categories: null };
    return { entries: out, applied, made, categories: same ? null : { ...categories, evidentials: sys } };
}

// --- reading ------------------------------------------------------------------------------------

/**
 * The term a language uses for how the speaker knows: 'reported' takes REP,
 * else the non-firsthand past, else a modal; 'inferred' INFR, else the
 * non-firsthand past; 'seen' DIR. Returns { term, ...settings } or null.
 */
export function chooseTerm(cats, wanted) {
    const t = cats?.evidentials?.terms || {};
    const order = { reported: ['REP', 'NFH'], inferred: ['INFR', 'NFH'], seen: ['DIR'] }[wanted] || [];
    for (const k of order) if (t[k]) return { term: k, ...t[k] };
    return null;
}

/** WALS 77A and 78A for a language. */
export function evidentialValues(state) {
    const t = state.paradigm?.categories?.evidentials?.terms || {};
    const entries = state.entries || [];
    const alive = (k) => {
        const x = t[k];
        if (!x) return false;
        if (x.marker) return !!entries.find((e) => e.id === x.marker)?.form?.length;
        return true;
    };
    const ind = ['REP', 'INFR', 'NFH'].filter(alive);
    if (!ind.length) return { evidentials: 'none', evidentialCoding: 'none' };
    const codings = new Set([...ind, ...(alive('DIR') ? ['DIR'] : [])].map((k) => t[k].coding));
    return {
        evidentials: alive('DIR') ? 'direct and indirect' : 'indirect only',
        evidentialCoding: codings.size > 1 ? 'mixed' : CODING_LABEL[[...codings][0]] ?? 'mixed',
    };
}

/** One line for notes and the panel. */
export function describeEvidentials(cats) {
    const t = cats?.evidentials?.terms;
    if (!t) return '';
    const say = (k) => ({ REP: 'hearsay', INFR: 'inference', NFH: 'the unseen', DIR: 'what one saw' }[k]);
    const how = (x) => ({ particle: 'a particle', affix: 'an ending', tense: 'a past of its own', modal: 'a modal form' }[x.coding]);
    return `evidentials: ${Object.keys(t).map((k) => `${say(k)} by ${t[k].byContrast ? 'the plain past' : how(t[k])}`).join(', ')}`;
}
