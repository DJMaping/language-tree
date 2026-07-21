// SVG renderer for the classic left-to-right tree view (the alternative to the
// timeline renderer in view.js). Reuses view.js's langBoxSvg so boxes look
// identical; what differs is the coordinate math (a uniform world->screen scale
// instead of year->y), horizontal parent->child connectors, and the absence of
// everything time-specific (year axis, "now"/extinct tails, events, scrub rule).

import { BOX_W, BOX_H } from './layout.js';
import { langBoxSvg } from './view.js';

const esc = s => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Semantic zoom floor (matches view.js): boxes shrink with the world scale down to
// this, and stay full size once zoomed in to scale 1.
const S_MIN = 0.13;

// Rounded elbow from a parent's RIGHT edge into a child's LEFT edge: run out to the
// mid-x, drop (or rise) to the child's row, then run in. Horizontal analogue of
// view.js's vertical elbow().
function elbowH(x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    if (Math.abs(dy) < 1) return `M ${x1} ${y1} L ${x2} ${y2}`;
    const mx = x1 + dx / 2;
    const r = Math.max(0, Math.min(8, Math.abs(dx) / 2, Math.abs(dy) / 2));
    const s = dy > 0 ? 1 : -1;
    return `M ${x1} ${y1} L ${mx - r} ${y1} Q ${mx} ${y1}, ${mx} ${y1 + r * s} ` +
        `L ${mx} ${y2 - r * s} Q ${mx} ${y2}, ${mx + r} ${y2} L ${x2} ${y2}`;
}

// Renders the whole tree scene into `svg`. Returns { pos, scale } like render():
// pos maps id -> { x: box center, y: box top } in screen px for hit-testing.
export function renderTree(svg, ctx) {
    const {
        model, layout, view, selected, multi, marquee, hoverId,
        highlight, filterSet, scrub, reparent, w, h,
    } = ctx;
    const multiSet = multi && multi.size ? multi : null;
    const scale = view.scale, panX = view.panX, panY = view.panY;
    const hiddenCounts = layout.hiddenCounts ?? new Map();

    const bs = Math.max(S_MIN, Math.min(1, scale));
    const bw = BOX_W * bs, bh = BOX_H * bs;

    const selLang = selected?.type === 'lang' ? selected.id : null;
    const selBorrow = selected?.type === 'borrowing' ? selected.id : null;

    const hlSet = highlight?.set ?? null;
    const focusId = highlight?.focusId ?? null;
    const scrubYear = Number.isInteger(scrub?.year) ? scrub.year : null;
    const aliveAt = (l, year) => { const d = model.diedOf(l); return l.born <= year && (d == null || year <= d); };
    const langGhosted = l => scrubYear != null && !aliveAt(l, scrubYear);
    const langFiltered = l => filterSet != null && !filterSet.has(l.id);

    // The tree ignores time, so births/deaths are plain (no live time-drag folded in).
    const bornOf = l => l.born;
    const diedOf = l => model.diedOf(l);

    // Screen center of every placed language.
    const center = new Map();
    for (const l of model.languages) {
        const p = layout.pos.get(l.id);
        if (!p) continue;
        center.set(l.id, { x: p.x * scale + panX, y: p.y * scale + panY });
    }

    const connCls = (base, l) => {
        let c = base;
        if (hlSet && hlSet.has(l.id)) c += ' hl';
        if (langGhosted(l)) c += ' ghosted';
        if (langFiltered(l)) c += ' filtered';
        return c;
    };

    // --- connectors: parent right edge -> child left edge ---------------------
    let stages = '', branches = '', creoles = '', borrows = '';
    for (const l of model.languages) {
        const c = center.get(l.id);
        if (!c || l.parentId == null) continue;
        const p = center.get(l.parentId);
        if (p) {
            const color = model.colorOf.get(l.id);
            const cls = l.relation === 'stage' ? 'conn-stage' : 'conn-branch';
            const d = elbowH(p.x + bw / 2, p.y, c.x - bw / 2, c.y);
            const path = `<path class="${connCls(cls, l)}" style="stroke:${color}" d="${d}"/>`;
            if (l.relation === 'stage') stages += path; else branches += path;
        }
        if (l.secondaryParentId != null) {
            const sp = center.get(l.secondaryParentId);
            if (sp) {
                const sColor = model.colorOf.get(l.secondaryParentId);
                creoles += `<path class="${connCls('conn-creole', l)}" style="stroke:${sColor}" d="${elbowH(sp.x + bw / 2, sp.y, c.x - bw / 2, c.y + 12 * bs)}"/>`;
            }
        }
    }

    // --- borrowings: arcs between box edges (same classes/markers as the timeline) ---
    const showBorrowLabels = scale >= 0.3;
    for (const bor of model.borrowings) {
        const s = center.get(bor.fromId), t = center.get(bor.toId);
        if (!s || !t) continue;
        const from = model.byId.get(bor.fromId), to = model.byId.get(bor.toId);
        const dir = t.x >= s.x ? 1 : -1;
        const x0 = s.x + dir * bw / 2, x1 = t.x - dir * bw / 2;
        const cc = Math.max(40, Math.abs(x1 - x0) * 0.35);
        const d = `M ${x0} ${s.y} C ${x0 + cc * dir} ${s.y}, ${x1 - cc * dir} ${t.y}, ${x1} ${t.y}`;
        const lx = (x0 + x1) / 2, ly = (s.y + t.y) / 2;
        const kind = bor.kind ?? 'loan';
        let gCls = 'borrow';
        if (bor.id === selBorrow) gCls += ' selected';
        if (focusId && (bor.fromId === focusId || bor.toId === focusId)) gCls += ' hl';
        if (scrubYear != null && (langGhosted(from ?? {}) || langGhosted(to ?? {}))) gCls += ' ghosted';
        if (filterSet != null && ((from && langFiltered(from)) || (to && langFiltered(to)))) gCls += ' filtered';
        borrows += `<g class="${gCls}" data-borrow-id="${esc(bor.id)}">` +
            `<path class="borrow-hit" d="${d}"/>` +
            `<path class="conn-borrow kind-${kind}" d="${d}" marker-end="url(#arrow)"/>`;
        if (showBorrowLabels && (bor.label || bor.year != null)) {
            const text = [bor.label, bor.year != null ? String(bor.year) : null].filter(Boolean).join(', ');
            const tw = text.length * 5.6 + 14;
            borrows += `<rect class="borrow-label-bg" x="${lx - tw / 2}" y="${ly - 9}" width="${tw}" height="18" rx="9"/>` +
                `<text class="borrow-label" x="${lx}" y="${ly + 3.5}">${esc(text)}</text>`;
        }
        borrows += `</g>`;
    }

    // --- boxes (shared with the timeline renderer) ----------------------------
    const boxCtx = {
        model, bs, bw, hiddenCounts, selLang, multiSet, hlSet,
        langGhosted, langFiltered, bornOf, diedOf, reorder: null, reparent, scrubYear,
    };
    const box = new Map();
    let boxes = '';
    for (const l of model.languages) {
        const c = center.get(l.id);
        if (!c) continue;
        const b = { x: c.x, y: c.y - bh / 2 };
        box.set(l.id, b);
        if (b.y > h + 120 || b.y + bh < -120 || b.x - bw / 2 > w + 120 || b.x + bw / 2 < -120) continue;
        boxes += langBoxSvg(l, b, boxCtx);
    }

    // --- overlays (only the view-agnostic ones apply in tree mode) ------------
    let overlay = '';
    if (reparent && reparent.targetId) {
        const t = center.get(reparent.targetId), c = center.get(reparent.id);
        if (t && c) {
            const tColor = model.colorOf.get(reparent.targetId) ?? 'var(--muted)';
            overlay += `<path class="conn-branch ghost" style="stroke:${tColor}" d="${elbowH(t.x + bw / 2, t.y, c.x - bw / 2, c.y)}"/>`;
        }
    }
    if (marquee) {
        const mx = Math.min(marquee.x0, marquee.x1), my = Math.min(marquee.y0, marquee.y1);
        const mw = Math.abs(marquee.x1 - marquee.x0), mh = Math.abs(marquee.y1 - marquee.y0);
        overlay += `<rect class="marquee" x="${mx}" y="${my}" width="${mw}" height="${mh}"/>`;
    }

    svg.classList.toggle('highlighting', !!hlSet);
    svg.classList.toggle('scrubbing', scrubYear != null);
    svg.classList.toggle('filtering', filterSet != null);

    svg.innerHTML =
        `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" ` +
        `orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" style="fill:var(--muted)"/></marker></defs>` +
        stages + branches + creoles + borrows + boxes + overlay;

    return { pos: box, scale: bs };
}
