/**
 * Distance plots, from the measured distances in data/views.json (the same as
 * Measured relatedness): languages as dots placed by how alike they are
 * (classical multidimensional scaling), and a NeighborNet-style splits network
 * (Bryant & Moulton 2004), where clean tree-like history draws as branches and
 * conflicting signal (contact, dialect continua) draws as boxes.
 *
 * The network here is a faithful small version: a circular ordering found by
 * a travelling-salesman heuristic on the distances (NeighborNet's own
 * ordering is agglomerative; for a few dozen languages the two agree closely),
 * every split compatible with that circle weighted by non-negative least
 * squares, and the result drawn with the outline algorithm (Bryant & Huson
 * 2023).
 */

import { esc, keyColor } from '../views.js';
import { makeZoomable } from './zoom.js';

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
    const { views, model, state } = ctx;
    const C = await loadColours();
    const fams = Object.entries(views.families).filter(([, f]) => f.distances?.ids?.length >= 4);
    state.fam ??= fams.find(([, f]) => f.name === 'Alzuria-Ayuman')?.[0] ?? fams[0]?.[0];
    state.metric ??= 'combined';
    state.plot ??= 'network';
    const F = views.families[state.fam];
    el.innerHTML = `
      <div class="views-controls">
        ${[['network', 'Splits network'], ['mds', 'Similarity map (MDS)']].map(([k, t]) => `<button class="views-tab${state.plot === k ? ' on' : ''}" data-plot="${k}">${t}</button>`).join('')}
        <label>Family <select id="ds-fam">${fams.map(([k, f]) => `<option value="${esc(k)}"${k === state.fam ? ' selected' : ''}>${esc(f.name)} (${f.distances.ids.length})</option>`).join('')}</select></label>
        <label>Distance <select id="ds-metric">${[['combined', 'words and sounds'], ['lexical', 'shared words (cognates)'], ['sound', 'sound systems']].map(([k, t]) => `<option value="${k}"${k === state.metric ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      </div>
      <div id="ds-body"></div>`;
    el.querySelectorAll('[data-plot]').forEach((b) => b.addEventListener('click', () => { state.plot = b.dataset.plot; render(el, ctx); }));
    el.querySelector('#ds-fam').addEventListener('change', (e) => { state.fam = e.target.value; render(el, ctx); });
    el.querySelector('#ds-metric').addEventListener('change', (e) => { state.metric = e.target.value; render(el, ctx); });
    const ids = F.distances.ids;
    const D = F.distances[state.metric];
    const name = (id) => model.byId.get(id)?.name ?? id;
    const colour = (id) => C[id] ?? keyColor(id, 55, 50);
    const body = el.querySelector('#ds-body');
    body.innerHTML = state.plot === 'mds' ? mds(ids, D, name, colour) : network(ids, D, name, colour);
    makeZoomable(body.querySelector('.ds-svg'), state, `ds-${state.plot}-${state.fam}`);
}

// --- classical MDS -------------------------------------------------------------------

function mds(ids, D, name, colour) {
    const n = ids.length;
    const B = Array.from({ length: n }, () => new Float64Array(n));
    const sq = (i, j) => D[i][j] * D[i][j];
    const rowMean = ids.map((_, i) => ids.reduce((s, _, j) => s + sq(i, j), 0) / n);
    const all = rowMean.reduce((s, v) => s + v, 0) / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) B[i][j] = -0.5 * (sq(i, j) - rowMean[i] - rowMean[j] + all);
    const eig = (deflate) => {
        let v = Float64Array.from({ length: n }, (_, i) => Math.sin(i + 1 + deflate.length));
        let lambda = 0;
        for (let it = 0; it < 300; it++) {
            const w = new Float64Array(n);
            for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) w[i] += B[i][j] * v[j];
            for (const [u, l] of deflate) { const d = u.reduce((s, x, i) => s + x * v[i], 0); for (let i = 0; i < n; i++) w[i] -= l * d * u[i]; }
            const norm = Math.hypot(...w) || 1;
            lambda = norm;
            v = w.map((x) => x / norm);
        }
        return [v, lambda];
    };
    const [u1, l1] = eig([]);
    const [u2, l2] = eig([[u1, l1]]);
    const pts = ids.map((_, i) => [u1[i] * Math.sqrt(l1), u2[i] * Math.sqrt(l2)]);
    const W = 900, H = 620, pad = 60;
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const X = (x) => pad + ((x - x0) / (x1 - x0 || 1)) * (W - 2 * pad), Y = (y) => pad + ((y - y0) / (y1 - y0 || 1)) * (H - 2 * pad);
    const near = [];
    for (let i = 0; i < ids.length; i++) {
        const j = ids.map((_, k) => k).filter((k) => k !== i).sort((a, b) => D[i][a] - D[i][b])[0];
        near.push(`<line x1="${X(pts[i][0]).toFixed(1)}" y1="${Y(pts[i][1]).toFixed(1)}" x2="${X(pts[j][0]).toFixed(1)}" y2="${Y(pts[j][1]).toFixed(1)}" class="ds-near"/>`);
    }
    return `<svg class="ds-svg" viewBox="0 0 ${W} ${H}">${near.join('')}
      ${ids.map((id, i) => `<g data-focus-lang="${esc(id)}"><circle cx="${X(pts[i][0]).toFixed(1)}" cy="${Y(pts[i][1]).toFixed(1)}" r="6" style="fill:${colour(id)}"/><text x="${(X(pts[i][0]) + 8).toFixed(1)}" y="${(Y(pts[i][1]) + 4).toFixed(1)}" class="ds-label">${esc(name(id))}</text><title>${esc(name(id))}</title></g>`).join('')}</svg>
      <div class="hint">Languages close together are alike; each line joins a language to its nearest neighbour. The two axes are the two strongest directions of difference (${Math.round((100 * (l1 + l2)) / (ids.length ? B.reduce((s, r, i) => s + Math.max(0, r[i]), 0) : 1))}% of all the variation shown).</div>`;
}

// --- the splits network ---------------------------------------------------------------

function circularOrder(D, n) {
    // nearest neighbour from every start, then 2-opt; keep the shortest circle
    const len = (o) => o.reduce((s, a, i) => s + D[a][o[(i + 1) % n]], 0);
    let best = null;
    for (let s = 0; s < n; s++) {
        const o = [s];
        const used = new Set(o);
        while (o.length < n) {
            const last = o.at(-1);
            let k = -1;
            for (let j = 0; j < n; j++) if (!used.has(j) && (k < 0 || D[last][j] < D[last][k])) k = j;
            o.push(k); used.add(k);
        }
        let improved = true;
        while (improved) {
            improved = false;
            for (let i = 0; i < n - 1; i++) for (let j = i + 2; j < n; j++) {
                const a = o[i], b = o[i + 1], c = o[j], d = o[(j + 1) % n];
                if (a === d) continue;
                if (D[a][c] + D[b][d] < D[a][b] + D[c][d] - 1e-12) { o.splice(i + 1, j - i, ...o.slice(i + 1, j + 1).reverse()); improved = true; }
            }
        }
        if (!best || len(o) < len(best)) best = o;
    }
    return best;
}

function network(ids, D, name, colour) {
    const n = ids.length;
    const order = circularOrder(D, n);
    // Circular splits: the taxa at circle positions i..j (1 <= i <= j <= n-1;
    // position 0 is the reference). With weights W[i][j], two taxa p < q are
    // separated by the intervals holding exactly one of them, so the fitted
    // distance is T[p][p] + T[q][q] - 2 T[p][q], T[p][q] = sum over i <= p,
    // j >= q of W[i][j]: every fit and gradient costs n^2, not n^4.
    const d = Array.from({ length: n }, (_, p) => Array.from({ length: n }, (_, q) => D[order[p]][order[q]]));
    const forward = (Wt) => {
        // SJ[i][q]: row i's weights over j >= max(i, q), by suffix sums
        const T = Array.from({ length: n }, () => new Float64Array(n));
        for (let p = 1; p < n; p++) {
            let acc = 0;
            const sj = new Float64Array(n);
            for (let j = n - 1; j >= 0; j--) { if (j >= p) acc += Wt[p * n + j]; sj[j] = acc; }
            for (let q = 0; q < n; q++) T[p][q] = T[p - 1][q] + sj[q];
        }
        const fit = Array.from({ length: n }, () => new Float64Array(n));
        for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
            const v = T[p][p] + T[q][q] - 2 * T[p][q];
            fit[p][q] = fit[q][p] = v;
        }
        return fit;
    };
    const gradient = (r) => {
        const row = r.map((x) => x.reduce((s, v) => s + v, 0));
        const RS = new Float64Array(n + 1);
        for (let p = 0; p < n; p++) RS[p + 1] = RS[p] + row[p];
        const P2 = Array.from({ length: n + 1 }, () => new Float64Array(n + 1));
        for (let a = 0; a < n; a++) for (let c = 0; c < n; c++) P2[a + 1][c + 1] = P2[a][c + 1] + P2[a + 1][c] - P2[a][c] + r[a][c];
        const G = new Float64Array(n * n);
        for (let i = 1; i < n; i++) for (let j = i; j < n; j++) {
            const inside = P2[j + 1][j + 1] - P2[i][j + 1] - P2[j + 1][i] + P2[i][i];
            G[i * n + j] = RS[j + 1] - RS[i] - inside;
        }
        return G;
    };
    const residual = (Wt) => { const f = forward(Wt); return f.map((rw, p) => rw.map((v, q) => (p === q ? 0 : v - d[p][q]))); };
    // the step: 1 / (an estimate of the largest eigenvalue of A'A), by power iteration
    let v = new Float64Array(n * n);
    for (let i = 1; i < n; i++) for (let j = i; j < n; j++) v[i * n + j] = 1;
    let L = 1;
    for (let it = 0; it < 25; it++) {
        const f = forward(v);
        const g = gradient(f);
        let norm = 0;
        for (const x of g) norm += x * x;
        norm = Math.sqrt(norm) || 1;
        L = norm / (Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1);
        v = g.map((x) => x / norm);
    }
    // FISTA: projected, accelerated gradient for the non-negative least squares
    let w = new Float64Array(n * n), y = new Float64Array(n * n), tk = 1;
    for (let it = 0; it < 600; it++) {
        const g = gradient(residual(y));
        const nw = new Float64Array(n * n);
        for (let i = 1; i < n; i++) for (let j = i; j < n; j++) nw[i * n + j] = Math.max(0, y[i * n + j] - g[i * n + j] / L);
        const tn = (1 + Math.sqrt(1 + 4 * tk * tk)) / 2;
        for (let k = 0; k < n * n; k++) y[k] = nw[k] + ((tk - 1) / tn) * (nw[k] - w[k]);
        w = nw; tk = tn;
    }
    const splits = [];
    const weights = [];
    for (let i = 1; i < n; i++) for (let j = i; j < n; j++) { splits.push([i, j]); weights.push(w[i * n + j]); }
    w = weights;
    const total = w.reduce((s, x) => s + x, 0) || 1;
    const keep = splits.map((s, k) => ({ s, w: w[k] })).filter((x) => x.w > total * 0.002);
    // the outline: walk the circle; leaving taxon k drop the splits ending at k, then add those starting at k+1
    const dir = (s) => { const a = (Math.PI * (s[0] + s[1])) / n; return [Math.cos(a), Math.sin(a)]; };
    const containing = (p) => keep.filter((x) => p >= x.s[0] && p <= x.s[1]);
    const pos = (p) => containing(p).reduce((acc, x) => { const d = dir(x.s); return [acc[0] + x.w * d[0], acc[1] + x.w * d[1]]; }, [0, 0]);
    const pts = [];
    const leafAt = [];
    let cur = [0, 0];
    for (let p = 0; p < n; p++) {
        leafAt[p] = pts.length;
        pts.push([...pos(p)]);
        cur = pts.at(-1);
        const q = (p + 1) % n;
        for (const x of keep.filter((y) => p >= y.s[0] && p <= y.s[1] && !(q >= y.s[0] && q <= y.s[1])).sort((a, b) => b.s[0] - a.s[0])) {
            const d = dir(x.s);
            cur = [cur[0] - x.w * d[0], cur[1] - x.w * d[1]];
            pts.push(cur);
        }
        for (const x of keep.filter((y) => q >= y.s[0] && q <= y.s[1] && !(p >= y.s[0] && p <= y.s[1])).sort((a, b) => b.s[1] - a.s[1])) {
            const d = dir(x.s);
            cur = [cur[0] + x.w * d[0], cur[1] + x.w * d[1]];
            pts.push(cur);
        }
    }
    const W = 900, H = 680, pad = 120;
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const k = Math.min((W - 2 * pad) / (x1 - x0 || 1), (H - 2 * pad) / (y1 - y0 || 1));
    const X = (x) => W / 2 + (x - (x0 + x1) / 2) * k, Y = (y) => H / 2 + (y - (y0 + y1) / 2) * k;
    const path = `M${pts.map((p) => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('L')}Z`;
    // how tree-like: the share of weight in splits compatible with a single tree is hard to state simply;
    // report the weight in the trivial (leaf) splits and in the rest
    const leafW = keep.filter((x) => x.s[0] === x.s[1]).reduce((s, x) => s + x.w, 0);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    /**
     * Labels that do not pile up: each side of the network (left, right) is
     * laid out as a column, names kept at least a line apart and nudged as
     * little as possible, each joined to its dot by a thin leader line.
     */
    const marks = order.map((li, p) => {
        const [px, py] = pts[leafAt[p]];
        const a = Math.atan2(py - cy, px - cx);
        return { id: ids[li], x: X(px), y: Y(py), left: Math.cos(a) < 0, tx: X(px) + Math.cos(a) * 10, ty: Y(py) + Math.sin(a) * 10 };
    });
    const LINE = 11;
    for (const side of [true, false]) {
        const col = marks.filter((m) => m.left === side).sort((a, b) => a.ty - b.ty);
        for (let pass = 0; pass < 40; pass++) {
            let moved = false;
            for (let i = 1; i < col.length; i++) {
                const gap = col[i].ty - col[i - 1].ty;
                if (gap < LINE) { const d = (LINE - gap) / 2; col[i - 1].ty -= d; col[i].ty += d; moved = true; }
            }
            if (!moved) break;
        }
    }
    const labels = marks.map((m) => `<g data-focus-lang="${esc(m.id)}">${Math.hypot(m.tx - m.x, m.ty - m.y) > 14 ? `<line x1="${m.x.toFixed(1)}" y1="${m.y.toFixed(1)}" x2="${m.tx.toFixed(1)}" y2="${m.ty.toFixed(1)}" class="ds-leader"/>` : ''}<circle cx="${m.x.toFixed(1)}" cy="${m.y.toFixed(1)}" r="3.5" style="fill:${colour(m.id)}"/><text x="${m.tx.toFixed(1)}" y="${(m.ty + 4).toFixed(1)}" text-anchor="${m.left ? 'end' : 'start'}" class="ds-label">${esc(name(m.id))}</text></g>`).join('');
    return `<svg class="ds-svg" viewBox="0 0 ${W} ${H}"><path d="${path}" class="ds-net"/>${labels}</svg>
      <div class="hint">${keep.length} splits from ${n} languages. Long lone branches: a language's own changes. Thin boxes instead of single branches: signal that does not fit one tree, usually contact or a dialect continuum. ${Math.round((100 * leafW) / total)}% of the distance lies on the languages' own branches.</div>`;
}
