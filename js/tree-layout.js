// Classic left-to-right family-tree layout (the "tree view" alternative to the
// timeline). Pure and deterministic, and returns the SAME contract shape as
// computeLayout in layout.js so state.layout stays a uniform object:
//   { pos: Map<id,{x,y,depth}>, hiddenCounts, bounds:{minX,maxX,minY,maxY} }
// Coordinates are world px. Unlike the timeline (where y == birth year), here x is
// purely the generation depth and y is a tidy sibling packing — hierarchy, not time.
//
// Stages march rightward: a renamed language (Proto-X -> Old X -> Modern X) is drawn
// as one left-to-right chain, each stage a deeper generation, exactly like a branch
// daughter. Parents are centered on their children (an org-chart / tidy-tree look).

import { bySort } from './model.js';
import { BOX_W, BOX_H } from './layout.js';

export const GEN_W = 200;    // horizontal distance between generations (center-to-center)
export const ROW_H = 64;     // vertical distance between stacked leaves
export const PAD = 40;       // left/top padding before the first node
export const ROOT_GAP = 56;  // extra vertical gap between separate family trees

// `collapsed` (a Set of ids) folds a language's whole subtree: its stage successor
// and every branch descendant stop being placed. hiddenCounts maps each collapsed id
// to how many descendants it hides (for the +N badge), matching computeLayout.
export function computeTreeLayout(model, collapsed = new Set()) {
    const pos = new Map();
    const hiddenCounts = new Map();

    // Count every descendant (stage + branch) of a language — what collapse hides.
    const descendantCount = (id) => {
        let n = 0;
        const stack = [id];
        while (stack.length) {
            const cur = stack.pop();
            const sc = model.stageChild.get(cur);
            if (sc) { n++; stack.push(sc.id); }
            for (const c of model.branchChildren.get(cur) ?? []) { n++; stack.push(c.id); }
        }
        return n;
    };

    // A node's tree children = its branch daughters plus its stage successor, all one
    // generation to the right, sorted together so DJ's `order` hints and birth years
    // read sensibly top-to-bottom.
    const childrenOf = (lang) => {
        const kids = [...(model.branchChildren.get(lang.id) ?? [])];
        const sc = model.stageChild.get(lang.id);
        if (sc) kids.push(sc);
        kids.sort(bySort);
        return kids;
    };

    let nextY = PAD + BOX_H / 2; // running center-y for the next leaf placed

    // Post-order: place children first, then center the parent on them. Returns the
    // node's center-y. A collapsed node is a layout leaf (its subtree is folded).
    const place = (lang, depth) => {
        const x = PAD + depth * GEN_W + BOX_W / 2;
        if (collapsed.has(lang.id)) {
            const n = descendantCount(lang.id);
            if (n) hiddenCounts.set(lang.id, n);
            const y = nextY;
            nextY += ROW_H;
            pos.set(lang.id, { x, y, depth });
            return y;
        }
        const kids = childrenOf(lang);
        if (kids.length === 0) {
            const y = nextY;
            nextY += ROW_H;
            pos.set(lang.id, { x, y, depth });
            return y;
        }
        const ys = kids.map(k => place(k, depth + 1));
        const y = (ys[0] + ys[ys.length - 1]) / 2; // center the parent on its children
        pos.set(lang.id, { x, y, depth });
        return y;
    };

    model.roots.forEach((r, i) => {
        if (i > 0) nextY += ROOT_GAP;
        place(r, 0);
    });

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of pos.values()) {
        minX = Math.min(minX, p.x - BOX_W / 2);
        maxX = Math.max(maxX, p.x + BOX_W / 2);
        minY = Math.min(minY, p.y - BOX_H / 2);
        maxY = Math.max(maxY, p.y + BOX_H / 2);
    }
    if (!Number.isFinite(minX)) { minX = 0; maxX = BOX_W; minY = 0; maxY = BOX_H; }

    return { pos, hiddenCounts, bounds: { minX, maxX, minY, maxY } };
}
