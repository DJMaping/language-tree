/**
 * The sound change rule: representation and application.
 *
 * A rule has the shape linguists write as
 *
 *     A > B / X _ Y
 *
 * "A becomes B when preceded by X and followed by Y". A and B may be single
 * segments, feature bundles, sequences, or ∅ (for deletion and insertion).
 *
 * ## Two design decisions that carry the whole engine
 *
 * **Rules apply SIMULTANEOUSLY within themselves, and SEQUENTIALLY to each
 * other.** Every eligible position in a word is found against the word as it
 * was BEFORE the rule ran, and all of them change at once. A rule therefore
 * cannot feed itself: /ata/ under "a > e / _t" gives /eta/, not a runaway.
 * But the NEXT rule sees the output of this one, and that ordering is where
 * feeding, bleeding, counterfeeding and counterbleeding come from — the four
 * interactions that make a derived language look genuinely historical rather
 * than merely different.
 *
 * **Word boundaries are real positions.** The word is padded with boundary
 * sentinels so that `#_` (word-initial) and `_#` (word-final) are ordinary
 * environment matches rather than special cases. Word-final position is where a
 * startling proportion of all sound change happens — final devoicing, apocope,
 * cluster simplification, tonogenesis from lost codas — so it has to be cheap
 * to express.
 */

import { matches, applyDelta, parseWord, isVowel, wordToIpa, consonant, vowel } from '../features.js';
import { hashString } from '../rng.js';

/** Sentinel for a word edge. Never appears in a real segment array. */
export const BOUNDARY = Object.freeze({ id: '#', ipa: '#', type: 'B', f: Object.freeze({}) });

const EMPTY = new Set(['∅', '0', '']);
const isEmpty = (x) => x == null || EMPTY.has(x) || x?.empty === true;

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/**
 * Does one segment satisfy one environment matcher?
 *
 * Extends the feature matcher from features.js with the things an environment
 * needs and a phoneme inventory doesn't: word boundaries, and stress.
 */
export function segmentMatches(seg, m) {
    if (!m) return true;

    /**
     * Negation, checked FIRST and before the boundary guard.
     *
     * The order matters. "Not after /s/" — the Germanic spirant law, which is
     * why "star" and "stone" kept their /t/ while "three" and "tooth" did not —
     * must be TRUE at the start of a word. A word edge is not an /s/. Checking
     * the boundary guard first would make every word-initial position fail
     * every negative environment, and the spirant law would silently block
     * Grimm's Law everywhere.
     */
    if (m.not !== undefined) return !segmentMatches(seg, m.not);

    /**
     * Disjunction, also checked BEFORE the boundary guard.
     *
     * `{any: [{type:'C'}, {boundary:'#'}]}` means "a consonant or a word edge",
     * and it is the natural way to write the environment for compensatory
     * lengthening: a coda is a coda whether the word continues or ends. If the
     * boundary guard ran first, the boundary alternative could never be
     * reached, and the rule would silently fail in the one environment it most
     * needs — word-finally. Latin *kasnus > cānus is word-medial; Ionic Greek
     * lost *-ns word-finally too.
     */
    if (m.any) return m.any.some((sub) => segmentMatches(seg, sub));

    if (m.boundary === '#') return seg === BOUNDARY;
    if (seg === BOUNDARY) return false;

    // Stress conditions read the feature baked onto the vowel by markStress().
    if (m.stress !== undefined) {
        const s = seg.type === 'V' ? (seg.f.stress || 0) : -1;
        if (m.stress === 'stressed' && s !== 1) return false;
        if (m.stress === 'unstressed' && s !== 0) return false;
        if (typeof m.stress === 'number' && s !== m.stress) return false;
    }
    const rest = { ...m };
    delete rest.boundary; delete rest.stress; delete rest.optional;
    if (Object.keys(rest).length === 0) return true;
    return matches(seg, rest);
}

/**
 * Match the target A at position i. Returns the number of segments consumed,
 * or -1 for no match.
 */
function matchTarget(padded, i, a) {
    if (isEmpty(a)) return 0; // insertion: consumes nothing
    const seq = a.seq || [a.match || a];
    for (let k = 0; k < seq.length; k++) {
        if (!segmentMatches(padded[i + k], seq[k])) return -1;
    }
    return seq.length;
}

/** Match the left environment: env.before[last] is adjacent to the target. */
function matchBefore(padded, i, before) {
    if (!before || !before.length) return true;
    for (let k = 0; k < before.length; k++) {
        const idx = i - before.length + k;
        if (idx < 0) return false;
        if (!segmentMatches(padded[idx], before[k])) return false;
    }
    return true;
}

/** Match the right environment: env.after[0] is adjacent to the target. */
function matchAfter(padded, i, after) {
    if (!after || !after.length) return true;
    for (let k = 0; k < after.length; k++) {
        const seg = padded[i + k];
        if (seg === undefined) return false;
        if (!segmentMatches(seg, after[k])) return false;
    }
    return true;
}

// ---------------------------------------------------------------------------
// Transformation
// ---------------------------------------------------------------------------

/**
 * Produce the replacement segments for one match.
 *
 * `b` may be:
 *   ∅ / {empty:true}          delete
 *   {delta: {...}}            change features of the matched segment(s)
 *   {set: 'f'} / {set:['f']}  replace with literal segments
 *   {assimilate: {...}}       copy features from a neighbour
 *   {swap: true}              metathesis of a two-segment target
 */
function transform(padded, i, len, b, ctx) {
    const matched = padded.slice(i, i + len);

    if (isEmpty(b)) return [];

    if (b.swap) return matched.slice().reverse();

    if (b.set !== undefined) {
        const spec = Array.isArray(b.set) ? b.set.join('') : b.set;
        const segs = parseWord(spec);
        /**
         * Inserted/replacing vowels inherit the SUPRASEGMENTALS of what they
         * replace. A segmental rule is not a licence to wipe the prosody: when
         * Mandarin's erhua rewrites a rime it keeps the tone; Cantonese and
         * Vietnamese vowel shifts keep theirs. Without this, every
         * `{set: 'ə'}` rule silently detones the language it applies to, and
         * `reduction-to-schwa` alone fires 84 times across the tree.
         *
         * Stress and tone are inherited; LENGTH and NASALITY deliberately are
         * not. A rule that writes a short vowel means a short vowel — the
         * Latin→Spanish diphthongisations and the length-collapse rule all
         * depend on being able to say so.
         */
        const donor = matched.find(isVowel);
        return segs.map((s) => (isVowel(s) && donor
            ? vowel({ ...s.f, stress: donor.f.stress, tone: s.f.tone ?? donor.f.tone })
            : s));
    }

    if (b.assimilate) {
        /**
         * Assimilation: copy features from a neighbour rather than naming a
         * target. This is what makes nasal place assimilation a single rule
         * instead of one rule per place — /n/ before /p/ becomes [m], before
         * /k/ becomes [ŋ], and the rule never has to enumerate them.
         */
        const { from = 'after', features = ['place'] } = b.assimilate;
        const donor = from === 'after' ? padded[i + len] : padded[i - 1];
        if (!donor || donor === BOUNDARY) return matched;
        const delta = {};
        for (const f of features) if (donor.f[f] !== undefined) delta[f] = donor.f[f];
        return matched.map((seg, k) => (k === (from === 'after' ? len - 1 : 0) ? applyDelta(seg, delta) : seg));
    }

    if (b.keep !== undefined) {
        /**
         * Keep one segment of a multi-segment match and discard the rest,
         * optionally transforming what survives.
         *
         * This is how a lost consonant leaves its trace on the vowel before it,
         * which is one of the most important patterns in historical phonology:
         *
         *   compensatory lengthening   VC > Vː   the syllable keeps its weight
         *   tonogenesis                VC > V́    the coda's cue moves to pitch
         *
         * In both cases something disappears and something else changes to
         * account for it. Expressing them as "delete the coda" plus "lengthen
         * the vowel" as two separate rules would be wrong: they are one event,
         * and splitting them would let another rule run in between.
         */
        const survivor = matched[b.keep];
        if (!survivor || survivor === BOUNDARY) return matched;
        return [b.delta ? applyDelta(survivor, b.delta) : survivor];
    }

    if (b.delta) {
        return matched.map((seg) => (seg === BOUNDARY ? seg : applyDelta(seg, b.delta)));
    }

    return matched;
}

// ---------------------------------------------------------------------------
// Applying one rule to one word
// ---------------------------------------------------------------------------

/**
 * Apply a single rule to a word.
 *
 * @param segments  array of phonemes
 * @param rule      the rule
 * @param ctx       { rootId, rank } for probabilistic and frequency conditions
 * @returns { segments, applied, sites }
 */
export function applyRule(segments, rule, ctx = {}) {
    // ── Word-level gates, checked once ─────────────────────────────────────
    if (!passesConditions(rule, ctx)) return { segments, applied: false, sites: 0, skipped: 'conditions' };
    if (!passesProbability(rule, ctx)) return { segments, applied: false, sites: 0, skipped: 'diffusion' };

    const padded = [BOUNDARY, ...segments, BOUNDARY];
    const out = [];
    let sites = 0;
    let i = 0;

    // Copy the leading boundary through without emitting it.
    while (i < padded.length) {
        if (padded[i] === BOUNDARY) {
            // Boundaries are positions, not segments: never emitted, but a
            // zero-width insertion may be anchored at one.
            if (isEmpty(rule.a) && matchBefore(padded, i, rule.env?.before) && matchAfter(padded, i, rule.env?.after)) {
                out.push(...transform(padded, i, 0, rule.b, ctx));
                sites += 1;
            }
            i += 1;
            continue;
        }

        const len = matchTarget(padded, i, rule.a);
        const envOk = len >= 0
            && matchBefore(padded, i, rule.env?.before)
            && matchAfter(padded, i + Math.max(len, 0), rule.env?.after);

        if (envOk && isEmpty(rule.a)) {
            // Pure insertion before this segment.
            out.push(...transform(padded, i, 0, rule.b, ctx));
            sites += 1;
            out.push(padded[i]);
            i += 1;
            continue;
        }

        if (envOk && len > 0) {
            out.push(...transform(padded, i, len, rule.b, ctx));
            sites += 1;
            i += len;
            continue;
        }

        out.push(padded[i]);
        i += 1;
    }

    const result = out.filter((s) => s !== BOUNDARY);
    return { segments: result, applied: sites > 0, sites };
}

/** Frequency and domain gates. */
function passesConditions(rule, ctx) {
    const c = rule.conditions;
    if (!c) return true;
    if (c.maxRank != null && !(ctx.rank <= c.maxRank)) return false;
    if (c.minRank != null && !(ctx.rank >= c.minRank)) return false;
    if (c.domains && !c.domains.includes(ctx.domain)) return false;
    if (c.pos && !c.pos.includes(ctx.pos)) return false;
    return true;
}

/**
 * Lexical diffusion.
 *
 * A sound change does not always sweep the lexicon at once. Many spread word by
 * word, and stall — English still says "often" both with and without the /t/,
 * and the Chinese dialect literature is full of changes that took centuries and
 * never finished. A rule with probability < 1 models that.
 *
 * The draw is per-WORD and derived from the rule id plus the root id, never
 * from a running stream. That matters: it means whether a given word was caught
 * by a given change is a stable fact about that word, not an artefact of the
 * order in which the lexicon happened to be processed.
 */
function passesProbability(rule, ctx) {
    const p = rule.probability;
    if (p == null || p >= 1) return true;
    if (p <= 0) return false;
    /**
     * The draw is keyed on the LEXEME, not on the individual word-form.
     *
     * Lexical diffusion spreads word by word — but a paradigm's cells are not
     * separate words, they are inflected forms of one word. A change that
     * catches the nominative of a noun catches its locative too; speakers do
     * not metathesise one cell of a lexeme and leave an identical sister cell
     * alone. Giving each cell its own coin flip split homophonous cells back
     * apart, which showed up as a paradigm apparently UN-merging — something no
     * sound change can do.
     *
     * `diffusionKey` is the stem for a paradigm cell and the word's own id for
     * everything else.
     */
    const key = ctx.diffusionKey ?? ctx.rootId ?? '';
    const h = hashString(`${rule.id}|${key}`);
    return (h % 100000) / 100000 < p;
}

// ---------------------------------------------------------------------------
// Authoring helpers
// ---------------------------------------------------------------------------

/**
 * Compact rule constructor, so a ruleset reads close to how it would be
 * written on paper.
 *
 *   rule('p > f / #_', { a: {manner:'stop', voice:false}, ... })
 */
export function makeRule(spec) {
    return {
        id: spec.id,
        year: spec.year ?? null,
        category: spec.category ?? 'other',
        template: spec.template ?? null,
        label: spec.label ?? spec.id,
        a: spec.a,
        b: spec.b,
        env: spec.env ?? {},
        probability: spec.probability ?? 1,
        conditions: spec.conditions ?? null,
        analogue: spec.analogue ?? null,
        note: spec.note ?? null,
        stageId: spec.stageId ?? null,
    };
}

/** Shorthand: literal IPA string → target/replacement spec. */
export const lit = (ipa) => ({ seq: parseWord(ipa).map((ph) => ({ is: ph.ipa })) });
export const to = (ipa) => ({ set: ipa });
export const del = { empty: true };

/** Human-readable A > B / X _ Y, for the change log. */
export function formatRule(rule) {
    const side = (x) => {
        if (isEmpty(x)) return '∅';
        if (x.set !== undefined) return Array.isArray(x.set) ? x.set.join('') : x.set;
        if (x.swap) return '(metathesis)';
        if (x.assimilate) return `[α${x.assimilate.features.join(' α')}]`;
        if (x.delta) return `[${Object.entries(x.delta).map(([k, v]) => `${fmtVal(v)}${k}`).join(', ')}]`;
        return describeMatcher(x);
    };
    const env = rule.env || {};
    const ctxL = (env.before || []).map(describeMatcher).join(' ');
    const ctxR = (env.after || []).map(describeMatcher).join(' ');
    const envStr = (ctxL || ctxR) ? ` / ${ctxL} _ ${ctxR}`.replace(/\s+/g, ' ') : '';
    const prob = rule.probability != null && rule.probability < 1 ? `  (${Math.round(rule.probability * 100)}% of words)` : '';
    return `${side(rule.a)} > ${side(rule.b)}${envStr}${prob}`;
}

function fmtVal(v) {
    if (v === true) return '+';
    if (v === false) return '−';
    if (typeof v === 'string' && /^[+-]/.test(v)) return v;
    return '';
}

/**
 * The line a human reads: the rule's own label if it has one, with the formal
 * notation alongside. A ruleset is authored with labels precisely so the change
 * log doesn't have to be read as feature algebra.
 */
export function ruleLine(rule) {
    const formal = formatRule(rule);
    if (!rule.label || rule.label === rule.id) return formal;
    return rule.label === formal ? formal : `${rule.label}   ·   ${formal}`;
}

function describeMatcher(m) {
    if (!m) return '';
    if (m.not !== undefined) return `¬${describeMatcher(m.not)}`;
    if (m.boundary === '#') return '#';
    if (m.any) return `{${m.any.map(describeMatcher).join('|')}}`;
    if (m.seq) return m.seq.map(describeMatcher).join('');
    if (m.match) return describeMatcher(m.match);
    if (m.is !== undefined) return Array.isArray(m.is) ? `{${m.is.join(',')}}` : m.is;
    if (m.class !== undefined) return `[${Array.isArray(m.class) ? m.class.join('/') : m.class}]`;
    const bits = [];
    if (m.stress) bits.push(m.stress === 'stressed' ? 'V́' : 'V̀');
    for (const [k, v] of Object.entries(m)) {
        if (['stress', 'boundary', 'optional', 'not', 'any'].includes(k)) continue;
        if (k === 'type') { bits.push(v === 'V' ? 'V' : 'C'); continue; }
        bits.push(describeFeature(k, v));
    }
    return bits.length ? `[${bits.join(',')}]` : '?';
}

/** One feature constraint, in the notation a phonologist would write. */
function describeFeature(key, v) {
    if (v === true) return `+${key}`;
    if (v === false) return `−${key}`;
    if (v && typeof v === 'object') {
        if ('not' in v) return `−${key}=${v.not}`;
        if ('min' in v || 'max' in v) return `${key}∈${v.min ?? ''}..${v.max ?? ''}`;
    }
    if (Array.isArray(v)) return `${key}∈{${v.join(',')}}`;
    if (typeof v === 'string' && /^[+-]/.test(v)) return `${v}${key}`;
    return `${key}=${v}`;
}
