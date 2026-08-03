/**
 * Lexurgy .lsc export.
 *
 * Lexurgy is the sound-change applier DJ already uses, so a ruleset that leaves
 * this engine should arrive there runnable rather than as something to retype.
 *
 * ## Features are expanded to explicit segments, deliberately
 *
 * This engine's rules match on FEATURE BUNDLES: "any voiceless stop", "any
 * front vowel". Lexurgy has its own feature system, and translating one into
 * the other is a lossy guess — its features are declared per-project and mine
 * are built into the phoneme model, so a bundle that means one thing here can
 * mean something subtly different there.
 *
 * So every matcher is expanded against the stage's actual inventory into an
 * explicit segment set. `[C,stop,-voice] > [+voice] / V _ V` becomes
 *
 *     {p, t, k} => {b, d, ɡ} / {a, e, i, o, u} _ {a, e, i, o, u}
 *
 * which is always valid Lexurgy, is unambiguous, and says exactly what the rule
 * did in this language. It is more verbose and it cannot be wrong.
 */

import { applyDelta } from '../features.js';
import { segmentMatches } from '../soundchange/rule.js';

/** Every inventory segment a matcher accepts. */
function expand(matcher, inventory) {
    if (!matcher) return [];
    const all = [...inventory.consonants, ...inventory.vowels];
    if (matcher.seq) return null;                       // sequences handled separately
    const m = matcher.match || matcher;
    return all.filter((ph) => {
        try { return segmentMatches(ph, m); } catch { return false; }
    });
}

/** Lexurgy set syntax: a bare symbol if there is one, braces otherwise. */
function setOf(segments) {
    if (!segments || !segments.length) return null;
    if (segments.length === 1) return segments[0].ipa;
    return `{${segments.map((s) => s.ipa).join(', ')}}`;
}

/** One side of a rule. */
function side(spec, inventory, matched) {
    if (!spec || spec.empty === true) return '*';       // Lexurgy writes deletion as *
    if (spec.set !== undefined) return Array.isArray(spec.set) ? spec.set.join('') : spec.set;
    if (spec.seq) return spec.seq.map((m) => setOf(expand(m, inventory)) ?? '?').join(' ');
    if (spec.swap) return null;                          // metathesis: not expressible this way
    if (spec.keep !== undefined) return null;
    if (spec.assimilate) return null;
    if (spec.delta) return null;                         // handled by the caller
    return setOf(expand(spec, inventory));
}

/** Environment: Lexurgy writes `/ before _ after`, with `$` for a word edge. */
function environment(env, inventory) {
    const part = (list) => (list || []).map((m) => {
        if (m.boundary === '#') return '$';
        if (m.not) return null;                          // negation is expressed differently
        if (m.any) {
            const segs = m.any.flatMap((sub) => (sub.boundary === '#' ? [] : expand(sub, inventory)));
            const s = setOf(segs);
            return m.any.some((sub) => sub.boundary === '#') ? `{${s ? s.replace(/^\{|\}$/g, '') : ''}, $}` : s;
        }
        return setOf(expand(m, inventory));
    });
    const before = part(env?.before);
    const after = part(env?.after);
    if ((before.some((x) => x === null)) || (after.some((x) => x === null))) return null;
    if (!before.length && !after.length) return '';
    return ` / ${before.join(' ')} _ ${after.join(' ')}`.replace(/\s+/g, ' ').replace(/ $/, '');
}

/**
 * Translate one rule.
 *
 * Returns null for the constructs Lexurgy's basic rule syntax cannot express
 * as a simple substitution — metathesis, feature copying, compensatory
 * lengthening. Those are emitted as a comment instead of as a silently wrong
 * rule, because a ruleset that runs and produces the wrong output is worse than
 * one that tells you what is missing.
 */
export function ruleToLexurgy(rule, inventory) {
    const from = rule.a;
    const to = rule.b;

    // Feature-delta outputs need the matched set to compute their images.
    if (to?.delta) {
        const sources = expand(from, inventory);
        if (!sources?.length) return null;
        const images = [];
        for (const ph of sources) {
            let out;
            try { out = applyDelta(ph, to.delta); } catch { return null; }
            if (!out) return null;
            images.push(out);
        }
        const env = environment(rule.env, inventory);
        if (env === null) return null;
        return `${setOf(sources)} => ${setOf(images)}${env}`;
    }

    if (to?.swap || to?.assimilate || to?.keep !== undefined) return null;

    const lhs = from?.seq
        ? from.seq.map((m) => setOf(expand(m, inventory)) ?? '?').join(' ')
        : (from?.empty === true ? '*' : setOf(expand(from, inventory)));
    const rhs = side(to, inventory);
    if (!lhs || rhs === null) return null;

    const env = environment(rule.env, inventory);
    if (env === null) return null;
    return `${lhs} => ${rhs}${env}`;
}

/**
 * A whole edge as a Lexurgy file.
 *
 * Rules that could not be translated are written as comments naming what they
 * did, so the file is honest about its own coverage rather than silently
 * incomplete.
 */
export function changeSetToLexurgy(changeSet, parentState, opts = {}) {
    const inv = parentState.inventory;
    const L = [];
    const name = opts.name || changeSet.childId;

    L.push(`# ${name}`);
    L.push(`# Generated from the Andah language tree.`);
    L.push(`# ${changeSet.from} to ${changeSet.to}, ${changeSet.rules.length} changes,`);
    L.push(`# about one per ${changeSet.interval} years.`);
    L.push('');
    L.push('# Feature matchers from the source engine are expanded into explicit');
    L.push('# segment sets against this stage\'s own inventory, so nothing depends');
    L.push('# on the two feature systems agreeing.');
    L.push('');

    const vowels = inv.vowels.map((v) => v.ipa);
    const consonants = inv.consonants.map((c) => c.ipa);
    if (vowels.length) L.push(`Class vowel {${vowels.join(', ')}}`);
    if (consonants.length) L.push(`Class consonant {${consonants.join(', ')}}`);
    L.push('');

    let translated = 0, skipped = 0;
    // Lexurgy requires rule names to be unique within a file, and a change type
    // can legitimately recur on one edge -- a language can merge two vowels
    // twice. Number the repeats rather than emitting a file it will reject.
    const usedNames = new Map();
    for (const rule of changeSet.rules) {
        const body = ruleToLexurgy(rule, inv);
        const base = String(rule.template || rule.id).replace(/[^a-z0-9]+/gi, '-').toLowerCase();
        const seen = (usedNames.get(base) || 0) + 1;
        usedNames.set(base, seen);
        const slug = seen === 1 ? base : `${base}-${seen}`;
        if (rule.analogue) L.push(`# ${rule.label}  --  cf. ${rule.analogue}`);
        else L.push(`# ${rule.label}`);
        if (body) {
            L.push(`${slug}:`);
            L.push(`    ${body}`);
            translated += 1;
        } else {
            L.push(`# NOT TRANSLATED: this engine expresses it as ${describeUntranslatable(rule)},`);
            L.push(`# which Lexurgy's basic substitution syntax cannot state directly.`);
            skipped += 1;
        }
        L.push('');
    }

    L.push(`# ${translated} of ${changeSet.rules.length} rules translated; ${skipped} left as comments.`);
    return L.join('\n');
}

function describeUntranslatable(rule) {
    if (rule.b?.swap) return 'metathesis';
    if (rule.b?.assimilate) return 'feature copying from a neighbour';
    if (rule.b?.keep !== undefined) return 'a two-segment collapse (compensatory lengthening or tonogenesis)';
    if (rule.env?.before?.some?.((m) => m.not) || rule.env?.after?.some?.((m) => m.not)) return 'a negative environment';
    return 'a construct outside simple substitution';
}
