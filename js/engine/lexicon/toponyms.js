/**
 * The archaic name layer — why a place name is older than the language it sits
 * in, and how to say what happened to it.
 *
 * `names.js` already coins names as transparent compounds out of a stage's own
 * lexicon, and `coinAt()` already inherits a name forward from an ancestor so it
 * arrives worn. Two things were missing, and they are the two that make a
 * toponymy read like a real one.
 *
 * ## 1. Names are STRATIFIED, and a toponymy that is all one age is a giveaway
 *
 * Look at a map of England. The river names are the oldest things on it —
 * *Thames*, *Avon*, *Ouse*, *Trent* — mostly Brythonic or older, surviving two
 * complete language shifts because everyone downstream had to keep calling the
 * river something and the incomers learned the name from the people already
 * there. Above that sits a Roman layer (*-chester* < *castra*), then Old English
 * (*-ton*, *-ham*, *-ford*), then Norse in the Danelaw (*-by*, *-thorpe*,
 * *-thwaite*), then Norman, then eighteenth-century foundations that mean
 * exactly what they say.
 *
 * The same layering is everywhere. Australian toponymy is Aboriginal rivers and
 * mountains under English towns. Anatolian toponymy has Hittite under Greek
 * under Turkish. A generated map where every name was coined in the modern
 * language is the single most obvious tell that a world has no past.
 *
 * So names here are coined across a SPREAD of ancestor stages, and which stratum
 * a name belongs to depends on what it names:
 *
 *   rivers and mountains   oldest. Landscape outlives everybody.
 *   regions                old. A region is named by whoever held it first.
 *   settlements            mixed, weighted late — towns get founded.
 *   people                 current. Personal names follow fashion.
 *
 * ## 2. A name is opaque for a REASON, and the reason is printable
 *
 * `coinAt` marks a name opaque when it has changed twice, which is a proxy. The
 * real question a reader wants answered is *why can nobody parse this*, and
 * there are two independent answers that produce four different kinds of name:
 *
 *   PHONOLOGICAL   the sound changes wore the elements past recognition.
 *                  *Bristol* < *Brycgstow* "bridge place" — both words still
 *                  exist in English, and the name no longer looks like either.
 *
 *   LEXICAL        the element word itself was replaced in the ordinary
 *                  language, so even an unworn name would mean nothing.
 *                  *Wednesbury* is perfectly recoverable as "Woden's fort", and
 *                  is opaque because English no longer has Woden — or *burh*.
 *
 * They are independent, so:
 *
 * | element recoverable | word still current | reading |
 * |---|---|---|
 * | yes | yes | transparent — *Blackpool*, *Newcastle* |
 * | yes | no  | the word died — *Wednesbury*, *Grimsby* |
 * | no  | yes | worn past recognition — *Bristol*, *Nottingham* |
 * | no  | no  | wholly opaque — *London*, *Thames* |
 *
 * The bottom-left case is the interesting one and it is the one this module
 * exists to detect, because it links the onomastic layer directly to the lexical
 * replacement machinery: *the name is a fossil of a word the language no longer
 * has*. That is the sentence worth printing.
 */

import { wordToIpa } from '../features.js';
import { repairHiatus, repairClusters } from '../phonology/phonotactics.js';
import { evolveWord } from '../soundchange/apply.js';
import { generateName, pathChangeSets, coiningState, wearName } from './names.js';

/**
 * How deep into the past each kind of name is typically coined.
 *
 * `depth` is a fraction of the lineage from the family root (0) to the modern
 * stage (1), and `spread` is how much it varies. Rivers cluster near the root;
 * personal names sit at the leaf.
 */
export const STRATA = {
    river: { depth: 0.05, spread: 0.15, note: 'River names are the oldest layer in any toponymy. The Thames and the Avon survived two complete language shifts in Britain because the people downstream kept using them.' },
    mountain: { depth: 0.12, spread: 0.18, note: 'Landscape names outlive the people who coined them, for the same reason river names do.' },
    region: { depth: 0.25, spread: 0.25, note: 'A region carries the name of whoever held it first, which is usually not whoever holds it now.' },
    settlement: { depth: 0.55, spread: 0.35, note: 'Settlements are founded, renamed and founded again, so town names spread across every stratum from the oldest to last century.' },
    person: { depth: 0.95, spread: 0.08, note: 'Personal names follow fashion and are re-coined constantly, so they sit in the current language.' },
};

/** The chain of ancestors from the family root down to a language. */
export function lineageOf(project, langId) {
    const chain = [];
    for (let node = project.nodeOf(langId); node; node = node.parentId ? project.nodeOf(node.parentId) : null) {
        chain.unshift(node);
    }
    return chain;
}

/**
 * Run one word forward from an ancestor stage to a target, through the real
 * rulesets.
 *
 * The same walk `coinAt` does, factored out so a name's ELEMENTS can be taken
 * through it too — which is the whole trick behind detecting whether an element
 * is still recoverable inside the worn name.
 */
export function carryForward(project, form, ancestorId, targetId, { rootId = 'carry', phonotactics, wear = false } = {}) {
    const chain = pathChangeSets(project, ancestorId, targetId);

    let out = form;
    const steps = [];
    for (const cs of chain) {
        const res = evolveWord(out, cs.rules, { rootId, rank: 400, phonotactics, stageId: cs.childId });
        // Only a name wears; its elements, carried as words, change regularly.
        let next = repairHiatus(res.segments, phonotactics);
        next = repairClusters(wear ? wearName(next) : next, phonotactics);
        if (wordToIpa(next) !== wordToIpa(out)) {
            steps.push({ stageId: cs.childId, from: wordToIpa(out), to: wordToIpa(next) });
        }
        out = next;
    }
    return { form: out, ipa: wordToIpa(out), steps };
}

/**
 * Why this name is opaque, if it is.
 *
 * Two independent checks per element, as set out in the header.
 *
 * The phonological one asks whether the element, carried forward through the
 * same rulesets on its own, still turns up inside the name. That is a stricter
 * test than it sounds — a name's elements sit at a compound seam, where they get
 * repairs an isolated word never sees, so an element surviving this test really
 * is still visible.
 *
 * The lexical one asks whether the modern language still has a live, ordinary
 * word meaning what the element meant. A `retired` or `restricted` entry counts
 * as gone: if the only surviving use of a word is inside place names, the place
 * name is a fossil, and English *wick* — a dead word for a settlement that
 * survives in *Warwick* and *Norwich* and nowhere else — is precisely that case.
 */
export function analyseOpacity(project, name, ancestorId, targetId) {
    const ancestor = project.stateOf(ancestorId);
    const target = project.stateOf(targetId);
    if (!ancestor || !target || !name?.elements?.length) return null;

    const modernIpa = name.ipa;
    const findings = name.elements.map((el) => {
        const carried = carryForward(project, el.form, ancestorId, targetId, {
            rootId: `el:${el.id}`, phonotactics: ancestor.phonotactics,
        });
        // Recoverable if the element's own reflex is still visible in the name.
        // The two-segment floor stops a bare vowel counting as a match.
        const recoverable = carried.ipa.length >= 2 && modernIpa.includes(carried.ipa);

        const live = (target.entries || []).find((e) => e.gloss === el.gloss && !e.retired && !e.restricted && !e.paradigm);
        const displaced = (target.entries || []).find((e) => (e.retiredGloss === el.gloss || e.restrictedFrom === el.gloss) && !e.paradigm);

        return {
            gloss: el.gloss,
            protoForm: wordToIpa(el.form),
            modernReflex: carried.ipa,
            recoverable,
            wordSurvives: !!live,
            modernWord: live ? live.ipa : null,
            displacedBy: displaced?.replacedBy ?? null,
            displacedAt: displaced?.replaced?.year ?? displaced?.restrictedAt ?? null,
        };
    });

    const anyRecoverable = findings.some((f) => f.recoverable);
    const allWordsSurvive = findings.every((f) => f.wordSurvives);

    const reading = anyRecoverable && allWordsSurvive ? 'transparent'
        : anyRecoverable && !allWordsSurvive ? 'the word died'
            : !anyRecoverable && allWordsSurvive ? 'worn past recognition'
                : 'wholly opaque';

    return {
        reading,
        opaque: reading !== 'transparent',
        elements: findings,
        note: OPACITY_NOTES[reading],
    };
}

const OPACITY_NOTES = {
    transparent: 'Every element is still visible and still an ordinary word — a speaker can read this name.',
    'the word died': 'The name is phonologically intact; what is missing is the vocabulary. English "Wednesbury" is perfectly recoverable as Woden\'s fort, and means nothing to anyone, because English has neither Woden nor burh.',
    'worn past recognition': 'The words are still in the language; the sound changes have taken the name past the point where anyone would connect them. Bristol was Brycgstow, "bridge place", and English still has both bridge and stow.',
    'wholly opaque': 'Neither the shape nor the vocabulary survives. This is what London and the Thames are — names carried forward by people who never knew what they meant.',
};

// ---------------------------------------------------------------------------
// Building the layer
// ---------------------------------------------------------------------------

/**
 * Coin a stratified set of names for one language.
 *
 * Each name is coined at an ancestor chosen by its kind's stratum, then carried
 * forward. The result is a name list with a visible depth to it: the rivers are
 * unreadable, the towns are half-readable, and the people have ordinary
 * meaningful names — which is what a real map looks like.
 */
export function coinArchaicLayer(project, targetLangId, rng, opts = {}) {
    const chain = lineageOf(project, targetLangId);
    if (chain.length < 2) return [];

    const kinds = opts.kinds || ['river', 'mountain', 'region', 'settlement', 'settlement', 'settlement', 'person'];
    const count = opts.count ?? 14;
    const out = [];
    const seen = new Set();

    for (let i = 0; i < count * 6 && out.length < count; i++) {
        const kind = kinds[out.length % kinds.length];
        const stratum = STRATA[kind] || STRATA.settlement;

        /**
         * Where in the lineage this name was coined. Clamped to the chain's
         * ends, and never to the target itself for the older kinds — a river
         * name coined this century is not a river name, it is a street name.
         */
        const t = Math.max(0, Math.min(1, stratum.depth + rng.gaussian(0, stratum.spread)));
        const idx = Math.max(0, Math.min(chain.length - 1, Math.round(t * (chain.length - 1))));
        const ancestor = chain[idx];
        const ancestorState = coiningState(project, ancestor.id, targetLangId);
        if (!ancestorState) continue;

        const coined = generateName(ancestorState, rng, { kind });
        if (!coined || seen.has(coined.ipa)) continue;

        /**
         * The name's elements, kept as real lexicon entries rather than as
         * glosses, because opacity analysis has to carry each one forward
         * through the rulesets on its own.
         */
        const elements = (coined.parts || []).map((gloss) => {
            const e = (ancestorState.entries || []).find((x) => x.gloss === gloss && !x.paradigm);
            return e ? { id: e.id, gloss, form: e.form } : null;
        }).filter(Boolean);
        if (!elements.length) continue;

        const carried = carryForward(project, coined.form, ancestor.id, targetLangId, {
            rootId: `name:${coined.ipa}`, phonotactics: ancestorState.phonotactics, wear: true,
        });
        const target = project.stateOf(targetLangId);

        const name = {
            kind,
            stratum: { ancestorId: ancestor.id, ancestorName: ancestor.name, depth: idx / (chain.length - 1), note: stratum.note },
            coinedForm: coined.ipa,
            coinedSpelling: coined.spelling,
            coinedGloss: coined.gloss,
            elements,
            form: carried.form,
            ipa: carried.ipa,
            spelling: capitalise(target.romanisation.spell(carried.form)),
            steps: carried.steps,
        };
        name.opacity = analyseOpacity(project, name, ancestor.id, targetLangId);
        seen.add(coined.ipa);
        out.push(name);
    }

    // Oldest first, which is how a gazetteer with any historical sense prints.
    return out.sort((a, b) => a.stratum.depth - b.stratum.depth);
}

function capitalise(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

/** The sentence the panel prints under a name. */
export function describeName(name) {
    const parts = [`${name.spelling} /${name.ipa}/`];
    parts.push(`${name.kind}, coined in ${name.stratum.ancestorName} as *${name.coinedForm} "${name.coinedGloss}"`);
    if (name.opacity) {
        parts.push(name.opacity.reading);
        const dead = name.opacity.elements.filter((e) => !e.wordSurvives);
        if (dead.length) {
            parts.push(`the ordinary word for "${dead[0].gloss}" is gone${dead[0].displacedAt != null ? `, replaced c.${dead[0].displacedAt}` : ''} — it survives only here`);
        }
    }
    return parts.join('; ') + '.';
}

/** Readable block for the CLI. */
export function formatNameLayer(names) {
    if (!names.length) return '(no names)';
    const L = [];
    for (const n of names) {
        L.push(`  ${n.spelling.padEnd(16)} /${n.ipa}/`);
        L.push(`      ${n.kind}, coined in ${n.stratum.ancestorName} as *${n.coinedForm} "${n.coinedGloss}"`);
        if (n.opacity) L.push(`      ${n.opacity.reading}${n.opacity.reading !== 'transparent' ? ` — ${n.opacity.note.split('.')[0]}.` : ''}`);
    }
    return L.join('\n');
}
