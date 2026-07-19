// SVG renderer. Recompute-based semantic zoom: every frame recomputes screen
// coordinates from (pxPerYear, panX, panY); boxes and fonts stay a constant
// screen size, so nothing ever blurs and no giant world coordinates hit the DOM.
//
// Besides the tree itself it renders the interaction overlays: the branch
// handle on the hovered/selected box, live drag previews (time-drag and
// drag-off-a-parent), and the ghost box for a pending in-place creation.

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

function ghostBox(cx, yTop, label, s = 1) {
    return `<g class="ghost-lang" transform="translate(${cx - BOX_W * s / 2} ${yTop}) scale(${s})">` +
        `<rect class="ghost-box" width="${BOX_W}" height="${BOX_H}" rx="6"/>` +
        (label ? `<text class="ghost-label" x="10" y="24">${esc(label)}</text>` : '') +
        `</g>`;
}

// Renders the whole scene into `svg`. Returns the map of on-screen box
// positions (id -> {x, y}, x = center, y = top).
export function render(svg, ctx) {
    const {
        model, layout, view, config, selected, hoverId,
        highlight, scrub, pending, handleDrag, drag, reorder, fitZoom, w, h,
    } = ctx;
    const ppy = view.pxPerYear, panX = view.panX, panY = view.panY;
    const screenY = year => year * ppy + panY;
    const hiddenCounts = layout.hiddenCounts ?? new Map();

    // Semantic downscale on zoom-out: boxes stay full size at/above the
    // fit-to-content zoom and shrink (down to S_MIN) as you zoom out past it.
    // Smaller boxes need less vertical room, so the anti-overlap push-down below
    // stops kicking in and boxes stay pinned to their true year.
    const S_MIN = 0.4;
    const bs = Math.max(S_MIN, Math.min(1, fitZoom ? ppy / fitZoom : 1));
    const bw = BOX_W * bs, bh = BOX_H * bs;

    // Typed selection: only one of these is set at a time.
    const selLang = selected?.type === 'lang' ? selected.id : null;
    const selBorrow = selected?.type === 'borrowing' ? selected.id : null;
    const selEvent = selected?.type === 'event' ? selected.id : null;

    // Lineage highlight + year-scrub state (both drive CSS classes on elements).
    const hlSet = highlight?.set ?? null;
    const focusId = highlight?.focusId ?? null;
    const scrubYear = Number.isInteger(scrub?.year) ? scrub.year : null;
    const aliveAt = (l, year) => l.born <= year && (l.died == null || year <= l.died);
    const langGhosted = l => scrubYear != null && !aliveAt(l, scrubYear);

    // A live time-drag temporarily shifts the affected languages' years.
    const dragDelta = l => (drag && drag.ids.has(l.id) ? drag.delta : 0);
    const bornOf = l => l.born + dragDelta(l);
    const diedOf = l => (l.died == null ? null : l.died + (drag?.shiftDied ? dragDelta(l) : 0));

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
        arr.sort((a, b) => bornOf(a) - bornOf(b) || (a.id < b.id ? -1 : 1));
        const gap = 8 * bs;
        let prevBottom = -Infinity;
        for (const l of arr) {
            let y = screenY(bornOf(l));
            if (y < prevBottom + gap) y = prevBottom + gap;
            prevBottom = y + bh;
            box.set(l.id, { x: layout.pos.get(l.id).x + panX, y });
        }
    }

    // Extra classes an element inherits from its child language: dimmed unless
    // in the highlighted lineage, ghosted when not alive at the scrub year.
    const connCls = (base, l) => {
        let c = base;
        if (hlSet && hlSet.has(l.id)) c += ' hl';
        if (langGhosted(l)) c += ' ghosted';
        return c;
    };

    let tails = '', branches = '', stages = '', creoles = '', borrows = '';

    for (const l of model.languages) {
        const b = box.get(l.id);
        if (!b) continue;
        const color = model.colorOf.get(l.id);
        const died = diedOf(l);

        // Extinction: dotted tail down to the death year (unless a stage
        // successor continues the same line — then the chain tells the story).
        if (died != null && !model.stageChild.has(l.id)) {
            const y0 = b.y + bh;
            const yd = screenY(died);
            if (yd > y0 + 14) {
                tails += `<path class="${connCls('extinct-tail', l)}" d="M ${b.x} ${y0} L ${b.x} ${yd - 12}"/>` +
                    `<text class="${connCls('extinct-glyph', l)}" x="${b.x}" y="${yd}">†</text>`;
            } else {
                tails += `<text class="${connCls('extinct-glyph', l)}" x="${b.x}" y="${y0 + 12}">†</text>`;
            }
        }

        if (l.parentId != null) {
            const pb = box.get(l.parentId);
            if (pb) {
                if (l.relation === 'stage') {
                    stages += `<path class="${connCls('conn-stage', l)}" style="stroke:${color}" d="M ${pb.x} ${pb.y + bh} L ${b.x} ${b.y}"/>`;
                } else {
                    branches += `<path class="${connCls('conn-branch', l)}" style="stroke:${color}" d="${elbow(pb.x, pb.y + bh, b.x, b.y)}"/>`;
                }
            }
            if (l.secondaryParentId != null) {
                const sp = box.get(l.secondaryParentId);
                if (sp) {
                    const sColor = model.colorOf.get(l.secondaryParentId);
                    creoles += `<path class="${connCls('conn-creole', l)}" style="stroke:${sColor}" d="${elbow(sp.x, sp.y + bh, b.x + 12, b.y)}"/>`;
                }
            }
        }
    }

    const showBorrowLabels = ppy >= 0.15;
    for (const bor of model.borrowings) {
        const s = box.get(bor.fromId), t = box.get(bor.toId);
        if (!s || !t) continue;
        const from = model.byId.get(bor.fromId), to = model.byId.get(bor.toId);
        const sy = s.y + bh / 2, ty = t.y + bh / 2;
        let d, lx;
        if (Math.abs(t.x - s.x) < BOX_W) {
            // Same or adjacent column: bow out past the right edges.
            const x0 = s.x + bw / 2, x1 = t.x + bw / 2;
            const bow = Math.max(x0, x1) + 46;
            d = `M ${x0} ${sy} C ${bow} ${sy}, ${bow} ${ty}, ${x1} ${ty}`;
            lx = bow;
        } else {
            const dir = t.x > s.x ? 1 : -1;
            const x0 = s.x + dir * bw / 2, x1 = t.x - dir * bw / 2;
            const c = Math.max(40, Math.abs(x1 - x0) * 0.35);
            d = `M ${x0} ${sy} C ${x0 + c * dir} ${sy}, ${x1 - c * dir} ${ty}, ${x1} ${ty}`;
            lx = (x0 + x1) / 2;
        }
        const kind = bor.kind ?? 'loan';
        let gCls = 'borrow';
        if (bor.id === selBorrow) gCls += ' selected';
        if (focusId && (bor.fromId === focusId || bor.toId === focusId)) gCls += ' hl';
        if (scrubYear != null && (langGhosted(from ?? {}) || langGhosted(to ?? {}))) gCls += ' ghosted';
        borrows += `<g class="${gCls}" data-borrow-id="${esc(bor.id)}">` +
            `<path class="borrow-hit" d="${d}"/>` +
            `<path class="conn-borrow kind-${kind}" d="${d}" marker-end="url(#arrow)"/>`;
        if (showBorrowLabels && (bor.label || bor.year != null)) {
            const text = [bor.label, bor.year != null ? String(bor.year) : null].filter(Boolean).join(', ');
            const ly = (sy + ty) / 2;
            const tw = text.length * 5.6 + 14;
            borrows += `<rect class="borrow-label-bg" x="${lx - tw / 2}" y="${ly - 9}" width="${tw}" height="18" rx="9"/>` +
                `<text class="borrow-label" x="${lx}" y="${ly + 3.5}">${esc(text)}</text>`;
        }
        borrows += `</g>`;
    }

    let boxes = '';
    for (const l of model.languages) {
        const b = box.get(l.id);
        if (!b) continue;
        if (b.y > h + 120 || b.y + bh < -120 || b.x - bw / 2 > w + 60 || b.x + bw / 2 < GUTTER_W - 60) continue;
        const color = model.colorOf.get(l.id);
        const died = diedOf(l);
        // A died-year with a stage successor is a renaming, not an extinction — no †.
        const yearsTxt = died != null
            ? `${bornOf(l)} – ${died}${model.stageChild.has(l.id) ? '' : ' †'}`
            : `${bornOf(l)} – now`;
        const hidden = hiddenCounts.get(l.id) ?? 0;
        let cls = 'lang';
        if (l.id === selLang) cls += ' selected';
        if (hlSet && hlSet.has(l.id)) cls += ' hl';
        if (langGhosted(l)) cls += ' ghosted';
        if (hidden) cls += ' collapsed';
        if (reorder && l.id === reorder.id) cls += ' reordering';
        boxes += `<g class="${cls}" data-id="${esc(l.id)}" transform="translate(${b.x - bw / 2} ${b.y}) scale(${bs})">` +
            `<rect class="lang-box" width="${BOX_W}" height="${BOX_H}" rx="6" style="stroke:${color}"/>` +
            `<text class="lang-name" x="10" y="17">${esc(truncName(l.name))}</text>` +
            `<text class="lang-years" x="10" y="32">${esc(yearsTxt)}</text>` +
            `<title>${esc(l.name)} (${esc(yearsTxt)})</title>`;
        if (hidden) {
            const bw = 22 + String(hidden).length * 7;
            boxes += `<g class="collapse-badge" data-collapse="${esc(l.id)}" transform="translate(${BOX_W - 14} ${BOX_H - 8})">` +
                `<rect class="collapse-badge-bg" x="0" y="0" width="${bw}" height="16" rx="8" style="fill:${color}"/>` +
                `<text class="collapse-badge-text" x="${bw / 2}" y="12">+${hidden}</text>` +
                `<title>${hidden} hidden — click to expand</title></g>`;
        }
        boxes += `</g>`;
    }

    // --- interaction overlays -------------------------------------------------

    let overlay = '';
    const gestureActive = !!(drag || handleDrag || pending || reorder);

    // Sibling-reorder drop caret: a vertical guide where the box will land.
    if (reorder && Number.isFinite(reorder.caretX)) {
        overlay += `<line class="reorder-caret" x1="${reorder.caretX}" y1="0" x2="${reorder.caretX}" y2="${h}"/>`;
    }

    // Branch handle on the hovered and selected boxes (hidden mid-gesture).
    if (!gestureActive) {
        for (const hid of new Set([hoverId, selLang])) {
            if (!hid) continue;
            const b = box.get(hid);
            if (!b) continue;
            overlay += `<circle class="branch-handle" data-handle="${esc(hid)}" cx="${b.x}" cy="${b.y + bh}" r="6">` +
                `<title>Drag into empty space to branch off a daughter</title></circle>`;
        }
    }

    // Live preview while dragging off a parent: dashed connector + ghost box.
    if (handleDrag) {
        const p = box.get(handleDrag.parentId);
        const pColor = model.colorOf.get(handleDrag.parentId) ?? 'var(--muted)';
        if (p) overlay += `<path class="conn-branch ghost" style="stroke:${pColor}" d="${elbow(p.x, p.y + bh, handleDrag.x, handleDrag.y)}"/>`;
        overlay += ghostBox(handleDrag.x, handleDrag.y, 'new daughter…', bs);
    }

    // Pending in-place creation: ghost box under the inline name input.
    if (pending) {
        const gx = pending.worldX + panX;
        const gy = screenY(pending.born);
        if (pending.relation !== 'root') {
            const p = box.get(pending.parentId);
            if (p) {
                const cls = pending.relation === 'stage' ? 'conn-stage' : 'conn-branch';
                const pColor = model.colorOf.get(pending.parentId) ?? 'var(--muted)';
                const d = pending.relation === 'stage'
                    ? `M ${p.x} ${p.y + bh} L ${gx} ${gy}`
                    : elbow(p.x, p.y + bh, gx, gy);
                overlay += `<path class="${cls} ghost" style="stroke:${pColor}" d="${d}"/>`;
            }
        }
        overlay += ghostBox(gx, gy, '', bs);
    }

    // --- timeline events: bands (ranged) / rules (single-year), behind the tree ---
    let eventsSvg = '';
    for (const ev of model.events ?? []) {
        const y0 = screenY(ev.year);
        if (ev.endYear != null && ev.endYear !== ev.year) {
            const y1 = screenY(ev.endYear);
            if (y1 < -20 || y0 > h + 20) continue;
            const top = Math.min(y0, y1), height = Math.abs(y1 - y0);
            const colStyle = ev.color ? ` style="fill:${ev.color}"` : '';
            const strokeStyle = ev.color ? ` style="stroke:${ev.color}"` : '';
            eventsSvg += `<g class="event${ev.id === selEvent ? ' selected' : ''}" data-event-id="${esc(ev.id)}">` +
                `<rect class="event-band"${colStyle} x="${GUTTER_W}" y="${top}" width="${Math.max(0, w - GUTTER_W)}" height="${height}"/>` +
                `<rect class="event-band-edge"${strokeStyle} x="${GUTTER_W}" y="${top}" width="${Math.max(0, w - GUTTER_W)}" height="${height}"/>`;
            if (height >= 14) {
                eventsSvg += `<text class="event-band-label" x="${GUTTER_W + 8}" y="${top + 13}">${esc(ev.label)}</text>`;
            }
            eventsSvg += `</g>`;
        } else {
            if (y0 < -20 || y0 > h + 20) continue;
            const strokeStyle = ev.color ? ` style="stroke:${ev.color}"` : '';
            eventsSvg += `<g class="event${ev.id === selEvent ? ' selected' : ''}" data-event-id="${esc(ev.id)}">` +
                `<line class="event-line"${strokeStyle} x1="${GUTTER_W}" y1="${y0}" x2="${w}" y2="${y0}"/>` +
                `<rect class="event-line-hit" x="${GUTTER_W}" y="${y0 - 5}" width="${Math.max(0, w - GUTTER_W)}" height="10"/>` +
                `<text class="event-line-label" x="${GUTTER_W + 8}" y="${y0 - 4}">${esc(ev.label)}</text>` +
                `</g>`;
        }
    }

    const axis = renderAxisParts({
        w, h, pxPerYear: ppy, panY,
        zeroLabel: config?.axis?.zeroLabel ?? '0',
        presentYear: config?.presentYear,
        scrubYear,
    });

    svg.classList.toggle('highlighting', !!hlSet);
    svg.classList.toggle('scrubbing', scrubYear != null);

    svg.innerHTML =
        `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" ` +
        `orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" style="fill:var(--muted)"/></marker></defs>` +
        axis.gridSvg + eventsSvg + axis.presentLineSvg +
        tails + branches + stages + creoles + borrows + boxes + overlay +
        axis.gutterSvg + axis.scrubSvg;

    return box;
}
