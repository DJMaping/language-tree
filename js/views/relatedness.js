/**
 * Measured relatedness: what the words say about who is related to whom, set
 * beside the tree DJ drew.
 *
 * Distances between a family's living languages come from their 207 basic
 * words (npm run views): half the share of meanings NOT expressed by cognates,
 * half the sound divergence between the cognates they share. The tree on the
 * right is the plainest one those distances imply (UPGMA). Where it groups
 * languages differently from the drawn tree, either the history or the engine
 * has a story to tell, and the list below names those places.
 */

import { esc } from '../views.js';

export function render(el, ctx) {
    const { views, model, state } = ctx;
    const fams = Object.entries(views.families).filter(([, f]) => f.distances);
    if (!fams.length) { el.innerHTML = '<div class="views-empty">No family has three living languages to compare.</div>'; return; }
    state.fam ??= fams[0][0];
    const fam = views.families[state.fam] || fams[0][1];
    const { ids, combined, lexical, sound } = fam.distances;
    const name = (id) => model.byId.get(id)?.name ?? id;

    // The drawn tree, cut down to these living languages.
    const keep = new Set(ids);
    const below = (id) => {
        const kids = model.languages.filter((l) => l.parentId === id).map((l) => below(l.id)).filter(Boolean);
        if (keep.has(id) && !kids.length) return { id };
        if (!kids.length) return null;
        return kids.length === 1 ? kids[0] : { children: kids };
    };
    const drawn = below(state.fam);
    const order = [];
    const collect = (n) => (n.children ? n.children.forEach(collect) : order.push(n.id));
    collect(fam.computedTree);

    el.innerHTML = `
      <div class="views-controls">
        <label>Family <select id="rel-fam">${fams.map(([k, f]) => `<option value="${k}"${k === state.fam ? ' selected' : ''}>${esc(f.name)} (${f.distances.ids.length})</option>`).join('')}</select></label>
        <span class="hint">Distance = half the meanings not expressed by cognates, half the sound divergence of shared cognates, over the 207 basic words.</span>
      </div>
      <div class="views-cols">
        <div><h3>The chart's tree</h3>${dendrogram(drawn, name, false)}</div>
        <div><h3>The tree the words imply</h3>${dendrogram(fam.computedTree, name, true)}</div>
      </div>
      <h3>Disagreements</h3>${disagreements(ids, combined, drawn, name)}
      <h3>Distances</h3>${heatmap(order, ids, combined, lexical, sound, name)}`;
    el.querySelector('#rel-fam').addEventListener('change', (e) => { state.fam = e.target.value; render(el, ctx); });
}

/** A rectangular dendrogram; leaves top to bottom, depth (or height) left to right. */
function dendrogram(tree, name, useHeights) {
    const leaves = [];
    const walk = (n, depth) => { n.depth = depth; if (n.children) n.children.forEach((c) => walk(c, depth + 1)); else leaves.push(n); };
    walk(tree, 0);
    const rowH = 18, labelW = 150, W = 460;
    const maxDepth = Math.max(...leaves.map((l) => l.depth));
    const maxH = tree.height || 1;
    leaves.forEach((l, i) => { l.y = 10 + i * rowH; });
    const xOf = (n) => (useHeights ? (W - labelW) * (1 - (n.height ?? 0) / maxH) : (W - labelW) * ((n.children ? n.depth : maxDepth) / Math.max(1, maxDepth)));
    let svg = '';
    const place = (n) => {
        if (!n.children) { n.x = xOf(n); return n.y; }
        const ys = n.children.map(place);
        n.y = (Math.min(...ys) + Math.max(...ys)) / 2;
        n.x = xOf(n);
        for (const c of n.children) svg += `<path class="dendro" d="M${n.x.toFixed(1)},${c.y}V${n.y}M${n.x.toFixed(1)},${c.y}H${c.x.toFixed(1)}"/>`;
        svg += `<path class="dendro" d="M${n.x.toFixed(1)},${Math.min(...ys)}V${Math.max(...ys)}"/>`;
        return n.y;
    };
    place(tree);
    for (const l of leaves) svg += `<text class="dendro-label" x="${(l.x + 4).toFixed(1)}" y="${l.y + 4}" data-focus-lang="${esc(l.id)}">${esc(name(l.id))}</text>`;
    return `<svg class="dendro-svg" viewBox="0 0 ${W} ${leaves.length * rowH + 16}">${svg}</svg>`;
}

function disagreements(ids, dist, drawn, name) {
    // Shared ancestry in the drawn tree: how many internal nodes two leaves share.
    const path = new Map();
    const walk = (n, trail) => { if (n.children) n.children.forEach((c) => walk(c, [...trail, n])); else path.set(n.id, trail); };
    walk(drawn, []);
    const shared = (a, b) => { const A = path.get(a) || [], B = path.get(b) || []; let k = 0; while (k < A.length && A[k] === B[k]) k++; return k; };
    const rows = [];
    ids.forEach((a, i) => {
        let best = -1;
        ids.forEach((b, j) => { if (j !== i && (best < 0 || dist[i][j] < dist[i][best])) best = j; });
        const closest = Math.max(...ids.filter((b) => b !== a).map((b) => shared(a, b)));
        const relatives = ids.filter((b) => b !== a && shared(a, b) === closest);
        if (best >= 0 && !relatives.includes(ids[best])) {
            rows.push(`<li><b>${esc(name(a))}</b> is nearest by its words to <b>${esc(name(ids[best]))}</b> (${dist[i][best].toFixed(2)}), but its closest relatives in the chart are ${relatives.slice(0, 3).map((r) => esc(name(r))).join(', ')}${relatives.length > 3 ? '…' : ''}.</li>`);
        }
    });
    return rows.length ? `<ul class="plain">${rows.join('')}</ul>` : '<div class="hint">None: every language is nearest by its words to one of its closest relatives in the chart.</div>';
}

function heatmap(order, ids, dist, lexical, sound, name) {
    const idx = new Map(ids.map((id, i) => [id, i]));
    const cell = 16;
    const n = order.length;
    let svg = '';
    order.forEach((a, r) => order.forEach((b, c) => {
        if (a === b) return;
        const i = idx.get(a), j = idx.get(b);
        const v = dist[i][j];
        svg += `<rect x="${130 + c * cell}" y="${r * cell}" width="${cell - 1}" height="${cell - 1}" style="fill:hsl(210 70% ${Math.round(25 + 70 * v)}%)"><title>${esc(name(a))} / ${esc(name(b))}: ${v.toFixed(2)} (cognates lost ${lexical[i][j].toFixed(2)}, sound ${sound[i][j].toFixed(2)})</title></rect>`;
    }));
    order.forEach((a, r) => { svg += `<text class="dendro-label" x="126" y="${r * cell + 12}" text-anchor="end">${esc(name(a))}</text>`; });
    return `<svg class="heat-svg" viewBox="0 0 ${130 + n * cell} ${n * cell}" style="max-width:${130 + n * cell}px">${svg}</svg><div class="hint">Darker is closer. Hover a square for the numbers.</div>`;
}

