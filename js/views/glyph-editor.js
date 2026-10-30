/**
 * Draw a sign (docs/writing-systems-plan.md, step 6: "an editor for glyphs.
 * You drag strokes, or upload your own drawing and have it traced into
 * strokes. Your shapes then evolve down the script tree like any other").
 *
 * The sign is edited as the strokes the engine keeps (strokes.js: points in
 * the unit box, each stroke a polyline or a curve through its points), with
 * the stage's own pen inked behind them, so what is drawn is what the script
 * will look like. Saving writes it to data/scripts-own.json through
 * server.js, which rebuilds the scripts and fonts; DJ's drawing then wins over
 * the engine and the lock, and, if he carries it down, the engine redraws the
 * sign in every later script from his shape (js/engine/script/own.js).
 */

import { esc } from '../views.js';
import { toPath, sampled, similarity, decodeStrokes, bbox, fit } from '../engine/script/strokes.js';
import { stageKeys, descendantsOf, round2 } from '../engine/script/own.js';
import { traceInk, imageToInk } from '../engine/script/trace.js';
import { peucker } from '../engine/script/evolve.js';

const lab = (y) => (y < 0 ? `${-y} BFA` : `${y} AFA`);
const S = 100;   // the canvas draws the unit box at 100, as toPath does
const clone = (strokes) => strokes.map((t) => ({ ...t, pts: t.pts.map((q) => [q[0], q[1]]) }));
const strokesOf = (stage, sign, part) => {
    if (part === 'capital') return clone(sign.upperStrokes || []);
    if (sign.strokes) return clone(sign.strokes);
    if (sign.d) return decodeStrokes(sign.d).strokes;
    return [];
};
const TOOLS = [['move', 'Move', 'm', 'drag a point, or a stroke to move it whole'], ['draw', 'Draw', 'd', 'click point by point (double-click or Enter ends the stroke, a click on its first point closes it), or press and drag to draw freehand'],
    ['add', 'Add point', 'a', 'click a stroke where the new point goes'], ['erase', 'Erase', 'e', 'click a point to take it out, or a stroke to take it away']];

/**
 * The editor for one sign, vowel mark or numeral of one stage
 * (`state.edKind`: sign, mark or numeral). `onSaved` is called once the
 * server has rebuilt the scripts, to load them again.
 */
export function renderEditor(body, { stage, stages, state, valueOf, onSaved }) {
    const byId = new Map(stages.map((s) => [s.id, s]));
    const numerals = stage.numerals || [];
    const kind = state.edKind === 'mark' && stage.marks?.[state.edMark] ? 'mark' : state.edKind === 'numeral' && numerals.some((n) => n.value === state.edNum) ? 'numeral' : 'sign';
    const sign = kind === 'sign' ? stage.signs.find((s) => s.id === state.sign) || stage.signs[0] : null;
    const item = sign || (kind === 'mark' ? stage.marks[state.edMark] : numerals.find((n) => n.value === state.edNum));
    const target = kind === 'sign' ? `sign:${sign.id}` : kind === 'mark' ? `mark:${state.edMark}` : `num:${item.value}`;
    const what = kind === 'sign' ? `the sign ${valueOf(sign)}` : kind === 'mark' ? `the vowel mark for ${state.edMark}` : `the numeral ${item.value}`;
    const keys = stageKeys(stage.signs);
    const key = sign ? keys.get(sign.id) : null;
    const part = sign && state.edPart === 'capital' && sign.upperStrokes ? 'capital' : 'small';
    const shapeOf = () => (sign ? strokesOf(stage, sign, part) : clone(item.strokes || []));
    if (!state.ed || state.ed.stage !== stage.id || state.ed.target !== target || state.ed.part !== part) {
        state.ed = { stage: stage.id, target, part, strokes: shapeOf(), undo: [], redo: [], tool: state.ed?.tool || 'draw', sel: null, pending: null, snap: state.ed?.snap ?? false, carry: false };
    }
    const ed = state.ed;
    const parent = byId.get(stage.parent);
    // the same thing in the parent script: the sign it came from, the parent's mark for the vowel, the parent's numeral
    const from = !parent ? null : sign ? (sign.from ? parent.signs.find((p) => p.id === sign.from) : null) : kind === 'mark' ? parent.marks?.[state.edMark] : (parent.numerals || []).find((n) => n.value === item.value);
    const fromLabel = !from ? '' : sign ? `the sign it came from (${parent.name}'s ${valueOf(from)})` : kind === 'mark' ? `${parent.name}'s mark for ${state.edMark}` : `${parent.name}'s ${item.value}`;
    const fromStrokes = () => (sign ? strokesOf(parent, from, part === 'capital' && from.upperStrokes ? 'capital' : 'small') : clone(from.strokes || []));
    const down = sign ? descendantsOf(stages, stage.id, sign.id).filter((d) => !byId.get(d.stage)?.signs.find((x) => x.id === d.sign)?.own) : [];
    const downStages = [...new Set(down.map((d) => d.stage))].map((id) => byId.get(id));
    // the stage's body line: where most of its letters stand (the middle half of their tops and feet)
    const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[(s.length / 2) | 0]; };
    const boxes = kind === 'mark' ? [] : stage.signs.map((x) => x.box).filter(Boolean);
    const body0 = boxes.length > 4 ? median(boxes.map((b) => b.y0)) : null, body1 = boxes.length > 4 ? median(boxes.map((b) => b.y1)) : null;
    // a mark sits on a letter: one of the stage's consonants, faint behind it, shows where
    const ghost = kind === 'mark' ? stage.signs.find((x) => x.value?.kind === 'C' && x.path) || stage.signs.find((x) => x.path) : null;
    const opt = (v, label, on) => `<option value="${esc(v)}"${on ? ' selected' : ''}>${esc(label)}</option>`;

    body.innerHTML = `
      <div class="views-controls">
        <label>Draw <select id="ge-sign">
          <optgroup label="Signs">${stage.signs.map((s) => opt(`sign:${s.id}`, `${valueOf(s)}${s.concept ? ` (${s.concept})` : ''}${s.own ? ' ✎' : ''}`, target === `sign:${s.id}`)).join('')}</optgroup>
          ${stage.marks ? `<optgroup label="Vowel marks">${Object.entries(stage.marks).map(([v, m]) => opt(`mark:${v}`, `${v} (a mark ${m.at})${m.own ? ' ✎' : ''}`, target === `mark:${v}`)).join('')}</optgroup>` : ''}
          ${numerals.length ? `<optgroup label="Numerals">${numerals.map((n) => opt(`num:${n.value}`, `${n.value}${n.own ? ' ✎' : ''}`, target === `num:${n.value}`)).join('')}</optgroup>` : ''}
        </select></label>
        ${sign?.upperStrokes ? `<label>Shape <select id="ge-part"><option value="small"${part === 'small' ? ' selected' : ''}>small letter</option><option value="capital"${part === 'capital' ? ' selected' : ''}>capital</option></select></label>` : ''}
        <span class="ge-tools">${TOOLS.map(([id, label, k, tip]) => `<button class="views-tab${ed.tool === id ? ' on' : ''}" data-tool="${id}" title="${esc(tip)} (${k})">${label}</button>`).join('')}</span>
        <label title="points jump to a grid of twentieths"><input type="checkbox" id="ge-snap"${ed.snap ? ' checked' : ''}> snap</label>
        <button class="btn" id="ge-undo" title="Ctrl+Z">Undo</button><button class="btn" id="ge-redo" title="Ctrl+Y">Redo</button>
      </div>
      <div class="ge">
        <div class="ge-left">
          <svg id="ge-canvas" class="ge-canvas" viewBox="-6 -6 112 112" tabindex="0"></svg>
          <div class="hint" id="ge-help"></div>
        </div>
        <div class="ge-right">
          <h4 class="ty-head">As ${esc(stage.name)} writes it <span class="hint">${esc(stage.ductus)}, ${lab(stage.year)}</span></h4>
          <div class="ge-previews" id="ge-previews"></div>
          <div class="hint" id="ge-near"></div>
          <div id="ge-stroke"></div>
          <div class="ge-row" title="the chosen stroke, or the whole shape when none is chosen; the arrow keys move it too (Shift for a bigger step)">
            <span class="hint">Shape:</span>
            <button class="btn" data-tf="flipx" title="mirror left to right">⇋ flip</button>
            <button class="btn" data-tf="flipy" title="mirror top to bottom">⇅ flip</button>
            <button class="btn" data-tf="turn" title="a quarter turn clockwise">↻ turn</button>
            <button class="btn" data-tf="grow" title="a tenth bigger">＋ bigger</button>
            <button class="btn" data-tf="shrink" title="a tenth smaller">− smaller</button>
            <button class="btn" data-tf="fit" title="the whole shape into the frame, as the engine fits its signs">fit to the frame</button>
          </div>
          <h4 class="ty-head">Start from</h4>
          <div class="ge-row">
            <button class="btn" id="ge-reset" title="${esc(what)} as it was when you opened it">as it was</button>
            ${from ? `<button class="btn" id="ge-parent" title="${esc(parent.name)}, ${lab(parent.year)}">${esc(fromLabel)}</button>` : ''}
            <button class="btn" id="ge-clear">nothing</button>
            <label class="hint">another sign <select id="ge-copy"><option value="">…</option>${(sign ? stage.signs : kind === 'mark' ? Object.entries(stage.marks).map(([v, m]) => ({ ...m, id: v, label: `the mark for ${v}` })) : numerals.map((n) => ({ ...n, id: String(n.value), label: String(n.value) }))).filter((x) => x !== item && x.id !== state.edMark && (x.strokes || x.d)).map((x) => `<option value="${esc(x.id)}">${esc(x.label ?? valueOf(x))}</option>`).join('')}</select></label>
            <label class="btn ge-file" title="a scan, a photo or a Paint.NET export of the sign drawn dark on light; the ink is thinned to its centre lines and followed into strokes">trace a drawing… <input type="file" id="ge-trace" accept="image/*" hidden></label>
          </div>
          <div class="hint" id="ge-traced"></div>
          <h4 class="ty-head">Save</h4>
          ${downStages.length ? `<label class="ge-carry"><input type="checkbox" id="ge-carry"${ed.carry ? ' checked' : ''}> Carry it down: the engine redraws this sign from your shape in the ${downStages.length} later script${downStages.length > 1 ? 's' : ''} that come from it (${esc(downStages.slice(0, 6).map((s) => s.name).join(', '))}${downStages.length > 6 ? ' …' : ''}), and locks them again.</label>` : `<div class="hint">${sign ? 'No later script takes this sign from here, so only this one changes.' : `Only this script's ${kind === 'mark' ? 'mark' : 'numeral'} changes.`}</div>`}
          <div class="ge-row">
            <button class="btn primary" id="ge-save">Save and rebuild the scripts</button>
            ${item.own ? `<button class="btn" id="ge-unown" title="drop your drawing of ${esc(what)}${sign ? ' (small letter and capital)' : ''}: the engine's locked shape comes back">Back to the engine's shape</button>` : ''}
          </div>
          <div class="hint" id="ge-status">${item.own ? `This is ${item.own === 'hand' ? 'in the hand you picked' : 'your drawing'}.` : `The engine drew ${esc(what)}. Your drawing will win over it and over the lock.`} Saving writes it into the scripts and rebuilds the fonts${sign ? '; carrying it down runs the whole scripts build, which takes many minutes' : ''}.</div>
        </div>
      </div>`;

    const svg = body.querySelector('#ge-canvas');
    // what it must be told from: the other signs, the other marks, the other numerals
    const others = sign ? stage.signs.filter((x) => x.id !== sign.id).slice(0, 400)
        : kind === 'mark' ? Object.entries(stage.marks).filter(([v]) => v !== state.edMark).map(([v, m]) => ({ ...m, label: `the mark for ${v}` }))
            : numerals.filter((n) => n !== item).map((n) => ({ ...n, label: String(n.value) }));
    const labelOf = (x) => x.label ?? valueOf(x);
    let nearTimer = null;
    const glyphOf = (x) => (x.strokes ? { strokes: x.strokes } : x.d ? decodeStrokes(x.d) : null);
    const nearest = (g) => {
        let best = null;
        for (const x of others) {
            const og = glyphOf(x);
            if (!og) continue;
            const v = similarity(g, og);
            if (!best || v > best.v) best = { v, x };
        }
        return best;
    };
    // how alike the sign already was to its nearest neighbour: the engine's own signs can be close, so only a drawing closer than that is warned of
    const opened = shapeOf();
    const was = opened.length ? nearest({ strokes: opened })?.v ?? 0 : 0;

    const snapshot = () => { ed.undo.push(JSON.stringify(ed.strokes)); if (ed.undo.length > 200) ed.undo.shift(); ed.redo.length = 0; };
    const centre = (t) => { const line = sampled({ strokes: [t] }, 10)[0]; return `M${line.map(([x, y]) => `${(x * S).toFixed(2)},${(y * S).toFixed(2)}`).join('L')}`; };
    const snap = (p) => (ed.snap ? p.map((v) => Math.round(v * 20) / 20) : p);
    const toUnit = (e) => {
        const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
        const q = pt.matrixTransform(svg.getScreenCTM().inverse());
        // a drag can run past the canvas: points stay on it
        return [q.x / S, q.y / S].map((v) => Math.max(-0.06, Math.min(1.06, v)));
    };
    const glyphNow = () => ({ strokes: ed.strokes.filter((t) => t.pts.length >= 2) });

    function draw() {
        const g = glyphNow();
        const guides = [
            `<rect x="0" y="0" width="${S}" height="${S}" class="ge-box"/>`,
            `<rect x="12" y="12" width="76" height="76" class="ge-frame"/>`,
            `<line x1="50" y1="0" x2="50" y2="${S}" class="ge-guide"/><line x1="0" y1="50" x2="${S}" y2="50" class="ge-guide"/>`,
            ...(body0 != null ? [`<line x1="0" y1="${body0 * S}" x2="${S}" y2="${body0 * S}" class="ge-body"/><line x1="0" y1="${body1 * S}" x2="${S}" y2="${body1 * S}" class="ge-body"/>`] : []),
            ...(ed.snap ? [Array.from({ length: 19 }, (_, i) => `<line x1="${(i + 1) * 5}" y1="0" x2="${(i + 1) * 5}" y2="${S}" class="ge-grid"/><line x1="0" y1="${(i + 1) * 5}" x2="${S}" y2="${(i + 1) * 5}" class="ge-grid"/>`).join('')] : []),
        ];
        const ink = (ghost ? `<path class="ge-ghost" d="${ghost.path}"/>` : '') + (g.strokes.length ? `<path class="ge-ink" d="${toPath(g, stage.ductus, S)}"/>` : '');
        const lines = ed.strokes.map((t, i) => (t.pts.length >= 2 ? `<path class="ge-hit" data-s="${i}" d="${centre(t)}"/><path class="ge-line${ed.sel === i ? ' sel' : ''}${t.mark ? ' mark' : ''}" d="${centre(t)}"/>` : '')).join('');
        const handles = ed.tool === 'draw' ? '' : ed.strokes.map((t, i) => t.pts.map(([x, y], j) => `<circle class="ge-h${ed.sel === i ? ' sel' : ''}${j === 0 ? ' first' : ''}" data-h="${i}:${j}" cx="${x * S}" cy="${y * S}" r="${ed.sel === i ? 2.1 : 1.6}"/>`).join('')).join('');
        const pend = ed.pending?.length ? `<polyline class="ge-pend" points="${ed.pending.map(([x, y]) => `${x * S},${y * S}`).join(' ')}"/>${ed.pending.map(([x, y], j) => `<circle class="ge-h${j === 0 ? ' first' : ''}" cx="${x * S}" cy="${y * S}" r="1.8"/>`).join('')}` : '';
        svg.innerHTML = guides.join('') + ink + lines + pend + handles;
        body.querySelector('#ge-help').textContent = `${TOOLS.find((t) => t[0] === ed.tool)[3]}. Keys: m d a e for the tools, Delete takes away the chosen stroke, Ctrl+Z undoes.${body0 != null ? ' The dashed lines are where most of this script\'s letters stand.' : ''}${ghost ? ` The faint letter (${valueOf(ghost)}) shows where the mark sits: ${item.at}.` : ''}`;
        side();
    }

    function side() {
        const g = glyphNow();
        const p = g.strokes.length ? toPath(g, stage.ductus, S) : '';
        // a mark is shown on its letter, as it is written
        const on = ghost ? `<path d="${ghost.path}"/>` : '';
        body.querySelector('#ge-previews').innerHTML = [120, 56, 28].map((n) => `<svg class="sc-glyph" viewBox="0 0 100 100" width="${n}" height="${n}">${on}<path d="${p}"/></svg>`).join('')
            + `<span class="ge-among">${others.slice(0, 7).map((x) => `<svg class="sc-glyph faint" viewBox="0 0 100 100" width="28" height="28"><path d="${x.path}"/></svg>`).join('')}<svg class="sc-glyph" viewBox="0 0 100 100" width="28" height="28"><path d="${p}"/></svg></span>`;
        const s = ed.sel != null ? ed.strokes[ed.sel] : null;
        body.querySelector('#ge-stroke').innerHTML = s ? `<div class="ge-row"><b>Stroke ${ed.sel + 1}</b> (${s.pts.length} points)
            <label><input type="checkbox" data-flag="curve"${s.curve ? ' checked' : ''}> a curve through its points</label>
            <label><input type="checkbox" data-flag="closed"${s.closed ? ' checked' : ''}> closed</label>
            <label title="a dot or tick that tells this sign from a twin: the build keeps it through print"><input type="checkbox" data-flag="mark"${s.mark ? ' checked' : ''}> a telling mark</label>
            <button class="btn" id="ge-delstroke">take it away</button></div>` : '<div class="hint">Choose a stroke (Move) to make it a curve, close it, or take it away.</div>';
        body.querySelectorAll('[data-flag]').forEach((c) => c.addEventListener('change', () => { snapshot(); ed.strokes[ed.sel][c.dataset.flag] = c.checked; if (!c.checked && c.dataset.flag === 'mark') delete ed.strokes[ed.sel].mark; draw(); }));
        body.querySelector('#ge-delstroke')?.addEventListener('click', () => { snapshot(); ed.strokes.splice(ed.sel, 1); ed.sel = null; draw(); });
        clearTimeout(nearTimer);
        nearTimer = setTimeout(() => {
            const out = body.querySelector('#ge-near');
            if (!out || !g.strokes.length) { if (out) out.textContent = ''; return; }
            const best = nearest(g);
            if (!best) { out.textContent = ''; return; }
            const twin = best.v >= 0.97 || (best.v >= 0.9 && best.v > was + 0.02);
            out.innerHTML = `Nearest other ${kind}: <svg class="sc-glyph" viewBox="0 0 100 100" width="22" height="22" style="vertical-align:middle"><path d="${best.x.path}"/></svg> <b>${esc(labelOf(best.x))}</b> (${Math.round(best.v * 100)}% alike${Math.abs(best.v - was) > 0.005 ? `; ${Math.round(was * 100)}% as it was` : ''})${twin ? '. <span class="ge-warn">Too alike to read apart: the engine gives its own twins a mark, but leaves yours as you draw them.</span>' : ''}`;
        }, 250);
    }

    // --- the pointer ---
    let drag = null;
    const nearestSeg = (t, p) => {
        let best = { d: Infinity, at: 1 };
        const n = t.closed ? t.pts.length : t.pts.length - 1;
        for (let k = 0; k < n; k++) {
            const a = t.pts[k], b = t.pts[(k + 1) % t.pts.length];
            const L2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 || 1e-9;
            const u = Math.max(0, Math.min(1, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / L2));
            const d = Math.hypot(p[0] - (a[0] + u * (b[0] - a[0])), p[1] - (a[1] + u * (b[1] - a[1])));
            if (d < best.d) best = { d, at: k + 1 };
        }
        return best.at;
    };
    function finishPending(close = false) {
        const pts = (ed.pending || []).filter((q, i, a) => !i || Math.hypot(q[0] - a[i - 1][0], q[1] - a[i - 1][1]) > 0.008);
        ed.pending = null;
        if (pts.length >= 2) { snapshot(); ed.strokes.push({ pts, curve: false, closed: close && pts.length >= 3 }); ed.sel = ed.strokes.length - 1; }
        draw();
    }
    svg.addEventListener('pointerdown', (e) => {
        svg.focus();
        const p = toUnit(e);
        const h = e.target.closest('[data-h]'), s = e.target.closest('[data-s]');
        if (ed.tool === 'move') {
            if (h) { const [i, j] = h.dataset.h.split(':').map(Number); snapshot(); drag = { kind: 'point', i, j }; ed.sel = i; }
            else if (s) { snapshot(); drag = { kind: 'stroke', i: +s.dataset.s, last: p }; ed.sel = +s.dataset.s; }
            else ed.sel = null;
        } else if (ed.tool === 'draw') {
            drag = { kind: 'pen', start: p, pts: [p], free: false };
        } else if (ed.tool === 'add' && s) {
            const i = +s.dataset.s; snapshot();
            ed.strokes[i].pts.splice(nearestSeg(ed.strokes[i], p), 0, snap(p)); ed.sel = i;
        } else if (ed.tool === 'erase') {
            if (h) { const [i, j] = h.dataset.h.split(':').map(Number); snapshot(); ed.strokes[i].pts.splice(j, 1); if (ed.strokes[i].pts.length < 2) { ed.strokes.splice(i, 1); ed.sel = null; } }
            else if (s) { snapshot(); ed.strokes.splice(+s.dataset.s, 1); ed.sel = null; }
        }
        if (drag) try { svg.setPointerCapture(e.pointerId); } catch { /* a pointer the browser no longer tracks */ }
        draw();
    });
    svg.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const p = toUnit(e);
        if (drag.kind === 'point') { ed.strokes[drag.i].pts[drag.j] = snap(p); draw(); }
        else if (drag.kind === 'stroke') {
            const q = snap(p), dx = q[0] - drag.last[0], dy = q[1] - drag.last[1];
            if (dx || dy) { ed.strokes[drag.i].pts = ed.strokes[drag.i].pts.map(([x, y]) => [x + dx, y + dy]); drag.last = q; draw(); }
        } else if (drag.kind === 'pen') {
            if (!drag.free && Math.hypot(p[0] - drag.start[0], p[1] - drag.start[1]) > 0.015) drag.free = true;
            if (drag.free) {
                const last = drag.pts[drag.pts.length - 1];
                if (Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.004) drag.pts.push(p);
                svg.querySelector('.ge-free')?.remove();
                svg.insertAdjacentHTML('beforeend', `<polyline class="ge-pend ge-free" points="${drag.pts.map(([x, y]) => `${x * S},${y * S}`).join(' ')}"/>`);
            }
        }
    });
    svg.addEventListener('pointerup', () => {
        const d = drag; drag = null;
        if (!d || d.kind !== 'pen') { if (d) draw(); return; }
        if (d.free) {
            // a freehand line: its corners kept, and a smooth bend kept as a curve through a few points
            const corners = peucker(d.pts, 0.008);
            const curve = corners.length > 4;
            const pts = (curve ? peucker(d.pts, 0.02) : corners).map(snap);
            const closed = pts.length > 3 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 0.04;
            snapshot();
            ed.strokes.push({ pts: closed ? pts.slice(0, -1) : pts, curve: curve && pts.length >= 3, closed });
            ed.sel = ed.strokes.length - 1;
            draw();
            return;
        }
        const p = snap(d.start);
        if (ed.pending?.length >= 2 && Math.hypot(p[0] - ed.pending[0][0], p[1] - ed.pending[0][1]) < 0.03) return finishPending(true);
        (ed.pending ||= []).push(p);
        draw();
    });
    svg.addEventListener('dblclick', () => { if (ed.tool === 'draw' && ed.pending) finishPending(false); });
    svg.addEventListener('keydown', (e) => {
        const k = e.key.toLowerCase();
        if ((e.ctrlKey || e.metaKey) && k === 'z' && !e.shiftKey) { e.preventDefault(); return undo(); }
        if ((e.ctrlKey || e.metaKey) && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); return redo(); }
        if (k === 'enter' && ed.pending) { e.preventDefault(); return finishPending(false); }
        if (k === 'escape') { e.preventDefault(); e.stopPropagation(); ed.pending = null; ed.sel = null; return draw(); }
        if ((k === 'delete' || k === 'backspace') && ed.sel != null) { e.preventDefault(); snapshot(); ed.strokes.splice(ed.sel, 1); ed.sel = null; return draw(); }
        const step = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }[k];
        if (step) { e.preventDefault(); e.stopPropagation(); const d = e.shiftKey ? 0.05 : 0.01; return transform(([x, y]) => [x + step[0] * d, y + step[1] * d]); }
        const tool = TOOLS.find((t) => t[2] === k);
        if (tool && !e.ctrlKey && !e.metaKey) { e.preventDefault(); e.stopPropagation(); setTool(tool[0]); }
    });
    function undo() { if (!ed.undo.length) return; ed.redo.push(JSON.stringify(ed.strokes)); ed.strokes = JSON.parse(ed.undo.pop()); ed.sel = null; draw(); }
    function redo() { if (!ed.redo.length) return; ed.undo.push(JSON.stringify(ed.strokes)); ed.strokes = JSON.parse(ed.redo.pop()); ed.sel = null; draw(); }
    function setTool(id) {
        if (ed.pending) finishPending(false);
        ed.tool = id;
        body.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === id));
        draw();
    }

    // --- the controls ---
    body.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
    body.querySelector('#ge-undo').addEventListener('click', undo);
    body.querySelector('#ge-redo').addEventListener('click', redo);
    body.querySelector('#ge-snap').addEventListener('change', (e) => { ed.snap = e.target.checked; draw(); });
    body.querySelector('#ge-sign').addEventListener('change', (e) => {
        const [k, ...rest] = e.target.value.split(':'), v = rest.join(':');
        if (k === 'mark') { state.edKind = 'mark'; state.edMark = v; } else if (k === 'num') { state.edKind = 'numeral'; state.edNum = +v; } else { state.edKind = 'sign'; state.sign = v; }
        state.edPart = 'small';
        renderEditor(body, { stage, stages, state, valueOf, onSaved });
    });
    body.querySelector('#ge-part')?.addEventListener('change', (e) => { state.edPart = e.target.value; renderEditor(body, { stage, stages, state, valueOf, onSaved }); });
    body.querySelector('#ge-reset').addEventListener('click', () => { snapshot(); ed.strokes = shapeOf(); ed.sel = null; draw(); });
    body.querySelector('#ge-parent')?.addEventListener('click', () => { snapshot(); ed.strokes = fromStrokes(); ed.sel = null; draw(); });
    body.querySelector('#ge-clear').addEventListener('click', () => { snapshot(); ed.strokes = []; ed.sel = null; setTool('draw'); });
    body.querySelector('#ge-copy').addEventListener('change', (e) => {
        const id = e.target.value; if (!id) return;
        const src = sign ? stage.signs.find((x) => x.id === id) : kind === 'mark' ? stage.marks[id] : numerals.find((n) => String(n.value) === id);
        if (src) { snapshot(); ed.strokes = sign ? strokesOf(stage, src, 'small') : clone(src.strokes || []); ed.sel = null; draw(); }
        e.target.value = '';
    });
    // the shape tools: on the chosen stroke, else on everything, about its own middle
    const TF = {
        flipx: (b) => ([x, y]) => [b.x0 + b.x1 - x, y],
        flipy: (b) => ([x, y]) => [x, b.y0 + b.y1 - y],
        turn: (b) => { const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2; return ([x, y]) => [cx - (y - cy), cy + (x - cx)]; },
        grow: (b) => { const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2; return ([x, y]) => [cx + (x - cx) * 1.1, cy + (y - cy) * 1.1]; },
        shrink: (b) => { const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2; return ([x, y]) => [cx + (x - cx) / 1.1, cy + (y - cy) / 1.1]; },
    };
    function transform(f) {
        const pick = ed.sel != null ? [ed.sel] : ed.strokes.map((_, i) => i);
        if (!pick.length) return;
        snapshot();
        const on = (v) => Math.round(Math.max(-0.06, Math.min(1.06, v)) * 1e4) / 1e4;   // kept on the canvas, and free of float dust (two flips give back the shape)
        for (const i of pick) ed.strokes[i] = { ...ed.strokes[i], pts: ed.strokes[i].pts.map((q) => f(q).map(on)) };
        draw();
    }
    body.querySelectorAll('[data-tf]').forEach((b) => b.addEventListener('click', () => {
        const kindTf = b.dataset.tf;
        if (kindTf === 'fit') { if (!ed.strokes.length) return; snapshot(); ed.strokes = fit({ strokes: ed.strokes }).strokes.map((t) => ({ ...t })); return draw(); }
        const box = bbox({ strokes: ed.sel != null ? [ed.strokes[ed.sel]] : ed.strokes });
        transform(TF[kindTf](box));
    }));
    body.querySelector('#ge-carry')?.addEventListener('change', (e) => { ed.carry = e.target.checked; });
    body.querySelector('#ge-trace').addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        const out = body.querySelector('#ge-traced');
        if (!file) return;
        out.textContent = 'Tracing…';
        try {
            const url = URL.createObjectURL(file);
            const img = new Image();
            await new Promise((ok, bad) => { img.onload = ok; img.onerror = () => bad(new Error('that file is not an image the browser can read')); img.src = url; });
            const { ink, w, h } = imageToInk(img, 160);
            URL.revokeObjectURL(url);
            if (!w) { out.textContent = 'No ink found in that image: draw dark on light.'; return; }
            const g = traceInk(ink, w, h);
            if (!g.strokes.length) { out.textContent = 'Nothing to trace in that image.'; return; }
            snapshot();
            ed.strokes = round2(g.strokes);
            ed.sel = null;
            out.textContent = `Traced ${file.name}: ${g.strokes.length} stroke${g.strokes.length > 1 ? 's' : ''} (${g.strokes.filter((t) => t.curve).length} curved, ${g.strokes.filter((t) => t.mark).length} dots). Tidy them with Move and Erase.`;
            setTool('move');
        } catch (err) { out.textContent = `Could not trace it: ${err.message}`; }
        e.target.value = '';
    });

    async function send(payload, what, slow = false) {
        const status = body.querySelector('#ge-status');
        body.querySelectorAll('#ge-save, #ge-unown').forEach((b) => { b.disabled = true; });
        const t0 = Date.now();
        const tick = setInterval(() => { status.textContent = `${what}: ${slow ? 'the engine is redrawing the scripts, then the fonts (many minutes)' : 'writing the scripts and rebuilding the fonts'}… ${Math.round((Date.now() - t0) / 1000)} s`; }, 500);
        try {
            const r = await fetch('/api/scripts/own', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }).then((x) => x.json());
            clearInterval(tick);
            if (!r.ok) { status.innerHTML = `<span class="ge-warn">The rebuild failed.</span><pre class="ge-log">${esc(r.log || r.error)}</pre>`; body.querySelectorAll('#ge-save, #ge-unown').forEach((b) => { b.disabled = false; }); return; }
            state.ed = null;
            onSaved(r.log);
        } catch (err) {
            clearInterval(tick);
            status.innerHTML = `<span class="ge-warn">Could not reach the app's server (${esc(err.message)}). Is it running from start.bat or npm start?</span>`;
            body.querySelectorAll('#ge-save, #ge-unown').forEach((b) => { b.disabled = false; });
        }
    }
    body.querySelector('#ge-save').addEventListener('click', () => {
        if (ed.pending) finishPending(false);
        const g = glyphNow();
        if (!g.strokes.length) { body.querySelector('#ge-status').innerHTML = '<span class="ge-warn">Draw at least one stroke first.</span>'; return; }
        const s = round2(g.strokes);
        if (kind === 'mark') return send({ marks: [{ stage: stage.id, vowel: state.edMark, s }] }, `The mark for ${state.edMark} saved`);
        if (kind === 'numeral') return send({ numerals: [{ stage: stage.id, value: item.value, s }] }, `The numeral ${item.value} saved`);
        const entry = { stage: stage.id, key, [part === 'capital' ? 'u' : 's']: s, via: 'drawn' };
        send({ signs: [entry], release: ed.carry ? down.map((d) => ({ stage: d.stage, key: d.key })) : [] }, `${valueOf(sign)} saved`, ed.carry);
    });
    body.querySelector('#ge-unown')?.addEventListener('click', () => {
        if (kind === 'mark') return send({ marks: [{ stage: stage.id, vowel: state.edMark, s: null }] }, 'Your drawing dropped');
        if (kind === 'numeral') return send({ numerals: [{ stage: stage.id, value: item.value, s: null }] }, 'Your drawing dropped');
        send({ signs: [{ stage: stage.id, key, s: null, u: null }] }, 'Your drawing dropped');
    });
    draw();
}
