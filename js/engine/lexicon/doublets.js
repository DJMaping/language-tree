/**
 * Doublets — the same word, arriving twice, wearing different amounts of wear.
 *
 * ## What a doublet is, and why it is the best evidence a language can offer
 *
 * English borrowed the same French word twice. *Chief* came in early, while
 * French still pronounced it with /tʃ/, and kept it. *Chef* came in centuries
 * later, after French had shifted /tʃ/ to /ʃ/, and so has /ʃ/. One Latin word,
 * *caput*, two English words, and **the date of each borrowing can be read off
 * its consonant**. The same story gives *catch* and *chase*, *cattle* and
 * *chattel*, *warranty* and *guarantee*, *wage* and *gage*.
 *
 * That is the most legible thing a language family can produce. It is not a
 * curiosity: it is the comparative method working inside a single language, and
 * it is proof — on the surface, in two words a reader can look at side by side —
 * that time has passed and that specific things happened during it.
 *
 * The engine has been able to produce these since `contact.js` landed and has
 * never labelled one. `enteredAt` means a loan skips every rule dated before it
 * arrived, so two loans of the same word at different dates already come out
 * differently. All that was missing was somebody noticing.
 *
 * ## The three ways one gets made here
 *
 *   INHERITED + BORROWED   the language kept its own reflex and later borrowed
 *                          the cognate back from a relative. Russian *gorod*
 *                          "town" beside Church Slavonic *grad*; English *shirt*
 *                          beside Norse *skirt*.
 *   INHERITED + LEARNED    the language went back to its own written ancestor.
 *                          French *frêle* beside *fragile*, both Latin
 *                          *fragilem*. This is what `learned.js` generates, and
 *                          it is the productive source — a classical stratum
 *                          makes doublets by the hundred.
 *   BORROWED TWICE         two contact events, two dates, one source word.
 *                          *Chief* and *chef*.
 *
 * ## How the pairing is found
 *
 * For free, because of a property of the engine that was not designed for this.
 * Every entry in a family carries the id of the proto root it descends from, and
 * a loan's id embeds the donor entry's id — and within one family the donor and
 * the recipient are both descendants of the same proto, so they use the SAME
 * root ids. Two entries in one language whose ids reduce to the same proto root
 * are therefore two arrivals of one word, and nothing had to be tracked to make
 * that true.
 */

/**
 * Entry-id shapes the lexicon uses. A donor id always starts with one of these.
 *
 * `r0142` a proto root · `r0142+AGENT` a derivative · `cmp:A+B` a compound ·
 * `para:cls:cell` a paradigm cell.
 */
const ENTRY_ID = /^(?:cmp:|para:)|^r\d{4}/;

/**
 * The entry this one is a second arrival OF.
 *
 * For an inherited word that is simply its own id. For a loan it is the DONOR's
 * entry id, which the loan id embeds — and because a family's donor and
 * recipient are both descendants of one proto, they use the same ids, so two
 * entries whose keys match really are two arrivals of one word.
 *
 * ## Why this is not "find the root at the end of the string"
 *
 * It was, and that was wrong the moment compounding landed. Compound ids look
 * like `cmp:r0586+r0124`, so a rule that matched the root pattern at the end of
 * the id reduced the compound *X-fear* to the same key as plain *fear*, and the
 * panel confidently reported a four-member doublet set consisting of one word
 * and three compounds containing it.
 *
 * The identity of a compound is the whole compound. Same principle as
 * derivatives, which is why `+AGENT` was part of the key from the start: an
 * inherited *kaas* "salt" and a borrowed *kaas-tin* "salt-place" are not a
 * doublet, they are a word and a bigger word with that word in it. Conflating
 * them fills the display with pairs that are not pairs, which is worse than
 * showing nothing.
 *
 * So the loan prefix is stripped by finding where the donor id begins, rather
 * than by pattern-matching what it ends with. A borrowing id may itself contain
 * colons — `loan:learned:chioan:450:cmp:r0586+r0124` is a real example — so the
 * scan walks the segments until the remainder looks like an entry id.
 */
export function sourceRootOf(entry) {
    const id = String(entry?.id ?? '');
    if (!id) return null;

    if (entry?.loan?.borrowingId) {
        const prefix = `loan:${entry.loan.borrowingId}:`;
        if (id.startsWith(prefix)) return id.slice(prefix.length) || null;
    }
    if (id.startsWith('loan:')) {
        const parts = id.split(':');
        for (let i = 1; i < parts.length; i++) {
            const rest = parts.slice(i).join(':');
            if (ENTRY_ID.test(rest)) return rest;
        }
        return null;
    }
    return ENTRY_ID.test(id) ? id : null;
}

/** The route by which an entry reached this language. */
export function routeOf(entry) {
    if (!entry.loan) return { kind: 'inherited', year: null, label: 'inherited' };
    if (entry.loan.learned) {
        return {
            kind: 'learned', year: entry.loan.year, from: entry.loan.from,
            label: `learned, from ${entry.loan.classicalSource || entry.loan.from}`,
        };
    }
    return { kind: 'borrowed', year: entry.loan.year, from: entry.loan.from, label: `borrowed from ${entry.loan.from}` };
}

/**
 * Find every doublet set in one stage.
 *
 * A set needs at least two members that reached the language by DIFFERENT
 * routes and that actually differ in form. Two identical forms are not a
 * doublet; they are a borrowing that happened to land on the shape the language
 * already had, which is a real outcome and simply not an interesting one.
 */
export function findDoublets(state, { bornOf = null } = {}) {
    const groups = new Map();
    for (const e of state.entries || []) {
        if (e.paradigm) continue;
        const key = sourceRootOf(e);
        if (!key) continue;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(e);
    }

    const out = [];
    for (const [rootId, members] of groups) {
        if (members.length < 2) continue;
        const routes = new Set(members.map((m) => `${routeOf(m).kind}:${m.loan?.borrowingId ?? ''}`));
        if (routes.size < 2) continue;
        const forms = new Set(members.map((m) => m.ipa));
        if (forms.size < 2) continue;

        const sorted = members.slice().sort((a, b) => {
            const ya = a.loan?.year ?? -Infinity;
            const yb = b.loan?.year ?? -Infinity;
            return ya - yb;
        });

        out.push({
            rootId,
            members: sorted.map((m) => ({
                id: m.id,
                ipa: m.ipa,
                gloss: m.gloss,
                route: routeOf(m),
                register: m.register || (m.loan?.learned ? 'formal' : null),
            })),
            /**
             * The whole point of the display: which changes the later arrival
             * escaped. This is what makes the pair readable as a date rather
             * than as two spellings.
             */
            escaped: escapedChanges(state, sorted, bornOf),
        });
    }
    return out.sort((a, b) => b.members.length - a.members.length || a.rootId.localeCompare(b.rootId));
}

/**
 * Which sound changes separate the members of a doublet set.
 *
 * ## The subtlety that makes this correct rather than merely plausible
 *
 * The naive version — every change the early arrival underwent and the late one
 * did not — is wrong for the commonest case here, and wrong in a way that
 * produces confident nonsense.
 *
 * A learned borrowing comes from the language's own ANCESTOR. The ancestor
 * underwent every change on the shared line before the two diverged, and the
 * borrowed word therefore carries those changes too — it did not escape them,
 * it inherited them by a different road. Reporting them as escaped would claim
 * French *fragile* escaped every sound change since Proto-Indo-European, when
 * what it actually escaped is the ones between Classical Latin and Old French.
 *
 * So the window is bounded at both ends: a change separates the pair only if it
 * happened AFTER the donor stage existed (before that, both forms share it) and
 * BEFORE the borrowing arrived (after that, both forms undergo it alike). That
 * window is exactly the span the doublet measures, and its width is what the
 * difference between the two forms is worth as evidence.
 *
 * `bornOf` resolves a language id to its birth year and comes from the project.
 * Without it the window cannot be computed, and the function says so by
 * returning nothing rather than by guessing — an unbounded list here would be
 * the kind of measurement bug standing rule 6 rates as worse than an output bug.
 */
function escapedChanges(state, sortedMembers, bornOf) {
    const histories = state.histories;
    if (!histories) return [];
    const first = sortedMembers[0];
    const last = sortedMembers[sortedMembers.length - 1];
    if (!last.loan) return [];

    const arrived = last.loan.year;
    const donorBorn = bornOf ? bornOf(last.loan.from) : null;
    if (arrived == null || donorBorn == null) return [];

    const stepsOf = (e) => (histories.get(e.id)?.steps || []).filter((s) => s.applied);
    const lateKeys = new Set(stepsOf(last).map((s) => s.ruleId));

    const seen = new Set();
    const out = [];
    for (const s of stepsOf(first)) {
        if (lateKeys.has(s.ruleId) || seen.has(s.ruleId)) continue;
        if (s.year == null || s.year < donorBorn || s.year > arrived) continue;
        seen.add(s.ruleId);
        out.push({ ruleId: s.ruleId, label: s.label, year: s.year, from: s.from, to: s.to });
    }
    return out.sort((a, b) => (a.year ?? 0) - (b.year ?? 0));
}

/**
 * One doublet set as a sentence a reader can use.
 *
 * The target is the kind of line a dictionary prints: two forms, one source,
 * and the specific change that tells them apart.
 */
export function describeDoublet(set) {
    const forms = set.members.map((m) => `${m.ipa} (${m.route.label}${m.route.year != null ? ` c.${m.route.year}` : ''})`);
    const head = `${forms.join('  /  ')} — the same word twice`;
    if (!set.escaped.length) return head + '.';
    const named = set.escaped.slice(0, 3).map((s) => `${s.label}${s.year != null ? ` (c.${s.year})` : ''}`);
    const more = set.escaped.length > 3 ? `, and ${set.escaped.length - 3} more` : '';
    return `${head}; the later arrival escaped ${named.join(', ')}${more}.`;
}

/** Summary line for the CLI and the earth report. */
export function formatDoublets(sets, { limit = 12 } = {}) {
    if (!sets.length) return 'No doublets — nothing has entered this language twice.';
    const L = [`${sets.length} doublet set${sets.length === 1 ? '' : 's'}:`];
    for (const s of sets.slice(0, limit)) {
        L.push(`  "${s.members[0].gloss}"  ${describeDoublet(s)}`);
    }
    if (sets.length > limit) L.push(`  …and ${sets.length - limit} more`);
    return L.join('\n');
}
