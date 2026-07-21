// Pure index-building over a (validated) document. No DOM, no state.

export const FAMILY_SLOTS = 8; // matches --fam-0..7 in css/style.css

// Vitality badge levels, derived from a language's populationSeries + life status.
// Colors are semantic and theme-independent (read fine in light and dark), so they
// can be set inline — which also means image export carries them with no extra CSS.
export const VITALITY_LEVELS = {
    thriving:  { label: 'Thriving',  color: '#3a9d5d' },
    stable:    { label: 'Stable',    color: '#2a9d8f' },
    declining: { label: 'Declining', color: '#d68a00' },
    moribund:  { label: 'Moribund',  color: '#c0453a' },
    dead:      { label: 'Dead',      color: '#8a8f98' },
};

export const bySort = (a, b) =>
    (a.order ?? 0) - (b.order ?? 0) || a.born - b.born || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function buildModel(doc) {
    const languages = doc.languages ?? [];
    const borrowings = doc.borrowings ?? [];
    const events = (doc.events ?? []).slice().sort((a, b) => a.year - b.year || (a.endYear ?? a.year) - (b.endYear ?? b.year));
    const groups = doc.groups ?? [];
    const byId = new Map(languages.map(l => [l.id, l]));
    const borrowingById = new Map(borrowings.map(b => [b.id, b]));
    const eventById = new Map(events.map(e => [e.id, e]));
    const groupById = new Map(groups.map(g => [g.id, g]));

    const branchChildren = new Map(); // parentId -> [lang]
    const stageChild = new Map();     // parentId -> lang (at most one, validation-enforced)
    const roots = [];

    for (const l of languages) {
        if (l.parentId == null || !byId.has(l.parentId)) {
            roots.push(l);
            continue;
        }
        if (l.relation === 'stage' && !stageChild.has(l.parentId)) {
            stageChild.set(l.parentId, l);
        } else {
            if (!branchChildren.has(l.parentId)) branchChildren.set(l.parentId, []);
            branchChildren.get(l.parentId).push(l);
        }
    }
    roots.sort(bySort);
    for (const arr of branchChildren.values()) arr.sort(bySort);

    // A "chain" is a language plus its transitive stage successors — one visual column.
    const chainOf = (head) => {
        const chain = [head];
        let cur = head;
        let guard = 0;
        while (stageChild.has(cur.id) && guard++ < languages.length) {
            cur = stageChild.get(cur.id);
            chain.push(cur);
        }
        return chain;
    };

    // Family + color resolution: nearest ancestor (self included) with an explicit
    // color wins; otherwise a classification group's color; otherwise the family
    // root's palette slot. `effectiveGroupId` tracks the inherited group so the
    // panel/legend can say which classification a language belongs to.
    const rootIndex = new Map(roots.map((r, i) => [r.id, i]));
    const colorOf = new Map();
    const familyRootOf = new Map();
    const effectiveGroupId = new Map();
    for (const start of languages) {
        if (colorOf.has(start.id)) continue;
        const up = [];
        let cur = start;
        while (cur && !colorOf.has(cur.id)) {
            up.push(cur);
            cur = cur.parentId != null ? byId.get(cur.parentId) : null;
        }
        let color = cur ? colorOf.get(cur.id) : null;
        let famRoot = cur ? familyRootOf.get(cur.id) : null;
        let grpId = cur ? effectiveGroupId.get(cur.id) : null;
        for (let i = up.length - 1; i >= 0; i--) {
            const n = up[i];
            if (famRoot == null) famRoot = n.id; // topmost of the walk is a root
            const grp = n.groupId != null && groupById.has(n.groupId) ? groupById.get(n.groupId) : null;
            if (grp) grpId = grp.id;
            // Precedence: explicit per-language color > group color > inherited > family slot.
            if (n.color) color = n.color;
            else if (grp) color = grp.color;
            if (color == null) color = `var(--fam-${(rootIndex.get(famRoot) ?? 0) % FAMILY_SLOTS})`;
            colorOf.set(n.id, color);
            familyRootOf.set(n.id, famRoot);
            effectiveGroupId.set(n.id, grpId ?? null);
        }
    }

    // The classification group painting a language (its own, or the nearest
    // ancestor's), or null. `own` distinguishes a directly-assigned group from
    // an inherited one for the detail panel.
    const groupOf = (id) => groupById.get(effectiveGroupId.get(id)) ?? null;

    const borrowingsOf = (id) => ({
        out: borrowings.filter(b => b.fromId === id),
        incoming: borrowings.filter(b => b.toId === id),
    });

    // The set of a language plus every ancestor (primary + secondary parents,
    // transitively upward) and every descendant (stage + branch, downward).
    // Used by the lineage-highlight overlay. Cached per model.
    const lineageCache = new Map();
    const lineageOf = (id) => {
        if (lineageCache.has(id)) return lineageCache.get(id);
        const set = new Set();
        if (byId.has(id)) {
            // Up: follow both parent links.
            const up = [id];
            while (up.length) {
                const cur = byId.get(up.pop());
                if (!cur || set.has(cur.id)) continue;
                set.add(cur.id);
                if (cur.parentId != null && byId.has(cur.parentId)) up.push(cur.parentId);
                if (cur.secondaryParentId != null && byId.has(cur.secondaryParentId)) up.push(cur.secondaryParentId);
            }
            // Down: stage successor + branch children.
            const down = [id];
            while (down.length) {
                const cur = down.pop();
                set.add(cur);
                const sc = stageChild.get(cur);
                if (sc && !set.has(sc.id)) down.push(sc.id);
                for (const c of branchChildren.get(cur) ?? []) if (!set.has(c.id)) down.push(c.id);
            }
        }
        lineageCache.set(id, set);
        return set;
    };

    // Every descendant (stage successor + branch children, transitively down),
    // excluding the language itself. Cached — used for the panel's count.
    const descendantCache = new Map();
    const descendantsOf = (id) => {
        if (descendantCache.has(id)) return descendantCache.get(id);
        const set = new Set();
        const down = [id];
        while (down.length) {
            const cur = down.pop();
            const sc = stageChild.get(cur);
            if (sc && !set.has(sc.id)) { set.add(sc.id); down.push(sc.id); }
            for (const c of branchChildren.get(cur) ?? []) if (!set.has(c.id)) { set.add(c.id); down.push(c.id); }
        }
        descendantCache.set(id, set);
        return set;
    };

    // The year a `diverged` language handed off to its successors: the LAST
    // continuation's birth (the final split — matches "split at the last possible
    // time"). Considers both branch daughters AND a stage successor (a rename is
    // as much a hand-off as a split), so a language that only chains onward still
    // derives an end. null when it has no successor yet to derive from.
    const divergenceYearOf = (id) => {
        const kids = [...(branchChildren.get(id) ?? [])];
        const sc = stageChild.get(id);
        if (sc) kids.push(sc);
        if (!kids.length) return null;
        let y = -Infinity;
        for (const c of kids) if (c.born > y) y = c.born;
        return Number.isFinite(y) ? y : null;
    };

    // A language's effective end year: an explicit `died` if set, else — for a
    // `diverged` language with no explicit died — the derived divergence year
    // (so the death is automatic). null = still living / no derivable end.
    const diedOf = (l) => {
        if (l == null) return null;
        if (l.died != null) return l.died;
        if (l.diverged) return divergenceYearOf(l.id);
        return null;
    };

    // Per-family aggregate for the overview panel: one row per root, with the
    // language count and the family's overall year span (min born → max end).
    const familyStats = (presentYear) => {
        const end = l => diedOf(l) ?? (Number.isInteger(presentYear) ? presentYear : l.born);
        return roots.map(r => {
            const members = languages.filter(l => familyRootOf.get(l.id) === r.id);
            let minBorn = Infinity, maxYear = -Infinity;
            for (const l of members) { minBorn = Math.min(minBorn, l.born); maxYear = Math.max(maxYear, end(l)); }
            return {
                rootId: r.id, name: r.name, color: colorOf.get(r.id),
                count: members.length,
                minBorn: Number.isFinite(minBorn) ? minBorn : r.born,
                maxYear: Number.isFinite(maxYear) ? maxYear : r.born,
            };
        });
    };

    // Siblings of a language in the same order the layout packs them, so
    // keyboard nav and layout can never drift. Roots are each other's siblings.
    const siblingsOf = (id) => {
        const l = byId.get(id);
        if (!l) return [];
        if (l.parentId == null || !byId.has(l.parentId)) return roots.slice();
        // A branch child sits among all branch children of its parent's whole chain.
        const chainHeadOf = (start) => {
            // Walk up stage links to the chain head (the first non-stage member).
            let cur = start;
            while (cur.relation === 'stage' && cur.parentId != null && byId.has(cur.parentId)) {
                cur = byId.get(cur.parentId);
            }
            return cur;
        };
        const parent = byId.get(l.parentId);
        const head = chainHeadOf(parent);
        const chain = chainOf(head);
        const kids = [];
        for (const member of chain) for (const c of branchChildren.get(member.id) ?? []) kids.push(c);
        kids.sort(bySort);
        return kids;
    };

    // Vitality derived from a language's recorded populationSeries + life status.
    // Returns null when no series is recorded (badge is opt-in, appearing only
    // where DJ has entered numbers). Level is peak-relative so it stays honest
    // regardless of the world's absolute population scale:
    //   dead      — truly extinct (has a died year and no stage successor)
    //   thriving  — latest count within 10% of its own peak
    //   stable    — recovering (latest above the previous point)
    //   declining — latest between 50% and 90% of peak
    //   moribund  — latest below 50% of peak
    const vitalityOf = (id) => {
        const l = byId.get(id);
        if (!l) return null;
        const s = (Array.isArray(l.populationSeries) ? l.populationSeries.slice() : [])
            .filter(p => p && Number.isInteger(p.year) && typeof p.count === 'number')
            .sort((a, b) => a.year - b.year);
        if (!s.length) return null;
        const latest = s[s.length - 1];
        const peak = Math.max(...s.map(p => p.count));
        const prev = s.length >= 2 ? s[s.length - 2].count : null;
        // A diverged language dispersed into its daughters — not truly dead.
        const extinct = l.died != null && !stageChild.has(l.id) && !l.diverged;
        let level;
        if (extinct) level = 'dead';
        else if (peak > 0 && latest.count / peak >= 0.9) level = 'thriving';
        else if (prev != null && latest.count > prev) level = 'stable';
        else if (peak > 0 && latest.count / peak >= 0.5) level = 'declining';
        else level = 'moribund';
        return { level, ...VITALITY_LEVELS[level], latest, peak, series: s };
    };

    // Vitality AT a given year — the scrub/play-head version. Interpolates the
    // series to the year and classifies by the local trend + peak, so the badge
    // animates as the timeline plays. Returns null when the language has no
    // series or is not yet born at that year (nothing to show); a truly extinct
    // language reads "dead" once past its death year.
    const vitalityAt = (id, year) => {
        const base = vitalityOf(id);
        if (!base) return null;
        const l = byId.get(id);
        if (!Number.isInteger(year)) return base;
        if (year < l.born) return null;
        const s = base.series;
        const extinct = l.died != null && !stageChild.has(l.id) && !l.diverged;
        if (extinct && year >= l.died) {
            return { ...VITALITY_LEVELS.dead, level: 'dead', latest: { year: l.died, count: s[s.length - 1].count }, peak: base.peak, series: s, at: year };
        }
        // Linear interpolation of speaker count at `year` (flat outside the range).
        const popAt = (yr) => {
            if (yr <= s[0].year) return s[0].count;
            if (yr >= s[s.length - 1].year) return s[s.length - 1].count;
            for (let i = 1; i < s.length; i++) {
                if (yr <= s[i].year) {
                    const a = s[i - 1], b = s[i];
                    return a.count + (b.count - a.count) * (yr - a.year) / (b.year - a.year);
                }
            }
            return s[s.length - 1].count;
        };
        const val = popAt(year);
        const span = s[s.length - 1].year - s[0].year;
        const prevVal = popAt(year - Math.max(1, Math.round(span / 20)));
        const peak = base.peak;
        let level;
        if (val > prevVal * 1.02) level = (peak > 0 && val / peak >= 0.9) ? 'thriving' : 'stable'; // growing
        else if (peak > 0 && val / peak >= 0.9) level = 'thriving';
        else if (peak > 0 && val / peak >= 0.5) level = 'declining';
        else level = 'moribund';
        return { ...VITALITY_LEVELS[level], level, latest: { year, count: Math.round(val) }, peak, series: s, at: year };
    };

    // Referential users of a language — what blocks deletion.
    const blockersOf = (id) => {
        const kids = languages.filter(l => l.parentId === id).map(l => l.name);
        const creoles = languages.filter(l => l.secondaryParentId === id).map(l => `${l.name} (second parent)`);
        const bors = borrowings.filter(b => b.fromId === id || b.toId === id).map(b => `borrowing ${b.label ?? b.id}`);
        return [...kids, ...creoles, ...bors];
    };

    return {
        languages, borrowings, events, groups, byId, borrowingById, eventById, groupById,
        branchChildren, stageChild, roots,
        chainOf, colorOf, familyRootOf, rootIndex, groupOf,
        borrowingsOf, blockersOf, lineageOf, siblingsOf,
        descendantsOf, familyStats, vitalityOf, vitalityAt,
        divergenceYearOf, diedOf,
    };
}
