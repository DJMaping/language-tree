/**
 * The learned stratum — a language borrowing from its own ancestor.
 *
 * ## The thing this models
 *
 * A language with a written classical stage does not simply inherit that stage.
 * It goes back to it, repeatedly, for centuries, and takes words out of it again
 * in the shape they had on the page rather than the shape they would have had if
 * they had come down through ordinary speech.
 *
 * Latin into Romance is the standard case, and the standard illustration is a
 * pair. Latin *fragilem* came down into French by ordinary transmission as
 * *frêle*, worn by every sound change between; the same word was lifted straight
 * off the page centuries later as *fragile*, worn by none of them. Both are in
 * the dictionary. Spanish has *llave* and *clave*, both *clavem*. English has
 * *frail* and *fragile*, having borrowed both halves of the French pair.
 *
 * The same thing happened wherever there was a prestige ancestor to raid:
 * Sanskrit *tatsama* vocabulary sitting beside inherited *tadbhava* forms in
 * Hindi, Classical Chinese readings layered into Japanese and Korean, Church
 * Slavonic into Russian (*grad* beside *gorod*, the same word twice),
 * Katharevousa into Greek.
 *
 * ## Why it is worth building rather than faking
 *
 * Three things fall out of it at once, and none of them has to be implemented
 * separately:
 *
 *   1. **Doublets in bulk.** Every learned borrowing whose native cognate
 *      survives is a doublet, and a doublet is the most legible evidence a
 *      language can offer that it has a history. `doublets.js` finds them; this
 *      module is what makes there be any.
 *   2. **A formal register that differs in the right way.** The learned stratum
 *      IS the formal register — that is why the formal vocabulary of English is
 *      Latinate, of Japanese Sino-Japanese, of Hindi Sanskritic. Nothing extra
 *      needs generating.
 *   3. **A conservative layer in the phonology.** Learned words carry segments
 *      and clusters the ordinary lexicon has lost, because they never went
 *      through the changes that removed them.
 *
 * ## Why it is expressed as contact rather than as new machinery
 *
 * `contact.js` already does all of this. It adapts a donor word to the
 * recipient's phonology, dates the loan so that later rules apply and earlier
 * ones do not, and — critically — takes the donor *as it stood at the moment of
 * contact* via `stateAtYear`. Borrowing from a language is borrowing from the
 * language it was, and a classical source is precisely a language frozen at the
 * moment it was written down.
 *
 * So this module writes no new borrowing logic. It expands a config block into
 * ordinary borrowing events pointed backwards up the tree, and the existing
 * machinery does the rest. Nothing is written to `data/languages.json`, which
 * stays DJ's file.
 */

import { sourceRootOf } from './doublets.js';

/**
 * Expand a family's `classical` config into synthetic borrowing events.
 *
 * ```jsonc
 * "classical": {
 *   "sourceId": "old-alzurian",   // the stage that got written down
 *   "from": 600,                  // when descendants started raiding it
 *   "to": null,                   // and when they stopped (null = still going)
 *   "everyYears": 500,            // one borrowing wave per descendant per N years
 *   "strength": 1.0               // scales how much each wave delivers
 * }
 * ```
 *
 * @param cfg   the family config
 * @param tree  the family's node list, as `createProject` receives it
 * @returns borrowing objects in the same shape as `doc.borrowings[]`
 */
export function expandClassicalSource(cfg, tree, { presentYear = 1765 } = {}) {
    const spec = cfg?.classical;
    if (!spec?.sourceId) return [];

    const byId = new Map(tree.map((l) => [l.id, l]));
    const source = byId.get(spec.sourceId);
    if (!source) return [];

    const from = spec.from ?? source.died ?? source.born;
    const to = spec.to ?? presentYear;
    const everyYears = Math.max(100, spec.everyYears ?? 500);
    const strength = spec.strength ?? 1;

    /** Every node downstream of the classical stage. */
    const descendants = new Set();
    const stack = [spec.sourceId];
    while (stack.length) {
        const id = stack.pop();
        for (const l of tree) {
            if (l.parentId !== id && l.secondaryParentId !== id) continue;
            if (descendants.has(l.id)) continue;
            descendants.add(l.id);
            stack.push(l.id);
        }
    }

    const out = [];
    for (const id of descendants) {
        const node = byId.get(id);
        if (!node) continue;
        const alive = [Math.max(node.born, from), Math.min(node.died ?? presentYear, to)];
        if (alive[1] <= alive[0]) continue;

        /**
         * A wave per `everyYears`, placed at the START of each window rather
         * than jittered, because the point of the mechanism is that these
         * arrive at KNOWN dates and therefore at known depths of sound change.
         * A learned borrowing whose date is fuzzy tells you nothing.
         */
        for (let y = alive[0] + Math.round(everyYears / 2); y < alive[1]; y += everyYears) {
            out.push({
                id: `learned:${id}:${y}`,
                fromId: spec.sourceId,
                toId: id,
                year: Math.round(y),
                // Prestige vocabulary — law, religion, learning, craft — which
                // is exactly what CONTACT_KINDS.superstrate already selects for,
                // and exactly what a classical source actually supplies.
                kind: 'superstrate',
                strength,
                label: `learned borrowing from ${source.name}`,
                learned: true,
            });
        }
    }
    return out.sort((a, b) => a.year - b.year);
}

/**
 * Mark the entries a learned borrowing produced.
 *
 * `contact.js` stamps every loan with its borrowing id; this reads the `learned`
 * flag back off the borrowing so the panel can tell a word taken from the
 * language's own classical ancestor apart from one taken from a neighbour. They
 * are both loans and they are not the same kind of fact.
 */
export function markLearned(loans, borrowing) {
    if (!borrowing?.learned) return loans;
    return loans.map((e) => ({
        ...e,
        register: 'formal',
        loan: { ...e.loan, learned: true, classicalSource: borrowing.fromId },
    }));
}

/**
 * Drop an incoming loan of a word the language has already taken from the same
 * source.
 *
 * Without this the mechanism re-borrows the same vocabulary at every wave, and
 * a language ends up with four copies of "elder" that are mostly identical
 * because the intervening centuries changed nothing. That is not what a
 * classical stratum looks like. English took *fragile* from Latin once; it did
 * not keep taking it every two hundred years.
 *
 * The exception, which is why this compares against LEARNED loans rather than
 * against everything: a word already borrowed from a *neighbour* can perfectly
 * well be borrowed again from the classical source, and that is one of the
 * routes to a three-way set. English has *royal* (Norman French), *regal*
 * (Latin) and *real* in "realm" — the same Latin word arriving by three
 * different roads.
 */
export function dropAlreadyBorrowed(loans, existingEntries, borrowing) {
    if (!borrowing?.learned || !loans.length) return loans;
    const held = new Set();
    for (const e of existingEntries || []) {
        if (!e.loan?.learned) continue;
        const key = sourceRootOf(e);
        if (key) held.add(key);
    }
    if (!held.size) return loans;
    return loans.filter((e) => {
        const key = sourceRootOf(e);
        return !key || !held.has(key);
    });
}
