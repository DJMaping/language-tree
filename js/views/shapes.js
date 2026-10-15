/**
 * Tree shapes: the same family tree drawn three more ways. A radial tree with
 * time running outwards from the proto-language; a sunburst, rings by
 * generation, wedges by how many languages descend; a treemap, the living
 * languages as tiles sized by native speakers (where the canon gives them) or
 * by count. Colours are the yearly map's (related = similar) when it has been
 * built, else a stable colour per branch.
 */

import { esc, keyColor } from '../views.js';

let colours = null;
async function loadColours() {
    if (colours) return colours;
    try {
        const r = await fetch('data/cache/years/frames.json', { cache: 'no-store' });
        colours = r.ok ? Object.fromEntries(Object.values((await r.json()).langs).map((l) => [l.id, l.color])) : {};
    } catch { colours = {}; }
    return colours;
}

export async function render(el, ctx) {
    const { model, doc, state, presentYear } = ctx;
    const C = await loadColours();
    const fams = (doc.families || []).filter((f) => f.rootId && model.byId.has(f.rootId));
    state.mode ??= 'radial';
    state.fam ??= fams.find((f) => f.name === 'Alzuria-Ayuman')?.rootId ?? fams[0]?.rootId;
    state.size ??= 'count';
    const kids = new Map();
    for (const l of model.languages) if (l.parentId) (kids.get(l.parentId) ?? kids.set(l.parentId, []).get(l.parentId)).push(l);
    for (const v of kids.values()) v.sort((a, b) => (a.born ?? 0) - (b.born ?? 0));
    const colourOf = (id) => C[id] ?? keyColor(id, 55, 55);
    const end = (l) => l.died ?? presentYear;
    const speakers = (l) => l.speakers?.l1 ?? null;

    el.innerHTML = `
      <div class="views-controls">
        ${[['radial', 'Radial tree'], ['sunburst', 'Sunburst'], ['treemap', 'Treemap']].map(([k, t]) => `<button class="views-tab${state.mode === k ? ' on' : ''}" data-mode="${k}">${t}</button>`).join('')}
        <label>Family <select id="sh-fam">${state.mode !== 'radial' ? `<option value="*"${state.fam === '*' ? ' selected' : ''}>all families</option>` : ''}${fams.map((f) => `<option value="${esc(f.rootId)}"${f.rootId === state.fam ? ' selected' : ''}>${esc(f.name)}</option>`).join('')}</select></label>
        ${state.mode === 'treemap' ? `<label>Tile size <select id="sh-size"><option value="count">one per language</option><option value="speakers"${state.size === 'speakers' ? ' selected' : ''}>native speakers (canon figures; others small)</option></select></label>` : ''}
        <span class="hint">Click a language to show it on the tree.</span>
      </div>
      <div id="sh-body"></div>`;
    el.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { state.mode = b.dataset.mode; if (state.mode === 'radial' && state.fam === '*') state.fam = fams[0]?.rootId; render(el, ctx); }));
    el.querySelector('#sh-fam').addEventListener('change', (e) => { state.fam = e.target.value; render(el, ctx); });
    el.querySelector('#sh-size')?.addEventListener('change', (e) => { state.size = e.target.value; render(el, ctx); });
    const body = el.querySelector('#sh-body');
    const roots = state.fam === '*' ? fams.map((f) => model.byId.get(f.rootId)) : [model.byId.get(state.fam)];

    if (state.mode === 'radial') body.innerHTML = radial(roots[0], kids, colourOf, end, presentYear);
    else if (state.mode === 'sunburst') body.innerHTML = sunburst(roots, kids, colourOf, fams);
    else body.innerHTML = treemap(roots, kids, colourOf, state.size === 'speakers' ? speakers : () => null, fams);
}

const lab = (y) => (y >= 0 ? `${y} AFA` : `${-y} BFA`);

function leavesOf(id, kids) {
    const out = [];
    const walk = (n) => { const k = kids.get(n.id); if (!k) out.push(n); else k.forEach(walk); };
    walk(id);
    return out;
}

function radial(root, kids, colourOf, end, present) {
    const leaves = leavesOf(root, kids);
    const t0 = root.born ?? 0, t1 = present;
    const S = 900, cx = S / 2, cy = S / 2, R0 = 30, R1 = S / 2 - 120;
    const r = (y) => R0 + ((y - t0) / (t1 - t0 || 1)) * (R1 - R0);
    const angle = new Map();
    leaves.forEach((l, i) => angle.set(l.id, (i / leaves.length) * Math.PI * 2 - Math.PI / 2));
    const ang = (n) => {
        if (angle.has(n.id)) return angle.get(n.id);
        const a = (kids.get(n.id) || []).map(ang);
        const v = a.reduce((s, x) => s + x, 0) / a.length;
        angle.set(n.id, v);
        return v;
    };
    ang(root);
    const P = (a, rad) => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
    let out = '';
    // the time rings
    const step = Math.pow(10, Math.floor(Math.log10((t1 - t0) / 4 || 1)));
    for (let y = Math.ceil(t0 / step) * step; y <= t1; y += step) {
        out += `<circle cx="${cx}" cy="${cy}" r="${r(y).toFixed(1)}" class="sh-ring"/><text x="${cx + 3}" y="${(cy - r(y) - 2).toFixed(1)}" class="sh-ringt">${lab(y)}</text>`;
    }
    const walk = (n) => {
        const a = angle.get(n.id);
        const [x1, y1] = P(a, r(n.born ?? t0)), [x2, y2] = P(a, r(end(n)));
        const col = colourOf(n.id);
        out += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" style="stroke:${col}" class="sh-life${n.died != null ? ' dead' : ''}" data-focus-lang="${esc(n.id)}"><title>${esc(`${n.name}: ${lab(n.born ?? t0)} – ${n.died != null ? lab(n.died) : 'living'}`)}</title></line>`;
        const ks = kids.get(n.id) || [];
        for (const k of ks) {
            // the split: an arc at the daughter's birth from the parent's angle to hers
            const rr = r(k.born ?? t0), a1 = angle.get(n.id), a2 = angle.get(k.id);
            const [ax, ay] = P(a1, rr), [bx, by] = P(a2, rr);
            out += `<path d="M${ax.toFixed(1)},${ay.toFixed(1)} A${rr.toFixed(1)},${rr.toFixed(1)} 0 0,${a2 > a1 ? 1 : 0} ${bx.toFixed(1)},${by.toFixed(1)}" class="sh-arc" style="stroke:${col}"/>`;
            walk(k);
        }
        if (!ks.length) {
            const [tx, ty] = P(a, r(end(n)) + 6);
            const deg = (a * 180) / Math.PI;
            const flip = Math.cos(a) < 0;
            out += `<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" transform="rotate(${(flip ? deg + 180 : deg).toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)})" text-anchor="${flip ? 'end' : 'start'}" class="sh-leaf${n.died != null ? ' dead' : ''}" data-focus-lang="${esc(n.id)}">${esc(n.name)}</text>`;
        }
    };
    walk(root);
    return `<svg class="sh-svg" viewBox="0 0 ${S} ${S}">${out}</svg>
      <div class="hint">${esc(root.name)} at the centre (${lab(t0)}); time runs outwards to ${lab(t1)}. Each language is a line through its lifetime; a split is an arc at the daughter's birth. Faint: extinct.</div>`;
}

function sunburst(roots, kids, colourOf, fams) {
    const S = 860, cx = S / 2, cy = S / 2;
    const depthOf = (n) => { let d = 0; const walk = (m, k) => { d = Math.max(d, k); (kids.get(m.id) || []).forEach((c) => walk(c, k + 1)); }; walk(n, 0); return d; };
    const D = Math.max(...roots.map(depthOf)) + (roots.length > 1 ? 1 : 0);
    const ring = (S / 2 - 20) / (D + 1);
    const count = (n) => leavesOf(n, kids).length;
    let out = '';
    const arc = (a0, a1, r0, r1) => {
        const large = a1 - a0 > Math.PI ? 1 : 0;
        const p = (a, r) => `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
        return `M${p(a0, r0)}L${p(a0, r1)}A${r1},${r1} 0 ${large} 1 ${p(a1, r1)}L${p(a1, r0)}A${r0},${r0} 0 ${large} 0 ${p(a0, r0)}Z`;
    };
    const draw = (n, a0, a1, d) => {
        const r0 = d * ring + (roots.length > 1 ? 0 : 0), r1 = r0 + ring - 1;
        if (a1 - a0 > 0.002) {
            out += `<path d="${arc(a0, a1, Math.max(0, r0), r1)}" style="fill:${colourOf(n.id)}" class="sh-wedge${n.died != null ? ' dead' : ''}" data-focus-lang="${esc(n.id)}"><title>${esc(`${n.name} (${count(n)} language${count(n) === 1 ? '' : 's'})`)}</title></path>`;
            const mid = (a0 + a1) / 2, rm = (r0 + r1) / 2;
            if ((a1 - a0) * rm > 34 && ring > 14) {
                const deg = (mid * 180) / Math.PI;
                const flip = Math.cos(mid) < 0;
                out += `<text x="${(cx + rm * Math.cos(mid)).toFixed(1)}" y="${(cy + rm * Math.sin(mid)).toFixed(1)}" transform="rotate(${(flip ? deg + 180 : deg).toFixed(1)} ${(cx + rm * Math.cos(mid)).toFixed(1)} ${(cy + rm * Math.sin(mid)).toFixed(1)})" text-anchor="middle" dominant-baseline="middle" class="sh-wlabel">${esc(n.name.length > 18 ? `${n.name.slice(0, 17)}…` : n.name)}</text>`;
            }
        }
        let a = a0;
        const total = count(n);
        for (const k of kids.get(n.id) || []) {
            const span = ((a1 - a0) * count(k)) / total;
            draw(k, a, a + span, d + 1);
            a += span;
        }
    };
    const all = roots.reduce((s, r) => s + count(r), 0);
    let a = -Math.PI / 2;
    for (const r of roots) {
        const span = (Math.PI * 2 * count(r)) / all;
        draw(r, a, a + span, roots.length > 1 ? 1 : 0);
        a += span;
    }
    return `<svg class="sh-svg" viewBox="0 0 ${S} ${S}">${out}</svg>
      <div class="hint">Rings are generations from the proto-language${roots.length > 1 ? 's' : ''} outwards; a wedge's width is how many languages descend from it. ${roots.length > 1 ? `${roots.length} families, ${all} languages.` : ''}</div>`;
}

/** Squarified treemap (Bruls, Huizing & van Wijk 2000). */
function squarify(items, x, y, w, h) {
    const out = [];
    const total = items.reduce((s, i) => s + i.v, 0) || 1;
    const scale = (w * h) / total;
    let rest = items.map((i) => ({ ...i, a: i.v * scale })).sort((p, q) => q.a - p.a);
    while (rest.length) {
        const short = Math.min(w, h);
        let row = [], best = Infinity;
        for (const it of rest) {
            const r2 = [...row, it];
            const s = r2.reduce((t, i) => t + i.a, 0);
            const worst = Math.max(...r2.map((i) => Math.max((short * short * i.a) / (s * s), (s * s) / (short * short * i.a))));
            if (worst > best) break;
            row = r2; best = worst;
        }
        const s = row.reduce((t, i) => t + i.a, 0);
        const thick = s / short;
        let off = 0;
        for (const it of row) {
            const len = it.a / thick;
            if (w >= h) out.push({ ...it, x, y: y + off, w: thick, h: len });
            else out.push({ ...it, x: x + off, y, w: len, h: thick });
            off += len;
        }
        if (w >= h) { x += thick; w -= thick; } else { y += thick; h -= thick; }
        rest = rest.slice(row.length);
    }
    return out;
}

function treemap(roots, kids, colourOf, speakers, fams) {
    const Wd = 1100, Hd = 640;
    const living = (n) => leavesOf(n, kids).filter((l) => l.died == null);
    const usesSpeakers = roots.some((r) => living(r).some((l) => speakers(l) != null));
    const v = (l) => (usesSpeakers ? (speakers(l) ?? 0.5) : 1);
    const famBoxes = squarify(roots.map((r) => ({ r, v: living(r).reduce((s, l) => s + v(l), 0) })).filter((i) => i.v > 0), 0, 0, Wd, Hd);
    let out = '';
    for (const fb of famBoxes) {
        const tiles = squarify(living(fb.r).map((l) => ({ l, v: v(l) })), fb.x + 2, fb.y + 14, Math.max(1, fb.w - 4), Math.max(1, fb.h - 16));
        out += `<rect x="${fb.x}" y="${fb.y}" width="${fb.w}" height="${fb.h}" class="sh-fam"/><text x="${fb.x + 4}" y="${fb.y + 11}" class="sh-famt">${esc(fams.find((f) => f.rootId === fb.r.id)?.name ?? fb.r.name)}</text>`;
        for (const t of tiles) {
            out += `<rect x="${t.x.toFixed(1)}" y="${t.y.toFixed(1)}" width="${Math.max(0, t.w - 1).toFixed(1)}" height="${Math.max(0, t.h - 1).toFixed(1)}" style="fill:${colourOf(t.l.id)}" class="sh-tile" data-focus-lang="${esc(t.l.id)}"><title>${esc(`${t.l.name}${speakers(t.l) != null ? `: ${speakers(t.l)} million native speakers` : ''}`)}</title></rect>`;
            if (t.w > 46 && t.h > 14) out += `<text x="${(t.x + 3).toFixed(1)}" y="${(t.y + 11).toFixed(1)}" class="sh-tilet">${esc(t.l.name.length * 6 > t.w ? `${t.l.name.slice(0, Math.max(3, Math.floor(t.w / 6) - 1))}…` : t.l.name)}</text>`;
        }
    }
    return `<svg class="sh-svg" viewBox="0 0 ${Wd} ${Hd}">${out}</svg>
      <div class="hint">Living languages${usesSpeakers ? ', sized by native speakers where the canon gives a figure (others drawn small)' : ', one tile each'}, grouped by family and coloured by relatedness.</div>`;
}
