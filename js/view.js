// SVG renderer. Recompute-based semantic zoom: every frame recomputes screen
// coordinates from (pxPerYear, panX, panY); boxes and fonts stay a constant
// screen size, so nothing ever blurs and no giant world coordinates hit the DOM.

import { BOX_W, BOX_H, GUTTER_W } from './layout.js';
import { renderAxisParts } from './axis.js';

const esc = s => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Name truncation via canvas text measurement (SVG has no native ellipsis).
const measure = document.createElement('canvas').getContext('2d');
const NAME_FONT = '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const truncCache = new Map();

function truncName(name, maxW = BOX_W - 20) {
    if (truncCache.has(name)) return truncCache.get(name);
    measure.font = NAME_FONT;
    let out = name;
    if (measure.measureText(name).width > maxW) {
        let lo = 0, hi = name.length;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (measure.measureText(name.slice(0, mid) + '…').width <= maxW) lo = mid;
            else hi = mid - 1;
        }
        out = name.slice(0, lo) + '…';
    }
    truncCache.set(name, out);
    return out;
}

// Rounded elbow from a parent's bottom edge into a child's top edge, with
// bezier fallbacks when the geometry gets too tight for corners.
function elbow(x1, y1, x2, y2) {
    const dx = x2 - x1;
    if (Math.abs(dx) < 24) {
        return `M ${x1} ${y1} C ${x1} ${y1 + 30}, ${x2} ${y2 - 30}, ${x2} ${y2}`;
    }
    if (y2 - y1 >= 28) {
        const my = y2 - 14, r = 8, s = dx > 0 ? 1 : -1;
        return `M ${x1} ${y1} L ${x1} ${my - r} Q ${x1} ${my}, ${x1 + r * s} ${my} ` +
            `L ${x2 - r * s} ${my} Q ${x2} ${my}, ${x2} ${my + r} L ${x2} ${y2}`;
    }
    const midY = (y1 + y2) / 2;
    return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
}

// Renders the whole scene into `svg`. Returns the map of on-screen box
// positions (id -> {x, y}, x = center, y = top).
export function render(svg, ctx) {
    const { model, layout, view, config, selectedId, w, h } = ctx;
    const ppy = view.pxPerYear, panX = view.panX, panY = view.panY;
    const screenY = year => year * ppy + panY;

    // Box positions, with a per-column push-down pass so boxes in one column
    // never overlap even when zoomed far out (positions go approximate, the
    // column order stays truthful).
    const colGroups = new Map();
    for (const l of model.languages) {
        const p = layout.pos.get(l.id);
        if (!p) continue;
        if (!colGroups.has(p.col)) colGroups.set(p.col, []);
        colGroups.get(p.col).push(l);
    }
    const box = new Map();
    for (const arr of colGroups.values()) {
        arr.sort((a, b) => a.born - b.born || (a.id < b.id ? -1 : 1));
        let prevBottom = -Infinity;
        for (const l of arr) {
            let y = screenY(l.born);
            if (y < prevBottom + 8) y = prevBottom + 8;
            prevBottom = y + BOX_H;
            box.set(l.id, { x: layout.pos.get(l.id).x + panX, y });
        }
    }

    let tails = '', branches = '', stages = '', creoles = '', borrows = '';

    for (const l of model.languages) {
        const b = box.get(l.id);
        if (!b) continue;
        const color = model.colorOf.get(l.id);

        // Extinction: dotted tail down to the death year (unless a stage
        // successor continues the same line — then the chain tells the story).
        if (l.died != null && !model.stageChild.has(l.id)) {
            const y0 = b.y + BOX_H;
            const yd = screenY(l.died);
            if (yd > y0 + 14) {
                tails += `<path class="extinct-tail" d="M ${b.x} ${y0} L ${b.x} ${yd - 12}"/>` +
                    `<text class="extinct-glyph" x="${b.x}" y="${yd}">†</text>`;
            } else {
                tails += `<text class="extinct-glyph" x="${b.x}" y="${y0 + 12}">†</text>`;
            }
        }

        if (l.parentId != null) {
            const pb = box.get(l.parentId);
            if (pb) {
                if (l.relation === 'stage') {
                    stages += `<path class="conn-stage" style="stroke:${color}" d="M ${pb.x} ${pb.y + BOX_H} L ${b.x} ${b.y}"/>`;
                } else {
                    branches += `<path class="conn-branch" style="stroke:${color}" d="${elbow(pb.x, pb.y + BOX_H, b.x, b.y)}"/>`;
                }
            }
            if (l.secondaryParentId != null) {
                const sp = box.get(l.secondaryParentId);
                if (sp) {
                    const sColor = model.colorOf.get(l.secondaryParentId);
                    creoles += `<path class="conn-creole" style="stroke:${sColor}" d="${elbow(sp.x, sp.y + BOX_H, b.x + 12, b.y)}"/>`;
                }
            }
        }
    }

    const showBorrowLabels = ppy >= 0.15;
    for (const bor of model.borrowings) {
        const s = box.get(bor.fromId), t = box.get(bor.toId);
        if (!s || !t) continue;
        const sy = s.y + BOX_H / 2, ty = t.y + BOX_H / 2;
        let d, lx;
        if (Math.abs(t.x - s.x) < BOX_W) {
            // Same or adjacent column: bow out past the right edges.
            const x0 = s.x + BOX_W / 2, x1 = t.x + BOX_W / 2;
            const bow = Math.max(x0, x1) + 46;
            d = `M ${x0} ${sy} C ${bow} ${sy}, ${bow} ${ty}, ${x1} ${ty}`;
            lx = bow;
        } else {
            const dir = t.x > s.x ? 1 : -1;
            const x0 = s.x + dir * BOX_W / 2, x1 = t.x - dir * BOX_W / 2;
            const c = Math.max(40, Math.abs(x1 - x0) * 0.35);
            d = `M ${x0} ${sy} C ${x0 + c * dir} ${sy}, ${x1 - c * dir} ${ty}, ${x1} ${ty}`;
            lx = (x0 + x1) / 2;
        }
        borrows += `<path class="conn-borrow" d="${d}" marker-end="url(#arrow)"/>`;
        if (showBorrowLabels && (bor.label || bor.year != null)) {
            const text = [bor.label, bor.year != null ? String(bor.year) : null].filter(Boolean).join(', ');
            const ly = (sy + ty) / 2;
            const tw = text.length * 5.6 + 14;
            borrows += `<g><rect class="borrow-label-bg" x="${lx - tw / 2}" y="${ly - 9}" width="${tw}" height="18" rx="9"/>` +
                `<text class="borrow-label" x="${lx}" y="${ly + 3.5}">${esc(text)}</text></g>`;
        }
    }

    let boxes = '';
    for (const l of model.languages) {
        const b = box.get(l.id);
        if (!b) continue;
        if (b.y > h + 120 || b.y + BOX_H < -120 || b.x - BOX_W / 2 > w + 60 || b.x + BOX_W / 2 < GUTTER_W - 60) continue;
        const color = model.colorOf.get(l.id);
        // A died-year with a stage successor is a renaming, not an extinction — no †.
        const yearsTxt = l.died != null
            ? `${l.born} – ${l.died}${model.stageChild.has(l.id) ? '' : ' †'}`
            : `${l.born} – now`;
        const sel = l.id === selectedId ? ' selected' : '';
        boxes += `<g class="lang${sel}" data-id="${esc(l.id)}" transform="translate(${b.x - BOX_W / 2} ${b.y})">` +
            `<rect class="lang-box" width="${BOX_W}" height="${BOX_H}" rx="6" style="stroke:${color}"/>` +
            `<text class="lang-name" x="10" y="17">${esc(truncName(l.name))}</text>` +
            `<text class="lang-years" x="10" y="32">${esc(yearsTxt)}</text>` +
            `<title>${esc(l.name)} (${esc(yearsTxt)})</title></g>`;
    }

    const axis = renderAxisParts({
        w, h, pxPerYear: ppy, panY,
        zeroLabel: config?.axis?.zeroLabel ?? '0',
        presentYear: config?.presentYear,
    });

    svg.innerHTML =
        `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" ` +
        `orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" style="fill:var(--muted)"/></marker></defs>` +
        axis.gridSvg + axis.presentLineSvg +
        tails + branches + stages + creoles + borrows + boxes +
        axis.gutterSvg;

    return box;
}
