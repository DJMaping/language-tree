// Shared schema validation for data/languages.json.
// Imported by the browser (on load + before save), server.js (on every PUT),
// and scripts/validate.js (the `npm run validate` CLI). Keep it dependency-free.

export const ID_RE = /^[a-z0-9-]+$/;

// Borrowing influence kinds. Absent = "loan" (no migration needed for old data).
export const BORROW_KINDS = ['loan', 'substrate', 'superstrate', 'areal'];

// Returns an array of { path, message }. Empty array = valid document.
export function validateDoc(doc) {
    const errors = [];
    const err = (path, message) => errors.push({ path, message });

    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
        err('', 'Document must be a JSON object.');
        return errors;
    }

    const cfg = doc.config;
    if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) {
        err('config', 'Missing "config" object (needs at least an integer presentYear).');
    } else {
        if (!Number.isInteger(cfg.presentYear)) err('config.presentYear', 'presentYear must be an integer Andah year.');
        if (cfg.title != null && typeof cfg.title !== 'string') err('config.title', 'title must be a string.');
        if (cfg.axis != null) {
            if (typeof cfg.axis !== 'object' || Array.isArray(cfg.axis)) err('config.axis', 'axis must be an object.');
            else if (cfg.axis.zeroLabel != null && typeof cfg.axis.zeroLabel !== 'string') {
                err('config.axis.zeroLabel', 'zeroLabel must be a string.');
            }
        }
        if (cfg.polyglotPath != null && typeof cfg.polyglotPath !== 'string') {
            err('config.polyglotPath', 'polyglotPath must be a string (path to PolyGlot.exe or PolyGlot.jar).');
        }
    }

    const langs = doc.languages;
    if (!Array.isArray(langs)) {
        err('languages', '"languages" must be an array.');
        return errors;
    }

    // Ids that some child (branch daughter OR stage successor) names as its parent
    // — a `diverged` language with no explicit `died` derives its end year from the
    // last of these (the final split / hand-off), so no death date is needed.
    const parentIdsWithChild = new Set();
    for (const l of langs) {
        if (l && typeof l === 'object' && !Array.isArray(l) && l.parentId != null
            && (l.relation === 'branch' || l.relation === 'stage')) {
            parentIdsWithChild.add(l.parentId);
        }
    }

    const byId = new Map();
    langs.forEach((l, i) => {
        const p = `languages[${i}]`;
        if (!l || typeof l !== 'object' || Array.isArray(l)) { err(p, 'Each language must be an object.'); return; }
        if (typeof l.id !== 'string' || !ID_RE.test(l.id)) {
            err(`${p}.id`, 'id must be a lowercase slug (a-z, 0-9, "-").');
        } else if (byId.has(l.id)) {
            err(`${p}.id`, `Duplicate id "${l.id}".`);
        } else {
            byId.set(l.id, l);
        }
        if (typeof l.name !== 'string' || !l.name.trim()) err(`${p}.name`, 'name is required.');
        if (!Number.isInteger(l.born)) err(`${p}.born`, 'born must be an integer year (negative years allowed).');
        if (l.died != null) {
            if (!Number.isInteger(l.died)) err(`${p}.died`, 'died must be an integer year.');
            else if (Number.isInteger(l.born) && l.died < l.born) err(`${p}.died`, 'died cannot be before born.');
        }
        if (l.parentId != null && typeof l.parentId !== 'string') err(`${p}.parentId`, 'parentId must be a string id.');
        if (l.parentId != null && l.relation !== 'branch' && l.relation !== 'stage') {
            err(`${p}.relation`, 'relation must be "branch" or "stage" when parentId is set.');
        }
        if (l.parentId == null && l.relation != null) err(`${p}.relation`, 'relation requires a parentId.');
        if (l.secondaryParentId != null) {
            if (typeof l.secondaryParentId !== 'string') err(`${p}.secondaryParentId`, 'secondaryParentId must be a string id.');
            if (l.parentId == null) err(`${p}.secondaryParentId`, 'secondaryParentId requires a primary parentId.');
        }
        if (l.reconstructed != null && typeof l.reconstructed !== 'boolean') err(`${p}.reconstructed`, 'reconstructed must be true or false.');
        if (l.bornCirca != null && typeof l.bornCirca !== 'boolean') err(`${p}.bornCirca`, 'bornCirca must be true or false.');
        if (l.diedCirca != null && typeof l.diedCirca !== 'boolean') err(`${p}.diedCirca`, 'diedCirca must be true or false.');
        if (l.diverged != null) {
            if (typeof l.diverged !== 'boolean') err(`${p}.diverged`, 'diverged must be true or false.');
            // A died year is optional: with a successor, the divergence year is
            // derived from the last one. Only flag a diverged language that has
            // neither an explicit died nor any successor to derive it from.
            else if (l.diverged && l.died == null && !parentIdsWithChild.has(l.id)) {
                err(`${p}.diverged`, 'diverged needs either a died year or at least one daughter/stage successor to derive it from.');
            }
        }
        if (l.populationSeries != null) {
            if (!Array.isArray(l.populationSeries)) {
                err(`${p}.populationSeries`, 'populationSeries must be an array of {year, count} points.');
            } else {
                l.populationSeries.forEach((pt, j) => {
                    const pp = `${p}.populationSeries[${j}]`;
                    if (!pt || typeof pt !== 'object' || Array.isArray(pt)) { err(pp, 'each population point must be a {year, count} object.'); return; }
                    if (!Number.isInteger(pt.year)) err(`${pp}.year`, 'year must be an integer Andah year.');
                    if (typeof pt.count !== 'number' || !Number.isFinite(pt.count) || pt.count < 0) err(`${pp}.count`, 'count must be a number ≥ 0.');
                });
            }
        }
        if (l.region != null && typeof l.region !== 'string') err(`${p}.region`, 'region must be a string.');
        if (l.notes != null && typeof l.notes !== 'string') err(`${p}.notes`, 'notes must be a string.');
        if (l.color != null && typeof l.color !== 'string') err(`${p}.color`, 'color must be a CSS color string.');
        if (l.groupId != null && typeof l.groupId !== 'string') err(`${p}.groupId`, 'groupId must be a string group id.');
        if (l.order != null && !Number.isInteger(l.order)) err(`${p}.order`, 'order must be an integer.');
        if (l.polyglotFile != null && typeof l.polyglotFile !== 'string') err(`${p}.polyglotFile`, 'polyglotFile must be a string path.');
    });

    // Cross-reference + relational rules (only meaningful for languages that parsed individually).
    const stageCount = new Map();
    langs.forEach((l, i) => {
        if (!l || typeof l !== 'object' || Array.isArray(l)) return;
        const p = `languages[${i}]`;
        if (l.parentId != null && typeof l.parentId === 'string') {
            const parent = byId.get(l.parentId);
            if (!parent) {
                err(`${p}.parentId`, `parentId "${l.parentId}" does not match any language id.`);
            } else {
                if (l.id === l.parentId) err(`${p}.parentId`, 'A language cannot be its own parent.');
                if (Number.isInteger(l.born) && Number.isInteger(parent.born)) {
                    if (l.relation === 'stage' && l.born <= parent.born) {
                        err(`${p}.born`, `A stage must begin after its previous stage (${parent.name ?? parent.id} was born ${parent.born}).`);
                    }
                    if (l.relation === 'branch' && l.born < parent.born) {
                        err(`${p}.born`, `A daughter cannot be born before its parent (${parent.name ?? parent.id} was born ${parent.born}).`);
                    }
                }
                if (l.relation === 'stage') {
                    const n = (stageCount.get(l.parentId) ?? 0) + 1;
                    stageCount.set(l.parentId, n);
                    if (n === 2) {
                        err(`${p}.relation`, `"${l.parentId}" already has a stage successor — a language can have at most one (make the others branches).`);
                    }
                }
            }
        }
        if (l.secondaryParentId != null && typeof l.secondaryParentId === 'string') {
            if (!byId.has(l.secondaryParentId)) err(`${p}.secondaryParentId`, `secondaryParentId "${l.secondaryParentId}" does not match any language id.`);
            if (l.secondaryParentId === l.id) err(`${p}.secondaryParentId`, 'A language cannot be its own second parent.');
            if (l.secondaryParentId === l.parentId) err(`${p}.secondaryParentId`, 'Second parent must differ from the primary parent.');
        }
    });

    // Ancestry cycles (each language has at most one primary parent, so walking up finds them all).
    const done = new Set();
    for (const start of byId.values()) {
        if (done.has(start.id)) continue;
        const walk = new Set();
        let cur = start;
        while (cur && !done.has(cur.id)) {
            if (walk.has(cur.id)) {
                err('languages', `Ancestry cycle detected involving "${cur.id}".`);
                break;
            }
            walk.add(cur.id);
            cur = cur.parentId != null ? byId.get(cur.parentId) : null;
        }
        for (const id of walk) done.add(id);
    }

    const bors = doc.borrowings;
    if (bors != null) {
        if (!Array.isArray(bors)) {
            err('borrowings', '"borrowings" must be an array.');
        } else {
            const bIds = new Set();
            bors.forEach((b, i) => {
                const p = `borrowings[${i}]`;
                if (!b || typeof b !== 'object' || Array.isArray(b)) { err(p, 'Each borrowing must be an object.'); return; }
                if (typeof b.id !== 'string' || !b.id) err(`${p}.id`, 'id is required.');
                else if (bIds.has(b.id)) err(`${p}.id`, `Duplicate borrowing id "${b.id}".`);
                else bIds.add(b.id);
                if (typeof b.fromId !== 'string' || !byId.has(b.fromId)) err(`${p}.fromId`, 'fromId must reference an existing language.');
                if (typeof b.toId !== 'string' || !byId.has(b.toId)) err(`${p}.toId`, 'toId must reference an existing language.');
                if (b.fromId != null && b.fromId === b.toId) err(`${p}.toId`, 'A language cannot borrow from itself.');
                if (b.year != null && !Number.isInteger(b.year)) err(`${p}.year`, 'year must be an integer.');
                if (b.label != null && typeof b.label !== 'string') err(`${p}.label`, 'label must be a string.');
                if (b.kind != null && !BORROW_KINDS.includes(b.kind)) {
                    err(`${p}.kind`, `kind must be one of: ${BORROW_KINDS.join(', ')}.`);
                }
            });
        }
    }

    // Timeline events — a separate historical layer drawn on the axis.
    const events = doc.events;
    if (events != null) {
        if (!Array.isArray(events)) {
            err('events', '"events" must be an array.');
        } else {
            const eIds = new Set();
            events.forEach((ev, i) => {
                const p = `events[${i}]`;
                if (!ev || typeof ev !== 'object' || Array.isArray(ev)) { err(p, 'Each event must be an object.'); return; }
                if (typeof ev.id !== 'string' || !ev.id) err(`${p}.id`, 'id is required.');
                else if (eIds.has(ev.id)) err(`${p}.id`, `Duplicate event id "${ev.id}".`);
                else eIds.add(ev.id);
                if (!Number.isInteger(ev.year)) err(`${p}.year`, 'year must be an integer Andah year.');
                if (ev.endYear != null) {
                    if (!Number.isInteger(ev.endYear)) err(`${p}.endYear`, 'endYear must be an integer year.');
                    else if (Number.isInteger(ev.year) && ev.endYear < ev.year) err(`${p}.endYear`, 'endYear cannot be before year.');
                }
                if (typeof ev.label !== 'string' || !ev.label.trim()) err(`${p}.label`, 'label is required.');
                if (ev.notes != null && typeof ev.notes !== 'string') err(`${p}.notes`, 'notes must be a string.');
                if (ev.color != null && typeof ev.color !== 'string') err(`${p}.color`, 'color must be a CSS color string.');
            });
        }
    }

    // Classification groups — a named color layer, independent of ancestry.
    // A language's optional groupId points at one; the group's color paints the
    // language and its descendants (unless a nearer color/group overrides).
    const groups = doc.groups;
    const gIds = new Set();
    if (groups != null) {
        if (!Array.isArray(groups)) {
            err('groups', '"groups" must be an array.');
        } else {
            groups.forEach((g, i) => {
                const p = `groups[${i}]`;
                if (!g || typeof g !== 'object' || Array.isArray(g)) { err(p, 'Each group must be an object.'); return; }
                if (typeof g.id !== 'string' || !ID_RE.test(g.id)) err(`${p}.id`, 'id must be a lowercase slug (a-z, 0-9, "-").');
                else if (gIds.has(g.id)) err(`${p}.id`, `Duplicate group id "${g.id}".`);
                else gIds.add(g.id);
                if (typeof g.name !== 'string' || !g.name.trim()) err(`${p}.name`, 'name is required.');
                if (typeof g.color !== 'string' || !g.color.trim()) err(`${p}.color`, 'color is required (a CSS color string).');
            });
        }
    }
    // Every language groupId must reference a defined group.
    langs.forEach((l, i) => {
        if (l && typeof l === 'object' && !Array.isArray(l) && typeof l.groupId === 'string' && !gIds.has(l.groupId)) {
            err(`languages[${i}].groupId`, `groupId "${l.groupId}" does not match any group id.`);
        }
    });

    return errors;
}
