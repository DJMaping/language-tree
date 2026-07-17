// Pure index-building over a (validated) document. No DOM, no state.

export const FAMILY_SLOTS = 8; // matches --fam-0..7 in css/style.css

export const bySort = (a, b) =>
    (a.order ?? 0) - (b.order ?? 0) || a.born - b.born || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function buildModel(doc) {
    const languages = doc.languages ?? [];
    const borrowings = doc.borrowings ?? [];
    const byId = new Map(languages.map(l => [l.id, l]));

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

    // Referential users of a language — what blocks deletion.
    const blockersOf = (id) => {
        const kids = languages.filter(l => l.parentId === id).map(l => l.name);
        const creoles = languages.filter(l => l.secondaryParentId === id).map(l => `${l.name} (second parent)`);
        const bors = borrowings.filter(b => b.fromId === id || b.toId === id).map(b => `borrowing ${b.label ?? b.id}`);
        return [...kids, ...creoles, ...bors];
    };

    return {
        languages, borrowings, byId,
        branchChildren, stageChild, roots,
        chainOf, colorOf, familyRootOf, rootIndex,
        borrowingsOf, blockersOf,
    };
}
