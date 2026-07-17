// Pure index-building over a (validated) document. No DOM, no state.

export const FAMILY_SLOTS = 8; // matches --fam-0..7 in css/style.css

export const bySort = (a, b) =>
    (a.order ?? 0) - (b.order ?? 0) || a.born - b.born || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function buildModel(doc) {
    const languages = doc.languages ?? [];
    const borrowings = doc.borrowings ?? [];
    const events = (doc.events ?? []).slice().sort((a, b) => a.year - b.year || (a.endYear ?? a.year) - (b.endYear ?? b.year));
    const byId = new Map(languages.map(l => [l.id, l]));
    const borrowingById = new Map(borrowings.map(b => [b.id, b]));
    const eventById = new Map(events.map(e => [e.id, e]));

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
    // color wins; otherwise the family root's palette slot.
    const rootIndex = new Map(roots.map((r, i) => [r.id, i]));
    const colorOf = new Map();
    const familyRootOf = new Map();
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
        for (let i = up.length - 1; i >= 0; i--) {
            const n = up[i];
            if (famRoot == null) famRoot = n.id; // topmost of the walk is a root
            if (n.color) color = n.color;
            if (color == null) color = `var(--fam-${(rootIndex.get(famRoot) ?? 0) % FAMILY_SLOTS})`;
            colorOf.set(n.id, color);
            familyRootOf.set(n.id, famRoot);
        }
    }

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

    // Referential users of a language — what blocks deletion.
    const blockersOf = (id) => {
        const kids = languages.filter(l => l.parentId === id).map(l => l.name);
        const creoles = languages.filter(l => l.secondaryParentId === id).map(l => `${l.name} (second parent)`);
        const bors = borrowings.filter(b => b.fromId === id || b.toId === id).map(b => `borrowing ${b.label ?? b.id}`);
        return [...kids, ...creoles, ...bors];
    };

    return {
        languages, borrowings, events, byId, borrowingById, eventById,
        branchChildren, stageChild, roots,
        chainOf, colorOf, familyRootOf, rootIndex,
        borrowingsOf, blockersOf, lineageOf, siblingsOf,
    };
}
