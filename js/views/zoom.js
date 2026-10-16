/**
 * Zoom and pan for the maps and diagrams in the Views window (DJ, 15 Oct
 * 2026: "allow me to zoom into those maps").
 *
 * The scroll wheel over a map zooms it at the pointer (DJ, 16 Oct 2026: "scroll
 * wheel over something that zooms in and out"); at the whole map, scrolling
 * out scrolls the window as usual, so the page below a map can still be
 * reached. Pinch on a trackpad zooms too. Drag moves a zoomed map,
 * double-click zooms in, and the buttons in the corner zoom in, out and back.
 * The zoom is kept in the view's state, so it survives the view redrawing
 * (a new year, a new feature).
 *
 * Never blurred (DJ: "If it's ... quite blocky, then so be it. Just do not
 * blur it"): the zoom is a plain CSS transform the browser paints afresh at
 * each scale, never a cached layer stretched (will-change: transform would
 * stretch a screen-sized snapshot and blur it), and pictures keep
 * image-rendering: pixelated.
 */

const MAX = 16;

/**
 * Wrap `targets` (an element, or sibling elements to move together, such as
 * a canvas and the labels drawn over it) in a zoomable box.
 * `onChange(k)` runs after every change, e.g. to resize labels.
 */
export function makeZoomable(targets, state, key, onChange = null) {
    const list = Array.isArray(targets) ? targets.filter(Boolean) : [targets].filter(Boolean);
    // nothing to wrap, or no page (scripts/render-view.js draws views in Node)
    if (!list.length || !list[0].parentNode || typeof document === 'undefined') return null;
    const box = document.createElement('div');
    box.className = 'zoom-box';
    const inner = document.createElement('div');
    inner.className = 'zoom-inner';
    list[0].parentNode.insertBefore(box, list[0]);
    inner.append(...list);
    box.append(inner);
    const z = ((state.zoom ??= {})[key] ??= { k: 1, x: 0, y: 0 });

    const clamp = () => {
        const w = box.clientWidth, h = box.clientHeight;
        z.k = Math.min(MAX, Math.max(1, z.k));
        z.x = Math.min(0, Math.max(w - w * z.k, z.x));
        z.y = Math.min(0, Math.max(h - h * z.k, z.y));
    };
    const apply = () => {
        clamp();
        inner.style.transform = z.k > 1.001 ? `translate(${z.x}px, ${z.y}px) scale(${z.k})` : '';
        box.classList.toggle('zoomed', z.k > 1.001);
        label.textContent = z.k > 1.001 ? `${z.k.toFixed(1)}×` : '';
        onChange?.(z.k);
    };
    const zoomAt = (px, py, factor) => {
        const k2 = Math.min(MAX, Math.max(1, z.k * factor));
        z.x = px - (px - z.x) * (k2 / z.k);
        z.y = py - (py - z.y) * (k2 / z.k);
        z.k = k2;
        apply();
    };
    const local = (e) => { const r = box.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

    box.addEventListener('wheel', (e) => {
        const dy = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1);   // lines, pages -> pixels
        if (!dy) return;
        const factor = Math.exp(-dy * 0.004);
        // at the whole map (or the closest zoom) the wheel scrolls the window instead
        if ((factor < 1 && z.k <= 1.001) || (factor > 1 && z.k >= MAX - 0.001)) return;
        e.preventDefault();
        zoomAt(...local(e), factor);
    }, { passive: false });
    box.addEventListener('dblclick', (e) => { e.preventDefault(); zoomAt(...local(e), 2); });

    // drag to move; a drag is not a click
    let drag = null, moved = false;
    box.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || z.k <= 1.001 || e.target.closest('.zoom-bar')) return;
        drag = { x: e.clientX, y: e.clientY, zx: z.x, zy: z.y, id: e.pointerId };
        moved = false;
    });
    box.addEventListener('pointermove', (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (!moved && Math.hypot(dx, dy) < 4) return;
        if (!moved) { moved = true; box.setPointerCapture(e.pointerId); box.classList.add('dragging'); }
        z.x = drag.zx + dx;
        z.y = drag.zy + dy;
        apply();
    });
    const end = () => { drag = null; box.classList.remove('dragging'); };
    box.addEventListener('pointerup', end);
    box.addEventListener('pointercancel', end);
    box.addEventListener('click', (e) => {
        if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; }
    }, true);

    const bar = document.createElement('div');
    bar.className = 'zoom-bar';
    bar.innerHTML = `<button type="button" data-z="in" title="Zoom in (or scroll the wheel over the map)">+</button>
      <button type="button" data-z="out" title="Zoom out">−</button>
      <button type="button" data-z="reset" title="Whole map">⤢</button><span class="zoom-k"></span>`;
    const label = bar.querySelector('.zoom-k');
    bar.addEventListener('click', (e) => {
        const b = e.target.closest('[data-z]');
        if (!b) return;
        e.stopPropagation();
        const w = box.clientWidth / 2, h = box.clientHeight / 2;
        if (b.dataset.z === 'in') zoomAt(w, h, 1.6);
        else if (b.dataset.z === 'out') zoomAt(w, h, 1 / 1.6);
        else { z.k = 1; z.x = 0; z.y = 0; apply(); }
    });
    bar.addEventListener('dblclick', (e) => e.stopPropagation());
    box.append(bar);
    // the box is in the page by now, so its size is known: apply at once
    // (a redrawn view keeps its zoom), and again once laid out for certain
    apply();
    setTimeout(apply, 0);
    return {
        box,
        get k() { return z.k; },
        /** Centre a point (fractions of the whole map) at a zoom. */
        focus(fx, fy, k) {
            z.k = Math.min(MAX, Math.max(1, k));
            z.x = box.clientWidth / 2 - fx * box.clientWidth * z.k;
            z.y = box.clientHeight / 2 - fy * box.clientHeight * z.k;
            apply();
        },
    };
}
