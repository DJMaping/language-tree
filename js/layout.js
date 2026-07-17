// Column/coordinate layout. Pure and deterministic: the same document always
// yields the same picture. World x is in px; the year axis is handled at render
// time (screenY = year * pxPerYear + panY), so no world y exists here.

import { bySort } from './model.js';

export const COL_W = 190;      // column center-to-center
export const BOX_W = 170;      // box width (< COL_W, so columns never overlap)
export const BOX_H = 40;
export const GUTTER_W = 72;    // pinned year-axis gutter on the left
export const ROOT_GAP = 80;    // extra px between family blocks
export const PAD_LEFT = 28;

export function computeLayout(model) {
    const pos = new Map(); // id -> { col, x } (x = world center-x in px)
    let nextCol = 0;
    let extraGap = 0;

    const place = (head) => { // returns subtree width in columns
        const chain = model.chainOf(head);
        const col = nextCol++;
        const x = GUTTER_W + PAD_LEFT + BOX_W / 2 + col * COL_W + extraGap;
        for (const member of chain) pos.set(member.id, { col, x });

        // Branch children of the WHOLE chain (off any stage), in one sorted run
        // so DJ's `order` hints work across the chain.
        const kids = [];
        for (const member of chain) {
            for (const c of model.branchChildren.get(member.id) ?? []) kids.push(c);
        }
        kids.sort(bySort);

        let width = 1;
        for (const child of kids) width += place(child);
        return width;
    };

    model.roots.forEach((r, i) => {
        if (i > 0) extraGap += ROOT_GAP;
        place(r);
    });

    // Bounds over the data (caller mixes in config.presentYear for fit/clamp).
    let minYear = Infinity, maxYear = -Infinity, minX = Infinity, maxX = -Infinity;
    for (const l of model.languages) {
        const p = pos.get(l.id);
        if (!p) continue;
        minYear = Math.min(minYear, l.born);
        maxYear = Math.max(maxYear, l.died ?? l.born);
        minX = Math.min(minX, p.x - BOX_W / 2);
        maxX = Math.max(maxX, p.x + BOX_W / 2);
    }
    if (!Number.isFinite(minYear)) { minYear = 0; maxYear = 1; minX = GUTTER_W; maxX = GUTTER_W + COL_W; }

    return { pos, bounds: { minYear, maxYear, minX, maxX } };
}
