/**
 * Words built as compounds of a language's own words (DJ's plan, the deeper
 * dictionaries): many languages make an everyday word of two they have, as
 * German Handschuh "hand-shoe" is a glove, Chinese 火车 "fire-cart" a train,
 * and Turkish göz kapağı "eye lid" the eyelid. A wider word with a recipe
 * here is built so in the proto, as often as the language's type builds
 * compounds: isolating languages most (Chinese, Vietnamese), fusional least
 * (Latin, Russian), the rest between. Each word's choice is its own draw
 * (`streamFor`), so a recipe added moves no other word. Each recipe is
 * [modifier, head], the order most of Earth's compounds run.
 */

import { wordToIpa } from '../features.js';
import { repairHiatus, syllabify } from '../phonology/phonotactics.js';
import { classOf } from './roots.js';
import { hashString } from '../rng.js';

export const WIDER_COMPOUNDS = {
    "kitchen": ["fire", "house"],
    "granary": ["grain", "house"],
    "storehouse": ["thing", "house"],
    "stable": ["horse", "house"],
    "barn": ["hay", "house"],
    "inn": ["guest", "house"],
    "workshop": ["work", "house"],
    "waterskin": ["water", "skin"],
    "snowshoe": ["snow", "shoe"],
    "rainbow": ["rain", "bow"],
    "sunshine": ["sun", "light"],
    "eyebrow": ["eye", "hair"],
    "eyelash": ["eye", "hair"],
    "eyelid": ["eye", "skin"],
    "nostril": ["nose", "hole"],
    "armpit": ["arm", "hole"],
    "knuckle": ["finger", "bone"],
    "sole (of foot)": ["foot", "bottom"],
    "firewood": ["fire", "stick"],
    "seaweed": ["sea", "grass"],
    "driftwood": ["sea", "stick"],
    "flood season": ["flood", "time"],
    "dry season": ["dry", "time"],
    "rainy season": ["rain", "time"],
    "midnight sun": ["night", "sun"],
    "sea ice": ["sea", "ice"],
    "ice field": ["ice", "field"],
    "salt flat": ["salt", "field"],
    "sun shelter": ["sun", "house"],
    "high tide": ["high", "sea"],
    "low tide": ["low", "sea"],
    "crossroads": ["road", "road"],
    "grandchild": ["child", "child"],
    "stepmother": ["other", "mother"],
    "stepfather": ["other", "father"],
    "firstborn": ["first", "child"],
    "gunpowder": ["fire", "dust"],
    "horseman": ["horse", "man (male)"],
    "warehouse": ["goods", "house"],
    "shop": ["sell", "house"],
    "snowdrift": ["snow", "hill"],
    "meltwater": ["snow", "water"],
    "icicle": ["ice", "tooth"],
    "stilt house": ["stick", "house"],
    "leaf roof": ["leaf", "roof"],
    "fishing net": ["fish", "net"],
    "sea wind": ["sea", "wind"],
    "winter dark": ["winter", "night"],
    "first frost": ["first", "ice"],
    "thin ice": ["thin", "ice"],
    "frozen ground": ["ice", "earth"],
    "snow house": ["snow", "house"],
    "fur cloak": ["fur", "cloth"],
    "swamp forest": ["swamp", "forest"],
    "flash flood": ["fast", "water"],
    "dry riverbed": ["dry", "river"],
    "stony desert": ["stone", "sand"],
    "sandstorm": ["sand", "wind"],
    "mudslide": ["mud", "river"],
    "heirloom": ["old", "thing"],
    "dried meat": ["dry", "meat"],
    "breakfast": ["morning", "food"],
    "supper": ["night", "food"],
    "birthday": ["birth", "day"],
    "tide pool": ["sea", "pool"],
    "mother-in-law": ["wife", "mother"],
    "waterfall": ["water", "cliff"],
    "daybreak": ["day", "break"],
    "homeland": ["home", "land"],
    "lighthouse": ["light", "house"],
    "beehive": ["bee", "house"],
    "anthill": ["ant", "hill"],
    "weekday": ["week", "day"],
    "footprint": ["foot", "mark"],
    "eyeball": ["eye", "egg"],
    "palm (of hand)": ["hand", "belly"],
    "calf (leg)": ["leg", "belly"],
    "spine": ["back", "bone"],
};

const SHARE = { isolating: 0.75, polysynthetic: 0.6, agglutinative: 0.55, fusional: 0.35 };

/** The proto's wider roots, some rebuilt as compounds of its words. */
export function compoundWider(roots, type, pt, streamFor) {
    const byGloss = new Map(roots.map((r) => [r.gloss, r]));
    const share = SHARE[type] ?? 0.45;
    // one compound per pair of parts: "eye" and "hair" make the eyebrow or the eyelash, not both
    const built = new Set();
    return roots.map((r) => {
        const recipe = r.wider && WIDER_COMPOUNDS[r.gloss];
        if (!recipe) return r;
        const [a, b] = recipe.map((g) => byGloss.get(g));
        if (!a || !b || a === r || b === r || built.has(`${a.gloss}+${b.gloss}`) || !streamFor(r.gloss).bool(share)) return r;
        built.add(`${a.gloss}+${b.gloss}`);
        // the first part keeps at most two syllables, as a compound is built of stems (lexicon/modern.js)
        const syl = syllabify(a.form, pt);
        const first = syl.length > 2 ? syl.slice(0, 2).flatMap((x) => [...x.onset, ...x.nucleus, ...x.coda]) : a.form;
        const form = repairHiatus([...first, ...b.form], pt);
        return { ...r, form, ipa: wordToIpa(form), class: classOf(form, r.pos), syllables: syllabify(form, pt).length,
            compoundOf: { head: b.id, headGloss: b.gloss, modifier: a.id, modifierGloss: a.gloss, year: null } };
    });
}

/**
 * The tens, built of the language's own numbers (DJ's plan, the deeper
 * dictionaries): nearly every language with words for them makes thirty of
 * three and ten (Chinese sanshi, Swahili thelathini aside, Old English
 * thritig), and about one in five counts by twenties (WALS 131A: 42 of 196
 * vigesimal or mixed), as French quatre-vingts "four twenties", Welsh
 * deugain "two twenties" and Yoruba do: twenty its own word, forty
 * "two twenty", fifty "two twenty ten". Which a family does is its own draw
 * (`baseKey`, hashed); each ten is built where the language has the parts, the
 * multiplier first, as most of Earth's numerals put it.
 */
const TENS = { twenty: 2, thirty: 3, forty: 4, fifty: 5, sixty: 6, seventy: 7, eighty: 8, ninety: 9 };
const DIGIT = { 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine' };
export function composeTens(roots, pt, baseKey) {
    const byGloss = new Map(roots.map((r) => [r.gloss, r]));
    // (a hash of the family's key: the first draw of a fresh stream chose twenties for 13 of 30 families)
    const vigesimal = hashString(`${baseKey}:number-base`) % 1000 < 210;
    const join = (...parts) => repairHiatus(parts.flatMap((p, i) => {
        if (i === parts.length - 1) return p.form;
        const syl = syllabify(p.form, pt);
        return syl.length > 2 ? syl.slice(0, 2).flatMap((x) => [...x.onset, ...x.nucleus, ...x.coda]) : p.form;
    }), pt);
    return { vigesimal, roots: roots.map((r) => {
        const n = r.wider && TENS[r.gloss];
        if (!n) return r;
        const ten = byGloss.get('ten');
        let parts;
        if (vigesimal) {
            const twenty = byGloss.get('twenty');
            if (n === 2) return r;                        // twenty is its own word where one counts by it
            const k = Math.floor(n / 2), odd = n % 2;
            parts = k === 1 ? [twenty, ten] : odd ? [byGloss.get(DIGIT[k]), twenty, ten] : [byGloss.get(DIGIT[k]), twenty];
        } else parts = [byGloss.get(DIGIT[n]), ten];
        if (parts.some((p) => !p || p === r)) return r;
        const form = join(...parts);
        const label = parts.map((p) => p.gloss).join(' ');
        return { ...r, form, ipa: wordToIpa(form), class: classOf(form, r.pos), syllables: syllabify(form, pt).length,
            compoundOf: { head: parts[parts.length - 1].id, headGloss: parts[parts.length - 1].gloss, modifier: parts[0].id, modifierGloss: parts.slice(0, -1).map((p) => p.gloss).join(' '), year: null, numeral: label } };
    }) };
}

