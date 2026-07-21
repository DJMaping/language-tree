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

// Below this box scale, names/years/badges are too small to read, so a box
// collapses to a solid family-colored chip (see langBoxSvg's dense branch): the
// color carries the meaning and the whole tree stays legible zoomed all the way
// out. Kept above S_MIN so there's a range of chip sizes as you keep zooming out.
export const DENSE_SCALE = 0.55;

// The box-scale floor on zoom-out: boxes (and column spacing) shrink with the
// zoom down to this and no further. Shared with main.js so its pointer<->world-x
// mapping uses the exact same packing factor as the renderer.
export const S_MIN = 0.13;

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
// bezier fallbacks when the geometry gets too tight for corners. By default the
// horizontal jog sits just ABOVE the child, so the daughter drops down the
// parent's column and forks late. Pass `early` to place the jog just BELOW the
// parent instead: the daughter turns out immediately and drops down its OWN
// column — used when a stage successor sits in the parent's column between the
// two, so the line reads as descending from the parent, not that successor.
function elbow(x1, y1, x2, y2, early = false) {
    const dx = x2 - x1;
    if (Math.abs(dx) < 24) {
        return `M ${x1} ${y1} C ${x1} ${y1 + 30}, ${x2} ${y2 - 30}, ${x2} ${y2}`;
    }
    const r = 8, s = dx > 0 ? 1 : -1;
    if (early && y2 - y1 >= 28) {
        // Fork immediately below the parent, then drop down the child's column.
        const my = y1 + 14;
        return `M ${x1} ${y1} L ${x1} ${my - r} Q ${x1} ${my}, ${x1 + r * s} ${my} ` +
            `L ${x2 - r * s} ${my} Q ${x2} ${my}, ${x2} ${my + r} L ${x2} ${y2}`;
    }
    if (y2 - y1 >= 28) {
        // Split as late as possible: drop straight down the parent's column and
        // elbow across just above the daughter, rather than forking immediately.
        const my = y2 - 14;
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

// One language box `<g>`, given its screen position `b` ({x: center, y: top}) and a
// context bag of the render-time helpers/sets. Shared verbatim by both the timeline
// renderer (`render`) and the tree renderer (`renderTree`) so boxes — colors, circa
// feathering, collapse +N badge, vitality dot, and every selection/highlight class —
// look identical in both views. `bornOf`/`diedOf` are closures so the timeline can
// fold in a live time-drag; the tree passes the plain values.
export function langBoxSvg(l, b, ctx) {
    const {
        model, bs, bw, hiddenCounts, selLang, multiSet, hlSet,
        langGhosted, langFiltered, bornOf, diedOf, reorder, reparent, scrubYear,
    } = ctx;
    const color = model.colorOf.get(l.id);
    const died = diedOf(l);
    // Approximate ("circa") endpoints read "c." per the scholarly convention.
    const bornTxt = `${l.bornCirca ? 'c.' : ''}${bornOf(l)}`;
    // A died-year with a stage successor is a renaming (no †); a diverged
    // language dispersed into its daughters (no †, drawn with a fork instead).
    const noDagger = model.stageChild.has(l.id) || l.diverged;
    const yearsTxt = died != null
        ? `${bornTxt} – ${l.diedCirca ? 'c.' : ''}${died}${noDagger ? '' : ' †'}`
        : `${bornTxt} – now`;
    // Reconstructed (unattested) languages carry the linguistics asterisk.
    const displayName = (l.reconstructed ? '*' : '') + l.name;
    const hidden = hiddenCounts.get(l.id) ?? 0;
    let cls = 'lang';
    if (l.reconstructed) cls += ' reconstructed';
    if (l.id === selLang) cls += ' selected';
    if (multiSet && multiSet.has(l.id)) cls += ' multi';
    if (hlSet && hlSet.has(l.id)) cls += ' hl';
    if (langGhosted(l)) cls += ' ghosted';
    if (langFiltered(l)) cls += ' filtered';
    if (hidden) cls += ' collapsed';
    if (reorder && l.id === reorder.id) cls += ' reordering';
    if (reparent && l.id === reparent.id) cls += ' reparenting';
    if (reparent && reparent.targetId === l.id) cls += ' drop-target';
    // Dense overview: once boxes shrink past DENSE_SCALE the text is illegible,
    // so drop the name/years/badges/vitality dot and draw the language as a solid
    // family-colored chip. The hover title still names it, and every selection/
    // highlight/ghost class rides along so the chip lights up like a full box.
    if (bs < DENSE_SCALE) {
        return `<g class="${cls} dense" data-id="${esc(l.id)}" transform="translate(${b.x - bw / 2} ${b.y}) scale(${bs})">` +
            `<rect class="lang-box" width="${BOX_W}" height="${BOX_H}" rx="6" style="fill:${color};stroke:${color}"/>` +
            `<title>${esc(displayName)} (${esc(yearsTxt)})</title></g>`;
    }
    // An approximate birth feathers the box's top edge (which sits exactly on
    // the birth year) into a soft, fading band — the picture stops claiming a
    // precise year for a date that is only a guess.
    let circaFuzz = '';
    if (l.bornCirca) {
        for (let i = 0; i < 3; i++) {
            circaFuzz += `<rect class="circa-fuzz" x="0" y="${-(i + 1) * 4}" width="${BOX_W}" height="4" ` +
                `style="fill:${color};opacity:${(0.16 - i * 0.05).toFixed(2)}"/>`;
        }
    }
    let out = `<g class="${cls}" data-id="${esc(l.id)}" transform="translate(${b.x - bw / 2} ${b.y}) scale(${bs})">` +
        circaFuzz +
        `<rect class="lang-box" width="${BOX_W}" height="${BOX_H}" rx="6" style="stroke:${color}"/>` +
        `<text class="lang-name" x="10" y="17">${esc(truncName(displayName))}</text>` +
        `<text class="lang-years" x="10" y="32">${esc(yearsTxt)}</text>` +
        `<title>${esc(displayName)} (${esc(yearsTxt)})</title>`;
    if (hidden) {
        const badgeW = 22 + String(hidden).length * 7;
        out += `<g class="collapse-badge" data-collapse="${esc(l.id)}" transform="translate(${BOX_W - 14} ${BOX_H - 8})">` +
            `<rect class="collapse-badge-bg" x="0" y="0" width="${badgeW}" height="16" rx="8" style="fill:${color}"/>` +
            `<text class="collapse-badge-text" x="${badgeW / 2}" y="12">+${hidden}</text>` +
            `<title>${hidden} hidden — click to expand</title></g>`;
    }
    // Vitality badge (top-right): a semantic dot derived from populationSeries.
    // Only present where DJ recorded numbers, so boxes stay uncluttered. While
    // scrubbing/playing it reflects the population AT the play-head year, so
    // the badges animate as the timeline runs.
    const vit = scrubYear != null ? model.vitalityAt(l.id, scrubYear) : model.vitalityOf(l.id);
    if (vit) {
        const dot = vit.level === 'dead'
            ? `fill:none;stroke:${vit.color};stroke-width:1.5`
            : `fill:${vit.color};stroke:var(--bg);stroke-width:1`;
        const speakers = Number(vit.latest.count).toLocaleString('en-US');
        const atTxt = scrubYear != null ? ` in ${esc(String(scrubYear))}` : ` (${esc(String(vit.latest.year))})`;
        out += `<circle class="vit-badge" cx="${BOX_W - 10}" cy="10" r="4.5" style="${dot}">` +
            `<title>Vitality: ${esc(vit.label)} — ${esc(speakers)} speakers${atTxt}</title></circle>`;
    }
    out += `</g>`;
    return out;
}

// Renders the whole scene into `svg`. Returns the map of on-screen box
// positions (id -> {x, y}, x = center, y = top).
export function render(svg, ctx) {
    const {
        model, layout, view, config, selected, multi, marquee, hoverId,
        highlight, filterSet, scrub, pending, handleDrag, linkDrag, drag, reorder, reparent, fitZoom, w, h,
    } = ctx;
    const multiSet = multi && multi.size ? multi : null;
    const ppy = view.pxPerYear, panX = view.panX, panY = view.panY;
    const screenY = year => year * ppy + panY;
    const hiddenCounts = layout.hiddenCounts ?? new Map();

    // Semantic downscale on zoom-out: boxes stay full size at/above the
    // fit-to-content zoom and shrink (down to S_MIN) as you zoom out past it.
    // Smaller boxes need less vertical room, so the anti-overlap push-down below
    // stops kicking in and boxes stay pinned to their true year.
    const bs = Math.max(S_MIN, Math.min(1, fitZoom ? ppy / fitZoom : 1));
    const bw = BOX_W * bs, bh = BOX_H * bs;

    // Horizontal packing mirrors the vertical shrink. Only the year axis maps
    // through zoom (screenY = year*ppy), so on zoom-out the tree collapses to a
    // thin vertical line while its columns keep full world width — languages fly
    // apart sideways. Compressing column spacing by the same `bs` around the axis
    // gutter keeps the overview compact both ways. At full zoom bs===1 → identity.
    const hx = wx => GUTTER_W + (wx - GUTTER_W) * bs;

    // Typed selection: only one of these is set at a time.
    const selLang = selected?.type === 'lang' ? selected.id : null;
    const selBorrow = selected?.type === 'borrowing' ? selected.id : null;
    const selEvent = selected?.type === 'event' ? selected.id : null;

    // Lineage highlight + year-scrub state (both drive CSS classes on elements).
    const hlSet = highlight?.set ?? null;
    const focusId = highlight?.focusId ?? null;
    const scrubYear = Number.isInteger(scrub?.year) ? scrub.year : null;
    const aliveAt = (l, year) => { const d = model.diedOf(l); return l.born <= year && (d == null || year <= d); };
    const langGhosted = l => scrubYear != null && !aliveAt(l, scrubYear);
    // Focus filter (living-only / one family): anything not in the set is dimmed.
    const langFiltered = l => filterSet != null && !filterSet.has(l.id);

    // A live time-drag temporarily shifts the affected languages' years.
    const dragDelta = l => (drag && drag.ids.has(l.id) ? drag.delta : 0);
    const bornOf = l => l.born + dragDelta(l);
    // Effective end year (explicit died, or a diverged language's derived
    // divergence year). Only an explicit died rides along on a time-drag; a
    // derived year follows its daughters, which move on their own.
    const diedOf = l => {
        const d = model.diedOf(l);
        if (d == null) return null;
        return d + (l.died != null && drag?.shiftDied ? dragDelta(l) : 0);
    };

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
            box.set(l.id, { x: hx(layout.pos.get(l.id).x) + panX, y });
        }
    }

    // Extra classes an element inherits from its child language: dimmed unless
    // in the highlighted lineage, ghosted when not alive at the scrub year.
    const connCls = (base, l) => {
        let c = base;
        if (hlSet && hlSet.has(l.id)) c += ' hl';
        if (langGhosted(l)) c += ' ghosted';
        if (langFiltered(l)) c += ' filtered';
        return c;
    };

    let tails = '', branches = '', stages = '', creoles = '', borrows = '';

    // The "Now" line: living languages get a tail down to it, capped with a dot,
    // so you can see at a glance which lineages still exist today.
    const presentYear = config?.presentYear;
    const presentY = Number.isInteger(presentYear) ? screenY(presentYear) : null;

    for (const l of model.languages) {
        const b = box.get(l.id);
        if (!b) continue;
        const color = model.colorOf.get(l.id);
        const died = diedOf(l);

        // Living language (no death year, not renamed into a stage successor):
        // a solid tail down to the "Now" line, ending in a dot. Suppressed while
        // the language is collapsed — its subtree (and their tails) are folded
        // into the +N badge, so a lone tail to "Now" would misrepresent the fold.
        const isCollapsed = (hiddenCounts.get(l.id) ?? 0) > 0;
        if (died == null && !model.stageChild.has(l.id) && presentY != null && !isCollapsed) {
            const y0 = b.y + bh;
            if (presentY > y0 + 6) {
                tails += `<path class="${connCls('living-tail', l)}" style="stroke:${color}" d="M ${b.x} ${y0} L ${b.x} ${presentY}"/>` +
                    `<circle class="${connCls('living-dot', l)}" style="fill:${color};stroke:${color}" cx="${b.x}" cy="${presentY}" r="4"/>`;
            }
        }

        // Extinction: dotted tail down to the death year (unless a stage
        // successor continues the same line — then the chain tells the story, or
        // the language diverged into daughters — handled just below, no †).
        if (died != null && !model.stageChild.has(l.id) && !l.diverged) {
            const y0 = b.y + bh;
            const yd = screenY(died);
            if (yd > y0 + 14) {
                tails += `<path class="${connCls('extinct-tail', l)}" d="M ${b.x} ${y0} L ${b.x} ${yd - 12}"/>` +
                    `<text class="${connCls('extinct-glyph', l)}" x="${b.x}" y="${yd}">†</text>`;
                // Approximate death: feather faint ticks around the †, echoing the
                // fuzzy birth edge, so the extinction year reads as a guess too.
                if (l.diedCirca) {
                    for (const dy of [-6, -3, 3, 6]) {
                        tails += `<rect class="circa-fuzz" x="${b.x - 7}" y="${yd + dy - 1}" width="14" height="2" ` +
                            `style="fill:var(--muted);opacity:${(0.15 - Math.abs(dy) * 0.015).toFixed(2)}"/>`;
                    }
                }
            } else {
                tails += `<text class="${connCls('extinct-glyph', l)}" x="${b.x}" y="${y0 + 12}">†</text>`;
            }
        }

        // Divergence: the language dispersed into its daughter branches (e.g. a
        // proto-language). No end marker at all — its daughter branches already
        // carry the line onward, so an extra fork/tail there just reads as clutter.

        if (l.parentId != null) {
            if (l.relation === 'stage') {
                const pb = box.get(l.parentId);
                if (pb) stages += `<path class="${connCls('conn-stage', l)}" style="stroke:${color}" d="M ${pb.x} ${pb.y + bh} L ${b.x} ${b.y}"/>`;
            } else {
                // A daughter always emerges from her literal parent's box. If the
                // parent has since been renamed into a later stage that shares the
                // column (e.g. East Yaela → Eosl) and that stage sits between the
                // two, route the connector out immediately below the parent so it
                // skirts the stage box rather than running straight down through it
                // and reading as descending from it.
                const pb = box.get(l.parentId);
                let early = false;
                for (let src = model.byId.get(l.parentId); src; ) {
                    const sc = model.stageChild.get(src.id);
                    if (sc && box.get(sc.id) && sc.born <= l.born) { early = true; src = sc; } else break;
                }
                if (pb) branches += `<path class="${connCls('conn-branch', l)}" style="stroke:${color}" d="${elbow(pb.x, pb.y + bh, b.x, b.y, early)}"/>`;
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
        if (filterSet != null && ((from && langFiltered(from)) || (to && langFiltered(to)))) gCls += ' filtered';
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

    const boxCtx = {
        model, bs, bw, hiddenCounts, selLang, multiSet, hlSet,
        langGhosted, langFiltered, bornOf, diedOf, reorder, reparent, scrubYear,
    };
    let boxes = '';
    for (const l of model.languages) {
        const b = box.get(l.id);
        if (!b) continue;
        if (b.y > h + 120 || b.y + bh < -120 || b.x - bw / 2 > w + 60 || b.x + bw / 2 < GUTTER_W - 60) continue;
        boxes += langBoxSvg(l, b, boxCtx);
    }

    // --- interaction overlays -------------------------------------------------

    let overlay = '';
    const gestureActive = !!(drag || handleDrag || linkDrag || pending || reorder || reparent);

    // Live re-parent drag: dashed branch preview from the drop-target box down
    // into the language being moved.
    if (reparent && reparent.targetId) {
        const t = box.get(reparent.targetId), c = box.get(reparent.id);
        if (t && c) {
            const tColor = model.colorOf.get(reparent.targetId) ?? 'var(--muted)';
            overlay += `<path class="conn-branch ghost" style="stroke:${tColor}" d="${elbow(t.x, t.y + bh, c.x, c.y)}"/>`;
        }
    }

    // Sibling-reorder drop caret: a vertical guide where the box will land.
    if (reorder && Number.isFinite(reorder.caretX)) {
        overlay += `<line class="reorder-caret" x1="${reorder.caretX}" y1="0" x2="${reorder.caretX}" y2="${h}"/>`;
    }

    // Rubber-band marquee rectangle (already in screen coords).
    if (marquee) {
        const mx = Math.min(marquee.x0, marquee.x1), my = Math.min(marquee.y0, marquee.y1);
        const mw = Math.abs(marquee.x1 - marquee.x0), mh = Math.abs(marquee.y1 - marquee.y0);
        overlay += `<rect class="marquee" x="${mx}" y="${my}" width="${mw}" height="${mh}"/>`;
    }

    // Branch handle on the hovered and selected boxes (hidden mid-gesture).
    if (!gestureActive) {
        for (const hid of new Set([hoverId, selLang])) {
            if (!hid) continue;
            const b = box.get(hid);
            if (!b) continue;
            overlay += `<circle class="branch-handle" data-handle="${esc(hid)}" cx="${b.x}" cy="${b.y + bh}" r="6">` +
                `<title>Drag into empty space to branch off a daughter</title></circle>`;
            overlay += `<circle class="link-handle" data-link-handle="${esc(hid)}" cx="${b.x + bw / 2}" cy="${b.y + bh / 2}" r="6">` +
                `<title>Drag onto another language to add a borrowing / influence</title></circle>`;
        }
    }

    // Live borrowing-link drag: a dashed arrow from the source's right edge to the
    // cursor, and a highlight ring on the box being aimed at.
    if (linkDrag) {
        const s = box.get(linkDrag.fromId);
        if (s) {
            const sx = s.x + bw / 2, sy = s.y + bh / 2, ex = linkDrag.x, ey = linkDrag.y;
            const sColor = model.colorOf.get(linkDrag.fromId) ?? 'var(--muted)';
            overlay += `<path class="conn-borrow ghost" style="stroke:${sColor}" ` +
                `d="M ${sx} ${sy} C ${sx + 40} ${sy}, ${ex - 40} ${ey}, ${ex} ${ey}" marker-end="url(#arrow)"/>`;
            if (linkDrag.targetId) {
                const t = box.get(linkDrag.targetId);
                if (t) overlay += `<rect class="link-drop-target" x="${t.x - bw / 2}" y="${t.y}" ` +
                    `width="${bw}" height="${bh}" rx="6"/>`;
            }
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
        const gx = hx(pending.worldX) + panX;
        const gy = screenY(pending.born);
        if (pending.relation === 'insert-above') {
            // The new box slots in above an existing language; preview the stage
            // link running down from the ghost into that child.
            const c = box.get(pending.childId);
            if (c) {
                const cColor = model.colorOf.get(pending.childId) ?? 'var(--muted)';
                overlay += `<path class="conn-stage ghost" style="stroke:${cColor}" d="M ${gx} ${gy + bh} L ${c.x} ${c.y}"/>`;
            }
        } else if (pending.relation !== 'root') {
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
    svg.classList.toggle('filtering', filterSet != null);

    svg.innerHTML =
        `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" ` +
        `orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" style="fill:var(--muted)"/></marker></defs>` +
        axis.gridSvg + eventsSvg + axis.presentLineSvg +
        tails + branches + stages + creoles + borrows + boxes + overlay +
        axis.gutterSvg + axis.scrubSvg;

    return { pos: box, scale: bs };
}

// The minimap's fixed pixel size (matches #minimap width/height in style.css and
// the viewBox below, so 1 unit == 1 px).
export const MINIMAP_W = 150, MINIMAP_H = 200, MINIMAP_PAD = 6;

// Draws the whole tree as tiny colored bars into a small standalone SVG, with a
// rectangle marking the part currently on screen. Returns { toWorld } so the
// caller can map a click on the minimap back to a world (x, year) for panning.
export function renderMinimap(svg, ctx) {
    const { model, layout, view, yearLo, yearHi, vw, vh } = ctx;
    const b = layout.bounds;
    const iw = MINIMAP_W - MINIMAP_PAD * 2, ih = MINIMAP_H - MINIMAP_PAD * 2;
    const spanX = Math.max(b.maxX - b.minX, 1);
    const spanY = Math.max(yearHi - yearLo, 1);
    const mx = wx => MINIMAP_PAD + (wx - b.minX) / spanX * iw;
    const my = yr => MINIMAP_PAD + (yr - yearLo) / spanY * ih;

    let bars = '';
    for (const l of model.languages) {
        const p = layout.pos.get(l.id);
        if (!p) continue;
        const x = mx(p.x);
        const y0 = my(l.born);
        const y1 = my(l.died ?? l.born);
        const hh = Math.max(2, y1 - y0);
        bars += `<rect x="${(x - 1.4).toFixed(1)}" y="${y0.toFixed(1)}" width="2.8" height="${hh.toFixed(1)}" rx="1.2" fill="${model.colorOf.get(l.id)}"/>`;
    }

    // Viewport rectangle: screen edges mapped back to world (screenX = worldX +
    // panX, screenY = year * ppy + panY), clamped into the minimap frame.
    const ppy = view.pxPerYear;
    const clampM = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const rx0 = clampM(mx(-view.panX), MINIMAP_PAD, MINIMAP_W - MINIMAP_PAD);
    const rx1 = clampM(mx(vw - view.panX), MINIMAP_PAD, MINIMAP_W - MINIMAP_PAD);
    const ry0 = clampM(my((0 - view.panY) / ppy), MINIMAP_PAD, MINIMAP_H - MINIMAP_PAD);
    const ry1 = clampM(my((vh - view.panY) / ppy), MINIMAP_PAD, MINIMAP_H - MINIMAP_PAD);
    const viewRect = `<rect class="minimap-view" x="${rx0.toFixed(1)}" y="${ry0.toFixed(1)}" ` +
        `width="${Math.max(1, rx1 - rx0).toFixed(1)}" height="${Math.max(1, ry1 - ry0).toFixed(1)}"/>`;

    svg.setAttribute('viewBox', `0 0 ${MINIMAP_W} ${MINIMAP_H}`);
    svg.innerHTML = bars + viewRect;

    return {
        toWorld: (mpx, mpy) => ({
            x: b.minX + (mpx - MINIMAP_PAD) / iw * spanX,
            year: yearLo + (mpy - MINIMAP_PAD) / ih * spanY,
        }),
    };
}
